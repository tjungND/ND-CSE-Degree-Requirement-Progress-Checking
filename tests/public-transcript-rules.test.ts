// The rules the public-transcript research added to the external parser
// (2026-09-26), each pinned on a minimal document so a future change to one
// cannot silently undo another. The 93 fixtures in tests/public-transcripts
// cover the layouts whole; these cover the reasoning.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isoOrEuropeanDate, parseExternalTranscript } from '../src/transcript/external.ts';

const FILLER = Array(12).fill('Record issued by the Registrar — verify with the issuing office before relying on it.');
const doc = (...lines: string[]) => parseExternalTranscript([...lines, ...FILLER]);
const row = (r: ReturnType<typeof parseExternalTranscript>, id: string) => r.courses.find((c) => c.courseId === id);

describe('public-transcript rules (2026-09-26)', () => {
  it('a numeric grade equal to the credits is a grade, not the Earned column, unless it repeats the credits’ format with a token after it', () => {
    const r = doc('Michigan State University', 'Fall 2023', 'CSE 802   Pattern Recognition and Analysis   3   3.0', 'CSE 803   Computer Vision   3.00   3.00   A   12.00');
    assert.equal(row(r, 'CSE 802')?.rawGrade, '3.0');
    assert.equal(row(r, 'CSE 803')?.grade, 'A');
    assert.equal(row(r, 'CSE 803')?.credits, 3);
  });
  it('zero earned right after the credits is that column; the grade-shaped token after it is the grade', () => {
    const r = doc('The University of Utah', 'Fall 2023', 'CS 6300   Artificial Intelligence   3.00   0.00   E   0.00', 'CS 6350   Machine Learning   3.00   0.00   W');
    assert.equal(row(r, 'CS 6300')?.rawGrade, 'E');
    assert.equal(row(r, 'CS 6350')?.rawGrade, 'W');
  });
  it('the legend decides E, N, S and NP: never a guess', () => {
    const base = ['Some University', 'Fall 2023', 'CS 500   Topics   3.00   E', 'CS 501   Seminar   1.00   N', 'CS 502   Research   3.00   S', 'CS 503   Colloquium   1.00   NP'];
    const plain = doc(...base);
    assert.equal(row(plain, 'CS 500')?.rawGrade, 'E');
    assert.equal(row(plain, 'CS 501')?.rawGrade, 'N');
    assert.equal(row(plain, 'CS 502')?.grade, 'S');
    assert.equal(row(plain, 'CS 503')?.grade, 'U');
    const keyed = doc(...base, 'TRANSCRIPT KEY: A 4.0, B 3.0, C 2.0, D 1.0, E 0.0 (failure). N Not satisfactory. S 10 Outstanding. NP No grade - pass.');
    assert.equal(row(keyed, 'CS 500')?.grade, 'F');
    assert.equal(row(keyed, 'CS 501')?.grade, 'U');
    assert.equal(row(keyed, 'CS 502')?.rawGrade, 'S');
    assert.equal(row(keyed, 'CS 503')?.grade, 'S');
    // A course row "E 0.00" is a grade and its points, not a legend entry.
    const rowOnly = doc('Some University', 'Fall 2023', 'MATH   1210   Calculus I   4.000   E   0.00');
    assert.equal(row(rowOnly, 'MATH 1210')?.rawGrade, 'E');
  });
  it('a pass/fail token beside a printed mark yields to the mark; a letter grade beats a numeric guess', () => {
    const r = doc('University of Sydney', 'Unit of Study   Title   Credit Points   Mark   Grade', 'Semester 1 2023', 'COMP 5216   Mobile Computing   6   66   CR', 'COMP 5048   Visual Analytics   6   78   DI', 'COMP 5300   Databases   6   88   A');
    assert.equal(row(r, 'COMP 5216')?.rawGrade, '66 CR'); // the band stays beside the mark (2026-09-26, the ANU sample)
    assert.equal(row(r, 'COMP 5048')?.rawGrade, '78 DI');
    assert.equal(row(r, 'COMP 5300')?.grade, 'A');
  });
  it('the column header maps a Banner Self-Service row: grade before credits, level before title', () => {
    const r = doc('University of Illinois', 'Fall 2021', 'Subject   Course   Level   Title   Grade   Credit Hours   Quality Points   R', 'CS   374   UG   Intro to Algs & Models of Comp   W   4.000   0.000', 'CS   598   GR   Special Topics: Deep Generative Models   PS   4.000   16.000');
    assert.equal(row(r, 'CS 374')?.rawGrade, 'W');
    assert.equal(row(r, 'CS 374')?.credits, 4);
    assert.equal(row(r, 'CS 374')?.level, 'undergraduate');
    assert.equal(row(r, 'CS 598')?.grade, 'S');
    assert.equal(row(r, 'CS 598')?.level, 'graduate');
  });
  it('marks columns before the grade (India) and a credit column after it', () => {
    const r = doc('JNTU Hyderabad', 'B.Tech III Year I Semester (R18) Regular Examinations, November 2021', 'Subject Code   Subject Name   Internals   Externals   Total   Grade   Credits', 'CS 501PC   Formal Languages and Automata Theory   27   63   90   A   3');
    const c = row(r, 'CS 501PC');
    assert.equal(c?.credits, 3);
    assert.equal(c?.grade, 'A');
    assert.equal(c?.season, 'fall');
    assert.equal(c?.year, 2021);
  });
  it('term headers: four-digit academic years, ordinals with a range, single-year ordinals in calendar order, Solar Hijri, a month range', () => {
    const one = (header: string) => row(doc('Some University', header, 'CS 101   Programming   3   A'), 'CS 101');
    assert.deepEqual([one('Spring 2023-2024')?.season, one('Spring 2023-2024')?.year], ['spring', 2024]);
    assert.deepEqual([one('Semester II 2022/2023')?.season, one('Semester II 2022/2023')?.year], ['spring', 2023]);
    assert.deepEqual([one('Semester 1 2023')?.season, one('Semester 1 2023')?.year], ['spring', 2023]);
    assert.deepEqual([one('Second Semester 1397-1398')?.season, one('Second Semester 1397-1398')?.year], ['spring', 2019]);
    assert.deepEqual([one('Semester: JUL-NOV 2022')?.season, one('Semester: JUL-NOV 2022')?.year], ['fall', 2022]);
    assert.deepEqual([one('Wintersemester 2022/23')?.season, one('Wintersemester 2022/23')?.year], ['fall', 2022]);
  });
  it('a header that names no season leaves it open instead of keeping the previous header’s', () => {
    const r = doc('BITS Pilani', 'Summer Term 2022', 'CS 100   Workshop   1   A', 'Term 2023', 'CS 101   Programming   3   A');
    assert.equal(row(r, 'CS 100')?.season, 'summer');
    assert.equal(row(r, 'CS 101')?.season, undefined);
  });
  it('a course title never becomes a term header', () => {
    const r = doc('Salt Lake Community College', 'Fall 2018', 'ENGL 2010   Intermediate Writing   3   A', 'MATH 1210   Calculus I   4   B');
    assert.equal(row(r, 'MATH 1210')?.year, 2018);
  });
  it('MIT’s dotted subjects, Toronto’s campus digit and a scheme-year Indian code are course codes; a year range is not', () => {
    const r = doc('Massachusetts Institute of Technology', 'Fall Term 2022-2023', '6.5840   Distributed Computer Systems Engineering   12   A', '6.THG   Graduate Thesis   24   S', 'CSC108H1   Introduction to Computer Programming   0.50   A', '18CS51   Management for IT Industry   3   B', '2019-2020 Autumn Term');
    assert.deepEqual(r.courses.map((c) => c.courseId), ['6.5840', '6.THG', 'CSC 108H1', '18CS51']);
    assert.equal(row(r, '6.5840')?.year, 2022);
  });
  it('day-first and ISO dates, and a date after the label on a two-date line', () => {
    assert.equal(isoOrEuropeanDate('Graduation Date: 30.06.2023'), '2023-06-30');
    assert.equal(isoOrEuropeanDate('25/06/2022'), '2022-06-25');
    assert.equal(isoOrEuropeanDate('2023-10-27'), '2023-10-27');
    assert.equal(isoOrEuropeanDate('18 de marzo de 2023'), '2023-03-18');
    assert.equal(isoOrEuropeanDate('05/06/2023'), undefined, 'ambiguous without a day-first hint');
    const r = doc('Middle East Technical University', 'Date of Registration:   09.09.2019   Graduation Date:   30.06.2023', 'Bachelor of Science in Computer Engineering', '2019-2020 Fall Semester', 'CENG 111   Introduction   4   AA');
    assert.equal(r.bachelorsConferredOn, '2023-06-30');
  });
  it('PeopleSoft’s transfer block is skipped like Banner’s', () => {
    const r = doc('Penn State', 'Transfer Credits', 'Transfer Credit from University of Pittsburgh', 'CS 1550   Introduction to Operating Systems   3.00   3.00   TR', 'Course Trans GPA:   0.000   Transfer Totals:   3.000   3.000', 'Fall 2024', 'CMPSC 565   Algorithm Design and Analysis   3.00   3.00   A   12.00');
    assert.deepEqual(r.courses.map((c) => c.courseId), ['CMPSC 565']);
    assert.equal(r.transferRowsSkipped, 1);
  });
  it('legend prose about quarter hours does not make a semester transcript a quarter one', () => {
    const r = doc('The University of Utah', 'Fall 2023', 'CS 6300   Artificial Intelligence   3.00   3.00   A   12.00', 'TRANSCRIPT KEY: prior transcripts show quarter hours; credits were converted from quarters to semesters in 1998.');
    assert.equal(r.quarterSystem, undefined);
  });
  it('a lone lowercase letter and a small integer stay in the title; a starred or zero-prefixed token stays as printed', () => {
    const r = doc('Universidad de los Andes', 'Periodo 2019-10', 'ISIS 1221   Introducción a la Programación   3   4.5', 'MATE 1203   Calculus 1   4   A-', 'CIS 5000   Software Foundations   1.00   I*', 'CS 310   Data Structures   4   0F');
    assert.equal(row(r, 'ISIS 1221')?.title, 'Introducción a la Programación');
    assert.equal(row(r, 'ISIS 1221')?.rawGrade, '4.5');
    assert.equal(row(r, 'ISIS 1221')?.season, 'spring');
    assert.equal(row(r, 'MATE 1203')?.title, 'Calculus 1');
    assert.equal(row(r, 'CIS 5000')?.rawGrade, 'I*');
    assert.equal(row(r, 'CS 310')?.rawGrade, '0F');
  });
  it('a level named in one cell, Confer Date, and degree abbreviations with their dots', () => {
    const r = doc('HKUST', 'Program: MSc in Information Technology   Career: Postgraduate', 'Degree:   B.Sc. Engineering   Confer Date:   06/15/2024', 'Fall 2022', 'COMP 5211   Advanced Artificial Intelligence   3   A-');
    assert.equal(row(r, 'COMP 5211')?.level, 'graduate');
    assert.equal(r.bachelorsConferredOn, '2024-06-15');
    // "be applied toward a degree" is prose, not a B.E.
    const prose = doc('UC Berkeley Extension', 'Extension courses carry credit that may be applied toward a degree elsewhere, awarded June 2023.', 'Fall 2022', 'COMPSCI X470   Foundations of Data Science   3   A');
    assert.equal(prose.bachelorsConferredOn, undefined);
  });
  // ——— Read from the registrar PDFs themselves (2026-09-26, later the same day) ———
  it('the prose of a transcript key or regulation never starts a course row: function words, "Clause 11.", lowercase "in 2009", a program line, an e-mail, a trailing comma, a sentence', () => {
    const r = doc(
      'Some University',
      'Fall 2023',
      'CS 500   Topics   3.00   A',
      'Since 1998, a scheme of first- and second-level degree programmes (Bachelor and Master) was introduced to be offered parallel to or',
      'Clause 37.   Grading using the designations A B+ B C+ C D+ D or F shall be executed based on the',
      'in 2009 as replacement for the previous   A',
      'IN 2003   Efficient Algorithms and Data Structures   8   1,7',
      '3500   BACHELOR OF COMPUTING (HONOURS)   3   C',
      '14853, univreg@cornell.edu, Telephone: (607) 255-4232   3   A',
      'CS 601   students were admitted in a batch and there were 8 repeaters   3   A',
      'CS 602   Exampleville,   3   A',
      'B+   3.333 per credit',
      '0000-0999 Ratcliffe Hicks School of Agriculture   4.3   A',
      '199719/98 (Building B+, B   Very Good',
      '6.5840   Distributed Computer Systems Engineering   12   A',
    );
    assert.deepEqual(r.courses.map((c) => c.courseId), ['CS 500', 'IN 2003', '6.5840']);
  });
  it('a two-line row takes its numbers from the next line only when that line is numbers, not the next sentence', () => {
    const r = doc('Some University', 'Fall 2023', 'CS 502   Seminar in Computing', '1.00   A', 'CS 503   Advanced Topics in Computing', 'The document explains A process and the criteria');
    assert.equal(row(r, 'CS 502')?.grade, 'A');
    assert.equal(row(r, 'CS 502')?.credits, 1);
    assert.equal(row(r, 'CS 503'), undefined);
  });
  it('the Australian HD / D / CR / P / N bands stay raw beside their mark, and a term line with no year of its own takes the header’s', () => {
    const r = doc(
      'THE AUSTRALIAN NATIONAL UNIVERSITY',
      'BACHELOR OF UNIVERSITY',
      '200 5   FIRST SEMESTER',
      'COURSE CODE   COURSE TITLE   UNITS TAKEN   MARK   GRADE',
      'COMP 1100   Introduction to Programming   6   77   D',
      'COMP 1110   Structured Programming   6   81   HD',
      'COMP 1130   Programming Advanced   6   62   CR',
      'SECOND SEMESTER',
      'COMP 2100   Software Design   6   55   P',
      'COMP 2300   Computer Organisation   6   40   N',
      'EXAM1003   CLASS 5   1   ABN *',
    );
    assert.equal(r.university, 'THE AUSTRALIAN NATIONAL UNIVERSITY');
    assert.equal(row(r, 'COMP 1100')?.rawGrade, '77 D');
    assert.equal(row(r, 'COMP 1100')?.grade, undefined);
    assert.equal(row(r, 'COMP 1110')?.rawGrade, '81 HD');
    assert.equal(row(r, 'COMP 1130')?.rawGrade, '62 CR');
    assert.equal(row(r, 'COMP 2100')?.rawGrade, '55 P');
    assert.equal(row(r, 'COMP 2300')?.rawGrade, '40 N');
    assert.deepEqual([row(r, 'COMP 1100')?.season, row(r, 'COMP 1100')?.year], ['spring', 2005]);
    assert.deepEqual([row(r, 'COMP 2100')?.season, row(r, 'COMP 2100')?.year], ['fall', 2005]);
    // A status row with no mark: the title keeps its number, the units are the credits.
    assert.equal(row(r, 'EXAM 1003')?.title, 'CLASS 5');
    assert.equal(row(r, 'EXAM 1003')?.credits, 1);
    assert.equal(row(r, 'EXAM 1003')?.rawGrade, 'ABN');
    // Without an HD anywhere, D is the app's D and the mark is set aside.
    const us = doc('Some University', 'Fall 2023', 'CODE   TITLE   CREDITS   MARK   GRADE', 'CS 500   Topics   3   77   D');
    assert.equal(row(us, 'CS 500')?.grade, 'D');
  });
  it('a year the PDF sets apart ("200 3   FULL YEAR") is a year-only term', () => {
    const r = doc('Some University', '200 3   FULL YEAR', 'CS 500   Topics   3   A');
    assert.equal(row(r, 'CS 500')?.year, 2003);
    assert.equal(row(r, 'CS 500')?.season, undefined);
  });
});
