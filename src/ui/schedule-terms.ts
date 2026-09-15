// Which semesters the course-rules page's two schedule cards stand for, and
// whether a Courses-tab row's `offered_now` / `offered_next` still describe
// them (DGS 2026-09-09; per-row since 2026-09-14).
//
// The problem this solves: the card headings come from today's date (Notre
// Dame's, settled on the loading card), but the columns are static. A DGS who
// does not update them the week a semester turns over would have the page
// print last semester's courses under this semester's name. Until 2026-09-14
// one Parameters stamp (`current_semester`) dated the whole sheet; now each
// row's own `last_offered` dates its two columns (DGS: "use the last_offered
// column and offered_now in Courses sheet to tell whether those offered_now
// courses are currently up-to-date or stale"). A row updated for this
// semester is read as written; one updated last semester has its "next"
// column read as this semester; anything older, or undated, shows nothing.
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

/** Fall/spring order: negative when `a` comes first. */
function compareTeaching(a: Term, b: Term): number {
  const seq = (t: Term) => t.year * 2 + (t.season === 'fall' ? 1 : 0);
  return seq(a) - seq(b);
}

export type RowFreshness = 'current' | 'one-behind' | 'stale' | 'undated';

export interface RowSchedule {
  /** What the row says about THIS semester's card: true/false as recorded,
   * undefined when the row says nothing usable. */
  this?: boolean;
  /** The same for the NEXT semester's card. */
  next?: boolean;
  freshness: RowFreshness;
}

/** What one row may say about the two cards, given today and the row's
 * `last_offered`. `current`: last_offered is this teaching semester or later
 * (the DGS updated the row for this schedule), so both columns are read as
 * written. `one-behind`: last_offered is the semester before, so what the row
 * recorded as NEXT is this semester and nothing is known about the one after.
 * `stale` / `undated`: nothing may be shown — the page never guesses which
 * semester a yes belongs to, exactly as it never guesses a requirement. */
export function rowSchedule(today: Term, row: { lastOffered?: Term; offeredNow?: boolean; offeredNext?: boolean }): RowSchedule {
  const thisTerm = teachingTermOf(today);
  if (row.lastOffered === undefined) return { freshness: 'undated' };
  const dated = teachingTermOf(row.lastOffered);
  const cmp = compareTeaching(dated, thisTerm);
  if (cmp >= 0) {
    return { freshness: 'current', ...(row.offeredNow !== undefined ? { this: row.offeredNow } : {}), ...(row.offeredNext !== undefined ? { next: row.offeredNext } : {}) };
  }
  if (compareTeaching(afterTeachingTerm(dated), thisTerm) === 0) {
    return { freshness: 'one-behind', ...(row.offeredNext !== undefined ? { this: row.offeredNext } : {}) };
  }
  return { freshness: 'stale' };
}

/** The two cards' semesters for a date. */
export function scheduleTerms(today: Term): { thisTerm: Term; nextTerm: Term } {
  const thisTerm = teachingTermOf(today);
  return { thisTerm, nextTerm: afterTeachingTerm(thisTerm) };
}
