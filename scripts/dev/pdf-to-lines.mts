// Run the app's own PDF extraction (pdfjs → src/transcript/layout.ts) on a PDF
// in node and print the text lines as a JSON array — the exact input the
// external-transcript parser sees in the browser. For PUBLIC sample documents
// only (registrar samples, keys, templates): the output is verbatim text, so
// never point it at a real transcript (use scripts/diagnose-transcript.mjs,
// which prints shapes only). The pdfjs loop itself lives in
// scripts/dev/pdf-lines-node.mts, shared with the replay and the diagnoser.
//   node --experimental-strip-types scripts/dev/pdf-to-lines.mts sample.pdf > lines.json
import { pdfToLinesNode } from './pdf-lines-node.mts';

const file = process.argv[2];
if (!file) { console.error('usage: pdf-to-lines.mts <sample.pdf>'); process.exit(2); }
console.log(JSON.stringify(await pdfToLinesNode(file), null, 1));
