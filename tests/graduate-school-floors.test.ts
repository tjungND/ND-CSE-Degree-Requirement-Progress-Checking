// Parameters rows that carry the Graduate School's own minimum, with no code
// constant behind them (policy review round 3, P3-ac-5b-6.1-4; DGS 2026-10-07:
// "apply the suggested handling"). The Academic Code's figures are "minimum
// standards … Individual programs may require higher standards": a row set
// looser is warned about in the diagnostics, and since 2026-10-07 (DGS:
// option (a), "hold the Graduate School's floor") the app uses the floor.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildRules } from './helpers.ts';

const looser: [string, string, RegExp][] = [
  ['ms_time_limit_years', '6', /at most 5 years \(Academic Code §6\.1\.4/],
  ['ms_total_credits_min', '27', /at least 30 credits \(Academic Code §6\.1\.1/],
  ['gpa_min', '2.8', /at least 3\.0 \(Academic Code §4\.5/],
  ['fulltime_credits_min', '6', /at least 9 credits \(Academic Code §3\.3/],
  ['summer_fulltime_credits_min', '3', /at least 6 credits \(DGS Handbook §10\.3\.2/],
  ['phd_time_limit_years', '9', /at most 8 years \(Academic Code §6\.2\.6/],
];

describe('a Graduate School floor set looser on the sheet (P3-ac-5b-6.1-4)', () => {
  it('today’s sheet: no warning', () => {
    assert.deepEqual(buildRules().issues.filter((i) => /looser than the Graduate School allows/.test(i.message)), []);
  });
  for (const [key, value, says] of looser) {
    it(`${key} = ${value}: a warning that quotes the Graduate School`, () => {
      const issues = buildRules({ parameters: { [key]: value } }).issues.filter((i) => i.message.includes(`'${key}' is ${value}, looser than the Graduate School allows`));
      assert.equal(issues.length, 1, key);
      assert.equal(issues[0]!.severity, 'warning');
      assert.match(issues[0]!.message, says);
      assert.match(issues[0]!.message, /The app uses the Graduate School’s \d+ instead/);
    });
    it(`${key} = ${value}: the app reads the Graduate School’s value`, () => {
      const floor = { ms_time_limit_years: 5, ms_total_credits_min: 30, gpa_min: 3, fulltime_credits_min: 9, summer_fulltime_credits_min: 6, phd_time_limit_years: 8 }[key];
      assert.equal(buildRules({ parameters: { [key]: value } }).parameters.number(key), floor);
    });
  }
  it('tighter is fine: a program may require more', () => {
    for (const [key, value] of [['ms_time_limit_years', '4'], ['gpa_min', '3.3'], ['ms_total_credits_min', '33'], ['fulltime_credits_min', '12'], ['summer_fulltime_credits_min', '9'], ['phd_time_limit_years', '7']] as const) {
      assert.deepEqual(buildRules({ parameters: { [key]: value } }).issues.filter((i) => /looser than the Graduate School allows/.test(i.message)), [], key);
      assert.equal(buildRules({ parameters: { [key]: value } }).parameters.number(key), Number(value), `${key}: a stricter row is followed`);
    }
  });
});
