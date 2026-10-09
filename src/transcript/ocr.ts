// Opt-in OCR for scanned transcripts (DGS decision 2026-09-02): approximate,
// ENGLISH-LANGUAGE TRANSCRIPTS ONLY, and entirely in the student's browser.
// The worker, the WASM engine and the English model ship with the app
// (public/ocr/, ~7 MB) and load only when a student explicitly chooses OCR —
// same-origin asset fetches, so nothing about the student leaves the browser
// and the app still makes no external network calls. System-generated PDFs
// remain the encouraged, exact path; this is the fallback for students whose
// university only issues paper.
import * as pdfjs from 'pdfjs-dist';
import './pdf.ts'; // configures pdfjs's bundled worker (side effect)
import { meanWordConfidence, OCR_ENGINE_PARAMETERS, OCR_ORIENTATION_TRIAL_MARGIN, OCR_ORIENTATION_TRIAL_SKIP_ABOVE, OCR_TRIAL_TURNS, ocrPageLayout, ocrRenderScale, ocrScaleReduced, paintedImageSizes, scanResolution, type ColumnHint, type OcrLine } from './ocr-lines.ts';
import type { OcrReducedPage } from './preview-layout.ts';

export type { OcrLine } from './ocr-lines.ts';
export type { OcrReducedPage } from './preview-layout.ts';

// pdf.js v6's page renderer uses Map.getOrInsertComputed / getOrInsert — 2025
// JavaScript builtins that Safari and slightly older Chrome/Firefox lack. The
// text-only ND path never renders pages, so only OCR needs these. Guarded
// polyfills, applied once.
/* eslint-disable no-extend-native */
const mapProto = Map.prototype as unknown as Record<string, unknown>;
if (typeof mapProto['getOrInsertComputed'] !== 'function') {
  mapProto['getOrInsertComputed'] = function (this: Map<unknown, unknown>, key: unknown, compute: (k: unknown) => unknown) {
    if (!this.has(key)) this.set(key, compute(key));
    return this.get(key);
  };
}
if (typeof mapProto['getOrInsert'] !== 'function') {
  mapProto['getOrInsert'] = function (this: Map<unknown, unknown>, key: unknown, value: unknown) {
    if (!this.has(key)) this.set(key, value);
    return this.get(key);
  };
}

export interface OcrProgress {
  label: string;
  /** 0–100 within the current phase. */
  percent: number;
}

/** Keep runaway uploads bounded — a transcript is not a dissertation. */
const MAX_PAGES = 10;
// The render scale is chosen PER PAGE by ocrRenderScale (ocr-lines.ts): the
// scan's own resolution — the image the page paints over the page's inches,
// read from pdfjs's operator list — between 216 dpi (the scale 3.0 the app used
// before OCR step 12, 2026-10-09) and 300 (measured better on 300-dpi scans,
// worse past the scan's own resolution; the bench's A/B is in
// docs/OCR-BENCHMARK.md), lowered only for a page so large that its canvas
// would pass iOS Safari's 4096-px / 16-megapixel limits, where nothing is drawn
// at all. The pages that had to be lowered under 216 dpi come back in
// `reducedPages` for the preview to say so.

/** What `ocrPdfToLines` returns besides the lines: how many pages were read
 * of how many, the pages read below the usual resolution, and the quarter
 * turn (degrees clockwise) the orientation trial applied — 0 when the scan
 * was the right way up. */
export interface OcrReadResult {
  lines: OcrLine[];
  pagesRead: number;
  pagesTotal: number;
  reducedPages: OcrReducedPage[];
  turned: 0 | 90 | 180 | 270;
}

/** OCR a scanned PDF into text lines with per-line confidence. Throws when the
 * browser cannot run the engine (very old browsers without WASM SIMD). */
export async function ocrPdfToLines(data: ArrayBuffer, onProgress: (p: OcrProgress) => void): Promise<OcrReadResult> {
  const { createWorker, OEM } = await import('tesseract.js');
  const asset = (name: string) => new URL(`ocr/${name}`, document.baseURI).href;
  onProgress({ label: 'Starting the text reader (first time downloads ~7 MB)', percent: 0 });
  const worker = await createWorker('eng', OEM.LSTM_ONLY, {
    workerPath: asset('worker.min.js'),
    corePath: asset('tesseract-core-simd-lstm.wasm.js'),
    langPath: new URL('ocr', document.baseURI).href,
    gzip: true,
    logger: (m: { status?: string; progress?: number }) => {
      if (m.status && m.progress !== undefined && m.progress < 1) {
        onProgress({ label: 'Starting the text reader (first time downloads ~7 MB)', percent: Math.round(m.progress * 100) });
      }
    },
  });
  const loadingTask = pdfjs.getDocument({ data });
  try {
    // The engine parameters the app has adopted (none today — ocr-lines.ts
    // records what OCR step 10 measured and rejected); set only when there are any.
    if (Object.keys(OCR_ENGINE_PARAMETERS).length > 0) await worker.setParameters({ ...OCR_ENGINE_PARAMETERS });
    const doc = await loadingTask.promise;
    const pagesTotal = doc.numPages;
    const pagesRead = Math.min(pagesTotal, MAX_PAGES);
    const lines: OcrLine[] = [];
    const reducedPages: OcrReducedPage[] = [];
    // The previous page's column layout, handed on as pdf.ts hands a text
    // PDF's (a short last page may split by it — F4, 2026-10-09).
    let hint: ColumnHint | undefined;
    // The quarter turn page 1's orientation trial chose (ocr-lines.ts,
    // OCR_TRIAL_TURNS); every later page is read turned the same way.
    let turned: OcrReadResult['turned'] = 0;
    for (let p = 1; p <= pagesRead; p++) {
      onProgress({ label: `Reading page ${p} of ${pagesRead}`, percent: Math.round(((p - 1) / pagesRead) * 100) });
      const page = await doc.getPage(p);
      const base = page.getViewport({ scale: 1 }); // the page's size in PDF units, in its own rotation
      const scanDpi = scanResolution(await paintedImageSizes(page, pdfjs.OPS), base.width, base.height);
      const scale = ocrRenderScale(base.width, base.height, scanDpi);
      if (ocrScaleReduced(scale)) reducedPages.push({ page: p, dpi: Math.round(scale * 72) });
      // The page rendered turned `turn` degrees clockwise from its own
      // rotation and recognised; the engine's mean word confidence says how
      // well it read (a page the wrong way round scores far lower).
      const readTurned = async (turn: number) => {
        const viewport = page.getViewport({ scale, rotation: (base.rotation + turn) % 360 });
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('no canvas 2d context');
        await page.render({ canvasContext: ctx, viewport }).promise;
        const { data: out } = await worker.recognize(canvas, {}, { blocks: true });
        return { blocks: out.blocks, width: canvas.width, height: canvas.height, confidence: meanWordConfidence(out.blocks) };
      };
      let best = await readTurned(turned);
      if (p === 1 && best.confidence < OCR_ORIENTATION_TRIAL_SKIP_ABOVE) {
        // The orientation trial (OCR step 12): page 1 read poorly as it came —
        // try it turned, and keep the turn that reads clearly better (by the
        // margin) for every page.
        onProgress({ label: 'Checking which way up the scan is', percent: 0 });
        const asItCame = best.confidence;
        for (const turn of OCR_TRIAL_TURNS) {
          const other = await readTurned(turn);
          if (other.confidence > best.confidence && other.confidence >= asItCame + OCR_ORIENTATION_TRIAL_MARGIN) {
            best = other;
            turned = turn;
          }
        }
      }
      // The pure stage (ocr-lines.ts): word boxes → layout.ts → the parser's
      // lines, in the canvas's pixels over the page's scale = PDF units.
      const read = ocrPageLayout(best.blocks, best.width, best.height, scale, { hint });
      hint = read.hint;
      lines.push(...read.lines);
      lines.push({ text: '', confidence: 100 }); // page break, like pdfToLines
    }
    return { lines, pagesRead, pagesTotal, reducedPages, turned };
  } finally {
    await loadingTask.destroy();
    await worker.terminate();
  }
}
