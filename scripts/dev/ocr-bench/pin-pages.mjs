// Pin synthetic degraded pages under tests/fixtures/ocr-scans/ (2026-10-09,
// transcript accuracy program, OCR step 9): one page per ladder level, taken
// from a bench --out folder, each with its expected lines and rows and the
// engine's `blocks` output captured ONCE (trimmed to lines + words with
// boxes and confidences), so the pure stage of OCR step 2.1 — word boxes →
// lines — can be unit-tested without running the engine. Only generator /
// synthetic seeds (placeholder names) may be pinned; the script refuses any
// other family.
//
//   node --experimental-strip-types scripts/dev/ocr-bench/pin-pages.mjs <bench-out-dir> [--dry]
//
// The picks are the table below (seed, level, page); sizes are checked
// (≤ 300 KB per page, ≤ 3 MB for the folder) and the script fails loudly
// when a pick is over. Re-run after changing degrade.py or the generator;
// the pinned files are then re-captured and the diff shows what moved.
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseExternalTranscript } from '../../../src/transcript/external.ts';
import { rowOf } from '../../../tests/helpers/row-of.ts';
import { HEADER_FIELDS } from '../score.mts';
import { pdfToLinesNode } from '../pdf-lines-node.mts';
import { ndAsParsed } from './seeds.mts';
import { createOcrWorker, recognizePage } from './ocr-run.mjs';
import { pagesOf } from './score.mts';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..', '..');
const OUT = join(root, 'tests', 'fixtures', 'ocr-scans');
const MAX_PAGE_BYTES = 300 * 1024;
const MAX_TOTAL_BYTES = 3 * 1024 * 1024;
const ALLOWED_FAMILIES = new Set(['generator-external', 'generator-nd', 'generator-scan', 'synthetic-render']);

/** One pinned page per level; all from the generator (placeholder identities). */
export const PICKS = [
  { seed: 'external-transcript', family: 'generator-external', parser: 'external', level: 'L0', page: 1 },
  { seed: 'nd-transcript', family: 'generator-nd', parser: 'nd', level: 'L1', page: 1 },
  { seed: 'banner-transcript', family: 'generator-external', parser: 'external', level: 'L2', page: 1 },
  { seed: 'uc-system-transcript', family: 'generator-external', parser: 'external', level: 'L3', page: 1 },
  { seed: 'combined-transcript', family: 'generator-external', parser: 'external', level: 'L4', page: 1 },
  { seed: 'external-transcript-scan', family: 'generator-scan', parser: 'external', level: 'L5', page: 1 },
  { seed: 'nd-undergrad-transcript', family: 'generator-nd', parser: 'nd', level: 'L6-90', page: 1 },
  { seed: 'external-transcript', family: 'generator-external', parser: 'external', level: 'L6-180', page: 1 },
  { seed: 'nd-undergrad-in-progress-transcript', family: 'generator-nd', parser: 'nd', level: 'L7', page: 1 },
];

const readJson = (f) => JSON.parse(readFileSync(f, 'utf8'));

/** The expectation of ONE page: the parser on that page's own truth lines. */
function expectedOfPage(parser, lines) {
  if (parser === 'nd') {
    const p = ndAsParsed([...lines, '']);
    return { university: p.university ?? null, courses: p.courses.map(rowOf) };
  }
  const p = parseExternalTranscript([...lines, '']);
  const e = { courses: p.courses.map(rowOf) };
  for (const f of HEADER_FIELDS) e[f] = p[f] === undefined ? null : p[f];
  if (e.courses.length === 0) e.negative = true;
  return e;
}

const benchDir = process.argv[2] ? resolve(process.argv[2]) : undefined;
const dry = process.argv.includes('--dry');
if (!benchDir || !existsSync(benchDir)) {
  console.error('usage: node --experimental-strip-types scripts/dev/ocr-bench/pin-pages.mjs <bench-out-dir> [--dry]');
  process.exit(2);
}
mkdirSync(OUT, { recursive: true });
const worker = await createOcrWorker();
const index = [];
try {
  for (const pick of PICKS) {
    if (!ALLOWED_FAMILIES.has(pick.family)) throw new Error(`${pick.seed}: family ${pick.family} may not be pinned`);
    const seedDir = join(benchDir, pick.seed);
    const manifest = readJson(join(seedDir, 'manifest.json'));
    const entry = manifest.levels[pick.level];
    if (!entry || entry.skipped) throw new Error(`${pick.seed} @ ${pick.level}: not in ${seedDir}/manifest.json — run the bench with that level first`);
    const truthAll = readJson(join(seedDir, 'truth-lines.json'));
    const pageTruth = pagesOf(truthAll)[pick.page - 1] ?? [];
    const name = `${pick.level.toLowerCase()}-${pick.seed}-p${pick.page}`;
    let src;
    let file;
    if (pick.level === 'L7') {
      src = entry.pdf; // the text layer is the point; the image inside is L2's
      file = `${name}.pdf`;
    } else {
      src = entry.pages[pick.page - 1].file;
      file = `${name}${extname(src)}`;
    }
    const bytes = statSync(src).size;
    if (bytes > MAX_PAGE_BYTES) throw new Error(`${name}: ${bytes} bytes is over the ${MAX_PAGE_BYTES}-byte limit — pick a sparser page`);
    const expected = expectedOfPage(pick.parser, pageTruth);
    const record = { name, seed: pick.seed, family: pick.family, parser: pick.parser, level: pick.level, page: pick.page, dpi: entry.dpi, file, bytes, ladderSeed: manifest.seed, params: entry.params[pick.page - 1], truthLines: pageTruth, expected, capturedWith: 'scripts/dev/ocr-bench/ocr-run.mjs recognizePage (baseline config) on the pinned file; blocks trimmed by trimBlocks' };
    let blocks;
    if (pick.level === 'L7') {
      record.textLayerLines = await pdfToLinesNode(src);
      record.capturedWith = 'scripts/dev/pdf-lines-node.mts pdfToLinesNode (the app never OCRs a PDF with a text layer)';
    } else {
      const page = await recognizePage(worker, src, undefined, { keepBlocks: true });
      blocks = page.blocks;
      record.ocrLines = page.lines;
      record.ocrSeconds = Number(page.seconds.toFixed(2));
    }
    console.log(`${name}: ${bytes} bytes, ${pageTruth.length} truth lines, ${expected.courses.length} expected row(s)${record.ocrLines ? `, OCR ${record.ocrLines.length} lines` : ''}`);
    if (!dry) {
      copyFileSync(src, join(OUT, file));
      writeFileSync(join(OUT, `${name}.expected.json`), JSON.stringify(record, null, 1) + '\n');
      if (blocks) writeFileSync(join(OUT, `${name}.blocks.json`), JSON.stringify(blocks) + '\n');
    }
    index.push(record);
  }
} finally {
  await worker.terminate();
}
if (!dry) {
  const total = readdirSync(OUT).filter((f) => f !== 'README.md').reduce((n, f) => n + statSync(join(OUT, f)).size, 0);
  console.log(`folder total ${total} bytes (${(total / 1024 / 1024).toFixed(2)} MB)`);
  if (total > MAX_TOTAL_BYTES) throw new Error(`tests/fixtures/ocr-scans is over ${MAX_TOTAL_BYTES} bytes`);
}
