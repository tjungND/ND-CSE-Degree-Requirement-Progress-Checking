// A retake is a registration in its own semester (policy review round 3,
// P3-chg-other-2; DGS 2026-10-06: "Apply the suggested handling"). The
// retake rule keeps an earlier C-or-better as the counted attempt, so an
// in-progress retake is superseded — and the semester-of-graduation check and
// the candidacy card's "Registered this semester" line used to drop it,
// telling a student whose only course that semester is the retake that no
// course was entered (Academic Code §3.7; DGS Handbook §3.23.1). The
// full-time record already counted it (policy review 2026-10-03, Item 20).
// Now all three ask residency.ts's one question: only a same-term duplicate
// is dropped.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { audit } from '../src/engine/audit.ts';
import type { CourseEntry, Student, Term } from '../src/engine/types.ts';
import { gradAdminRequest } from '../src/ui/grad-admin-request.ts';
import { nextSteps } from '../src/ui/next-steps.ts';
import { buildRules } from './helpers.ts';
import { ndCourse, phdStudent } from './helpers/student.ts';

const rules = buildRules();
const TODAY = '2026-10-06';
const fall = (year: number): Term => ({ season: 'fall', year });
const spring = (year: number): Term => ({ season: 'spring', year });
const TEN = ['CSE 60641', 'CSE 60321', 'CSE 60427', 'CSE 60535', 'CSE 60762', 'CSE 60770', 'CSE 60876', 'CSE 60332', 'CSE 60657'];

/** The finding's student: 30 credits with a C in CSE 60111 (Fall 2025), graduating Fall 2026 and retaking CSE 60111 as the only Fall 2026 course. */
const mscse = (courses: CourseEntry[]): Student =>
  phdStudent({
    program: 'mscse',
    msOption: 'project',
    entryTerm: fall(2025),
    bachelorsAwarded: spring(2025),
    gpa: 2.95,
    graduationTerm: fall(2026),
    courses,
    milestones: { advisorIdentified: '2025-10-01', advisorName: 'Prof. Example' },
  });
const earlier = TEN.map((id, i) => ndCourse(id, { term: i < 5 ? fall(2025) : spring(2026) }));
const retakeStudent = mscse([...earlier, ndCourse('CSE 60111', { term: fall(2025), grade: 'C' }), ndCourse('CSE 60111', { term: fall(2026), grade: 'IP' })]);

describe('the semester of graduation counts a retake (Academic Code §3.7)', () => {
  it('registered, with no warning, no "Register" step and no "I will register"', () => {
    const report = audit(retakeStudent, rules, TODAY);
    assert.deepEqual(report.graduation, { term: fall(2026), registeredCredits: 3, registered: true });
    assert.ok(!report.warnings.some((w) => w.startsWith('You plan to graduate in Fall 2026')), JSON.stringify(report.warnings));
    const steps = nextSteps({ report, student: retakeStudent, review: { unlisted: 0, caseByCase: 0 }, processingCount: 0 });
    assert.ok(!steps.some((s) => s.text.startsWith('Register for at least one credit hour in Fall 2026')));
    const { text } = gradAdminRequest(report, retakeStudent, rules, { todayIso: TODAY, entryTerm: 'Fall 2025', priorStudy: 'None', gpa: 2.95 });
    assert.match(text, /I plan to graduate in Fall 2026; I am registered for it \(3 credits entered\)/);
  });
  it('the full-time record and the graduation check agree on the term', () => {
    const report = audit(retakeStudent, rules, TODAY);
    const residency = report.requirements.find((r) => r.id === 'ms.residency')!;
    assert.equal(report.graduation?.registeredCredits, 3);
    assert.doesNotMatch(residency.detail, /Fall 2026[^.]*0 credits/);
  });
  it('a course entered twice for the same semester still counts its credits once', () => {
    const twice = mscse([...earlier, ndCourse('CSE 60111', { term: fall(2026), grade: 'IP' }), ndCourse('CSE 60111', { term: fall(2026), grade: 'IP' })]);
    assert.deepEqual(audit(twice, rules, TODAY).graduation, { term: fall(2026), registeredCredits: 3, registered: true });
  });
  it('a withdrawn retake is still not a registration for graduation', () => {
    const withdrawn = mscse([...earlier, ndCourse('CSE 60111', { term: fall(2025), grade: 'C' }), ndCourse('CSE 60111', { term: fall(2026), grade: 'W' })]);
    assert.equal(audit(withdrawn, rules, TODAY).graduation?.registered, false);
  });
});

describe('the candidacy card’s "Registered this semester" counts a retake', () => {
  it('a retake of a C as the only course this semester: its credits are entered', () => {
    // A Fall 2026 entrant with the 24 regular credits over four semesters, a C
    // in CSE 60111 among them, retaking it in Fall 2028 as the only course.
    const REGULAR = ['CSE 60641', 'CSE 60111', 'CSE 60321', 'CSE 60427', 'CSE 60535', 'CSE 60762', 'CSE 60770', 'CSE 60876'];
    const terms = [fall(2026), spring(2027), fall(2027), spring(2028)];
    const s = phdStudent({
      gpa: 3.4,
      courses: [
        ...REGULAR.map((id, i) => ndCourse(id, { term: terms[Math.floor(i / 2)]!, grade: id === 'CSE 60111' ? 'C' : 'A' })),
        ndCourse('CSE 60111', { term: fall(2028), grade: 'IP' }),
      ],
      fullTimeTermOverrides: terms,
      milestones: { advisorIdentified: '2026-10-01', advisorName: 'Prof. Example', advisorTtt: 'yes', rcrTrainingCompleted: '2027-09-15' },
    });
    const card = audit(s, rules, '2028-09-20').requirements.find((r) => r.id === 'phd.candidacyAdmission')!;
    assert.match(card.detail, /Registered this semester \(Fall 2028\): 3 credits entered/);
  });
});
