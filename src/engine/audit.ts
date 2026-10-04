// The engine's only entry point: audit(student, rules, today) → AuditReport.
// Pure by contract (CLAUDE.md): no DOM, no fetch, no Date.now() — "today" is an
// argument so tests are deterministic.
import { undergraduateGraduateCourseworkFlagFor } from './review.ts';
import type { Rules } from '../data/types.ts';
import { NON_DEGREE_CREDITS_MAX, allocate, classify, decidedCaseByCase, overMaxTerms, registrationCaps, spentOnBachelorsAndMasters, type CapSpec, type CourseMark } from './allocate.ts';
import { specialTracks } from './tracks.ts';
import { decisionWording, decisionWordingDeep } from './decider.ts';
import { normalizeEntryTerm, termLabel, compareTerm, termOfDate, semesterSeq } from './term.ts';
import type { AuditReport, Grade, RequirementResult, Student } from './types.ts';
import { isCovidCohort, type Ctx } from './requirements/context.ts';
import { fullTimeTermRecords, graduateLevelFlag } from './requirements/residency.ts';
import { transferCourseChecks } from '../data/course-checks.ts';
import { isNotreDameInstitution } from '../data/external.ts';
import { advisorRow, approvalsRow, gpaRow } from './requirements/shared.ts';
import { mscseRows, msTimeLimitRow } from './requirements/mscse.ts';
import { phdRows, phdTimeLimitRow, qualifierPriorRulesEligible } from './requirements/phd.ts';
import { formatCredits } from './credits.ts';
import { isInProgress, isPassed, meetsGradeFloor } from './grades.ts';

/** Requirement id ↔ plan-inventory mapping (docs/DECISIONS.md, plan §1):
 *   shared.gpa=S1  shared.advisor=S2  shared.approvals=advisory
 *   ms.credits.total=M1  ms.credits.regular=M2  ms.credits.project=M3
 *   ms.cap.fourk=M4  ms.cap.noncse=M5  ms.residency=M6  ms.timeLimit=M7
 *   ms.thesis.defense=M8  ms.project.report=M9
 *   phd.credits.total=P1  phd.credits.regular=P2  phd.seminar=P3
 *   phd.cap.noncse=P4  phd.cap.fourk=P5  phd.credits.nd=P6  phd.transfer=P7
 *   phd.residency=P8  phd.timeLimit=P9  phd.qualifier=P10
 *   phd.qualifier.core.{os,algorithms,architecture}=P10a
 *   phd.qualifier.categories=P10b  phd.qualifier.research=P10c
 *   phd.candidacy=P11  phd.dissertation.approval=P12
 *   phd.dissertation.defense=P13  phd.msAlongTheWay=P14 */
export const REQUIREMENT_IDS = [
  'shared.gpa',
  'shared.advisor',
  'shared.approvals',
  'ms.credits.total',
  'ms.credits.regular',
  'ms.credits.project',
  'ms.cap.fourk',
  'ms.cap.noncse',
  'ms.cap.sharedbs',
  'ms.transfer',
  'ms.residency',
  'ms.timeLimit',
  'ms.thesis.defense',
  'ms.project.report',
  'phd.credits.total',
  'phd.credits.regular',
  'phd.credits.nd',
  'phd.seminar',
  'phd.cap.fourk',
  'phd.cap.noncse',
  'phd.cap.sharedbs',
  'phd.transfer',
  'phd.residency',
  'phd.timeLimit',
  'phd.qualifier',
  'phd.qualifier.core.os',
  'phd.qualifier.core.algorithms',
  'phd.qualifier.core.architecture',
  'phd.qualifier.categories',
  'phd.qualifier.research',
  'phd.rcr',
  'phd.candidacy',
  'phd.dissertation.approval',
  'phd.dissertation.defense',
  'phd.dissertation.submitted',
  'phd.msAlongTheWay',
] as const;

/** "6-credit non-CSE cap" — or just "non-CSE cap" when the Parameters tab has
 * no value for it, since "?-credit" reads like a typo in the sentence that
 * then tells the student the sheet is missing it (2026-09-09). */
function capLabel(limit: number | undefined, name: string): string {
  return limit === undefined ? name : `${limit}-credit ${name}`;
}

/** The Ph.D.'s cap on coursework counted toward two degrees: the sheet's six
 * credits less what the bachelor's-and-MSCSE courses already took. */
function sharedDegreesCap(base: number | undefined, spent: number): CapSpec {
  const limit = base === undefined ? undefined : Math.max(0, base - spent);
  return {
    id: 'sharedbs',
    limit,
    label:
      spent > 0 && base !== undefined
        ? `allowance for coursework counted toward two degrees — ${formatCredits(spent)} of its ${formatCredits(base)} credits already used by the courses counted toward your bachelor’s degree and your MSCSE`
        : capLabel(limit, 'allowance for coursework counted toward two degrees'),
    section: 'Graduate School',
  };
}

export function audit(student: Student, rules: Rules, today: string): AuditReport {
  const params = rules.parameters;
  const { term: entry, normalized } = normalizeEntryTerm(student.entryTerm);

  const { classified, warnings } = classify(student, rules, today);

  const num = (key: string) => params.number(key);
  // Academic Code §2.3's limit on coursework earned in non-degree status — a
  // Graduate School number kept in code (policy review 2026-10-03).
  const nonDegreeCap: CapSpec = { id: 'nondegree', limit: NON_DEGREE_CREDITS_MAX, label: `${NON_DEGREE_CREDITS_MAX}-credit allowance for non-degree coursework`, section: 'Academic Code §2.3' };
  const capSpecs: CapSpec[] =
    student.program === 'mscse'
      ? [
          nonDegreeCap,
          { id: 'fourk', limit: num('ms_4xxxx_credits_max'), label: capLabel(num('ms_4xxxx_credits_max'), 'cap on courses below the 60000 level'), section: '§3.2' },
          { id: 'noncse', limit: num('ms_noncse_credits_max'), label: capLabel(num('ms_noncse_credits_max'), 'non-CSE cap'), section: '§3.2' },
          // §3.5's limit on coursework shared with the bachelor's (2026-09-10).
          {
            id: 'sharedbs',
            limit: num('ms_bs_double_count_credits_max'),
            label: capLabel(num('ms_bs_double_count_credits_max'), 'allowance for coursework shared with your bachelor’s degree'),
            section: '§3.5',
          },
          {
            id: 'transfer',
            limit: num(student.priorMs === 'completed' ? 'ms_transfer_completed_ms_credits_max' : 'transfer_unfinished_ms_credits_max'),
            label: 'transfer-credit cap',
            section: '§5.2',
          },
        ]
      : [
          nonDegreeCap,
          { id: 'fourk', limit: num('phd_4xxxx_cse_credits_max'), label: capLabel(num('phd_4xxxx_cse_credits_max'), 'cap on courses below the 60000 level'), section: '§4.2' },
          { id: 'noncse', limit: num('phd_noncse_6xxxx_credits_max'), label: capLabel(num('phd_noncse_6xxxx_credits_max'), 'non-CSE cap'), section: '§4.2' },
          // The Graduate School's six credits that may count toward two degrees
          // (through the DGS, 2026-09-22): what the courses counted toward the
          // bachelor's AND the MSCSE used up is gone for the Ph.D. — "If 6
          // credits have double-counted to BS & MS, no more credits can
          // double-count to BS & PhD later". The same sheet key as §3.5's
          // allowance: it is the same six credits.
          sharedDegreesCap(num('ms_bs_double_count_credits_max'), spentOnBachelorsAndMasters(student)),
          {
            id: 'transfer',
            limit: num(student.priorMs === 'completed' ? 'phd_transfer_completed_ms_credits_max' : 'transfer_unfinished_ms_credits_max'),
            label: 'transfer-credit cap',
            section: '§5.2',
          },
        ];

  // Academic Code §3.8's maximal registration (DGS 2026-10-03,
  // P1-residency-enrollment-c4: "cap a semester's credits"): at most 15
  // credits of graduate courses count from a fall or spring semester, 10 from
  // a summer session, unless the student marks the semester's credit overload
  // as approved. Usually a duplicate row or a wrong credit value — the warning
  // says which semester.
  const overMax = overMaxTerms(classified, student, entry);
  capSpecs.push(...registrationCaps(overMax));
  for (const o of overMax) {
    if (o.overloadApproved) continue;
    const excess = o.credits - o.max;
    const summer = o.term.season === 'summer';
    warnings.push(
      `${termLabel(o.term)}: ${formatCredits(o.credits)} credits of ${summer ? 'courses' : 'graduate courses (60000 level or higher)'} are entered — the Graduate School allows at most ${o.max} in ${summer ? 'the summer session' : 'a semester'} (Academic Code §3.8; DGS Handbook §3.9), so ${formatCredits(excess)} ${excess === 1 ? 'credit is' : 'credits are'} not counted. Check for a duplicate row or a wrong credit value; if a credit overload was approved for you, tick it under Approvals you already have.`,
    );
  }

  // Non-CSE credit the nine-credit allowance refuses: into the total for the
  // Ph.D. (F1, 2026-09-12), nowhere for the MSCSE (DGS 2026-10-03 — §3.2's
  // September text counts the nine "toward both" the 30 and the 24).
  const alloc = allocate(classified, capSpecs, { nonCseSpillsToTotal: student.program === 'phd' });

  // The department's qualifier clocks run from the Ph.D.'s own start: for a
  // transfer from the unfinished MSCSE, the term of the transfer (DGS
  // 2026-10-03), while §4.3 and §4.5 keep the MSCSE's entry (DGS 2026-09-26).
  const transferred = student.background?.graduate === 'nd-mscse-transfer' ? student.background.transferredTerm : undefined;
  const qualifierEntry = transferred !== undefined && compareTerm(transferred, entry) > 0 ? normalizeEntryTerm(transferred).term : entry;
  const clockShift = Math.max(0, Math.floor(student.leaveSemesters ?? 0)) + Math.max(0, Math.floor(student.accommodationSemesters ?? 0));
  const ctx: Ctx = {
    student,
    rules,
    today,
    entry,
    qualifierEntry,
    clockShift,
    covidCohort: isCovidCohort(student, entry),
    alloc,
    classified,
    params,
  };
  const reviewFlags: string[] = [];
  const ugFlag = undergraduateGraduateCourseworkFlagFor(classified, student);
  if (ugFlag) {
    reviewFlags.push(ugFlag);
    warnings.push(`${ugFlag} This is included in the review request.`);
  }
  // A `yes` in the ExternalCourses tab the DGS may not have meant (DGS
  // 2026-10-04, P1-sheet-48 / -c2: "a warning needs to be shown to
  // ADGS/DGS/Grad Admin"): an undergraduate-looking number, or a title that
  // suggests independent study, research or a seminar. Carried to the review
  // request and the processing request; nothing is counted or refused on it.
  const staffChecks: string[] = [];
  for (const cc of classified) {
    const c = cc.entry;
    if (c.origin !== 'transfer' || isNotreDameInstitution(c.institution) || cc.transferable !== 'yes' || cc.pool === 'none' || cc.superseded) continue;
    staffChecks.push(...transferCourseChecks(c.courseId, c.institution ?? cc.external?.university ?? 'another university', c.title ?? cc.external?.title, student.program === 'mscse' ? '§3.2' : '§4.2'));
  }
  // Academic Code §4.1: three credits at the 60000 level or higher in every
  // full-time semester, unless the associate dean permitted otherwise — routed
  // to the DGS, never a failed term (policy review 2026-10-03, P1-residency-enrollment-c5).
  const graduateFlag = graduateLevelFlag(fullTimeTermRecords(ctx), params.number('fulltime_credits_min'));
  if (graduateFlag) {
    reviewFlags.push(graduateFlag);
    warnings.push(`${graduateFlag} This is included in the review request.`);
  }

  if (normalized) {
    // Admissions are in fall and spring only (DGS 2026-10-03); a student who
    // starts in the summer is an early-start student whose official
    // matriculation is the fall, so every clock — the five-year window
    // included — counts from it.
    warnings.push(
      `You started in a summer session — Notre Dame admits in fall and spring, so an early-start summer counts from your official matriculation in ${termLabel(entry)}: every deadline and the §5.2 window are counted from it.`,
    );
  }
  // A leave of absence lasts at most two consecutive semesters (Academic Code
  // §5.1); a student who did not return must be readmitted, and the program
  // may reject earlier credits (DGS Handbook §3.3). More than two is not
  // necessarily wrong (two separate leaves), so the record is sent to the DGS
  // rather than refused.
  if ((student.leaveSemesters ?? 0) > 2) {
    warnings.push(
      `${student.leaveSemesters} semesters on leave: the Graduate School grants a leave of absence for at most two consecutive semesters (Academic Code §5.1) — a student who did not return at its end needed readmission, and the program may reject some or all earlier credits (DGS Handbook §3.3). Confirm your standing with the DGS.`,
    );
  }
  if (student.readmittedTerm !== undefined) {
    const interrupted = classified.some((c) => c.interrupted);
    warnings.push(
      interrupted
        ? `Readmitted ${termLabel(student.readmittedTerm)} after an interruption of five years or more: the Academic Code forfeits credit for every course and examination from before it (Academic Code §5.5), so those courses wait for the DGS and are in the review request; the clocks still count from ${termLabel(entry)}, your original matriculation.`
        : `Readmitted ${termLabel(student.readmittedTerm)}: the clocks still count from ${termLabel(entry)}, your original matriculation (Academic Code §6.2.6); the program may have reviewed your earlier credits at readmission (DGS Handbook §3.3) — confirm with the DGS that they all stand.`,
    );
  }
  // A 4+1's graduate credits beyond the shared pair must be moved from UG to
  // GR registration and transferred BEFORE the bachelor's degree is conferred
  // (Graduate School 4+1 guidance): a current senior is told while there is
  // still time (policy review 2026-10-03).
  if (student.bachelorsAwarded !== undefined && compareTerm(student.bachelorsAwarded, termOfDate(today)) >= 0 && classified.some((c) => c.ugToGrUnverified)) {
    warnings.push(
      `Before your bachelor’s degree is conferred (${termLabel(student.bachelorsAwarded)}): the graduate courses you are counting beyond the shared pair must be moved from undergraduate (UG) to graduate (GR) registration with the Graduate School’s transfer-of-credit form, approved by your advising dean and the Graduate School — after conferral they cannot be (Graduate School 4+1 guidance). Ask the Grad Admin for the form.`,
    );
  }
  // CSE §5.1: "The department and the Graduate School will review a student
  // who receives more than one grade of I in a semester or a grade of I in two
  // or more consecutive semesters, to determine their eligibility for
  // continued support and enrollment."
  const incompleteTerms = classified.filter((c) => c.entry.grade === 'I' && c.entry.origin === 'nd' && !c.superseded).map((c) => c.entry.term);
  const perTerm = new Map<number, number>();
  for (const t of incompleteTerms) perTerm.set(semesterSeq(t), (perTerm.get(semesterSeq(t)) ?? 0) + 1);
  const twoInOne = [...perTerm.values()].some((n) => n > 1);
  const consecutive = [...perTerm.keys()].some((seq) => perTerm.has(seq + 1));
  if (twoInOne || consecutive) {
    warnings.push(
      `${twoInOne ? 'More than one Incomplete in one semester' : 'Incompletes in two consecutive semesters'}: the department and the Graduate School review such a record for continued support and enrollment (§5.1) — talk to the DGS.`,
    );
  }
  // The bachelor's award term (2026-09-06) must precede the entry term — a
  // later or equal one would file the whole record as pre-graduate.
  if (student.bachelorsAwarded !== undefined && compareTerm(student.bachelorsAwarded, entry) >= 0) {
    warnings.push(
      `Your bachelor’s degree is set as awarded in ${termLabel(student.bachelorsAwarded)}, which is not before your entry term (${termLabel(entry)}) — check both under Your standing; courses from another university dated up to the award term are not counted as graduate coursework (§5.2).`,
    );
  }

  // Required, not optional (DGS 2026-09-07) — but only worth saying once the
  // student has entered coursework for it to apply to.
  if (student.bachelorsAwarded === undefined && student.courses.length > 0) {
    warnings.push(
      '“Bachelor’s degree awarded” is not set under Your standing. It is required: §5.2 counts a course as transfer credit only when it was taken after your bachelor’s degree was awarded, whether or not you also hold a graduate degree.',
    );
  }

  // The prior-rules qualifier attestation is for third-year-and-later students
  // only (DGS 2026-09-21); a ticked box on an earlier record is ignored, and said.
  if (student.program === 'phd' && student.attestations.qualifierPassedUnderPriorRules === true && !qualifierPriorRulesEligible(entry, today)) {
    warnings.push(
      `“I passed the qualifying examination under the earlier requirements” is ticked, but with an entry term of ${termLabel(entry)} you are not yet in your third year — the box applies only from the fifth semester, so the current qualifier requirements are shown.`,
    );
  }

  const rows: RequirementResult[] = [gpaRow(ctx), advisorRow(ctx)];
  rows.push(...(student.program === 'mscse' ? mscseRows(ctx) : phdRows(ctx)));

  // The time-limit row is "met" only when everything else already is — and it
  // must be able to tell "not finished" from "cannot be judged yet" (red-team
  // 2026-09-13): a blank rules-sheet cell elsewhere used to make a student who
  // had finished everything read "Overdue — the 8-year limit passed".
  // The qualifier's five parts and the allowances are shown but not counted
  // (DGS 2026-09-27): the headline used to count the qualifier six times and
  // grow by one when an allowance was first drawn on.
  const isScored = (r: RequirementResult) => !r.informational && !r.unscored && !r.allowance && r.status !== 'not_applicable';
  const otherRows = rows.filter(isScored);
  // A requirement completed AFTER the limit reads "Eligibility at risk" rather
  // than met (policy review 2026-10-03) — for the time-limit row it is still
  // complete, so that row can say the same thing instead of "Overdue".
  const completeOrLate = (r: RequirementResult) => r.status === 'met' || (r.status === 'needs_dgs_review' && r.statusLabel === 'Eligibility at risk');
  const others = {
    allMet: otherRows.every(completeOrLate),
    anyCannotEvaluate: otherRows.some((r) => r.status === 'cannot_evaluate'),
  };
  rows.push(student.program === 'mscse' ? msTimeLimitRow(ctx, others) : phdTimeLimitRow(ctx, others));
  rows.push(approvalsRow(ctx));

  const scored = rows.filter(isScored);
  // Conditional satisfaction gets its own number (interface review R2,
  // 2026-09-18): the dashboard could not tell "satisfied, pending a signature"
  // from "not satisfied", so it buried the first inside the second and
  // mentioned it in a parenthetical.
  const summary = {
    met: scored.filter((r) => r.status === 'met').length,
    conditional: scored.filter((r) => r.status === 'needs_dgs_review').length,
    scored: scored.length,
  };

  // Which requirements each course feeds (DGS request 2026-09-08). The rows
  // already say which courses satisfy them (`satisfiedBy`, written for the
  // processing request) and, since today, which will (`pendingBy`); this is
  // simply that index read the other way round, in report order. Ids that are
  // not courses — the residency row lists SEMESTERS — are skipped by checking
  // against the record.
  const entered = new Set(student.courses.map((c) => c.courseId));
  const feeds = new Map<string, { id: string; title: string; long: string; when: 'now' | 'later' }[]>();
  const note = (courseId: string, row: RequirementResult, when: 'now' | 'later'): void => {
    if (!entered.has(courseId)) return;
    const list = feeds.get(courseId) ?? [];
    // The short name where there is one: a course's cell lists several of
    // these side by side (2026-09-08). The full title stays for the tooltip.
    if (!list.some((x) => x.id === row.id)) list.push({ id: row.id, title: row.shortTitle ?? row.title, long: row.title, when });
    feeds.set(courseId, list);
  };
  for (const r of rows) {
    if (r.informational || r.status === 'not_applicable') continue;
    for (const id of r.satisfiedBy ?? []) note(id, r, 'now');
    for (const id of r.pendingBy ?? []) note(id, r, 'later');
  }

  // The rows name course IDS, so two entries of one number — a refused earlier
  // attempt beside a pending one (the Notre Dame transcript's own transfer
  // block plus the source transcript, 2026-09-26) — would both carry the
  // pending entry's "Will count toward" list. The lists go to the entries that
  // can still count; only when every entry of a number is refused do they all
  // keep them (a core-area row may still name such a course).
  const canCount = (p: (typeof alloc.perCourse)[number]): boolean => p.mark !== 'excluded';
  // A Notre Dame course taken in the program never gets the classifier's
  // core-knowledge clause, so its qualifier roles showed only in the folded
  // link row (DGS 2026-09-28: "it does not say it counts toward core
  // knowledge … Is this an error?"). Its second line is read off the rows it
  // feeds instead — a core area, a specialization group — with a mark of its
  // own: green now, blue while the course is in progress, amber while it
  // waits on an approval.
  // §4.4.2's grade floor, said on the course's own line (DGS 2026-10-02: a
  // C in a specialization-group course showed only its core-knowledge role,
  // so nothing told the student the course does NOT serve the specialization
  // requirement; the categories row said so, five cards away).
  const categoryFloor = params.gradeLetter('category_min_grade');
  const groupCodes = new Set(rules.categoryGroups.map((g) => g.code));
  const qualifierFromFeeds = (p: (typeof alloc.perCourse)[number], counts: { id: string; long: string; when: 'now' | 'later' }[]): { mark: CourseMark; text: string } | undefined => {
    const roles = counts.filter((x) => x.id.startsWith('phd.qualifier.core.') || x.id === 'phd.qualifier.categories');
    const grade = p.course.entry.grade;
    const inAGroup = (p.course.rule?.categoryGroups ?? []).some((g) => groupCodes.has(g));
    const belowFloor =
      student.program === 'phd' && inAGroup && !roles.some((x) => x.id === 'phd.qualifier.categories') && categoryFloor !== undefined && isPassed(grade) && !isInProgress(grade) && !meetsGradeFloor(grade, categoryFloor as Grade);
    if (roles.length === 0 && !belowFloor) return undefined;
    const parts = [
      ...roles.map((x) => (x.id === 'phd.qualifier.categories' ? 'specialization course (§4.4.2)' : `${x.long.replace(/^Core knowledge:\s*/, '')} core knowledge (§4.4.1)`)),
      ...(belowFloor ? [`specialization course (§4.4.2): not counted — ${grade} is below the ${categoryFloor} floor`] : []),
    ];
    const mark: CourseMark = roles.some((x) => x.when === 'now') ? 'counts' : roles.length === 0 ? 'excluded' : p.mark === 'in_progress' ? 'in_progress' : 'pending';
    return { mark, text: parts.join(' · ') };
  };
  const courseLines = alloc.perCourse.map((p) => {
    const id = p.course.entry.courseId;
    const aLiveSibling = !canCount(p) && alloc.perCourse.some((q) => q !== p && q.course.entry.courseId === id && canCount(q));
    const counts = aLiveSibling ? [] : (feeds.get(id) ?? []);
    const qualifier = p.qualifier ?? qualifierFromFeeds(p, counts);
    return {
      courseId: id,
      term: p.course.entry.term,
      text: p.explanation,
      mark: p.mark,
      ...(qualifier ? { qualifier } : {}),
      // The tick box belongs on a course the sheet decides case by case
      // (DGS 2026-09-27), and only while the course can still count.
      ...(decidedCaseByCase(p.course, student.program) && p.course.ineligibleReason === undefined
        ? { approvable: true as const, ...(p.course.entry.dgsApproved ? { approved: true as const } : {}) }
        : {}),
      counts,
    };
  });

  // The degree's decider, said once at the boundary (2026-09-11): for an
  // MSCSE student every "DGS" in what follows is the ADGS. Handbook quotes
  // (`citation`) are left as written.
  const p = student.program;
  return {
    reviewFlags,
    ...(staffChecks.length > 0 ? { staffChecks } : {}),
    program: p,
    requirements: rows.map((r) => decisionWordingDeep(p, r)),
    courseLines: courseLines.map((l) => ({ ...l, text: decisionWording(p, l.text), ...(l.qualifier ? { qualifier: { ...l.qualifier, text: decisionWording(p, l.qualifier.text) } } : {}) })),
    summary,
    warnings: warnings.map((w) => decisionWording(p, w)),
    tracks: specialTracks(student, classified).map((t) => ({ ...t, text: decisionWording(p, t.text) })),
  };
}
