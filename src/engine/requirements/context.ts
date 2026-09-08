// Shared context handed to every requirement builder, plus small helpers used
// across the §3 and §4 modules.
import { formatCredits } from '../credits.ts';
import type { Parameters, Rules } from '../../data/types.ts';
import type { AllocationResult, ClassifiedCourse, CourseAllocation } from '../allocate.ts';
import type { TierSums } from '../status.ts';
import { thresholdStatus } from '../status.ts';
import type { DetailPart, RequirementResult, Status, Student, Term } from '../types.ts';

export interface Ctx {
  student: Student;
  rules: Rules;
  today: string;
  /** Entry term normalized (summer entry → the following fall, decision Q17c). */
  entry: Term;
  entryNormalized: boolean;
  alloc: AllocationResult;
  classified: ClassifiedCourse[];
  params: Parameters;
  warnings: string[];
}

export function missingParamDetail(key: string): string {
  return `Cannot evaluate — the rules sheet is missing '${key}'. Ask the DGS to add it to the Parameters tab`;
}

/** Join independent detail statements into the prose `detail`, keeping the
 * pieces as `detailParts` so the report can bullet a long detail (DGS request
 * 2026-09-04). A part may be {lead, items} — flattened to "lead: a; b; c" in
 * the prose and rendered as a nested list by the report. Single plain
 * statements stay plain text. */
export function joinedDetail(parts: DetailPart[]): { detail: string; detailParts?: DetailPart[] } {
  const flat = (p: DetailPart): string => (typeof p === 'string' ? p : `${p.lead}: ${p.items.join('; ')}`);
  const structured = parts.some((p) => typeof p !== 'string');
  return {
    detail: parts.map(flat).join('. ') + (parts.length > 0 ? '.' : ''),
    detailParts: parts.length > 1 || structured ? parts : undefined,
  };
}

/** Standard credit-threshold row: "X of N credits complete", with in-progress
 * and pending-approval credits called out, and the provisional courses named
 * whenever the verdict leans on them. */
export function thresholdRow(args: {
  id: string;
  group: string;
  title: string;
  sums: TierSums;
  required: number | undefined;
  requiredKey: string;
  section: string;
  quote: string;
  unit?: string;
  provisionalCourses?: string[];
  extraDetail?: string[];
  /** The courses whose definite credits count here (processing request, 2026-09-06). */
  satisfiedBy?: string[];
  /** The courses whose credits will count here once passed/approved (2026-09-08). */
  pendingBy?: string[];
}): RequirementResult {
  const { sums, required } = args;
  const status = thresholdStatus(sums, required);
  const unit = args.unit ?? 'credits';
  const parts: string[] = [];
  if (required === undefined) {
    parts.push(missingParamDetail(args.requiredKey));
  } else {
    // Credits can be fractional since quarter-system conversion (2026-09-08).
    const n = (v: number) => (unit === 'credits' ? formatCredits(v) : String(v));
    parts.push(`${n(sums.definite)} of ${required} ${unit} complete`);
    if (sums.in_progress > 0) parts.push(`${n(sums.in_progress)} in progress`);
    if (sums.provisional > 0) parts.push(`${n(sums.provisional)} pending review/approval`);
    if (status === 'needs_dgs_review' && args.provisionalCourses?.length) {
      parts.push(`meeting this depends on courses that still need review: ${args.provisionalCourses.join(', ')}`);
    }
  }
  parts.push(...(args.extraDetail ?? []));
  return {
    id: args.id,
    group: args.group,
    title: args.title,
    status,
    ...joinedDetail(parts),
    citation: { section: args.section, quote: args.quote },
    ...(args.satisfiedBy && args.satisfiedBy.length > 0 ? { satisfiedBy: args.satisfiedBy } : {}),
    ...(args.pendingBy && args.pendingBy.length > 0 ? { pendingBy: args.pendingBy } : {}),
  };
}

/** The ids of the courses whose DEFINITE credits (passed, no approval
 * pending) count toward a pool, by `pick` (e.g. the regular-pool credits) —
 * what the processing request tables as "which courses meet this
 * requirement" (DGS request 2026-09-06 evening). */
export function countedCourseIds(ctx: Ctx, pick: (p: CourseAllocation) => number): string[] {
  return ctx.alloc.perCourse
    .filter((p) => pick(p) > 0 && p.course.tier === 'definite' && !p.course.superseded)
    .map((p) => p.course.entry.courseId);
}

/** The same courses, but the ones still to be passed or approved (2026-09-08):
 * what a student's course line means by "will count toward". */
export function pendingCourseIds(ctx: Ctx, pick: (p: CourseAllocation) => number): string[] {
  return ctx.alloc.perCourse
    .filter((p) => pick(p) > 0 && p.course.tier !== 'definite' && !p.course.superseded)
    .map((p) => p.course.entry.courseId);
}

/** Cap row: caps are enforced by the engine, so the row reports usage and names
 * every excluded credit; it is n/a when nothing touches the cap. */
export function capRow(args: {
  id: string;
  group: string;
  title: string;
  capId: 'fourk' | 'noncse' | 'transfer';
  capLabel: string;
  limitKey: string;
  section: string;
  quote: string;
  ctx: Ctx;
  /** Cap rows whose courses need DGS/advisor approval go needs_dgs_review
   * until attested (non-CSE, transfer); the CSE-4xxxx cap row stays met and
   * lets the approvals row carry the flag. */
  approvalDriven?: boolean;
}): RequirementResult {
  const usage = args.ctx.alloc.capUsage.get(args.capId);
  const relevant = args.ctx.classified.filter(
    (c) => !c.superseded && (c.caps.includes(args.capId) || false),
  );
  const excludedLines = args.ctx.alloc.perCourse
    .filter((p) => p.course.caps.includes(args.capId) && p.excluded > 0)
    .map((p) => `${p.course.entry.courseId}: ${p.excluded} ${p.excluded === 1 ? 'credit' : 'credits'} not counted — over the cap`);

  let status: Status;
  const parts: string[] = [];
  if (usage?.limit === undefined) {
    status = 'cannot_evaluate';
    parts.push(missingParamDetail(args.limitKey));
  } else if (relevant.length === 0) {
    status = 'not_applicable';
    parts.push('No courses touch this cap');
  } else {
    const pending = relevant.filter((c) => c.approvalPending);
    status = args.approvalDriven && pending.length > 0 ? 'needs_dgs_review' : 'met';
    parts.push(`${usage.used} of the ${usage.limit} ${args.capLabel} used`);
    if (pending.length > 0) {
      parts.push(`needs approval: ${pending.map((c) => c.entry.courseId).join(', ')}`);
    }
    parts.push(...excludedLines);
  }
  return {
    id: args.id,
    group: args.group,
    title: args.title,
    status,
    ...joinedDetail(parts),
    citation: { section: args.section, quote: args.quote },
  };
}
