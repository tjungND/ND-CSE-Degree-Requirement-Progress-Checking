// When the transfer processing request may go (policy review round 3,
// P3-dh-3.14-3.20-4; DGS 2026-10-06: "Apply the handling. My answer to the
// question is (b)."). §5.2 / DGS Handbook §3.14: a request "is considered
// only after a student has completed one semester in a Notre Dame graduate
// degree program". The app kept the summer in the spring semester, so a
// spring entrant was told in June to wait; and (b) a finished earlier Notre
// Dame graduate program already meets the condition.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { firstSemesterComplete } from '../src/engine/allocate.ts';
import { audit } from '../src/engine/audit.ts';
import type { Student, Term } from '../src/engine/types.ts';
import { buildRules } from './helpers.ts';
import { phdStudent, transferCourse } from './helpers/student.ts';

const t = (season: Term['season'], year: number): Term => ({ season, year });
const UMASS_YES = { university: 'University of Massachusetts Amherst', course_id: 'COMPSCI 589', course_title: 'Machine Learning', transferable_PhD: 'yes', transferable_MSCSE: 'yes', is_cse: 'yes' };
const rules = buildRules({ external: [UMASS_YES] });
const student = (entry: Term, extra: Partial<Student> = {}): Student =>
  phdStudent({
    entryTerm: entry,
    bachelorsAwarded: t('spring', 2022),
    priorMs: 'completed',
    gpa: 3.7,
    courses: [transferCourse('COMPSCI 589', 'Machine Learning', { term: t('fall', 2024), institution: 'University of Massachusetts Amherst', degreeLevel: 'masters' })],
    ...extra,
  });
const transferNote = (s: Student, today: string) => audit(s, rules, today).requirements.find((r) => r.id === 'phd.transfer')!.detail;

describe('the first semester (P3-dh-3.14-3.20-4)', () => {
  it('a spring entrant in June: the first semester is done', () => {
    assert.deepEqual(firstSemesterComplete(student(t('spring', 2026)), t('spring', 2026), '2026-06-20'), { done: true, byEarlierProgram: false });
    assert.match(transferNote(student(t('spring', 2026)), '2026-06-20'), /the Graduate School considers it only after your first semester \(done\)/);
  });
  it('a spring entrant in April: not yet', () => {
    assert.equal(firstSemesterComplete(student(t('spring', 2026)), t('spring', 2026), '2026-04-20').done, false);
    assert.match(transferNote(student(t('spring', 2026)), '2026-04-20'), /once your first semester is complete/);
  });
  it('a fall entrant: done from January, as before', () => {
    assert.equal(firstSemesterComplete(student(t('fall', 2025)), t('fall', 2025), '2025-12-20').done, false);
    assert.equal(firstSemesterComplete(student(t('fall', 2025)), t('fall', 2025), '2026-01-05').done, true);
  });
  it('(b): a finished earlier Notre Dame graduate program meets it in the first semester', () => {
    // The outside course counts only with a program there (P3-prior-programs-6 (a), 2026-10-07): the student says so (P3-prior-programs-1).
    const ms = student(t('fall', 2026), { ndMasters: { term: t('spring', 2026) }, priorMs: 'completed', background: { bachelors: 'elsewhere', graduate: 'nd-mscse', alsoElsewhere: true, finished: true } } as Partial<Student>);
    assert.deepEqual(firstSemesterComplete(ms, t('fall', 2026), '2026-10-06'), { done: true, byEarlierProgram: true });
    assert.match(transferNote(ms, '2026-10-06'), /only after your first semester \(met by your finished earlier Notre Dame graduate program\)/);
    const otherDept = student(t('fall', 2026), { background: { bachelors: 'elsewhere', graduate: 'nd-other', finished: true } } as Partial<Student>);
    assert.equal(firstSemesterComplete(otherDept, t('fall', 2026), '2026-10-06').done, true);
    const unfinished = student(t('fall', 2026), { background: { bachelors: 'elsewhere', graduate: 'nd-other', finished: false } } as Partial<Student>);
    assert.equal(firstSemesterComplete(unfinished, t('fall', 2026), '2026-10-06').done, false);
  });
});
