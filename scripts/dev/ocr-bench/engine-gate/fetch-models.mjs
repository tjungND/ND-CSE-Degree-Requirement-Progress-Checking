// The engine gate's models (transcript accuracy program, plan step 14,
// 2026-10-09): PaddleOCR PP-OCRv6_tiny's text detector and recognizer, the
// OFFICIAL ONNX exports PaddlePaddle publishes on Hugging Face (Apache-2.0),
// downloaded at pinned revisions, checked against their pinned SHA-256 and
// byte size, and kept OUTSIDE the repository:
//
//   $TRANSCRIPT_SAMPLES/engine-gate-models/   (default ~/degree-audit-samples/engine-gate-models/)
//     PP-OCRv6_tiny_det.onnx            1.78 MB
//     PP-OCRv6_tiny_rec.onnx            4.46 MB
//     PP-OCRv6_tiny_det.inference.yml   the detector's official pre/post-processing settings
//     PP-OCRv6_tiny_rec.inference.yml   the recognizer's settings, its character list among them
//     ppocrv6_tiny_dict.txt             that character list, one per line (6904), cut from the yml
//
// Nothing here is bundled, committed or loaded by the app. The models are
// never fetched by `npm ci` at the root, by the sheet-sync Action or by the
// Pages deploy — only by a maintainer running this file by hand:
//
//   cd scripts/dev/ocr-bench/engine-gate && npm install && node fetch-models.mjs
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const samples = process.env['TRANSCRIPT_SAMPLES'] ?? join(homedir(), 'degree-audit-samples');
export const MODELS_DIR = process.env['ENGINE_GATE_MODELS'] ?? join(samples, 'engine-gate-models');

/** Every file, at the revision measured on 2026-10-09 (the Hugging Face commit ids
 * and the LFS SHA-256 the hub lists for the ONNX files). */
const FILES = [
  { name: 'PP-OCRv6_tiny_det.onnx', repo: 'PaddlePaddle/PP-OCRv6_tiny_det_onnx', rev: '2ba1506c0380b8f0b03dd142459aac66d4421f6c', path: 'inference.onnx', bytes: 1780590, sha256: '193bab7a04fca699a6c82e6abb5b81bdb28177f0abd4062552b04908dafb19f8' },
  { name: 'PP-OCRv6_tiny_rec.onnx', repo: 'PaddlePaddle/PP-OCRv6_tiny_rec_onnx', rev: '2612ab37152ae0a677521bae4e1e3d4fb4cf7c30', path: 'inference.onnx', bytes: 4462639, sha256: '9ef676d6ed3c88256a2d92c640c44f25b0c40947e111b14b8be8f594091563e6' },
  { name: 'PP-OCRv6_tiny_det.inference.yml', repo: 'PaddlePaddle/PP-OCRv6_tiny_det_onnx', rev: '2ba1506c0380b8f0b03dd142459aac66d4421f6c', path: 'inference.yml', bytes: 883 },
  { name: 'PP-OCRv6_tiny_rec.inference.yml', repo: 'PaddlePaddle/PP-OCRv6_tiny_rec_onnx', rev: '2612ab37152ae0a677521bae4e1e3d4fb4cf7c30', path: 'inference.yml', bytes: 55571 },
];

/** The paddleocr runtime's PP-OCRv6_tiny preset expects 6904 characters (6906 output classes:
 * the CTC blank and the space added). */
export const DICTIONARY_LENGTH = 6904;

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

/** The recognizer's `PostProcess.character_dict` list, read from its inference.yml without a
 * YAML library: the lines `  - <scalar>` after `  character_dict:`, each scalar plain,
 * single-quoted ('' is a quote) or double-quoted (JSON escapes). */
export function dictionaryFromYml(yml) {
  const lines = yml.split(/\r?\n/);
  const start = lines.findIndex((l) => /^\s*character_dict:\s*$/.test(l));
  if (start < 0) throw new Error('no character_dict in the recognizer yml');
  const out = [];
  for (const line of lines.slice(start + 1)) {
    const m = /^ {2}- (.*)$/.exec(line);
    if (!m) break;
    const v = m[1];
    if (v.startsWith("'")) out.push(v.slice(1, -1).replace(/''/g, "'"));
    else if (v.startsWith('"')) out.push(JSON.parse(v));
    else out.push(v);
  }
  return out;
}

export async function fetchModels({ say = console.log } = {}) {
  mkdirSync(MODELS_DIR, { recursive: true });
  for (const f of FILES) {
    const file = join(MODELS_DIR, f.name);
    const ok = (buf) => buf.length === f.bytes && (f.sha256 === undefined || sha256(buf) === f.sha256);
    if (existsSync(file) && ok(readFileSync(file))) {
      say(`  ${f.name}: present, verified`);
      continue;
    }
    const url = `https://huggingface.co/${f.repo}/resolve/${f.rev}/${f.path}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (!ok(buf)) throw new Error(`${url}: ${buf.length} bytes, sha256 ${sha256(buf)} — not the pinned file (${f.bytes} bytes${f.sha256 ? `, ${f.sha256}` : ''}); not kept`);
    writeFileSync(file, buf);
    say(`  ${f.name}: downloaded (${buf.length} bytes) from ${url}`);
  }
  const dict = dictionaryFromYml(readFileSync(join(MODELS_DIR, 'PP-OCRv6_tiny_rec.inference.yml'), 'utf8'));
  if (dict.length !== DICTIONARY_LENGTH) throw new Error(`the recognizer's character list has ${dict.length} entries, not ${DICTIONARY_LENGTH}`);
  writeFileSync(join(MODELS_DIR, 'ppocrv6_tiny_dict.txt'), dict.join('\n') + '\n');
  say(`  ppocrv6_tiny_dict.txt: ${dict.length} characters`);
  return MODELS_DIR;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(`engine-gate models → ${MODELS_DIR}`);
  await fetchModels();
}
