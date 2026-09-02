// The best-effort parser for transcripts from other universities (line-level —
// pdfToLines is exercised by the e2e run). Its contract: candidates only, never
// silent guesses — unmappable grades stay unchosen, scans are rejected, ND
// transcripts are redirected to the ND uploader.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseExternalTranscript } from '../src/transcript/external.ts';

const PURDUE = [
  'Purdue University',
  'Office of the Registrar',
  'Unofficial Transcript',
  'Student: John Q. Boilermaker',
  '',
  'Fall 2023',
  'CS 50300   Operating Systems                 3.0   A',
  'CS 59000   Special Topics in Systems         3.0   A-',
  '',
  'Spring 2024',
  'CS 58000   Algorithm Design                  3.0   B+',
  '',
  'Cumulative GPA: 3.83',
  'Page 1 of 1   Generated 2024-06-01',
].concat(Array(20).fill('Purdue University Registrar record — not an official copy unless sealed.'));

describe('external transcript parsing', () => {
  it('extracts course candidates with credits, mapped grades and the term year', () => {
    const r = parseExternalTranscript(PURDUE);
    assert.equal(r.hasTextLayer, true);
    assert.equal(r.looksLikeNotreDame, false);
    assert.equal(r.university, 'Purdue University');
    assert.equal(r.courses.length, 3);
    assert.deepEqual(
      r.courses.map((c) => [c.courseId, c.credits, c.grade, c.year]),
      [
        ['CS 50300', 3, 'A', 2023],
        ['CS 59000', 3, 'A-', 2023],
        ['CS 58000', 3, 'B+', 2024],
      ],
    );
    assert.match(r.courses[0]?.title ?? '', /Operating Systems/);
  });

  it('handles all-digit course codes and foreign grade tokens (kept raw, not guessed)', () => {
    const r = parseExternalTranscript([
      'Tsinghua University   Academic Transcript',
      '2019-2020 Autumn Term',
      '30240233   Operating Systems        4    92',
      '30240551   Algorithm Design         3    A+',
      ...Array(10).fill('Record issued by the Registrar — verify with the issuing office before relying on it.'),
    ]);
    assert.equal(r.university?.includes('Tsinghua University'), true);
    assert.equal(r.courses.length, 2);
    assert.equal(r.courses[0]?.courseId, '30240233');
    assert.equal(r.courses[0]?.grade, undefined); // "92" is not guessed at
    assert.equal(r.courses[0]?.credits, 4);
    assert.equal(r.courses[0]?.year, 2019);
    assert.equal(r.courses[1]?.grade, undefined); // A+ is not an ND grade
    assert.equal(r.courses[1]?.rawGrade, 'A+');
  });

  it('rejects PDFs with no text layer (scans/photos — system-generated only)', () => {
    const r = parseExternalTranscript(['', '  ', '']);
    assert.equal(r.hasTextLayer, false);
    assert.equal(r.courses.length, 0);
  });

  it('recognizes a Notre Dame transcript and does not treat it as external', () => {
    const r = parseExternalTranscript(
      Array(10).fill('University of Notre Dame   Unofficial Academic Transcript   nd.edu').concat(['CSE 60641   Graduate Operating Systems   3.0   A']),
    );
    assert.equal(r.looksLikeNotreDame, true);
  });

  it('ignores prose, totals and header lines (code + credits-or-grade required)', () => {
    const r = parseExternalTranscript([
      'Some University   Transcript of Records',
      'GPA: 3.90   Credits earned: 120',
      'Dean’s List   Fall 2020',
      'MATH 21001   Linear Algebra   4.0   A',
      '2020   was a strange year for everyone',
      ...Array(10).fill('Record issued by the Registrar — verify with the issuing office before relying on it.'),
    ]);
    assert.equal(r.courses.length, 1);
    assert.equal(r.courses[0]?.courseId, 'MATH 21001');
  });
});
