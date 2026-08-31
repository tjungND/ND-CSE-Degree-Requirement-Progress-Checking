// Shared context handed to every requirement builder, plus small helpers used
// across the §3 and §4 modules.
import type { Parameters, Rules } from '../../data/types.ts';
import type { AllocationResult, ClassifiedCourse } from '../allocate.ts';
import type { TierSums } from '../status.ts';
import { thresholdStatus } from '../status.ts';
import type { RequirementResult, Status, Student, Term } from '../types.ts';

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
}): RequirementResult {
  const { sums, required } = args;
  const status = thresholdStatus(sums, required);
  const unit = args.unit ?? 'credits';
  const parts: string[] = [];
  if (required === undefined) {
    parts.push(missingParamDetail(args.requiredKey));
  } else {
    parts.push(`${sums.definite} of ${required} ${unit} complete`);
    if (sums.in_progress > 0) parts.push(`${sums.in_progress} in progress`);
    if (sums.provisional > 0) parts.push(`${sums.provisional} pending review/approval`);
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
    detail: parts.join('. ') + '.',
    citation: { section: args.section, quote: args.quote },
  };
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
    detail: parts.join('. ') + '.',
    citation: { section: args.section, quote: args.quote },
  };
}
