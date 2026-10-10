// OCR numeric corrections (Batch C, the DGS's answer (4) of 2026-10-09: "OCR-
// only numeric cells: unambiguous letter-for-digit shapes inside credits/grade
// cells are corrected, the ⚠ flag stays and the raw reading is shown beside the
// value; names, titles and the university string are never altered").
// `ocrCellCorrection` is the token rule; `parseExternalTranscript` given
// confidences (the OCR path) uses a corrected token only where it fills the
// row's credits or grade that the scan's own reading left empty, and never
// changes a title word, a course code or the university; a text layer is never
// corrected. The preview keeps the raw reading beside the value.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ocrCellCorrection, parseExternalTranscript } from '../src/transcript/external.ts';
import { ocrRawNote, ocrRawTitle, previewRowOf } from '../src/ui/external-upload.ts';

/** A composed scanned page: the university and term above the rows, a legend
 * below (public-domain wording; no real record). */
const page = (...rows: string[]): string[] => [
  'Purdue University',
  'Office of the Registrar',
  'Official Academic Transcript',
  'Student: Jane Q. Student',
  'Fall 2023',
  ...rows,
  '',
  'This document lists the courses taken by the student at the university and is issued by the registrar.',
  'Credits are semester hours. Grades: A, A-, B+, B, B-, C+, C, D, F.',
];
const ocr = (lines: string[], confidence = 92) => parseExternalTranscript(lines, lines.map(() => confidence));

describe('ocrCellCorrection — the token rule', () => {
  it('rewrites a number written with a letter for a digit, and a grade whose plus was read as "t"', () => {
    assert.equal(ocrCellCorrection('3.O'), '3.0');
    assert.equal(ocrCellCorrection('3.o'), '3.0');
    assert.equal(ocrCellCorrection('l.5'), '1.5');
    assert.equal(ocrCellCorrection('I.0'), '1.0');
    assert.equal(ocrCellCorrection('4,O0'), '4,00');
    assert.equal(ocrCellCorrection('3.0O0'), '3.000');
    assert.equal(ocrCellCorrection('8O'), '80');
    assert.equal(ocrCellCorrection('|2'), '12');
    assert.equal(ocrCellCorrection('Bt'), 'B+');
    assert.equal(ocrCellCorrection('At'), 'A+');
    assert.equal(ocrCellCorrection('Ct'), 'C+');
    assert.equal(ocrCellCorrection('Dt'), 'D+');
  });

  it('leaves alone a word with no real digit, a clean number, and every ambiguous shape', () => {
    for (const t of ['IO', 'I', 'l', 'O', 'Il', 'II', '3.0', '12', 'A', 'B+', 'S', '5', 'B8', '3:0', '38', 'Et', 'Ft', 'bt', 'B4', 'At,', 'Algorithms', '1234O', '3.0000', 'CS']) {
      assert.equal(ocrCellCorrection(t), undefined, t);
    }
  });
});

describe('the OCR row path: a corrected cell fills only what the scan left empty', () => {
  it('"3.O" fills the empty credits; the row is flagged and carries the raw reading', () => {
    const [row, ...rest] = ocr(page('CS 50300   Operating Systems   3.O   A')).courses;
    assert.equal(rest.length, 0);
    assert.deepEqual(
      { id: row!.courseId, title: row!.title, credits: row!.credits, grade: row!.grade, flagged: row!.lowConfidence, read: row!.ocrRead },
      { id: 'CS 50300', title: 'Operating Systems', credits: 3, grade: 'A', flagged: true, read: { credits: '3.O' } },
    );
  });

  it('"Bt" fills the empty grade as B+; both corrections on one row are reported', () => {
    const [bt] = ocr(page('CS 50300   Operating Systems   3.0   Bt')).courses;
    assert.equal(bt!.grade, 'B+');
    assert.deepEqual(bt!.ocrRead, { grade: 'Bt' });
    assert.equal(bt!.lowConfidence, true);
    const [both] = ocr(page('CS 50300   Operating Systems   3.O   Bt   12.O')).courses;
    assert.deepEqual({ credits: both!.credits, grade: both!.grade, read: both!.ocrRead }, { credits: 3, grade: 'B+', read: { credits: '3.O', grade: 'Bt' } });
  });

  it('under a header too: the corrected credits cell lets the row fit its columns', () => {
    const [row] = ocr(page('Course   Title   Credits   Grade   Points', 'CS 50300   Operating Systems   3.O   A   12.00')).courses;
    assert.deepEqual({ title: row!.title, credits: row!.credits, grade: row!.grade, read: row!.ocrRead }, { title: 'Operating Systems', credits: 3, grade: 'A', read: { credits: '3.O' } });
  });

  it('a misread cell the raw reading took into the title leaves it — the title words themselves are never rewritten', () => {
    const [row] = ocr(page('CS 50300   Operating Systems   l.0   A')).courses;
    assert.deepEqual({ title: row!.title, credits: row!.credits, read: row!.ocrRead }, { title: 'Operating Systems', credits: 1, read: { credits: 'l.0' } });
  });

  it('a title word is never corrected and a value the scan already read is never replaced ("Course I1" is a misread "Course II")', () => {
    const [vaasa] = ocr(page('CS 50300   Course I1   5.00   A')).courses;
    assert.deepEqual({ title: vaasa!.title, credits: vaasa!.credits, grade: vaasa!.grade, read: vaasa!.ocrRead }, { title: 'Course I1', credits: 5, grade: 'A', read: undefined });
    const [at] = ocr(page('CS 50300   Data At Scale   3.0   A')).courses;
    assert.deepEqual({ title: at!.title, grade: at!.grade, read: at!.ocrRead }, { title: 'Data At Scale', grade: 'A', read: undefined });
  });

  it('the course code is never corrected — "CS 58O0" stays as the scan shows it', () => {
    const [row] = ocr(page('CS 58O0   Algorithm Design   3.O   B')).courses;
    assert.equal(row!.courseId, 'CS 58O0');
    assert.deepEqual(row!.ocrRead, { credits: '3.O' });
  });

  it('a TEXT layer is never corrected: no confidences, no correction', () => {
    const [row] = parseExternalTranscript(page('CS 50300   Operating Systems   3.O   A')).courses;
    assert.equal(row!.credits, undefined);
    assert.equal(row!.ocrRead, undefined);
    assert.equal(row!.lowConfidence, undefined);
  });

  it('the university string is read exactly as the scan shows it — its letters shaped like digits included', () => {
    for (const name of ['lllinois Institute of Technology', 'IOWA STATE UNIVERSITY']) {
      const lines = [name, ...page('CS 50300   Operating Systems   3.O   A').slice(1)];
      const parsed = ocr(lines);
      assert.equal(parsed.university, name);
      assert.deepEqual(parsed.courses[0]!.ocrRead, { credits: '3.O' }, 'the row on the same page is still corrected');
    }
  });

  it('a row flagged by the correction alone was read confidently — the flag is the correction\'s', () => {
    const [clean] = ocr(page('CS 50300   Operating Systems   3.0   A'), 95).courses;
    assert.equal(clean!.lowConfidence, undefined);
    const [fixed] = ocr(page('CS 50300   Operating Systems   3.O   A'), 95).courses;
    assert.equal(fixed!.lowConfidence, true);
  });
});

describe('the preview keeps the raw reading beside the value', () => {
  it('previewRowOf copies it; the note and its hover text say what the scan showed', () => {
    const [c] = ocr(page('CS 50300   Operating Systems   3.O   Bt')).courses;
    const r = previewRowOf(c!, 'masters');
    assert.deepEqual(r.ocrRead, { credits: '3.O', grade: 'Bt' });
    assert.equal(r.credits, 3);
    assert.equal(r.grade, 'B+');
    assert.equal(r.lowConfidence, true);
    assert.notEqual(r.ocrRead, c!.ocrRead, 'a copy, not the parser\'s object');
    assert.equal(ocrRawNote('3.O'), 'scan shows “3.O”');
    assert.equal(ocrRawTitle('Bt'), 'The scan shows “Bt” here — a letter where a digit or a plus sign belongs — so the box was filled in with what it stands for. Check it against your transcript.');
  });
});
