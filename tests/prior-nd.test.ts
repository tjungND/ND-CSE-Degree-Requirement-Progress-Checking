// Prior Notre Dame coursework (2026-09-05): Notre Dame courses dated before the
// entry term are filed as prior coursework and re-filed whenever the entry
// term moves (src/ui/prior-nd.ts, pure), and a saved file never inherits the
// fresh record's "assumed" entry-term flag (src/ui/state.ts).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { CourseEntry, Student } from '../src/engine/types.ts';
import { isPriorNd, priorNdDegreeLevel, reclassifyNotreDameCourses } from '../src/ui/prior-nd.ts';
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
  it('level: the registered level decides, the course number is the fallback', () => {
    assert.equal(priorNdDegreeLevel({ courseId: 'CSE 60641', registeredLevel: 'undergraduate' }), 'bachelors', 'a graduate course taken as an undergraduate');
    assert.equal(priorNdDegreeLevel({ courseId: 'CSE 30321', registeredLevel: 'graduate' }), 'masters');
    assert.equal(priorNdDegreeLevel({ courseId: 'CSE 30321' }), 'bachelors');
    assert.equal(priorNdDegreeLevel({ courseId: 'CSE 60641' }), 'masters');
    assert.equal(priorNdDegreeLevel({ courseId: 'CSE 50502' }), 'masters', '5xxxx is unknown → graduate, i.e. §5.2 applies');
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

  it('keeps a valid registeredLevel and drops a malformed one', () => {
    const base = { ...emptyStudent(), courses: [nd('CSE 60641', 'fall', 2024, { registeredLevel: 'graduate' }), nd('CSE 60111', 'fall', 2024, { registeredLevel: 'grad' as never })] };
    const s = validateStudent(JSON.parse(JSON.stringify(base)));
    assert.equal(s.courses[0]?.registeredLevel, 'graduate');
    assert.equal(s.courses[1]?.registeredLevel, undefined);
  });
});
