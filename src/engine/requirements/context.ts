// Shared context handed to every requirement builder, plus small helpers used
// across the §3 and §4 modules.
import { formatCredits } from '../credits.ts';
import type { Parameters, Rules } from '../../data/types.ts';
import type { AllocationResult, CapId, ClassifiedCourse, CourseAllocation } from '../allocate.ts';
import { usableGpa } from '../ranges.ts';
import type { TierSums } from '../status.ts';
import { thresholdStatus } from '../status.ts';
import { addYearsIso, deadlineTermLabel, dueTermPhrase, startOfTerm } from '../term.ts';
import type { Contribution, DetailPart, RequirementResult, Status, Student, Term } from '../types.ts';

export interface Ctx {
  student: Student;
  rules: Rules;
  today: string;
  /** Entry term normalized (summer entry → the following fall, decision Q17c). */
  entry: Term;
  alloc: AllocationResult;
  classified: ClassifiedCourse[];
  params: Parameters;
}

export function missingParamDetail(key: string): string {
  return `Cannot evaluate — the rules sheet is missing '${key}'. Ask the DGS to add it to the Parameters tab`;
}

/** The regular-pool courses counted only provisionally — named on the credit
 * rows whenever the verdict leans on them. */
export function provisionalRegularIds(ctx: Ctx): string[] {
  return ctx.classified
    .filter((c) => c.pool === 'regular' && c.tier === 'provisional' && !c.superseded)
    .map((c) => c.entry.courseId);
}

/** §2.2's bar on defending with a low GPA, as the sentence the defense rows
 * append (empty when it does not apply). */
export function defendGpaNote(ctx: Ctx): string {
  const min = ctx.params.number('gpa_min');
  const defenseGpa = usableGpa(ctx.student.gpa); // R1: an off-scale figure gates nothing
  return min !== undefined && defenseGpa !== undefined && defenseGpa < min
    ? ` Note §2.2: a student whose cumulative GPA is below ${min.toFixed(1)} may not defend.`
    : '';
}

/** The degree's time limit — §3.3's five years / §4.3's eight — as one row.
 * "Met" only when everything else already is, and able to tell "not finished"
 * from "cannot be judged yet" (red-team 2026-09-13): a blank rules-sheet cell
 * elsewhere used to make a student who had finished everything read "Overdue
 * — the 8-year limit passed". */
export function timeLimitRow(
  ctx: Ctx,
  others: { allMet: boolean; anyCannotEvaluate: boolean },
  args: { id: string; group: string; title: string; yearsKey: string; section: string; quote: string },
): RequirementResult {
  const years = ctx.params.number(args.yearsKey);
  let status: Status;
  let detail: string;
  let deadline: RequirementResult['deadline'];
  if (years === undefined) {
    status = 'cannot_evaluate';
    detail = missingParamDetail(args.yearsKey);
  } else {
    // Shown as a semester, never a date (DGS request 2026-09-05): eight years
    // from the entry term's start is the start of a term.
    const date = addYearsIso(startOfTerm(ctx.entry).date, years);
    if (others.allMet) {
      status = 'met';
      detail = `All requirements are complete within the ${years}-year limit.`;
      deadline = { date, approx: true, state: 'done', label: 'Complete' };
    } else if (ctx.today > date && others.anyCannotEvaluate) {
      // A missing rules-sheet value is not a missed deadline (red-team
      // 2026-09-13): a student who has finished everything used to read
      // "Overdue — forfeiture" because one unrelated parameter was blank.
      status = 'cannot_evaluate';
      detail = `The ${years}-year limit passed at ${deadlineTermLabel(date)} (approximate), but a requirement above cannot be evaluated until the rules sheet is complete — so whether everything was finished in time cannot be judged. Ask the DGS to fill in the missing value.`;
      deadline = { date, approx: true, state: 'overdue', label: `The ${years}-year limit passed at ${deadlineTermLabel(date)}` };
    } else if (ctx.today > date) {
      status = 'unmet';
      detail = `Overdue — the ${years}-year limit passed at ${deadlineTermLabel(date)} (approximate). Talk to the DGS.`;
      deadline = { date, approx: true, state: 'overdue', label: `Overdue — the ${years}-year limit passed at ${deadlineTermLabel(date)}` };
    } else {
      status = 'in_progress';
      detail = ''; // the deadline chip carries the when (2026-09-03)
      // A semester, never a date (DGS request 2026-09-05).
      deadline = { date, approx: true, state: 'upcoming', label: `Due ${dueTermPhrase(date)} — ${years} years after entry (approximate)` };
    }
  }
  return {
    id: args.id,
    group: args.group,
    title: args.title,
    status,
    detail,
    deadline,
    citation: { section: args.section, quote: args.quote },
  };
}

/** Join independent detail statements into the prose `detail`, keeping the
 * pieces as `detailParts` so the report can bullet a long detail (DGS request
 * 2026-09-04). A part may be {lead, items} — flattened to "lead: a; b; c" in
 * the prose and rendered as a nested list by the report. Single plain
 * statements stay plain text. */
export function joinedDetail(parts: DetailPart[]): { detail: string; detailParts?: DetailPart[] } {
  const flat = (p: DetailPart): string =>
    typeof p === 'string' ? p : 'warn' in p ? p.warn : `${p.lead}: ${p.items.join('; ')}`;
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
  /** Short name for lists that reference this row (2026-09-08). */
  shortTitle?: string;
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
  /** Which courses contribute, and how much (2026-09-22) — `courseContributions`. */
  contributions?: Contribution[];
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
    // "15 of 9 credits complete" is not a sentence (blue-team B3, 2026-09-18):
    // past the minimum the row says what the student HAS and that the floor is
    // behind them, instead of counting toward a number they have overshot.
    parts.push(
      sums.definite >= required
        ? `${n(sums.definite)} ${unit} — the ${n(required)}-${unit.replace(/s$/, '')} minimum is met`
        : `${n(sums.definite)} of ${required} ${unit} complete`,
    );
    if (sums.in_progress > 0) parts.push(`${n(sums.in_progress)} in progress`);
    if (sums.provisional > 0) parts.push(`${n(sums.provisional)} pending review/approval`);
    if (status === 'needs_dgs_review' && args.provisionalCourses?.length) {
      parts.push(`meeting this depends on courses that still need review: ${args.provisionalCourses.join(', ')}`);
    }
  }
  // Advice about what to register for belongs to a row that is not yet met:
  // a finished student was still being told "Register for CSE 68902 (project)
  // or CSE 68901 (thesis direction)" beside their own completed six credits
  // (2026-09-11).
  if (status !== 'met') parts.push(...(args.extraDetail ?? []));
  return {
    id: args.id,
    group: args.group,
    title: args.title,
    ...(args.shortTitle ? { shortTitle: args.shortTitle } : {}),
    status,
    ...joinedDetail(parts),
    ...(required === undefined ? {} : { progress: { have: sums.definite, need: required, unit } }),
    citation: { section: args.section, quote: args.quote },
    ...(args.satisfiedBy && args.satisfiedBy.length > 0 ? { satisfiedBy: args.satisfiedBy } : {}),
    ...(args.pendingBy && args.pendingBy.length > 0 ? { pendingBy: args.pendingBy } : {}),
    ...(args.contributions && args.contributions.length > 0 ? { contributions: args.contributions } : {}),
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

/** Every course that contributes to a row by `pick`, with the credits it
 * contributes; a course still to be passed or approved is `pending` (DGS
 * 2026-09-22: the report folds these behind "Courses counted"). */
export function courseContributions(ctx: Ctx, pick: (p: CourseAllocation) => number): Contribution[] {
  return ctx.alloc.perCourse
    .filter((p) => pick(p) > 0 && !p.course.superseded)
    .map((p) => ({ courseId: p.course.entry.courseId, credits: pick(p), ...(p.course.tier === 'definite' ? {} : { pending: true as const }) }));
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
  capId: CapId;
  capLabel: string;
  limitKey: string;
  section: string;
  quote: string;
  ctx: Ctx;
  /** Cap rows whose own handbook sentence makes the credit conditional on an
   * approval go needs_dgs_review while any of their courses is still waiting
   * for it, rather than met. Set it exactly where the quote on the card says
   * so — §4.2's two allowances ("subject to approval of the student's advisor
   * and DGS"), §3.2's non-CSE allowance ("subject to approval by the advisor
   * and the DGS") and §3.5's shared credits ("With approval of the instructor
   * and DGS").
   *
   * Not on `ms.cap.fourk`: §3.2's "Up to six (6) credits at the 40000 level
   * may be used to satisfy the course requirement" names no approval, so its
   * absence there is the handbook's, not an oversight (interface review R3,
   * 2026-09-18 — the other two were oversights and are fixed). */
  approvalDriven?: boolean;
  /** Plain sentences after the usage line — what the cap's number does not
   * say on its own (the Ph.D.'s two-degree allowance names what an earlier
   * degree already used, 2026-09-22). */
  extraDetail?: string[];
}): RequirementResult {
  const usage = args.ctx.alloc.capUsage.get(args.capId);
  const relevant = args.ctx.classified.filter((c) => !c.superseded && c.caps.includes(args.capId));
  // Credits the cap DISCARDS. A row that loses a student credit must never
  // present as an unqualified pass (interface review R2, 2026-09-18): these are
  // emitted as warning parts, so the report gives them their own treatment
  // instead of the grey prose they used to share with everything else.
  const excludedLines: DetailPart[] = args.ctx.alloc.perCourse
    .filter((p) => p.course.caps.includes(args.capId) && (p.excluded > 0 || (p.overCapToTotal ?? 0) > 0))
    // Every number a student reads goes through formatCredits (credits.ts:
    // "never scientific notation, never '2.6666666666666665'"). These three
    // were raw (red-team 2026-09-13): one ordinary quarter-system transfer
    // course, converted by the sheet's own pro-rata factor, printed
    // "2.666666668 of the 9 non-CSE cap credits used".
    .map((p) => ({
      warn:
        p.excluded > 0
          ? `${p.course.entry.courseId}: ${formatCredits(p.excluded)} ${p.excluded === 1 ? 'credit' : 'credits'} not counted — over the cap`
          : // The non-CSE allowance limits regular-course credit only (F1,
            // 2026-09-12): what it refuses still counts toward the total.
            `${p.course.entry.courseId}: ${formatCredits(p.overCapToTotal ?? 0)} ${p.overCapToTotal === 1 ? 'credit' : 'credits'} over the cap — count toward the total-credit requirement only`,
    }));

  let status: Status;
  let label: string | undefined;
  const parts: DetailPart[] = [];
  if (usage?.limit === undefined) {
    status = 'cannot_evaluate';
    parts.push(missingParamDetail(args.limitKey));
  } else if (relevant.length === 0) {
    // "Does not apply — No courses touch this cap" read as an EXEMPTION from
    // §4.2's limit (blue-team B4, 2026-09-18). The allowance applies; it is
    // simply unused, and the row says so in the same shape as when it is used.
    // The status stays not_applicable — an unused allowance is not a
    // requirement to meet, so it must not join the score — and only the pill's
    // wording changes, through the same override as W-CS2.
    status = 'not_applicable';
    label = 'Not used yet';
    parts.push(`${formatCredits(0)} of the ${formatCredits(usage.limit)} ${args.capLabel} used`);
  } else {
    const pending = relevant.filter((c) => c.approvalPending);
    status = args.approvalDriven && pending.length > 0 ? 'needs_dgs_review' : 'met';
    parts.push(`${formatCredits(usage.used)} of the ${formatCredits(usage.limit)} ${args.capLabel} used`);
    if (pending.length > 0) {
      parts.push(`needs approval: ${pending.map((c) => c.entry.courseId).join(', ')}`);
    }
    parts.push(...excludedLines);
  }
  if (usage?.limit !== undefined) parts.push(...(args.extraDetail ?? []));
  // What each course draws on this allowance (2026-09-22): the regular-course
  // credits it counts, or every counted credit for a transfer cap.
  const contributions = courseContributions(args.ctx, (p) =>
    p.course.caps.includes(args.capId) ? (args.capId === 'transfer' ? p.countedRegular + p.countedOther : p.countedRegular) : 0,
  );
  return {
    id: args.id,
    group: args.group,
    title: args.title,
    status,
    ...(label ? { statusLabel: label } : {}),
    ...joinedDetail(parts),
    citation: { section: args.section, quote: args.quote },
    ...(contributions.length > 0 ? { contributions } : {}),
  };
}
