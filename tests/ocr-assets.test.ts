// The bundled OCR engine must stay small (2026-10-09, transcript accuracy
// program, OCR step 9 — the plan's engine gate): public/ocr/ — the worker,
// the WASM core and the English model the app fetches same-origin when a
// student chooses OCR — is capped at 7.5 MB until the DGS raises the cap. A
// second engine or a bigger model fails this test loudly, with the numbers,
// instead of quietly adding to every student's first OCR download.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const OCR_DIR = join(import.meta.dirname, '..', 'public', 'ocr');
const CAP_BYTES = 7.5 * 1024 * 1024;

test('public/ocr/ stays at or under 7.5 MB (the OCR download cap)', () => {
  const files = readdirSync(OCR_DIR).filter((f) => !f.startsWith('.'));
  assert.ok(files.length >= 3, `public/ocr/ should hold the worker, the core and the model; found ${files.join(', ') || 'nothing'}`);
  const sizes = files.map((f) => ({ f, bytes: statSync(join(OCR_DIR, f)).size }));
  const total = sizes.reduce((n, s) => n + s.bytes, 0);
  const mb = (b: number) => (b / 1024 / 1024).toFixed(2) + ' MB';
  assert.ok(
    total <= CAP_BYTES,
    `public/ocr/ is ${mb(total)} — over the ${mb(CAP_BYTES)} cap (${sizes.map((s) => `${s.f} ${mb(s.bytes)}`).join(', ')}). The cap is a DGS decision (docs/OCR-BENCHMARK.md); raise it there and here together, or shrink the engine.`,
  );
});
