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
    const window = prefillLevelsByTerm(rows, 'masters');
    assert.deepEqual(window, { graduateFrom: { season: 'summer', year: 2022 }, latest: { season: 'spring', year: 2024 } });
    assert.deepEqual(
      rows.map((r) => `${r.season} ${r.year}:${r.level[0]}`),
      ['fall 2020:u', 'spring 2021:u', 'fall 2021:u', 'spring 2022:u', 'summer 2022:g', 'fall 2022:g', 'spring 2023:g', 'fall 2023:g', 'spring 2024:g'],
    );
    assert.ok(rows.every((r) => r.levelSource === 'term'));
  });

  it('a record ending Fall 2024: Spring 2023 onward is graduate (Fall 2022 is two full years back)', () => {
    const rows = [row('fall', 2021), row('fall', 2022), row('spring', 2023), row('fall', 2023), row('fall', 2024)];
    const window = prefillLevelsByTerm(rows, 'masters');
    assert.deepEqual(window?.graduateFrom, { season: 'spring', year: 2023 });
    assert.deepEqual(rows.map((r) => r.level[0]), ['u', 'u', 'g', 'g', 'g']);
  });

  it('rows the transcript labelled keep their label; rows without a year keep the slot level', () => {
    const rows = [row('fall', 2020, 'graduate', 'transcript'), row('spring', 2021), row('fall', 2023), row('fall', undefined)];
    prefillLevelsByTerm(rows, 'masters');
    assert.deepEqual(rows.map((r) => `${r.level[0]}:${r.levelSource}`), ['g:transcript', 'u:term', 'g:term', 'g:slot']);
    // Every dated row labelled by the transcript → nothing for the rule to do, nothing to explain.
    const labelled = [row('fall', 2020, 'undergraduate', 'transcript'), row('fall', 2023, 'graduate', 'transcript')];
    assert.equal(prefillLevelsByTerm(labelled, 'masters'), undefined);
  });

  it('does nothing for a record within two years, in the Undergraduate row, or in the Ph.D. row', () => {
    const short = [row('fall', 2022), row('spring', 2023), row('fall', 2023), row('spring', 2024)];
    assert.equal(prefillLevelsByTerm(short, 'masters'), undefined);
    assert.ok(short.every((r) => r.level === 'graduate' && r.levelSource === 'slot'));
    const long = [row('fall', 2019, 'undergraduate'), row('spring', 2024, 'undergraduate')];
    assert.equal(prefillLevelsByTerm(long, 'bachelors'), undefined);
    assert.ok(long.every((r) => r.level === 'undergraduate'));
    const phd = [row('fall', 2018), row('spring', 2024)];
    assert.equal(prefillLevelsByTerm(phd, 'phd'), undefined);
    assert.ok(phd.every((r) => r.level === 'graduate'));
    assert.equal(prefillLevelsByTerm([], 'masters'), undefined);
  });
});
