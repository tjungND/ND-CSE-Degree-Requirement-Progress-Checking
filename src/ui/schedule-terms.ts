// Which semesters the course-rules page's two schedule cards stand for, and
// whether the sheet's `offered_now` / `offered_next` columns still describe
// them (DGS 2026-09-09).
//
// The problem this solves: the card headings come from today's date, but the
// columns are static. A DGS who does not update them the week a semester turns
// over would have the page print last semester's courses under this
// semester's name — students misled by a page that looks authoritative. The
// sheet therefore also carries `current_semester`, the term the sheet as a
// whole is current for — so `offered_now` describes it and `offered_next` the
// one after — and that is what decides what may honestly be shown.
//
// DOM-free so the rule has a test matrix (tests/schedule-terms.test.ts).
import type { Season, Term } from '../engine/types.ts';

/** Schedules are kept for FALL and SPRING. Summer is not a graduate teaching
 * term here, so the term after a fall is the next spring and vice versa. */
export function afterTeachingTerm(t: Term): Term {
  return t.season === 'fall' ? { season: 'spring', year: t.year + 1 } : { season: 'fall', year: t.year };
}

/** The teaching semester a date belongs to: itself for fall and spring, and
 * during the summer the fall that is coming — which is what a student reads a
 * schedule to plan for. */
export function teachingTermOf(today: Term): Term {
  return today.season === 'summer' ? { season: 'fall' as Season, year: today.year } : today;
}

export interface ScheduleView {
  /** The semester the first card stands for. */
  thisTerm: Term;
  /** The semester the second card stands for. */
  nextTerm: Term;
  /** `current`: the sheet describes `thisTerm`, so both columns are read as
   * written. `one-behind`: the sheet describes the semester before, so what it
   * recorded as NEXT is this semester, and nothing is known about the one
   * after. `unusable`: the sheet does not say which semester it describes, or
   * names one too old or not yet reached — nothing may be shown. */
  age: 'current' | 'one-behind' | 'unusable';
  /** Why nothing can be shown, so the page can say which of the three it is
   * rather than blaming a missing row that is present (2026-09-09). */
  reason?: 'missing' | 'stale' | 'ahead' | 'summer';
  /** What the sheet said, when it said something — so the page can quote it
   * back instead of describing the problem in the abstract. */
  recordedFor?: Term;
  /** Which sheet column, if any, fills each card. */
  source: { this?: 'offeredNow' | 'offeredNext'; next?: 'offeredNext' };
}

const same = (a: Term | undefined, b: Term): boolean => a !== undefined && a.season === b.season && a.year === b.year;

/** What the two cards may show, given today and the term the sheet says its
 * schedule was written for. A missing or unreadable `current_semester` is
 * `unusable` on purpose: the page never guesses which semester a list belongs
 * to, exactly as it never guesses a requirement. */
export function scheduleView(today: Term, recordedFor: Term | undefined): ScheduleView {
  const thisTerm = teachingTermOf(today);
  const nextTerm = afterTeachingTerm(thisTerm);
  const dead = (reason: ScheduleView['reason']): ScheduleView => ({ thisTerm, nextTerm, age: 'unusable', reason, source: {}, ...(recordedFor ? { recordedFor } : {}) });
  if (recordedFor === undefined) return dead('missing');
  // A summer code is not a schedule this page can place: schedules are kept
  // for fall and spring, and `afterTeachingTerm` would otherwise read "SU26"
  // as one behind the coming fall and shift the columns on the strength of it
  // (found reviewing this feature, 2026-09-09).
  if (recordedFor.season === 'summer') return dead('summer');
  if (same(recordedFor, thisTerm)) {
    return { thisTerm, nextTerm, age: 'current', recordedFor, source: { this: 'offeredNow', next: 'offeredNext' } };
  }
  if (same(afterTeachingTerm(recordedFor), thisTerm)) {
    return { thisTerm, nextTerm, age: 'one-behind', recordedFor, source: { this: 'offeredNext' } };
  }
  // Ahead of today, or two or more semesters behind.
  return dead(compareTerms(recordedFor, thisTerm) > 0 ? 'ahead' : 'stale');
}

/** Fall/spring order: negative when `a` comes first. */
function compareTerms(a: Term, b: Term): number {
  const seq = (t: Term) => t.year * 2 + (t.season === 'fall' ? 1 : 0);
  return seq(a) - seq(b);
}
