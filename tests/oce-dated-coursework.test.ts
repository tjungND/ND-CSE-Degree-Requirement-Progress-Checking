// A dated OCE's coursework, as of the exam (policy review round 3,
// P3-cse-4b-1; DGS 2026-10-06: "Decision 1: The exam's semester; Decision 2:
// (a)"). CSE §4.5: "All coursework for the Ph.D. must be completed (or in
// progress the same semester) before the candidacy exam can be taken" — the
// 24 regular-course credits and the qualifier's core-knowledge and
// specialization courses (DGS 2026-10-05). Once an OCE was dated the app used
// to check today's credits alone: a course registered later hid a short exam,
// a later W flagged a legitimate one, and a missing core course was never
// asked about. Now the record as it stood at the exam is checked in full; a
// shortfall goes to the DGS, and the admission card holds "apply now" until
// the DGS settles it.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { audit } from '../src/engine/audit.ts';
import type { ConditionMark, CourseEntry, Milestones, Student, Term } from '../src/engine/types.ts';
import { actionItems } from '../src/ui/advisor-summary.ts';
import { buildRules } from './helpers.ts';
import { ndCourse, phdStudent } from './helpers/student.ts';

const rules = buildRules();
const fall = (year: number): Term => ({ season: 'fall', year });
const spring = (year: number): Term => ({ season: 'spring', year });
const NO_ALGORITHMS = ['CSE 60641', 'CSE 60321', 'CSE 60427', 'CSE 60535', 'CSE 60762', 'CSE 60770', 'CSE 60868', 'CSE 60876'];
const FIRST_FOUR = [fall(2023), spring(2024), fall(2024), spring(2025)];
const student = (courses: CourseEntry[], milestones: Milestones, over: Partial<Student> = {}): Student =>
  phdStudent({
    entryTerm: fall(2023),
    bachelorsAwarded: spring(2023),
    gpa: 3.6,
    courses,
    fullTimeTermOverrides: FIRST_FOUR,
    milestones: { advisorIdentified: '2023-10-01', advisorName: 'Prof. Example', advisorTtt: 'yes', rcrTrainingCompleted: '2024-09-15', ...milestones },
    ...over,
  });
const twoATerm = (ids: string[]) => ids.map((id, i) => ndCourse(id, { term: FIRST_FOUR[Math.floor(i / 2)]! }));
const rows = (s: Student, today = '2026-10-05') => {
  const report = audit(s, rules, today);
  const find = (id: string) => report.requirements.find((r) => r.id === id)!;
  return { report, oce: find('phd.candidacy'), admission: find('phd.candidacyAdmission') };
};
const oceMark = (r: { detailParts?: unknown[] }) =>
  (r.detailParts ?? []).find((p): p is { check: string; mark: ConditionMark } => typeof p === 'object' && p !== null && 'check' in p && String((p as { check: string }).check).startsWith('Oral Candidacy Exam'))?.mark;

describe('a dated OCE is checked against the coursework at the exam (P3-cse-4b-1)', () => {
  it('a missing core course goes to the DGS, the admission card waits, the advisor email asks', () => {
    const s = student(twoATerm(NO_ALGORITHMS), { candidacyPassed: '2025-11-15' });
    const { report, oce, admission } = rows(s);
    assert.equal(oce.status, 'needs_dgs_review');
    assert.equal(oce.courseworkReview, 'no Algorithms core-knowledge course');
    assert.match(oce.detail, /At the exam \(Fall 2025\) you show no Algorithms core-knowledge course — §4\.5 requires the coursework complete, or in progress that semester, before the exam; confirm with the DGS that it could be taken/);
    assert.match(admission.detail, /Oral Candidacy Exam \(OCE\): passed 2025-11-15 — the DGS confirms the coursework at the exam/);
    assert.equal(oceMark(admission), 'waiting');
    assert.doesNotMatch(admission.detail, /Every condition is met/, 'Decision 2 (a): "apply now" waits');
    assert.ok(actionItems(report).dgs.some((d) => d.startsWith('Confirm that my Oral Candidacy Exam (OCE) could be taken — at the exam I showed no Algorithms core-knowledge course')), JSON.stringify(actionItems(report).dgs));
  });
  it('credits registered after a short exam do not hide it', () => {
    const five = twoATerm(['CSE 60641', 'CSE 60111', 'CSE 60321', 'CSE 60427', 'CSE 60535']);
    const later = ['CSE 60762', 'CSE 60770', 'CSE 60868'].map((id) => ndCourse(id, { term: fall(2026), grade: 'IP' }));
    const { oce } = rows(student([...five, ...later], { candidacyPassed: '2025-04-20' }));
    assert.equal(oce.status, 'needs_dgs_review');
    assert.match(oce.courseworkReview ?? '', /^15 of 24 regular-course credits/);
  });
  it('a course withdrawn after the exam does not flag a legitimate one: it was in progress that semester', () => {
    const done = twoATerm(['CSE 60641', 'CSE 60111', 'CSE 60321', 'CSE 60427', 'CSE 60535']);
    const examSemester = [ndCourse('CSE 60762', { term: spring(2025) }), ndCourse('CSE 60770', { term: spring(2025) }), ndCourse('CSE 60868', { term: spring(2025), grade: 'W' })];
    const { oce } = rows(student([...done, ...examSemester], { candidacyPassed: '2025-04-20' }));
    assert.equal(oce.status, 'met', oce.detail);
    assert.equal(oce.courseworkReview, undefined);
  });
  it('a qualifier passed under the earlier requirements covers the components', () => {
    const s = student(twoATerm(NO_ALGORITHMS), { candidacyPassed: '2025-11-15' }, { attestations: { qualifierPassedUnderPriorRules: true } });
    assert.equal(rows(s).oce.courseworkReview, undefined);
  });
  it('a late but otherwise complete OCE still lets the admission card say "apply now"', () => {
    // Entered Fall 2021: the eighth semester ended with Spring 2025; the exam in Fall 2025 is late.
    const terms = [fall(2021), spring(2022), fall(2022), spring(2023)];
    const ids = ['CSE 60641', 'CSE 60111', 'CSE 60321', 'CSE 60427', 'CSE 60535', 'CSE 60762', 'CSE 60770', 'CSE 60876'];
    const s = phdStudent({
      entryTerm: fall(2021),
      bachelorsAwarded: spring(2021),
      gpa: 3.6,
      courses: ids.map((id, i) => ndCourse(id, { term: terms[Math.floor(i / 2)]! })),
      fullTimeTermOverrides: terms,
      milestones: { advisorIdentified: '2021-10-01', advisorName: 'Prof. Example', advisorTtt: 'yes', rcrTrainingCompleted: '2022-09-15', candidacyPassed: '2025-09-15' },
    });
    const { oce, admission } = rows(s, '2025-10-05');
    assert.equal(oce.status, 'needs_dgs_review');
    assert.equal(oce.courseworkReview, undefined, 'late, not short');
    assert.equal(oceMark(admission), 'met');
    assert.match(admission.detail, /Every condition is met/);
  });
});

describe('the overdue OCE card lists all the coursework, not the credits alone', () => {
  it('24 credits and no Algorithms course, past the eighth semester', () => {
    const terms = [fall(2022), spring(2023), fall(2023), spring(2024)];
    const s = phdStudent({
      entryTerm: fall(2022),
      bachelorsAwarded: spring(2022),
      gpa: 3.6,
      courses: NO_ALGORITHMS.map((id, i) => ndCourse(id, { term: terms[Math.floor(i / 2)]! })),
      fullTimeTermOverrides: terms,
      milestones: { advisorIdentified: '2022-10-01', advisorName: 'Prof. Example', advisorTtt: 'yes' },
    });
    const { oce } = rows(s);
    assert.equal(oce.deadline?.state, 'overdue');
    assert.match(oce.detail, /still needed: an Algorithms core-knowledge course \(§4\.5\)/);
  });
});
