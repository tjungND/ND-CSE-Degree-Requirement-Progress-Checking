// Marks on a card's conditions (DGS 2026-10-06: "In the progress result cards,
// it's hard to see what are met and what are not met. Can you make them
// visible more easily?"). The engine gives each condition of the candidacy
// card a mark — met, in progress, waiting for the DGS, not yet — which the page
// draws in the bullet's place with the course table's ✓ ◐ ● ✕. The words stay
// in the text, so the emails and the plain detail are unchanged.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { audit } from '../src/engine/audit.ts';
import type { ConditionMark, DetailPart, Milestones, Student, Term } from '../src/engine/types.ts';
import { buildRules } from './helpers.ts';
import { ndCourse, phdStudent } from './helpers/student.ts';

const rules = buildRules();
const fall = (year: number): Term => ({ season: 'fall', year });
const spring = (year: number): Term => ({ season: 'spring', year });
const REGULAR = ['CSE 60641', 'CSE 60111', 'CSE 60321', 'CSE 60427', 'CSE 60535', 'CSE 60762', 'CSE 60770', 'CSE 60876'];
const student = (courses: number, milestones: Milestones = {}): Student => {
  const terms = [fall(2024), spring(2025), fall(2025), spring(2026)];
  return phdStudent({
    entryTerm: fall(2024),
    bachelorsAwarded: spring(2024),
    gpa: 3.6,
    courses: REGULAR.slice(0, courses).map((id, i) => ndCourse(id, { term: terms[Math.floor(i / 2)]! })),
    fullTimeTermOverrides: terms,
    milestones: { advisorIdentified: '2024-10-01', advisorName: 'Prof. Example', advisorTtt: 'yes', ...milestones },
  });
};
const card = (s: Student) => audit(s, rules, '2026-10-06').requirements.find((r) => r.id === 'phd.candidacyAdmission')!;
const checks = (parts: DetailPart[] | undefined) =>
  (parts ?? []).filter((p): p is { check: string; mark: ConditionMark } => typeof p === 'object' && 'check' in p).map((p) => [p.check.replace(/:.*$/, ''), p.mark]);

describe('the candidacy card marks each condition (DGS 2026-10-06)', () => {
  it('In progress: met, and not yet, per condition; the registration line is information, not marked', () => {
    const c = card(student(8));
    assert.equal(c.status, 'in_progress');
    assert.deepEqual(checks(c.detailParts), [
      ['Oral Candidacy Exam (OCE)', 'not_yet'],
      ['4 consecutive full-time semesters', 'met'],
      ['Coursework', 'met'],
      ['Cumulative GPA of 3.0 or better', 'met'],
      ['Responsible Conduct of Research and ethics training', 'not_yet'],
      ['Tenured or tenure-track dissertation advisor', 'met'],
    ]);
    assert.ok((c.detailParts ?? []).some((p) => typeof p === 'string' && p.startsWith('Registered this semester')));
    assert.match(c.detail, /Oral Candidacy Exam \(OCE\): not yet\. 4 consecutive full-time semesters: done/, 'the words are unchanged');
  });
  it('Not started: the lead’s items carry parallel marks — in progress and not yet are told apart', () => {
    const s = student(6);
    s.courses.push(ndCourse('CSE 60770', { term: fall(2026), grade: 'IP' }));
    const c = card(s);
    assert.match(c.detail, /^Not started\./);
    const lead = (c.detailParts ?? []).find((p): p is { lead: string; items: string[]; marks?: ConditionMark[] } => typeof p === 'object' && 'lead' in p)!;
    assert.equal(lead.marks?.length, lead.items.length);
    const byLabel = Object.fromEntries(lead.items.map((t, i) => [t.replace(/:.*$/, ''), lead.marks![i]]));
    assert.equal(byLabel['Regular-course credits'], 'not_yet');
    assert.equal(byLabel['Core knowledge, Operating Systems'], 'met');
    assert.equal(byLabel['Tenured or tenure-track advisor'], 'met');
  });
  it('waiting for the DGS: an advisor answered “Not sure”', () => {
    const c = card(student(8, { advisorTtt: 'unsure' }));
    const lead = (c.detailParts ?? []).find((p): p is { lead: string; items: string[]; marks?: ConditionMark[] } => typeof p === 'object' && 'lead' in p)!;
    const i = lead.items.findIndex((t) => t.startsWith('Tenured or tenure-track advisor'));
    assert.equal(lead.marks![i], 'waiting');
  });
});
