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

export type RowFreshness = 'current' | 'ahead' | 'stale' | 'undated';

export interface RowSchedule {
  /** What the row says about THIS semester's card: true/false as recorded,
   * undefined when the row says nothing usable. */
  this?: boolean;
  /** The same for the NEXT semester's card. */
  next?: boolean;
  freshness: RowFreshness;
}

/** What one row may say about the two cards, given today and the row's
 * `last_offered`.
 *
 * The DGS settled what the column means on 2026-09-18: **the last term this
 * course was actually offered**. That single sentence decides this function.
 * A course running this semester was, by definition, last offered this
 * semester — so `last_offered` naming this semester is the DGS saying "these
 * two cells describe the schedule I am looking at now", and both are read as
 * written (`current`).
 *
 * Everything else says nothing about today:
 *   `stale`  — dated an EARLIER semester. The row has not been touched since,
 *              so its `offered_now` contradicts its own date and its
 *              `offered_next` names a semester nobody can identify: "next"
 *              after Spring 2026 is Fall 2026 to the page and Spring 2027 to
 *              the DGS who wrote it. Until 2026-09-18 this case was shifted
 *              forward one semester, which printed a green "Fall ’26" tag on a
 *              spring-only course (review R-1).
 *   `ahead`   — dated a LATER semester, which the DGS's definition makes
 *              impossible: a course cannot last have been offered in a term
 *              that has not happened. Reading such a row as current put its
 *              `offered_now` under this semester's card and, after the
 *              rollover, republished both columns a semester forward (R-7).
 *   `undated` — no readable `last_offered` at all.
 *
 * In all three the page shows nothing and says how many rows it left out,
 * exactly as it never guesses a requirement. */
export function rowSchedule(today: Term, row: { lastOffered?: Term; offeredNow?: boolean; offeredNext?: boolean }): RowSchedule {
  const thisTerm = teachingTermOf(today);
  if (row.lastOffered === undefined) return { freshness: 'undated' };
  const cmp = compareTeaching(teachingTermOf(row.lastOffered), thisTerm);
  if (cmp === 0) {
    return { freshness: 'current', ...(row.offeredNow !== undefined ? { this: row.offeredNow } : {}), ...(row.offeredNext !== undefined ? { next: row.offeredNext } : {}) };
  }
  return { freshness: cmp > 0 ? 'ahead' : 'stale' };
}

/** The two cards' semesters for a date. */
export function scheduleTerms(today: Term): { thisTerm: Term; nextTerm: Term } {
  const thisTerm = teachingTermOf(today);
  return { thisTerm, nextTerm: afterTeachingTerm(thisTerm) };
}
