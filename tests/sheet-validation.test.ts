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

// The Courses tab's `offered_now` / `offered_next` columns (DGS 2026-09-09):
// is the course on the schedule this semester, and the next one? The
// course-rules page filters by them; nothing else in the app reads them.
describe('the schedule columns', () => {
  const rules = buildRules();
  const rule = (id: string) => rules.courses.get(id)?.[0];

  it('reads yes and no, and leaves a blank cell undecided', () => {
    assert.equal(rule('CSE 60111')?.offeredNow, true);
    assert.equal(rule('CSE 60111')?.offeredNext, false);
    assert.equal(rule('CSE 60641')?.offeredNow, true);
    assert.equal(rule('CSE 60641')?.offeredNext, true);
    assert.equal(rule('CSE 60321')?.offeredNow, false);
    assert.equal(rule('CSE 60321')?.offeredNext, true);
    // A blank cell is UNDEFINED, not false: the sheet has not said, which is
    // never read as "this course will not run".
    assert.equal(rule('CSE 63801')?.offeredNow, undefined);
    assert.equal(rule('CSE 63801')?.offeredNext, undefined);
  });

  it('forgives the capitals a DGS types by hand', () => {
    const texts = fixtureCsvTexts();
    const courses = texts.courses.replace('Fall 2026,yes,no,yes,§4.4.2', 'Fall 2026,YES,No,yes,§4.4.2');
    const r = rulesFromCsvTexts({ ...texts, courses }, meta);
    assert.equal(r.courses.get('CSE 60111')?.[0]?.offeredNow, true);
    assert.equal(r.courses.get('CSE 60111')?.[0]?.offeredNext, false);
    assert.equal(r.issues.filter((i) => i.column?.startsWith('offered')).length, 0);
  });

  it('a value that is neither is reported, and only that cell is ignored', () => {
    const texts = fixtureCsvTexts();
    const courses = texts.courses.replace('Fall 2026,yes,no,yes,§4.4.2', 'Fall 2026,maybe,no,yes,§4.4.2');
    const r = rulesFromCsvTexts({ ...texts, courses }, meta);
    const issue = r.issues.find((i) => i.column === 'offered_now');
    assert.ok(issue, 'expected an offered_now issue');
    assert.match(issue.message, /'maybe' is not 'yes', 'no' or blank/);
    assert.match(issue.message, /CSE 60111/);
    assert.ok(r.courses.has('CSE 60111'), 'the row itself still loads');
    assert.equal(r.courses.get('CSE 60111')?.[0]?.offeredNow, undefined);
    assert.equal(r.courses.get('CSE 60111')?.[0]?.offeredNext, false, 'the other cell is unaffected');
  });

  it('a sheet without the columns at all still loads', () => {
    const texts = fixtureCsvTexts();
    const courses = texts.courses
      .replace(',offered_now,offered_next,', ',')
      .split('\n')
      .map((line, i) => (i === 0 ? line : line.replace(/,(yes|no|),(yes|no|),(yes|no),/, ',$3,')))
      .join('\n');
    const r = rulesFromCsvTexts({ ...texts, courses }, meta);
    assert.equal(r.issues.filter((i) => i.column?.startsWith('offered')).length, 0);
    assert.equal(r.courses.get('CSE 60111')?.[0]?.offeredNow, undefined);
  });
});

// `offered_semester` names the semester the schedule columns were written for
// (DGS 2026-09-09). It takes the same code the pages print, and a typo has to
// be REPORTED — a silent "not released yet" would leave a DGS wondering why
// their schedule never appeared.
describe('the offered_semester parameter', () => {
  const withParam = (value: string) => {
    const texts = fixtureCsvTexts();
    return rulesFromCsvTexts({ ...texts, parameters: `${texts.parameters.trimEnd()}\noffered_semester,${value},,which semester offered_now describes\n` }, meta);
  };

  it('reads the code, however a person types it', () => {
    for (const typed of ['FA26', 'fa26', 'FA 26', 'Fall 2026']) {
      const r = withParam(typed);
      assert.deepEqual(r.parameters.term('offered_semester'), { season: 'fall', year: 2026 }, typed);
      assert.equal(r.issues.filter((i) => i.message.includes('offered_semester')).length, 0, typed);
    }
  });

  it('a typo is reported in plain English, naming the shape it wants', () => {
    const r = withParam('Fal 26');
    assert.equal(r.parameters.term('offered_semester'), undefined);
    const issue = r.issues.find((i) => i.message.includes('offered_semester'));
    assert.ok(issue, 'expected an issue');
    assert.match(issue.message, /'Fal 26' is not a semester code like 'FA26' or 'SP27'/);
    // And it says what the reader loses, not the engine's "cannot evaluate":
    // this key feeds a page, not a requirement.
    assert.match(issue.message, /not released yet/);
    assert.doesNotMatch(issue.message, /cannot evaluate/);
  });

  it('the row being absent is not an error — the schedule cards simply stay quiet', () => {
    const r = rulesFromCsvTexts(fixtureCsvTexts(), meta);
    assert.equal(r.parameters.term('offered_semester'), undefined);
    assert.equal(r.issues.filter((i) => i.message.includes('offered_semester')).length, 0);
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

  it("blank course_type → reported and skipped, never silently 'regular'", () => {
    const texts = fixtureCsvTexts();
    const courses = texts.courses.replace(
      'CSE 60641,Graduate Operating Systems,6,3,3,3,regular',
      'CSE 60641,Graduate Operating Systems,6,3,3,3,',
    );
    const rules = rulesFromCsvTexts({ ...texts, courses }, meta);
    const issue = rules.issues.find((i) => i.column === 'course_type' && i.message.includes('blank'));
    assert.ok(issue, 'expected a blank course_type issue');
    assert.equal(rules.courses.has('CSE 60641'), false);
  });

  it('a duplicated header column is reported and the first one wins', () => {
    const texts = fixtureCsvTexts();
    const courses = texts.courses.replace(',notes\n', ',notes,notes\n');
    const rules = rulesFromCsvTexts({ ...texts, courses }, meta);
    const issue = rules.issues.find((i) => i.message.includes("two 'notes' columns"));
    assert.ok(issue, 'expected a duplicate-header issue');
  });

  it("an unrecognized grade in student data is never counted (import tampering guard)", () => {
    const rules = rulesFromCsvTexts(fixtureCsvTexts(), meta);
    const student = {
      schemaVersion: 1, program: 'phd', entryTerm: { season: 'fall', year: 2026 }, priorMs: 'none',
      courses: [
        { courseId: 'CSE 60641', credits: 3, term: { season: 'fall', year: 2026 }, grade: 'Z', origin: 'nd' },
        { courseId: 'CSE 60111', credits: Number.NaN, term: { season: 'spring', year: 2027 }, grade: 'A', origin: 'nd' },
      ],
      milestones: {}, attestations: {},
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const report = audit(student as any, rules, '2027-01-15');
    const total = report.requirements.find((r) => r.id === 'phd.credits.total');
    assert.ok(total?.detail.includes('0 of 60'), total?.detail ?? 'no total row');
    assert.ok(report.warnings.some((w) => w.includes("grade 'Z'")));
    assert.ok(report.warnings.some((w) => w.includes('credits')));
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

describe('blank parameter values never read as zero', () => {
  it("gpa_min = '' → issue + cannot_evaluate, NOT a 0.0 floor everyone passes", () => {
    const sc: ScenarioFile = JSON.parse(
      readFileSync(join(here, 'scenarios', 'gpa-floor.json'), 'utf8'),
    );
    const rules = buildRules({ parameters: { gpa_min: '' } });
    assert.equal(rules.parameters.number('gpa_min'), undefined);
    assert.ok(rules.issues.some((i) => i.message.includes("'gpa_min'") && i.message.includes('blank')));
    const report = audit(sc.student, rules, sc.today);
    assert.equal(report.requirements.find((r) => r.id === 'shared.gpa')?.status, 'cannot_evaluate');
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
