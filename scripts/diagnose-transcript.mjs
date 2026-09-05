// Diagnose how a transcript PDF reads — WITHOUT revealing what is in it.
//
//   node scripts/diagnose-transcript.mjs path/to/transcript.pdf
//
// Runs the app's own extraction (pdfjs → src/transcript/layout.ts → the
// external-transcript parser) locally, exactly as the browser does, and prints
// only STRUCTURE: per-page run counts, how many runs were dropped as
// watermarks, whether a page was read as two columns, how many course rows
// the parser accepted, and every line's SHAPE with letters replaced by a/A and
// digits by 9 ("COMPSCI 501  Formal Language Theory  3.00 A" becomes
// "AAAAAAA 999  Aaaaaa Aaaaaaaa Aaaaaa  9.99 A"). No name, id, course, title,
// grade or date survives, so the output can be shared with whoever maintains
// the parser (FERPA). A tiled watermark phrase is shown verbatim only when it
// names an institution; anything else is masked too.
//
// Needs the repo's node_modules (npm install) and Node ≥ 22.18 (it imports the
// app's TypeScript directly, like `npm test` does).
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const file = process.argv[2];
if (!file) {
  console.error('usage: node scripts/diagnose-transcript.mjs path/to/transcript.pdf');
  process.exit(2);
}

const pdfjs = await import(pathToFileURL(join(root, 'node_modules', 'pdfjs-dist', 'legacy', 'build', 'pdf.mjs')).href);
const { dropWatermarks, splitColumns, runsToLines, runsFromTextItems } = await import(pathToFileURL(join(root, 'src', 'transcript', 'layout.ts')).href);
const { parseExternalTranscript } = await import(pathToFileURL(join(root, 'src', 'transcript', 'external.ts')).href);

const mask = (s) => s.replace(/[A-Z]/g, 'A').replace(/[a-z]/g, 'a').replace(/\d/g, '9');
const INSTITUTION_RE = /universit|college|institute|school|polytechnic|official|unofficial|copy/i;
const showPhrase = (s) => (INSTITUTION_RE.test(s) ? s : mask(s));

const data = new Uint8Array(readFileSync(file));
const doc = await pdfjs.getDocument({ data, useWorkerFetch: false, isEvalSupported: false, disableFontFace: true }).promise;
console.log(`pages: ${doc.numPages}`);
const allLines = [];
for (let p = 1; p <= doc.numPages; p++) {
  const page = await doc.getPage(p);
  const content = await page.getTextContent();
  // Runs in the page's reading orientation, exactly as the app takes them
  // (a sideways page is turned upright first — 2026-09-05).
  const viewport = page.getViewport({ scale: 1 });
  const { runs, width } = runsFromTextItems(content.items.filter((it) => 'str' in it), viewport);
  const turned = width !== viewport.width ? ' (page turned upright)' : '';
  const kept = dropWatermarks(runs);
  const rotated = runs.filter((r) => r.rotated).length;
  const dropped = runs.filter((r) => !r.rotated && !kept.includes(r));
  const phrases = [...new Set(dropped.map((r) => r.text.replace(/\s+/g, ' ').trim()))].map(showPhrase);
  const columns = splitColumns(kept, width).length;
  const lines = runsToLines(runs, width);
  console.log(
    `page ${p}: width ${width.toFixed(0)}${turned}, runs ${runs.length}, rotated ${rotated}, watermark runs dropped ${dropped.length}` +
      (phrases.length ? ` (${phrases.map((s) => JSON.stringify(s)).join(', ')})` : '') +
      `, read as ${columns} column${columns === 1 ? '' : 's'}, ${lines.length} lines`,
  );
  allLines.push(...lines, '');
}
await doc.destroy();

const parsed = parseExternalTranscript(allLines);
console.log(`\nhasTextLayer: ${parsed.hasTextLayer}, looksLikeNotreDame: ${parsed.looksLikeNotreDame}`);
console.log(`university guess: ${parsed.university ? (INSTITUTION_RE.test(parsed.university) ? parsed.university : mask(parsed.university)) : '(none)'}`);
console.log(`degreeConferred: ${parsed.degreeConferred ?? false}, transfer-block rows skipped: ${parsed.transferRowsSkipped ?? 0}`);
const c = parsed.courses;
console.log(
  `course rows accepted: ${c.length} — with credits ${c.filter((x) => x.credits !== undefined).length}, ` +
    `mapped grade ${c.filter((x) => x.grade).length}, raw grade ${c.filter((x) => !x.grade && x.rawGrade).length}, ` +
    `no grade ${c.filter((x) => !x.grade && !x.rawGrade).length}, with year ${c.filter((x) => x.year).length}, ` +
    `with season ${c.filter((x) => x.season).length}, distinct years ${new Set(c.map((x) => x.year)).size}`,
);
console.log(`code shapes: ${[...new Set(c.map((x) => mask(x.courseId)))].join(', ') || '(none)'}`);

console.log('\nline shapes in reading order (letters→a/A, digits→9; "|" marks a column gap):');
for (const [i, line] of allLines.entries()) {
  const shape = mask(line).replace(/\s{2,}/g, ' | ');
  console.log(`${String(i).padStart(4)} ${shape.slice(0, 120)}`);
}
