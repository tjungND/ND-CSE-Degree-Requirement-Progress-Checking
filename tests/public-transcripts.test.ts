// Transcript layouts researched from PUBLIC sample transcripts, transcript
// keys and templates (2026-09-26): one line-list fixture per institution under
// tests/fixtures/public-transcripts/, `expected.json` with the parse each must
// give, and `sources.json` with where the layout came from. No fixture holds a
// real person's record — every one composes course rows to the registrar's
// documented layout, with "SAMPLE STUDENT" / "000000000" where a name or id
// would print; only the SJTU and Peradeniya templates carry published rows.
// The `pdf-*` fixtures (2026-09-26, later the same day) are different: they
// are the text the app's own pdfjs layout stage reads from PUBLIC registrar
// PDFs — a sample transcript (ANU), a template (Vaasa) and thirty-two keys,
// legends, forms and regulations, the "back pages" that travel inside a real
// transcript PDF. A key must yield NO course row (`negative: true` in
// expected.json: only the courses are compared), and the two samples are
// pinned as read. `sources.json` records each PDF's URL, SHA-256 and size;
// the PDFs themselves are not committed — scripts/dev/pdf-to-lines.mts
// regenerates a fixture from a downloaded copy.
//
// KNOWN_FAILING lists the fixtures the parser cannot read yet, with the gap
// ids from the research plan (docs/DECISIONS.md, 2026-09-26). A fixture on the
// list must still FAIL — so the list stays honest — and comes off it when its
// parser change lands. Run one fixture by hand with
//   node --experimental-strip-types scripts/dev/parse-lines.mts <lines.json>
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { parseExternalTranscript } from '../src/transcript/external.ts';

const DIR = new URL('./fixtures/public-transcripts/', import.meta.url).pathname;
type Expected = {
  university: string | null;
  campusSystem: string | null;
  campus: string | null;
  degreeConferred: true | null;
  bachelorsConferredOn: string | null;
  quarterSystem: true | null;
  trimesterSystem?: true | null;
  courses: string[];
  /** A key / legend / form: the parser must find no course row; the header
   * fields are not compared (a back page names no institution reliably). */
  negative?: true;
};
const expected = JSON.parse(readFileSync(join(DIR, 'expected.json'), 'utf8')) as Record<string, Expected>;
const sources = JSON.parse(readFileSync(join(DIR, 'sources.json'), 'utf8')) as Record<string, { institution: string; url: string }>;
const KNOWN_FAILING: Record<string, string[]> = JSON.parse(readFileSync(new URL('./fixtures/public-transcripts-known-failing.json', import.meta.url).pathname, 'utf8'));

export const rowOf = (c: ReturnType<typeof parseExternalTranscript>['courses'][number]): string =>
  `${c.courseId} | ${c.title ?? ''} | ${c.credits ?? '?'} | ${c.grade ?? c.rawGrade ?? '?'} | ${c.season ?? ''} ${c.year ?? ''}${c.level ? ' | ' + c.level : ''}`;

/** Every difference between the parse and the expectation, as messages. */
function differences(name: string): string[] {
  const lines = JSON.parse(readFileSync(join(DIR, `${name}.json`), 'utf8')) as string[];
  const r = parseExternalTranscript(lines);
  const want = expected[name]!;
  const out: string[] = [];
  const field = (label: string, got: unknown, exp: unknown) => {
    if (got !== exp) out.push(`${label}: got ${JSON.stringify(got)}, want ${JSON.stringify(exp)}`);
  };
  if (!want.negative) {
    field('university', r.university ?? null, want.university);
    field('campusSystem', r.campusSystem ?? null, want.campusSystem);
    field('campus', r.campus ?? null, want.campus);
    field('degreeConferred', r.degreeConferred ?? null, want.degreeConferred);
    field('bachelorsConferredOn', r.bachelorsConferredOn ?? null, want.bachelorsConferredOn);
    field('quarterSystem', r.quarterSystem ?? null, want.quarterSystem);
    field('trimesterSystem', r.trimesterSystem ?? null, want.trimesterSystem ?? null);
  }
  const got = r.courses.map(rowOf);
  const n = Math.max(got.length, want.courses.length);
  for (let i = 0; i < n; i++) if (got[i] !== want.courses[i]) out.push(`row ${i}: got ${JSON.stringify(got[i])}, want ${JSON.stringify(want.courses[i])}`);
  return out;
}

describe('public sample transcripts (2026-09-26)', () => {
  const files = readdirSync(DIR).filter((n) => n.endsWith('.json') && n !== 'expected.json' && n !== 'sources.json').sort();
  it('every fixture has an expectation and a source, and vice versa', () => {
    const names = files.map((f) => f.replace(/\.json$/, ''));
    const byName = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
    assert.deepEqual([...names].sort(byName), Object.keys(expected).sort(byName));
    assert.deepEqual([...names].sort(byName), Object.keys(sources).sort(byName));
    for (const k of Object.keys(KNOWN_FAILING)) assert.ok(names.includes(k), `known-failing entry without a fixture: ${k}`);
  });
  for (const file of files) {
    const name = file.replace(/\.json$/, '');
    const known = KNOWN_FAILING[name];
    if (known) {
      it(`${name} still fails (waiting on ${known.join(', ')})`, () => {
        const d = differences(name);
        assert.ok(d.length > 0, `${name} now passes — remove it from public-transcripts-known-failing.json`);
      });
    } else {
      it(`${name} reads as expected (${sources[name]!.institution})`, () => {
        assert.deepEqual(differences(name), []);
      });
    }
  }
});
