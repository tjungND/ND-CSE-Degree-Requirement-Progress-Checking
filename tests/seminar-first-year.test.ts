// §4.2: "Two credits of Research Seminar (CSE 63801 and CSE 63802) are
// required and expected to be taken during the first year of the program."
// DGS 2026-10-04 (P1-sheet-9): "Make this a requirement." — both seminars are
// due by the end of the program's second semester (counted from the Ph.D.'s
// own start: the transfer term for a student who came from the MSCSE).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { audit } from '../src/engine/audit.ts';
import type { CourseEntry, Grade, Student, Term } from '../src/engine/types.ts';
import { buildRules } from './helpers.ts';
import { ndCourse, phdStudent } from './helpers/student.ts';

const rules = buildRules();
const fall = (year: number): Term => ({ season: 'fall', year });
const spring = (year: number): Term => ({ season: 'spring', year });
const seminar = (id: 'CSE 63801' | 'CSE 63802', term: Term, grade: Grade = 'A'): CourseEntry => ndCourse(id, { term, credits: 1, grade });
const row = (s: Student, today: string) => audit(s, rules, today).requirements.find((r) => r.id === 'phd.seminar')!;

describe('the research seminars are due in the first year (DGS 2026-10-04, P1-sheet-9)', () => {
  it('both passed in the first year: Met, done', () => {
    const r = row(phdStudent({ courses: [seminar('CSE 63801', fall(2026)), seminar('CSE 63802', spring(2027))] }), '2027-09-01');
    assert.equal(r.status, 'met');
    assert.equal(r.deadline?.state, 'done');
    assert.equal(r.deadline?.label, 'Done Spring 2027');
  });

  it('one passed after the first year: the DGS confirms', () => {
    const r = row(phdStudent({ courses: [seminar('CSE 63801', fall(2026)), seminar('CSE 63802', spring(2028))] }), '2028-06-01');
    assert.equal(r.status, 'needs_dgs_review');
    assert.equal(r.deadline?.label, 'Done Spring 2028 — after the end of Spring 2027 — the first year');
    assert.match(r.detail, /Taken after the end of Spring 2027 — the first year \(approximate\) — §4\.2 requires both seminars in the first year of the program; confirm with the DGS/);
  });

  it('one missing after the first year: Overdue', () => {
    const r = row(phdStudent({ courses: [seminar('CSE 63801', fall(2026))] }), '2027-09-01');
    assert.equal(r.status, 'unmet');
    assert.equal(r.deadline?.state, 'overdue');
    assert.equal(r.deadline?.label, 'Overdue — was due by the end of Spring 2027 — the first year (approximate)');
    assert.match(r.detail, /CSE 63802: not yet/);
  });

  it('in the first year: the deadline chip is open, with the one-semester alert', () => {
    const r = row(phdStudent({ courses: [seminar('CSE 63801', fall(2026)), seminar('CSE 63802', spring(2027), 'IP')] }), '2027-02-01');
    assert.equal(r.status, 'in_progress');
    assert.equal(r.deadline?.state, 'due_soon');
    assert.equal(r.deadline?.horizon, 'this');
    assert.equal(r.deadline?.label, 'Due by the end of Spring 2027 — the first year (approximate)');
  });

  it('a transfer from the MSCSE counts the first year from the transfer', () => {
    const s = phdStudent({
      background: { bachelors: 'elsewhere', graduate: 'nd-mscse-transfer', transferredTerm: spring(2027) },
      courses: [seminar('CSE 63801', fall(2027)), seminar('CSE 63802', spring(2028))],
    });
    const r = row(s, '2028-06-01');
    assert.equal(r.status, 'needs_dgs_review', 'due by the end of Fall 2027, the second semester from Spring 2027');
    assert.match(r.detail, /The first year is counted from your transfer into the Ph\.D\. in Spring 2027/);
  });
});
