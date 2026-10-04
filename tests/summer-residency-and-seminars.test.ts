// Policy review 2026-10-04 (DGS):
// P1-page-text-ui-9 — "Count a summer term automatically at six credits for
//   the MSCSE residency row (a summer_fulltime_credits_min parameter)". DGS
//   Handbook §10.3.2: the master's residency "may include summer session if
//   the student is registered for six or more credits". The Ph.D.'s residency
//   never counts a summer (§4.3).
// P1-sheet-40 — the DGS set CSE 63801/63802 to adgs_approval on the MSCSE:
//   "If approved, they may count towards the 30 but not 24." Only the Ph.D.'s
//   phd_seminar_courses fill "the research seminar requirement"; any other
//   seminar-type course, and every seminar on the MSCSE, says it counts toward
//   the total only.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { audit } from '../src/engine/audit.ts';
import type { CourseEntry, Student, Term } from '../src/engine/types.ts';
import { buildRules } from './helpers.ts';
import { ndCourse, phdStudent } from './helpers/student.ts';

const rules = buildRules();
const fall = (year: number): Term => ({ season: 'fall', year });
const spring = (year: number): Term => ({ season: 'spring', year });
const summer = (year: number): Term => ({ season: 'summer', year });
const ms = (courses: CourseEntry[]): Student => ({
  schemaVersion: 1,
  program: 'mscse',
  msOption: 'project',
  entryTerm: fall(2025),
  priorMs: 'none',
  gpa: 3.5,
  courses,
  milestones: { advisorIdentified: '2025-10-01', advisorName: 'Prof. Example' },
  attestations: {},
});
const row = (s: Student, id: string, rr = rules) => audit(s, rr, '2026-10-04').requirements.find((r) => r.id === id)!;
/** Part-time fall and spring (3 credits each), and a summer of `credits`. */
const withSummer = (credits: number, extra: Partial<CourseEntry> = {}) =>
  ms([
    ndCourse('CSE 60641', { term: fall(2025) }),
    ndCourse('CSE 60111', { term: spring(2026) }),
    ndCourse('CSE 60321', { term: summer(2026), credits: credits - 3, ...extra }),
    ndCourse('CSE 60427', { term: summer(2026), credits: 3, ...extra }),
  ]);

describe('MSCSE residency: a summer session of six registered credits counts on its own (DGS Handbook §10.3.2)', () => {
  it('six credits in Summer 2026 with no full-time fall or spring: Met', () => {
    const r = row(withSummer(6), 'ms.residency');
    assert.equal(r.status, 'met');
    assert.match(r.detail, /^Full-time in Summer 2026\./);
    assert.match(r.detail, /A summer session counts with 6 or more registered credits \(DGS Handbook §10\.3\.2\), or with any registration beside a full-time spring or fall of the same year \(Academic Code §3\.6\)/);
  });
  it('five credits do not', () => {
    const r = row(withSummer(5), 'ms.residency');
    assert.equal(r.status, 'in_progress');
    assert.match(r.detail, /^No full-time semester yet/);
  });
  it('a summer of withdrawals does not', () => {
    assert.equal(row(withSummer(6, { grade: 'W' }), 'ms.residency').status, 'in_progress');
  });
  it('the Ph.D. never counts a summer (§4.3)', () => {
    const s = phdStudent({ entryTerm: fall(2025), gpa: 3.5, courses: withSummer(6).courses });
    assert.match(row(s, 'phd.residency').detail, /0 of 4/);
  });
  it('with the key missing: “cannot evaluate” where only a summer could count, and the diagnostics say what is lost', () => {
    const missing = buildRules({ parameters: { summer_fulltime_credits_min: null } });
    const r = row(withSummer(6), 'ms.residency', missing);
    assert.equal(r.status, 'cannot_evaluate');
    assert.match(r.detail, /missing 'summer_fulltime_credits_min'/);
    const issue = missing.issues.find((i) => i.message.includes('summer_fulltime_credits_min'));
    assert.equal(issue?.severity, 'error');
    assert.match(issue!.message, /cannot count a summer session by its credits/);
  });
  it('with the key missing, a full-time fall still settles it', () => {
    const missing = buildRules({ parameters: { summer_fulltime_credits_min: null } });
    const s = ms([ndCourse('CSE 60641', { term: fall(2025) }), ndCourse('CSE 60111', { term: fall(2025) }), ndCourse('CSE 60321', { term: fall(2025) }), ndCourse('CSE 60427', { term: summer(2026) })]);
    assert.equal(row(s, 'ms.residency', missing).status, 'met');
  });
});

describe('seminar course lines (P1-sheet-40)', () => {
  const adgs = buildRules({ courses: [{ course_id: 'CSE 63801', set: { counts_toward_mscse: 'adgs_approval' } }] });
  const line = (s: Student, id: string, rr = rules) => audit(s, rr, '2026-10-04').courseLines.find((l) => l.courseId === id)!.text;
  it('MSCSE: under adgs_approval, CSE 63801 waits for the ADGS and would count toward the total only', () => {
    const s = ms([ndCourse('CSE 60641', { term: fall(2025) }), ndCourse('CSE 63801', { term: fall(2025), credits: 1 })]);
    assert.match(line(s, 'CSE 63801', adgs), /^waiting for the ADGS — would count toward the total-credit requirement only \(1 cr\) once approved/);
    assert.doesNotMatch(line(s, 'CSE 63801', adgs), /seminar requirement/);
    assert.match(row(s, 'ms.credits.total', adgs).detail, /3 of 30 credits complete\. 1 pending review\/approval/);
  });
  it('MSCSE: approved, it counts toward the 30 and never the 24', () => {
    const s = ms([ndCourse('CSE 60641', { term: fall(2025) }), ndCourse('CSE 63801', { term: fall(2025), credits: 1, dgsApproved: true })]);
    assert.match(line(s, 'CSE 63801', adgs), /^counts toward the total-credit requirement only \(1 cr\)/);
    assert.match(row(s, 'ms.credits.total', adgs).detail, /^4 of 30 credits complete/);
    assert.match(row(s, 'ms.credits.regular', adgs).detail, /^3 of 24 credits complete/);
  });
  it('Ph.D.: the listed seminars fill the seminar requirement; another seminar-type course feeds the total only', () => {
    const seminarType = buildRules({ courses: [{ course_id: 'CSE 60111', set: { course_type: 'seminar' } }] });
    const s = phdStudent({ entryTerm: fall(2025), courses: [ndCourse('CSE 63801', { term: fall(2025), credits: 1 }), ndCourse('CSE 60111', { term: fall(2025) })] });
    assert.match(line(s, 'CSE 63801', seminarType), /^counts toward the research seminar requirement \(1 cr\)/);
    assert.match(line(s, 'CSE 60111', seminarType), /^counts toward the total-credit requirement only \(3 cr\)/);
  });
});
