// "Is this a transcript at all?" (DGS 2026-10-10, answer 4a — the gate the
// 2026-10-09 DECISIONS row proposed, adopted as proposed): a text layer with
// ONE course-like line, no university named and no GPA or totals line is a
// course outline, a syllabus or a class schedule — its row is not offered.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseExternalTranscript } from '../src/transcript/external.ts';

const FILLER = Array(12).fill('Record issued by the Registrar — verify with the issuing office before relying on it.');
// The McGill project's course-outline page, in the shape it prints.
const OUTLINE = ['1/15/26, 10:30 AM   COMP 250 Course Outline', 'COMP 250 Intro to Computer Science', 'Fall 2025', 'COMP 250   001 Intro to Computer Science   3', 'Prerequisite: COMP 202. Bring your UNOFFICIAL Transcript to advising if you need a prerequisite waiver.', ...FILLER];

describe('the transcript gate', () => {
  it('one course, no university, no totals: not a transcript, nothing offered', () => {
    const r = parseExternalTranscript(OUTLINE);
    assert.equal(r.notATranscript, true);
    assert.deepEqual(r.courses, []);
  });
  it('any one of the three keeps the row: a university named, a GPA or totals line, a second course', () => {
    for (const [why, lines] of [
      ['a university', ['Purdue University', ...OUTLINE]],
      ['a GPA line', [...OUTLINE, 'Term GPA: 3.00']],
      ['a totals line', [...OUTLINE, 'Term Totals   3.000   3.000']],
      ['credits earned', [...OUTLINE, 'Credits Earned: 3']],
      ['a second course', [...OUTLINE.slice(0, 4), 'COMP 251   001 Algorithms and Data Structures   3', ...OUTLINE.slice(4)]],
      // Review, 2026-10-10: a figure line in another system's words…
      ...(['SGPA: 9.00', 'SPI: 9.50   CPI: 9.50', 'WAM: 85.000', 'Weighted percentage: 72.4%', 'Weighted Average Mark: 85.0', 'Credits Attempted: 4   Credits Passed: 4'] as const).map((f) => [f, [...OUTLINE, f]] as const),
      // …a name the university reader does not recognise, or a record title
      // (a bare acronym with no institution word — "IIT Bombay" — still needs
      // its figure line: such a record prints SPI / CPI)…
      ...(['UCLA Extension', 'Georgia Tech', 'NYU Tandon School of Engineering', 'Official Transcript'] as const).map((h) => [h, [h, ...OUTLINE]] as const),
      // …and a transfer row set aside: the document printed two courses.
      ['a transfer row', [...OUTLINE.slice(0, 2), 'Transfer Credit from Dawson College', 'Course   Description   Attempted   Earned   Grade', 'MATH 140   Calculus I   3.000   3.000   TR', ...OUTLINE.slice(2)]],
    ] as const) {
      const r = parseExternalTranscript([...lines]);
      assert.equal(r.notATranscript, undefined, why);
      assert.ok(r.courses.length >= 1, why);
    }
  });
  it('a scan keeps its row: OCR lines and a scanner’s own layer are never gated (DGS 2026-10-10, answer 2)', () => {
    assert.equal(parseExternalTranscript(OUTLINE, OUTLINE.map(() => 95)).courses.length, 1);
    const layer = parseExternalTranscript(OUTLINE, OUTLINE.map(() => 0), { scannerLayer: true });
    assert.equal(layer.notATranscript, undefined);
    assert.equal(layer.courses.length, 1);
  });
});
