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
 *  not done, deadline ahead → in progress; not done, deadline past → unmet.
 *
 * An extension the DGS granted under §4.4 ("the DGS may extend the deadline on
 * a case-by-case basis") is ONE ADDITIONAL SEMESTER (DGS 2026-09-13), passed
 * in as the extended deadline itself rather than as a bare "forgive it" flag.
 * The old boolean had no time bound at all: a research qualifier five years
 * past its deadline still read "due soon" against the original date, forever,
 * and a pass years late was indistinguishable from one two weeks late. Every
 * comparison below is against the extended date when there is one, so the
 * extension runs out on schedule and the wording keeps the trace. */
export function deadlineStatus(args: {
  doneOn?: string; // ISO date the milestone happened, if it did
  deadline: { date: string; approx: boolean };
  today: string;
  deadlineLabel: string; // human phrase, e.g. "the end of Spring 2030" — a semester, never a date (2026-09-05)
  extension?: { date: string; label: string };
  dueSoonDays?: number;
}): { status: Status; deadline: DeadlineInfo; lateNote?: string } {
  const { doneOn, deadline, today, deadlineLabel, extension } = args;
  const approxSuffix = deadline.approx ? ' (approximate)' : '';
  const effectiveDate = extension?.date ?? deadline.date;
  if (doneOn) {
    if (doneOn <= deadline.date) {
      return {
        status: 'met',
        deadline: { ...deadline, state: 'done', label: `Done ${doneOn}` },
      };
    }
    if (extension && doneOn <= extension.date) {
      return {
        status: 'met',
        deadline: { ...deadline, state: 'done', label: `Done ${doneOn} — within the DGS’s one-semester extension` },
        lateNote: `completed after ${deadlineLabel}${approxSuffix}, within the one-semester extension the DGS granted (${extension.label})`,
      };
    }
    return {
      status: 'needs_dgs_review',
      deadline: { ...deadline, state: 'done', label: `Done ${doneOn} — after ${extension ? extension.label : deadlineLabel}` },
      lateNote: extension
        ? `completed after ${extension.label}${approxSuffix} — later than the one-semester extension allows; confirm with the DGS`
        : `completed after ${deadlineLabel}${approxSuffix} — confirm the DGS extended the deadline`,
    };
  }
  if (today > effectiveDate) {
    return {
      status: 'unmet',
      deadline: {
        ...deadline,
        date: effectiveDate,
        state: 'overdue',
        label: extension
          ? `Overdue — the DGS’s one-semester extension ran out at ${extension.label}${approxSuffix}`
          : `Overdue — the deadline was ${deadlineLabel}${approxSuffix}`,
      },
    };
  }
  const dueSoonDays = args.dueSoonDays ?? 120;
  const msLeft = Date.parse(effectiveDate) - Date.parse(today);
  const soon = msLeft <= dueSoonDays * 24 * 3600 * 1000;
  return {
    status: 'in_progress',
    deadline: {
      ...deadline,
      date: effectiveDate,
      state: soon ? 'due_soon' : 'upcoming',
      label: extension
        ? `Due by ${extension.label}${approxSuffix} — the DGS’s one-semester extension of ${deadlineLabel}`
        : `Due by ${deadlineLabel}${approxSuffix}`,
    },
  };
}
