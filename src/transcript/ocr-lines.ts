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
 * counts are not reliable column evidence; word-box geometry is (step 11).
 * `ocr-run.mjs --interword` still runs the variant. */
export const OCR_ENGINE_PARAMETERS: Readonly<Record<string, string>> = Object.freeze({});

/** The structural subset of tesseract.js's `Block` this file reads. */
export interface OcrBlockLike {
  paragraphs?: { lines?: { text: string; confidence: number }[] }[];
}

/** A line's text as the parser should see it: every run of whitespace (the
 * engine's line break included) collapsed to one space, both ends trimmed —
 * so an OCR line goes through the parser's position-free token scan, never
 * its column-mapped path (whose evidence the engine cannot give it; see
 * OCR_ENGINE_PARAMETERS). `ocrKeepSpaces` is the measured alternative. */
export function ocrLineText(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}

/** The variant OCR step 10 measured and did not adopt: the engine's line
 * break removed, the ends trimmed, every INNER space kept. The bench's
 * runner uses it under `--interword`; the app does not. */
export function ocrKeepSpaces(raw: string): string {
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
