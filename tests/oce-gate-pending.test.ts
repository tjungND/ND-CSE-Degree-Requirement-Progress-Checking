// A core area waiting for the DGS keeps the OCE gate closed (DGS 2026-10-06,
// answering the question raised with P3-chg-phd-1: "Treat both as not done").
// The gate (oceReadiness, phd.ts) used to count a core area met only by a
// course the DGS has still to rule on as done, while regular credits awaiting
// a DGS decision were not; the 2026-10-05 rule reads "every core area and the
// specialization row is met or In progress". Now both wait for the decision,
// and the card names the decision, not a course to take.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { audit } from '../src/engine/audit.ts';
import type { Student } from '../src/engine/types.ts';
import { buildRules } from './helpers.ts';
import { ndCourse, phdStudent, transferCourse } from './helpers/student.ts';

const fall = (year: number) => ({ season: 'fall' as const, year });
const spring = (year: number) => ({ season: 'spring' as const, year });
const TODAY = '2026-10-06';
const PURDUE_ALGORITHMS = { university: 'Purdue University', course_id: 'CS 58000', course_title: 'Design and Analysis of Algorithms', transferable_PhD: 'yes', transferable_MSCSE: 'yes', credit_system: 'semester', is_cse: 'yes', satisfies_core_area: 'algorithms' };

/** Every OCE condition met at Notre Dame except the Algorithms core area, which only CS 58000 from Purdue can satisfy — not yet ruled on. */
const recordA = (): Student => {
  const ids = ['CSE 60641', 'CSE 60321', 'CSE 60876', 'CSE 60427', 'CSE 60535', 'CSE 60762', 'CSE 60770', 'CSE 60868'];
  const terms = [fall(2024), fall(2024), spring(2025), spring(2025), fall(2025), fall(2025), spring(2026), spring(2026)];
  return phdStudent({
    entryTerm: fall(2024),
    bachelorsAwarded: spring(2022),
    priorMs: 'completed',
    gpa: 3.7,
    courses: [...ids.map((id, i) => ndCourse(id, { term: terms[i]! })), transferCourse('CS 58000', 'Design and Analysis of Algorithms', { term: fall(2023), degreeLevel: 'masters' })],
    fullTimeTermOverrides: [fall(2024), spring(2025), fall(2025), spring(2026)],
    milestones: { advisorIdentified: '2024-10-01', advisorName: 'Prof. Example', advisorTtt: 'yes', rcrTrainingCompleted: '2025-09-15' },
  });
};
const card = (s: Student, rules = buildRules()) => audit(s, rules, TODAY).requirements.find((r) => r.id === 'phd.candidacyAdmission')!;

describe('the OCE gate waits for the DGS on a core area too (DGS 2026-10-06)', () => {
  it('a core area waiting for the DGS: Not started, naming the decision', () => {
    const c = card(recordA());
    assert.match(c.detail, /^Not started\./);
    assert.match(c.detail, /Regular-course credits: 24 of 24 complete/);
    assert.match(c.detail, /Core knowledge, Algorithms: waiting for the DGS \(CS 58000\)/);
    assert.match(c.detail, /still needed: the DGS’s decision on CS 58000\./);
    assert.match(c.detail, /A course waiting for the DGS’s decision counts once the DGS approves it/);
  });
  it('once the DGS confirms it in the course rules, the gate opens', () => {
    const c = card(recordA(), buildRules({ external: [PURDUE_ALGORITHMS] }));
    assert.equal(c.status, 'in_progress');
    assert.doesNotMatch(c.detail, /^Not started/);
  });
});

// The candidacy card names regular credits waiting for the DGS (policy review
// round 3, P3-chg-phd-1): it said "3 more needed" and "still needed: 3 more
// regular-course credits" while the Coursework card called the same credits
// "pending review/approval". The gate stays closed (2026-10-05); the card now
// names the decision first, and the shortfall is still counted without them.
describe('regular credits waiting for the DGS are named, not asked for again (P3-chg-phd-1)', () => {
  /** Record B: 21 graded regular credits, every other OCE condition met, and CSE 40567 (dgs_approval in the rules) not yet approved. */
  const recordB = (extra: ReturnType<typeof ndCourse>[] = []): Student => {
    const ids = ['CSE 60641', 'CSE 60321', 'CSE 60111', 'CSE 60427', 'CSE 60535', 'CSE 60762', 'CSE 60770'];
    const terms = [fall(2024), fall(2024), spring(2025), spring(2025), fall(2025), fall(2025), spring(2026)];
    return phdStudent({
      entryTerm: fall(2024),
      bachelorsAwarded: spring(2024),
      gpa: 3.7,
      courses: [...ids.map((id, i) => ndCourse(id, { term: terms[i]! })), ndCourse('CSE 40567', { term: spring(2026) }), ...extra],
      fullTimeTermOverrides: [fall(2024), spring(2025), fall(2025), spring(2026)],
      milestones: { advisorIdentified: '2024-10-01', advisorName: 'Prof. Example', advisorTtt: 'yes', rcrTrainingCompleted: '2025-09-15' },
    });
  };
  it('enough pending to close the gap: the decision first, then the courses it would spare', () => {
    const c = card(recordB());
    assert.match(c.detail, /^Not started\./);
    assert.match(c.detail, /Regular-course credits: 21 of 24 complete, 3 waiting for a DGS decision \(CSE 40567\) — 3 more needed unless the DGS approves them \(transferred regular-course credits count\)/);
    assert.match(c.detail, /still needed: the DGS’s decision on CSE 40567, or 3 more regular-course credits\./);
  });
  it('not enough pending: what is needed either way, and what the decision would spare', () => {
    const s = recordB();
    s.courses = s.courses.filter((c) => c.courseId !== 'CSE 60770');
    const c = card(s);
    assert.match(c.detail, /Regular-course credits: 18 of 24 complete, 3 waiting for a DGS decision \(CSE 40567\) — 6 more needed, 3 if the DGS approves them/);
    assert.match(c.detail, /still needed: 3 more regular-course credits, and the DGS’s decision on CSE 40567 or 3 more\./);
  });
  it('one course both pending as credit and for a core area: the decision is named once', () => {
    const s = recordA();
    s.courses = s.courses.filter((c) => c.courseId !== 'CSE 60868');
    const c = card(s);
    assert.match(c.detail, /3 waiting for a DGS decision \(CS 58000\)/);
    assert.match(c.detail, /Core knowledge, Algorithms: waiting for the DGS \(CS 58000\)/);
    assert.match(c.detail, /still needed: the DGS’s decision on CS 58000, or 3 more regular-course credits\./);
    assert.equal(c.detail.split('the DGS’s decision on CS 58000').length, 2, 'once');
  });
});
