// Credit classification and cap allocation.
//
// Every entered course is first CLASSIFIED: which pool it can fill (regular /
// project / seminar / total-only / none), which credit caps it consumes, and how
// certain its credit is (definite / in progress / provisional — see status.ts).
// Then ALLOCATION fills the caps at credit granularity, order-independently:
// uncapped and single-cap credits greedily (provably optimal by an exchange
// argument), the rare multi-cap courses by exact search — never the prototype's
// entry-order greedy, where re-sorting the course list changed the verdict.
import { resolveRuleRow } from '../data/assemble.ts';
import { findExternalRule } from '../data/external.ts';
import type { ExternalRule, RuleCourse, Rules } from '../data/types.ts';
import { GRADES, isInProgress, isPassed, meetsGradeFloor } from './grades.ts';
import type { Tier, TierSums } from './status.ts';
import { ZERO_SUMS } from './status.ts';
import { compareTerm, normalizeEntryTerm, shiftTermYears, termIndex, termLabel } from './term.ts';
import type { CourseEntry, Grade, Program, Student } from './types.ts';

export type CapId = 'fourk' | 'noncse' | 'transfer';

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
  /** Transfer-only: the DGS's ND-equivalent credit value (ExternalCourses
   * nd_credits — §5.2 "pro-rata"); counting uses this instead of the credits
   * printed on the transcript. */
  effectiveCredits?: number;
}

export interface CourseAllocation {
  course: ClassifiedCourse;
  countedRegular: number;
  countedOther: number; // project / seminar / total_only credits
  excluded: number;
  excludedReason?: string;
  explanation: string; // the per-course line shown to the student
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
      const extBase: ClassifiedCourse = { ...base, external };
      // §5.2 criterion 2: transfers must be "graduate courses … [taken with]
      // graduate student status" — Bachelor's coursework can never transfer.
      // §4.4.1 core knowledge has no such restriction, so the course stays
      // visible to the core check (coreRows reads classified regardless).
      if (c.degreeLevel === 'bachelors') {
        return {
          ...extBase,
          ineligibleReason:
            "no credit — Bachelor's coursework cannot transfer (§5.2 requires graduate courses taken with graduate student status); it can still satisfy §4.4.1 core knowledge",
        };
      }
      if (external?.transferable === false) {
        return {
          ...extBase,
          ineligibleReason: `not counted — the DGS has ruled this ${external.university} course non-transferable (external-course rules)`,
        };
      }
      // §5.2: "grades of 'B' (3.0 on 4.0 scale) or better were achieved" and
      // "completed within a five-year period prior to admission … or while
      // enrolled". Every transfer needs DGS + Graduate School approval.
      if (transferFloor !== undefined && !meetsGradeFloor(grade, transferFloor as Grade) && !isInProgress(grade)) {
        return { ...extBase, ineligibleReason: `not counted — grade below ${transferFloor} (§5.2)` };
      }
      if (windowYears !== undefined && compareTerm(c.term, shiftTermYears(entry, -windowYears)) < 0) {
        return {
          ...extBase,
          ineligibleReason: `not counted — completed outside the ${windowYears}-year window before admission (five-year window, §5.2)`,
        };
      }
      const attested = attestations.transferApproved === true;
      return {
        ...extBase,
        pool: 'regular',
        caps: ['transfer'],
        tier: tierFor(grade, !attested),
        // §5.2 "pro-rata" for non-semester systems: the DGS's ND-equivalent value wins.
        effectiveCredits: external?.ndCredits,
        approvalPending: attested
          ? undefined
          : external?.transferable === true
            ? 'pre-approved in the DGS’s external-course rules — to transfer it, send the §5.2 credit-transfer request to the Graduate Program Coordinator'
            : external
              ? 'transfer — reviewed by the DGS, but transferability is not yet decided (§5.2)'
              : 'transfer — not yet reviewed by the DGS; needs DGS + Graduate School approval (§5.2)',
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
          approvalPending: attested
            ? undefined
            : 'non-CSE course — needs advisor + DGS approval (§3.2/§4.2)',
        };
      }
      // Unknown CSE course: never silently counted or rejected (CLAUDE.md).
      if (level === 5) {
        return { ...base, ineligibleReason: 'not counted — 50000-level courses do not count (decision Q19)' };
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
    // 40000-level → the 4xxxx checkbox; non-CSE → the non-CSE checkbox. A CSE
    // course above the 40000 level flagged dgs_approval has no checkbox — it
    // stays provisional and the approvals row explains.
    const approvalAttested =
      (level === 4 && attestations.dgsApproved4xxxx === true) ||
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
        if (level === 4) {
          if (!isCse) {
            return {
              ...base,
              ineligibleReason:
                'not counted — non-CSE 40000-level courses do not count (DGS decision 2026-08-31)',
            };
          }
          return { ...base, pool: 'regular', caps: ['fourk'], tier: tierFor(grade, provisional), approvalPending };
        }
        if (level === 5) {
          return { ...base, ineligibleReason: 'not counted — 50000-level courses do not count (decision Q19)' };
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
    transfer: { ...ZERO_SUMS },
  };

  const allocations = new Map<ClassifiedCourse, CourseAllocation>();

  const take = (cc: ClassifiedCourse, amount: number) => {
    const credits = cc.effectiveCredits ?? cc.entry.credits;
    const counted = Math.min(credits, amount);
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
    if (cc.entry.origin === 'transfer') sums.transfer[cc.tier] += counted;

    const excludedReason =
      excluded > 0 && cc.caps.length > 0
        ? `over the ${cc.caps.map(capLabel).join(' and ')} (${caps.find((c) => c.id === cc.caps[0])?.section ?? ''})`
        : undefined;
    allocations.set(cc, {
      course: cc,
      countedRegular: isRegular ? counted : 0,
      countedOther: isRegular ? 0 : counted,
      excluded,
      excludedReason,
      explanation: buildExplanation(cc, counted, excluded, excludedReason),
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
      explanation: buildExplanation(cc, 0, cc.entry.credits, cc.ineligibleReason),
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

function buildExplanation(
  cc: ClassifiedCourse,
  counted: number,
  excluded: number,
  excludedReason?: string,
): string {
  const parts: string[] = [];
  const poolName =
    cc.pool === 'regular'
      ? 'regular courses'
      : cc.pool === 'project'
        ? 'the project/thesis requirement'
        : cc.pool === 'seminar'
          ? 'the research seminar requirement'
          : 'the total-credit requirement only';
  if (counted > 0 && excluded > 0) {
    parts.push(
      `${counted} of ${cc.effectiveCredits ?? cc.entry.credits} credits count toward ${poolName}; ${excluded} not counted — ${excludedReason ?? ''}`,
    );
  } else if (counted > 0) {
    parts.push(`counts toward ${poolName} (${counted} cr)`);
    if (cc.effectiveCredits !== undefined && cc.effectiveCredits !== cc.entry.credits) {
      parts.push(`counted as ${cc.effectiveCredits} ND ${cc.effectiveCredits === 1 ? 'credit' : 'credits'} per the DGS’s pro-rata value (transcript shows ${cc.entry.credits}; §5.2)`);
    }
    if (cc.caps.includes('fourk')) parts.push('uses the 40000-level allowance');
    if (cc.caps.includes('noncse')) parts.push('uses the non-CSE allowance');
    if (cc.caps.includes('transfer')) parts.push('transfer credit (§5.2)');
  } else {
    const reason = excludedReason ?? 'not counted';
    parts.push(/not counted|superseded|failed/.test(reason) ? reason : `not counted — ${reason}`);
  }
  if (cc.approvalPending) parts.push(cc.approvalPending);
  return parts.join('; ');
}
