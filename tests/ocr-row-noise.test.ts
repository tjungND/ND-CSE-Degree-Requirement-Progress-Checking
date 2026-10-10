// OCR plan step 2.5 (transcript accuracy program, 2026-10-09): the parser's
// row path on a SCAN's lines — Minerva's multi-term mark as the engine reads
// it. Each rule runs only when parseExternalTranscript is given the OCR
// confidences; the same lines as a text layer are read as before.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseExternalTranscript } from '../src/transcript/external.ts';

const FILLER = Array(12).fill('Record issued by the Registrar — verify with the issuing office before relying on it.');
/** The lines as a text layer. */
const asText = (...lines: string[]) => parseExternalTranscript([...lines, ...FILLER]);
/** The lines as an OCR reading: every line at 90, the last one at `rowConfidence`. */
const asScan = (rowConfidence: number, ...lines: string[]) =>
  parseExternalTranscript([...lines, ...FILLER], [...lines.map((_, i) => (i === lines.length - 1 ? rowConfidence : 90)), ...FILLER.map(() => 90)]);
const cells = (r: ReturnType<typeof parseExternalTranscript>) => r.courses.map((c) => `${c.courseId} | ${c.title} | ${c.credits ?? ''} | ${c.grade ?? c.rawGrade ?? ''}`);

describe('OCR row noise (plan step 2.5)', () => {
  describe("Minerva's multi-term mark as a scan reads it", () => {
    const HEAD = ['McGill University', 'Fall 2025', 'Subject   Number   Title   Cr./C.E.U. Grade   Remarks Earned   Class', 'Avg.'];
    it('a symbol (or the superscript read as "2") before the section and the title is the mark: both leave the title', () => {
      const diamond = 'ECSE 458D1 <>   001 Capstone Design Project   3   A   3   B';
      const two = 'MATH 470J1 2   001   Honours Research Project   1   A-   1   B';
      assert.deepEqual(cells(asScan(90, ...HEAD, diamond)), ['ECSE 458D1 | Capstone Design Project | 3 | A']);
      assert.deepEqual(cells(asScan(90, ...HEAD, two)), ['MATH 470J1 | Honours Research Project | 1 | A-']);
      // A text layer never prints the mark that way; its reading is unchanged.
      assert.deepEqual(cells(asText(...HEAD, diamond)), ['ECSE 458D1 | <> 001 Capstone Design Project | 3 | A']);
    });
    it('a lone digit with no zero-padded section after it is left where it was', () => {
      const row = 'CS 101   2   Intro to Programming   3   A';
      assert.deepEqual(cells(asScan(90, 'Some University', 'Fall 2023', row)), cells(asText('Some University', 'Fall 2023', row)));
    });
  });
});
