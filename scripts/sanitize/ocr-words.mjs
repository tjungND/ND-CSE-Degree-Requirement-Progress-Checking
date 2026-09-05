// OCR one page image into words with boxes, using the app's own bundled
// engine and English model (public/ocr — the same tesseract.js the browser
// runs), so sanitizing a scan needs no extra install. Used by
// scripts/sanitize-scan.py; prints JSON to stdout:
//   { width, height, words: [{ text, x, y, width, height, line, conf }] }
// where `line` numbers the OCR lines in reading order.
//
//   node scripts/sanitize/ocr-words.mjs page.png
import { createWorker } from 'tesseract.js';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const image = process.argv[2];
if (!image) {
  console.error('usage: node scripts/sanitize/ocr-words.mjs page.png');
  process.exit(2);
}

const worker = await createWorker('eng', 1, {
  langPath: join(root, 'public', 'ocr'),
  gzip: true,
  cacheMethod: 'none', // never write the model into the working directory
  logger: () => {},
});
try {
  const { data } = await worker.recognize(image, {}, { blocks: true, text: false });
  const words = [];
  let line = 0;
  for (const block of data.blocks ?? []) {
    for (const paragraph of block.paragraphs ?? []) {
      for (const ln of paragraph.lines ?? []) {
        for (const w of ln.words ?? []) {
          if (!w.text || w.text.trim() === '') continue;
          words.push({
            text: w.text,
            x: w.bbox.x0,
            y: w.bbox.y0,
            width: w.bbox.x1 - w.bbox.x0,
            height: w.bbox.y1 - w.bbox.y0,
            line,
            conf: Math.round(w.confidence),
          });
        }
        line += 1;
      }
    }
  }
  // Page size: tesseract.js does not report it; the caller knows the image size.
  process.stdout.write(JSON.stringify({ words }));
} finally {
  await worker.terminate();
}
