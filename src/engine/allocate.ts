// Credit classification and cap allocation.
//
// Every entered course is first CLASSIFIED: which pool it can fill (regular /
// project / seminar / total-only / none), which credit caps it consumes, and how
// certain its credit is (definite / in progress / provisional — see status.ts).
// Then ALLOCATION fills the caps at credit granularity, order-independently:
// uncapped and single-cap credits greedily (provably optimal by an exchange
// argument), the rare multi-cap courses by exact search — never the prototype's
// entry-order greedy, where re-sorting the course list changed the verdict.
import { formatCredits } from './credits.ts';
import { resolveRuleRow } from '../data/assemble.ts';
import { findExternalRule, isCseCourse, isNotreDameInstitution, ndEquivalentCredits, needsApproval, transferableFor, universityCreditSystem } from '../data/external.ts';
import type { ExternalRule, RuleCourse, Rules, Transferable } from '../data/types.ts';
import { coreTitleSuggestion } from './core-title.ts';
import { GRADES, isInProgress, isPassed, meetsGradeFloor } from './grades.ts';
import type { Tier, TierSums } from './status.ts';
import { ZERO_SUMS } from './status.ts';
import { compareTerm, normalizeEntryTerm, shiftTermYears, termIndex, termLabel } from './term.ts';
import type { CourseEntry, Grade, Program, Student } from './types.ts';

export type CapId = 'fourk' | 'noncse' | 'transfer' | 'sharedbs';

export interface CapSpec {
  id: CapId;
  /** undefined = the Parameters tab is missing the cap → treated as 0 here and
   * surfaced as "cannot evaluate" on the cap's requirement row. */
  limit: number | undefined;
  /** e.g. "6-credit 40000-level cap" */
  label: string;
  section: string;
}

export type Pool = 'regular' | 'project' | 'seminar' | 'total_only' | 'none';

export interface ClassifiedCourse {
  entry: CourseEntry;
  rule?: RuleCourse;
  pool: Pool;
  ineligibleReason?: string; // when pool === 'none'
  caps: CapId[];
  tier: Tier;
  /** Needs advisor/DGS sign-off (dgs_approval row, unknown course, non-CSE, transfer). */
  approvalPending?: string;
  unknown?: boolean;
  superseded?: boolean;
  /** Transfer-only: the DGS's ExternalCourses ruling for this course, when one
   * exists (attached even when the course earns no credit, so §4.4.1 core
   * knowledge can still see a DGS-confirmed course). */
  external?: ExternalRule;
  /** Transfer-only: the §5.2 ruling that applies to THIS student — the sheet
   * decides transferability separately for a Ph.D. and an MSCSE student
   * (2026-09-09). Resolved here, once, so nothing downstream has to know the
   * student's program or which column to read. */
  transferable?: Transferable;
  /** Transfer-only: the DGS's ND-equivalent credit value (ExternalCourses
   * nd_credits, or converted from the university's quarter system — §5.2
   * "pro-rata"); counting uses this instead of the credits
   * printed on the transcript. */
  effectiveCredits?: number;
  /** True when effectiveCredits came from converting the university's quarter
   * hours rather than from a fixed nd_credits (2026-09-08) — the line says
   * which, so a student can tell a conversion from the DGS's own figure. */
  creditsConverted?: true;
}

/** The colour of a course's line (DGS request 2026-09-06 — "pending review
 * amber, counts after review green, does not count red"): `counts` = credit
 * (or a §4.4.1 core area) is earned now; `pending` = in progress, or counted
 * only provisionally until an advisor/DGS approval; `excluded` = earns
 * nothing (over a cap, failed, ineligible, not relevant). */
export type CourseMark = 'counts' | 'pending' | 'excluded';

export interface CourseAllocation {
  course: ClassifiedCourse;
  countedRegular: number;
  countedOther: number; // project / seminar / total_only credits
  excluded: number;
  excludedReason?: string;
  explanation: string; // the per-course line shown to the student
  mark: CourseMark;
}

export interface AllocationResult {
  perCourse: CourseAllocation[];
  /** Credits counted toward the regular-course requirement, per certainty tier. */
  regular: TierSums;
  project: TierSums;
  seminar: TierSums;
  totalOnly: TierSums;
  /** Passed/IP/provisional credits toward the 30/60 "courses and research" total. */
  total: TierSums;
  /** Regular-pool credits taken at Notre Dame (§4.2's nine-at-ND check). */
  ndRegular: TierSums;
  /** Research-ish credits taken at Notre Dame — courses the rules sheet types
   * 'research' or 'project' (thesis/project direction, research &
   * dissertation). The §4.5 along-the-way MSCSE needs 6 of these (DGS
   * decision 2026-09-04); independent study does not count. */
  ndResearch: TierSums;
  /** Counted transfer credits (all provisional unless attested). */
  transfer: TierSums;
  capUsage: Map<CapId, { used: number; limit: number | undefined; excluded: string[] }>;
  warnings: string[];
}

const deptOf = (id: string) => id.split(' ')[0] ?? '';
const levelOf = (course: CourseEntry, rule?: RuleCourse): number => {
  if (rule?.level !== undefined) return rule.level;
  const m = /(\d)\d{4}\b/.exec(course.courseId);
  return m ? Number(m[1]) : NaN;
};

/** How an EARLIER NOTRE DAME course may count once it transfers in under §5.2
 * (2026-09-09), read from its own Courses-tab row — the same reading classify()
 * makes for a course taken in the program. Until this existed every transfer
 * landed in the regular pool, so a prior Notre Dame research or thesis course
 * counted toward §4.2's twenty-four REGULAR credits, which §4.2 excludes in as
 * many words ("Research seminar, research credits, and other similar courses
 * do not count as regular courses"), and a prior 40000-level course never
 * touched §4.2's six-credit 4xxxx cap.
 *
 * Only Notre Dame's own courses are read this way: the Courses tab describes
 * Notre Dame's catalogue, and a course from another university that happens to
 * share a Notre Dame number is not the same course. */
function priorNdShape(
  courseId: string,
  rule: RuleCourse,
  program: Program,
): { pool: Pool; caps: CapId[] } | { ineligibleReason: string } {
  const counts = program === 'mscse' ? rule.countsTowardMscse : rule.countsTowardPhd;
  const programName = program === 'mscse' ? 'MSCSE' : 'Ph.D.';
  if (counts === 'no') {
    return { ineligibleReason: `not counted — the rules sheet says this course does not count toward the ${programName}` };
  }
  const isCse = deptOf(courseId) === 'CSE';
  switch (rule.courseType) {
    case 'regular':
      if (rule.level === 4 || rule.level === 5) {
        return isCse
          ? { pool: 'regular', caps: ['fourk'] }
          : { ineligibleReason: `not counted — non-CSE ${rule.level}0000-level courses do not count (DGS decision 2026-08-31)` };
      }
      return { pool: 'regular', caps: isCse ? [] : ['noncse'] };
    case 'project':
      return { pool: 'project', caps: [] };
    case 'seminar':
      return { pool: 'seminar', caps: [] };
    case 'research':
    case 'independent':
      return { pool: 'total_only', caps: [] };
  }
}

function tierFor(grade: Grade, provisional: boolean): Tier {
  if (provisional) return 'provisional'; // worst uncertainty dominates
  if (isInProgress(grade)) return 'in_progress';
  return 'definite';
}

/** Classify every course. Returns classified courses in a stable order
 * (term, then course id, then input order) — the allocator's fill order. */
export function classify(student: Student, rules: Rules): {
  classified: ClassifiedCourse[];
  warnings: string[];
} {
  const warnings: string[] = [];
  const { program, attestations } = student;
  // Which subject codes mean "CSE" on another university's transcript
  // (2026-09-09). undefined = the sheet has no list, and no transferred course
  // is placed inside or outside CSE.
  const cseSubjectCodes = rules.parameters.codeList('cse_subject_codes');
  const entry = normalizeEntryTerm(student.entryTerm).term;
  const params = rules.parameters;
  const transferFloor = params.gradeLetter('transfer_min_grade');
  const windowYears = params.number('phd_transfer_window_years');

  const sorted = [...student.courses].sort(
    (a, b) => compareTerm(a.term, b.term) || a.courseId.localeCompare(b.courseId),
  );

  // §4.4.2 retakes / duplicate entries: credits count once. Applies to ND
  // courses that are (or look like) regular courses; project/research/seminar
  // credits legitimately accumulate, and foreign transfer ids may collide with
  // ND numbering without being retakes.
  // Which attempt counts: the last PASSING final grade; failing that, a live
  // in-progress retake (so a student re-taking a failed course gets in-progress
  // credit, and a later failed attempt never erases an earlier pass).
  const supersededSet = new Set<CourseEntry>();
  const byId = new Map<string, CourseEntry[]>();
  for (const c of sorted) {
    if (c.origin !== 'nd') continue;
    const rule = resolveRuleRow(rules, c.courseId, c.term);
    const type = rule?.courseType ?? 'regular';
    if (type !== 'regular') continue;
    const list = byId.get(c.courseId) ?? [];
    list.push(c);
    byId.set(c.courseId, list);
  }
  for (const [id, attempts] of byId) {
    if (attempts.length < 2) continue;
    const passing = attempts.filter((a) => isPassed(a.grade));
    const inProgress = attempts.filter((a) => isInProgress(a.grade));
    const counted =
      passing.length > 0
        ? passing[passing.length - 1]!
        : inProgress.length > 0
          ? inProgress[inProgress.length - 1]!
          : attempts[attempts.length - 1]!; // all failed → last one (earns nothing anyway)
    for (const a of attempts) if (a !== counted) supersededSet.add(a);
    warnings.push(`${id} is entered ${attempts.length} times — its credits count once (§4.4.2 retake rule).`);
  }

  const classified: ClassifiedCourse[] = sorted.map((entryCourse) => {
    const c = entryCourse;
    const rule = resolveRuleRow(rules, c.courseId, c.term);
    const grade = c.grade;
    const base: ClassifiedCourse = { entry: c, rule, pool: 'none', caps: [], tier: 'provisional' };

    // Guard rails for hand-edited/imported data: an unknown grade or a
    // missing/negative credit value must never be silently counted.
    if (!GRADES.includes(grade)) {
      warnings.push(`${c.courseId}: grade '${String(grade)}' is not recognized — the course is not counted. Fix the entry.`);
      return { ...base, ineligibleReason: `not counted — unrecognized grade '${String(grade)}'` };
    }
    if (!Number.isFinite(c.credits) || c.credits < 0) {
      warnings.push(`${c.courseId}: credits '${String(c.credits)}' is not a number — the course is not counted. Fix the entry.`);
      return { ...base, ineligibleReason: 'not counted — the credit value is missing or not a number' };
    }

    if (supersededSet.has(c)) {
      const countedAttempt = byId.get(c.courseId)?.find((a) => !supersededSet.has(a));
      const countedIsLater = countedAttempt && compareTerm(countedAttempt.term, c.term) > 0;
      return {
        ...base,
        superseded: true,
        ineligibleReason: countedIsLater
          ? `superseded by the ${termLabel(countedAttempt.term)} retake — credits count once, and the retake grade replaces this one (§4.4.2)`
          : `credits count once (§4.4.2) — the ${countedAttempt ? termLabel(countedAttempt.term) : 'other'} attempt of this course is the one counted`,
      };
    }

    // DGS decision 2026-08-31: a failed course (F/U) earns no credit at all.
    if (grade === 'F' || grade === 'U') {
      return { ...base, ineligibleReason: 'failed — earns no credit (DGS decision 2026-08-31)' };
    }

    if (c.origin === 'transfer') {
      // The DGS's ExternalCourses ruling, when one exists. Attached to every
      // return path so §4.4.1 core knowledge sees it even when no credit counts.
      const external = findExternalRule(rules.external, c.institution ?? '', c.courseId);
      // Set once per university in the sheet; applies to every course from it.
      const creditSystem = universityCreditSystem(rules.external, c.institution);
      const extBase: ClassifiedCourse = { ...base, external };
      // Prior NOTRE DAME coursework (2026-09-05 — an earlier Notre Dame degree
      // on a combined transcript): the Courses tab already says which §4.4.1
      // core area a Notre Dame course covers, whenever it was taken, so no
      // ExternalCourses ruling is needed for that part. Transfer credit still
      // follows §5.2 like any other prior graduate course.
      const ndCoreArea = isNotreDameInstitution(c.institution) ? rule?.coreArea : undefined;
      const areaName = (code: string) => rules.coreAreas.find((a) => a.code === code)?.name ?? code;
      // §5.2 criterion 2: transfers must be "graduate courses … [taken with]
      // graduate student status" — Bachelor's coursework can never transfer.
      // §4.4.1 core knowledge has no such restriction, so the course stays
      // visible to the core check (coreRows reads classified regardless).
      // The per-course line leads with the ONE thing an undergraduate course
      // can do — demonstrate a core-knowledge area (DGS request 2026-09-04;
      // shortened 2026-09-06 so it did not repeat "no transfer credit").
      // DGS 2026-09-07 restores that half, with its REASON: the bar is the
      // student's status when they took the course, not the course's level, so
      // a graduate-numbered course taken before the bachelor's says so on its
      // own line rather than leaving it to the group heading.
      const suggested = external === undefined && ndCoreArea === undefined ? coreTitleSuggestion(c.title) : undefined;
      // A DGS-confirmed core area is said on the line itself (2026-09-06 —
      // the separate "What the DGS's rules say" block is gone).
      const coreNote = external?.satisfiesCoreArea
        ? `; satisfies the ${areaName(external.satisfiesCoreArea)} core-knowledge requirement (§4.4.1) — confirmed by the DGS`
        : ndCoreArea
          ? `; satisfies the ${areaName(ndCoreArea)} core-knowledge requirement (§4.4.1) per the course rules`
          : suggested
            ? `; may still satisfy the ${suggested} core-knowledge requirement (§4.4.1) after DGS review`
            : '';
      // NOTRE DAME COURSEWORK TAKEN AS AN UNDERGRADUATE — the Graduate School's
      // answer, through the DGS (2026-09-10, evening), which settles the
      // question §5.2 criterion 2 raised and goes well past it:
      //
      //   "Any 60000-level and above coursework taken as an undergraduate, not
      //   being used to fulfill undergraduate degree requirements can be used
      //   to satisfy both the master's and the PhD. Notably, such credits are
      //   counted towards the PhD, even those above and beyond the usual 24
      //   allowed for transfer. The only hard constraint is that the same
      //   course's credits cannot count towards three degrees (BS, MSCSE, PhD)
      //   at the same time. … up to two 40000-level courses taken by ND
      //   undergraduates can count towards both BS and MSCSE. … up to 6 credits
      //   from 40xxx courses can count towards PhD."
      //
      // So this coursework is NOT §5.2 transfer credit at all — it never
      // touches the transfer cap. A 6xxxx course counts in full whether or not
      // the B.S. used it (DGS 2026-09-10: uncapped); a course below the 60000
      // level counts inside §4.2's own six-credit allowance, the same six a
      // course taken in the program would use. The one bar is a course already
      // spent on two degrees.
      const awardedTerm = student.bachelorsAwarded;
      const asUndergraduate =
        c.degreeLevel === 'bachelors' || (awardedTerm !== undefined && compareTerm(c.term, awardedTerm) <= 0);
      // Only coursework that could actually count comes down this path. A
      // 20000-level course, or a non-CSE course below the 60000 level, counts
      // nothing at any answer, so it keeps the line it has always had — which
      // leads with the one thing it CAN do, demonstrate a §4.4.1 core area,
      // and tells the student to send the review request.
      const undergradLevelEarly = levelOf(c, rule);
      const eligibleUndergradLevel =
        undergradLevelEarly >= 6 ||
        (deptOf(c.courseId) === 'CSE' && (undergradLevelEarly === 4 || (undergradLevelEarly === 5 && rule !== undefined)));
      if (asUndergraduate && eligibleUndergradLevel && isNotreDameInstitution(c.institution)) {
        const spent = c.countedToward;
        // A Ph.D. student with no Notre Dame master's cannot have a course
        // that already counted twice, so they are never asked.
        const couldHaveCountedTwice = student.program !== 'phd' || student.ndMasters !== undefined;
        const shape = rule ? priorNdShape(c.courseId, rule, student.program) : undefined;
        if (shape && 'ineligibleReason' in shape) {
          return { ...extBase, ineligibleReason: `${shape.ineligibleReason}${coreNote}` };
        }
        // The level rules are the degree's, not the transcript's: this
        // coursework counts the way the same course would if it were taken in
        // the program. Below the 60000 level that means §4.2's six-credit
        // allowance and nothing under the 40000 level at all — an
        // undergraduate transcript is full of 1xxxx and 2xxxx courses, and
        // without this they filled that allowance.
        const undergradLevel = undergradLevelEarly;
        // Only now, when the course could actually count, is the student asked
        // anything: no course may count toward three degrees, so the answer
        // decides it. A 20000-level course counts nothing at any answer, and
        // asking about it would be noise on every undergraduate transcript.
        // The three-degree bar is the PH.D.'s: a course already spent on the
        // bachelor's and the master's cannot be spent a third time. For an
        // MSCSE student "both" is not a bar at all — it describes the
        // double-counting §3.5 allows, and the cap below is what limits it.
        if (spent === 'both' && student.program === 'phd') {
          return {
            ...extBase,
            ineligibleReason: `not counted — you have told us this course already counted toward your bachelor’s degree AND your master’s, and no course may count toward three degrees${coreNote}`,
          };
        }
        if (spent === undefined && couldHaveCountedTwice) {
          return {
            ...extBase,
            ineligibleReason: `not counted yet — say which degrees this course has already counted toward, next to the course. No course may count toward three degrees, so the answer decides whether it counts here${coreNote}`,
          };
        }
        // 60000 and above: in full, and outside every cap the app has — the
        // Graduate School put these beyond §5.2's twenty-four in as many words.
        const belowSixty = undergradLevel < 6;
        const provisional = rule === undefined; // not in the rules sheet: counted, but the DGS is asked
        // §3.5 lets an MSCSE student count coursework their bachelor's degree
        // already used, up to six credits in all — "an ND 4+1 student can have
        // up to 6 credits (whether 40xxx or 60xxx courses) counted towards
        // both degrees" (DGS 2026-09-10). The Ph.D. has no such cap: what it
        // has is the three-degree bar above.
        const sharedWithBachelors: CapId[] =
          student.program === 'mscse' && (spent === 'bs' || spent === 'both') ? ['sharedbs'] : [];
        return {
          ...extBase,
          pool: shape?.pool ?? 'regular',
          caps: [
            ...sharedWithBachelors,
            ...(belowSixty ? ['fourk' as CapId, ...(shape?.caps ?? []).filter((id) => id !== 'fourk')] : (shape?.caps ?? []).filter((id) => id !== 'fourk')),
          ],
          tier: tierFor(grade, provisional),
          ...(rule === undefined ? { unknown: true as const, approvalPending: 'not in the rules sheet — counted provisionally; needs DGS review' } : {}),
        };
      }
      if (c.degreeLevel === 'bachelors') {
        const confirmedArea = external?.satisfiesCoreArea ? areaName(external.satisfiesCoreArea) : undefined;
        const suggested = coreTitleSuggestion(c.title);
        const ugNote = '; taken as an undergraduate student — no transfer credit (§5.2)';
        return {
          ...extBase,
          ineligibleReason: confirmedArea
            ? `satisfies the ${confirmedArea} core-knowledge requirement (§4.4.1) — confirmed by the DGS${ugNote}`
            : ndCoreArea
              ? `satisfies the ${areaName(ndCoreArea)} core-knowledge requirement (§4.4.1) — a Notre Dame course listed in the course rules${ugNote}`
              : suggested
                ? `may satisfy the ${suggested} core-knowledge requirement (§4.4.1) — pending DGS review; send the review request${ugNote}`
                : `not relevant to the core knowledge requirement (§4.4.1)${ugNote}`,
        };
      }
      // Graduate courses (2026-09-04): §5.2 transfer credit is not the only
      // thing a prior course can earn — an unreviewed course whose title
      // matches the core keywords may satisfy §4.4.1 core knowledge after the
      // DGS's review, and its line says so. (A DGS-ruled course is decided.)
      const transferable = transferableFor(external, student.program);
      if (transferable === 'no') {
        return {
          ...extBase,
          // The university as the student's record spells it (DGS 2026-09-06, late evening: no upper-cased sheet spelling in student-facing text).
          ineligibleReason: `not counted — the DGS has ruled this ${c.institution ?? external?.university} course non-transferable (external-course rules)${coreNote}`,
        };
      }
      // §5.2 (verbatim): "A student may transfer credits earned at another
      // accredited university only if: 1) the student is in degree status at
      // Notre Dame; 2) the courses taken are graduate courses appropriate to
      // the Notre Dame graduate program and the student had graduate student
      // status when they took these courses; 3) the courses were completed
      // within a five-year period prior to admission to a graduate degree
      // program at Notre Dame or while enrolled in a graduate degree program
      // at Notre Dame; 4) grades of "B" (3.0 on 4.0 scale) or better were
      // achieved; and 5) the transfer is recommended by the DGS and approved
      // by the Graduate School."
      // Criterion 2 by the student's own record (DGS 2026-09-06: "Only the
      // courses taken with the graduate student status can count. The
      // graduate-level courses taken before earning the bachelor's degree do
      // not count."): a course dated in or before the term the bachelor's
      // degree was awarded was not taken with graduate student status,
      // whatever its number or the level it was registered at. An unknown
      // award term changes nothing (degreeLevel decides, as before). The
      // award term is absolute (DGS 2026-09-06, later that evening): a
      // transferable=yes ruling in the ExternalCourses tab does NOT restore
      // the credit of a course taken before the bachelor's degree — the
      // ruling is about the course, criterion 2 about the student.
      const awarded = student.bachelorsAwarded;
      const beforeBachelors = awarded !== undefined && compareTerm(c.term, awarded) <= 0;
      const whenTaken = awarded !== undefined && compareTerm(c.term, awarded) === 0 ? 'in the term' : 'before';
      if (beforeBachelors) {
        return {
          ...extBase,
          ineligibleReason: `not counted — taken ${whenTaken} your bachelor’s degree was awarded (${termLabel(awarded!)}), so not as a graduate student (§5.2)${coreNote}`,
        };
      }
      // §5.2: "grades of 'B' (3.0 on 4.0 scale) or better were achieved" and
      // "completed within a five-year period prior to admission … or while
      // enrolled". Every transfer needs DGS + Graduate School approval.
      if (transferFloor !== undefined && !meetsGradeFloor(grade, transferFloor as Grade) && !isInProgress(grade)) {
        return { ...extBase, ineligibleReason: `not counted — grade below ${transferFloor} (§5.2)${coreNote}` };
      }
      if (windowYears !== undefined && compareTerm(c.term, shiftTermYears(entry, -windowYears)) < 0) {
        return {
          ...extBase,
          ineligibleReason: `not counted — completed outside the ${windowYears}-year window before admission (five-year window, §5.2)${coreNote}`,
        };
      }
      const attested = attestations.transferApproved === true;
      // An earlier Notre Dame course keeps its own Courses-tab verdict on top
      // of §5.2's (2026-09-09): the §5.2 cap says how MUCH may transfer, the
      // sheet row says what the course IS — regular, project, research — and
      // §4.2's level rules still apply to it.
      const shape = isNotreDameInstitution(c.institution) && rule ? priorNdShape(c.courseId, rule, student.program) : undefined;
      if (shape && 'ineligibleReason' in shape) {
        return { ...extBase, transferable, ineligibleReason: `${shape.ineligibleReason}${coreNote}` };
      }
      // §4.2 caps credits "taken from a department other than CSE" at nine,
      // wherever they were taken — and a transcript from elsewhere spells the
      // department every way there is (DGS 2026-09-09: "CompSci, CompS, CS,
      // CE, ECE, CSYE etc. all can mean CSE in fact"). The sheet decides: the
      // `cse_subject_codes` list, or an `is_cse` cell for a course the code
      // cannot settle. A course the sheet says nothing about is left out of
      // the allowance entirely rather than guessed at, so nothing changes for
      // a student until the DGS has answered. Notre Dame's own earlier
      // courses are decided by their own subject, as they always were.
      const fromNd = isNotreDameInstitution(c.institution);
      const isCse = fromNd ? deptOf(c.courseId) === 'CSE' : isCseCourse(c.courseId, external, cseSubjectCodes);
      const nonCseCap: CapId[] = isCse === false && !(shape?.caps ?? []).includes('noncse') ? ['noncse'] : [];
      return {
        ...extBase,
        transferable,
        pool: shape?.pool ?? 'regular',
        caps: ['transfer', ...(shape?.caps ?? []), ...nonCseCap],
        tier: tierFor(grade, !attested),
        // §5.2 "pro-rata" for non-semester systems: the DGS's fixed value for
        // this course wins; otherwise a quarter university's credits are
        // converted from what the transcript prints (DGS 2026-09-08), which is
        // the only thing that works when a course's credits vary by term.
        effectiveCredits: ndEquivalentCredits(c.credits, external, creditSystem),
        ...(external?.ndCredits === undefined && creditSystem === 'quarter' ? { creditsConverted: true as const } : {}),
        approvalPending: attested
          ? undefined
          : transferable === 'yes'
            ? `pre-approved in the DGS’s external-course rules — to have it processed, send the Grad Admin the processing request (§5.2)${coreNote}`
            : // `dgs_approval` / `adgs_approval` (DGS 2026-09-08, split by
              // program 2026-09-09): the sheet has looked at the course and
              // ruled that this one needs an approval. Unlike a blank cell,
              // that IS a decision; what is open is this student's case.
              needsApproval(transferable)
              ? `transfer — needs DGS approval (§5.2)${coreNote}`
              : external
                ? `transfer — reviewed by the DGS, but transferability is not yet decided (§5.2)${coreNote}`
                : `transfer — not yet reviewed by the DGS; needs DGS + Graduate School approval (§5.2)${coreNote.replace('; may still satisfy', '; the same review can confirm').replace(' after DGS review', '')}`,
      };
    }

    const level = levelOf(c, rule);
    const isCse = deptOf(c.courseId) === 'CSE';

    if (!rule) {
      if (!isCse) {
        // Free-text non-CSE course (decision Q6). Level floors per decisions
        // Q5/Q19: 40000-level counts nothing; below 60000-level counts nothing.
        if (level === 4) {
          return {
            ...base,
            ineligibleReason: 'not counted — non-CSE 40000-level courses do not count (DGS decision 2026-08-31)',
          };
        }
        if (!(level >= 6)) {
          return {
            ...base,
            ineligibleReason: 'not counted — below the 60000 level (§3.2/§4.2; DGS decision 2026-08-31)',
          };
        }
        const attested = attestations.dgsApprovedNonCse === true;
        return {
          ...base,
          pool: 'regular',
          caps: ['noncse'],
          tier: tierFor(grade, !attested),
          // Not in the Courses tab, same as an unlisted CSE course below
          // (2026-09-09). §4.4.1 core knowledge reads this flag to offer the
          // DGS a course whose TITLE names a core area, and it was set only on
          // the CSE branch — so "EE 60566 Advanced Computer Architecture"
          // could never become a core-knowledge candidate while the same
          // course from another university, and an unlisted CSE course, both
          // could. §4.4.1 puts no department limit on the course.
          unknown: true,
          approvalPending: attested
            ? undefined
            : 'non-CSE course — needs advisor + DGS approval (§3.2/§4.2)',
        };
      }
      // Unknown CSE course: never silently counted or rejected (CLAUDE.md).
      // A 50000-level course the sheet does not list stays out (decision Q19):
      // the 2026-09-09 rule that lets a 50000-level course count inside §4.2's
      // six-credit cap is about a course the DGS has PERMITTED in the sheet,
      // and an unlisted one carries no such permission.
      if (level === 5) {
        return { ...base, ineligibleReason: 'not counted — a 50000-level course counts only if the DGS has listed it in the course rules (§4.2)' };
      }
      const caps: CapId[] = level === 4 ? ['fourk'] : [];
      return {
        ...base,
        pool: 'regular',
        caps,
        tier: 'provisional',
        unknown: true,
        approvalPending: 'not in the rules sheet — counted provisionally; needs DGS review',
      };
    }

    const counts = program === 'mscse' ? rule.countsTowardMscse : rule.countsTowardPhd;
    const programName = program === 'mscse' ? 'MSCSE' : 'Ph.D.';
    if (counts === 'no') {
      return { ...base, ineligibleReason: `the rules sheet says it does not count toward the ${programName}` };
    }
    // A sheet-listed dgs_approval course is cleared by the matching attestation:
    // BELOW the 60000 level → the "courses below the 60000 level" checkbox;
    // non-CSE → the non-CSE checkbox. A CSE course at 60000 or above flagged
    // dgs_approval has no checkbox — it stays provisional and the approvals
    // row explains.
    //
    // The checkbox covered level 4 alone until 2026-09-09, when the DGS put
    // 40000- and 50000-level courses under one six-credit cap. The cap moved
    // and this did not, so the one bridge course the sheet permits for a Ph.D.
    // (CSE 50502, `dgs_approval`) could never be cleared: it stayed amber and
    // stayed in the review request whatever the student ticked.
    const approvalAttested =
      ((level === 4 || level === 5) && attestations.dgsApproved4xxxx === true) ||
      (!isCse && attestations.dgsApprovedNonCse === true);
    const approvalPending =
      counts === undefined
        ? 'the rules sheet does not say whether it counts — needs DGS review'
        : counts === 'dgs_approval'
          ? approvalAttested
            ? undefined
            : 'needs advisor + DGS approval per the rules sheet'
          : undefined;
    const provisional = approvalPending !== undefined;

    switch (rule.courseType) {
      case 'regular': {
        // Below the 60000 level (DGS 2026-09-09, superseding decision Q19):
        // a 40000- or 50000-level course counts only while the rules sheet
        // says it may, and even then only within §4.2's six-credit cap —
        // "the pre-approval only means they are pre-approved to count toward
        // the Ph.D.; they are still subject to all other constraints". Both
        // levels draw on the SAME six credits.
        if (level === 4 || level === 5) {
          if (!isCse) {
            return {
              ...base,
              ineligibleReason: `not counted — non-CSE ${level}0000-level courses do not count (DGS decision 2026-08-31)`,
            };
          }
          return { ...base, pool: 'regular', caps: ['fourk'], tier: tierFor(grade, provisional), approvalPending };
        }
        const caps: CapId[] = isCse ? [] : ['noncse'];
        return { ...base, pool: 'regular', caps, tier: tierFor(grade, provisional), approvalPending };
      }
      case 'project':
        return { ...base, pool: 'project', caps: [], tier: tierFor(grade, provisional), approvalPending };
      case 'seminar':
        return { ...base, pool: 'seminar', caps: [], tier: tierFor(grade, provisional), approvalPending };
      case 'research':
      case 'independent':
        return { ...base, pool: 'total_only', caps: [], tier: tierFor(grade, provisional), approvalPending };
    }
  });

  return { classified, warnings };
}

const TIER_ORDER: Tier[] = ['definite', 'in_progress', 'provisional'];

/** Fill the caps. Order-independent by construction: courses are processed in
 * (tier, term, course id) order regardless of entry order, and multi-cap
 * courses get an exact best-permutation search (they are vanishingly rare —
 * after the DGS's Q5 answer every cap signature is a singleton). */
export function allocate(classified: ClassifiedCourse[], caps: CapSpec[]): AllocationResult {
  const capRoom = new Map<CapId, number>();
  const capUsage: AllocationResult['capUsage'] = new Map();
  for (const cap of caps) {
    capRoom.set(cap.id, cap.limit ?? 0);
    capUsage.set(cap.id, { used: 0, limit: cap.limit, excluded: [] });
  }
  const capLabel = (id: CapId) => caps.find((c) => c.id === id)?.label ?? id;

  const sums = {
    regular: { ...ZERO_SUMS },
    project: { ...ZERO_SUMS },
    seminar: { ...ZERO_SUMS },
    totalOnly: { ...ZERO_SUMS },
    total: { ...ZERO_SUMS },
    ndRegular: { ...ZERO_SUMS },
    ndResearch: { ...ZERO_SUMS },
    transfer: { ...ZERO_SUMS },
  };

  const allocations = new Map<ClassifiedCourse, CourseAllocation>();

  /** A cap the Parameters tab does not give a limit for. Its courses are not
   * counted — nothing may be granted on a guess — but they are not "over the
   * cap" either: the app cannot tell, and says so (CLAUDE.md: "A missing
   * parameter renders 'cannot evaluate', never a default"). Before this the
   * room was `limit ?? 0`, so a missing cap silently read as zero and painted
   * every affected course red (2026-09-09). */
  const missingLimitCap = (cc: ClassifiedCourse): CapId | undefined =>
    cc.caps.find((id) => caps.find((c) => c.id === id)?.limit === undefined);

  const take = (cc: ClassifiedCourse, amount: number) => {
    const credits = cc.effectiveCredits ?? cc.entry.credits;
    const unknownCap = missingLimitCap(cc);
    const counted = unknownCap ? 0 : Math.min(credits, amount);
    const excluded = credits - counted;
    for (const capId of cc.caps) {
      capRoom.set(capId, (capRoom.get(capId) ?? 0) - counted);
      const usage = capUsage.get(capId)!;
      usage.used += counted;
      if (excluded > 0) usage.excluded.push(cc.entry.courseId);
    }
    const isRegular = cc.pool === 'regular';
    const target =
      cc.pool === 'regular' ? sums.regular : cc.pool === 'project' ? sums.project : cc.pool === 'seminar' ? sums.seminar : sums.totalOnly;
    target[cc.tier] += counted;
    sums.total[cc.tier] += counted;
    if (isRegular && cc.entry.origin === 'nd') sums.ndRegular[cc.tier] += counted;
    if (cc.entry.origin === 'nd' && (cc.rule?.courseType === 'research' || cc.rule?.courseType === 'project')) {
      sums.ndResearch[cc.tier] += counted; // §4.5 along-the-way (DGS 2026-09-04)
    }
    // §5.2's running total counts only what §5.2's cap governs. Notre Dame
    // coursework taken as an undergraduate is filed as 'transfer' (it is not
    // this program's coursework) but is NOT transfer credit: the Graduate
    // School put it "above and beyond the usual 24" (2026-09-10). Counting it
    // here made the §5.2 row read "6 of 6 transfer credits counted" for a
    // student with no transfer credit at all.
    if (cc.entry.origin === 'transfer' && cc.caps.includes('transfer')) sums.transfer[cc.tier] += counted;

    const excludedReason = unknownCap
      ? `the rules sheet does not say what the ${capLabel(unknownCap)} is, so this course cannot be counted yet — ask the DGS to fill it in (${caps.find((c) => c.id === unknownCap)?.section ?? ''})`
      : excluded > 0 && cc.caps.length > 0
        ? `over the ${cc.caps.map(capLabel).join(' and ')} (${caps.find((c) => c.id === cc.caps[0])?.section ?? ''})`
        : undefined;
    // An UNREVIEWED transfer course is a candidate, whatever the cap did with
    // it here (DGS 2026-09-06): the DGS decides which courses transfer, so
    // the allocator's choice of which candidates fill the cap is not a
    // verdict — its line says "candidate", never "over the cap".
    const transferCandidate =
      cc.caps.includes('transfer') && cc.tier === 'provisional' && cc.entry.origin === 'transfer' && cc.transferable !== 'yes'
        ? { capLimit: caps.find((c) => c.id === 'transfer')?.limit }
        : undefined;
    allocations.set(cc, {
      course: cc,
      countedRegular: isRegular ? counted : 0,
      countedOther: isRegular ? 0 : counted,
      excluded,
      excludedReason,
      ...buildExplanation(cc, counted, excluded, excludedReason, transferCandidate, unknownCap !== undefined),
    });
  };

  for (const tier of TIER_ORDER) {
    const inTier = classified.filter((c) => c.tier === tier && c.pool !== 'none');
    const singles = inTier.filter((c) => c.caps.length <= 1);
    const multis = inTier.filter((c) => c.caps.length > 1);

    for (const cc of singles) {
      const room = cc.caps.length === 0 ? Infinity : Math.max(0, capRoom.get(cc.caps[0]!) ?? 0);
      take(cc, room);
    }

    if (multis.length > 0) {
      // Exact: try every processing order, keep the one counting the most
      // credits (first best in permutation order → deterministic).
      const best = bestMultiOrder(multis, new Map(capRoom));
      for (const cc of best) {
        const room = Math.min(...cc.caps.map((id) => Math.max(0, capRoom.get(id) ?? 0)));
        take(cc, room);
      }
    }
  }

  // Ineligible courses still get a line.
  for (const cc of classified) {
    if (cc.pool !== 'none') continue;
    allocations.set(cc, {
      course: cc,
      countedRegular: 0,
      countedOther: 0,
      excluded: cc.entry.credits,
      excludedReason: cc.ineligibleReason,
      ...buildExplanation(cc, 0, cc.entry.credits, cc.ineligibleReason),
    });
  }

  const perCourse = classified.map((cc) => allocations.get(cc)!);
  return { perCourse, ...sums, capUsage, warnings: [] };
}

function bestMultiOrder(
  multis: ClassifiedCourse[],
  roomSnapshot: Map<CapId, number>,
): ClassifiedCourse[] {
  const permutations = (arr: ClassifiedCourse[]): ClassifiedCourse[][] => {
    if (arr.length <= 1) return [arr];
    const out: ClassifiedCourse[][] = [];
    arr.forEach((x, i) => {
      for (const rest of permutations([...arr.slice(0, i), ...arr.slice(i + 1)])) out.push([x, ...rest]);
    });
    return out;
  };
  let best: { order: ClassifiedCourse[]; counted: number } | undefined;
  for (const order of permutations(multis)) {
    const room = new Map(roomSnapshot);
    let counted = 0;
    for (const cc of order) {
      const avail = Math.min(...cc.caps.map((id) => Math.max(0, room.get(id) ?? 0)));
      const c = Math.min(cc.effectiveCredits ?? cc.entry.credits, avail);
      counted += c;
      for (const id of cc.caps) room.set(id, (room.get(id) ?? 0) - c);
    }
    if (!best || counted > best.counted) best = { order, counted };
  }
  return best?.order ?? multis;
}

/** The per-course line and its colour (DGS request 2026-09-06). A credit that
 * is only counted PROVISIONALLY — until an advisor/DGS approval — is not
 * presented as counting: its line leads with "pending DGS review — would
 * count …", amber; an in-progress credit leads with "in progress — will
 * count … when passed", amber; a definite credit "counts toward …", green;
 * a credit that earns nothing "not counted — …", red. The mark is what the
 * page paints; the words carry the same fact for print and copies. */
function buildExplanation(
  cc: ClassifiedCourse,
  counted: number,
  excluded: number,
  excludedReason?: string,
  transferCandidate?: { capLimit: number | undefined },
  /** A cap this course draws on whose limit the Parameters tab is missing:
   * amber and honest, never the red "over the cap" (2026-09-09). */
  capLimitMissing?: boolean,
): { explanation: string; mark: CourseMark } {
  const parts: string[] = [];
  if (capLimitMissing) return { explanation: excludedReason ?? 'cannot be counted yet — a cap is missing from the rules sheet', mark: 'pending' };
  const poolName =
    cc.pool === 'regular'
      ? 'regular courses'
      : cc.pool === 'project'
        ? 'the project/thesis requirement'
        : cc.pool === 'seminar'
          ? 'the research seminar requirement'
          : 'the total-credit requirement only';
  const total = cc.effectiveCredits ?? cc.entry.credits;
  if (transferCandidate) {
    // Every unreviewed graduate course from a prior program is a CANDIDATE
    // for transfer credit until the DGS rules (DGS 2026-09-06: only
    // CSE-related courses transfer, the DGS decides which, up to the cap) —
    // amber, and never "over the cap", whichever candidates the allocator
    // happened to fit under the cap for the running totals.
    // The general rule (CSE-related only, the DGS decides, the cap) is said
    // once above the transcript's group in the coursework card; each line
    // carries only what is specific to the course.
    const capWord = transferCandidate.capLimit !== undefined ? `${transferCandidate.capLimit}-credit ` : '';
    const fate =
      counted > 0 && excluded === 0
        ? `would count toward ${poolName} (${formatCredits(counted)} cr) if the DGS approves it`
        : counted > 0
          ? `would count ${formatCredits(counted)} of ${formatCredits(total)} credits toward ${poolName} if the DGS approves it (the ${capWord}transfer cap limits the rest)`
          : `counts only if the DGS picks it — the candidates together exceed the ${capWord}transfer cap`;
    const coreNote = /; (the same review can confirm|satisfies) [^;]*core-knowledge requirement[^;]*/.exec(cc.approvalPending ?? '')?.[0] ?? '';
    return {
      explanation: `pending DGS review — candidate for transfer credit (§5.2); ${fate}${coreNote}`,
      mark: 'pending',
    };
  }
  // A transfer the DGS has ALREADY ruled transferable (ExternalCourses tab)
  // is not "pending DGS review": it is pre-approved and waits only for the
  // Grad Admin's processing (DGS 2026-09-07 — until then one line said both
  // "would count … once approved" and "pre-approved").
  const preApproved = cc.tier === 'provisional' && /^pre-approved/.test(cc.approvalPending ?? '');
  const lead = preApproved
    ? 'pre-approved by the DGS — will count'
    : cc.tier === 'provisional'
      ? 'pending DGS review — would count'
      : cc.tier === 'in_progress'
        ? 'in progress — will count'
        : 'counts';
  const tail = preApproved
    ? ' as transfer credit once the Grad Admin has processed it'
    : cc.tier === 'provisional'
      ? ' once approved'
      : cc.tier === 'in_progress'
        ? ' when passed'
        : '';
  let mark: CourseMark;
  if (counted > 0 && excluded > 0) {
    mark = cc.tier === 'definite' ? 'counts' : 'pending';
    // Every conditional lead already ends in the bare "count" ("would count",
    // "will count"); only the definite lead is "counts", and the rewrite that
    // used to sit here hit exactly that one, so a passed course partly over a
    // cap read "count 1 of 4 credits toward regular courses" (2026-09-09).
    parts.push(
      `${lead} ${formatCredits(counted)} of ${formatCredits(total)} credits toward ${poolName}${tail}; ${formatCredits(excluded)} not counted — ${excludedReason ?? ''}`,
    );
  } else if (counted > 0) {
    mark = cc.tier === 'definite' ? 'counts' : 'pending';
    parts.push(`${lead} toward ${poolName} (${formatCredits(counted)} cr)${tail}`);
    if (cc.effectiveCredits !== undefined && cc.effectiveCredits !== cc.entry.credits) {
      parts.push(
        `counted as ${formatCredits(cc.effectiveCredits)} ND ${cc.effectiveCredits === 1 ? 'credit' : 'credits'} ${cc.creditsConverted ? 'converted from the quarter system' : 'per the DGS’s value for this course'} (transcript shows ${formatCredits(cc.entry.credits)}; §5.2)`,
      );
    }
    // The cap covers both levels below 60000 since 2026-09-09, so the line
    // must name the course's OWN level: a 50000-level bridge course was
    // telling the student it "uses the 40000-level allowance".
    if (cc.caps.includes('fourk')) {
      const level = levelOf(cc.entry, cc.rule);
      parts.push(`uses the ${Number.isFinite(level) ? `${level}0000-level` : 'below-60000'} allowance (6 credits, §4.2)`);
    }
    if (cc.caps.includes('noncse')) parts.push('uses the non-CSE allowance');
    // The pending note already says "transfer — …(§5.2)" (and the pre-approved
    // lead says "as transfer credit"); say it once.
    if (cc.caps.includes('transfer') && !preApproved && !/^transfer/.test(cc.approvalPending ?? '')) parts.push('transfer credit (§5.2)');
  } else {
    const reason = excludedReason ?? 'not counted';
    // An undergraduate course that satisfies (green) or may satisfy (amber) a
    // §4.4.1 core area earns no credit but is not "excluded" either.
    // …and so does a graduate course excluded for §5.2 reasons (the award
    // term, the window, the grade floor, a DGS "no") whose line carries a
    // core note: confirmed → green, keyword → amber (2026-09-06 evening).
    // A course whose fate waits on the student's own answer is amber, whatever
    // else its line says: green would tell them it is settled (2026-09-10).
    mark = /^not counted yet/.test(reason)
      ? 'pending'
      : /^satisfies|; satisfies the /.test(reason)
        ? 'counts'
        : /^may satisfy|; may still satisfy /.test(reason)
          ? 'pending'
          : 'excluded';
    parts.push(/not counted|not relevant|superseded|failed|^satisfies|^may satisfy/.test(reason) ? reason : `not counted — ${reason}`);
    // A course that earns nothing anyway does not need the approval note —
    // the review request still lists it (DGS 2026-09-06: the old suffix read
    // as if a review could make it count).
    return { explanation: parts.join('; '), mark };
  }
  // The pre-approved note's opening repeats the lead: keep its instruction.
  if (cc.approvalPending) parts.push(preApproved ? cc.approvalPending.replace(/^pre-approved in the DGS’s external-course rules — to have it processed, send/, 'send') : cc.approvalPending);
  return { explanation: parts.join('; '), mark };
}
