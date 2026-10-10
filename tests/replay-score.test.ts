// The replay scorer (scripts/dev/score.mts, 2026-10-09): the metric pinned on
// tiny documents, and the promise that its `exact` IS the corpus tests' pass
// criterion — for every fixture of both corpora, scoreDocument(...).exact must
// equal what tests/public-transcripts.test.ts and tests/ms-transcripts.test.ts
// decide. If the two ever disagree, the replay's scoreboard would stop meaning
// "the test passes".
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { CELL_FIELDS, scoreDocument, splitRow, type ExpectedDocument } from '../scripts/dev/score.mts';
import { parseExternalTranscript, type ExternalCourseCandidate } from '../src/transcript/external.ts';
import { rowOf } from './helpers/row-of.ts';

const course = (courseId: string, extra: Partial<ExternalCourseCandidate> = {}): ExternalCourseCandidate => ({
  courseId,
  title: 'Operating Systems',
  credits: 3,
  grade: 'A',
  season: 'fall',
  year: 2023,
  level: 'graduate',
  ...extra,
});
const header: ExpectedDocument = { university: 'Purdue University', campusSystem: null, campus: null, degreeConferred: true, bachelorsConferredOn: null, quarterSystem: null, trimesterSystem: null, courses: [] };

describe('scoreDocument on tiny documents', () => {
  it('a perfect read is exact: every row matched, every cell right', () => {
    const courses = [course('CS 50300'), course('CS 58000', { title: 'Algorithm Design', grade: 'B+', season: 'spring', year: 2024 })];
    const s = scoreDocument({ university: 'Purdue University', degreeConferred: true, courses }, { ...header, courses: courses.map(rowOf) });
    assert.equal(s.exact, true);
    assert.deepEqual(s.diffs, []);
    assert.deepEqual(s.rows, { expectedRows: 2, parsedRows: 2, matched: 2, missing: [], extra: [] });
    for (const f of CELL_FIELDS) assert.deepEqual(s.cells[f], { right: 2, total: 2 }, f);
    assert.equal(s.header.university?.ok, true);
    assert.equal(s.header.degreeConferred?.ok, true);
    assert.equal(s.negative, false);
  });

  it('one missing row: not exact, recall loses one, the other rows still score', () => {
    const want = [course('CS 50300'), course('CS 58000', { title: 'Algorithm Design' }), course('CS 59000', { title: 'Special Topics' })];
    const got = [want[0]!, want[2]!];
    const s = scoreDocument({ university: 'Purdue University', degreeConferred: true, courses: got }, { ...header, courses: want.map(rowOf) });
    assert.equal(s.exact, false);
    assert.equal(s.rows.matched, 2);
    assert.deepEqual(s.rows.missing, [rowOf(want[1]!)]);
    assert.deepEqual(s.rows.extra, []);
    assert.deepEqual(s.cells.title, { right: 2, total: 2 });
    // The test's own positional messages: row 1 and row 2 shifted.
    assert.equal(s.diffs.length, 2);
    assert.match(s.diffs[0]!, /^row 1: /);
  });

  it('a negative with one false row: rows only, every parsed row is a false positive', () => {
    const s = scoreDocument({ university: 'Some University', courses: [course('CS 50300')] }, { negative: true, courses: [] });
    assert.equal(s.negative, true);
    assert.equal(s.exact, false);
    assert.deepEqual(s.header, {}); // header fields are not scored on a key or legend
    assert.deepEqual(s.rows, { expectedRows: 0, parsedRows: 1, matched: 0, missing: [], extra: [rowOf(course('CS 50300'))] });
    for (const f of CELL_FIELDS) assert.deepEqual(s.cells[f], { right: 0, total: 0 }, f);
    assert.equal(scoreDocument({ courses: [] }, { negative: true, courses: [] }).exact, true);
  });

  it('a retake pairs by id and year; a wrong grade costs one grade cell, not the row', () => {
    const want = [course('COMP SCI 760', { grade: undefined, rawGrade: 'BC' }), course('COMP SCI 760', { grade: 'A', year: 2024 })];
    // Parsed in the other order, the 2024 row's grade misread.
    const got = [course('comp sci 760', { grade: 'B', year: 2024 }), course('COMP SCI 760', { grade: undefined, rawGrade: 'BC' })];
    const s = scoreDocument({ university: 'Purdue University', degreeConferred: true, courses: got }, { ...header, courses: want.map(rowOf) });
    assert.equal(s.exact, false); // the order differs, so the test would fail …
    assert.equal(s.rows.matched, 2); // … but both rows were found
    assert.deepEqual(s.cells.grade, { right: 1, total: 2 });
    assert.deepEqual(s.cells.term, { right: 2, total: 2 });
    assert.deepEqual(s.cells.title, { right: 2, total: 2 });
  });

  it('code-less rows (CC15) pair by title, with the year, and never by their empty id', () => {
    const want = [course('', { title: 'Data Mining', grade: undefined, rawGrade: '88' }), course('', { title: 'Machine Learning', grade: undefined, rawGrade: '90', year: 2024 })];
    // Parsed in the other order; the Data Mining row's mark misread; a third
    // code-less row the expectation does not hold is a false row.
    const got = [course('', { title: 'machine  learning', grade: undefined, rawGrade: '90', year: 2024 }), course('', { title: 'Data Mining', grade: undefined, rawGrade: '86' }), course('', { title: 'Total', grade: undefined, rawGrade: '812' })];
    const s = scoreDocument({ university: 'Purdue University', degreeConferred: true, courses: got }, { ...header, courses: want.map(rowOf) });
    assert.equal(s.rows.matched, 2);
    assert.deepEqual(s.rows.extra, [rowOf(got[2]!)]);
    assert.deepEqual(s.cells.grade, { right: 1, total: 2 });
    assert.deepEqual(s.cells.title, { right: 1, total: 2 }); // matched ignoring case and spaces; the printed cell still differs
  });

  it('a header field is scored only when the expectation lists it', () => {
    const s = scoreDocument({ university: 'Purdue University', trimesterSystem: true, courses: [] }, { university: 'Purdue University', courses: [] });
    assert.deepEqual(Object.keys(s.header), ['university']);
    assert.equal(s.exact, true);
    const t = scoreDocument({ university: 'Purdue University', courses: [] }, { university: 'Purdue University', degreeConferred: true, courses: [] });
    assert.equal(t.exact, false);
    assert.deepEqual(t.header.degreeConferred, { got: null, want: true, ok: false });
  });

  it('splitRow reads back what rowOf prints', () => {
    const c = course('CS 50300', { credits: undefined, grade: undefined, rawGrade: '12.0', level: undefined, season: undefined });
    assert.equal(rowOf(c), 'CS 50300 | Operating Systems | ? | 12.0 |  2023');
    const r = splitRow(rowOf(c));
    assert.equal(r.key, 'CS50300');
    assert.equal(r.year, '2023');
    assert.deepEqual(r.cells, { title: 'Operating Systems', credits: '?', grade: '12.0', term: ' 2023', level: '' });
    assert.equal(splitRow('CS 1 | A | B | 3 | A | fall 2020 | graduate').cells.title, 'A | B');
  });
});

// The corpus tests' own criteria, restated here (not imported — importing a
// test file runs it), so a drift between scorer and test shows up as a failure.
const PUBLIC = new URL('./fixtures/public-transcripts/', import.meta.url).pathname;
const MS = new URL('./fixtures/ms-transcripts/', import.meta.url).pathname;
const fixtures = (dir: string) => readdirSync(dir).filter((n) => n.endsWith('.json') && n !== 'expected.json' && n !== 'sources.json').sort();
type Parsed = ReturnType<typeof parseExternalTranscript>;
const HEADER = ['university', 'campusSystem', 'campus', 'degreeConferred', 'bachelorsConferredOn', 'quarterSystem'] as const;

function publicPasses(r: Parsed, want: ExpectedDocument): boolean {
  if (!want.negative) {
    for (const f of HEADER) if ((r[f] ?? null) !== (want[f] ?? null)) return false;
    if ((r.trimesterSystem ?? null) !== (want.trimesterSystem ?? null)) return false;
  }
  const got = r.courses.map(rowOf);
  const n = Math.max(got.length, want.courses.length);
  for (let i = 0; i < n; i++) if (got[i] !== want.courses[i]) return false;
  return true;
}

function msPasses(r: Parsed, want: ExpectedDocument): boolean {
  for (const f of HEADER) if ((r[f] ?? null) !== (want[f] ?? null)) return false;
  const got = r.courses.map(rowOf);
  if (got.length !== want.courses.length || got.some((g, i) => g !== want.courses[i])) return false;
  // "Nothing half-read": every row has credits and a usable grade.
  return r.courses.every((c) => c.credits !== undefined && (c.grade !== undefined || c.rawGrade !== undefined));
}

describe('scoreDocument.exact is the corpus tests’ pass criterion', () => {
  it('for every public-transcript fixture', () => {
    const expected = JSON.parse(readFileSync(join(PUBLIC, 'expected.json'), 'utf8')) as Record<string, ExpectedDocument>;
    let exact = 0;
    for (const file of fixtures(PUBLIC)) {
      const name = file.replace(/\.json$/, '');
      const r = parseExternalTranscript(JSON.parse(readFileSync(join(PUBLIC, file), 'utf8')) as string[]);
      const s = scoreDocument(r, expected[name]!);
      assert.equal(s.exact, publicPasses(r, expected[name]!), `${name}: scorer and test disagree`);
      assert.equal(s.diffs.length === 0, s.exact, `${name}: diffs and exact disagree`);
      if (s.exact) exact += 1;
    }
    assert.ok(exact >= 100, `${exact} exact of ${fixtures(PUBLIC).length}`); // 122 on 2026-10-09; the known-failing five keep it under 127
  });

  it('for every synthetic master’s fixture', () => {
    const expected = JSON.parse(readFileSync(join(MS, 'expected.json'), 'utf8')) as Record<string, ExpectedDocument>;
    for (const file of fixtures(MS)) {
      const name = file.replace(/\.json$/, '');
      const r = parseExternalTranscript(JSON.parse(readFileSync(join(MS, file), 'utf8')) as string[]);
      const s = scoreDocument(r, expected[name]!);
      assert.equal(s.exact, msPasses(r, expected[name]!), `${name}: scorer and test disagree`);
      assert.equal(s.exact, true, `${name} reads as expected`);
    }
  });
});
