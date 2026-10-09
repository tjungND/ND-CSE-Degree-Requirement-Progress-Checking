// OCR page images into the app's OCR lines (text + confidence) with the
// bundled engine (public/ocr), exactly as src/transcript/ocr.ts builds them:
// the same engine parameters and the same pure stage (src/transcript/ocr-lines.ts
// — word boxes through the layout stage, OCR step 11), an empty line between
// pages. It is a thin front for the bench's runner (scripts/dev/ocr-bench/ocr-run.mjs,
// the fuller tool with every knob). For PUBLIC sample documents only — the output is
// verbatim text (scripts/sanitize-scan.py is the tool for a real scan). Render
// the pages first, e.g. with PyMuPDF at 200 dpi, and say the dpi (the layout
// stage measures gaps in PDF units = pixels × 72 / dpi); the browser renders
// at pdfjs scale 3.0 (216 dpi).
//   node --experimental-strip-types scripts/dev/ocr-lines.mjs [--dpi 200] out.json page1.png page2.png …
import { writeFileSync } from 'node:fs';
import { BASELINE_CONFIG, createOcrWorker, recognizePage } from './ocr-bench/ocr-run.mjs';

const args = process.argv.slice(2);
let dpi = 200;
const at = args.indexOf('--dpi');
if (at !== -1) {
  dpi = Number(args[at + 1]);
  args.splice(at, 2);
}
const [out, ...images] = args;
if (!out || images.length === 0 || !(dpi > 0)) {
  console.error('usage: node --experimental-strip-types scripts/dev/ocr-lines.mjs [--dpi 200] out.json page1.png [page2.png …]');
  process.exit(2);
}
const worker = await createOcrWorker(BASELINE_CONFIG);
const lines = [];
let hint;
try {
  for (const image of images) {
    const page = await recognizePage(worker, image, BASELINE_CONFIG, { dpi, hint });
    hint = page.hint;
    lines.push(...page.lines);
    lines.push({ text: '', confidence: 100 });
  }
} finally {
  await worker.terminate();
}
writeFileSync(out, JSON.stringify(lines, null, 1));
console.log(`${out}: ${lines.length} lines`);
