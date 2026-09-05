// Status algebra. Small on purpose so it can be exhaustively unit-tested.
//
// Certainty ladder per credit (best → worst):
//   definite    — passed final grade, rules sheet (or an attestation) says it counts
//   in_progress — registered, no final grade yet (decision Q1)
//   provisional — needs someone's sign-off: dgs_approval rows, unknown courses,
//                 free-text non-CSE courses, any transfer (§5.2)
// A threshold row's status is the certainty of the worst credit actually needed.
import type { DeadlineInfo, Status } from './types.ts';

export type Tier = 'definite' | 'in_progress' | 'provisional';

export interface TierSums {
  definite: number;
  in_progress: number;
  provisional: number;
}

export const ZERO_SUMS: TierSums = { definite: 0, in_progress: 0, provisional: 0 };

export function addSums(a: TierSums, b: TierSums): TierSums {
  return {
    definite: a.definite + b.definite,
    in_progress: a.in_progress + b.in_progress,
    provisional: a.provisional + b.provisional,
  };
}

/** Σ ≥ N with the certainty ladder. `required === undefined` means the rules
 * sheet is missing the parameter → cannot evaluate (never silently pass). */
export function thresholdStatus(sums: TierSums, required: number | undefined): Status {
  if (required === undefined) return 'cannot_evaluate';
  if (sums.definite >= required) return 'met';
  if (sums.definite + sums.in_progress >= required) return 'in_progress';
  if (sums.definite + sums.in_progress + sums.provisional >= required) return 'needs_dgs_review';
  return 'unmet';
}

/** Worst-first combination for umbrella rows (e.g. §4.4's three qualifier parts). */
const COMBINE_ORDER: Status[] = [
  'unmet',
  'cannot_evaluate',
  'needs_dgs_review',
  'in_progress',
  'met',
];

export function combineAll(children: Status[]): Status {
  const real: Status[] = children.filter((s) => s !== 'not_applicable');
  if (real.length === 0) return 'not_applicable';
  for (const s of COMBINE_ORDER) {
    if (real.includes(s)) return s;
  }
  return 'met';
}

/** Milestone-with-deadline semantics (decisions Q17b, Q22):
 *  done before the deadline → met; done after → needs DGS review;
 *  not done, deadline ahead → in progress; not done, deadline past → unmet. */
export function deadlineStatus(args: {
  doneOn?: string; // ISO date the milestone happened, if it did
  deadline: { date: string; approx: boolean };
  today: string;
  deadlineLabel: string; // human phrase, e.g. "the end of Spring 2030" — a semester, never a date (2026-09-05)
  extensionGranted?: boolean; // §4.4 "the DGS may extend the deadline"
  dueSoonDays?: number;
}): { status: Status; deadline: DeadlineInfo; lateNote?: string } {
  const { doneOn, deadline, today, deadlineLabel, extensionGranted } = args;
  const approxSuffix = deadline.approx ? ' (approximate)' : '';
  if (doneOn) {
    if (doneOn <= deadline.date || extensionGranted) {
      return {
        status: 'met',
        deadline: { ...deadline, state: 'done', label: `Done ${doneOn}` },
      };
    }
    return {
      status: 'needs_dgs_review',
      deadline: { ...deadline, state: 'done', label: `Done ${doneOn} — after ${deadlineLabel}` },
      lateNote: `completed after ${deadlineLabel}${approxSuffix} — confirm the DGS extended the deadline`,
    };
  }
  if (today > deadline.date && !extensionGranted) {
    return {
      status: 'unmet',
      deadline: {
        ...deadline,
        state: 'overdue',
        label: `Overdue — the deadline was ${deadlineLabel}${approxSuffix}`,
      },
    };
  }
  const dueSoonDays = args.dueSoonDays ?? 120;
  const msLeft = Date.parse(deadline.date) - Date.parse(today);
  const soon = msLeft <= dueSoonDays * 24 * 3600 * 1000;
  return {
    status: 'in_progress',
    deadline: {
      ...deadline,
      state: soon ? 'due_soon' : 'upcoming',
      label: `Due by ${deadlineLabel}${approxSuffix}`,
    },
  };
}
