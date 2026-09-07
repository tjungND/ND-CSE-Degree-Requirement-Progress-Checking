// Which courses the review request asks about (2026-09-06 evening: the DGS
// reported the "Ask the DGS to review" card vanishing for good). A row in the
// ExternalCourses tab is a decision only where its cells say something.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { coursesNeedingDgsReview } from '../src/engine/review.ts';
import type { CourseEntry, Student } from '../src/engine/types.ts';
import { buildRules } from './helpers.ts';

type Row = Record<string, string>;
const row = (course_id: string, extra: Row = {}): Row => ({ university: 'PURDUE UNIVERSITY', course_id, course_title: 'x', ...extra });

const purdue = (courseId: string, title: string, extra: Partial<CourseEntry> = {}): CourseEntry => ({
  courseId,
  title,
  credits: 3,
  term: { season: 'fall', year: 2024 },
  grade: 'A',
  origin: 'transfer',
  institution: 'Purdue University',
  ...extra,
});
const student = (courses: CourseEntry[]): Student => ({
  schemaVersion: 1,
  program: 'phd',
  entryTerm: { season: 'fall', year: 2026 },
  priorMs: 'completed',
  courses,
  milestones: {},
  attestations: {},
});
const ids = (s: Student, external: Row[] | undefined) =>
  coursesNeedingDgsReview(s, external === undefined ? buildRules() : buildRules({ external }))
    .map((p) => `${p.course.entry.courseId}:${p.unlisted ? 'new-row' : 'decide'}`)
    .sort();
const reasonOf = (s: Student, external: Row[], courseId: string) =>
  coursesNeedingDgsReview(s, buildRules({ external })).find((p) => p.course.entry.courseId === courseId)?.reason;

describe('coursesNeedingDgsReview — courses from another university', () => {
  it('no row: a graduate course is pending and needs a new row; below the grade floor only a core-sounding title is', () => {
    assert.deepEqual(ids(student([purdue('CS 51000', 'Data Mining')]), []), ['CS 51000:new-row']);
    assert.equal(reasonOf(student([purdue('CS 51000', 'Data Mining')]), [], 'CS 51000'), 'not yet reviewed by the DGS');
    assert.deepEqual(ids(student([purdue('CS 51000', 'Data Mining', { grade: 'C' })]), []), []);
    assert.deepEqual(ids(student([purdue('CS 50300', 'Operating Systems', { grade: 'C' })]), []), ['CS 50300:new-row']);
    assert.match(reasonOf(student([purdue('CS 50300', 'Operating Systems', { grade: 'C' })]), [], 'CS 50300')!, /no transfer credit, but the title suggests/);
  });

  it('a row with both cells blank (pasted from the request, not decided yet) keeps the course in the request', () => {
    // The regression: before the fix any row counted as "ruled" and the course dropped out for good.
    const blank = [row('CS 51000'), row('CS 50300')];
    assert.deepEqual(ids(student([purdue('CS 51000', 'Data Mining'), purdue('CS 50300', 'Operating Systems')]), blank), ['CS 50300:decide', 'CS 51000:decide']);
    assert.equal(reasonOf(student([purdue('CS 51000', 'Data Mining')]), blank, 'CS 51000'), 'transferability not yet decided');
    assert.match(reasonOf(student([purdue('CS 50300', 'Operating Systems')]), blank, 'CS 50300')!, /transferability not yet decided, and no core area recorded/);
  });

  it('a blank row for an undergraduate course: pending only while a core-sounding title has no core-area decision', () => {
    const blank = [row('CS 25100'), row('CS 30700')];
    const s = student([purdue('CS 25100', 'Operating Systems', { degreeLevel: 'bachelors' }), purdue('CS 30700', 'Special Topics', { degreeLevel: 'bachelors' })]);
    assert.deepEqual(ids(s, blank), ['CS 25100:decide']);
    assert.match(reasonOf(s, blank, 'CS 25100')!, /reviewed by the DGS, but no core area recorded/);
  });

  it('transferable decided: still pending while a core-sounding title has no core-area decision; `none` closes it', () => {
    const s = student([purdue('CS 50300', 'Advanced Algorithms')]);
    assert.deepEqual(ids(s, [row('CS 50300', { transferable: 'yes' })]), ['CS 50300:decide']);
    assert.deepEqual(ids(s, [row('CS 50300', { transferable: 'yes', satisfies_core_area: 'algorithms' })]), []);
    assert.deepEqual(ids(s, [row('CS 50300', { transferable: 'no' })]), ['CS 50300:decide']);
    assert.deepEqual(ids(s, [row('CS 50300', { transferable: 'no', satisfies_core_area: 'none' })]), []);
    assert.deepEqual(ids(student([purdue('CS 59000', 'Special Topics')]), [row('CS 59000', { transferable: 'no' })]), []);
  });

  it('the `none` value parses as a decision (null), a blank as undecided (undefined)', () => {
    const rules = buildRules({ external: [row('CS 47300', { satisfies_core_area: 'none' }), row('CS 47301')] });
    assert.equal(rules.external.find((r) => r.courseId === 'CS 47300')?.satisfiesCoreArea, null);
    assert.equal(rules.external.find((r) => r.courseId === 'CS 47301')?.satisfiesCoreArea, undefined);
    assert.equal(buildRules().external.find((r) => r.courseId === 'CS 47300')?.satisfiesCoreArea, null, 'the fixture tab carries a none row');
  });
});

describe('coursesNeedingDgsReview — Notre Dame coursework', () => {
  const nd = (courseId: string, title: string, extra: Partial<CourseEntry> = {}): CourseEntry => ({
    courseId,
    title,
    credits: 3,
    term: { season: 'fall', year: 2026 },
    grade: 'A',
    origin: 'nd',
    ...extra,
  });

  it('an unlisted course needs a new Courses-tab row — CSE or not (MATH 60610 used to be listed but never offered as a row)', () => {
    const s = student([nd('CSE 60641', 'Graduate Operating Systems'), nd('CSE 69999', 'Unknown Seminar'), nd('MATH 60610', 'Basic Real Analysis')]);
    const pending = coursesNeedingDgsReview(s, buildRules());
    assert.deepEqual(pending.map((p) => `${p.course.entry.courseId}:${p.kind}:${p.unlisted ? 'new-row' : 'decide'}`), ['CSE 69999:nd:new-row', 'MATH 60610:nd:new-row']);
    assert.equal(pending[0]!.reason, 'not in the course rules yet');
    assert.match(pending[1]!.reason, /non-CSE course/);
  });

  it('prior Notre Dame coursework: a Courses-tab core area decides §4.4.1; otherwise a core-sounding undergraduate title is asked about', () => {
    const prior = (courseId: string, title: string, degreeLevel: CourseEntry['degreeLevel']): CourseEntry =>
      nd(courseId, title, { origin: 'transfer', institution: 'University of Notre Dame', degreeLevel, term: { season: 'fall', year: 2024 } });
    const s = student([prior('CSE 30321', 'Computer Architecture', 'bachelors'), prior('CSE 20110', 'Discrete Mathematics', 'bachelors'), prior('CSE 60641', 'Graduate Operating Systems', 'bachelors')]);
    const pending = coursesNeedingDgsReview(s, buildRules());
    assert.deepEqual(pending.map((p) => `${p.course.entry.courseId}:${p.kind}:${p.unlisted ? 'new-row' : 'decide'}`), ['CSE 30321:priorNd:new-row']);
    assert.match(pending[0]!.reason, /taken at Notre Dame before entering the program \(undergraduate\) — not in the course rules yet/);
  });
});
