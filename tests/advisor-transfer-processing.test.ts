// The advisor email names transfer credit still to be processed (policy review
// round 3, P3-emails-1; DGS 2026-10-06: "apply the suggested handling"). CSE
// §5.2: "A student should send the credit transfer request to the Grad Admin
// and the DGS will approve and make a recommendation to the Graduate School."
// With the courses ruled `yes` in the course rules, the email ended "Nothing
// is pending with the DGS or the Grad Admin" while its own transfer row and
// the processing request said the opposite. The email now reads the
// processing request's transfer list.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { audit } from '../src/engine/audit.ts';
import type { Student, Term } from '../src/engine/types.ts';
import { actionItems, advisorSummary } from '../src/ui/advisor-summary.ts';
import { processingItems } from '../src/ui/grad-admin-request.ts';
import { buildRules } from './helpers.ts';
import { phdStudent, transferCourse } from './helpers/student.ts';

const t = (season: Term['season'], year: number): Term => ({ season, year });
const UMASS = 'University of Massachusetts Amherst';
const yes = (course_id: string, course_title: string) => ({ university: UMASS, course_id, course_title, transferable_PhD: 'yes', transferable_MSCSE: 'yes', is_cse: 'yes' });
const rules = buildRules({ external: [yes('COMPSCI 589', 'Machine Learning'), yes('COMPSCI 682', 'Neural Networks')] });
const student = (recorded = false): Student =>
  phdStudent({
    entryTerm: t('fall', 2025),
    bachelorsAwarded: t('spring', 2022),
    priorMs: 'completed',
    gpa: 3.7,
    courses: [
      transferCourse('COMPSCI 589', 'Machine Learning', { term: t('fall', 2023), institution: UMASS, degreeLevel: 'masters' }),
      transferCourse('COMPSCI 682', 'Neural Networks', { term: t('spring', 2024), institution: UMASS, degreeLevel: 'masters' }),
    ],
    milestones: { advisorIdentified: '2025-10-01', advisorName: 'Prof. Example', advisorTtt: 'yes' },
    attestations: { advisorApprovedPlan: true, ...(recorded ? { transferRecorded: true } : {}) },
  });
const TODAY = '2026-03-01';
const transfersOf = (s: Student, report: ReturnType<typeof audit>) => ({ courses: processingItems(report, s, rules).transfers.map((x) => x.courseId), recorded: s.attestations.transferRecorded === true, firstSemesterDone: true });

describe('transfer credit the Grad Admin has still to process (P3-emails-1)', () => {
  it('the student and the Grad Admin each get the item; nothing is falsely "not pending"', () => {
    const s = student();
    const report = audit(s, rules, TODAY);
    const todo = actionItems(report, transfersOf(s, report));
    assert.ok(todo.student.includes('Send the Grad Admin the processing request for COMPSCI 589, COMPSCI 682 (§5.2) — before the semester my degree is conferred.'), JSON.stringify(todo.student));
    assert.ok(todo.gradAdmin.includes('Submit the Transfer of Credits request to the Graduate School for COMPSCI 589, COMPSCI 682 — recommended by the DGS (§5.2).'), JSON.stringify(todo.gradAdmin));
    const { text } = advisorSummary(report, { todayIso: TODAY, entryTerm: 'Fall 2025', priorStudy: 'Completed prior M.S. or Ph.D.', transfers: transfersOf(s, report) });
    assert.doesNotMatch(text, /Nothing is pending with the DGS or the Grad Admin/);
  });
  it('once the transfer is ticked as recorded, the items go', () => {
    const s = student(true);
    const report = audit(s, rules, TODAY);
    const todo = actionItems(report, transfersOf(s, report));
    assert.ok(!todo.gradAdmin.some((x) => /Transfer of Credits/.test(x)), JSON.stringify(todo.gradAdmin));
  });
});

// The course's own line after the tick (policy review round 3, P3-import-5):
// nothing is left to send once the Grad Admin recorded the transfer.
describe('a transferred course’s line once the transfer is recorded (P3-import-5)', () => {
  it('the Ph.D., a sheet yes: “recorded by the Grad Admin”, not “send the processing request”', () => {
    const line = (recorded: boolean) => audit(student(recorded), rules, TODAY).courseLines.find((l) => l.courseId === 'COMPSCI 589')!.text;
    assert.match(line(false), /send the Grad Admin the processing request/);
    assert.match(line(true), /approved by the DGS in the course rules — recorded by the Grad Admin, as you ticked under Approvals \(§5\.2\)/);
    assert.doesNotMatch(line(true), /processing request/);
  });
  it('the MSCSE, a case-by-case course the ADGS approved and the student ticked', () => {
    const r = buildRules({ external: [{ university: UMASS, course_id: 'COMPSCI 589', course_title: 'Machine Learning', transferable_PhD: 'yes', transferable_MSCSE: 'adgs_approval', is_cse: 'yes' }] });
    const s = phdStudent({
      program: 'mscse', msOption: 'project', entryTerm: t('fall', 2025), bachelorsAwarded: t('spring', 2022), priorMs: 'completed', gpa: 3.7,
      courses: [transferCourse('COMPSCI 589', 'Machine Learning', { term: t('fall', 2023), institution: UMASS, degreeLevel: 'masters', dgsApproved: true })],
      attestations: { transferRecorded: true },
    });
    const line = audit(s, r, TODAY).courseLines.find((l) => l.courseId === 'COMPSCI 589')!.text;
    assert.match(line, /approved by the ADGS for you, as you ticked on the course .* — recorded by the Grad Admin, as you ticked under Approvals \(§5\.2\)/);
  });
});
