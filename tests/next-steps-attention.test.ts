// The report's Next steps list (policy review round 3, P3-chg-phd-2; DGS
// 2026-10-06: "Apply the suggested handling"). Since the OCE and admission
// cards were merged (2026-10-04) the OCE's own row is unscored, and the list
// dropped it — an overdue OCE, a probation and funding trigger (Academic Code
// §6.2.8), was on nobody's list, while "Final dissertation submitted — Not
// started" was on every Ph.D. student's, first semester included. Now an OCE
// overdue or due this or next semester is listed (admission still waits for a
// dated OCE), and a final submission is no step before its defense is dated.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { audit } from '../src/engine/audit.ts';
import type { Milestones, Student, Term } from '../src/engine/types.ts';
import { attentionRows } from '../src/ui/report.ts';
import { buildRules } from './helpers.ts';
import { ndCourse, phdStudent } from './helpers/student.ts';

const rules = buildRules();
const fall = (year: number): Term => ({ season: 'fall', year });
const spring = (year: number): Term => ({ season: 'spring', year });
const REGULAR = ['CSE 60641', 'CSE 60111', 'CSE 60321', 'CSE 60427', 'CSE 60535', 'CSE 60762', 'CSE 60770', 'CSE 60876'];

/** Coursework over the first four semesters, those four ticked full-time, a TTT advisor and the RCR training — no OCE date. */
function ready(entry: number, milestones: Milestones = {}): Student {
  const terms = [fall(entry), spring(entry + 1), fall(entry + 1), spring(entry + 2)];
  return phdStudent({
    entryTerm: fall(entry),
    bachelorsAwarded: spring(entry),
    gpa: 3.6,
    courses: REGULAR.map((id, i) => ndCourse(id, { term: terms[Math.floor(i / 2)]! })),
    fullTimeTermOverrides: terms,
    milestones: { advisorIdentified: `${entry}-10-01`, advisorName: 'Prof. Example', advisorTtt: 'yes', rcrTrainingCompleted: `${entry + 1}-09-15`, ...milestones },
  });
}
const listed = (s: Student, today: string): string[] => attentionRows(audit(s, rules, today)).map((r) => r.id);

describe('Next steps: the OCE when it is due, the submission only after the defense', () => {
  it('an overdue OCE is listed (Fall 2022 entrant, 2026-10-05); admission and the submission are not', () => {
    const rows = attentionRows(audit(ready(2022), rules, '2026-10-05'));
    const ids = rows.map((r) => r.id);
    assert.ok(ids.includes('phd.candidacy'), JSON.stringify(ids));
    const at = ids.indexOf('phd.candidacy');
    assert.ok(rows.slice(0, at).every((r) => r.deadline?.state === 'overdue' || r.status === 'cannot_evaluate'), 'only another overdue row or a missing input comes before it');
    assert.ok(!ids.includes('phd.candidacyAdmission'), 'admission waits for a dated OCE (2026-10-04)');
    assert.ok(!ids.includes('phd.dissertation.submitted'));
    const oce = audit(ready(2022), rules, '2026-10-05').requirements.find((r) => r.id === 'phd.candidacy')!;
    assert.equal(oce.deadline?.state, 'overdue');
  });
  it('an OCE due next semester is listed too (Fall 2023 entrant, seventh semester)', () => {
    const report = audit(ready(2023), rules, '2026-10-05');
    assert.equal(report.requirements.find((r) => r.id === 'phd.candidacy')!.deadline?.state, 'due_soon');
    assert.ok(attentionRows(report).some((r) => r.id === 'phd.candidacy'));
  });
  it('an OCE years away is not a step; nor is the submission for a first-semester student', () => {
    const first = phdStudent({ entryTerm: fall(2026), gpa: 3.6, courses: [ndCourse('CSE 60641', { term: fall(2026), grade: 'IP' })] });
    const ids = listed(first, '2026-10-05');
    assert.ok(!ids.includes('phd.candidacy'));
    assert.ok(!ids.includes('phd.dissertation.submitted'), JSON.stringify(ids));
  });
  it('once the OCE is dated, it leaves the list and admission can join it', () => {
    const ids = listed(ready(2022, { candidacyPassed: '2026-09-20' }), '2026-10-05');
    assert.ok(!ids.includes('phd.candidacy'));
    assert.ok(!ids.includes('phd.dissertation.submitted'), 'still no defense');
  });
  it('the MSCSE thesis: no submission step before the thesis defense', () => {
    const thesis: Student = phdStudent({
      program: 'mscse',
      msOption: 'thesis',
      entryTerm: fall(2025),
      bachelorsAwarded: spring(2025),
      gpa: 3.6,
      courses: [ndCourse('CSE 60641', { term: fall(2025) })],
      milestones: { advisorIdentified: '2025-10-01', advisorName: 'Prof. Example' },
    });
    const report = audit(thesis, rules, '2026-10-05');
    assert.equal(report.requirements.find((r) => r.id === 'ms.thesis.submitted')?.status, 'unmet');
    assert.ok(!attentionRows(report).some((r) => r.id === 'ms.thesis.submitted'));
  });
});
