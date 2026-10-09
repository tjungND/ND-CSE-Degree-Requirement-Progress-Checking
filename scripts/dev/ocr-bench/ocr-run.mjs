// The OCR benchmark's engine runner (2026-10-09, transcript accuracy program,
// OCR step 9), grown from scripts/dev/ocr-lines.mjs: the SAME tesseract.js,
// the SAME bundled core and English model (public/ocr, cacheMethod 'none' so
// nothing is written into the tree), run in node on a page image or on an
// image-only PDF rendered the way the browser renders it. With no knob set it
// reproduces src/transcript/ocr.ts as SHIPPED — that is the bench's `baseline`
// config, and results.json's `meta.config` records its knob values, so a run
// from before an OCR step and one after are told apart by those values:
//
//   ocr.ts     RENDER_SCALE = 3.0            → --scale 3 (pdfjs viewport scale; 216 dpi)
//   ocr.ts     MAX_PAGES = 10                → --max-pages 10
//   ocr.ts     createWorker('eng', OEM.LSTM_ONLY, …), then worker.setParameters(
//              OCR_ENGINE_PARAMETERS) when that set is non-empty — it is empty today, so
//              the engine keeps its defaults: PSM 6 (SINGLE_BLOCK), no user_defined_dpi,
//              preserve_interword_spaces 0, tessedit_do_invert on
//   ocr.ts     worker.recognize(canvas, {}, { blocks: true }) — no rotateAuto, no rectangle
//   ocr-lines.ts  ocrPageLayout: the engine's word boxes → layout runs (scale = pixels per
//              PDF unit: the render scale for a PDF, dpi / 72 for a page image) → layout.ts
//              (watermarks, columns, cell gaps) → lines, each with the least confidence of
//              its words (OCR_LINE_CONFIDENCE), the previous page's column hint handed on
//              — imported from src/transcript/ocr-lines.ts, never copied by hand
//   ocr.ts     an empty line after every page (the page break the parser expects)
//
// Knobs (each one an experiment the plan's steps 10–12 measure before it
// touches src/):
//   --scale 3.0          pdfjs render scale for a PDF (72 × scale dpi)
//   --psm 6              tessedit_pageseg_mode (api.md; 4 = single column, 11 = sparse)
//   --dpi 300            user_defined_dpi (the engine assumes 70 when the image says nothing)
//   --engine-lines       the line builder OCR steps 9–10 shipped (ocr-lines.ts linesFromBlocks:
//                        the engine's own lines, whitespace collapsed, the LINE's confidence)
//                        instead of the word-box layout of step 11
//   --interword          preserve_interword_spaces=1 AND the engine's lines with their runs of
//                        spaces kept (ocrKeepSpaces; implies --engine-lines) — measured by OCR
//                        step 10 and not adopted; --no-interword is the default, spelled out
//   --line-confidence min-word|engine-line   the figure a built line carries (step 11's A/B:
//                        the least confident word, or the engine's line confidence)
//   --image-dpi N        the dpi of a page IMAGE given directly (a PDF's pages are rendered at
//                        72 × scale); default 72 × scale
//   --threshold N        binarise at gray N (0–255) in node before the engine sees the page
//   --invert 0|1         tessedit_do_invert
//   --rotate-auto        recognize option rotateAuto (the engine's own skew estimate)
//   --words              keep word boxes + confidences per line in the output JSON
//   --max-pages N        pages read per PDF
//   --config file.json   any of the above as JSON keys {scale, psm, dpi, engineLines, interword,
//                        lineConfidence, imageDpi, threshold, invert, rotateAuto, words, maxPages,
//                        params:{…}}; command-line knobs override the file
//   --out out.json       write { config, documents: [{ file, pages: [...], lines }] }
//
//   node --experimental-strip-types scripts/dev/ocr-bench/ocr-run.mjs [knobs] scan.pdf page.png …
//
// Exports (bench.mjs and pin-pages.mjs import these; the CLI is below):
//   BASELINE_CONFIG, mergeConfig, createOcrWorker, recognizePage, ocrDocument,
//   linesFromBlocks, trimBlocks
//
// FERPA: prints and writes verbatim OCR text — public and synthetic pages
// only; a private seed's outputs stay outside the repository.
import { createWorker, OEM } from 'tesseract.js';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { pdfToPagePngs } from '../pdf-lines-node.mts';
import { linesFromBlocks as engineLinesFromBlocks, OCR_ENGINE_PARAMETERS, OCR_LINE_CONFIDENCE, ocrKeepSpaces, ocrLineText, ocrPageLayout } from '../../../src/transcript/ocr-lines.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/** The app as shipped (see the header for the ocr.ts line each value mirrors). */
export const BASELINE_CONFIG = Object.freeze({
  name: 'baseline',
  scale: 3.0,
  psm: undefined,
  dpi: undefined,
  engineLines: false,
  interword: false,
  lineConfidence: OCR_LINE_CONFIDENCE,
  imageDpi: undefined,
  threshold: undefined,
  invert: undefined,
  rotateAuto: false,
  words: false,
  maxPages: 10,
  params: {},
});

/** Baseline + a config file + command-line knobs, later ones winning. */
export function mergeConfig(...layers) {
  const out = { ...BASELINE_CONFIG, params: {} };
  for (const layer of layers) {
    if (!layer) continue;
    for (const [k, v] of Object.entries(layer)) {
      if (v === undefined) continue;
      if (k === 'params') Object.assign(out.params, v);
      else out[k] = v;
    }
  }
  return out;
}

/** The engine parameters a config sets (the app's own — none today — for the baseline). */
export function engineParameters(config) {
  const p = { ...OCR_ENGINE_PARAMETERS, ...config.params };
  if (config.psm !== undefined) p.tessedit_pageseg_mode = String(config.psm);
  if (config.dpi !== undefined) p.user_defined_dpi = String(config.dpi);
  if (config.interword) p.preserve_interword_spaces = '1';
  if (config.invert !== undefined) p.tessedit_do_invert = String(config.invert);
  return p;
}

/** The app's worker, in node: same model folder, nothing cached to disk. */
export async function createOcrWorker(config = BASELINE_CONFIG) {
  const worker = await createWorker('eng', OEM.LSTM_ONLY, {
    langPath: join(root, 'public', 'ocr'),
    gzip: true,
    cacheMethod: 'none',
    logger: () => {},
  });
  const params = engineParameters(config);
  if (Object.keys(params).length > 0) await worker.setParameters(params);
  return worker;
}

/** The app's lines from the engine's `blocks` — src/transcript/ocr-lines.ts
 * `ocrPageLayout` (word boxes → layout.ts → lines; `scale` = pixels per PDF
 * unit, `hint` the previous page's column layout, `lineConfidence` the
 * figure each line carries) — or, under `engineLines` / `interword`, the
 * builder OCR steps 9–10 shipped (`linesFromBlocks` there: the engine's own
 * lines through `ocrLineText`, or `ocrKeepSpaces` under `interword`). With
 * `words` set, each line also lists the engine's words (text, confidence,
 * box) — for the engine-line builder, its line's; for the layout builder,
 * nothing (the runs are the lines). Every rule lives in ocr-lines.ts. */
export function linesFromBlocks(blocks, { width, height, scale, hint, engineLines = false, interword = false, lineConfidence = OCR_LINE_CONFIDENCE, words = false } = {}) {
  if (engineLines || interword) {
    const lines = [];
    const engine = engineLinesFromBlocks(blocks, interword ? ocrKeepSpaces : ocrLineText);
    if (!words) return { lines: engine };
    let i = 0;
    for (const block of blocks ?? []) {
      for (const paragraph of block.paragraphs ?? []) {
        for (const line of paragraph.lines ?? []) {
          if ((interword ? ocrKeepSpaces(line.text) : ocrLineText(line.text)) === '') continue;
          lines.push({ ...engine[i++], bbox: line.bbox, words: (line.words ?? []).map((w) => ({ text: w.text, confidence: w.confidence, bbox: w.bbox })) });
        }
      }
    }
    return { lines };
  }
  if (!(width > 0 && height > 0 && scale > 0)) throw new Error(`linesFromBlocks: the page size and scale are needed (got ${width}×${height} at ${scale})`);
  return ocrPageLayout(blocks, width, height, scale, { hint, confidence: lineConfidence });
}

/** The engine's blocks cut down to what a line builder needs — line text,
 * confidence and box, the words with theirs — so a pinned page's capture
 * stays small (symbols and alternative choices dropped). */
export function trimBlocks(blocks) {
  return (blocks ?? []).map((b) => ({
    bbox: b.bbox,
    confidence: b.confidence,
    paragraphs: (b.paragraphs ?? []).map((p) => ({
      bbox: p.bbox,
      confidence: p.confidence,
      lines: (p.lines ?? []).map((l) => ({
        text: l.text,
        confidence: l.confidence,
        bbox: l.bbox,
        baseline: l.baseline,
        words: (l.words ?? []).map((w) => ({ text: w.text, confidence: w.confidence, bbox: w.bbox })),
      })),
    })),
  }));
}

/** A PNG's or JPEG's pixel size from its header (no decoder): the page size
 * the line builder needs — the browser has the canvas, node has only a file.
 * PNG: the IHDR chunk's width and height; JPEG: the first start-of-frame
 * marker's height and width. */
export function imageSize(image) {
  const buf = Buffer.isBuffer(image) ? image : readFileSync(image);
  if (buf.length >= 24 && buf.readUInt32BE(0) === 0x89504e47) return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  if (buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let at = 2;
    while (at + 9 < buf.length) {
      if (buf[at] !== 0xff) throw new Error(`imageSize: not a JPEG marker at byte ${at}`);
      const marker = buf[at + 1];
      if (marker === 0xff) { at += 1; continue; } // fill byte
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { at += 2; continue; } // standalone markers
      const sof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (sof) return { height: buf.readUInt16BE(at + 5), width: buf.readUInt16BE(at + 7) };
      at += 2 + buf.readUInt16BE(at + 2);
    }
    throw new Error('imageSize: no start-of-frame marker in the JPEG');
  }
  throw new Error(`imageSize: ${Buffer.isBuffer(image) ? 'the buffer' : image} is neither PNG nor JPEG`);
}

/** Binarise a page in node (the --threshold knob): gray ≥ N → white, else black. */
async function thresholdImage(file, level) {
  const { createCanvas, loadImage } = await import('@napi-rs/canvas');
  const img = await loadImage(file);
  const canvas = createCanvas(img.width, img.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const px = ctx.getImageData(0, 0, img.width, img.height);
  const d = px.data;
  for (let i = 0; i < d.length; i += 4) {
    const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    const v = gray >= level ? 255 : 0;
    d[i] = d[i + 1] = d[i + 2] = v;
    d[i + 3] = 255;
  }
  ctx.putImageData(px, 0, 0);
  return canvas.toBuffer('image/png');
}

/** One page image (a path or a Buffer) through the engine. Returns the
 * app-shaped lines, the seconds the recognize call took, the engine's
 * rotation estimate when --rotate-auto was on, the image's pixel size, the
 * column hint for the next page, and the trimmed blocks when `keepBlocks` is
 * set (the pin script). `dpi` is the image's own (a page given directly;
 * `--image-dpi`), else the page is taken as rendered at 72 × config.scale;
 * `hint` is the previous page's column layout. */
export async function recognizePage(worker, image, config = BASELINE_CONFIG, { keepBlocks = false, dpi, hint } = {}) {
  const input = config.threshold !== undefined ? await thresholdImage(image, Number(config.threshold)) : image;
  const options = config.rotateAuto ? { rotateAuto: true } : {};
  const t0 = process.hrtime.bigint();
  const { data } = await worker.recognize(input, options, { blocks: true, text: false });
  const seconds = Number(process.hrtime.bigint() - t0) / 1e9;
  const { width, height } = imageSize(input);
  const scale = (dpi ?? config.imageDpi ?? 72 * config.scale) / 72;
  const read = linesFromBlocks(data.blocks, { width, height, scale, hint, engineLines: config.engineLines, interword: config.interword, lineConfidence: config.lineConfidence, words: config.words });
  const out = { lines: read.lines, hint: read.hint, seconds, rotateRadians: data.rotateRadians ?? 0, width, height };
  if (keepBlocks) out.blocks = trimBlocks(data.blocks);
  return out;
}

/** A document the way ocr.ts reads one: a PDF rendered by pdfjs at
 * `config.scale` (72 × scale dpi — the browser's canvas), its first
 * `maxPages` pages recognised in order, an empty line after each; or a
 * single page image as is. `workDir` receives the rendered PNGs (the caller
 * cleans up). */
export async function ocrDocument(worker, file, config = BASELINE_CONFIG, workDir, extra = {}) {
  const isPdf = /\.pdf$/i.test(file);
  let pageFiles;
  if (isPdf) {
    const dir = workDir ?? mkdtempSync(join(tmpdir(), 'ocr-run-'));
    pageFiles = await pdfToPagePngs(file, 72 * config.scale, dir);
  } else {
    pageFiles = [file];
  }
  const pagesTotal = pageFiles.length;
  const pagesRead = Math.min(pagesTotal, config.maxPages);
  const lines = [];
  const pages = [];
  let seconds = 0;
  let hint; // the previous page's column layout, as ocr.ts hands it on
  for (let p = 0; p < pagesRead; p++) {
    const page = await recognizePage(worker, pageFiles[p], config, { ...extra, ...(isPdf ? { dpi: 72 * config.scale } : {}), hint });
    hint = page.hint;
    lines.push(...page.lines);
    lines.push({ text: '', confidence: 100 }); // ocr.ts:94 — the page break
    seconds += page.seconds;
    pages.push({ file: pageFiles[p], lines: page.lines.length, seconds: page.seconds, rotateRadians: page.rotateRadians, ...(page.blocks ? { blocks: page.blocks } : {}) });
  }
  return { file, lines, pages, pagesRead, pagesTotal, seconds, renderedPages: isPdf ? pageFiles : [] };
}

/** Command-line knobs → a config layer (undefined = not given) + the files. */
export function parseOcrArgs(argv) {
  const knobs = {};
  const files = [];
  let out;
  let configFile;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${a} needs a value`);
      return v;
    };
    if (a === '--scale') knobs.scale = Number(next());
    else if (a === '--psm') knobs.psm = Number(next());
    else if (a === '--dpi') knobs.dpi = Number(next());
    else if (a === '--engine-lines') knobs.engineLines = true;
    else if (a === '--interword') knobs.interword = true;
    else if (a === '--no-interword') knobs.interword = false;
    else if (a === '--line-confidence') {
      knobs.lineConfidence = next();
      if (knobs.lineConfidence !== 'min-word' && knobs.lineConfidence !== 'engine-line') throw new Error(`--line-confidence takes min-word or engine-line (got ${knobs.lineConfidence})`);
    } else if (a === '--image-dpi') knobs.imageDpi = Number(next());
    else if (a === '--threshold') knobs.threshold = Number(next());
    else if (a === '--invert') knobs.invert = Number(next());
    else if (a === '--rotate-auto') knobs.rotateAuto = true;
    else if (a === '--words') knobs.words = true;
    else if (a === '--max-pages') knobs.maxPages = Number(next());
    else if (a === '--config') configFile = resolve(next());
    else if (a === '--out') out = resolve(next());
    else if (a.startsWith('--')) throw new Error(`unknown option ${a} (see the header of scripts/dev/ocr-bench/ocr-run.mjs)`);
    else files.push(resolve(a));
  }
  const fromFile = configFile ? JSON.parse(readFileSync(configFile, 'utf8')) : undefined;
  const config = mergeConfig(fromFile, knobs);
  if (configFile && !knobs.name && fromFile?.name === undefined) config.name = basename(configFile).replace(/\.json$/, '');
  return { config, files, out };
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { config, files, out } = parseOcrArgs(process.argv.slice(2));
  if (files.length === 0) {
    console.error('usage: node --experimental-strip-types scripts/dev/ocr-bench/ocr-run.mjs [knobs] file.pdf|page.png …  (knobs: see the file header)');
    process.exit(2);
  }
  const worker = await createOcrWorker(config);
  const workDir = mkdtempSync(join(tmpdir(), 'ocr-run-'));
  const documents = [];
  try {
    for (const file of files) {
      const doc = await ocrDocument(worker, file, config, workDir);
      documents.push(doc);
      console.log(`${basename(file)}: ${doc.pagesRead}/${doc.pagesTotal} page(s), ${doc.lines.length} lines, ${doc.seconds.toFixed(2)} s`);
      if (!out) for (const l of doc.lines) console.log(l.text === '' ? '' : `  [${String(Math.round(l.confidence)).padStart(3)}] ${l.text}`);
    }
  } finally {
    await worker.terminate();
    rmSync(workDir, { recursive: true, force: true });
  }
  if (out) {
    writeFileSync(out, JSON.stringify({ config, documents }, null, 1));
    console.log(`wrote ${out}`);
  }
}
