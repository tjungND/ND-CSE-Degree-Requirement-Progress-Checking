// Browser-side PDF → text lines, using pdfjs-dist (the one runtime dependency
// this app has beyond Vite: it is the only way to read a transcript PDF fully
// client-side, which the no-backend / data-never-leaves-the-browser constraint
// requires). The worker is bundled by Vite (?url) — no CDN, works offline.
import * as pdfjs from 'pdfjs-dist';
import type { TextItem } from 'pdfjs-dist/types/src/display/api';
// Vite turns this into a relative asset URL inside dist/ at build time.
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { runsFromTextItems, runsToLines } from './layout.ts';

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
  const loadingTask = pdfjs.getDocument({ data });
  const doc = await loadingTask.promise;
  const lines: string[] = [];
  try {
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      const items = content.items.filter((it): it is TextItem => 'str' in it);
      const { runs, width } = runsFromTextItems(items, page.getViewport({ scale: 1 }));
      lines.push(...runsToLines(runs, width));
      lines.push(''); // page break
    }
  } finally {
    await loadingTask.destroy();
  }
  return lines;
}
