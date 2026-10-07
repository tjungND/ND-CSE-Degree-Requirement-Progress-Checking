// A course shared with the student's other degree waits on the Graduate
// School's approval of the dual-degree plan, not on the DGS (policy review
// round 3, P3-dh-front-1-2-2; DGS 2026-10-06: "Apply the suggested
// handling"). DGS Handbook §2.9: "the student will select a plan of study
// acceptable to both departments. … The plan must then be approved by the
// Graduate School." The approvals row, the next steps, the review request and
// the advisor summary sent it to the DGS — the reason's "DGS Handbook §2.9"
// matched the DGS — and the request told the DGS a filled row was blank.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { audit } from '../src/engine/audit.ts';
import { coursesNeedingDgsReview } from '../src/engine/review.ts';
import type { Student, Term } from '../src/engine/types.ts';
import { actionItems } from '../src/ui/advisor-summary.ts';
import { nextSteps } from '../src/ui/next-steps.ts';
import { buildRules } from './helpers.ts';
import { ndCourse, phdStudent } from './helpers/student.ts';

const rules = buildRules();
const t = (season: Term['season'], year: number): Term => ({ season, year });
const student = (extra: Student['courses'] = []): Student =>
  phdStudent({
    entryTerm: t('fall', 2025),
    gpa: 3.6,
    concurrentDegree: true,
    courses: [ndCourse('CSE 60641', { term: t('fall', 2025), sharedWithOtherDegree: true }), ndCourse('CSE 60321', { term: t('fall', 2025) }), ...extra],
    milestones: { advisorIdentified: '2025-10-01', advisorName: 'Prof. Example', advisorTtt: 'yes' },
    attestations: { advisorApprovedPlan: true },
  });

describe('the dual-degree plan is the Graduate School’s (P3-dh-front-1-2-2)', () => {
  const s = student();
  const report = audit(s, rules, '2026-06-01');
  it('nothing goes to the DGS', () => {
    assert.deepEqual(coursesNeedingDgsReview(s, rules, '2026-06-01'), []);
    const items = actionItems(report);
    assert.ok(!items.dgs.some((d) => /CSE 60641/.test(d)), JSON.stringify(items.dgs));
    assert.ok(!items.student.some((d) => /Send the DGS the review request/.test(d)), JSON.stringify(items.student));
    assert.ok(items.student.includes('Get the Graduate School’s approval of my dual-degree plan of study, which counts CSE 60641 toward both degrees (DGS Handbook §2.9).'), JSON.stringify(items.student));
  });
  it('the next steps name the tick, not a review request', () => {
    const steps = nextSteps({ report, student: s, review: { unlisted: 0, caseByCase: 0 }, processingCount: 0 }).map((x) => x.text);
    assert.ok(steps.includes('Once the Graduate School approves your dual-degree plan of study, tick it under Approvals you already have (DGS Handbook §2.9).'), steps.join(' | '));
    assert.ok(!steps.some((x) => /review request/.test(x)), steps.join(' | '));
  });
  it('a shared course with a real DGS question keeps that question — never “the row is blank”', () => {
    const s2 = student([ndCourse('MATH 60610', { term: t('fall', 2025), sharedWithOtherDegree: true })]);
    const asks = coursesNeedingDgsReview(s2, rules, '2026-06-01');
    const math = asks.find((a) => a.course.entry.courseId === 'MATH 60610');
    assert.ok(math, 'the unlisted course is still asked about');
    assert.ok(!asks.some((a) => a.ask.decide.some((d) => /the row is blank/.test(d))), JSON.stringify(asks.map((a) => a.ask)));
  });
});
