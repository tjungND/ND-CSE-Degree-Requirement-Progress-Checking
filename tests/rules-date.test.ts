// The dated line under each page's title, and how the rules get their date:
// rules_effective_date row (override) → the snapshot-based date from
// src/data/rules-date.ts ("up-to-date as of <sheet's last change>" when the live
// sheet still matches the committed snapshot, "as of <today>" when it is newer) →
// "those in effect for <term>".
// rules_effective_date is a display-only key: missing is silent at the Parameters
// level, present is not "unknown", and the engine never reads it.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { CsvTexts } from '../src/data/assemble.ts';
import { makeParameters } from '../src/data/params.ts';
import { changedTabs, dateLiveRules, formatDateLong, sameCsvContent } from '../src/data/rules-date.ts';
import type { RulesDate, SheetIssue } from '../src/data/types.ts';
import { KNOWN_PARAMETER_KEYS } from '../src/data/types.ts';
import { rulesDateLine } from '../src/ui/handbook.ts';

function rawWith(extra: Record<string, string>): Map<string, { value: string; section: string; row: number }> {
  const raw = new Map<string, { value: string; section: string; row: number }>();
  let row = 2;
  for (const key of KNOWN_PARAMETER_KEYS) raw.set(key, { value: '1', section: '§', row: row++ });
  for (const [k, v] of Object.entries(extra)) raw.set(k, { value: v, section: '', row: row++ });
  return raw;
}

const rulesWith = (extra: Record<string, string>, rulesDate?: RulesDate) => ({
  parameters: { raw: rawWith(extra) },
  rulesDate,
});

const TODAY = '2026-11-03';

const csv = (courses: string, parameters = 'key,value\r\nx,1\r\n', categories = 'core_area\r\nos\r\n'): CsvTexts => ({
  courses,
  parameters,
  categories,
});

describe('display-only parameters', () => {
  it('a missing rules_effective_date is not an issue at all at the Parameters level', () => {
    const issues: SheetIssue[] = [];
    makeParameters(rawWith({}), issues);
    assert.equal(issues.filter((i) => i.message.includes('rules_effective_date')).length, 0);
    assert.equal(issues.filter((i) => i.severity === 'error').length, 0);
  });

  it('a present rules_effective_date is not reported as an unknown key', () => {
    const issues: SheetIssue[] = [];
    const params = makeParameters(rawWith({ rules_effective_date: '2026-09-01' }), issues);
    assert.equal(issues.filter((i) => i.message.includes('rules_effective_date')).length, 0);
    assert.equal(params.raw.get('rules_effective_date')?.value, '2026-09-01');
  });
});

describe('the dated line under the title', () => {
  it('prefers the DGS override, rendering ISO as prose and passing other text through', () => {
    assert.equal(
      rulesDateLine(rulesWith({ rules_effective_date: '2026-09-01' }, { kind: 'known', at: '2026-10-05T12:00:00Z' }), 'Fall 2026', TODAY),
      'Rules effective as of September 1, 2026.',
    );
    assert.equal(rulesDateLine(rulesWith({ rules_effective_date: 'Fall 2026' }), 'Fall 2026', TODAY), 'Rules effective as of Fall 2026.');
  });

  it("dates the rules by the sheet's last change when the rules shown are the snapshot content", () => {
    const line = rulesDateLine(rulesWith({}, { kind: 'known', at: '2026-09-01T18:30:00Z' }), 'Fall 2026', TODAY);
    assert.match(line, /^The course rules here are up-to-date as of (August 31|September 1|September 2), 2026\.$/); // local time zone
  });

  it('dates the rules "as of today" while the live sheet is newer than the snapshot (the page just read it)', () => {
    const line = rulesDateLine(rulesWith({}, { kind: 'after', at: '2026-09-01T18:30:00Z' }), 'Fall 2026', TODAY);
    assert.equal(line, 'The course rules here are up-to-date as of November 3, 2026.'); // calendar date, no time-zone shift
  });

  it('falls back to the current term when nothing is dated (blank override included)', () => {
    const fallback = 'The course rules here are those in effect for Fall 2026.';
    assert.equal(rulesDateLine(rulesWith({ rules_effective_date: '  ' }), 'Fall 2026', TODAY), fallback);
    assert.equal(rulesDateLine(rulesWith({}), 'Fall 2026', TODAY), fallback);
    assert.equal(rulesDateLine(rulesWith({}, { kind: 'known', at: 'garbage' }), 'Fall 2026', TODAY), fallback);
    assert.equal(rulesDateLine(rulesWith({}, { kind: 'after', at: '2026-09-01T18:30:00Z' }), 'Fall 2026', 'not-a-date'), fallback);
  });
});

describe('dating the live rules against the committed snapshot', () => {
  const snapshot = { syncedAt: '2026-09-01T09:17:00Z', csv: csv('course_id,title\r\nCSE 60001,Alpha\r\n') };

  it('identical content → the rules last changed when the snapshot captured them', () => {
    assert.deepEqual(dateLiveRules(csv('course_id,title\r\nCSE 60001,Alpha\r\n'), snapshot), { kind: 'known', at: snapshot.syncedAt });
  });

  it('ignores line-ending and trailing-whitespace differences (never a real edit)', () => {
    assert.equal(sameCsvContent(csv('course_id,title\nCSE 60001,Alpha\n\n'), snapshot.csv), true);
    assert.equal(sameCsvContent(csv('course_id,title\r\nCSE 60001,Alpha'), snapshot.csv), true);
  });

  it('a real edit in any tab → "after", naming the tab', () => {
    assert.deepEqual(dateLiveRules(csv('course_id,title\r\nCSE 60001,Alpha\r\nCSE 60002,Beta\r\n'), snapshot), {
      kind: 'after',
      at: snapshot.syncedAt,
    });
    assert.deepEqual(changedTabs(snapshot.csv, csv('course_id,title\r\nCSE 60001,Alpha\r\n', 'key,value\r\nx,2\r\n')), ['parameters']);
    assert.deepEqual(changedTabs(snapshot.csv, csv('x', 'y', 'z')), ['courses', 'parameters', 'categories']);
    assert.deepEqual(changedTabs(snapshot.csv, snapshot.csv), []);
  });
});

describe('date formatting', () => {
  it('formats dates for humans and rejects bad input', () => {
    assert.match(formatDateLong('2026-09-01T12:00:00Z') ?? '', /2026$/);
    assert.equal(formatDateLong('not a date'), undefined);
    assert.equal(formatDateLong(undefined), undefined);
  });
});
