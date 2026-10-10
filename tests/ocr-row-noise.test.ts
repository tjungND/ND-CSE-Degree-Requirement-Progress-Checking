// OCR plan step 2.5 (transcript accuracy program, 2026-10-09): the parser's
// row path on a SCAN's lines — Minerva's multi-term mark as the engine reads
// it, and the junk-code guard on low-confidence lines. Each rule runs only
// when parseExternalTranscript is given the OCR confidences; the same lines
// as a text layer (or read with confidence) are read as before.
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
  describe('the junk-code guard on low-confidence lines', () => {
    const HEAD = ['Some University', 'Fall 2023'];
    /** Read at 90, at 40, and as text: [confident, low, text]. */
    const three = (row: string) => [cells(asScan(90, ...HEAD, row)), cells(asScan(40, ...HEAD, row)), cells(asText(...HEAD, row))] as const;

    it('(1) a subject printed all in lower case is no subject on a low-confidence line — "cs", "soc" and a capitalised "Math" are', () => {
      const [hi, lo, text] = three('ec   20   Grade distribution   3   A');
      assert.equal(hi.length, 1, 'read with confidence, the line still gives its row (the guard is for poor lines only)');
      assert.deepEqual(lo, []);
      assert.deepEqual(text, hi);
      // c, o, s look the same small: the engine reads "CS" and "SOC" that way.
      assert.deepEqual(three('cs   430   Introduction to Algorithms   3.00   A   12.00')[1], ['CS 430 | Introduction to Algorithms | 3 | A']);
      assert.deepEqual(three('soc   100   Introductory Sociology   3.0   B-')[1], ['SOC 100 | Introductory Sociology | 3 | B-']);
      // Addis Ababa prints its subjects capitalised, "Math 1011".
      assert.deepEqual(three('Math   1011   Mathematics for Natural Sciences   4   B+')[1], ['MATH 1011 | Mathematics for Natural Sciences | 4 | B+']);
    });

    it('(2) a code of digits that is a decimal number in its cell is no code on a low-confidence line', () => {
      const [hi, lo] = three('3837.3635   A   granted with distinction');
      assert.equal(hi.length, 1);
      assert.deepEqual(lo, []);
      // A real numeric code keeps its row, with or without the credits read.
      assert.deepEqual(three('052513   Fondamenti di Informatica   10   28')[1], ['052513 | Fondamenti di Informatica | 10 | 28']);
      assert.equal(three('15-640   Distributed Systems   120   A-')[1].length, 1);
    });

    it('(3) a title with no word of four letters or more is specks, not a course, on a low-confidence line', () => {
      const [hi, lo] = three('TC 23   i   fF   &   &   Fd   3   A');
      assert.equal(hi.length, 1);
      assert.deepEqual(lo, []);
      const [hi2, lo2] = three('343332   Br   N   Fis ing   C');
      assert.equal(hi2.length, 1);
      assert.deepEqual(lo2, []);
      assert.deepEqual(three('CS 50300   Operating Systems   3   A')[1], ['CS 50300 | Operating Systems | 3 | A']);
    });
  });
});
