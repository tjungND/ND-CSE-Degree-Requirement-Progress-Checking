// The "Next steps" a record calls for, read off the report and the record
// (DGS 2026-09-27, clarity proposal 1: "1 is fine"). Until then the import's
// outcome existed only as a four-second toast, "Needs your attention" listed
// credit thresholds nobody could act on today, and the one thing waiting —
// the review request — appeared only in the Approvals row at the end of the
// report. String building only, no DOM; report.ts renders the result under
// the dial and in the phone summary. Every "DGS" here is a bare token so the
// page's ADGS rewrite applies on the M.S. tab.
import { termLabel } from '../engine/term.ts';
import type { AuditReport, CourseLine, Student } from '../engine/types.ts';

export interface NextStep {
  text: string;
  /** The place on the page where the step is done, as a fragment link. */
  href?: string;
  /** Requirement rows this step already says everything about — the
   * attention list leaves them out rather than list them twice. */
  covers?: string[];
}

export interface NextStepsInput {
  report: AuditReport;
  student: Student;
  /** Courses the DGS still has to decide — the review card's count. */
  reviewCount: number;
  /** Items the Grad Admin could process now — the processing request's count. */
  processingCount: number;
}

const plural = (n: number, noun: string): string => `${n} ${noun}${n === 1 ? '' : 's'}`;

/** The reason after "not counted — ", cut at the first semicolon: the line's
 * own words, never re-summarised. */
function reasonOf(line: CourseLine): string {
  const m = /^not counted(?: yet)? — ([^;]+)/.exec(line.text);
  return m ? m[1]!.trim() : 'see its line';
}

/** "Your coursework: 5 courses count now, 1 is in progress, 4 are waiting for
 * the DGS (…), 1 does not count (…)." — from the course lines' marks. */
export function courseworkSentence(report: AuditReport): string | undefined {
  const lines = report.courseLines;
  if (lines.length === 0) return undefined;
  const by = (mark: CourseLine['mark']) => lines.filter((l) => l.mark === mark);
  const parts: string[] = [];
  const counts = by('counts').length;
  if (counts > 0) parts.push(`${plural(counts, 'course')} count${counts === 1 ? 's' : ''} now`);
  const inProgress = by('in_progress').length;
  if (inProgress > 0) parts.push(`${inProgress} ${inProgress === 1 ? 'is' : 'are'} in progress`);
  const pending = by('pending');
  if (pending.length > 0) parts.push(`${pending.length} ${pending.length === 1 ? 'is' : 'are'} waiting for the DGS (${pending.map((l) => l.courseId).join(', ')})`);
  const excluded = by('excluded');
  if (excluded.length > 0) {
    // Up to three with their reasons; more than that, the ids alone.
    const what = excluded.length <= 3 ? excluded.map((l) => `${l.courseId} — ${reasonOf(l)}`).join('; ') : `${excluded.map((l) => l.courseId).join(', ')} — each line says why`;
    parts.push(`${excluded.length} ${excluded.length === 1 ? 'does' : 'do'} not count (${what})`);
  }
  return `Your coursework: ${parts.join(', ')}.`;
}

/** The steps, each only when it applies, in the order a student takes them. */
export function nextSteps(input: NextStepsInput): NextStep[] {
  const { report, student, reviewCount, processingCount } = input;
  const steps: NextStep[] = [];
  const hasCourses = student.courses.length > 0;
  // 1. What the transcript set and the student has not yet confirmed.
  const settings: string[] = [];
  if (student.entryTermInferred) settings.push(`first semester ${termLabel(student.entryTerm)}`);
  if (student.bachelorsAwardedInferred && student.bachelorsAwarded) settings.push(`bachelor’s degree ${termLabel(student.bachelorsAwarded)}`);
  if (settings.length > 0) steps.push({ text: `Check what your transcript set — ${settings.join(', ')} (Your standing).`, href: '#standing' });
  // 2. The decisions the DGS has to make.
  if (reviewCount > 0) steps.push({ text: `Send the review request for ${plural(reviewCount, 'course')} — the DGS decides.`, href: '#dgs-review', covers: ['phd.transfer', 'ms.transfer', 'shared.approvals'] });
  // 3. The advisor, and the plan-of-study box — neither waits for the DGS.
  const advisor = report.requirements.find((r) => r.id === 'shared.advisor');
  if (advisor && advisor.status !== 'met') steps.push({ text: 'Enter your advisor’s name under Milestones.', href: '#milestones', covers: ['shared.advisor'] });
  if (hasCourses && !student.attestations.advisorApprovedPlan) steps.push({ text: 'Confirm your advisor approved your plan of study and tick the box under Approvals.', href: '#milestones' });
  // 4. After the DGS answers; and what the Grad Admin can already record.
  const approvals = report.requirements.find((r) => r.id === 'shared.approvals');
  if (approvals?.status === 'needs_dgs_review') steps.push({ text: 'When the DGS answers, tick the approvals, then send the processing request — the Grad Admin records it.', href: '#grad-admin', covers: ['shared.approvals'] });
  if (processingCount > 0) steps.push({ text: `Send the processing request (${plural(processingCount, 'item')}) — the Grad Admin records it.`, href: '#grad-admin' });
  // 5. The advisor summary, any time.
  if (hasCourses) steps.push({ text: 'Send the summary to your advisor whenever you like.' });
  return steps;
}

/** The nearest deadline still ahead, as its own chip label — for the "nothing
 * to do right now" state. */
export function nearestDeadline(report: AuditReport): string | undefined {
  const ahead = report.requirements
    .filter((r) => r.deadline && (r.deadline.state === 'upcoming' || r.deadline.state === 'due_soon'))
    .sort((a, b) => (a.deadline!.date < b.deadline!.date ? -1 : 1));
  const first = ahead[0];
  return first ? `${first.shortTitle ?? first.title}: ${first.deadline!.label}` : undefined;
}
