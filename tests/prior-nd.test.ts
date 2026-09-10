// Prior Notre Dame coursework (2026-09-05): Notre Dame courses dated before the
// entry term are filed as prior coursework and re-filed whenever the entry
// term moves (src/ui/prior-nd.ts, pure), and a saved file never inherits the
// fresh record's "assumed" entry-term flag (src/ui/state.ts).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { CourseEntry, Student } from '../src/engine/types.ts';
import { deriveNdMasters, derivePriorMs, hasPriorGraduateStudy, isPriorNd, priorNdDegreeLevel, reclassifyNotreDameCourses } from '../src/ui/prior-nd.ts';
import { emptyStudent, validateStudent } from '../src/ui/state.ts';

const nd = (courseId: string, season: 'fall' | 'spring', year: number, extra: Partial<CourseEntry> = {}): CourseEntry => ({
  courseId,
  credits: 3,
  term: { season, year },
  grade: 'A',
  origin: 'nd',
  ...extra,
});

describe('prior Notre Dame coursework', () => {
  it('level: the registered level decides; then the bachelor’s award term (2026-09-06); the course number last', () => {
    const fall23 = { season: 'fall', year: 2023 } as const;
    const spring24 = { season: 'spring', year: 2024 } as const;
    const fall24 = { season: 'fall', year: 2024 } as const;
    assert.equal(priorNdDegreeLevel({ courseId: 'CSE 60641', registeredLevel: 'undergraduate', term: fall23 }), 'bachelors', 'a graduate course taken as an undergraduate');
    assert.equal(priorNdDegreeLevel({ courseId: 'CSE 30321', registeredLevel: 'graduate', term: fall23 }), 'masters');
    assert.equal(priorNdDegreeLevel({ courseId: 'CSE 60641', registeredLevel: 'graduate', term: spring24 }, spring24), 'masters', 'the registration label stays — the engine withholds the credit');
    assert.equal(priorNdDegreeLevel({ courseId: 'CSE 60641', term: fall23 }, spring24), 'bachelors', 'no label: dated before the award');
    assert.equal(priorNdDegreeLevel({ courseId: 'CSE 60641', term: spring24 }, spring24), 'bachelors', 'the award term itself counts as before');
    assert.equal(priorNdDegreeLevel({ courseId: 'CSE 30321', term: fall24 }, spring24), 'masters', 'no label: dated after the award');
    assert.equal(priorNdDegreeLevel({ courseId: 'CSE 30321', term: fall23 }), 'bachelors', 'no label, no award term: the number');
    assert.equal(priorNdDegreeLevel({ courseId: 'CSE 60641', term: fall23 }), 'masters');
    assert.equal(priorNdDegreeLevel({ courseId: 'CSE 50502', term: fall23 }), 'masters', '5xxxx is unknown → graduate, i.e. §5.2 applies');
  });

  it('re-files courses both ways when the entry term moves; other institutions are untouched', () => {
    const student: Student = {
      ...emptyStudent(),
      entryTerm: { season: 'fall', year: 2024 },
      courses: [
        nd('CSE 30321', 'fall', 2023, { registeredLevel: 'undergraduate' }),
        nd('CSE 60641', 'fall', 2023, { registeredLevel: 'undergraduate' }),
        nd('CSE 60111', 'fall', 2024, { registeredLevel: 'graduate' }),
        nd('CSE 60321', 'spring', 2025),
        { ...nd('CS 50300', 'fall', 2020), origin: 'transfer', institution: 'Purdue University' },
      ],
    };
    assert.deepEqual(reclassifyNotreDameCourses(student), { toPrior: 2, toProgram: 0 });
    const prior = student.courses.filter((c) => isPriorNd(c, student.entryTerm));
    assert.deepEqual(
      prior.map((c) => [c.courseId, c.origin, c.institution, c.degreeLevel]),
      [
        ['CSE 30321', 'transfer', 'University of Notre Dame', 'bachelors'],
        ['CSE 60641', 'transfer', 'University of Notre Dame', 'bachelors'],
      ],
    );
    assert.equal(student.courses.find((c) => c.courseId === 'CS 50300')?.institution, 'Purdue University');
    assert.deepEqual(reclassifyNotreDameCourses(student), { toPrior: 0, toProgram: 0 }, 'idempotent');

    // The student moves the entry term earlier → the courses come back.
    student.entryTerm = { season: 'fall', year: 2023 };
    assert.deepEqual(reclassifyNotreDameCourses(student), { toPrior: 0, toProgram: 2 });
    assert.ok(student.courses.filter((c) => c.courseId !== 'CS 50300').every((c) => c.origin === 'nd' && c.institution === undefined && c.degreeLevel === undefined));

    // Later → graduate-level prior coursework is a prior Master's (§5.2).
    student.entryTerm = { season: 'fall', year: 2025 };
    assert.deepEqual(reclassifyNotreDameCourses(student), { toPrior: 4, toProgram: 0 });
    assert.equal(student.courses.find((c) => c.courseId === 'CSE 60111')?.degreeLevel, 'masters');
    assert.equal(student.courses.find((c) => c.courseId === 'CSE 60321')?.degreeLevel, 'masters', 'no registered level → by number');

    // With a bachelor's award term (2026-09-06), an unlabelled row follows it, a labelled one keeps its label.
    student.entryTerm = { season: 'fall', year: 2023 };
    reclassifyNotreDameCourses(student); // everything back into the program
    student.bachelorsAwarded = { season: 'spring', year: 2025 };
    student.entryTerm = { season: 'fall', year: 2025 };
    assert.deepEqual(reclassifyNotreDameCourses(student), { toPrior: 4, toProgram: 0 });
    assert.equal(student.courses.find((c) => c.courseId === 'CSE 60111')?.degreeLevel, 'masters', 'registered graduate: the label stays');
    assert.equal(student.courses.find((c) => c.courseId === 'CSE 60321')?.degreeLevel, 'bachelors', 'no registered level → the award term, not the number');
  });
});

describe('prior Notre Dame rows follow the bachelor’s award term in either order (2026-09-07)', () => {
  const twoRows = (): Student => ({
    ...emptyStudent(),
    entryTerm: { season: 'fall', year: 2026 },
    courses: [
      nd('CSE 60641', 'fall', 2024), // graduate number, transcript said nothing
      nd('CSE 60111', 'fall', 2024, { registeredLevel: 'graduate' }), // the transcript labelled it
    ],
  });

  it('setting the award term AFTER the import re-levels rows already filed as prior', () => {
    // The order a student actually works in: import the Notre Dame
    // transcript, then fill in "Bachelor's degree awarded" under Your
    // standing (the field sits below the transcripts card).
    const later = twoRows();
    reclassifyNotreDameCourses(later);
    assert.equal(later.courses[0]?.degreeLevel, 'masters', 'no award term yet → the course number decides');
    later.bachelorsAwarded = { season: 'spring', year: 2025 };
    reclassifyNotreDameCourses(later);

    // The other order: the award term is known before the rows are filed.
    const first = twoRows();
    first.bachelorsAwarded = { season: 'spring', year: 2025 };
    reclassifyNotreDameCourses(first);

    assert.deepEqual(
      later.courses.map((c) => c.degreeLevel),
      first.courses.map((c) => c.degreeLevel),
      'the order of the two actions must not change the result',
    );
    assert.equal(later.courses[0]?.degreeLevel, 'bachelors', 'dated before the award → undergraduate coursework');
    assert.equal(later.courses[1]?.degreeLevel, 'masters', 'a transcript-labelled row keeps its label');
  });

  it('clearing the award term falls back to the course number, and re-levelling moves nothing', () => {
    const s = twoRows();
    s.bachelorsAwarded = { season: 'spring', year: 2025 };
    reclassifyNotreDameCourses(s);
    assert.equal(s.courses[0]?.degreeLevel, 'bachelors');
    s.bachelorsAwarded = undefined;
    assert.deepEqual(reclassifyNotreDameCourses(s), { toPrior: 0, toProgram: 0 }, 're-levelling is not a move');
    assert.equal(s.courses[0]?.degreeLevel, 'masters', 'no award term → the course number again');
    assert.equal(s.courses[0]?.origin, 'transfer', 'it stays prior coursework');
  });
});

describe('entry-term flag in saved files', () => {
  it('a fresh record is "assumed"; a saved file without the flag is not; a saved flag survives', () => {
    assert.deepEqual(emptyStudent().entryTermInferred, { how: 'assumed' });
    const saved = { ...emptyStudent(), entryTermInferred: undefined };
    const file = JSON.parse(JSON.stringify({ savedAt: 'x', student: saved })) as { student: Record<string, unknown> };
    delete file.student['entryTermInferred'];
    assert.equal(validateStudent(file).entryTermInferred, undefined);
    const flagged = validateStudent({
      ...file.student,
      entryTermInferred: { how: 'the first graduate-level term on your transcript', alternative: { term: { season: 'fall', year: 2026 }, why: 'reason' } },
    });
    assert.deepEqual(flagged.entryTermInferred, { how: 'the first graduate-level term on your transcript', alternative: { term: { season: 'fall', year: 2026 }, why: 'reason' } });
    const malformed = validateStudent({ ...file.student, entryTermInferred: { how: 'x', alternative: { term: 'Fall 2026' } } });
    assert.deepEqual(malformed.entryTermInferred, { how: 'x' });
    assert.equal(validateStudent({ ...file.student, entryTermInferred: 'assumed' }).entryTermInferred, undefined);
  });

  it('keeps a valid bachelorsAwarded (and its flag) and drops malformed ones (2026-09-06)', () => {
    const base = { ...emptyStudent(), bachelorsAwarded: { season: 'spring', year: 2024 }, bachelorsAwardedInferred: { how: 'the Bachelor of Science awarded 2024-05-18 on your Notre Dame transcript' } };
    const s = validateStudent(JSON.parse(JSON.stringify(base)));
    assert.deepEqual(s.bachelorsAwarded, { season: 'spring', year: 2024 });
    assert.deepEqual(s.bachelorsAwardedInferred, { how: 'the Bachelor of Science awarded 2024-05-18 on your Notre Dame transcript' });
    const malformed = validateStudent({ ...JSON.parse(JSON.stringify(base)), bachelorsAwarded: 'Spring 2024' });
    assert.equal(malformed.bachelorsAwarded, undefined);
    assert.equal(malformed.bachelorsAwardedInferred, undefined, 'the flag never survives without the term');
    assert.equal(validateStudent({ ...JSON.parse(JSON.stringify(base)), bachelorsAwardedInferred: 'yes' }).bachelorsAwardedInferred, undefined);
    assert.equal(validateStudent(JSON.parse(JSON.stringify(emptyStudent()))).bachelorsAwarded, undefined);
  });

  it('keeps a valid registeredLevel and drops a malformed one', () => {
    const base = { ...emptyStudent(), courses: [nd('CSE 60641', 'fall', 2024, { registeredLevel: 'graduate' }), nd('CSE 60111', 'fall', 2024, { registeredLevel: 'grad' as never })] };
    const s = validateStudent(JSON.parse(JSON.stringify(base)));
    assert.equal(s.courses[0]?.registeredLevel, 'graduate');
    assert.equal(s.courses[1]?.registeredLevel, undefined);
  });

  // The Notre Dame import flags what it added (2026-09-06) so its Remove
  // button can take back exactly those rows; a saved file keeps the flag,
  // and a malformed value is dropped rather than refusing the file.
  it('keeps the fromNdTranscript flag and drops a malformed one', () => {
    const base = { ...emptyStudent(), courses: [nd('CSE 60641', 'fall', 2024, { fromNdTranscript: true }), nd('CSE 60111', 'fall', 2024, { fromNdTranscript: 'yes' as never }), nd('CSE 60321', 'fall', 2024)] };
    const s = validateStudent(JSON.parse(JSON.stringify(base)));
    assert.equal(s.courses[0]?.fromNdTranscript, true);
    assert.equal(s.courses[1]?.fromNdTranscript, undefined);
    assert.equal(s.courses[2]?.fromNdTranscript, undefined);
  });
});

// A Ph.D. student who did their MASTER'S at Notre Dame too (DGS 2026-09-09).
// "Prior graduate study" drives the §5.2 cap (6 credits or 24), and it used to
// be worked out only while a transcript was being imported — so a student who
// imported one combined transcript and THEN corrected their entry term to the
// Ph.D. start kept "none" and a 6-credit cap.
describe('prior graduate study follows the coursework', () => {
  const priorMasters = (courseId: string, season: 'fall' | 'spring', year: number): CourseEntry => ({
    courseId,
    credits: 3,
    term: { season, year },
    grade: 'A',
    origin: 'transfer',
    institution: 'University of Notre Dame',
    degreeLevel: 'masters',
    registeredLevel: 'graduate',
  });

  it('an entry-term correction that reveals a prior Notre Dame master\u2019s sets it', () => {
    const s: Student = {
      ...emptyStudent(),
      program: 'phd',
      entryTerm: { season: 'fall', year: 2022 }, // read as the MSCSE start
      bachelorsAwarded: { season: 'spring', year: 2022 },
      courses: [nd('CSE 60641', 'fall', 2022), nd('CSE 60111', 'spring', 2023), nd('CSE 63801', 'fall', 2024)],
    };
    assert.equal(s.priorMs, 'none');
    s.entryTerm = { season: 'fall', year: 2024 }; // the student corrects it to the Ph.D. start
    reclassifyNotreDameCourses(s);
    assert.equal(derivePriorMs(s), true);
    assert.equal(s.priorMs, 'unfinished', 'no degree is recorded, so the student is asked to confirm it');
    assert.equal(s.priorMsInferred, true);
  });

  it('with the Notre Dame master\u2019s recorded it is "completed" — the 24-credit cap', () => {
    const s: Student = {
      ...emptyStudent(),
      program: 'phd',
      entryTerm: { season: 'fall', year: 2024 },
      bachelorsAwarded: { season: 'spring', year: 2022 },
      ndMasters: { term: { season: 'spring', year: 2024 } },
      courses: [priorMasters('CSE 60641', 'fall', 2022)],
    };
    derivePriorMs(s);
    assert.equal(s.priorMs, 'completed');
  });

  // A 4+1 senior takes 6xxxx courses in their last undergraduate year (§3.5).
  // That is not a prior master's program, and saying so put "Prior M.S., not
  // completed" into the emails of students who never had one.
  it('a senior-year graduate course before the bachelor\u2019s degree is not prior graduate study', () => {
    const s: Student = {
      ...emptyStudent(),
      program: 'phd',
      entryTerm: { season: 'fall', year: 2024 },
      bachelorsAwarded: { season: 'spring', year: 2024 },
      courses: [priorMasters('CSE 60641', 'spring', 2024)],
    };
    assert.equal(hasPriorGraduateStudy(s), false);
    assert.equal(derivePriorMs(s), false);
    assert.equal(s.priorMs, 'none');
    // ... but the same course a year later, after the degree, is.
    s.courses[0]!.term = { season: 'fall', year: 2024 };
    s.entryTerm = { season: 'fall', year: 2025 };
    assert.equal(hasPriorGraduateStudy(s), true);
  });

  it('never overrules an answer the student gave themselves', () => {
    const s: Student = {
      ...emptyStudent(),
      program: 'phd',
      entryTerm: { season: 'fall', year: 2024 },
      priorMs: 'completed', // chosen, not inferred
      courses: [],
    };
    assert.equal(derivePriorMs(s), false);
    assert.equal(s.priorMs, 'completed');
  });

  it('takes an INFERRED value back when the coursework it came from is gone', () => {
    const s: Student = {
      ...emptyStudent(),
      program: 'phd',
      entryTerm: { season: 'fall', year: 2024 },
      priorMs: 'unfinished',
      priorMsInferred: true,
      courses: [],
    };
    assert.equal(derivePriorMs(s), true);
    assert.equal(s.priorMs, 'none');
    assert.equal(s.priorMsInferred, undefined);
  });

  it('keeps a Notre Dame master\u2019s through a saved file, and drops a malformed one', () => {
    const base = { ...emptyStudent(), ndMasters: { term: { season: 'spring', year: 2024 }, inferred: { how: 'your Notre Dame transcript' } } };
    const s = validateStudent(JSON.parse(JSON.stringify(base)));
    assert.deepEqual(s.ndMasters, { term: { season: 'spring', year: 2024 }, inferred: { how: 'your Notre Dame transcript' } });
    // Ticked by hand: no term, and it still means the degree is held.
    assert.deepEqual(validateStudent({ ...JSON.parse(JSON.stringify(emptyStudent())), ndMasters: {} }).ndMasters, {});
    assert.deepEqual(validateStudent({ ...JSON.parse(JSON.stringify(base)), ndMasters: { term: 'Spring 2024' } }).ndMasters, {});
    assert.equal(validateStudent(JSON.parse(JSON.stringify(emptyStudent()))).ndMasters, undefined);
  });
});

// The 4+1 as the app actually meets it (2026-09-10). One Notre Dame transcript
// holds the B.S., the §3.5 senior-year courses, the MSCSE and the Ph.D., and
// the import reads the entry term as the FIRST graduate term — the §3.5
// course, two years early. Everything that turns on the entry term has to be
// worked out again when the student corrects it, or a student who holds the
// MSCSE gets an "unfinished prior M.S." and a 6-credit §5.2 cap instead of 24.
describe('a 4+1 correcting the entry term', () => {
  const grad = (courseId: string, season: 'fall' | 'spring', year: number): CourseEntry => ({
    courseId, credits: 3, term: { season, year }, grade: 'A', origin: 'nd', registeredLevel: 'graduate',
  });
  const fourPlusOne = (): Student => ({
    ...emptyStudent(),
    program: 'phd',
    entryTerm: { season: 'fall', year: 2024 }, // as the import reads it: the §3.5 senior-year term
    bachelorsAwarded: { season: 'spring', year: 2025 },
    ndDegrees: [
      { level: 'bachelors', date: '2025-05-18' },
      { level: 'masters', date: '2026-05-17' },
    ],
    courses: [grad('CSE 60641', 'fall', 2024), grad('CSE 60321', 'fall', 2025), grad('CSE 63801', 'fall', 2026)],
  });

  it('at import the master’s is not yet "already held" — it is dated after the term just read', () => {
    const s = fourPlusOne();
    deriveNdMasters(s);
    assert.equal(s.ndMasters, undefined, 'Spring 2026 is not before Fall 2024');
  });

  it('correcting the entry term re-reads the degree, and the cap follows it', () => {
    const s = fourPlusOne();
    deriveNdMasters(s);
    derivePriorMs(s);
    s.entryTerm = { season: 'fall', year: 2026 }; // the student corrects it
    reclassifyNotreDameCourses(s);
    deriveNdMasters(s);
    derivePriorMs(s);
    assert.deepEqual(s.ndMasters?.term, { season: 'spring', year: 2026 });
    assert.equal(s.priorMs, 'completed', 'a completed prior degree — the §5.2 cap is 24, not 6');
  });

  it('an inferred "unfinished" is upgraded once the Notre Dame master’s is known', () => {
    const s: Student = { ...fourPlusOne(), entryTerm: { season: 'fall', year: 2026 }, priorMs: 'unfinished', priorMsInferred: true, ndDegrees: undefined };
    reclassifyNotreDameCourses(s);
    derivePriorMs(s);
    assert.equal(s.priorMs, 'unfinished', 'nothing yet says the degree was finished');
    s.ndMasters = {}; // the student ticks "I already hold the MSCSE from Notre Dame"
    derivePriorMs(s);
    assert.equal(s.priorMs, 'completed');
  });

  it('a master’s awarded DURING the program is §4.5’s, not one already held', () => {
    const s: Student = { ...fourPlusOne(), entryTerm: { season: 'fall', year: 2024 }, ndDegrees: [{ level: 'masters', date: '2027-05-16' }] };
    deriveNdMasters(s);
    assert.equal(s.ndMasters, undefined);
  });

  it('a value the student set by hand is never re-read', () => {
    const s: Student = { ...fourPlusOne(), entryTerm: { season: 'fall', year: 2024 }, ndMasters: {} };
    assert.equal(deriveNdMasters(s), false);
    assert.deepEqual(s.ndMasters, {}, 'their tick stands, whatever the transcript says');
  });

  it('keeps the transcript’s degree list through a saved file, and drops malformed entries', () => {
    const base = { ...emptyStudent(), ndDegrees: [{ level: 'masters', date: '2026-05-17' }, { level: 'other', date: '2026-05-17' }, { level: 'masters', date: 'May 2026' }] };
    assert.deepEqual(validateStudent(JSON.parse(JSON.stringify(base))).ndDegrees, [{ level: 'masters', date: '2026-05-17' }]);
    assert.equal(validateStudent(JSON.parse(JSON.stringify(emptyStudent()))).ndDegrees, undefined);
  });
});
