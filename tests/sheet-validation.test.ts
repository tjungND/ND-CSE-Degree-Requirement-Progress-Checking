// The loader must explain sheet problems in plain English (the person who broke
// the sheet is a DGS editing a spreadsheet, not a developer), skip prose note
// rows silently, and turn missing parameters into "cannot evaluate" — never a
// silent pass.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { rulesFromCsvTexts } from '../src/data/assemble.ts';
import { parseCsv } from '../src/data/csv.ts';
import { audit } from '../src/engine/audit.ts';
import { buildRules, fixtureCsvTexts, type ScenarioFile } from './helpers.ts';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const meta = { source: 'snapshot' as const, syncedAt: '2026-08-31T00:00:00Z' };

describe('csv parser', () => {
  it('handles quoted commas, embedded newlines, escaped quotes, CRLF, BOM', () => {
    const text = '﻿a,b\r\n"x,1","line1\nline2"\r\n"he said ""hi""",z\r\n';
    assert.deepEqual(parseCsv(text), [
      ['a', 'b'],
      ['x,1', 'line1\nline2'],
      ['he said "hi"', 'z'],
    ]);
  });
});

describe('sheet validation', () => {
  it('unknown enum value → row skipped with a plain-English message', () => {
    const texts = fixtureCsvTexts();
    const courses = texts.courses.replace(
      'CSE 60641,Graduate Operating Systems,6,3,3,3,regular',
      'CSE 60641,Graduate Operating Systems,6,3,3,3,lecture',
    );
    const rules = rulesFromCsvTexts({ ...texts, courses }, meta);
    const issue = rules.issues.find((i) => i.column === 'course_type');
    assert.ok(issue, 'expected a course_type issue');
    assert.ok(
      issue.message.includes("'lecture' is not one of regular|seminar|research|independent|project"),
      issue.message,
    );
    assert.ok(issue.message.includes('CSE 60641'), 'message names the course');
    assert.equal(rules.courses.has('CSE 60641'), false, 'bad row is skipped, not guessed');
  });

  it('duplicate course_id + effective_term → reported, first row wins', () => {
    const texts = fixtureCsvTexts();
    const dup =
      'CSE 60641,Graduate Operating Systems DUPLICATE,6,3,3,3,regular,yes,yes,os,sys,fall,yes,Fall 2026,Fall 2026,yes,\n';
    const rules = rulesFromCsvTexts({ ...texts, courses: texts.courses + dup }, meta);
    assert.ok(rules.issues.some((i) => i.message.includes('same effective_term')));
    assert.equal(rules.courses.get('CSE 60641')?.length, 1);
    assert.equal(rules.courses.get('CSE 60641')?.[0]?.title, 'Graduate Operating Systems');
  });

  it('core_area / category_group not in the Categories tab → reported and ignored', () => {
    const texts = fixtureCsvTexts();
    const courses = texts.courses.replace(',yes,yes,os,sys,', ',yes,yes,kernels,sys,');
    const rules = rulesFromCsvTexts({ ...texts, courses }, meta);
    const issue = rules.issues.find((i) => i.column === 'core_area');
    assert.ok(issue);
    assert.ok(issue.message.includes("'kernels'"), issue.message);
    assert.equal(rules.courses.get('CSE 60641')?.[0]?.coreArea, undefined);
  });

  it('trailing prose note rows are skipped without issues', () => {
    const rules = rulesFromCsvTexts(fixtureCsvTexts(), meta);
    for (const i of rules.issues) {
      assert.ok(!i.message.includes('Every number the handbook states'), i.message);
      assert.ok(!i.message.includes('Core areas come from Handbook'), i.message);
    }
  });

  it('unknown Parameters key → gentle warning; missing known key → error', () => {
    const texts = fixtureCsvTexts();
    const params = texts.parameters.replace('gpa_min,3,§2.2,', 'dgs_favorite_color,blue,§0,\n');
    const rules = rulesFromCsvTexts({ ...texts, parameters: params }, meta);
    const warn = rules.issues.find((i) => i.message.includes('dgs_favorite_color'));
    assert.equal(warn?.severity, 'warning');
    const missing = rules.issues.find((i) => i.message.includes("missing the key 'gpa_min'"));
    assert.equal(missing?.severity, 'error');
  });

  it("semantic sniff: a research-titled 'regular' course draws a warning (live-sheet bug class)", () => {
    const texts = fixtureCsvTexts();
    const courses =
      texts.courses +
      'CSE 98901,Research and Dissertation II,9,1,15,9,regular,yes,yes,,,both,yes,Fall 2026,Fall 2026,no,\n';
    const rules = rulesFromCsvTexts({ ...texts, courses }, meta);
    const warn = rules.issues.find((i) => i.message.includes('CSE 98901'));
    assert.equal(warn?.severity, 'warning');
    assert.ok(warn.message.includes('sounds like research'), warn.message);
  });

  it('the two-list Categories tab parses both lists', () => {
    const rules = rulesFromCsvTexts(fixtureCsvTexts(), meta);
    assert.deepEqual(
      rules.coreAreas.map((c) => c.code),
      ['os', 'algorithms', 'architecture'],
    );
    assert.deepEqual(
      rules.categoryGroups.map((c) => c.code),
      ['alg', 'hcc', 'arch', 'dsai', 'sys'],
    );
  });
});

describe('missing parameters propagate to "cannot evaluate"', () => {
  it('missing category_min_grade → §4.4.2 row cannot be evaluated', () => {
    const sc: ScenarioFile = JSON.parse(
      readFileSync(join(here, 'scenarios', 'phd-sem4-two-groups.json'), 'utf8'),
    );
    const rules = buildRules({ parameters: { category_min_grade: null } });
    const report = audit(sc.student, rules, sc.today);
    const row = report.requirements.find((r) => r.id === 'phd.qualifier.categories');
    assert.equal(row?.status, 'cannot_evaluate');
    assert.ok(row.detail.includes('category_min_grade'), row.detail);
    assert.ok(
      rules.issues.some((i) => i.message.includes("missing the key 'category_min_grade'")),
    );
  });
});
