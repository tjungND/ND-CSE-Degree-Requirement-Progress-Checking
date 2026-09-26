// Run the app's own PDF extraction (pdfjs → src/transcript/layout.ts) on a PDF
// in node and print the text lines as a JSON array — the exact input the
// external-transcript parser sees in the browser. For PUBLIC sample documents
// only (registrar samples, keys, templates): the output is verbatim text, so
// never point it at a real transcript (use scripts/diagnose-transcript.mjs,
// which prints shapes only).
//   node --experimental-strip-types scripts/dev/pdf-to-lines.mts sample.pdf > lines.json
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runsFromTextItems, runsToLines } from '../../src/transcript/layout.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const file = process.argv[2];
if (!file) { console.error('usage: pdf-to-lines.mts <sample.pdf>'); process.exit(2); }

const pdfjs = await import(pathToFileURL(join(root, 'node_modules', 'pdfjs-dist', 'legacy', 'build', 'pdf.mjs')).href);
const data = new Uint8Array(readFileSync(file));
// pdfjs prints its warnings through console.log, which would land in the JSON;
// verbosity 0 keeps only errors. The standard-font folder stops the
// "standardFontDataUrl" complaint on PDFs that use the base-14 fonts.
const doc = await pdfjs.getDocument({
  data, useWorkerFetch: false, isEvalSupported: false, disableFontFace: true, verbosity: 0,
  standardFontDataUrl: join(root, 'node_modules', 'pdfjs-dist', 'standard_fonts') + '/',
}).promise;
const lines: string[] = [];
for (let p = 1; p <= doc.numPages; p++) {
  const page = await doc.getPage(p);
  const content = await page.getTextContent();
  const { runs, width } = runsFromTextItems(content.items.filter((it: any) => 'str' in it), page.getViewport({ scale: 1 }));
  lines.push(...runsToLines(runs, width));
  lines.push('');
}
await doc.destroy();
console.log(JSON.stringify(lines, null, 1));
