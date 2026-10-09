// The OCR benchmark's scoring (2026-10-09, transcript accuracy program, OCR
// step 9): the ONE scorer of scripts/dev/score.mts for the rows and header
// fields — so an OCR'd page and a text-layer page are judged by the same
// metric — plus what only OCR needs:
//   line CER        Levenshtein distance between the OCR line stream and the
//                   ground-truth line stream, per page (pages aligned by
//                   index; both streams whitespace-collapsed, trimmed, empty
//                   lines dropped), summed; CER = distance / truth characters
//   flag precision  of the rows the parser flagged `lowConfidence`, how many
//                   were actually wrong (an unmatched row, or a matched row
//                   with a wrong cell)
//   flag recall     of the rows actually wrong, how many were flagged
//   seconds / page  the engine's recognize time (rendering excluded)
// and the aggregate over a group of rows (one level, one family × level).
//
// "row accuracy" in the boards is rightRows / expectedRows — matched rows
// whose five cells (title, credits, grade, term, level) all agree — a
// stricter figure than "rows found" (recall = matched / expectedRows, the
// replay's number). Both are printed.
import type { ExternalCourseCandidate } from '../../../src/transcript/external.ts';
import { rowOf } from '../../../tests/helpers/row-of.ts';
import { alignRows, CELL_FIELDS, scoreDocument, splitRow, type CellField, type ExpectedDocument, type ParsedDocument, type Score } from '../score.mts';

/** Levenshtein distance, two rows of the DP table at a time (no dependency). */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prev = new Array<number>(b.length + 1);
  let cur = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    const ca = a.charCodeAt(i - 1);
    for (let j = 1; j <= b.length; j++) {
      const cost = ca === b.charCodeAt(j - 1) ? 0 : 1;
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + cost);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[b.length]!;
}

/** A page's lines as one comparable string: whitespace collapsed (the
 * baseline collapses it anyway), ends trimmed, empty lines dropped. */
export function normalizeLines(lines: string[]): string {
  return lines.map((l) => l.replace(/\s+/g, ' ').trim()).filter((l) => l !== '').join('\n');
}

/** Split a line stream at its '' page breaks. */
export function pagesOf(lines: string[]): string[][] {
  const pages: string[][] = [];
  let cur: string[] = [];
  for (const l of lines) {
    if (l === '') {
      pages.push(cur);
      cur = [];
    } else cur.push(l);
  }
  if (cur.length) pages.push(cur);
  return pages;
}

export interface CerScore {
  distance: number;
  truthChars: number;
  /** Pages compared (the shorter of the two streams); the rest of the truth counts as missed. */
  pagesCompared: number;
}

/** Line CER against the ground-truth stream, page by page. A truth page the
 * OCR never produced (MAX_PAGES, a lost page) costs its whole length. */
export function lineCer(ocrLines: string[], truthLines: string[]): CerScore {
  const got = pagesOf(ocrLines);
  const want = pagesOf(truthLines);
  let distance = 0;
  let truthChars = 0;
  const n = Math.min(got.length, want.length);
  for (let p = 0; p < want.length; p++) {
    const t = normalizeLines(want[p]!);
    truthChars += t.length;
    distance += p < n ? levenshtein(normalizeLines(got[p]!), t) : t.length;
  }
  return { distance, truthChars, pagesCompared: n };
}

export interface FlagScore {
  flagged: number;
  wrong: number;
  flaggedWrong: number;
}

/** Per parsed row: flagged (`lowConfidence`) vs actually wrong, from the same
 * alignment the scorer uses. A negative's every row is wrong. */
export function flagScore(courses: ExternalCourseCandidate[], expected: ExpectedDocument): FlagScore {
  const got = courses.map((c, index) => ({ ...splitRow(rowOf(c)), index }));
  const want = (expected.negative ? [] : expected.courses).map((t, index) => ({ ...splitRow(t), index }));
  const { pairs, extra } = alignRows(want, got);
  const wrongIndex = new Set<number>(extra.map((g) => g.index));
  for (const [w, g] of pairs) if (CELL_FIELDS.some((f) => w.cells[f] !== g.cells[f])) wrongIndex.add(g.index);
  let flagged = 0;
  let flaggedWrong = 0;
  courses.forEach((c, i) => {
    if (!c.lowConfidence) return;
    flagged += 1;
    if (wrongIndex.has(i)) flaggedWrong += 1;
  });
  return { flagged, wrong: wrongIndex.size, flaggedWrong };
}

/** Matched rows whose five cells all agree. */
export function rightRowCount(courses: ExternalCourseCandidate[], expected: ExpectedDocument): number {
  const got = courses.map((c) => splitRow(rowOf(c)));
  const want = (expected.negative ? [] : expected.courses).map(splitRow);
  const { pairs } = alignRows(want, got);
  return pairs.filter(([w, g]) => CELL_FIELDS.every((f) => w.cells[f] === g.cells[f])).length;
}

/** One results row: (seed, level, dpi, config). */
export interface BenchRow {
  seed: string;
  family: string;
  parser: 'external' | 'nd';
  level: string;
  dpi: number;
  config: string;
  pages: number;
  pagesRead: number;
  negative: boolean;
  /** Reported in its own table (synthetic renders, private seeds). */
  separate: boolean;
  known: string[] | undefined;
  exact: boolean;
  headerOk: boolean;
  expectedRows: number;
  parsedRows: number;
  matched: number;
  rightRows: number;
  missing: number;
  extra: number;
  cells: Record<CellField, { right: number; total: number }>;
  cer: CerScore;
  flags: FlagScore;
  seconds: number;
  /** The scorer's diffs (quoted rows — printed only with --only, public seeds). */
  diffs: string[];
}

export interface ScoreBenchArgs {
  seed: { id: string; family: string; parser: 'external' | 'nd'; negative: boolean; separate: boolean; known?: string[]; pages: number; truthLines: string[]; expected: ExpectedDocument };
  level: string;
  dpi: number;
  config: string;
  parsed: ParsedDocument;
  ocrLines: string[];
  seconds: number;
  pagesRead: number;
}

export function scoreBench(a: ScoreBenchArgs): BenchRow {
  const s: Score = scoreDocument(a.parsed, a.seed.expected);
  return {
    seed: a.seed.id,
    family: a.seed.family,
    parser: a.seed.parser,
    level: a.level,
    dpi: a.dpi,
    config: a.config,
    pages: a.seed.pages,
    pagesRead: a.pagesRead,
    negative: a.seed.negative,
    separate: a.seed.separate,
    known: a.seed.known,
    exact: s.exact,
    headerOk: Object.values(s.header).every((h) => h.ok),
    expectedRows: s.rows.expectedRows,
    parsedRows: s.rows.parsedRows,
    matched: s.rows.matched,
    rightRows: rightRowCount(a.parsed.courses, a.seed.expected),
    missing: s.rows.missing.length,
    extra: s.rows.extra.length,
    cells: s.cells,
    cer: lineCer(a.ocrLines, a.seed.truthLines),
    flags: flagScore(a.parsed.courses, a.seed.expected),
    seconds: a.seconds,
    diffs: s.diffs,
  };
}

export interface Aggregate {
  documents: number;
  positives: number;
  negatives: number;
  exact: number;
  expectedRows: number;
  parsedRows: number;
  matched: number;
  rightRows: number;
  /** Rows read on NEGATIVES (none may be) plus unmatched rows on positives. */
  falseRows: number;
  negativesWithFalseRows: number;
  cells: Record<CellField, { right: number; total: number }>;
  cellsPooled: { right: number; total: number };
  cer: { distance: number; truthChars: number };
  flags: FlagScore;
  seconds: number;
  pages: number;
}

const emptyCells = (): Record<CellField, { right: number; total: number }> => Object.fromEntries(CELL_FIELDS.map((f) => [f, { right: 0, total: 0 }])) as Record<CellField, { right: number; total: number }>;

export function aggregate(rows: BenchRow[]): Aggregate {
  const a: Aggregate = { documents: 0, positives: 0, negatives: 0, exact: 0, expectedRows: 0, parsedRows: 0, matched: 0, rightRows: 0, falseRows: 0, negativesWithFalseRows: 0, cells: emptyCells(), cellsPooled: { right: 0, total: 0 }, cer: { distance: 0, truthChars: 0 }, flags: { flagged: 0, wrong: 0, flaggedWrong: 0 }, seconds: 0, pages: 0 };
  for (const r of rows) {
    a.documents += 1;
    if (r.exact) a.exact += 1;
    if (r.negative) {
      a.negatives += 1;
      a.falseRows += r.parsedRows;
      if (r.parsedRows > 0) a.negativesWithFalseRows += 1;
    } else {
      a.positives += 1;
      a.expectedRows += r.expectedRows;
      a.parsedRows += r.parsedRows;
      a.matched += r.matched;
      a.rightRows += r.rightRows;
      a.falseRows += r.extra;
      for (const f of CELL_FIELDS) {
        a.cells[f].right += r.cells[f].right;
        a.cells[f].total += r.cells[f].total;
        a.cellsPooled.right += r.cells[f].right;
        a.cellsPooled.total += r.cells[f].total;
      }
    }
    a.cer.distance += r.cer.distance;
    a.cer.truthChars += r.cer.truthChars;
    a.flags.flagged += r.flags.flagged;
    a.flags.wrong += r.flags.wrong;
    a.flags.flaggedWrong += r.flags.flaggedWrong;
    a.seconds += r.seconds;
    a.pages += r.pagesRead;
  }
  return a;
}

export const pct = (n: number, d: number): string => (d === 0 ? '—' : `${((100 * n) / d).toFixed(1)}%`);

/** The figures of one aggregate, in board order. */
export function aggregateFigures(a: Aggregate): Record<string, string> {
  return {
    docs: `${a.documents} (${a.positives}+${a.negatives})`,
    exact: `${a.exact}/${a.documents}`,
    'row acc': pct(a.rightRows, a.expectedRows),
    'rows found': pct(a.matched, a.expectedRows),
    precision: pct(a.matched, a.parsedRows),
    'false rows': `${a.falseRows}${a.negatives ? ` (${a.negativesWithFalseRows}/${a.negatives} neg)` : ''}`,
    'field acc': pct(a.cellsPooled.right, a.cellsPooled.total),
    'title/cred/grade/term/level': CELL_FIELDS.map((f) => pct(a.cells[f].right, a.cells[f].total).replace('%', '')).join('/'),
    CER: pct(a.cer.distance, a.cer.truthChars),
    'flag P/R': `${pct(a.flags.flaggedWrong, a.flags.flagged)} / ${pct(a.flags.flaggedWrong, a.flags.wrong)}`,
    's/page': a.pages === 0 ? '—' : (a.seconds / a.pages).toFixed(2),
  };
}
