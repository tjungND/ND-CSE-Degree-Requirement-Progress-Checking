// Pins the pure stage of the OCR path (src/transcript/ocr-lines.ts — OCR
// step 10, 2026-10-09, transcript accuracy program): the engine's blocks → the
// parser's lines, with each line's INNER spacing kept so a column gap the
// engine printed as several spaces reaches the parser's three-space cell
// split. The engine itself never runs here; the bench (npm run ocr-bench)
// measures it. The bench's runner and scripts/dev/ocr-lines.mjs import the
// same module, so what this pins is also what they produce.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { linesFromBlocks, OCR_ENGINE_PARAMETERS, ocrLineText } from '../src/transcript/ocr-lines.ts';

test('ocrLineText keeps every inner space and trims only the ends', () => {
  // A Banner-style row as the engine prints it with preserve_interword_spaces:
  // the column gaps are runs of spaces, the line ends in the engine's newline.
  const raw = 'CS 50300      Operating Systems         3.00    A\n';
  assert.equal(ocrLineText(raw), 'CS 50300      Operating Systems         3.00    A');
  // The three-space gap a text PDF's layout stage renders survives untouched.
  assert.equal(ocrLineText('CS 500   Topics   3   A'), 'CS 500   Topics   3   A');
  // Indentation (a centred heading) and a Windows line end are trimmed away.
  assert.equal(ocrLineText('      UNOFFICIAL TRANSCRIPT   \r\n'), 'UNOFFICIAL TRANSCRIPT');
  // One or two spaces inside a title stay inside the title.
  assert.equal(ocrLineText('Intro  to Programming'), 'Intro  to Programming');
  // A stray inner line break becomes one space, never a glued word.
  assert.equal(ocrLineText('Fall\n2023'), 'Fall 2023');
  assert.equal(ocrLineText('\n'), '');
  assert.equal(ocrLineText(''), '');
});

test('the pre-2026-10-09 collapse is gone: a wide gap is no longer one space', () => {
  const collapsed = 'CS 50300      Operating Systems         3.00    A'.replace(/\s+/g, ' ');
  assert.equal(collapsed, 'CS 50300 Operating Systems 3.00 A');
  assert.notEqual(ocrLineText('CS 50300      Operating Systems         3.00    A'), collapsed);
  // The parser's cell split (three or more spaces) has something to fire on.
  assert.deepEqual(ocrLineText('CS 50300      Operating Systems         3.00    A').split(/\s{3,}/), ['CS 50300', 'Operating Systems', '3.00', 'A']);
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
    { text: 'CS 50300      Operating Systems         3.00    A', confidence: 88.25 },
  ]);
  // The engine reports no blocks (an empty page) as null or undefined.
  assert.deepEqual(linesFromBlocks(null), []);
  assert.deepEqual(linesFromBlocks(undefined), []);
  assert.deepEqual(linesFromBlocks([]), []);
});

test('the engine parameters the app sets are exactly preserve_interword_spaces=1', () => {
  assert.deepEqual({ ...OCR_ENGINE_PARAMETERS }, { preserve_interword_spaces: '1' });
  assert.ok(Object.isFrozen(OCR_ENGINE_PARAMETERS));
});
