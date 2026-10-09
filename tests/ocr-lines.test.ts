// Pins the pure stage of the OCR path (src/transcript/ocr-lines.ts — OCR
// step 10, 2026-10-09, transcript accuracy program): the engine's blocks → the
// parser's lines. The shipped rule collapses each line's whitespace; the
// variant step 10 measured and did not adopt (inner spacing kept, so a column
// gap could reach the parser's three-space cell split) stays as
// `ocrKeepSpaces` for the bench's --interword knob. The engine itself never
// runs here; the bench (npm run ocr-bench) measures it. The bench's runner and
// scripts/dev/ocr-lines.mjs import the same module, so what this pins is also
// what they produce.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { linesFromBlocks, OCR_ENGINE_PARAMETERS, ocrKeepSpaces, ocrLineText } from '../src/transcript/ocr-lines.ts';

test('ocrLineText (shipped) collapses every run of whitespace to one space and trims the ends', () => {
  // A Banner-style row as the engine prints it with preserve_interword_spaces on
  // (the bench's --interword variant); the app's rule flattens it either way.
  const raw = 'CS 50300      Operating Systems         3.00    A\n';
  assert.equal(ocrLineText(raw), 'CS 50300 Operating Systems 3.00 A');
  // The engine's own default output (one space per gap, a trailing newline).
  assert.equal(ocrLineText('CS 50300 Operating Systems 3.00 A\n'), 'CS 50300 Operating Systems 3.00 A');
  // Indentation, a Windows line end, a stray inner line break.
  assert.equal(ocrLineText('      UNOFFICIAL TRANSCRIPT   \r\n'), 'UNOFFICIAL TRANSCRIPT');
  assert.equal(ocrLineText('Fall\n2023'), 'Fall 2023');
  assert.equal(ocrLineText('\n'), '');
  assert.equal(ocrLineText(''), '');
});

test('ocrKeepSpaces (the measured, unadopted variant) keeps every inner space and trims only the ends', () => {
  const raw = 'CS 50300      Operating Systems         3.00    A\n';
  assert.equal(ocrKeepSpaces(raw), 'CS 50300      Operating Systems         3.00    A');
  // The parser's cell split (three or more spaces) would have something to fire on …
  assert.deepEqual(ocrKeepSpaces(raw).split(/\s{3,}/), ['CS 50300', 'Operating Systems', '3.00', 'A']);
  // … which is exactly what the shipped rule denies it.
  assert.deepEqual(ocrLineText(raw).split(/\s{3,}/), ['CS 50300 Operating Systems 3.00 A']);
  assert.equal(ocrKeepSpaces('      UNOFFICIAL TRANSCRIPT   \r\n'), 'UNOFFICIAL TRANSCRIPT');
  assert.equal(ocrKeepSpaces('Intro  to Programming'), 'Intro  to Programming');
  assert.equal(ocrKeepSpaces('Fall\n2023'), 'Fall 2023');
  assert.equal(ocrKeepSpaces('\n'), '');
});

test('linesFromBlocks walks blocks → paragraphs → lines, drops empty lines, keeps the LINE confidence', () => {
  const blocks = [
    {
      paragraphs: [
        { lines: [{ text: 'Purdue University\n', confidence: 96.5 }, { text: '   \n', confidence: 0 }] },
        { lines: [{ text: 'Fall 2023\n', confidence: 91 }] },
      ],
    },
    { paragraphs: [{ lines: [{ text: 'CS 50300      Operating Systems         3.00    A\n', confidence: 88.25 }] }] },
    { paragraphs: [] },
    {},
  ];
  assert.deepEqual(linesFromBlocks(blocks), [
    { text: 'Purdue University', confidence: 96.5 },
    { text: 'Fall 2023', confidence: 91 },
    { text: 'CS 50300 Operating Systems 3.00 A', confidence: 88.25 },
  ]);
  // The engine reports no blocks (an empty page) as null or undefined.
  assert.deepEqual(linesFromBlocks(null), []);
  assert.deepEqual(linesFromBlocks(undefined), []);
  assert.deepEqual(linesFromBlocks([]), []);
});

test('the app sets no engine parameter today (preserve_interword_spaces was measured and not adopted)', () => {
  assert.deepEqual({ ...OCR_ENGINE_PARAMETERS }, {});
  assert.ok(Object.isFrozen(OCR_ENGINE_PARAMETERS));
});
