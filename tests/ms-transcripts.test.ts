// The DGS's 48 synthetic master's / combined transcripts (2026-09-20): one
// text fixture per transcript (the lines the app's PDF layout step produced)
// and the parse each must give. The DGS imported every PDF, logged the error
// in the file name, and the parser and the layout step were fixed until all
// 48 read cleanly; this pins that state. To add one: run the extraction
// harness described in docs/CLAUDE-HANDOFF.md ("synthetic transcript
// fixtures"), drop the lines file here and its expected block into
// expected.json.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { parseExternalTranscript } from '../src/transcript/external.ts';

const DIR = new URL('./fixtures/ms-transcripts/', import.meta.url).pathname;
const expected = JSON.parse(readFileSync(join(DIR, 'expected.json'), 'utf8')) as Record<
  string,
  { university: string | null; campusSystem: string | null; campus: string | null; degreeConferred: true | null; bachelorsConferredOn: string | null; quarterSystem: true | null; courses: string[] }
>;
const rowOf = (c: ReturnType<typeof parseExternalTranscript>['courses'][number]): string =>
  `${c.courseId} | ${c.title ?? ''} | ${c.credits ?? '?'} | ${c.grade ?? c.rawGrade ?? '?'} | ${c.season ?? ''} ${c.year ?? ''}${c.level ? ' | ' + c.level : ''}`;

describe('the 48 synthetic master’s transcripts (DGS, 2026-09-20)', () => {
  const files = readdirSync(DIR).filter((n) => n.endsWith('.json') && n !== 'expected.json').sort();
  it('every fixture has an expectation and vice versa', () => {
    assert.deepEqual(files.map((f) => f.replace(/\.json$/, '')), Object.keys(expected).sort());
  });
  for (const file of files) {
    const name = file.replace(/\.json$/, '');
    it(`${name} reads every course, the school and the degree status`, () => {
      const lines = JSON.parse(readFileSync(join(DIR, file), 'utf8')) as string[];
      const r = parseExternalTranscript(lines);
      const want = expected[name]!;
      assert.equal(r.university ?? null, want.university, 'university');
      assert.equal(r.campusSystem ?? null, want.campusSystem, 'campus system');
      assert.equal(r.campus ?? null, want.campus, 'campus');
      assert.equal(r.degreeConferred ?? null, want.degreeConferred, 'degree conferred');
      assert.equal(r.bachelorsConferredOn ?? null, want.bachelorsConferredOn, 'bachelor’s conferral');
      assert.equal(r.quarterSystem ?? null, want.quarterSystem, 'quarter system');
      assert.deepEqual(r.courses.map(rowOf), want.courses);
      // Nothing half-read: every row has credits and a usable grade.
      for (const c of r.courses) {
        assert.ok(c.credits !== undefined, `${name}: ${c.courseId} has no credits`);
        assert.ok(c.grade !== undefined || c.rawGrade !== undefined, `${name}: ${c.courseId} has no grade`);
      }
    });
  }
});
