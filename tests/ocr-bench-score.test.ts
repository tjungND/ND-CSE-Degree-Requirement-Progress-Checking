// Pins the OCR benchmark's own scoring pieces (scripts/dev/ocr-bench/score.mts,
// 2026-10-09, transcript accuracy program, OCR step 9): the Levenshtein
// distance, the per-page line CER, the flag precision/recall inputs and the
// "rows right" count — the parts that are not the replay's scorer (which
// tests/replay-score.test.ts pins). The bench itself never runs in npm test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flagScore, levenshtein, lineCer, normalizeLines, rightRowCount } from '../scripts/dev/ocr-bench/score.mts';
import type { ExternalCourseCandidate } from '../src/transcript/external.ts';

test('levenshtein: the textbook distances', () => {
  assert.equal(levenshtein('', ''), 0);
  assert.equal(levenshtein('abc', ''), 3);
  assert.equal(levenshtein('', 'abc'), 3);
  assert.equal(levenshtein('kitten', 'sitting'), 3);
  assert.equal(levenshtein('CS 50300 Operating Systems 3.0 A', 'CS 50300 Operating Systems 3.0 A'), 0);
  assert.equal(levenshtein('3.00', '300'), 1); // the engine's dropped decimal point
});

test('normalizeLines collapses whitespace and drops empty lines', () => {
  assert.equal(normalizeLines(['CS 500   Topics   3   A', '', '  next  ']), 'CS 500 Topics 3 A\nnext');
});

test('lineCer compares page by page and charges a page the engine never produced', () => {
  const truth = ['Fall 2023', 'CS 500   Topics   3.0   A', '', 'Spring 2024', 'CS 501   More   3.0   B', ''];
  const same = lineCer(truth, truth);
  assert.deepEqual(same, { distance: 0, truthChars: normalizeLines(truth.slice(0, 2)).length + normalizeLines(truth.slice(3, 5)).length, pagesCompared: 2 });
  // One wrong digit on page 1; page 2 missing (MAX_PAGES, a lost page) costs its whole length.
  const ocr = ['Fall 2023', 'CS 500 Topics 3.6 A', ''];
  const partial = lineCer(ocr, truth);
  assert.equal(partial.pagesCompared, 1);
  assert.equal(partial.distance, 1 + normalizeLines(truth.slice(3, 5)).length);
});

const row = (c: Partial<ExternalCourseCandidate> & { courseId: string }): ExternalCourseCandidate => ({ title: 'Topics', credits: 3, grade: 'A', year: 2023, season: 'fall', ...c });

test('flagScore: flagged rows against rows actually wrong', () => {
  const expected = { courses: ['CS 500 | Topics | 3 | A | fall 2023', 'CS 501 | More | 3 | B | fall 2023'] };
  const parsed = [
    row({ courseId: 'CS 500', lowConfidence: true }), // flagged, right → a false alarm
    row({ courseId: 'CS 501', title: 'More', grade: 'B', credits: 3.6, lowConfidence: true }), // flagged, wrong credits → a hit
    row({ courseId: 'CS 999' }), // an extra row, not flagged → a miss
  ];
  assert.deepEqual(flagScore(parsed, expected), { flagged: 2, wrong: 2, flaggedWrong: 1 });
  assert.equal(rightRowCount(parsed, expected), 1);
  // On a negative every parsed row is wrong.
  assert.deepEqual(flagScore([row({ courseId: 'CS 500' })], { courses: [], negative: true }), { flagged: 0, wrong: 1, flaggedWrong: 0 });
});
