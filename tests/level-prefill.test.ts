// "Taken as" pre-filled from the term (DGS rule, 2026-09-06): on a combined
// BS+MS transcript without level markers, the last two years of the record
// (the final four fall/spring semesters, summers between them included) were
// the graduate years. src/transcript/level-prefill.ts.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { prefillLevelsByTerm } from '../src/transcript/level-prefill.ts';

const row = (season: 'fall' | 'spring' | 'summer', year: number | undefined, level: 'undergraduate' | 'graduate' = 'graduate', levelSource: 'transcript' | 'term' | 'slot' = 'slot') => ({ season, year, level, levelSource });

describe('prefillLevelsByTerm', () => {
  it('a four-year record ending Spring 2024: Summer 2022 onward is graduate, before that undergraduate', () => {
    const rows = [row('fall', 2020), row('spring', 2021), row('fall', 2021), row('spring', 2022), row('summer', 2022), row('fall', 2022), row('spring', 2023), row('fall', 2023), row('spring', 2024)];
    const window = prefillLevelsByTerm(rows, 'masters', true);
    assert.deepEqual(window, { graduateFrom: { season: 'summer', year: 2022 }, latest: { season: 'spring', year: 2024 } });
    assert.deepEqual(
      rows.map((r) => `${r.season} ${r.year}:${r.level[0]}`),
      ['fall 2020:u', 'spring 2021:u', 'fall 2021:u', 'spring 2022:u', 'summer 2022:g', 'fall 2022:g', 'spring 2023:g', 'fall 2023:g', 'spring 2024:g'],
    );
    assert.ok(rows.every((r) => r.levelSource === 'term'));
  });

  it('a record ending Fall 2024: Spring 2023 onward is graduate (Fall 2022 is two full years back)', () => {
    const rows = [row('fall', 2021), row('fall', 2022), row('spring', 2023), row('fall', 2023), row('fall', 2024)];
    const window = prefillLevelsByTerm(rows, 'masters', true);
    assert.deepEqual(window?.graduateFrom, { season: 'spring', year: 2023 });
    assert.deepEqual(rows.map((r) => r.level[0]), ['u', 'u', 'g', 'g', 'g']);
  });

  it('a transcript that labels any row decides by itself: the rule is not applied, unlabelled rows keep the slot level (DGS, 2026-09-06 evening)', () => {
    const rows = [row('fall', 2020, 'undergraduate', 'transcript'), row('spring', 2021), row('fall', 2023), row('fall', undefined)];
    assert.equal(prefillLevelsByTerm(rows, 'masters', true), undefined);
    assert.deepEqual(rows.map((r) => `${r.level[0]}:${r.levelSource}`), ['u:transcript', 'g:slot', 'g:slot', 'g:slot']);
    // Every dated row labelled by the transcript → nothing for the rule to do, nothing to explain.
    const labelled = [row('fall', 2020, 'undergraduate', 'transcript'), row('fall', 2023, 'graduate', 'transcript')];
    assert.equal(prefillLevelsByTerm(labelled, 'masters', true), undefined);
    assert.deepEqual(labelled.map((r) => r.level[0]), ['u', 'g']);
  });

  it('does nothing for a record within two years, in the Undergraduate row, or in the Ph.D. row', () => {
    const short = [row('fall', 2022), row('spring', 2023), row('fall', 2023), row('spring', 2024)];
    assert.equal(prefillLevelsByTerm(short, 'masters', true), undefined);
    assert.ok(short.every((r) => r.level === 'graduate' && r.levelSource === 'slot'));
    const long = [row('fall', 2019, 'undergraduate'), row('spring', 2024, 'undergraduate')];
    assert.equal(prefillLevelsByTerm(long, 'bachelors', true), undefined);
    assert.ok(long.every((r) => r.level === 'undergraduate'));
    const phd = [row('fall', 2018), row('spring', 2024)];
    assert.equal(prefillLevelsByTerm(phd, 'phd', true), undefined);
    assert.ok(phd.every((r) => r.level === 'graduate'));
    assert.equal(prefillLevelsByTerm([], 'masters', true), undefined);
  });
});

// The rule needs positive evidence that the record covers an undergraduate
// degree (DGS bug report 2026-09-08): a USC M.S. that took three years was
// being split, its first year marked undergraduate.
describe('a Master’s that simply took longer is not a 4+1 (2026-09-08)', () => {
  const threeYearMs = () => [
    { season: 'fall' as const, year: 2021, level: 'graduate' as const, levelSource: 'slot' as const },
    { season: 'spring' as const, year: 2022, level: 'graduate' as const, levelSource: 'slot' as const },
    { season: 'fall' as const, year: 2023, level: 'graduate' as const, levelSource: 'slot' as const },
    { season: 'spring' as const, year: 2024, level: 'graduate' as const, levelSource: 'slot' as const },
  ];

  it('no bachelor’s named on the transcript: nothing is split, every row keeps the slot’s level', () => {
    const rows = threeYearMs();
    assert.equal(prefillLevelsByTerm(rows, 'masters', false), undefined);
    assert.deepEqual(
      rows.map((r) => [r.level, r.levelSource]),
      rows.map(() => ['graduate', 'slot']),
      'the three-year record is left alone',
    );
  });

  it('the same rows on a record that DOES name a bachelor’s are still split', () => {
    const rows = threeYearMs();
    const window = prefillLevelsByTerm(rows, 'masters', true);
    assert.notEqual(window, undefined);
    assert.deepEqual(rows.map((r) => r.level), ['undergraduate', 'undergraduate', 'graduate', 'graduate']);
  });
});
