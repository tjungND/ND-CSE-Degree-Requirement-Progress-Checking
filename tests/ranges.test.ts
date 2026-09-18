// Numbers the app refuses (interface review R1, 2026-09-18). The `min`/`max`
// on every number box used to be decorative: a GPA of 35 was stored as 35 and
// rendered "Cumulative GPA 35.00 meets the 3.0 minimum" under a green Met
// pill, a GPA of -2 rendered as a real deficiency, and a course entered at 999
// credits (in a box whose `max` is 15) put "1005 pending review/approval" on
// the 60-credit row.
//
// Three layers are covered here: the range table itself, the §2.2 row that
// reads a stored GPA, and the save-file loader — the form's own refusal is an
// e2e check (scripts/e2e), since it is a DOM event.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { audit } from '../src/engine/audit.ts';
import {
  BACHELORS_YEAR_RANGE,
  COURSE_CREDITS_RANGE,
  GPA_RANGE,
  TERM_YEAR_RANGE,
  inRange,
  inputRefusal,
  rangeRefusal,
} from '../src/engine/ranges.ts';
import type { Student } from '../src/engine/types.ts';
import { validateStudent } from '../src/ui/state.ts';
import { buildRules } from './helpers.ts';

const rules = buildRules();
const TODAY = '2027-01-10';

function studentWith(gpa: unknown): Student {
  return {
    schemaVersion: 1,
    program: 'phd',
    entryTerm: { season: 'fall', year: 2026 },
    priorMs: 'none',
    gpa: gpa as number,
    courses: [{ courseId: 'CSE 60641', credits: 3, term: { season: 'fall', year: 2026 }, grade: 'A', origin: 'nd' }],
    milestones: {},
    attestations: {},
  };
}

const gpaRow = (gpa: unknown): { status: string; detail: string } => {
  const row = audit(studentWith(gpa), rules, TODAY).requirements.find((r) => r.id === 'shared.gpa');
  assert.ok(row, 'the §2.2 GPA row is in every report');
  return row;
};

describe('the range table', () => {
  it('accepts what each box advertises and refuses what it does not', () => {
    for (const ok of [0, 2.99, 3, 4]) assert.equal(inRange(ok, GPA_RANGE), true, `GPA ${ok}`);
    for (const bad of [-2, 4.01, 35, 100]) assert.equal(inRange(bad, GPA_RANGE), false, `GPA ${bad}`);
    for (const ok of [0, 1.5, 3, 15]) assert.equal(inRange(ok, COURSE_CREDITS_RANGE), true, `credits ${ok}`);
    for (const bad of [-1, 15.5, 999]) assert.equal(inRange(bad, COURSE_CREDITS_RANGE), false, `credits ${bad}`);
    // A year has a floor and NO ceiling (DGS 2026-09-18): a student may record
    // a term as far ahead as they plan.
    for (const ok of [2000, 2026, 2040, 2099]) assert.equal(inRange(ok, TERM_YEAR_RANGE), true, `year ${ok}`);
    for (const bad of [1899, 1999]) assert.equal(inRange(bad, TERM_YEAR_RANGE), false, `year ${bad}`);
    // One rule for every year (DGS 2026-09-18): the bachelor's award year takes
    // the same floor and the same absent ceiling as a term year.
    for (const ok of [2000, 2024, 2099]) assert.equal(inRange(ok, BACHELORS_YEAR_RANGE), true, `bachelor's ${ok}`);
    for (const bad of [1970, 1999]) assert.equal(inRange(bad, BACHELORS_YEAR_RANGE), false, `bachelor's ${bad}`);
  });

  it('refuses a value that is not a finite number at all', () => {
    // A hand-edited save file can carry "four point oh"; before this check it
    // reached the §2.2 row and threw on `.toFixed()`.
    for (const bad of ['four point oh', NaN, Infinity, null, undefined, {}]) {
      assert.equal(inRange(bad, GPA_RANGE), false, String(bad));
    }
  });

  it('never rounds the refused value into the range it says is required', () => {
    // 15.5 rounded to "16" named a figure the student never typed; 4.001
    // rounded to "4.00" named one INSIDE the range the same sentence demands.
    assert.match(inputRefusal('15.5', COURSE_CREDITS_RANGE, 'added'), /must be between 0 and 15 \u2014 15.5 was not added/);
    assert.match(inputRefusal('4.001', GPA_RANGE), /must be between 0.00 and 4.00 \u2014 4.001 was not saved/);
    assert.match(inputRefusal('-0.004', GPA_RANGE), /\u2014 -0.004 was not saved/);
    // A whole number still takes the range's own precision where that is exact.
    assert.match(inputRefusal('35', GPA_RANGE), /\u2014 35.00 was not saved/);
  });

  it('names the range in the sentence, and the value as it stood', () => {
    assert.equal(
      rangeRefusal(35, GPA_RANGE),
      'A cumulative GPA must be between 0.00 and 4.00 — 35.00 was not saved. Check the figure on your transcript and enter it again.',
    );
    // Never coerced into a figure that looks official.
    assert.match(rangeRefusal('four point oh', GPA_RANGE, 'loaded'), /four point oh was not loaded/);
    assert.match(inputRefusal('999', COURSE_CREDITS_RANGE, 'added'), /must be between 0 and 15 — 999 was not added/);
    // A `type="number"` box hands back "" both for a blank and for text it
    // could not parse.
    assert.match(inputRefusal('', TERM_YEAR_RANGE), /cannot be left empty/);
    // An open-ended range says "or later", not "between X and Y".
    assert.match(inputRefusal('1899', TERM_YEAR_RANGE), /must be 2000 or later \u2014 1899 was not saved/);
  });
});

describe('§2.2 cannot be checked against a GPA off the 4.00 scale (R1)', () => {
  it('35 is not "met"', () => {
    const row = gpaRow(35);
    assert.equal(row.status, 'cannot_evaluate');
    assert.match(row.detail, /outside the 0.00\u20134.00 range/);
    assert.doesNotMatch(row.detail, /meets the/);
  });

  it('-2 is not "unmet" either — it is no answer at all', () => {
    const row = gpaRow(-2);
    assert.equal(row.status, 'cannot_evaluate');
    assert.doesNotMatch(row.detail, /below the/);
  });

  it('4.01 is refused; 4.00 is the top of the scale and passes', () => {
    assert.equal(gpaRow(4.01).status, 'cannot_evaluate');
    assert.equal(gpaRow(4).status, 'met');
  });

  it('a GPA that is not a number does not throw', () => {
    const row = gpaRow('four point oh');
    assert.equal(row.status, 'cannot_evaluate');
    assert.match(row.detail, /four point oh/);
  });

  it('the ordinary verdicts are untouched', () => {
    assert.equal(gpaRow(3).status, 'met');
    assert.equal(gpaRow(2.99).status, 'unmet');
    assert.equal(gpaRow(undefined).status, 'cannot_evaluate'); // not entered yet
  });
});

describe('a saved file cannot carry a GPA the form would refuse (R1)', () => {
  const file = (gpa: unknown): Record<string, unknown> => ({
    ...studentWith(gpa),
    gpaSource: { basis: 'transcript-graduate' },
  });

  it('drops the figure, keeps the record, and says so', () => {
    const refusals: { key: string; text: string; message: string }[] = [];
    const s = validateStudent(file(35), refusals);
    assert.equal(s.gpa, undefined);
    assert.equal(s.gpaSource, undefined); // the note about where it came from goes too
    assert.equal(s.courses.length, 1, 'the rest of the record still loads');
    assert.equal(refusals.length, 1);
    assert.equal(refusals[0]!.key, 'courses.gpa'); // the field it goes back into
    assert.match(refusals[0]!.message, /35.00 was not loaded/);
  });

  it('a GPA that is not a number is dropped the same way', () => {
    const refusals: { key: string; text: string; message: string }[] = [];
    assert.equal(validateStudent(file('four point oh'), refusals).gpa, undefined);
    assert.match(refusals[0]!.message, /four point oh/);
  });

  it('a null GPA is "not entered", not a refusal — and no longer crashes the audit', () => {
    // `null` passed every `gpa !== undefined` test downstream and threw on
    // `.toFixed()` in the §4.5 candidacy gate.
    const refusals: { key: string; text: string; message: string }[] = [];
    const s = validateStudent({ ...studentWith(null), milestones: { candidacyPassed: '2027-05-01' } }, refusals);
    assert.equal(s.gpa, undefined);
    assert.deepEqual(refusals, []);
    assert.doesNotThrow(() => audit(s, rules, TODAY));
  });

  it('a course carrying more than 15 credits keeps its place with 0 credits, and is reported', () => {
    // 15 is the most any single course may be worth (DGS 2026-09-18), so a
    // record written by the pre-R1 build — the review entered 999 credits on
    // the live build — is corrected on load instead of counting 999.
    const refusals: { key: string; text: string; message: string }[] = [];
    const s = validateStudent(
      {
        ...studentWith(3.4),
        courses: [
          { courseId: 'CSE 60772', credits: 999, term: { season: 'fall', year: 2026 }, grade: 'A', origin: 'nd' },
          { courseId: 'CSE 60641', credits: 3, term: { season: 'fall', year: 2026 }, grade: 'A', origin: 'nd' },
        ],
      },
      refusals,
    );
    assert.equal(s.courses.length, 2, 'the course keeps its place on the list');
    assert.equal(s.courses[0]!.credits, 0);
    assert.equal(s.courses[1]!.credits, 3, 'a course inside the bound is untouched');
    assert.equal(refusals.length, 1);
    assert.match(refusals[0]!.message, /CSE 60772: The credits for one course must be between 0 and 15 \u2014 999 was not loaded/);
    // …and the 60-credit row counts 3, not 1002.
    const total = audit(s, rules, TODAY).requirements.find((r) => r.id === 'phd.credits.total');
    assert.match(total!.detail, /3 of 60/);
  });

  it('a GPA inside the range is loaded untouched, with nothing to report', () => {
    const refusals: { key: string; text: string; message: string }[] = [];
    const s = validateStudent(file(3.42), refusals);
    assert.equal(s.gpa, 3.42);
    assert.deepEqual(refusals, []);
  });
});
