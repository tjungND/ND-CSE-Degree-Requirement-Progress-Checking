// The ENGINE GATE (transcript accuracy program, plan step 14, 2026-10-09) —
// OFFLINE ONLY. Measures PaddleOCR PP-OCRv6_tiny (the MIT `paddleocr` npm
// runtime on ONNX Runtime, the official Apache-2.0 ONNX models) against the
// shipped Tesseract pipeline on the OCR bench's degraded pages, through the
// app's OWN layout stage and parser, scored by the bench's own scorer:
//
//   a finished bench run's page renders   <run>/<seed>/<level>/render/<seed>-pN.png — the very
//   (--from)                               pixels the shipped Tesseract read in that run, at the
//                                          dpi its results.json records per page
//     → PP-OCRv6_tiny det + rec           paddleocr's PaddleOcrService, preset PP-OCRv6_tiny
//     → word boxes                         each detected text line's CTC character positions split
//                                          at its recognised spaces and at unspaced gaps of
//                                          GAP_SPLIT_PITCHES character pitches (`wordsOfLine`)
//     → engine lines                       the detected lines grouped into page rows across the
//                                          page's skew (`rowsOfWords`) — what Tesseract's own
//                                          line finder gives the app
//     → src/transcript/ocr-lines.ts        ocrPageLayout: the SAME blocksToRuns (word-space shares)
//                                          and layout.ts pageLayout (watermarks, columns, cell gaps)
//     → src/transcript/external.ts         parseExternalTranscript (or the ND parser), as bench.mjs
//     → scripts/dev/ocr-bench/score.mts    scoreBench / aggregate — the bench's one scorer
//
// The gate (DECISIONS 2026-10-09): a second engine is adopted only if it reads
// ≥ 10 points more rows right (row accuracy) than the improved Tesseract on the
// office-scan, photocopy, stamped and phone levels (L2–L5) at ≤ 2× the seconds
// per page (and then passes the WebKit e2e, as a second opt-in naming its size).
// Measured 2026-10-09 and NOT adopted (+7.7 points pooled over L2–L5): the numbers,
// the adapter's calibrations and the reasons are in docs/OCR-BENCHMARK.md "Engine gate".
//
//   cd scripts/dev/ocr-bench/engine-gate && npm install && node fetch-models.mjs
//   node --experimental-strip-types gate.mjs --from ~/degree-audit-samples/bench-out/ocr-full-20261009 \
//        --levels L2,L5 --tesseract --out ~/degree-audit-samples/bench-out/engine-gate-medium
//
// Options
//   --from <run dir>     a finished bench run (its render/ PNGs, results.json for the per-page dpi and
//                        the Tesseract figures the gate compares against) — required
//   --levels L2,L5       ladder levels (L6 = L6-90 and L6-180); default L2,L3,L4,L5
//   --families a,b       bench families (default: generator-external, generator-nd, generator-scan, public-pdf)
//   --only <substring>   seeds whose id contains it; prints their diffs
//   --backend node|web   ONNX Runtime: onnxruntime-node (native) or onnxruntime-web (WebAssembly, the
//                        browser's runtime, run in node) — default web
//   --threads N          intra-op threads (default 1: the browser has no threads on GitHub Pages or in
//                        the cse.nd.edu iframe — no cross-origin isolation)
//   --batch-pad          pad every crop to the page's widest line (the runtime's default); without it
//                        each crop is padded to its own width (PaddleOCR with rec_batch_num 1)
//   --no-rotation-trial  read every page as it comes (default: page 1 read upright and, when its mean
//                        confidence is under --trial-skip-above or its lines run down the page, turned
//                        90/180/270 too; the best turn is kept for every page — paddleTrial)
//   --trial-always       all four turns of page 1 regardless (the measurement's form)
//   --trial-skip-above N --trial-margin N   the trial's two figures on Paddle's 0–100 scale (default 90 / 5;
//                        see paddleTrial)
//   --height-share F     a detected line's box height × F = the line height blocksToRuns measures word
//                        gaps against (default 0.75: DB boxes are unclipped past the ink; see DETECTION_BOX_INK_SHARE)
//   --tesseract          ALSO re-read every page with the shipped Tesseract (scripts/dev/ocr-bench/ocr-run.mjs,
//                        BASELINE_CONFIG) in the same process, page by page beside Paddle — the time ratio
//                        under the same machine load, and a check that this harness reproduces the bench
//   --out <dir>          results.json / results.md (default $TRANSCRIPT_SAMPLES/bench-out/engine-gate-<date>)
//   --code <label>       recorded in results.json beside the transcript code's hash (e.g. the commit a
//                        frozen `git archive` copy was made from — other sessions may be editing src/)
//   --calibrate          also write calibration.json: every page's detected boxes and texts
//
// results.json has the bench's shape, so the bench's own delta printer reads it:
//   npm run ocr-bench -- --compare <out> --baseline <--from run>
//
// FERPA: public and synthetic seeds only (the bench's named families); nothing is written into the repo.
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseExternalTranscript } from '../../../../src/transcript/external.ts';
import { ocrPageLayout } from '../../../../src/transcript/ocr-lines.ts';
import { collectSeeds, ndAsParsed } from '../seeds.mts';
import { aggregate, aggregateFigures, pct, scoreBench } from '../score.mts';
import { MODELS_DIR } from './fetch-models.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const MAX_PAGES = 10; // ocr.ts MAX_PAGES — the bench's ladder stops there too
const GATE_LEVELS = ['L2', 'L3', 'L4', 'L5'];
const ALL_LEVELS = ['L0', 'L1', 'L2', 'L3', 'L4', 'L5', 'L6-90', 'L6-180'];
const DEFAULT_FAMILIES = ['generator-external', 'generator-nd', 'generator-scan', 'public-pdf'];

/** A DB detection box is the text's polygon pushed OUT by `unclip_ratio` (1.4 for PP-OCRv6),
 * so it is taller than the ink Tesseract's line box measures; blocksToRuns's word-space shares
 * (WORD_SPACE_SHARE 0.55, TITLE_WORD_SPACE_SHARE 1.1 of the line's height) were measured on
 * Tesseract's ink boxes. Measured by calibrate.mjs on the clean (L0) page 1 of 30 bench seeds,
 * never on a level the gate scores (2026-10-09): over 1687 detected boxes the height is 1.33× the
 * Tesseract line height of the same line at the median (1.24 at the 25th percentile, 1.55 at the
 * 75th), so the box height × 0.75 is the line height the shares apply to. Under it, Paddle's word
 * gaps inside one box measure 0.44 of that height at the median and 0.78 at the 90th percentile
 * (Tesseract's word gaps: 0.46 at the median), and its gaps between two boxes on a row 1.43 or
 * more nine times in ten. */
export const DETECTION_BOX_INK_SHARE = 0.75;

/** Where an unspaced line is cut into words: neighbouring characters this many median pitches
 * apart, centre to centre (see wordsOfLine). Measured on the clean (L0) page 1 of 40 bench seeds
 * (2026-10-09; the CTC steps quantise a pitch to about two steps, so the figures come in halves):
 * letters with no space emitted between them sit 1.0 pitch apart at the median and 2.0 at the
 * 99th percentile — a cut at 2 split 1.6 % of letter pairs ("Algorith m"), at 3 only 0.05 % —
 * while two letters across an emitted space sit 1.8 apart at the median (2.5 at the 95th), and a
 * monospace cell gap the recogniser left unspaced ("3.0    A" read "3.0A") 5 or more. */
export const GAP_SPLIT_PITCHES = 3;

/** Under this many letter-to-letter distances a line's pitch is the page's (see wordsOfLine). */
export const MIN_PITCH_SAMPLES = 6;

/** The page's character pitch in CTC steps: the median distance between neighbouring characters
 * with no space between them, over every recognised line. */
export function pagePitch(results) {
  const gaps = [];
  for (const r of results) {
    const chars = r.ctc?.chars ?? [];
    for (let i = 1; i < chars.length; i++) {
      if (chars[i].ch.trim() === '' || chars[i - 1].ch.trim() === '') continue;
      gaps.push((chars[i].t0 + chars[i].t1 - chars[i - 1].t0 - chars[i - 1].t1) / 2);
    }
  }
  return gaps.length ? median(gaps) : undefined;
}

function parseArgs(argv) {
  const o = { from: undefined, levels: GATE_LEVELS, families: DEFAULT_FAMILIES, only: undefined, backend: 'web', threads: 1, batchPad: false, rotationTrial: true, trialAlways: false, trialSkipAbove: 90, trialMargin: 5, heightShare: DETECTION_BOX_INK_SHARE, tesseract: false, out: undefined, calibrate: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${a} needs a value`);
      return v;
    };
    if (a === '--from') o.from = resolve(next());
    else if (a === '--levels') o.levels = next().split(',').map((s) => s.trim()).filter(Boolean).flatMap((l) => (l === 'L6' ? ['L6-90', 'L6-180'] : [l]));
    else if (a === '--families') o.families = next().split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--only') o.only = next();
    else if (a === '--backend') o.backend = next();
    else if (a === '--threads') o.threads = Number(next());
    else if (a === '--batch-pad') o.batchPad = true;
    else if (a === '--no-rotation-trial') o.rotationTrial = false;
    else if (a === '--trial-always') o.trialAlways = true;
    else if (a === '--trial-skip-above') o.trialSkipAbove = Number(next());
    else if (a === '--trial-margin') o.trialMargin = Number(next());
    else if (a === '--height-share') o.heightShare = Number(next());
    else if (a === '--tesseract') o.tesseract = true;
    else if (a === '--calibrate') o.calibrate = true;
    else if (a === '--out') o.out = resolve(next());
    else if (a === '--code') o.code = next();
    else throw new Error(`unknown option ${a} (see the header of engine-gate/gate.mjs)`);
  }
  if (o.from === undefined) throw new Error('--from <a finished bench run> is required');
  for (const l of o.levels) if (!ALL_LEVELS.includes(l)) throw new Error(`unknown level ${l}`);
  if (o.backend !== 'node' && o.backend !== 'web') throw new Error('--backend takes node or web');
  const samples = process.env['TRANSCRIPT_SAMPLES'] ?? join(homedir(), 'degree-audit-samples');
  o.publicPdfsDir = join(samples, 'public-pdfs');
  o.out ??= join(samples, 'bench-out', `engine-gate-${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '').replace(/^(\d{8})(\d{4})$/, '$1-$2')}`);
  return o;
}

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));
const toArrayBuffer = (buf) => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);

// ---------------------------------------------------------------------------
// The engine

/** The CTC characters of the last line recognised, with their time steps — captured beside the
 * runtime's own decode (which returns the text and a mean score only). */
let lastCtc;

/** paddleocr's RecognitionService, instrumented: (1) every decode also records where each
 * character sits (`ctcCharacters`), so a line can be cut into words by position; (2) unless
 * `batchPad`, a crop is padded to its own width (PaddleOCR's own rec_batch_num 1) rather than to
 * the widest line on the page (the runtime pads every crop to the page's widest, which is slower
 * and pads short cells with tens of blank steps). Only these two hooks; the det/rec maths are the
 * runtime's. */
function instrument(RecognitionService, { batchPad }) {
  const proto = RecognitionService.prototype;
  if (proto.__gateInstrumented) return;
  proto.__gateInstrumented = true;
  const decode = proto.ctcLabelDecode;
  proto.ctcLabelDecode = function (logits, sequenceLength, numClasses, runtimeOptions, charWhiteSet) {
    const out = decode.call(this, logits, sequenceLength, numClasses, runtimeOptions, charWhiteSet);
    lastCtc = { steps: sequenceLength, chars: ctcCharacters(logits, sequenceLength, numClasses, runtimeOptions.charactersDictionary) };
    return out;
  };
  const processBox = proto.processBox;
  proto.processBox = async function (task, runtimeOptions) {
    lastCtc = undefined;
    const r = await processBox.call(this, task, runtimeOptions);
    if (r) r.ctc = lastCtc;
    return r;
  };
  if (!batchPad) proto.calculateBatchMaxWhRatio = () => 0;
}

/** Greedy CTC decode with positions: each emitted character, the first and last time step its
 * class held the argmax, and its probability (the step's max). Blank = class 0; the dictionary is
 * offset by one, as the runtime's own decode reads it. */
export function ctcCharacters(logits, steps, classes, dict) {
  const chars = [];
  let last = -1;
  for (let t = 0; t < steps; t++) {
    let best = -Infinity;
    let at = 0;
    const off = t * classes;
    for (let i = 0; i < classes; i++) {
      const v = logits[off + i];
      if (v > best) {
        best = v;
        at = i;
      }
    }
    if (at === last && at !== 0) {
      const c = chars[chars.length - 1];
      c.t1 = t;
      c.p = Math.max(c.p, best);
      continue;
    }
    last = at;
    if (at === 0) continue;
    chars.push({ ch: dict[at - 1] ?? '', t0: t, t1: t, p: best });
  }
  return chars;
}

export async function createPaddle({ backend = 'web', threads = 1, batchPad = false } = {}) {
  const { PaddleOcrService, RecognitionService } = await import('paddleocr');
  instrument(RecognitionService, { batchPad });
  let ort;
  if (backend === 'web') {
    ort = await import('onnxruntime-web');
    ort.env.wasm.numThreads = threads;
    ort.env.logLevel = 'error';
  } else {
    const real = await import('onnxruntime-node');
    // The runtime creates its sessions with no options; the thread count is set here.
    ort = { ...real, InferenceSession: { create: (buf, opts) => real.InferenceSession.create(buf, { intraOpNumThreads: threads, interOpNumThreads: 1, ...(opts ?? {}) }) } };
  }
  const det = readFileSync(join(MODELS_DIR, 'PP-OCRv6_tiny_det.onnx'));
  const rec = readFileSync(join(MODELS_DIR, 'PP-OCRv6_tiny_rec.onnx'));
  const dict = readFileSync(join(MODELS_DIR, 'ppocrv6_tiny_dict.txt'), 'utf8').replace(/\n$/, '').split('\n');
  // PaddleOCR's CTCLabelDecode appends the space when use_space_char is set (the preset says it is:
  // 6904 characters + space + blank = the model's 6906 classes); the runtime leaves that to the caller.
  const service = await PaddleOcrService.createInstance({ ort, modelPreset: 'PP-OCRv6_tiny', detection: { modelBuffer: toArrayBuffer(det) }, recognition: { modelBuffer: toArrayBuffer(rec), charactersDictionary: [...dict, ' '] } });
  return { service, describe: `PP-OCRv6_tiny (paddleocr ${readJson(join(here, 'node_modules', 'paddleocr', 'package.json')).version}, onnxruntime-${backend} ${readJson(join(here, 'node_modules', `onnxruntime-${backend}`, 'package.json')).version}, ${threads} thread${threads === 1 ? '' : 's'}${batchPad ? ', page-wide crop padding' : ''})` };
}

/** A page image (PNG/JPEG path) as RGBA pixels, turned `rotation` degrees clockwise. */
export async function pagePixels(file, rotation = 0) {
  const img = await loadImage(file);
  const turned = rotation === 90 || rotation === 270;
  const w = turned ? img.height : img.width;
  const h = turned ? img.width : img.height;
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.translate(w / 2, h / 2);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.drawImage(img, -img.width / 2, -img.height / 2);
  const data = ctx.getImageData(0, 0, w, h).data;
  return { width: w, height: h, data: new Uint8Array(data.buffer, data.byteOffset, data.byteLength) };
}

// ---------------------------------------------------------------------------
// Detected lines → the engine-shaped blocks ocr-lines.ts reads

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const median = (xs) => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** One recognised line → its words with pixel boxes and 0–100 confidences. The recogniser's
 * 6904-character list is multilingual and carries compatibility forms (a superscript "⁺", full-width
 * letters and digits) that an English transcript prints as plain ASCII — Tesseract's English model
 * cannot emit them — so each word is Unicode-NFKC-normalised ("B⁺" → "B+"), a fixed mapping, never a
 * guess. A word is a run of non-space characters; its extent along the line is read from the CTC time steps: the crop was
 * resized to 48 px high and `proportional` px wide, then padded to `target` px, and the
 * recogniser emits one step per `target / steps` px. A character spans its steps; a word runs
 * from half a character pitch before its first character's centre to half a pitch past its
 * last's. The fraction along the crop maps onto the detected quadrilateral (top edge p0→p1,
 * bottom edge p3→p2). A vertical crop (the runtime turns crops 1.5× taller than wide) and a
 * line without positions stay one word over the whole box. */
export function wordsOfLine(result, { batchPad = false, pagePitchSteps } = {}) {
  const box = result.box;
  const pts = box.points ?? [
    { x: box.x, y: box.y },
    { x: box.x + box.width, y: box.y },
    { x: box.x + box.width, y: box.y + box.height },
    { x: box.x, y: box.y + box.height },
  ];
  const [p0, p1, p2, p3] = pts;
  const cropW = Math.max(Math.floor(dist(p0, p1)), Math.floor(dist(p3, p2)), 1);
  const cropH = Math.max(Math.floor(dist(p0, p3)), Math.floor(dist(p1, p2)), 1);
  const at = (f) => ({ top: { x: p0.x + f * (p1.x - p0.x), y: p0.y + f * (p1.y - p0.y) }, bottom: { x: p3.x + f * (p2.x - p3.x), y: p3.y + f * (p2.y - p3.y) } });
  const boxOf = (f0, f1) => {
    const a = at(Math.max(0, Math.min(1, f0)));
    const b = at(Math.max(0, Math.min(1, f1)));
    const xs = [a.top.x, a.bottom.x, b.top.x, b.bottom.x];
    const ys = [a.top.y, a.bottom.y, b.top.y, b.bottom.y];
    return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
  };
  const whole = (text, p) => [{ text: text.normalize('NFKC').replace(/\s+/g, ' ').trim(), confidence: 100 * p, bbox: boxOf(0, 1) }].filter((w) => w.text !== '');
  const ctc = result.ctc;
  if (!ctc || cropH / cropW >= 1.5 || ctc.chars.length === 0) return whole(result.text, result.confidence);
  const proportional = Math.ceil(48 * (cropW / cropH));
  // The padded width the crop was run at: its own (≥ 320) — or, under --batch-pad, the page's widest;
  // either way it is the recogniser's 8 px per step (steps × 8), which we read back from the output.
  const target = ctc.steps * 8;
  const resized = Math.min(proportional, batchPad ? target : Math.max(320, proportional));
  const stepPx = target / ctc.steps;
  const step = (c) => (c.t0 + c.t1 + 1) / 2; // a character's centre, in time steps (exact halves)
  const centre = (c) => (step(c) * stepPx) / resized; // the same, as a fraction along the crop
  const parts = [];
  let cur = [];
  const flush = () => {
    if (cur.length) parts.push(cur);
    cur = [];
  };
  for (const c of ctc.chars) {
    if (c.ch.normalize('NFKC').trim() === '') flush();
    else cur.push(c);
  }
  flush();
  if (parts.length === 0) return [];
  // The character pitch: the median distance between neighbouring characters inside a word, in
  // time steps (compared in steps, so the cut below is exact at the threshold) and as a fraction.
  const gaps = [];
  for (const w of parts) for (let i = 1; i < w.length; i++) gaps.push(step(w[i]) - step(w[i - 1]));
  // A short line's own median is a handful of samples ("3.0B+" has four), so under
  // MIN_PITCH_SAMPLES the page's pitch stands in — in steps it is comparable across lines, every
  // crop being resized to the same 48 px height.
  const pitchSteps = gaps.length >= MIN_PITCH_SAMPLES ? median(gaps) : (pagePitchSteps ?? (gaps.length ? median(gaps) : undefined));
  const pitch = pitchSteps !== undefined ? (pitchSteps * stepPx) / resized : 1 / Math.max(1, ctc.chars.length);
  // The recogniser does not always emit the space: a monospace "3.0    A" reads "3.0A", the gap
  // left to blanks. Two neighbouring characters whose centres lie GAP_SPLIT_PITCHES pitches or more
  // apart have more than a space's width of nothing between them (letters of one word sit about one
  // pitch apart, two words across one space about two), so the word is cut there too —
  // blocksToRuns joins the pieces again, with a space, when their gap is a word space.
  const words = [];
  for (const w of parts) {
    let piece = [w[0]];
    for (let i = 1; i < w.length; i++) {
      if (pitchSteps !== undefined && step(w[i]) - step(w[i - 1]) >= GAP_SPLIT_PITCHES * pitchSteps) {
        words.push(piece);
        piece = [];
      }
      piece.push(w[i]);
    }
    words.push(piece);
  }
  return words.map((w) => {
    const f0 = centre(w[0]) - pitch / 2;
    const f1 = centre(w[w.length - 1]) + pitch / 2;
    const p = w.reduce((s, c) => s + c.p, 0) / w.length;
    return { text: w.map((c) => c.ch).join('').normalize('NFKC'), confidence: 100 * p, bbox: boxOf(f0, f1) };
  });
}

/** The detected lines of a page → page ROWS, as Tesseract's line finder gives the app one line
 * per row: the page's skew is the median slope of the wide boxes' top edges; every box's centre
 * is turned by it, and boxes whose turned centres lie within half the median box height of a
 * row's mean join that row. A row's baseline follows the skew across the row; its height is the
 * median box height × `heightShare` (the ink, not the unclipped DB box — DETECTION_BOX_INK_SHARE). */
export function rowsOfWords(results, { heightShare = DETECTION_BOX_INK_SHARE, batchPad = false } = {}) {
  const items = [];
  const slopes = [];
  const pagePitchSteps = pagePitch(results);
  for (const r of results) {
    const words = wordsOfLine(r, { batchPad, pagePitchSteps });
    if (words.length === 0) continue;
    const pts = r.box.points;
    const w = pts ? dist(pts[0], pts[1]) : r.box.width;
    const h = pts ? (dist(pts[0], pts[3]) + dist(pts[1], pts[2])) / 2 : r.box.height;
    if (pts && w > 3 * h) slopes.push(Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x));
    const cx = pts ? (pts[0].x + pts[1].x + pts[2].x + pts[3].x) / 4 : r.box.x + r.box.width / 2;
    const cy = pts ? (pts[0].y + pts[1].y + pts[2].y + pts[3].y) / 4 : r.box.y + r.box.height / 2;
    items.push({ words, h, cx, cy, confidence: 100 * r.confidence });
  }
  const theta = median(slopes);
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  for (const it of items) it.v = -sin * it.cx + cos * it.cy; // the centre's height across the skew
  items.sort((a, b) => a.v - b.v);
  const hMed = median(items.map((i) => i.h)) || 1;
  const rows = [];
  for (const it of items) {
    const row = rows[rows.length - 1];
    if (row && Math.abs(it.v - row.v) <= 0.5 * Math.min(hMed, Math.max(row.h, it.h))) {
      row.items.push(it);
      row.v = row.items.reduce((s, x) => s + x.v, 0) / row.items.length;
      row.h = median(row.items.map((x) => x.h));
    } else rows.push({ items: [it], v: it.v, h: it.h });
  }
  const lines = rows.map((row) => {
    const words = row.items.flatMap((i) => i.words).sort((a, b) => a.bbox.x0 - b.bbox.x0);
    const x0 = Math.min(...words.map((w) => w.bbox.x0));
    const x1 = Math.max(...words.map((w) => w.bbox.x1));
    const ink = row.h * heightShare;
    // The row's centre line at x: v = −sin·x + cos·y  →  y = (v + sin·x) / cos; the baseline sits half the ink below.
    const yAt = (x) => (row.v + sin * x) / cos + ink / 2;
    const mid = yAt((x0 + x1) / 2);
    return {
      text: words.map((w) => w.text).join(' '),
      confidence: Math.min(...row.items.map((i) => i.confidence)),
      bbox: { x0, y0: mid - ink, x1, y1: mid },
      baseline: { x0, y0: yAt(x0), x1, y1: yAt(x1) },
      words,
    };
  });
  return { blocks: [{ paragraphs: [{ lines }] }], skewDegrees: (theta * 180) / Math.PI };
}

/** The mean character confidence (0–100) over a page — the trial's figure. */
function meanConfidence(results) {
  let sum = 0;
  let n = 0;
  for (const r of results) for (const c of r.ctc?.chars ?? []) if (c.ch.trim() !== '') ((sum += c.p), (n += 1));
  return n === 0 ? 0 : (100 * sum) / n;
}

/** The share of a page's recognised lines (three characters or more) that run ACROSS the page —
 * the detected box at least as wide as it is tall. Upright text reads in wide boxes; a page lying
 * on its side reads in tall ones, which the runtime turns a quarter before recognising (its
 * `cropRotated`), so a page turned 90° clockwise reads every word right — at the upright page's
 * confidence (measured on L1, trial-calibration-L1: 0° and 90° within 0.2 points at the median) —
 * in a layout of columns that are really rows. */
export function wideShare(results) {
  let wide = 0;
  let n = 0;
  for (const r of results) {
    if (r.text.replace(/\s/g, '').length < 3) continue;
    const p = r.box.points;
    const w = p ? dist(p[0], p[1]) : r.box.width;
    const h = p ? dist(p[0], p[3]) : r.box.height;
    n += 1;
    if (w >= h) wide += 1;
  }
  return n === 0 ? 0 : wide / n;
}

/** One page through the engine: pixels → det + rec (timed) → rows → the app's lines. */
async function paddlePage(paddle, file, { dpi, hint, rotation = 0, o }) {
  const px = await pagePixels(file, rotation);
  const t0 = process.hrtime.bigint();
  const results = await paddle.service.recognize(px);
  const seconds = Number(process.hrtime.bigint() - t0) / 1e9;
  const { blocks, skewDegrees } = rowsOfWords(results, { heightShare: o.heightShare, batchPad: o.batchPad });
  const read = ocrPageLayout(blocks, px.width, px.height, dpi / 72, { hint });
  return { lines: read.lines, hint: read.hint, seconds, rotation, meanConfidence: meanConfidence(results), wideShare: wideShare(results), detected: results.length, skewDegrees, results };
}

/** Page 1's orientation trial — the shipped rule's shape (OCR step 12: read as it comes; under a
 * confidence floor, read turned 90/180/270 too; a turn wins only by a margin over the page as it
 * came) on Paddle's figure, the mean character probability × 100, with one addition the runtime
 * makes necessary: a reading whose lines run DOWN the page (`wideShare` under ½) is a page lying
 * on its side whatever its confidence, so it never stands and never wins — the turn that lays it
 * flat does. The floor and margin: on L1 (calibration only), every upright page read 95.8 or more
 * (median 99.7) and every page turned 180° or 270° 64.2 or less (median 46.6). */
async function paddleTrial(paddle, file, extra) {
  const o = extra.o;
  const flat = (pg) => pg.wideShare >= 0.5;
  const asItCame = await paddlePage(paddle, file, { ...extra, rotation: 0 });
  let best = asItCame;
  const figure = (pg) => ({ c: Math.round(pg.meanConfidence * 10) / 10, wide: Math.round(pg.wideShare * 100) / 100 });
  const trial = { 0: figure(asItCame) };
  let seconds = asItCame.seconds;
  if (o.trialAlways || !flat(asItCame) || asItCame.meanConfidence < o.trialSkipAbove) {
    for (const rotation of [90, 180, 270]) {
      const page = await paddlePage(paddle, file, { ...extra, rotation });
      trial[rotation] = figure(page);
      seconds += page.seconds;
      if (!flat(page)) continue;
      if (!flat(best)) best = page;
      else if (page.meanConfidence > best.meanConfidence && (best !== asItCame || page.meanConfidence >= asItCame.meanConfidence + o.trialMargin)) best = page;
    }
  }
  return { ...best, seconds, trial };
}

// ---------------------------------------------------------------------------
// The bench's documents

/** The page renders a bench run kept for (seed, level), in page order, with each page's dpi. */
function renderedPages(fromDir, seed, level, baselineRow) {
  const dir = join(fromDir, seed.id.replace(/[^A-Za-z0-9._-]/g, '_'), level, 'render');
  if (!existsSync(dir)) return undefined;
  const files = readdirSync(dir)
    .filter((f) => /-p\d+\.png$/.test(f))
    .sort((a, b) => Number(/-p(\d+)\.png$/.exec(a)[1]) - Number(/-p(\d+)\.png$/.exec(b)[1]))
    .map((f) => join(dir, f))
    .slice(0, MAX_PAGES);
  const figures = baselineRow?.pageFigures ?? [];
  const pages = files.slice(0, baselineRow?.pagesRead ?? files.length).map((file, i) => ({ file, dpi: figures[i]?.dpi }));
  if (pages.some((p) => !(p.dpi > 0))) throw new Error(`${seed.id} @ ${level}: the baseline run records no render dpi for every page`);
  return pages;
}

/** bench.mjs's parseLines, verbatim in effect: the seed's parser on OCR lines + confidences. */
function parseLines(parser, lines) {
  const texts = lines.map((l) => (typeof l === 'string' ? l : l.text));
  if (parser === 'nd') return ndAsParsed(texts);
  const confidences = lines.length > 0 && typeof lines[0] !== 'string' ? lines.map((l) => l.confidence) : undefined;
  const p = parseExternalTranscript(texts, confidences);
  return { university: p.university, campusSystem: p.campusSystem, campus: p.campus, degreeConferred: p.degreeConferred, bachelorsConferredOn: p.bachelorsConferredOn, quarterSystem: p.quarterSystem, trimesterSystem: p.trimesterSystem, courses: p.courses };
}

const levelOrder = (l) => ALL_LEVELS.indexOf(l);

function groupBy(rows, key) {
  const m = new Map();
  for (const r of rows) m.set(key(r), [...(m.get(key(r)) ?? []), r]);
  return [...m];
}

function board(title, rows) {
  const keys = Object.keys(aggregateFigures(aggregate([])));
  const out = [`### ${title}`, '', `| group | ${keys.join(' | ')} |`, `|---|${keys.map(() => '---').join('|')}|`];
  for (const [label, rs] of groupBy(rows, (r) => `${r.config} ${r.level}`).sort((a, b) => a[0].split(' ')[0].localeCompare(b[0].split(' ')[0]) || levelOrder(a[0].split(' ')[1]) - levelOrder(b[0].split(' ')[1]))) {
    const f = aggregateFigures(aggregate(rs));
    out.push(`| ${label} | ${keys.map((k) => f[k]).join(' | ')} |`);
  }
  return out;
}

/** The gate table: per level and pooled over L2–L5, Tesseract (the --from run's rows for the same
 * seeds, and the same-session re-read under --tesseract) against PP-OCRv6_tiny; the Δ and the time
 * ratio are taken against the same-session reading when there is one. */
function gateTable(paddleRows, fromRows, sessionRows) {
  const levels = [...new Set(paddleRows.map((r) => r.level))].sort((a, b) => levelOrder(a) - levelOrder(b));
  const key = (r) => `${r.seed} @ ${r.level}`;
  const fromBy = new Map(fromRows.map((r) => [key(r), r]));
  const sessBy = new Map(sessionRows.map((r) => [key(r), r]));
  const fig = (rows) => {
    const a = aggregate(rows);
    return { acc: a.expectedRows ? (100 * a.rightRows) / a.expectedRows : 0, found: a.expectedRows ? (100 * a.matched) / a.expectedRows : 0, falseRows: a.falseRows, cer: a.cer.truthChars ? (100 * a.cer.distance) / a.cer.truthChars : 0, sPage: a.pages ? a.seconds / a.pages : 0, a };
  };
  const out = ['| level | seeds | Tesseract (bench run) row acc / found / false / CER / s/page | Tesseract (same session) row acc / s/page | PP-OCRv6_tiny row acc / found / false / CER / s/page | Δ row acc (points) | time × (same session) |', '|---|---|---|---|---|---|---|'];
  const verdictParts = [];
  const groups = [...levels.map((l) => [l, [l]]), ...(levels.filter((l) => GATE_LEVELS.includes(l)).length > 1 ? [['L2–L5 pooled', levels.filter((l) => GATE_LEVELS.includes(l))]] : [])];
  for (const [label, ls] of groups) {
    const p = paddleRows.filter((r) => ls.includes(r.level));
    const t = p.map((r) => fromBy.get(key(r))).filter(Boolean);
    const s = p.map((r) => sessBy.get(key(r))).filter(Boolean);
    const P = fig(p);
    const T = fig(t);
    const S = s.length ? fig(s) : undefined;
    // Against the same-session Tesseract when there is one — the same parser code, whatever has
    // changed since the --from run — else against the --from run's rows.
    const delta = P.acc - (S ?? T).acc;
    const ratio = S && S.sPage > 0 ? P.sPage / S.sPage : T.sPage > 0 ? P.sPage / T.sPage : NaN;
    out.push(`| ${label} | ${p.length} | ${T.acc.toFixed(1)} % / ${T.found.toFixed(1)} % / ${T.falseRows} / ${T.cer.toFixed(1)} % / ${T.sPage.toFixed(2)} | ${S ? `${S.acc.toFixed(1)} % / ${S.sPage.toFixed(2)}` : '—'} | ${P.acc.toFixed(1)} % / ${P.found.toFixed(1)} % / ${P.falseRows} / ${P.cer.toFixed(1)} % / ${P.sPage.toFixed(2)} | ${delta >= 0 ? '+' : ''}${delta.toFixed(1)} | ${Number.isFinite(ratio) ? ratio.toFixed(2) : '—'}${S ? '' : ' (vs the bench run)'} |`);
    if (label === 'L2–L5 pooled' || (ls.length === 1 && GATE_LEVELS.includes(label))) verdictParts.push({ label, delta, ratio });
  }
  return { table: out, verdictParts };
}

export async function runGate(argv) {
  const o = parseArgs(argv);
  const say = (s = '') => console.log(s);
  const fromFile = join(o.from, 'results.json');
  if (!existsSync(fromFile)) throw new Error(`${fromFile} not found`);
  const from = readJson(fromFile);
  const fromByKey = new Map(from.rows.map((r) => [`${r.seed} @ ${r.level}`, r]));
  mkdirSync(o.out, { recursive: true });
  const paddle = await createPaddle({ backend: o.backend, threads: o.threads, batchPad: o.batchPad });
  say(`engine: ${paddle.describe}; models ${MODELS_DIR}`);
  let tess;
  if (o.tesseract) {
    const run = await import('../ocr-run.mjs');
    tess = { run, worker: await run.createOcrWorker(run.BASELINE_CONFIG) };
    say(`and the shipped Tesseract (ocr-run.mjs BASELINE_CONFIG) on the same pages, page by page`);
  }
  const { seeds, notes } = await collectSeeds({ families: o.families, only: o.only, quick: false, publicPdfsDir: o.publicPdfsDir, fetch: false, renderDir: join(o.out, 'render'), skins: [], renderDpi: 300 });
  for (const n of notes) say(n);
  say(`seeds: ${seeds.length} × levels ${o.levels.join(', ')} from ${o.from}; out ${o.out}`);
  const rows = [];
  const sessionRows = [];
  const calib = [];
  const t0 = Date.now();
  try {
    for (const seed of seeds) {
      for (const level of o.levels) {
        const baselineRow = fromByKey.get(`${seed.id} @ ${level}`);
        const pages = baselineRow ? renderedPages(o.from, seed, level, baselineRow) : undefined;
        if (!pages || pages.length === 0) {
          say(`  ${seed.id} @ ${level}: no renders in the --from run — skipped`);
          continue;
        }
        const lines = [];
        const pageFigures = [];
        let seconds = 0;
        let hint;
        let rotation = 0;
        for (let p = 0; p < pages.length; p++) {
          const extra = { dpi: pages[p].dpi, hint, rotation, o };
          const page = p === 0 && o.rotationTrial ? await paddleTrial(paddle, pages[p].file, extra) : await paddlePage(paddle, pages[p].file, extra);
          rotation = page.rotation;
          hint = page.hint;
          lines.push(...page.lines, { text: '', confidence: 100 });
          seconds += page.seconds;
          pageFigures.push({ lines: page.lines.length, seconds: page.seconds, dpi: pages[p].dpi, rotation: page.rotation, meanConfidence: Math.round(page.meanConfidence * 10) / 10, detected: page.detected, skewDegrees: Math.round(page.skewDegrees * 100) / 100, ...(page.trial ? { trial: page.trial } : {}) });
          if (o.calibrate) calib.push({ seed: seed.id, level, page: p + 1, results: page.results.map((r) => ({ text: r.text, box: r.box, confidence: r.confidence })) });
        }
        const row = scoreBench({ seed, level, dpi: baselineRow.dpi, config: 'pp-ocrv6-tiny', parsed: parseLines(seed.parser, lines), ocrLines: lines.map((l) => l.text), seconds, pagesRead: pages.length });
        row.pageFigures = pageFigures;
        rows.push(row);
        let tLine = '';
        if (tess) {
          const tl = [];
          let ts = 0;
          let th;
          let tr = 0;
          for (let p = 0; p < pages.length; p++) {
            const extra = { dpi: pages[p].dpi, hint: th, rotation: tr };
            const page = p === 0 ? await tess.run.rotationTrial(tess.worker, pages[p].file, tess.run.BASELINE_CONFIG, extra) : await tess.run.recognizePage(tess.worker, pages[p].file, tess.run.BASELINE_CONFIG, extra);
            tr = page.rotation;
            th = page.hint;
            tl.push(...page.lines, { text: '', confidence: 100 });
            ts += page.seconds;
          }
          const trow = scoreBench({ seed, level, dpi: baselineRow.dpi, config: 'tesseract-same-session', parsed: parseLines(seed.parser, tl), ocrLines: tl.map((l) => l.text), seconds: ts, pagesRead: pages.length });
          sessionRows.push(trow);
          const same = trow.rightRows === baselineRow.rightRows && trow.matched === baselineRow.matched && trow.parsedRows === baselineRow.parsedRows && trow.cer.distance === baselineRow.cer.distance;
          tLine = `; Tesseract ${trow.negative ? `${trow.parsedRows} false` : `${trow.rightRows}/${trow.matched}/${trow.expectedRows}`} in ${ts.toFixed(1)} s${same ? '' : ' (DIFFERS from the bench run)'}`;
        }
        const b = baselineRow;
        say(`  ${seed.id} @ ${level}: Paddle ${row.negative ? `${row.parsedRows} false row(s)` : `rows right/found/expected ${row.rightRows}/${row.matched}/${row.expectedRows}, extra ${row.extra}`}, CER ${pct(row.cer.distance, row.cer.truthChars)}, ${pages.length} page(s) in ${seconds.toFixed(1)} s | bench Tesseract ${b.negative ? `${b.parsedRows} false` : `${b.rightRows}/${b.matched}/${b.expectedRows}, extra ${b.extra}`}, CER ${pct(b.cer.distance, b.cer.truthChars)}${tLine}`);
        if (o.only !== undefined && !row.exact) for (const d of row.diffs.slice(0, 15)) say('     ' + d);
      }
    }
  } finally {
    if (tess) await tess.worker.terminate();
  }
  const fromRows = rows.map((r) => fromByKey.get(`${r.seed} @ ${r.level}`)).filter(Boolean);
  const { table, verdictParts } = gateTable(rows, fromRows, sessionRows);
  const pooled = verdictParts.find((v) => v.label === 'L2–L5 pooled');
  // Which parser and layout code read the lines: the files' own hash (a run made from a frozen
  // `git archive` of a commit — --code names it — is immune to edits in the working tree).
  const codeHash = createHash('sha256');
  for (const f of ['external.ts', 'layout.ts', 'ocr-lines.ts', 'parse.ts']) codeHash.update(readFileSync(join(here, '..', '..', '..', '..', 'src', 'transcript', f)));
  const meta = { generatedAt: new Date().toISOString(), args: argv, engine: paddle.describe, code: o.code, transcriptCodeSha256: codeHash.digest('hex').slice(0, 16), from: o.from, config: { name: 'pp-ocrv6-tiny', backend: o.backend, threads: o.threads, batchPad: o.batchPad, rotationTrial: o.rotationTrial, trialAlways: o.trialAlways, trialSkipAbove: o.trialSkipAbove, trialMargin: o.trialMargin, heightShare: o.heightShare }, seeds: new Set(rows.map((r) => r.seed)).size, wallSeconds: (Date.now() - t0) / 1000, secondsPerPage: rows.reduce((n, r) => n + r.seconds, 0) / Math.max(1, rows.reduce((n, r) => n + r.pagesRead, 0)) };
  writeFileSync(join(o.out, 'results.json'), JSON.stringify({ meta, rows: rows.map(({ diffs: _d, ...r }) => r), sessionRows: sessionRows.map(({ diffs: _d, ...r }) => r) }, null, 1));
  if (o.calibrate) writeFileSync(join(o.out, 'calibration.json'), JSON.stringify(calib));
  const md = [`# Engine gate — ${meta.generatedAt}`, '', `engine: ${paddle.describe}; pages from \`${o.from}\` (the renders the shipped Tesseract read there); levels ${o.levels.join(', ')}; ${meta.seeds} seeds; args \`${argv.join(' ')}\``, '', '## The gate', '', ...table, '', ...board('PP-OCRv6_tiny and Tesseract by level (the bench\'s board)', [...rows, ...fromRows.map((r) => ({ ...r, config: 'tesseract-bench-run' })), ...sessionRows]), ''];
  writeFileSync(join(o.out, 'results.md'), md.join('\n') + '\n');
  say();
  for (const l of table) say(l);
  say();
  if (pooled) say(`GATE (L2–L5 pooled): Δ row accuracy ${pooled.delta >= 0 ? '+' : ''}${pooled.delta.toFixed(1)} points (needs ≥ +10), time × ${Number.isFinite(pooled.ratio) ? pooled.ratio.toFixed(2) : '—'} (needs ≤ 2) → ${pooled.delta >= 10 && pooled.ratio <= 2 ? 'PASSES' : 'FAILS'}`);
  say(`wrote ${o.out}/results.{json,md} — ${rows.length} rows, ${(meta.wallSeconds / 60).toFixed(1)} min wall`);
  return 0;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = await runGate(process.argv.slice(2));
}
