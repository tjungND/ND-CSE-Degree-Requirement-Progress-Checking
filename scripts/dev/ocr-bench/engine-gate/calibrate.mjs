// The engine gate's one calibration (plan step 14, 2026-10-09): how tall is a PP-OCRv6 DETECTION
// box against the ink Tesseract's line box measures, on the same line of the same page? The app's
// word-space shares (ocr-lines.ts WORD_SPACE_SHARE, TITLE_WORD_SPACE_SHARE) are fractions of
// Tesseract's line height, so the gate scales a detected box's height by the median ratio found
// here (gate.mjs DETECTION_BOX_INK_SHARE). Measured on the clean (L0) renders of a finished bench
// run — never on the levels the gate scores — and reported with the word-gap distributions both
// engines give under that share.
//
//   node --experimental-strip-types calibrate.mjs --from ~/degree-audit-samples/bench-out/ocr-full-20261009 [--seeds 25]
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createPaddle, pagePixels, wordsOfLine } from './gate.mjs';
import { BASELINE_CONFIG, createOcrWorker } from '../ocr-run.mjs';

const argv = process.argv.slice(2);
const from = resolve(argv[argv.indexOf('--from') + 1]);
const maxSeeds = argv.includes('--seeds') ? Number(argv[argv.indexOf('--seeds') + 1]) : 25;
const results = JSON.parse(readFileSync(join(from, 'results.json'), 'utf8'));
const l0 = results.rows.filter((r) => r.level === 'L0' && !r.negative && r.pageFigures?.[0]?.dpi > 0).slice(0, maxSeeds);
const paddle = await createPaddle({ backend: 'node', threads: 4 });
const worker = await createOcrWorker(BASELINE_CONFIG);
const ratios = [];
const tessGaps = []; // Tesseract: gaps between words of one engine line, / its line height
const padIntra = []; // Paddle: gaps between words of one detected box, / box height
const padInter = []; // Paddle: gaps between neighbouring boxes on one row, / box height
const q = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : NaN; };
try {
  for (const row of l0) {
    const dir = join(from, row.seed.replace(/[^A-Za-z0-9._-]/g, '_'), 'L0', 'render');
    if (!existsSync(dir)) continue;
    const file = join(dir, readdirSync(dir).filter((f) => /-p1\.png$/.test(f))[0]);
    const { data } = await worker.recognize(file, {}, { blocks: true, text: false });
    const tLines = [];
    for (const b of data.blocks ?? []) for (const p of b.paragraphs ?? []) for (const l of p.lines ?? []) {
      if (!l.bbox || (l.words ?? []).length === 0) continue;
      tLines.push(l);
      const ws = [...l.words].sort((a, c) => a.bbox.x0 - c.bbox.x0);
      const h = l.bbox.y1 - l.bbox.y0;
      for (let i = 1; i < ws.length; i++) tessGaps.push((ws[i].bbox.x0 - ws[i - 1].bbox.x1) / h);
    }
    const px = await pagePixels(file);
    const res = await paddle.service.recognize(px);
    const boxes = res.map((r) => {
      const pts = r.box.points;
      const h = (Math.hypot(pts[0].x - pts[3].x, pts[0].y - pts[3].y) + Math.hypot(pts[1].x - pts[2].x, pts[1].y - pts[2].y)) / 2;
      return { r, h, x0: Math.min(...pts.map((p) => p.x)), x1: Math.max(...pts.map((p) => p.x)), cy: pts.reduce((s, p) => s + p.y, 0) / 4 };
    });
    for (const b of boxes) {
      const ws = wordsOfLine(b.r);
      for (let i = 1; i < ws.length; i++) padIntra.push((ws[i].bbox.x0 - ws[i - 1].bbox.x1) / b.h);
      // The Tesseract line this box sits on: its centre inside the line's box, overlapping in x.
      const t = tLines.find((l) => b.cy >= l.bbox.y0 && b.cy <= l.bbox.y1 && b.x0 < l.bbox.x1 && b.x1 > l.bbox.x0);
      if (t && b.r.text.length >= 4) ratios.push(b.h / (t.bbox.y1 - t.bbox.y0));
    }
    const sorted = [...boxes].sort((a, c) => a.cy - c.cy || a.x0 - c.x0);
    for (const a of sorted) {
      const right = sorted.filter((c) => c !== a && Math.abs(c.cy - a.cy) < 0.4 * Math.min(a.h, c.h) && c.x0 >= a.x1 - 2).sort((m, n) => m.x0 - n.x0)[0];
      if (right) padInter.push((right.x0 - a.x1) / ((a.h + right.h) / 2));
    }
    console.log(`  ${row.seed}: ${boxes.length} boxes, ${tLines.length} Tesseract lines`);
  }
} finally {
  await worker.terminate();
}
const med = q(ratios, 0.5);
console.log(`\nbox height / Tesseract line height: n ${ratios.length}, p10 ${q(ratios, 0.1).toFixed(2)}, p25 ${q(ratios, 0.25).toFixed(2)}, median ${med.toFixed(2)}, p75 ${q(ratios, 0.75).toFixed(2)}, p90 ${q(ratios, 0.9).toFixed(2)} → share ${(1 / med).toFixed(2)}`);
const show = (label, xs, k = 1) => console.log(`${label}: n ${xs.length}, p10 ${(q(xs, 0.1) * k).toFixed(2)}, p25 ${(q(xs, 0.25) * k).toFixed(2)}, median ${(q(xs, 0.5) * k).toFixed(2)}, p75 ${(q(xs, 0.75) * k).toFixed(2)}, p90 ${(q(xs, 0.9) * k).toFixed(2)}, p97 ${(q(xs, 0.97) * k).toFixed(2)}`);
show('Tesseract word gaps / line height', tessGaps);
show('Paddle word gaps inside a box / (box height × share)', padIntra, med);
show('Paddle gaps between boxes on a row / (box height × share)', padInter, med);
