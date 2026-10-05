// A student enrolled in a second Notre Dame degree program at the same time
// (policy review 2026-10-04, P2-ac-1-3-2; DGS: "Apply suggested handling"):
// Academic Code §2.2 — "No more than nine credit hours of classes from any one
// master's degree may be counted toward any other graduate degree" — and DGS
// Handbook §2.9's "The plan must then be approved by the Graduate School".
// The nine is the Graduate School's, kept in code (DUAL_DEGREE_SHARED_CREDITS_MAX).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DUAL_DEGREE_SHARED_CREDITS_MAX } from '../src/engine/allocate.ts';
import { audit } from '../src/engine/audit.ts';
import type { Student, Term } from '../src/engine/types.ts';
import { validateStudent } from '../src/ui/state.ts';
import { buildRules } from './helpers.ts';
import { ndCourse } from './helpers/student.ts';

const rules = buildRules();
const fall = (year: number): Term => ({ season: 'fall', year });
const ms = (over: Partial<Student> = {}): Student => ({
  schemaVersion: 1,
  program: 'mscse',
  msOption: 'project',
  entryTerm: fall(2025),
  priorMs: 'none',
  gpa: 3.5,
  courses: [],
  milestones: { advisorIdentified: '2025-10-01', advisorName: 'Prof. Example' },
  attestations: {},
  ...over,
});
const shared = (id: string) => ndCourse(id, { term: fall(2025), sharedWithOtherDegree: true });
const ids = (s: Student) => audit(s, rules, '2026-03-01').requirements.map((r) => r.id);

describe('courses shared with a second Notre Dame degree (Academic Code §2.2)', () => {
  it('is a Graduate School number of nine, kept in code', () => {
    assert.equal(DUAL_DEGREE_SHARED_CREDITS_MAX, 9);
  });

  it('a tick counts for nothing until the student says they are in two programs', () => {
    const s = ms({ courses: [shared('CSE 60641'), shared('CSE 60111'), shared('CSE 60321'), shared('CSE 60427')], attestations: { dualPlanApproved: true } });
    assert.ok(!ids(s).includes('ms.cap.otherdegree'));
    assert.match(audit(s, rules, '2026-03-01').requirements.find((r) => r.id === 'ms.credits.total')!.detail, /^12 of 30/);
  });

  it('the allowance row appears only once a course draws on it', () => {
    assert.ok(!ids(ms({ concurrentDegree: true, courses: [ndCourse('CSE 60641', { term: fall(2025) })] })).includes('ms.cap.otherdegree'));
    assert.ok(ids(ms({ concurrentDegree: true, courses: [shared('CSE 60641')] })).includes('ms.cap.otherdegree'));
  });

  it('a transfer row never carries the tick into the allowance', () => {
    const s = ms({ concurrentDegree: true, courses: [{ ...shared('CSE 60641'), origin: 'transfer', institution: 'Purdue University', degreeLevel: 'masters' }] });
    assert.ok(!ids(s).includes('ms.cap.otherdegree'));
  });

  it('a course waiting only for the dual plan names the Graduate School, not the DGS', () => {
    const s = ms({ concurrentDegree: true, courses: [shared('CSE 60641')] });
    const text = audit(s, rules, '2026-03-01').courseLines.find((l) => l.courseId === 'CSE 60641')!.text;
    assert.match(text, /^waiting for the Graduate School — would count/);
    assert.match(text, /approve your dual-degree plan of study \(DGS Handbook §2\.9\)/);
  });

  it('a saved file keeps the answer, the ticks and the approval; junk values are dropped', () => {
    const kept = validateStudent({ ...ms({ concurrentDegree: true, courses: [shared('CSE 60641')] }), attestations: { dualPlanApproved: true } }, []);
    assert.equal(kept.concurrentDegree, true);
    assert.equal(kept.courses[0]!.sharedWithOtherDegree, true);
    assert.equal(kept.attestations.dualPlanApproved, true);
    const junk = validateStudent({ ...ms({ courses: [{ ...shared('CSE 60641'), sharedWithOtherDegree: 'yes' as unknown as true }] }), concurrentDegree: 'yes' as unknown as boolean, attestations: { dualPlanApproved: 'yes' as unknown as boolean } }, []);
    assert.equal(junk.concurrentDegree, undefined);
    assert.equal(junk.courses[0]!.sharedWithOtherDegree, undefined);
    assert.equal(junk.attestations.dualPlanApproved, undefined);
  });
});
