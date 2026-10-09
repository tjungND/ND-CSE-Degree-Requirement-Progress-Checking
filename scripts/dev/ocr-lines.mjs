// OCR page images into the app's OCR lines (text + confidence) with the
// bundled engine (public/ocr), mirroring src/transcript/ocr.ts: the same
// engine parameters and the same line builder (src/transcript/ocr-lines.ts —
// inner spacing kept since OCR step 10, 2026-10-09), an empty line between
// pages. For PUBLIC sample documents only — the output is verbatim text
// (scripts/sanitize-scan.py is the tool for a real scan). Render the pages
// first, e.g. with PyMuPDF at 200 dpi; the browser renders at pdfjs scale 3.0
// (~216 dpi). The bench's scripts/dev/ocr-bench/ocr-run.mjs is the fuller tool.
//   node --experimental-strip-types scripts/dev/ocr-lines.mjs out.json page1.png page2.png …
import { createWorker, OEM } from 'tesseract.js';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { linesFromBlocks, OCR_ENGINE_PARAMETERS } from '../../src/transcript/ocr-lines.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const [out, ...images] = process.argv.slice(2);
if (!out || images.length === 0) {
  console.error('usage: node --experimental-strip-types scripts/dev/ocr-lines.mjs out.json page1.png [page2.png …]');
  process.exit(2);
}
const worker = await createWorker('eng', OEM.LSTM_ONLY, { langPath: join(root, 'public', 'ocr'), gzip: true, cacheMethod: 'none', logger: () => {} });
await worker.setParameters({ ...OCR_ENGINE_PARAMETERS });
const lines = [];
for (const image of images) {
  const { data } = await worker.recognize(image, {}, { blocks: true, text: false });
  lines.push(...linesFromBlocks(data.blocks));
  lines.push({ text: '', confidence: 100 });
}
await worker.terminate();
writeFileSync(out, JSON.stringify(lines, null, 1));
console.log(`${out}: ${lines.length} lines`);
