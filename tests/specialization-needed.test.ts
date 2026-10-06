// Which courses in progress the specialization row NEEDS (policy review round
// 3, P3-cse-4a-1; DGS 2026-10-06: "Apply the suggested handling"). §4.4.2:
// "three category specialization courses from three distinct groups". The
// row's display matching places every course it can, up to all five groups,
// so a course opening a fourth group counted as needed — the lead said "the 2
// courses in progress would complete it", and a next-semester registration of
// that kind held the OCE gate back a semester (DECISIONS 2026-10-02: the lead
// counts only the courses needed; 2026-10-05: the gate reads only the courses
// the coursework needs). The scenarios phd-specialization-extra-group-* pin
// the finding's student; these pin the matching.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { audit } from '../src/engine/audit.ts';
import type { Student, Term } from '../src/engine/types.ts';
import { advisorSummary } from '../src/ui/advisor-summary.ts';
import { buildRules, loadScenario } from './helpers.ts';
import { ndCourse, phdStudent } from './helpers/student.ts';

const fall = (year: number): Term => ({ season: 'fall', year });
const spring = (year: number): Term => ({ season: 'spring', year });
const row = (s: Student, rules = buildRules()) => audit(s, rules, '2026-10-06').requirements.find((r) => r.id === 'phd.qualifier.categories')!;

describe('the specialization row needs only the courses that complete it (P3-cse-4a-1)', () => {
  it('a flexible passed course is re-placed: a course in its group is still needed', () => {
    // CSE 60876 may fill any group; with CSE 60641 (Systems) it first takes
    // Algorithms — CSE 60111 (Algorithms) in progress still opens a third
    // group, because the matching moves CSE 60876 elsewhere.
    const s = phdStudent({
      entryTerm: fall(2025),
      gpa: 3.6,
      courses: [ndCourse('CSE 60876', { term: fall(2025) }), ndCourse('CSE 60641', { term: spring(2026) }), ndCourse('CSE 60111', { term: fall(2026), grade: 'IP' })],
    });
    const r = row(s);
    assert.equal(r.status, 'in_progress');
    assert.deepEqual(r.completingCourses, ['CSE 60111']);
    assert.match(r.detail, /the course in progress would complete it/);
  });
  it('the earliest semester that completes it is the one counted', () => {
    const sc = loadScenario('phd-specialization-extra-group-next-semester');
    const r = row(sc.student, buildRules(sc.rules.patch));
    assert.deepEqual(r.completingCourses, ['CSE 60535'], 'this semester’s course, not next semester’s');
  });
  it('the advisor summary repeats the lead as the card says it', () => {
    const sc = loadScenario('phd-specialization-extra-group-same-term');
    const report = audit(sc.student, buildRules(sc.rules.patch), sc.today);
    const { text } = advisorSummary(report, { todayIso: sc.today, entryTerm: 'Fall 2025', priorStudy: 'None', gpa: 3.6 });
    assert.match(text, /1 of the 2 courses in progress would complete it/);
  });
});
