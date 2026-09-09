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
  it('reports graduate-degree conferral only on positive same-line evidence', () => {
    const withMs = parseExternalTranscript([...PURDUE, 'Master of Science in Computer Science — Conferred: May 2021']);
    assert.equal(withMs.degreeConferred, true);
    // A bachelor's conferral on a graduate transcript is NOT graduate-degree
    // evidence; neither is a transcript with no conferral line at all.
    const bsOnly = parseExternalTranscript([...PURDUE, 'Bachelor of Science Awarded May 2019']);
    assert.equal(bsOnly.degreeConferred, undefined);
    assert.equal(parseExternalTranscript(PURDUE).degreeConferred, undefined);
  });

  it('reads "Degree Completed: Master of Science" as conferral, but never a negative', () => {
    // "complet" wording added 2026-09-04 (a real transcript printed it).
    const completed = parseExternalTranscript([...PURDUE, 'Degree Completed: Master of Science']);
    assert.equal(completed.degreeConferred, true);
    const notCompleted = parseExternalTranscript([...PURDUE, 'Master of Science — Not Completed']);
    assert.equal(notCompleted.degreeConferred, undefined);
    const incomplete = parseExternalTranscript([...PURDUE, 'Incomplete: Master of Science requirements outstanding']);
    assert.equal(incomplete.degreeConferred, undefined);
  });

  it('reads lowercase course codes (2026-09-04)', () => {
    const lines = [...PURDUE.slice(0, 6), 'cs 5321   advanced operating systems   3.0   A', ...PURDUE.slice(12)];
    const r = parseExternalTranscript(lines);
    const c = r.courses.find((x) => x.courseId === 'CS 5321');
    assert.ok(c, 'lowercase code row parsed');
    assert.equal(c!.credits, 3);
    assert.equal(c!.grade, 'A');
  });

  it('reads subjects of seven letters or more when printed in capitals (UMass "COMPSCI", "STATISTC" — DGS bug report 2026-09-06)', () => {
    const lines = [
      'University of Massachusetts Amherst',
      'Office of the University Registrar',
      '',
      'Fall 2022',
      'COMPSCI 501   Formal Language Theory        3.00   A',
      'STATISTC 501   Methods of Applied Statistics   3.00   A-',
      'ENGLWRIT 112   College Writing   3.00   A',
      'MUSIC 100   Music Appreciation   3.00   B+',
      'CICS 305   Social Issues in Computing   3.00   A',
      // Subject and number in separate columns (Banner layout), long subject.
      'BIOCHEM   285   Cellular and Molecular Biology   4.00   B',
      // Prose that also reads "word number …": a long word in lowercase is not
      // a subject (the capitals rule), a stopword never is.
      'Chapter 3   Not a course   3.00   A',
      'Building 12   Not a course either   3.00   A',
      'Semester 2   Nor this   3.00   A',
      'Cumulative GPA: 3.83',
    ].concat(Array(20).fill('University of Massachusetts Amherst record — not an official copy unless sealed.'));
    const r = parseExternalTranscript(lines);
    assert.deepEqual(
      r.courses.map((c) => `${c.courseId} ${c.credits} ${c.grade}`),
      ['COMPSCI 501 3 A', 'STATISTC 501 3 A-', 'ENGLWRIT 112 3 A', 'MUSIC 100 3 B+', 'CICS 305 3 A', 'BIOCHEM 285 4 B'],
    );
    assert.equal(r.courses.find((c) => c.courseId === 'STATISTC 501')!.title, 'Methods of Applied Statistics');
    // Short subjects stay case-insensitive (2026-09-04).
    assert.equal(parseExternalTranscript([...lines.slice(0, 4), 'cs 5321   advanced operating systems   3.0   A', ...lines.slice(15)]).courses[0]!.courseId, 'CS 5321');
  });

  it('keeps numeric grades as rawGrade for the student to map (2026-09-04)', () => {
    const lines = [
      ...PURDUE.slice(0, 6),
      '30240233   Data Structures and Algorithms   4   92',
      '30240551   Operating Systems   85',
      ...PURDUE.slice(12),
    ];
    const r = parseExternalTranscript(lines);
    const withCredits = r.courses.find((x) => x.courseId === '30240233');
    assert.ok(withCredits, 'numeric-grade row with credits parsed');
    assert.equal(withCredits!.credits, 4);
    assert.equal(withCredits!.grade, undefined);
    assert.equal(withCredits!.rawGrade, '92');
    const gradeOnly = r.courses.find((x) => x.courseId === '30240551');
    assert.ok(gradeOnly, 'numeric-grade row without credits parsed');
    assert.equal(gradeOnly!.rawGrade, '85');
  });

  it('merges two-line course rows — code+title, then the numbers (2026-09-04)', () => {
    const lines = [
      ...PURDUE.slice(0, 6),
      'CS 6210   Advanced Operating Systems and',
      'Distributed Computing   3.0   A-',
      ...PURDUE.slice(12),
    ];
    const r = parseExternalTranscript(lines);
    const c = r.courses.find((x) => x.courseId === 'CS 6210');
    assert.ok(c, 'two-line row parsed');
    assert.equal(c!.credits, 3);
    assert.equal(c!.grade, 'A-');
    assert.match(c!.title ?? '', /Distributed Computing/);
  });

  it('refuses term/summary lines that look like codes ("FALL 2023  GPA 3.85")', () => {
    const lines = [...PURDUE.slice(0, 6), 'FALL 2023   GPA 3.85', 'SEM 2   TOTAL 15.0   A', ...PURDUE.slice(12)];
    const r = parseExternalTranscript(lines);
    assert.ok(!r.courses.some((x) => /FALL|SEM|TOTAL|GPA/.test(x.courseId)), 'no phantom term/summary courses');
  });

  it('strips record/transcript suffixes from the university guess', () => {
    const lines = ['TSINGHUA UNIVERSITY STUDENT RECORD', ...PURDUE.slice(1)];
    assert.equal(parseExternalTranscript(lines).university, 'TSINGHUA UNIVERSITY');
  });

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
    assert.equal(r.courses[1]?.grade, 'A'); // A+ maps to A, the top of ND's scale (2026-09-05; the student can change it)
    assert.equal(r.courses[1]?.rawGrade, undefined);
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

describe('OCR confidence flags', () => {
  it('flags rows whose source line read below the floor; leaves confident rows unflagged', () => {
    const lines = [
      'Some University   Transcript of Records',
      'MATH 21001   Linear Algebra   4.0   A',
      'CS 5321   Operating Systems   3.0   B',
      ...Array(10).fill('Record issued by the Registrar — verify with the issuing office before relying on it.'),
    ];
    const conf = lines.map(() => 96);
    conf[2] = 61; // the CS 5321 line was hard to read
    const r = parseExternalTranscript(lines, conf);
    assert.equal(r.courses.length, 2);
    assert.equal(r.courses[0]?.lowConfidence, undefined);
    assert.equal(r.courses[1]?.lowConfidence, true);
  });

  it('flags OCR rows whose credits are not a half-credit multiple (0→6 misreads)', () => {
    const lines = [
      'Some University   Transcript of Records',
      'MATH 21001   Linear Algebra   3.6   A',
      ...Array(10).fill('Record issued by the Registrar.'),
    ];
    const withConf = parseExternalTranscript(lines, lines.map(() => 96));
    assert.equal(withConf.courses[0]?.lowConfidence, true);
    const noConf = parseExternalTranscript(lines);
    assert.equal(noConf.courses[0]?.lowConfidence, undefined); // text layer: trust the file
  });

  it('never flags anything when no confidences are given (text-layer path)', () => {
    const r = parseExternalTranscript([
      'Some University   Transcript of Records',
      'MATH 21001   Linear Algebra   4.0   A',
      ...Array(10).fill('Record issued by the Registrar.'),
    ]);
    assert.equal(r.courses[0]?.lowConfidence, undefined);
  });
});

// Combined B.S.+M.S. / 4+1 transcripts (2026-09-05): the per-row level lets a
// single transcript feed both undergraduate (§4.4.1 only) and graduate (§5.2)
// coursework — from a UG/GR cell, a level block, or the bachelor's conferral date.
describe('per-row level on combined transcripts (2026-09-05)', () => {
  it('splits rows at a dated bachelor’s conferral by term', () => {
    const p = parseExternalTranscript([
      ...PURDUE.slice(0, 5),
      'Bachelor of Science in Computer Science — Conferred: May 11, 2024',
      'Fall 2023',
      'CS 25100   Data Structures and Algorithms   4.0   A',
      'Spring 2024',
      'CS 35400   Operating Systems                3.0   A-',
      'Fall 2024',
      'CS 50300   Operating Systems                3.0   A',
      'CS 58000   Algorithm Design                 3.0   B+',
      'Master of Science in Computer Science — Conferred: May 10, 2025',
      ...PURDUE.slice(13),
    ]);
    assert.equal(p.bachelorsConferredOn, '2024-05-11');
    assert.equal(p.mixedLevels, true);
    assert.equal(p.degreeConferred, true);
    assert.deepEqual(
      p.courses.map((c) => [c.courseId, c.level]),
      [
        ['CS 25100', 'undergraduate'],
        ['CS 35400', 'undergraduate'],
        ['CS 50300', 'graduate'],
        ['CS 58000', 'graduate'],
      ],
    );
  });

  it('reads UG/GR cells on the row and "Level:" / "Term Totals" blocks; leaves rows undecided otherwise', () => {
    const p = parseExternalTranscript([
      ...PURDUE.slice(0, 5),
      'Fall 2023',
      'CS 25100 UG  Data Structures and Algorithms   4.0   A',
      'CS 50300 GR  Operating Systems                3.0   A',
      'Level: Graduate',
      'Spring 2024',
      'CS 58000   Algorithm Design                 3.0   B+',
      'Term Totals (Undergraduate)',
      'Fall 2024',
      'CS 35400   Operating Systems                3.0   A-',
      ...PURDUE.slice(13),
    ]);
    assert.deepEqual(
      p.courses.map((c) => [c.courseId, c.level, c.title]),
      [
        ['CS 25100', 'undergraduate', 'Data Structures and Algorithms'],
        ['CS 50300', 'graduate', 'Operating Systems'],
        ['CS 58000', 'graduate', 'Algorithm Design'],
        ['CS 35400', 'undergraduate', 'Operating Systems'],
      ],
    );
    assert.equal(p.mixedLevels, true);
    const plain = parseExternalTranscript(PURDUE);
    assert.ok(plain.courses.every((c) => c.level === undefined), 'no marker → no level (the slot decides)');
    assert.equal(plain.mixedLevels, undefined);
    assert.equal(plain.bachelorsConferredOn, undefined);
  });

  it('a line that merely starts with "Graduate …" is not a level block', () => {
    const p = parseExternalTranscript([
      ...PURDUE.slice(0, 5),
      'Graduate Operating Systems is a core course.',
      'Fall 2023',
      'CS 50300   Operating Systems                3.0   A',
      ...PURDUE.slice(13),
    ]);
    assert.equal(p.courses.length, 1);
    assert.equal(p.courses[0]?.level, undefined);
  });
});

// The bachelor's date under other labels (DGS request 2026-09-06, late evening:
// "use the degree conferral date or degree completion date"): "Degree Completion
// Date", "Conferral Date", "Date Conferred", "05/2024" — before or after the
// degree name. It splits the rows and pre-fills "Bachelor's degree awarded".
describe('bachelor’s conferral or completion date wording (2026-09-06, late evening)', () => {
  const rows = ['Fall 2023', 'CS 35400   Operating Systems   3.0   A', 'Fall 2024', 'CS 50300   Operating Systems   3.0   A'];
  const parse = (degreeLines: string[]) => parseExternalTranscript([...PURDUE.slice(0, 5), ...degreeLines, ...rows, ...PURDUE.slice(13)]);

  it('reads a "Degree Completion Date" line after the degree name and splits the rows at it', () => {
    const p = parse(['Bachelor of Science in Computer Science', 'Major: Computer Science', 'Degree Completion Date: 05/17/2024']);
    assert.equal(p.bachelorsConferredOn, '2024-05-17');
    assert.deepEqual(
      p.courses.map((c) => [c.courseId, c.level]),
      [
        ['CS 35400', 'undergraduate'],
        ['CS 50300', 'graduate'],
      ],
    );
    assert.equal(p.degreeConferred, undefined, 'a bachelor’s is not graduate-degree evidence');
  });

  it('reads "Conferral Date" up to two lines BEFORE the name, "Date Conferred" after it, and a month/year date', () => {
    assert.equal(parse(['Conferral Date: May 17, 2024', 'Bachelor of Arts, Computer Science']).bachelorsConferredOn, '2024-05-17');
    assert.equal(parse(['Degree Completion Date: 05/17/2024', 'College of Science', 'Bachelor of Science']).bachelorsConferredOn, '2024-05-17');
    assert.equal(parse(['Bachelor of Science', 'Date Conferred 17-MAY-2024']).bachelorsConferredOn, '2024-05-17');
    assert.equal(parse(['Bachelor of Science', 'Degree Completion Date: 05/2024']).bachelorsConferredOn, '2024-05-15', 'month/year → the 15th; only the term matters');
  });

  it('never takes a forecast, a sought degree, a date too far away, or the next degree’s date', () => {
    assert.equal(parse(['Degree Sought: Bachelor of Science', 'Expected Graduation: May 2027']).bachelorsConferredOn, undefined);
    assert.equal(parse(['Bachelor of Science in Computer Science', 'Expected Graduation Date: 05/17/2027']).bachelorsConferredOn, undefined);
    assert.equal(parse(['Conferral Date: May 17, 2024', 'a', 'b', 'c', 'Bachelor of Science']).bachelorsConferredOn, undefined, 'a dated line four lines earlier is not this degree’s');
    assert.equal(parse(['Bachelor of Science', 'Master of Science — Conferred: May 10, 2025']).bachelorsConferredOn, undefined);
    assert.equal(parse(['Bachelor of Science', 'Master of Science — Conferred: May 10, 2025']).degreeConferred, true);
  });
});

// Johns Hopkins (DGS 2026-09-08): the unofficial transcript shows the name in
// the letterhead IMAGE, so the text never spells it out — but it does say
// "JHU Degree and Date Conferred".
describe('a university whose name is printed only as an image (2026-09-08)', () => {
  const JHU = [
    'Office of the University Registrar',
    'Unofficial Transcript',
    'Name: A. Blue Jay                     Student ID: 000000000',
    'Program: Master of Science in Engineering, Computer Science',
    'This unofficial transcript is provided for the student. It is not certified.',
    'Grade scale: A 4.00  B 3.00  C 2.00  D 1.00  F 0.00. Credits are semester hours.',
    'JHU Degree and Date Conferred: Master of Science in Engineering, 05/2025',
    '',
    'Fall 2023',
    'EN.601.433   Intro Algorithms                    3.0   A',
    'EN.601.418   Operating Systems                   3.0   B+',
    '',
    'Cumulative GPA: 3.70',
    'Total credits earned: 30.0',
    'End of unofficial transcript.',
  ];

  it('recognises the school from the acronym and records its real name', () => {
    // The name the student, the DGS and the Grad Admin read, and the key the
    // ExternalCourses tab is matched on.
    assert.equal(parseExternalTranscript(JHU).university, 'Johns Hopkins University');
  });

  it('reads the dotted course code, and the two-cell layout of the same code', () => {
    assert.deepEqual(
      parseExternalTranscript(JHU).courses.map((c) => `${c.courseId} ${c.title} ${c.credits} ${c.grade}`),
      ['EN.601.433 Intro Algorithms 3 A', 'EN.601.418 Operating Systems 3 B+'],
    );
    const twoCells = JHU.map((l) => l.replace(/^EN\.(\d{3})\./, 'EN   $1.'));
    assert.deepEqual(parseExternalTranscript(twoCells).courses.map((c) => c.courseId), ['EN 601.433', 'EN 601.418']);
  });

  it('two dots are required, so a dotted word is not a course code', () => {
    const notCourses = JHU.map((l) => l.replace('EN.601.433   Intro Algorithms', 'VOL.12   Something Printed Here').replace('EN.601.418   Operating Systems', 'MAY.2025   Conferred'));
    assert.deepEqual(parseExternalTranscript(notCourses).courses, []);
  });

  it('a name printed as TEXT always wins — the acronym is only a last resort', () => {
    assert.equal(parseExternalTranscript(['Purdue University', ...JHU]).university, 'Purdue University');
  });

  it('the acronym must be capitals, so a lower-case look-alike renames nothing', () => {
    const lower = JHU.map((l) => l.replace('JHU Degree and Date Conferred', 'Jhu, Chen-Wei — Degree and Date Conferred'));
    assert.equal(parseExternalTranscript(lower).university, undefined);
  });

  it('a name worked out from an acronym is marked as a guess, so the preview lets it be corrected', () => {
    assert.equal(parseExternalTranscript(JHU).universityGuessed, true);
    assert.equal(parseExternalTranscript(['Purdue University', ...JHU]).universityGuessed, undefined, 'a name read as text is not a guess');
  });

  it('the degree heading on a line of its own opens the degree block', () => {
    // "JHU Degree and Date Conferred" with the values BELOW it — the
    // column-gap test alone missed it, and the M.S. then read as not
    // completed, which halves the §5.2 cap (2026-09-08).
    const heading = JHU.map((l) =>
      l.startsWith('JHU Degree') ? 'JHU Degree and Date Conferred' : l,
    );
    heading.splice(heading.indexOf('JHU Degree and Date Conferred') + 1, 0, 'Master of Science in Engineering        05/2025');
    assert.equal(parseExternalTranscript(heading).degreeConferred, true);
  });

  it('a section number between the code and the title is not read as the credits', () => {
    const withSections = JHU.map((l) => l.replace(/^(EN\.\d{3}\.\d{3})   /, '$1   01   '));
    assert.deepEqual(parseExternalTranscript(withSections).courses.map((c) => c.credits), [3, 3]);
  });
});

// UC San Diego (DGS 2026-09-09): the logo is an image, the page is tiled with
// a "UNIVERSITY OF CALIFORNIA, SAN DIEGO" watermark whose fragments the parser
// read as the name, and another school's degree is listed above UCSD's own.
describe('a transcript whose watermark looks like its name (2026-09-09)', () => {
  const UCSD = [
    'UNIVERSITY OF CALIFORNIA, SAN DIEGO • UNIVERSITY OF CALIFORNIA, SAN DIEGO • UNIVERSITY OF CALIFORNIA, SAN DIEGO',
    'TRANSCRIPT OF ACADEMIC RECORD',
    'UNIVERSITY   OF CALIFORNIA, SAN DIE',
    'UNIVERSITY.',
    '--DEGREES AWARDED BY OTHER INSTITUTIONS---',
    'BS        06/24        College in China Peoples Republic',
    'STUDENT LEVEL          :  Graduate',
    'COLLEGE                :  Graduate Division',
    'DEPARTMENT(S)          :  Computer Science & Engineering',
    'MAJOR(S)               :  Computer Science',
    '------------UCSD DEGREES AWARDED-----------',
    'AWARD:      Master of Science          CONFERRED: 03/21/26',
    'TERM:       Winter Qtr 2026',
    '',
    'FALL QTR 2024',
    'CSE 202    Algorithm Design and Analysis        4.00   A',
    'CSE 221    Operating Systems                    4.00   B+',
    '',
    'WINTER QTR 2025',
    'CSE 240A   Principles of Computer Architecture  4.00   A-',
    '',
    'TERM CREDITS PASSED : 8.00     TERM GPA : 3.70',
    '----------------------End of Transcript----------------------',
  ];

  it('names the school from its own abbreviation, not from the watermark', () => {
    const r = parseExternalTranscript(UCSD);
    assert.equal(r.university, 'University of California, San Diego');
    assert.equal(r.universityGuessed, true, 'a guess, so the student can correct it');
  });

  it('a generic fragment is never a name on its own', () => {
    // "UNIVERSITY", and the tiled watermark line, used to be the answer.
    const watermarkOnly = UCSD.filter((l) => !/UCSD|OTHER INSTITUTIONS|College in China/.test(l));
    assert.equal(parseExternalTranscript(watermarkOnly).university, undefined);
  });

  it('the degree block of ANOTHER institution does not name this transcript', () => {
    assert.doesNotMatch(parseExternalTranscript(UCSD).university ?? '', /China/);
  });

  it('reads the courses, and puts a Winter quarter in spring rather than the term before it', () => {
    // Winter and Johns Hopkins' Intersession used to inherit the previous
    // header's season, dating a January course months late — and the term is
    // locked on a text-layer import, so the student could not fix it.
    assert.deepEqual(
      parseExternalTranscript(UCSD).courses.map((c) => `${c.courseId} ${c.season} ${c.year}`),
      ['CSE 202 fall 2024', 'CSE 221 fall 2024', 'CSE 240A spring 2025'],
    );
  });
});

// Georgia Tech (DGS bug report 2026-09-08): "ID" is Industrial Design, not an
// identifier, and the header abbreviates the institute.
describe('Georgia Tech: the "ID" subject and the abbreviated name (2026-09-08)', () => {
  const GT = [
    'Georgia Inst. of Technology',
    'Office of the Registrar',
    'Unofficial Transcript',
    'Student: A. Yellowjacket',
    '',
    'Fall 2023',
    'ID 4104    Industrial Design Studio           3.0   A',
    'CS 6250    Computer Networks                  3.0   B+',
    '',
    'Spring 2024',
    'ID 6202    Design Methods                     3.0   A-',
    '',
    'Cumulative GPA: 3.80',
  ];

  it('reads the institution even when it prints "Inst." for Institute, and spells it out', () => {
    // The unofficial transcript abbreviates it; students, the DGS and the Grad
    // Admin all read the real name (DGS 2026-09-08).
    assert.equal(parseExternalTranscript(GT).university, 'Georgia Institute of Technology');
  });

  it('keeps ID courses instead of mistaking the subject for an identifier', () => {
    const p = parseExternalTranscript(GT);
    assert.deepEqual(
      p.courses.map((c) => [c.courseId, c.title, c.credits, c.grade]),
      [
        ['ID 4104', 'Industrial Design Studio', 3, 'A'],
        ['CS 6250', 'Computer Networks', 3, 'B+'],
        ['ID 6202', 'Design Methods', 3, 'A-'],
      ],
    );
  });

  it('a record-number line is still not a course — no title after the number', () => {
    const p = parseExternalTranscript([...GT.slice(0, 4), 'ID   123456', 'ID   4104', ...GT.slice(5)]);
    const ids = p.courses.map((c) => c.courseId);
    assert.deepEqual(ids, ['ID 4104', 'CS 6250', 'ID 6202'], 'the bare identifier lines are left out: ' + JSON.stringify(ids));
  });

  it('a Master’s-only record names no bachelor’s, so nothing marks it a 4+1', () => {
    assert.equal(parseExternalTranscript(GT).bachelorsNamed, undefined);
    const withBs = parseExternalTranscript([...GT, 'Bachelor of Science in Industrial Design']);
    assert.equal(withBs.bachelorsNamed, true);
  });
});
