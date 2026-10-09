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

/** The resolutions the OCR path renders a page at (OCR step 12, plan step
 * 2.3, 2026-10-09): a scanned page is read at ITS OWN resolution — the pixels
 * of the image the page paints over the page's inches (`scanResolution`) —
 * floored at `OCR_BASE_DPI`, the 216 dpi of the scale 3.0 the app used from
 * 2026-09-02 (a 150-dpi office scan or a phone photo is upsampled to it, as
 * before), and capped at `OCR_TARGET_DPI`, the 300 dpi Tesseract's own
 * documentation names as the engine's sweet spot. Measured on the bench
 * (docs/OCR-BENCHMARK.md; the DECISIONS row of that date): on 300-dpi sources
 * 300 beats 216 (62 seeds: exact 36 → 40, row accuracy 66.3 → 70.0 %, false
 * rows 15 → 9, 1.18 × the time), while on the ladder's 150–200-dpi sources a
 * flat 300 lost rows (L5 58.1 → 52.2 %) — upsampling past 216 blurs the small
 * type and one misread header cell unmaps a table — so a page is never
 * rendered past its scan's resolution unless that is under 216. A page whose
 * resolution cannot be read (no image painted) is read at 216, as before. */
export const OCR_BASE_DPI = 216;
export const OCR_TARGET_DPI = 300;

/** The pixel size of an image a page paints, as pdfjs reports it. */
export interface PaintedImage {
  width: number;
  height: number;
}

/** The structural slice of a pdfjs `PDFPageProxy` that `paintedImageSizes`
 * reads: the operator list (any pdfjs build — the browser's or the legacy
 * build in node). */
export interface PdfPageLike {
  getOperatorList(): Promise<{ fnArray: number[]; argsArray: unknown[] }>;
}

/** The pdfjs operator codes `paintedImageSizes` looks for (`pdfjs.OPS`). */
export interface PdfOpsLike {
  paintImageXObject: number;
  paintImageXObjectRepeat: number;
  paintInlineImageXObject: number;
  paintImageMaskXObject: number;
}

/** Every image a page paints, with its pixel size (OCR step 12), from the
 * operator list alone: an image XObject's operator carries `[objectId,
 * width, height]` (a scan is one such image, covering the page), an inline
 * image's or an image mask's carries the image itself with its `width` and
 * `height`. The decoded image object is never asked for — pdfjs resolves
 * some only when they are drawn (a logo on a vector page never was, and a
 * reader that waited for it hung the bench) — and nothing is drawn: the
 * operator list is the one `page.render` builds anyway. */
export async function paintedImageSizes(page: PdfPageLike, ops: PdfOpsLike): Promise<PaintedImage[]> {
  const list = await page.getOperatorList();
  const sizes: PaintedImage[] = [];
  const size = (width: unknown, height: unknown): PaintedImage | undefined => (typeof width === 'number' && typeof height === 'number' && width > 0 && height > 0 ? { width, height } : undefined);
  for (let i = 0; i < list.fnArray.length; i++) {
    const fn = list.fnArray[i];
    const args = list.argsArray[i] as unknown[] | undefined;
    let s: PaintedImage | undefined;
    if (fn === ops.paintImageXObject || fn === ops.paintImageXObjectRepeat) s = size(args?.[1], args?.[2]);
    else if (fn === ops.paintInlineImageXObject || fn === ops.paintImageMaskXObject) {
      const img = args?.[0] as { width?: unknown; height?: unknown } | null | undefined;
      s = size(img?.width, img?.height);
    }
    if (s) sizes.push(s);
  }
  return sizes;
}

/** A scanned page's own resolution in dpi, from the largest image it paints
 * over the page's size in PDF units: the image's pixels per inch of page,
 * read in whichever orientation (the image as painted, or turned a quarter
 * — a sideways scan) makes its two axes agree, and then the mean of the two.
 * `undefined` when the page paints no image (a vector-drawn page has no scan
 * resolution) — the caller falls back to `OCR_BASE_DPI`. */
export function scanResolution(images: readonly PaintedImage[], pageWidthPt: number, pageHeightPt: number): number | undefined {
  if (!(pageWidthPt > 0 && pageHeightPt > 0)) return undefined;
  let largest: PaintedImage | undefined;
  for (const img of images) if (largest === undefined || img.width * img.height > largest.width * largest.height) largest = img;
  if (largest === undefined) return undefined;
  const reading = (w: number, h: number) => {
    const dx = w / (pageWidthPt / 72);
    const dy = h / (pageHeightPt / 72);
    return { dpi: (dx + dy) / 2, mismatch: Math.abs(dx - dy) / Math.max(dx, dy) };
  };
  const upright = reading(largest.width, largest.height);
  const turned = reading(largest.height, largest.width);
  const best = turned.mismatch < upright.mismatch ? turned : upright;
  return Math.round(best.dpi);
}

/** iOS Safari draws NOTHING on a canvas wider or taller than 4096 px or
 * larger than 16 megapixels (WebKit's canvas limits — the page comes out
 * blank and the engine reads an empty image, with no error anywhere), so the
 * render scale is capped to keep every canvas inside both. A Letter, A4 or
 * legal page fits at 300 dpi; a poster-sized or double-page scan does not,
 * and is read at the largest scale that fits — the preview says so. */
export const OCR_MAX_CANVAS_SIDE_PX = 4096;
export const OCR_MAX_CANVAS_AREA_PX = 16_000_000;

/** The pdfjs render scale for a page of the given size in PDF units (points,
 * 72 per inch): the scan's own resolution (`scanDpi`, from `scanResolution`;
 * `OCR_BASE_DPI` when unknown) clamped between `OCR_BASE_DPI` and
 * `OCR_TARGET_DPI`, over 72 — then lowered only as far as the canvas caps
 * require. Whole-pixel canvases: ocr.ts rounds the viewport UP, so the scale
 * is stepped down in thousandths until the rounded-up canvas fits. Pure —
 * the unit test covers Letter, A4, legal and an oversized page at each
 * resolution. */
export function ocrRenderScale(pageWidthPt: number, pageHeightPt: number, scanDpi?: number): number {
  if (!(pageWidthPt > 0 && pageHeightPt > 0)) throw new Error(`ocrRenderScale: the page size must be positive (got ${pageWidthPt}×${pageHeightPt})`);
  const dpi = Math.min(OCR_TARGET_DPI, Math.max(OCR_BASE_DPI, scanDpi !== undefined && scanDpi > 0 ? scanDpi : OCR_BASE_DPI));
  const fits = (s: number) => {
    const w = Math.ceil(pageWidthPt * s);
    const h = Math.ceil(pageHeightPt * s);
    return w <= OCR_MAX_CANVAS_SIDE_PX && h <= OCR_MAX_CANVAS_SIDE_PX && w * h <= OCR_MAX_CANVAS_AREA_PX;
  };
  const wanted = Math.min(dpi / 72, OCR_MAX_CANVAS_SIDE_PX / Math.max(pageWidthPt, pageHeightPt), Math.sqrt(OCR_MAX_CANVAS_AREA_PX / (pageWidthPt * pageHeightPt)));
  let thousandths = Math.floor(wanted * 1000);
  while (thousandths > 1 && !fits(thousandths / 1000)) thousandths -= 1;
  return thousandths / 1000;
}

/** Whether a page is read at a REDUCED resolution: below `OCR_BASE_DPI`, the
 * 216 dpi the app always used, because the canvas caps forced
 * `ocrRenderScale` down that far — an oversized scan, read worse than any
 * page was before, and the preview says so (a legal page at 293 dpi or a
 * tabloid at 241 is not reduced). */
export function ocrScaleReduced(scale: number): boolean {
  return scale * 72 < OCR_BASE_DPI;
}

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

/** The wider share two TITLE WORDS may be apart and still be one phrase (OCR
 * step 11, later the same day). In a monospace face — Courier, the face many
 * registrars print official transcripts in; the app's own scan fixture sets
 * its course rows in DejaVu Sans Mono — a word space is a whole character
 * cell, 0.8–0.9 of the line height once the letters' side bearings are added,
 * and two cells (a two-space cell gap) 1.7 or more; `WORD_SPACE_SHARE` alone
 * cut "Operating Systems" into "Operating" and "Systems" there, and a phone
 * photo's perspective stretches a proportional title's spaces the same way
 * (0.76–0.96 on the pinned L5 page). A proportional table's cell gaps measure
 * 0.75–0.96 too, but they sit between a title and a NUMBER, a one-letter
 * grade or a code — so the wider share applies only between two words that
 * are letters alone, each of at least two letters and, when all capitals, at
 * least three ("TR", "CR", "NG", "IP" and a one-letter grade never join a
 * title); the narrowest column gap on the pinned pages is 1.14. */
export const TITLE_WORD_SPACE_SHARE = 1.1;

/** A word that may be part of a title phrase under `TITLE_WORD_SPACE_SHARE`:
 * letters (with an apostrophe, a period, a hyphen or an ampersand inside), at
 * least two of them, three when they are all capitals. */
export function titleWord(text: string): boolean {
  if (!/^[A-Za-z][A-Za-z'’.&-]*$/.test(text)) return false;
  const letters = (text.match(/[A-Za-z]/g) ?? []).length;
  return letters >= (text === text.toUpperCase() ? 3 : 2);
}

/** The engine's blocks → the layout's `Run`s, in the page's reading frame
 * (OCR step 11, 2026-10-09). `scale` is pixels per PDF unit (the pdfjs render
 * scale — 3.0 in ocr.ts — or dpi / 72 for a page image), `pageHeightPx` the
 * image height, so x = x0 / scale, width = (x1 − x0) / scale and y is flipped
 * to point UP as layout.ts expects. Every run takes ITS LINE's baseline y —
 * the engine's baseline at the line's middle, so a skewed line's words still
 * sit within the 2-unit tolerance `groupLines` groups by, and two fragments
 * the engine read as separate lines on one baseline merge again. Words a
 * word space apart (`WORD_SPACE_SHARE`; two title words up to
 * `TITLE_WORD_SPACE_SHARE`, a monospace face's space) are one run; a wider
 * gap — a cell boundary, a column gap — ends the run, and the layout stage
 * measures it in the same units as a text PDF's runs (three spaces past 8
 * units). A word
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
        let previous: string | undefined; // the text of the word before this one
        for (const word of words) {
          const gapPx = word.bbox.x0 - endPx;
          const joins = current !== undefined && (gapPx <= WORD_SPACE_SHARE * heightPx || (gapPx <= TITLE_WORD_SPACE_SHARE * heightPx && previous !== undefined && titleWord(previous) && titleWord(word.text)));
          if (current !== undefined && joins) {
            current.text += ` ${word.text}`;
            current.width = Math.max(current.width, word.bbox.x1 / scale - current.x);
            current.confidence = Math.min(current.confidence, word.confidence);
          } else {
            current = { x: word.bbox.x0 / scale, y, text: word.text, width: Math.max(0, word.bbox.x1 - word.bbox.x0) / scale, confidence: word.confidence, lineConfidence: line.confidence };
            runs.push(current);
          }
          endPx = Math.max(endPx, word.bbox.x1);
          previous = word.text;
        }
      }
    }
  }
  return runs;
}

/** The orientation trial (OCR step 12, plan step 2.4): page 1 of a scan is
 * read the way it comes, and when the engine's mean word confidence in that
 * reading is under `OCR_ORIENTATION_TRIAL_SKIP_ABOVE` the page is read again
 * turned a quarter, a half and three quarters (`OCR_TRIAL_TURNS`, degrees
 * clockwise); a turned reading wins only when it beats the reading as it
 * came by `OCR_ORIENTATION_TRIAL_MARGIN` points, and the winning turn is
 * applied to every later page. A sideways or upside-down scan read nothing
 * before (0 rows at every L6 level of the bench); turned, it reads as its
 * upright self. Both figures are the measurement's (the DECISIONS row of
 * that date, 62 seeds × L2 / L5 / L6-90 / L6-180 with all four turns read):
 * an upright page scores 70 or more nine times in ten (median 89.9) and a
 * page the wrong way round never more than 54.6, so the exit at 70 keeps a
 * 15-point margin and spares nine pages in ten the three extra recognitions;
 * the right turn won by a median of 45.8 points and by 11.3 or more on
 * every page but a form that reads junk every way, while the two upright
 * pages a turn "beat" (both junk, every reading 19–25) won by 1.5 and 3.5 —
 * the margin of 5 sits between. */
export const OCR_TRIAL_TURNS = [90, 180, 270] as const;
export const OCR_ORIENTATION_TRIAL_SKIP_ABOVE = 70;
export const OCR_ORIENTATION_TRIAL_MARGIN = 5;

/** The mean of the engine's word confidences over a page's blocks (blank
 * words skipped; 0 for a page with no word): the figure the orientation
 * trial compares (OCR step 12, plan step 2.4) — a page read the right way
 * up scores far above the same page read sideways or upside down. */
export function meanWordConfidence(blocks: readonly OcrBlockLike[] | null | undefined): number {
  let sum = 0;
  let n = 0;
  for (const block of blocks ?? []) {
    for (const paragraph of block.paragraphs ?? []) {
      for (const line of paragraph.lines ?? []) {
        for (const word of line.words ?? []) {
          if (word.text.trim() === '') continue;
          sum += word.confidence;
          n += 1;
        }
      }
    }
  }
  return n === 0 ? 0 : sum / n;
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
