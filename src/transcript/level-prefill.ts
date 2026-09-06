// "Taken as" pre-filled from the term (DGS rule, 2026-09-06). Pure logic —
// no DOM — so the rule is unit-tested on its own (tests/level-prefill.test.ts).
import type { Season, Term } from '../engine/types.ts';

export type Level = 'undergraduate' | 'graduate';
export type LevelSource = 'transcript' | 'term' | 'slot';
export type Slot = 'bachelors' | 'masters' | 'phd';

const SEASON_RANK: Record<Season, number> = { spring: 0, summer: 1, fall: 2 };
const asTerm = (r: { season: Season; year: number | undefined }): Term | undefined =>
  r.year === undefined ? undefined : { season: r.season, year: r.year };
const laterTerm = (a: Term, b: Term): Term => (a.year !== b.year ? (a.year > b.year ? a : b) : SEASON_RANK[a.season] >= SEASON_RANK[b.season] ? a : b);
const earlierTerm = (a: Term, b: Term): Term => (laterTerm(a, b) === a ? b : a);

/** "Taken as" pre-filled from the term (DGS rule, 2026-09-06): on one
 * transcript that covers both a bachelor's and a master's degree, the courses
 * of its LAST TWO YEARS — the final four fall/spring semesters, summers in
 * between included, ending with the latest term on it — were taken as a
 * graduate student, the earlier ones as an undergraduate. Applied in the
 * Master's row only — where a combined transcript goes; a Ph.D. record spans
 * more than two years by nature — when the rows span more than two years.
 * Rows the transcript itself labelled keep their label; rows without a year
 * keep the slot's level. Returns the window for the preview's explanation. */
export function prefillLevelsByTerm(
  rows: { season: Season; year: number | undefined; level: Level; levelSource: LevelSource }[],
  slot: Slot,
): { graduateFrom: Term; latest: Term } | undefined {
  if (slot !== 'masters') return undefined;
  const dated = rows.map(asTerm).filter((t): t is Term => t !== undefined);
  if (dated.length === 0) return undefined;
  const latest = dated.reduce(laterTerm);
  const withinTwoYears = (t: Term) => latest.year - t.year < 2 || (latest.year - t.year === 2 && SEASON_RANK[t.season] > SEASON_RANK[latest.season]);
  if (dated.every(withinTwoYears)) return undefined; // a two-year record: the slot's level stands
  let graduateFrom: Term | undefined;
  let changed = 0;
  for (const r of rows) {
    const t = asTerm(r);
    if (t !== undefined && withinTwoYears(t)) graduateFrom = graduateFrom ? earlierTerm(graduateFrom, t) : t;
    if (r.levelSource !== 'slot' || t === undefined) continue; // the transcript said, or no year — keep it
    r.level = withinTwoYears(t) ? 'graduate' : 'undergraduate';
    r.levelSource = 'term';
    changed += 1;
  }
  // Nothing to explain when the transcript labelled every dated row itself.
  return changed > 0 ? { graduateFrom: graduateFrom ?? latest, latest } : undefined;
}
