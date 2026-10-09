// The one scorer for a parsed transcript against its pinned expectation
// (2026-10-09, transcript accuracy program, Batch A). Pure: no file reads, no
// printing — scripts/dev/replay.mts feeds it every fixture and every sample
// PDF, and tests/replay-score.test.ts pins the metric.
//
// THE METRIC
//
// `exact` is the corpus test's own pass criterion, nothing looser: every
// header field the expectation lists must match, and the parsed rows, printed
// with `rowOf` (tests/helpers/row-of.ts), must equal the expected rows string
// for string, in order. One missed row makes a fixture inexact — which is why
// the rest of the score exists: to say HOW wrong a document reads, so a parser
// change can be judged on a hundred documents at once instead of pass/fail.
//
// Header fields (skipped on a negative): university, campusSystem, campus,
// degreeConferred, bachelorsConferredOn, quarterSystem, trimesterSystem — each
// scored when the expectation carries the key (the public corpus lists all
// seven, the master's corpus six), `null` meaning "nothing read".
//
// Rows are aligned the way the app itself matches a course to a sheet row:
// by `normalizeCourseId` (src/data/external.ts — case, spaces and punctuation
// ignored) plus the year when BOTH sides have one, so a retake in another year
// (two "COMP SCI 760" rows) pairs with its own year; then by id alone among
// what is still unmatched (one side lost or mis-read the year). Each expected
// row pairs with at most one parsed row, in document order. From the pairs:
//   rows.matched / missing (expected rows with no partner — recall's loss) /
//   extra (parsed rows with no partner — precision's loss: a false row, a row
//   read under the wrong id);
//   cells.<field> = { right, total } over the MATCHED pairs only, for title,
//   credits, grade, term ("season year") and level, compared as the strings
//   rowOf prints — so a wrong id costs one missing + one extra row, and a
//   right id with a wrong grade costs one grade cell.
// Recall = matched / expectedRows; precision = matched / parsedRows; both are
// computed by the replay over whatever set of documents it reports on.
//
// A `negative` expectation (a transcript key, legend, form or regulation —
// the back pages that travel inside a transcript PDF) must read NO course
// row: every parsed row is a false positive (`rows.extra`), no header field
// is scored, and `exact` is simply "no rows".
//
// `diffs` are the test's own messages (header mismatches, then positional row
// mismatches) for printing; they do not feed the numbers.
import { normalizeCourseId } from '../../src/data/external.ts';
import type { ExternalCourseCandidate } from '../../src/transcript/external.ts';
import { rowOf } from '../../tests/helpers/row-of.ts';

/** The expected.json entry of one fixture, in either corpus. */
export interface ExpectedDocument {
  university?: string | null;
  campusSystem?: string | null;
  campus?: string | null;
  degreeConferred?: true | null;
  bachelorsConferredOn?: string | null;
  quarterSystem?: true | null;
  trimesterSystem?: true | null;
  /** Rows in `rowOf` form, in the order the parser must give them. */
  courses: string[];
  /** A key / legend / form: no row may be read; header fields are not scored. */
  negative?: true;
}

/** The parse result's fields the scorer reads (a subset of ExternalParseResult). */
export interface ParsedDocument {
  university?: string;
  campusSystem?: string;
  campus?: string;
  degreeConferred?: true;
  bachelorsConferredOn?: string;
  quarterSystem?: true;
  trimesterSystem?: true;
  courses: ExternalCourseCandidate[];
}

export const HEADER_FIELDS = ['university', 'campusSystem', 'campus', 'degreeConferred', 'bachelorsConferredOn', 'quarterSystem', 'trimesterSystem'] as const;
export type HeaderField = (typeof HEADER_FIELDS)[number];
export const CELL_FIELDS = ['title', 'credits', 'grade', 'term', 'level'] as const;
export type CellField = (typeof CELL_FIELDS)[number];

export interface FieldScore {
  got: string | true | null;
  want: string | true | null;
  ok: boolean;
}
export interface CellScore {
  right: number;
  total: number;
}
export interface Score {
  negative: boolean;
  /** Empty on a negative. */
  header: Partial<Record<HeaderField, FieldScore>>;
  rows: {
    expectedRows: number;
    parsedRows: number;
    matched: number;
    missing: string[];
    extra: string[];
  };
  cells: Record<CellField, CellScore>;
  /** The corpus test's pass criterion. */
  exact: boolean;
  diffs: string[];
}

/** One row of either side, split back into the cells rowOf printed. */
export interface RowCells {
  text: string;
  id: string;
  key: string; // normalized id
  year: string | undefined;
  cells: Record<CellField, string>;
}

/** `id | title | credits | grade | season year[ | level]` → its cells. A title
 * that itself contains " | " (none does today) is re-joined: the level is
 * recognisable, the three cells before it are fixed. */
export function splitRow(text: string): RowCells {
  const parts = text.split(' | ');
  const level = parts.length >= 6 && /^(undergraduate|graduate)$/.test(parts[parts.length - 1]!) ? parts.pop()! : '';
  const term = parts.length >= 5 ? parts.pop()! : '';
  const grade = parts.length >= 4 ? parts.pop()! : '';
  const credits = parts.length >= 3 ? parts.pop()! : '';
  const id = parts.shift() ?? '';
  const title = parts.join(' | ');
  const year = /\b(\d{4})$/.exec(term)?.[1];
  return { text, id, key: normalizeCourseId(id), year, cells: { title, credits, grade, term, level } };
}

/** Pair expected rows with parsed rows: id + year first, then id alone. Each
 * row is used at most once; ties go to document order. Exported (generic over
 * the row type) for the OCR bench, which needs the pairs themselves to say
 * which parsed row was wrong (scripts/dev/ocr-bench/score.mts). */
export function alignRows<R extends RowCells>(want: R[], got: R[]): { pairs: [R, R][]; missing: R[]; extra: R[] } {
  const pairs: [R, R][] = [];
  const gotFree = got.map(() => true);
  const wantFree = want.map(() => true);
  const pass = (same: (w: R, g: R) => boolean) => {
    want.forEach((w, wi) => {
      if (!wantFree[wi]) return;
      const gi = got.findIndex((g, i) => gotFree[i] && same(w, g));
      if (gi === -1) return;
      wantFree[wi] = false;
      gotFree[gi] = false;
      pairs.push([w, got[gi]!]);
    });
  };
  pass((w, g) => w.key !== '' && w.key === g.key && w.year !== undefined && g.year !== undefined && w.year === g.year);
  pass((w, g) => w.key !== '' && w.key === g.key);
  return {
    pairs,
    missing: want.filter((_, i) => wantFree[i]),
    extra: got.filter((_, i) => gotFree[i]),
  };
}

const nullish = (v: string | true | undefined | null): string | true | null => (v === undefined ? null : v);

export function scoreDocument(parsed: ParsedDocument, expected: ExpectedDocument): Score {
  const gotRows = parsed.courses.map(rowOf);
  const wantRows = expected.negative ? [] : expected.courses;
  const diffs: string[] = [];

  const header: Partial<Record<HeaderField, FieldScore>> = {};
  if (!expected.negative) {
    for (const field of HEADER_FIELDS) {
      if (!(field in expected)) continue;
      const got = nullish(parsed[field]);
      const want = nullish(expected[field]);
      const ok = got === want;
      header[field] = { got, want, ok };
      if (!ok) diffs.push(`${field}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
    }
  }
  const n = Math.max(gotRows.length, wantRows.length);
  for (let i = 0; i < n; i++) if (gotRows[i] !== wantRows[i]) diffs.push(`row ${i}: got ${JSON.stringify(gotRows[i])}, want ${JSON.stringify(wantRows[i])}`);

  const { pairs, missing, extra } = alignRows(wantRows.map(splitRow), gotRows.map(splitRow));
  const cells = Object.fromEntries(CELL_FIELDS.map((f) => [f, { right: 0, total: 0 }])) as Record<CellField, CellScore>;
  for (const [w, g] of pairs) {
    for (const f of CELL_FIELDS) {
      cells[f].total += 1;
      if (w.cells[f] === g.cells[f]) cells[f].right += 1;
    }
  }

  const headerOk = Object.values(header).every((h) => h.ok);
  const rowsExact = gotRows.length === wantRows.length && gotRows.every((r, i) => r === wantRows[i]);
  return {
    negative: expected.negative === true,
    header,
    rows: { expectedRows: wantRows.length, parsedRows: gotRows.length, matched: pairs.length, missing: missing.map((r) => r.text), extra: extra.map((r) => r.text) },
    cells,
    exact: headerOk && rowsExact,
    diffs,
  };
}
