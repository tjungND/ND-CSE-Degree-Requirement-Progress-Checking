// Browser-side PDF → text lines, using pdfjs-dist (the one runtime dependency
// this app has beyond Vite: it is the only way to read a transcript PDF fully
// client-side, which the no-backend / data-never-leaves-the-browser constraint
// requires). The worker is bundled by Vite (?url) — no CDN, works offline.
import * as pdfjs from 'pdfjs-dist';
// Vite turns this into a relative asset URL inside dist/ at build time.
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

/** Extract text as visual lines: text runs grouped by their y position (2-unit
 * tolerance), sorted left-to-right, with wide horizontal gaps rendered as
 * multiple spaces so column boundaries survive into the text. */
export async function pdfToLines(data: ArrayBuffer): Promise<string[]> {
  const loadingTask = pdfjs.getDocument({ data });
  const doc = await loadingTask.promise;
  const lines: string[] = [];
  try {
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      interface Run { x: number; y: number; text: string; width: number }
      const runs: Run[] = [];
      for (const item of content.items) {
        if (!('str' in item) || item.str.trim() === '') continue;
        runs.push({
          x: item.transform[4] as number,
          y: item.transform[5] as number,
          text: item.str,
          width: item.width ?? 0,
        });
      }
      // Group runs into lines by y (top of page first).
      runs.sort((a, b) => b.y - a.y || a.x - b.x);
      let current: Run[] = [];
      const flush = () => {
        if (current.length === 0) return;
        current.sort((a, b) => a.x - b.x);
        let text = '';
        let cursor = -Infinity;
        for (const r of current) {
          if (text !== '') text += r.x - cursor > 8 ? '   ' : ' ';
          text += r.text;
          cursor = r.x + r.width;
        }
        lines.push(text.trim());
        current = [];
      };
      for (const r of runs) {
        if (current.length > 0 && Math.abs(current[0]!.y - r.y) > 2) flush();
        current.push(r);
      }
      flush();
      lines.push(''); // page break
    }
  } finally {
    await loadingTask.destroy();
  }
  return lines;
}
