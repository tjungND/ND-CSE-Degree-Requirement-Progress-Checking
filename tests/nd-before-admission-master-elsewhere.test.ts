// Notre Dame graduate courses taken before admission by a student whose
// earlier graduate program was at another university (policy review round 3,
// P3-dh-3.14-3.20-3; DGS 2026-10-06: "apply the handling with (c). When this
// really happens, I will need to ask the graduate school how to handle
// this."). They were filed as §5.2 transfer credit "from your earlier Notre
// Dame program", which this student does not have, and metered against the
// 24 (or 6). DGS Handbook §3.14: "No more than 12 credit hours earned by a
// student while in non-degree status at Notre Dame may be counted toward a
// degree program." Option (c): no new question; the courses wait for the DGS
// with no §5.2 projection, and the review request names the twelve.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { audit } from '../src/engine/audit.ts';
import { coursesNeedingDgsReview } from '../src/engine/review.ts';
import type { CourseEntry, Student, Term } from '../src/engine/types.ts';
import { buildRules } from './helpers.ts';
import { phdStudent } from './helpers/student.ts';

const rules = buildRules();
const t = (season: Term['season'], year: number): Term => ({ season, year });
const ndBefore = (courseId: string, term: Term): CourseEntry => ({ courseId, credits: 3, term, grade: 'A', origin: 'transfer', institution: 'University of Notre Dame', degreeLevel: 'masters' });
const student = (): Student =>
  phdStudent({
    entryTerm: t('fall', 2024),
    bachelorsAwarded: t('spring', 2018),
    priorMs: 'completed',
    gpa: 3.7,
    background: { bachelors: 'elsewhere', graduate: 'elsewhere', finished: true },
    courses: [ndBefore('CSE 60641', t('fall', 2023)), ndBefore('CSE 60111', t('fall', 2023)), ndBefore('CSE 60321', t('spring', 2024)), ndBefore('CSE 60427', t('spring', 2024)), ndBefore('CSE 60535', t('spring', 2024))],
  } as Partial<Student>);

describe('Notre Dame courses before admission, the earlier program elsewhere (P3-dh-3.14-3.20-3, option (c))', () => {
  const report = audit(student(), rules, '2026-10-06');
  const find = (id: string) => report.requirements.find((r) => r.id === id)!;
  it('no §5.2 projection: the transfer card does not meter them', () => {
    assert.doesNotMatch(find('phd.transfer').detail, /15 more pending/);
  });
  it('they wait for the DGS, counted provisionally', () => {
    assert.match(find('phd.credits.regular').detail, /15 pending review\/approval/);
  });
  it('the wording never says “your earlier Notre Dame program”, and names the twelve', () => {
    const line = report.courseLines.find((l) => l.courseId === 'CSE 60641')!;
    assert.doesNotMatch(line.text, /a course from your earlier Notre Dame program/);
    assert.match(line.text, /^waiting for the DGS — would count toward regular courses \(3 cr\) once approved; taken at Notre Dame before you were admitted/);
    const approvals = find('shared.approvals').detail;
    assert.match(approvals, /taken at Notre Dame before you were admitted, while your earlier graduate program was at another university — not credit from an earlier Notre Dame program; if you took it as a non-degree student, at most 12 such credits may count \(Academic Code §2\.3\)/);
  });
  it('the review request asks the DGS, naming the twelve', () => {
    const asks = coursesNeedingDgsReview(student(), rules, '2026-10-06');
    assert.equal(asks.length, 5);
    assert.ok(asks.every((a) => a.ask.decide.some((d) => /at most 12 such credits may count \(Academic Code §2\.3\)/.test(d))), JSON.stringify(asks.map((a) => a.ask)));
  });
});
