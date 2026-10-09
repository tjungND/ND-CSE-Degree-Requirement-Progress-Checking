// The pure stage of the opt-in OCR path (transcript accuracy program, OCR
// steps 10–11, 2026-10-09): Tesseract's `blocks` output → the lines the parser
// reads. No DOM, no engine, no pdfjs — so the benchmark's engine runner
// (scripts/dev/ocr-bench/ocr-run.mjs) and the fixture tool
// scripts/dev/ocr-lines.mjs import THIS and build lines exactly as the
// browser does; a change here is measured by the bench before it ships
// (docs/OCR-BENCHMARK.md). ocr.ts owns the engine and the canvas.
//
// The pipeline (OCR step 11): render → recognize (`blocks`) → this file turns
// every WORD box into a positioned `Run` (`blocksToRuns`) → layout.ts reads
// the page exactly as it reads a text PDF's runs (`pageLayout`: watermark
// tiles dropped, a two-column page split and read column by column, a wide
// gap rendered as three spaces so the parser's cell split can fire) → the
// parser. The engine's own line text is no longer the parser's input: under
// its default page segmentation the engine prints a two-column page's two
// columns as ONE line each ("Course Level: Graduate   CS 553 Cloud Computing
// 3.00 A 12.00"), and its spacing between words is not column evidence (step
// 10). Word boxes are.
import { pageLayout, type ColumnHint, type Run } from './layout.ts';

export type { ColumnHint } from './layout.ts';

/** One OCR line as the parser receives it. */
export interface OcrLine {
  text: string;
  /** 0–100: the least confident word on the line (`OCR_LINE_CONFIDENCE`);
   * rows read from a line under the parser's floor are flagged. */
  confidence: number;
}

/** The engine parameters the app sets once the worker is up — none today.
 * The bench's runner (scripts/dev/ocr-bench/ocr-run.mjs) sets this same
 * object, so node and the browser read alike; a step that adopts a parameter
 * (PSM, user_defined_dpi — plan step 12) adds it here with its measurement.
 *
 * Measured and NOT adopted (OCR step 10, 2026-10-09): `preserve_interword_spaces`
 * = '1', which makes the engine print a wide gap between two words as several
 * spaces (the gap in space widths) so a column gap could reach the parser's
 * three-space cell split. On the bench it was neutral on `--quick`, and on the
 * same code it lost rows on scan-quality pages (Alberta L2: 23 → 21 rows, 13
 * of them mis-celled — at 150 dpi the engine prints the title–grade gap as one
 * space and only the points gap as three, so the header-mapped path reads
 * points as credits and loses the grade), added false rows on a grade key
 * (Duke L0: 3 → 5) and on sideways junk (ANU L6-90: 0 → 1). The engine's space
 * counts are not reliable column evidence; word-box geometry is (step 11,
 * `blocksToRuns` below). `ocr-run.mjs --interword` still runs the variant. */
export const OCR_ENGINE_PARAMETERS: Readonly<Record<string, string>> = Object.freeze({});

/** A pixel box as the engine reports it (image pixels, y down). */
export interface OcrBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** The structural subset of tesseract.js's `Block` this file reads: lines
 * with their confidence, box and baseline, and the words with theirs. */
export interface OcrBlockLike {
  paragraphs?: {
    lines?: {
      text: string;
      confidence: number;
      bbox?: OcrBox;
      /** The line's baseline from its left end (x0, y0) to its right end
       * (x1, y1), in image pixels; a skewed scan's slopes. */
      baseline?: OcrBox;
      words?: { text: string; confidence: number; bbox: OcrBox }[];
    }[];
  }[];
}

/** A word box as a layout run: the `Run` layout.ts reads (x, y in PDF user
 * units, y UP, width in the same units) plus what OCR knows about it — the
 * engine's confidence in the word and in the line it read it on. */
export interface OcrRun extends Run {
  /** The engine's 0–100 confidence in this word. */
  confidence: number;
  /** The engine's confidence in the line the word came from. */
  lineConfidence: number;
}

/** Which figure an emitted line's confidence is (the `confidence` option of
 * `ocrLinesFromPage`): the least of its words' own confidences, or the least
 * of the engine lines' confidences those words were read on. */
export type OcrConfidenceRule = 'min-word' | 'engine-line';

/** The rule the app ships (OCR step 11, 2026-10-09; measured on the bench's
 * flag precision / recall — the DECISIONS row of that date has the numbers):
 * a line is as sure as its least sure word, so one misread digit on an
 * otherwise clean row still flags the row. The engine's line figure averages
 * over the words and let such rows through. */
export const OCR_LINE_CONFIDENCE: OcrConfidenceRule = 'min-word';

/** How wide a gap between two words of one engine line may be, as a share
 * of the line's height (ascender to descender), for the two to be one PHRASE
 * run (OCR step 11, 2026-10-09). Measured on the pinned pages
 * (tests/fixtures/ocr-scans/): a word space is 0.2–0.5 of the line height
 * (3–5 units at 8–11 pt — the ink boxes add the letters' side bearings to the
 * space itself), a table's cell gap 0.75 or more (7.2–12 units), nothing in
 * between; 0.55 sits in the gap. A run per PHRASE, not per word, is what a
 * text PDF gives the layout stage (pdfjs emits "College of Science" as one
 * item): `dropWatermarks` keys on a run's whole text, and per-word runs made
 * "Science" — printed in two columns and a header line, twelve times at four
 * x positions on the Banner page — look like a watermark tile and vanish
 * from "Science of Programming". The phrase's width spans its words, its
 * confidence is its least confident word's, and the cell boundary stays a
 * boundary between runs for the layout's column and spacing tests. */
export const WORD_SPACE_SHARE = 0.55;

/** The engine's blocks → the layout's `Run`s, in the page's reading frame
 * (OCR step 11, 2026-10-09). `scale` is pixels per PDF unit (the pdfjs render
 * scale — 3.0 in ocr.ts — or dpi / 72 for a page image), `pageHeightPx` the
 * image height, so x = x0 / scale, width = (x1 − x0) / scale and y is flipped
 * to point UP as layout.ts expects. Every run takes ITS LINE's baseline y —
 * the engine's baseline at the line's middle, so a skewed line's words still
 * sit within the 2-unit tolerance `groupLines` groups by, and two fragments
 * the engine read as separate lines on one baseline merge again. Words a
 * word space apart (`WORD_SPACE_SHARE`) are one run; a wider gap — a cell
 * boundary, a column gap — ends the run, and the layout stage measures it in
 * the same units as a text PDF's runs (three spaces past 8 units). A word
 * with no text (the engine's spacing artefacts) is skipped; a line with no
 * baseline falls back to the bottom of its box, one with no box to its
 * words' tallest. */
export function blocksToRuns(blocks: readonly OcrBlockLike[] | null | undefined, scale: number, pageHeightPx: number): OcrRun[] {
  const runs: OcrRun[] = [];
  if (!(scale > 0)) throw new Error(`blocksToRuns: scale must be positive (got ${scale})`);
  for (const block of blocks ?? []) {
    for (const paragraph of block.paragraphs ?? []) {
      for (const line of paragraph.lines ?? []) {
        const words = (line.words ?? []).map((w) => ({ ...w, text: w.text.replace(/\s+/g, ' ').trim() })).filter((w) => w.text !== '').sort((a, b) => a.bbox.x0 - b.bbox.x0);
        if (words.length === 0) continue;
        const baselinePx = line.baseline !== undefined ? (line.baseline.y0 + line.baseline.y1) / 2 : line.bbox !== undefined ? line.bbox.y1 : Math.max(...words.map((w) => w.bbox.y1));
        const heightPx = line.bbox !== undefined ? line.bbox.y1 - line.bbox.y0 : Math.max(...words.map((w) => w.bbox.y1 - w.bbox.y0));
        const y = (pageHeightPx - baselinePx) / scale;
        let current: OcrRun | undefined;
        let endPx = 0;
        for (const word of words) {
          if (current !== undefined && word.bbox.x0 - endPx <= WORD_SPACE_SHARE * heightPx) {
            current.text += ` ${word.text}`;
            current.width = Math.max(current.width, word.bbox.x1 / scale - current.x);
            current.confidence = Math.min(current.confidence, word.confidence);
          } else {
            current = { x: word.bbox.x0 / scale, y, text: word.text, width: Math.max(0, word.bbox.x1 - word.bbox.x0) / scale, confidence: word.confidence, lineConfidence: line.confidence };
            runs.push(current);
          }
          endPx = Math.max(endPx, word.bbox.x1);
        }
      }
    }
  }
  return runs;
}

/** A page's blocks → the lines the parser reads, with the column layout the
 * page was read by (handed to the NEXT page, as src/transcript/pdf.ts hands a
 * text PDF's — a short last page may split by it; F4, 2026-10-09). The page
 * break between pages (an empty line) is the caller's, like pdfToLines. */
export function ocrPageLayout(
  blocks: readonly OcrBlockLike[] | null | undefined,
  canvasWidth: number,
  canvasHeight: number,
  scale: number,
  options: { hint?: ColumnHint; confidence?: OcrConfidenceRule } = {},
): { lines: OcrLine[]; hint?: ColumnHint } {
  const rule = options.confidence ?? OCR_LINE_CONFIDENCE;
  const runs = blocksToRuns(blocks, scale, canvasHeight);
  const read = pageLayout(runs, canvasWidth / scale, options.hint);
  const lines: OcrLine[] = [];
  for (let i = 0; i < read.lines.length; i++) {
    const text = read.lines[i]!;
    if (text === '') continue;
    lines.push({ text, confidence: lineConfidence(read.lineRuns[i] ?? [], rule) });
  }
  return { lines, ...(read.hint !== undefined ? { hint: read.hint } : {}) };
}

/** `ocrPageLayout` for a single page read on its own: just the lines. */
export function ocrLinesFromPage(blocks: readonly OcrBlockLike[] | null | undefined, canvasWidth: number, canvasHeight: number, scale: number, confidence?: OcrConfidenceRule): OcrLine[] {
  return ocrPageLayout(blocks, canvasWidth, canvasHeight, scale, confidence !== undefined ? { confidence } : {}).lines;
}

/** The confidence of an emitted line from the runs that made it. The runs
 * are the very objects `blocksToRuns` built (layout.ts never copies them),
 * so each still carries its word's figures; a line none of whose runs does —
 * only the institution line a watermark contributes, which the engine never
 * reads anyway — gets 0: a line the engine did not vouch for is flagged,
 * never trusted ("never guess"). */
function lineConfidence(runs: readonly Run[], rule: OcrConfidenceRule): number {
  let least: number | undefined;
  for (const r of runs) {
    if (!isOcrRun(r)) continue;
    const c = rule === 'min-word' ? r.confidence : r.lineConfidence;
    if (least === undefined || c < least) least = c;
  }
  return least ?? 0;
}

function isOcrRun(r: Run): r is OcrRun {
  return typeof (r as OcrRun).confidence === 'number' && typeof (r as OcrRun).lineConfidence === 'number';
}

/** A line's text as OCR steps 9–10 shipped it: the ENGINE's line, every run
 * of whitespace (its line break included) collapsed to one space, both ends
 * trimmed. Kept for the bench's `--engine-lines` knob (the step-10 builder,
 * `linesFromBlocks`), so a later A/B against the engine's own lines needs no
 * git archaeology; the app reads word boxes (`ocrPageLayout`). */
export function ocrLineText(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}

/** The variant OCR step 10 measured and did not adopt: the engine's line
 * break removed, the ends trimmed, every INNER space kept. The bench's
 * runner uses it under `--interword`; the app does not. */
export function ocrKeepSpaces(raw: string): string {
  return raw.replace(/[\r\n]+/g, ' ').trim();
}

/** The line builder OCR steps 9–10 shipped and step 11 replaced: the engine's
 * own lines in its own order, each through `ocrLineText`, with the LINE's
 * confidence. The bench runs it under `--engine-lines` (and `--interword`,
 * through `ocrKeepSpaces`); nothing in the app calls it. */
export function linesFromBlocks(blocks: readonly OcrBlockLike[] | null | undefined, lineText: (raw: string) => string = ocrLineText): OcrLine[] {
  const lines: OcrLine[] = [];
  for (const block of blocks ?? []) {
    for (const paragraph of block.paragraphs ?? []) {
      for (const line of paragraph.lines ?? []) {
        const text = lineText(line.text);
        if (text !== '') lines.push({ text, confidence: line.confidence });
      }
    }
  }
  return lines;
}
