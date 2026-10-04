// The words beside each date in the Milestones card (DGS 2026-10-04: "In the
// Milestones, next to all the dates, specify the deadlines."). DOM-free, so
// the tests read the same sentence the page prints; app.ts draws it.
import type { MilestoneDeadline } from '../engine/types.ts';

/** The deadline in the words the report's chips use: "Due by …", "· due this
 * (next) semester", "Overdue — the deadline was …", and a date entered after
 * it. A milestone with no deadline of its own says why. */
export function deadlineText(d: MilestoneDeadline): string {
  if (!d.due) return d.basis;
  const base = `Due ${d.due} — ${d.basis}${d.also ? `; ${d.also}` : ''}`;
  switch (d.state) {
    case 'overdue':
      return `Overdue — the deadline was ${d.point} — ${d.basis}`;
    case 'late':
      return `${base}. The date entered is after this deadline.`;
    case 'due_soon':
      return `${base} · due ${d.horizon === 'next' ? 'next' : 'this'} semester`;
    default:
      return base;
  }
}
