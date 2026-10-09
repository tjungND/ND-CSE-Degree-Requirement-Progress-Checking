// The pure stage of the opt-in OCR path (transcript accuracy program, OCR
// step 10, 2026-10-09): Tesseract's `blocks` output → the lines the parser
// reads. No DOM, no engine, no pdfjs — so the benchmark's engine runner
// (scripts/dev/ocr-bench/ocr-run.mjs) and the fixture tool
// scripts/dev/ocr-lines.mjs import THIS and build lines exactly as the
// browser does; a change here is measured by the bench before it ships
// (docs/OCR-BENCHMARK.md). ocr.ts owns the engine and the canvas.

/** One OCR line as the parser receives it. */
export interface OcrLine {
  text: string;
  /** Tesseract's 0–100 confidence for the line; low values get flagged. */
  confidence: number;
}

/** The engine parameters the app sets once the worker is up (the bench's
 * runner sets the same object, so node and the browser read alike).
 *
 * `preserve_interword_spaces`: the engine prints a wide gap between two words
 * as SEVERAL spaces — the gap measured in space widths — instead of one. A
 * transcript's column gaps then survive into the line, and the parser's cell
 * split on three or more spaces (src/transcript/external.ts) can fire for an
 * OCR line exactly as it does for a text PDF's, where layout.ts renders a wide
 * gap as three spaces. Until 2026-10-09 the engine printed one space per gap
 * and ocr.ts collapsed every run of whitespace besides, so no OCR line ever
 * reached the parser's column-mapped path — only its position-free token
 * scan. */
export const OCR_ENGINE_PARAMETERS = Object.freeze({ preserve_interword_spaces: '1' });

/** The structural subset of tesseract.js's `Block` this file reads. */
export interface OcrBlockLike {
  paragraphs?: { lines?: { text: string; confidence: number }[] }[];
}

/** A line's text as the parser should see it: the engine's line break
 * removed, both ends trimmed, and every INNER space kept — the column gaps
 * `preserve_interword_spaces` printed are the evidence the parser splits on
 * (a run of one or two spaces stays inside a cell, as in a text PDF). */
export function ocrLineText(raw: string): string {
  return raw.replace(/[\r\n]+/g, ' ').trim();
}

/** ocr.ts's walk over the engine's blocks: every non-empty line, with the
 * LINE's confidence (not a word's — a confident line with one wrong digit is
 * the parser's problem, flagged by its own checks). The page break the parser
 * expects between pages (an empty line) is pushed by the caller. */
export function linesFromBlocks(blocks: readonly OcrBlockLike[] | null | undefined): OcrLine[] {
  const lines: OcrLine[] = [];
  for (const block of blocks ?? []) {
    for (const paragraph of block.paragraphs ?? []) {
      for (const line of paragraph.lines ?? []) {
        const text = ocrLineText(line.text);
        if (text !== '') lines.push({ text, confidence: line.confidence });
      }
    }
  }
  return lines;
}
