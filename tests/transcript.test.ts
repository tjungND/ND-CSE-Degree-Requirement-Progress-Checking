// Transcript text parsing (the PDF layer is a thin pdfjs wrapper tested in the
// browser; the parsing itself is pure text → data and lives here).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseTranscript } from '../src/transcript/parse.ts';

const ND_TRANSCRIPT = `
University of Notre Dame
Unofficial Academic Transcript
This is not an official transcript.
Name : Jane Q. Student
Program : Computer Science and Engineering

TRANSFER CREDIT ACCEPTED BY INSTITUTION
202010: Purdue University
CS 50300 GR Operating Systems A 3.000 12.000
CS 51400 GR Numerical Methods TR 3.000

INSTITUTION CREDIT
Fall Semester 2026
CSE 60641 GR Graduate Operating Systems A 3.000 12.000
CSE 63801 GR Research Seminar I S 1.000 0.000
ACMS 60855 GR Spatio-Temporal Statistics B+ 3.000 9.999
CSE 60111 GR Complexity and Algorithms W 3.000

Spring Semester 2027
CSE 60321 GR Advanced Computer Architecture B- 3.000 8.001 R
CSE 60111 GR Complexity and Algorithms A- 3.000 11.001

TRANSCRIPT TOTALS (GRADUATE)
Attempt Hours Passed Hours Earned Hours GPA Hours Quality Points GPA
Total Institution: 16.000 13.000 13.000 12.000 40.002 3.334
Total Transfer: 3.000 3.000 3.000 0.000 0.000 0.000
Overall: 19.000 16.000 16.000 12.000 40.002 3.334

COURSES IN PROGRESS
Fall Semester 2027
CSE 60876 GR Research Methods 3.000
CSE 98900 GR Research and Dissertation 6.000
`.split('\n');

describe('transcript parsing', () => {
  const parsed = parseTranscript(ND_TRANSCRIPT);

  it('recognizes a Notre Dame transcript', () => {
    assert.equal(parsed.isNotreDame, true);
  });

  it('reads graded institution courses with term, grade, credits, title', () => {
    const os = parsed.courses.find((c) => c.courseId === 'CSE 60641');
    assert.deepEqual(os, {
      courseId: 'CSE 60641',
      title: 'Graduate Operating Systems',
      credits: 3,
      grade: 'A',
      term: { season: 'fall', year: 2026 },
      origin: 'nd',
      institution: undefined,
    });
    const seminar = parsed.courses.find((c) => c.courseId === 'CSE 63801');
    assert.equal(seminar?.grade, 'S');
    assert.equal(seminar?.credits, 1);
    const acms = parsed.courses.find((c) => c.courseId === 'ACMS 60855');
    assert.equal(acms?.grade, 'B+');
  });

  it('handles retakes, repeat markers, and withdrawn courses', () => {
    const attempts = parsed.courses.filter((c) => c.courseId === 'CSE 60111');
    assert.equal(attempts.length, 1, 'the W attempt is skipped, the A- retake kept');
    assert.equal(attempts[0]?.grade, 'A-');
    const arch = parsed.courses.find((c) => c.courseId === 'CSE 60321');
    assert.equal(arch?.grade, 'B-', "the trailing 'R' repeat marker is ignored");
    assert.ok(parsed.warnings.some((w) => w.includes('CSE 60111 (W)')));
  });

  it('marks transfer-section courses with origin and institution', () => {
    const purdue = parsed.courses.find((c) => c.courseId === 'CS 50300');
    assert.equal(purdue?.origin, 'transfer');
    assert.equal(purdue?.institution, 'Purdue University');
    assert.equal(purdue?.grade, 'A');
    // "202010" is Banner-speak for Fall 2020 (needed for the §5.2 window check).
    assert.deepEqual(purdue?.term, { season: 'fall', year: 2020 });
    // TR rows (no real grade shown) are skipped with a warning, never guessed.
    assert.equal(parsed.courses.some((c) => c.courseId === 'CS 51400'), false);
    assert.ok(parsed.warnings.some((w) => w.includes('CS 51400')));
  });

  it('reads courses-in-progress as IP', () => {
    const rm = parsed.courses.find((c) => c.courseId === 'CSE 60876');
    assert.equal(rm?.grade, 'IP');
    assert.deepEqual(rm?.term, { season: 'fall', year: 2027 });
    const diss = parsed.courses.find((c) => c.courseId === 'CSE 98900');
    assert.equal(diss?.credits, 6);
  });

  it("takes the cumulative GPA from the Overall totals row's last column", () => {
    assert.equal(parsed.cumulativeGpa, 3.334);
  });

  it('rejects a non-ND transcript', () => {
    const other = parseTranscript([
      'Purdue University',
      'Unofficial Transcript',
      'Fall Semester 2026',
      'CS 50300 GR Operating Systems A 3.000 12.000',
    ]);
    assert.equal(other.isNotreDame, false);
    assert.equal(other.courses.length, 0);
  });

  it("parses ND's OFFICIAL PDF layout (credits BEFORE grade, Ehrs/GPA running totals)", () => {
    const official = parseTranscript([
      'UNIVERSITY OF NOTRE DAME NOTRE DAME, INDIANA 46556',
      'Fall Semester 2026',
      'BIOS 60574 Tpcs in Evol & Systematic Biol 3.000 B+ 9.999',
      'CSE 60641 Graduate Operating Systems 3.000 A 12.000',
      'NOTRE DAME Ehrs: 72.000 QPts: 106.000 GPA-Hrs: 28.000 GPA: 3.786',
    ]);
    const bios = official.courses.find((c) => c.courseId === 'BIOS 60574');
    assert.equal(bios?.credits, 3, 'credits column, not the 9.999 quality points');
    assert.equal(bios?.grade, 'B+');
    assert.equal(bios?.title, 'Tpcs in Evol & Systematic Biol');
    assert.equal(official.cumulativeGpa, 3.786, 'labeled GPA from the running-totals line');
  });

  it('accepts Banner 9 wording, bare term labels, and a footer-URL-only ND marker', () => {
    const b9 = parseTranscript([
      'Academic Transcript',
      'Institutional Credit',
      'Fall 2026',
      'CSE 60641 GR Graduate Operating Systems A 3.000 12.000',
      'Course(s) in Progress',
      'Spring 2027',
      'CSE 60876 GR Research Methods 3.000',
      'https://studentselfservice.nd.edu/StudentSelfService — Page 1 of 1',
    ]);
    assert.equal(b9.isNotreDame, true, 'nd.edu footer URL is an ND marker');
    assert.equal(b9.courses.find((c) => c.courseId === 'CSE 60641')?.grade, 'A');
    assert.deepEqual(b9.courses.find((c) => c.courseId === 'CSE 60641')?.term, { season: 'fall', year: 2026 });
    assert.equal(b9.courses.find((c) => c.courseId === 'CSE 60876')?.grade, 'IP');
  });

  it('handles empty/garbage text without throwing', () => {
    assert.equal(parseTranscript([]).isNotreDame, false);
    const nd = parseTranscript(['University of Notre Dame', 'no course data here at all']);
    assert.equal(nd.isNotreDame, true);
    assert.equal(nd.courses.length, 0);
  });
});
