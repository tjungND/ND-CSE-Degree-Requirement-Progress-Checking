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

  // `dgs_approval` (DGS 2026-09-08) decides the COURSE and leaves the STUDENT
  // open, so the course keeps its place in the request — with a reason that
  // tells the student what to say — while `yes` and `no` close the §5.2 part.
  // The card names the open decision and nothing else (DGS 2026-09-08): why a
  // course is decided case by case — its relevance to the student's research —
  // is settled between the advisor and the DGS, so the student is not asked to
  // argue it anywhere on the page.
  it('transferable = dgs_approval keeps the course in the request, without asking the student to justify it', () => {
    const s = student([purdue('STAT 51200', 'Applied Regression Analysis')]);
    const caseRow = [row('STAT 51200', { transferable_PhD: 'dgs_approval', satisfies_core_area: 'none' })];
    assert.deepEqual(ids(s, caseRow), ['STAT 51200:decide'], 'it needs a DECISION, not a new sheet row');
    // No pronoun, and no instruction: this reason is a column of the e-mail
    // the student sends the DGS, so it must read the same way to both of them.
    assert.equal(reasonOf(s, caseRow, 'STAT 51200'), 'transfer needs DGS approval (§5.2)');
    // A core-sounding title with no core-area decision adds its half to the
    // same line rather than replacing it.
    const both = student([purdue('CS 50300', 'Operating Systems')]);
    assert.match(
      reasonOf(both, [row('CS 50300', { transferable_PhD: 'dgs_approval' })], 'CS 50300')!,
      /^transfer needs DGS approval \(§5\.2\), and no core area recorded/,
    );
    // `yes` and `no` still close the transfer half.
    assert.deepEqual(ids(s, [row('STAT 51200', { transferable: 'yes', satisfies_core_area: 'none' })]), []);
    assert.deepEqual(ids(s, [row('STAT 51200', { transferable: 'no', satisfies_core_area: 'none' })]), []);
    // And so does the student's own attestation that the approval came
    // through — otherwise the report says "met" while the card still asks the
    // DGS to decide the same course (2026-09-08).
    const attested = { ...s, attestations: { transferApproved: true } };
    assert.deepEqual(ids(attested, caseRow), []);
    assert.deepEqual(ids(attested, [row('STAT 51200')]), [], 'the same for a row whose cell is blank');
  });

  // The DGS types these words by hand into a spreadsheet cell.
  it('a hand-typed verdict forgives the separator and the capitals', () => {
    const s2 = student([purdue('STAT 51200', 'Applied Regression Analysis')]);
    for (const typed of ['dgs_approval', 'DGS approval', 'dgs-approval', 'DGS_Approval', 'adgs_approval', 'ADGS approval']) {
      const rules = buildRules({ external: [row('STAT 51200', { transferable_PhD: typed, satisfies_core_area: 'none' })] });
      assert.match(rules.external[0]?.transferablePhd ?? '', /^a?dgs_approval$/, typed);
      assert.equal(rules.issues.filter((i) => i.tab === 'ExternalCourses').length, 0, typed);
      assert.equal(coursesNeedingDgsReview(s2, rules).length, 1, typed);
    }
    // A different word is still an error, and the cell is ignored.
    const bad = buildRules({ external: [row('STAT 51200', { transferable_PhD: 'maybe' })] });
    assert.equal(bad.external[0]?.transferablePhd, undefined);
    assert.match(bad.issues.find((i) => i.column === 'transferable_phd')?.message ?? '', /'yes', 'no', 'dgs_approval', 'adgs_approval' or blank/);
  });

  // Two columns since 2026-09-09: the ruling that applies depends on the
  // student's own program, and a sheet still using the one `transferable`
  // column fills both.
  it('the Ph.D. and the MSCSE ruling are read separately', () => {
    const split = [row('STAT 51200', { transferable_PhD: 'yes', transferable_MSCSE: 'adgs_approval', satisfies_core_area: 'none' })];
    const phd = student([purdue('STAT 51200', 'Applied Regression Analysis')]);
    const ms: Student = { ...phd, program: 'mscse' };
    assert.deepEqual(ids(phd, split), [], 'pre-approved for a Ph.D. student');
    assert.deepEqual(ids(ms, split), ['STAT 51200:decide'], 'the MSCSE side still needs an approval');
    assert.equal(reasonOf(ms, split, 'STAT 51200'), 'transfer needs ADGS approval (§5.2)'); // the ADGS decides for the MSCSE (2026-09-11)
  });

  it('the old single column still fills both programs', () => {
    const oneColumn = [row('STAT 51200', { transferable: 'yes', satisfies_core_area: 'none' })];
    const phd = student([purdue('STAT 51200', 'Applied Regression Analysis')]);
    assert.deepEqual(ids(phd, oneColumn), []);
    assert.deepEqual(ids({ ...phd, program: 'mscse' }, oneColumn), []);
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

  // DGS 2026-09-11: "they 'may' count, subject to all other constraints, so
  // they should be listed when a MSCSE uploads an ND undergrad transcript for
  // further decisions & review." The sheet's `dgs_approval` is what makes them
  // a "may"; the ticked attestation is what settles it.
  it('an MSCSE student’s own 40000-level undergraduate coursework is listed until the approval exists', () => {
    const ug = (courseId: string, title: string): CourseEntry =>
      nd(courseId, title, { origin: 'transfer', institution: 'University of Notre Dame', degreeLevel: 'bachelors', term: { season: 'fall', year: 2025 }, countedToward: 'bs' });
    const ms = (attested: boolean): Student => ({
      schemaVersion: 1,
      program: 'mscse',
      entryTerm: { season: 'fall', year: 2026 },
      bachelorsAwarded: { season: 'spring', year: 2026 },
      priorMs: 'none',
      courses: [ug('CSE 40875', 'Statistical Computing'), ug('CSE 40437', 'Social Sensing'), ug('CSE 20110', 'Discrete Mathematics')],
      milestones: {},
      attestations: attested ? { dgsApproved4xxxx: true } : {},
    });
    const pending = coursesNeedingDgsReview(ms(false), buildRules());
    // CSE 40437 is `no` in the sheet and CSE 20110 too low to count: neither is a decision to make.
    assert.deepEqual(pending.map((p) => `${p.course.entry.courseId}:${p.kind}:${p.unlisted ? 'new-row' : 'decide'}`), ['CSE 40875:priorNd:decide']);
    assert.match(pending[0]!.reason, /may count toward the MSCSE \(§3\.2\) inside the allowance for courses below the 60000 level — needs advisor \+ ADGS approval/); // the ADGS decides for the MSCSE (2026-09-11)
    assert.deepEqual(coursesNeedingDgsReview(ms(true), buildRules()), []);
  });
});
