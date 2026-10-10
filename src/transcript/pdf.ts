// Browser-side PDF → text lines, using pdfjs-dist (the one runtime dependency
// this app has beyond Vite: it is the only way to read a transcript PDF fully
// client-side, which the no-backend / data-never-leaves-the-browser constraint
// requires). The worker is bundled by Vite (?url) — no CDN, works offline.
//
// The LEGACY build (cross-browser review, 2026-10-10): pdf.js's modern build
// calls Promise.withResolvers unguarded, so every transcript import failed —
// blaming the file — on Safari before 17.4 (iOS 16 included), Chrome before
// 119 and Firefox before 121 (ESR 115). The legacy build reads the same text
// (same items, positions and widths on every fixture, in all three engines)
// and needs Safari 16.4, Chrome 94, Firefox 93. The Node tools
// (scripts/dev/pdf-lines-node.mts, the replay) already read with it.
// tests/browser-support.test.ts keeps both imports on it.
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { TextItem } from 'pdfjs-dist/types/src/display/api';
// Vite turns this into a relative asset URL inside dist/ at build time.
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import { pageLayout, runsFromTextItems, type ColumnHint } from './layout.ts';
import { pageScanLayer } from './scanner-layer.ts';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

/** Extract text as visual lines: text runs grouped by their y position (2-unit
 * tolerance), sorted left-to-right, with wide horizontal gaps rendered as
 * multiple spaces so column boundaries survive into the text. Pages laid out
 * in two text columns (Banner-style official transcripts) are read left
 * column first, then right — see `splitColumns` in layout.ts (2026-09-05).
 * Runs are taken in the page's reading orientation (`runsFromTextItems`), so a
 * landscape page — /Rotate 90, or content drawn sideways — reads like any
 * other (2026-09-05). */
export async function pdfToLines(data: ArrayBuffer): Promise<string[]> {
  return (await readPdf(data, false)).lines;
}

/** `pdfToLines` for an external transcript's import (Batch C answer (6), DGS
 * 2026-10-09), which also asks whether EVERY page is a scan — one image
 * covering the page, no text visible over it (src/transcript/scanner-layer.ts)
 * — so that a text layer a scanner embedded is read as OCR-grade, not as
 * printed. The operator lists are read only for a PDF with text at all, and
 * only while every page so far is a scan: a system-generated PDF stops at its
 * first page, and a scan with no text (the OCR offer's case) costs nothing. */
export async function pdfToLinesForImport(data: ArrayBuffer): Promise<{ lines: string[]; scannedTextLayer: boolean }> {
  return readPdf(data, true);
}

async function readPdf(data: ArrayBuffer, scanCheck: boolean): Promise<{ lines: string[]; scannedTextLayer: boolean }> {
  const loadingTask = pdfjs.getDocument({ data });
  const doc = await loadingTask.promise;
  const lines: string[] = [];
  // The previous page's column layout: a short last page splits by it (F4,
  // 2026-10-09).
  let hint: ColumnHint | undefined;
  let everyPageScanned = false;
  try {
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      const items = content.items.filter((it): it is TextItem => 'str' in it);
      const { runs, width } = runsFromTextItems(items, page.getViewport({ scale: 1 }));
      const read = pageLayout(runs, width, hint);
      hint = read.hint;
      lines.push(...read.lines);
      lines.push(''); // page break
    }
    if (scanCheck && doc.numPages > 0 && lines.some((l) => /\S/.test(l))) {
      everyPageScanned = true;
      for (let p = 1; p <= doc.numPages && everyPageScanned; p++) everyPageScanned = (await pageScanLayer(await doc.getPage(p), pdfjs.OPS)).imageBacked;
    }
  } finally {
    await loadingTask.destroy();
  }
  return { lines, scannedTextLayer: everyPageScanned };
}
