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

// ——— Transcript accuracy program, Batch A (DGS 2026-10-09): parser fixes F1–F3 ———
// Each rule here was probed on docs/TRANSCRIPT-ACCURACY-PLAN.md §1 and is
// pinned with the shape that failed AND the neighbouring shape that must keep
// reading as before (the critic's tightenings, plan §2 step 4).
describe('transcript accuracy program, Batch A — F1 continuation, points and in-progress rows (2026-10-09)', () => {
  it('F1a (i): a code alone on its line takes the title and the numbers from the next line — only when that line ends in the credits and a grade token', () => {
    const r = doc(
      'Some University',
      'Fall 2023',
      'CS 500',
      'Advanced Topics   3   A',
      'CS 501',
      'Seminar in Computing   1.00   S',
      'CS 502',
      'The document explains A process and the criteria',
      'CS 503',
      '3.00   A',
    );
    assert.deepEqual([row(r, 'CS 500')?.title, row(r, 'CS 500')?.credits, row(r, 'CS 500')?.grade], ['Advanced Topics', 3, 'A']);
    assert.deepEqual([row(r, 'CS 501')?.title, row(r, 'CS 501')?.credits, row(r, 'CS 501')?.grade], ['Seminar in Computing', 1, 'S']);
    assert.equal(row(r, 'CS 502'), undefined, 'a sentence after a bare code is not its row');
    assert.equal(row(r, 'CS 503'), undefined, 'numbers alone carry no title: not the shape');
  });
  it('F1a (ii): a wrapped title whose continuation carries four or more words is taken only when that line ends in the credits and a grade token', () => {
    const r = doc(
      'Some University',
      'Fall 2023',
      'CS 500   Advanced Topics in Distributed',
      'Systems and Cloud Infrastructure Design   3   A',
      'CS 501   Advanced Topics in Distributed',
      'Systems and Cloud Infrastructure Design   3.00   3.00   A   12.00',
      'CS 502   Advanced Topics in Distributed',
      'Systems and Cloud Infrastructure Design   3   85',
      'CS 503   Advanced Topics in Computing',
      'Introductory courses carry 3 credits and are graded A',
      'CS 504   Advanced Topics in Computing',
      'The document explains A process and the criteria',
      'CS 505   Seminar in Computing',
      '1.00   A',
    );
    assert.equal(row(r, 'CS 500')?.title, 'Advanced Topics in Distributed Systems and Cloud Infrastructure Design');
    assert.deepEqual([row(r, 'CS 500')?.credits, row(r, 'CS 500')?.grade], [3, 'A']);
    assert.deepEqual([row(r, 'CS 501')?.credits, row(r, 'CS 501')?.grade], [3, 'A'], 'the Earned echo and the points may sit around the grade');
    assert.deepEqual([row(r, 'CS 502')?.credits, row(r, 'CS 502')?.rawGrade], [3, '85'], 'a numeric mark is a grade token');
    assert.equal(row(r, 'CS 503'), undefined, 'a sentence that mentions a number and a letter is not a numbers tail');
    assert.equal(row(r, 'CS 504'), undefined, 'the 2026-09-26 rule stays: the next sentence is never the numbers');
    assert.deepEqual([row(r, 'CS 505')?.credits, row(r, 'CS 505')?.grade], [1, 'A'], 'the numbers-only continuation reads as before');
  });
  it('F1b: a gradeless row’s trailing two-decimal number is its points only under a header that mapped a Points column, or in the credits/earned/points triple — a 20-point mark keeps its number', () => {
    const plain = doc('Some University', 'Fall 2023', 'CS 500   Topics   4   16.0', 'CS 501   Topics   3   12.0', 'CS 502   Topics   3.00   3.00   12.00', 'CS 503   Topics   3.00   12.00');
    assert.deepEqual([row(plain, 'CS 500')?.credits, row(plain, 'CS 500')?.rawGrade], [4, '16.0'], 'credits 4, mark 16.0: the product test alone decides nothing');
    assert.deepEqual([row(plain, 'CS 501')?.credits, row(plain, 'CS 501')?.rawGrade], [3, '12.0'], 'credits 3, mark 12.0');
    assert.deepEqual([row(plain, 'CS 502')?.credits, row(plain, 'CS 502')?.rawGrade], [3, undefined], 'the credits/earned/points triple');
    assert.deepEqual([row(plain, 'CS 503')?.credits, row(plain, 'CS 503')?.rawGrade], [3, '12.00'], 'no header: the number stays the printed grade');
    const keyed = doc('Some University', 'Course   Title   Credits   Grade   Points', 'Fall 2023', 'CS 500   Advanced Topics in Computing', '3.00   12.00', 'CS 501   Topics   4   16.00', 'CS 502   Topics   3   B+   9.00');
    assert.deepEqual([row(keyed, 'CS 500')?.credits, row(keyed, 'CS 500')?.grade, row(keyed, 'CS 500')?.rawGrade], [3, undefined, undefined], 'a Points column was mapped: the trailing number is points');
    assert.deepEqual([row(keyed, 'CS 501')?.credits, row(keyed, 'CS 501')?.rawGrade], [4, undefined]);
    assert.deepEqual([row(keyed, 'CS 502')?.credits, row(keyed, 'CS 502')?.grade], [3, 'B+'], 'a grade token on the row is still the grade');
  });
  it('F1c: the integer before a trailing decimal is the title’s only inside an in-progress block or under a header with no grade or mark column', () => {
    const ip = doc('Some University', 'Fall 2023', 'COURSES IN PROGRESS', 'MATH 1220   Calculus 2   3.0');
    assert.deepEqual([row(ip, 'MATH 1220')?.title, row(ip, 'MATH 1220')?.credits, row(ip, 'MATH 1220')?.grade], ['Calculus 2', 3, 'IP']);
    const noGrade = doc('Some University', 'Course   Title   Credits', 'Fall 2023', 'MATH 1220   Calculus 2   3.0');
    assert.deepEqual([row(noGrade, 'MATH 1220')?.title, row(noGrade, 'MATH 1220')?.credits], ['Calculus 2', 3]);
    const marks = doc('Some University', 'Course   Title   Credits   Mark', 'Fall 2023', 'CS 500   Topics 1   5.0');
    assert.deepEqual([row(marks, 'CS 500')?.title, row(marks, 'CS 500')?.credits, row(marks, 'CS 500')?.rawGrade], ['Topics', 1, '5.0'], 'under a marks header the integer is the credits and the decimal the mark');
    const plain = doc('Some University', 'Fall 2023', 'CS 500   Topics 1   5.0', 'CS 600   Master Thesis 15   8.7');
    assert.deepEqual([row(plain, 'CS 500')?.title, row(plain, 'CS 500')?.credits, row(plain, 'CS 500')?.rawGrade], ['Topics', 1, '5.0'], 'no block, no header: no bound on the integer decides it');
    assert.deepEqual([row(plain, 'CS 600')?.title, row(plain, 'CS 600')?.credits, row(plain, 'CS 600')?.rawGrade], ['Master Thesis', 15, '8.7']);
  });
});

describe('transcript accuracy program, Batch A — F2 term cells and Workday headers (2026-10-09)', () => {
  const term = (r: ReturnType<typeof parseExternalTranscript>, id: string) => [row(r, id)?.season, row(r, id)?.year];
  it('F2: compact term codes are read from the first cell before the course code or a header-mapped term cell — never from a trailing cell', () => {
    const pre = doc(
      'Some University',
      'Fall 2021',
      '2023FA   CS 101   Programming   3   A',
      '2024SP   CS 102   Data Structures   3   B',
      '2023SU   CS 103   Systems   3   A',
      '2024WI   CS 104   Networks   3   A',
      'CS 105   Security   3   A   2023FA',
    );
    assert.deepEqual(term(pre, 'CS 101'), ['fall', 2023]);
    assert.deepEqual(term(pre, 'CS 102'), ['spring', 2024]);
    assert.deepEqual(term(pre, 'CS 103'), ['summer', 2023]);
    assert.deepEqual(term(pre, 'CS 104'), ['spring', 2024], 'a winter term sits where the spring does, as a "Winter" header would');
    assert.deepEqual(term(pre, 'CS 105'), ['fall', 2021], 'a trailing cell no header mapped is not the row\'s term');
    const mapped = doc('Some University', 'Term   Course   Title   Credits   Grade', '2024SP   CS 101   Programming   3   A');
    assert.deepEqual(term(mapped, 'CS 101'), ['spring', 2024]);
    const last = doc('Some University', 'Course   Title   Credits   Grade   Term', 'CS 101   Programming   3   A   2023FA');
    assert.deepEqual(term(last, 'CS 101'), ['fall', 2023], 'Colleague prints the term as the last cell — mapped by the header');
  });
  it('F2: a six-digit Banner term code before the course code is a term cell, decoded only by the document’s own key; a six-digit course id is never re-termed', () => {
    const noKey = doc('Some University', 'Fall 2021', '202310   CS 102   Data Structures   3   B');
    assert.deepEqual([row(noKey, 'CS 102')?.title, ...term(noKey, 'CS 102')], ['Data Structures', 'fall', 2021], 'no key: the code is not the course id, and the row keeps the header\'s term');
    assert.equal(row(noKey, '202310'), undefined);
    const keyed = doc(
      'Some University',
      'Term codes on this record: 202310 is the Fall 2022 semester, 202320 is the Spring 2023 semester.',
      '202310   CS 101   Programming   3   A',
      '202320   CS 102   Data Structures   3   B',
      '202330   CS 103   Systems   3   A',
    );
    assert.deepEqual(term(keyed, 'CS 101'), ['fall', 2022]);
    assert.deepEqual(term(keyed, 'CS 102'), ['spring', 2023]);
    assert.deepEqual(term(keyed, 'CS 103'), [undefined, undefined], 'a term part the key does not name stays unread');
    const sixDigitId = doc('Some University', 'Fall 2021', '202310   Advanced Topics   3   A', 'CS 103   Programming   3   A   202320');
    assert.deepEqual([row(sixDigitId, '202310')?.title, ...term(sixDigitId, '202310')], ['Advanced Topics', 'fall', 2021], 'a six-digit course id before a title is a course id');
    assert.deepEqual(term(sixDigitId, 'CS 103'), ['fall', 2021], 'a trailing six-digit cell is never the term');
  });
  it('F2: a Workday term header’s parenthesised date range is stripped before the season and year are read', () => {
    const r = doc(
      'Some University',
      '2023 Fall Semester (09/05/2023-12/15/2023)',
      'CS 101   Programming   3   A',
      'Spring 2024 Term (01/16/2024-05/10/2024)',
      'CS 102   Data Structures   3   B',
      'Fall 2023 Term',
      'CS 103   Systems   3   A',
      'Summer 2024 Semester (05/20/2024 - 08/09/2024)',
      'CS 104   Networks   3   A',
    );
    assert.deepEqual(term(r, 'CS 101'), ['fall', 2023]);
    assert.deepEqual(term(r, 'CS 102'), ['spring', 2024]);
    assert.deepEqual(term(r, 'CS 103'), ['fall', 2023]);
    assert.deepEqual(term(r, 'CS 104'), ['summer', 2024]);
  });
});

describe('transcript accuracy program, Batch A — F3 course-code shapes (2026-10-09)', () => {
  const cells = (r: ReturnType<typeof parseExternalTranscript>, id: string) => [row(r, id)?.title, row(r, id)?.credits, row(r, id)?.grade];
  it('F3: a three-token subject with a one-letter middle is a course code when that letter is printed as a capital', () => {
    const r = doc(
      'Some University',
      'Fall 2023',
      'ENG M 612   Engineering Management   3   A',
      'MATH E 101   Calculus   4   B',
      'ENG M   613   Project Management   3   A',
      'Use a 2019 edition of the handbook   3   A',
      'SEE A 100 level course   3   A',
    );
    assert.deepEqual(r.courses.map((c) => c.courseId), ['ENG M 612', 'MATH E 101', 'ENG M 613']);
    assert.deepEqual(cells(r, 'ENG M 612'), ['Engineering Management', 3, 'A']);
    assert.deepEqual(cells(r, 'MATH E 101'), ['Calculus', 4, 'B']);
    assert.deepEqual(cells(r, 'ENG M 613'), ['Project Management', 3, 'A'], 'the subject and the number in separate cells');
  });
  it('F3: Workday’s dash after the course number and Colleague’s section cell after the code are not the title’s or the credits’', () => {
    const r = doc(
      'Some University',
      'Fall 2023',
      'CS 101 - Calculus 1   3   A',
      'CS 102 - Introduction to Programming   A   3   3   12',
      'CS-103   01   Calculus 2   3   B',
      'CS-104   01   Data Structures   3.00   A',
      'CS 105-01   Networks   3   A',
    );
    assert.deepEqual(cells(r, 'CS 101'), ['Calculus 1', 3, 'A']);
    assert.deepEqual(cells(r, 'CS 102'), ['Introduction to Programming', 3, 'A']);
    assert.deepEqual(cells(r, 'CS 103'), ['Calculus 2', 3, 'B']);
    assert.deepEqual(cells(r, 'CS 104'), ['Data Structures', 3, 'A']);
    assert.deepEqual(cells(r, 'CS 105'), ['Networks', 3, 'A'], 'a section glued to the number reads as before');
    const mapped = doc('Some University', 'Course   Section   Title   Credits   Grade', 'Fall 2023', 'CS-103   01   Calculus 2   3   B');
    assert.deepEqual(cells(mapped, 'CS 103'), ['Calculus 2', 3, 'B'], 'under a Section header the mapped path sees the same tokens');
  });
});

// ——— The 2026-10-09 review of F1–F3: the regressions and loose ends it found, each probed on HEAD and pinned here ———
describe('transcript accuracy program, Batch A — review of F1–F3 (2026-10-09)', () => {
  const term = (r: ReturnType<typeof parseExternalTranscript>, id: string) => [row(r, id)?.season, row(r, id)?.year];
  const one = (header: string) => term(doc('Some University', header, 'CS 101   Programming   3   A'), 'CS 101');
  it('review of F3: an all-capitals term heading with a Roman numeral is a term, never a one-letter-middle course code', () => {
    assert.deepEqual(one('SEMESTRE I 2019'), ['spring', 2019]);
    assert.deepEqual(one('CICLO I 2019'), ['spring', 2019]);
    assert.deepEqual(one('PERIODO I 2019'), ['spring', 2019]);
    assert.deepEqual(one('TRIMESTER I 2019'), [undefined, 2019], 'a trimester ordinal names no season (as before F3)');
    assert.deepEqual(one('SEMESTRE I 2019-2020'), ['fall', 2019]);
    assert.deepEqual(one('Semestre I 2019'), ['spring', 2019]);
    assert.deepEqual(one('SEMESTER I 2019'), ['spring', 2019]);
    assert.deepEqual(one('SEMESTRE I DE 2019'), ['spring', 2019]);
    const two = doc('Some University', 'SEMESTRE I 2019', 'CS 101   Programming   3   A', 'SEMESTRE II 2019', 'CS 102   Data Structures   3   B');
    assert.deepEqual(term(two, 'CS 101'), ['spring', 2019]);
    assert.deepEqual(term(two, 'CS 102'), ['fall', 2019], 'the second of two semesters in one calendar year, in calendar order');
    const code = doc('Some University', 'Fall 2019', 'ENG M 612   Engineering Management   3   A', 'ENG M 2019   Edition Studies   3   B');
    assert.deepEqual([row(code, 'ENG M 612')?.title, ...term(code, 'ENG M 612')], ['Engineering Management', 'fall', 2019], 'the F3 shape itself still reads');
    assert.deepEqual([row(code, 'ENG M 2019')?.title, row(code, 'ENG M 2019')?.credits], ['Edition Studies', 3], 'a year-shaped course number with a title after it is a code');
  });
  it('review of F2: a term header whose only year is inside its parenthesised date range takes the year the dates give', () => {
    assert.deepEqual(one('Fall Semester (09/05/2023-12/15/2023)'), ['fall', 2023]);
    assert.deepEqual(one('Semester 1 (27/02/2023-23/06/2023)'), ['spring', 2023]);
    assert.deepEqual(one('Semester 2 (24/07/2023-17/11/2023)'), ['fall', 2023], 'was spring 2017 before F2 — the range passed for an academic year');
    assert.deepEqual(one('Summer Session I (05/15/2023-06/30/2023)'), ['summer', 2023], 'was summer 2006 before F2');
    assert.deepEqual(one('Winter Term (12/01/2023-03/15/2024)'), ['spring', 2024], 'a winter term that starts in the December before is the later year’s');
    assert.deepEqual(one('Fall Term (09/01/2023-01/15/2024)'), ['fall', 2023], 'a fall term that ends after New Year is the earlier year’s');
    assert.deepEqual(one('2023 Fall Semester (09/05/2023-12/15/2023)'), ['fall', 2023], 'Workday’s year outside the range reads as pinned');
    assert.deepEqual(one('Fall Semester (09/05/23-12/15/23)'), [undefined, undefined], 'a two-digit year is not read: never guess');
  });
  it('review of F1a: a sentence or footnote after a bare code or a wrapped title is never the row’s numbers — the grade must be the line’s last grade cell and the added title words hold no function word', () => {
    const r = doc(
      'Some University',
      'Fall 2023',
      'CS 500   Thesis Research',
      'Credits applied toward the degree this semester 12   3.5',
      'CS 501   Independent Study',
      'Repeated course excluded from degree credit 3   A',
      'CS 502   Independent Study',
      'Approved for graduate credit by petition 3   B+',
      'CS 503   Advanced Topics',
      'Minimum passing mark in graduate courses is 3   60',
      'CS 504',
      'Transferred from partner institution with 3   CR',
      'CS 505',
      'Seminar in Computing   1.00   Pass',
      'CS 506   Advanced Topics in Distributed',
      'Systems and Cloud Infrastructure Design   3   A',
      'CS 507   Introduction to Machine',
      'Learning from Data   3   A',
    );
    for (const id of ['CS 500', 'CS 501', 'CS 502', 'CS 503', 'CS 504']) assert.equal(row(r, id), undefined, `${id}: the next line is a sentence, not its numbers`);
    const cells = (id: string) => [row(r, id)?.title, row(r, id)?.credits, row(r, id)?.grade];
    assert.deepEqual(cells('CS 505'), ['Seminar in Computing', 1, 'S'], 'a pass word IN the grade cell is the grade');
    assert.deepEqual(cells('CS 506'), ['Advanced Topics in Distributed Systems and Cloud Infrastructure Design', 3, 'A'], 'the F1a shape itself still reads');
    assert.deepEqual(cells('CS 507'), ['Introduction to Machine Learning from Data', 3, 'A'], 'three words: the 2026-09-26 numbers-only rule reads a title with "from"');
  });
  it('review of F2: the Banner key is bounded — a year off by more than one, a labelled identifier, a key on a course row, or a decode outside the document’s years is refused', () => {
    const postal = doc('Some University', 'Fall 2021', 'Student identification number and postal code: 201301, admitted for the Spring 2023 intake', '202301   CS 101   Programming   3   A');
    assert.deepEqual(term(postal, 'CS 101'), ['fall', 2021], 'a postal code beside an entry term (offset −10) is no key: the row keeps its header');
    const labelled = doc('Some University', 'Student ID 202310   Entry Term Fall 2022', 'Fall 2021', '202310   CS 101   Programming   3   A');
    assert.deepEqual(term(labelled, 'CS 101'), ['fall', 2021], 'a number the line labels as an ID is no key');
    const onRow = doc('Some University', 'Fall 2021', 'CS 101   Programming   3   A   Fall 2022 (202310)', '202310   CS 102   Data Structures   3   B');
    assert.deepEqual(term(onRow, 'CS 102'), ['fall', 2021], 'a course row never carries the key');
    const farOff = doc(
      'Some University',
      'Term codes on this record: 202310 is the Fall 2022 semester of the academic year.',
      '200010   CS 101   Programming   3   A',
      '200110   CS 102   Data Structures   3   B',
      '202310   CS 103   Systems   3   A',
    );
    assert.deepEqual(term(farOff, 'CS 101'), [undefined, undefined], 'a decode of 1999 in a document that prints only 2022 is refused');
    assert.deepEqual(term(farOff, 'CS 102'), [undefined, undefined]);
    assert.deepEqual(term(farOff, 'CS 103'), ['fall', 2022], 'the key still decodes the code it names');
    const threeOff = doc('Some University', 'Term codes on this record: 202310 is the Fall 2020 semester of the academic year.', '202310   CS 101   Programming   3   A');
    assert.deepEqual(term(threeOff, 'CS 101'), [undefined, undefined], 'a code three years off its named year is outside Banner’s convention: no key, no guess');
  });
  it('review of F2: the key is read from the whole document before the rows, so a legend printed after them decodes them too', () => {
    const r = doc(
      'Some University',
      '202310   CS 101   Programming   3   A',
      '202320   CS 102   Data Structures   3   B',
      'Term codes on this record: 202310 is the Fall 2022 semester, 202320 is the Spring 2023 semester.',
    );
    assert.deepEqual(term(r, 'CS 101'), ['fall', 2022]);
    assert.deepEqual(term(r, 'CS 102'), ['spring', 2023]);
  });
  it('review of F1b: the points evidence is the table header in force, not any header the document printed', () => {
    const r = doc(
      'Some University',
      'Course   Title   Credits   Grade   Points',
      'Fall 2022',
      'CS 400   Topics   3   A   12.00',
      'TRANSFER CREDIT',
      'Course   Title   Credits   Grade',
      'Fall 2023',
      'CS 700   Advanced Topics in Computing',
      '4   16.00',
    );
    assert.deepEqual([row(r, 'CS 700')?.credits, row(r, 'CS 700')?.rawGrade], [4, '16.00'], 'the header in force maps no Points column: the number stays the printed grade');
    const keyed = doc('Some University', 'Course   Title   Credits   Grade   Points', 'Fall 2023', 'CS 700   Advanced Topics in Computing', '4   16.00');
    assert.deepEqual([row(keyed, 'CS 700')?.credits, row(keyed, 'CS 700')?.rawGrade], [4, undefined], 'under the Points header the number is points');
  });
});
