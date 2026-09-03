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

export interface OcrLine {
  text: string;
  /** Tesseract's 0–100 confidence for the line; low values get flagged. */
  confidence: number;
}

export interface OcrProgress {
  label: string;
  /** 0–100 within the current phase. */
  percent: number;
}

/** Keep runaway uploads bounded — a transcript is not a dissertation. */
const MAX_PAGES = 10;
/** ~220 dpi for a letter-size page — OCR accuracy improves markedly up to
 * ~300 dpi; 3.0 balances that against canvas memory on old laptops. */
const RENDER_SCALE = 3.0;

/** OCR a scanned PDF into text lines with per-line confidence. Throws when the
 * browser cannot run the engine (very old browsers without WASM SIMD). */
export async function ocrPdfToLines(
  data: ArrayBuffer,
  onProgress: (p: OcrProgress) => void,
): Promise<{ lines: OcrLine[]; pagesRead: number; pagesTotal: number }> {
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
    const doc = await loadingTask.promise;
    const pagesTotal = doc.numPages;
    const pagesRead = Math.min(pagesTotal, MAX_PAGES);
    const lines: OcrLine[] = [];
    for (let p = 1; p <= pagesRead; p++) {
      onProgress({ label: `Reading page ${p} of ${pagesRead}`, percent: Math.round(((p - 1) / pagesRead) * 100) });
      const page = await doc.getPage(p);
      const viewport = page.getViewport({ scale: RENDER_SCALE });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      await page.render({ canvas, viewport }).promise;
      const { data: out } = await worker.recognize(canvas, {}, { blocks: true });
      for (const block of out.blocks ?? []) {
        for (const paragraph of block.paragraphs) {
          for (const line of paragraph.lines) {
            const text = line.text.replace(/\s+/g, ' ').trim();
            if (text !== '') lines.push({ text, confidence: line.confidence });
          }
        }
      }
      lines.push({ text: '', confidence: 100 }); // page break, like pdfToLines
    }
    return { lines, pagesRead, pagesTotal };
  } finally {
    await loadingTask.destroy();
    await worker.terminate();
  }
}
