// The "already counted toward" answers the page chooses for a Ph.D. student
// (DGS 2026-10-08): the answer that counts the most credits, checked against
// an exhaustive search; the student's own answers kept; the warning and the
// card facts that say the page chose them.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { audit } from '../src/engine/audit.ts';
import { bestCountedToward, countedTowardOptions, creditsCounted, type CountedToward } from '../src/engine/counted-toward.ts';
import type { CourseEntry, Student } from '../src/engine/types.ts';
import { buildRules } from './helpers.ts';
import { phdStudent } from './helpers/student.ts';

const rules = buildRules();
const TODAY = '2027-06-01';
const ug = (courseId: string, level: 'graduate' | 'undergraduate', countedToward?: CountedToward, inferred?: true): CourseEntry => ({
  courseId,
  credits: 3,
  term: { season: 'fall', year: 2024 },
  grade: 'A',
  origin: 'transfer',
  institution: 'University of Notre Dame',
  degreeLevel: 'bachelors',
  registeredLevel: level,
  ...(countedToward ? { countedToward } : {}),
  ...(inferred ? { countedTowardInferred: true as const } : {}),
});
const student = (courses: CourseEntry[], over: Partial<Student> = {}): Student =>
  phdStudent({
    integratedBsMs: true,
    integratedAdmitted: { season: 'spring', year: 2025 },
    bachelorsAwarded: { season: 'spring', year: 2025 },
    gpa: 3.8,
    courses,
    ...over,
  });
const held = { ndMasters: { term: { season: 'spring' as const, year: 2026 } }, priorMs: 'completed' as const };

describe('the answer that counts the most credits (DGS 2026-10-08)', () => {
  it('matches an exhaustive search over every assignment, with a Notre Dame master’s', () => {
    const s = student([ug('CSE 60641', 'graduate'), ug('CSE 60111', 'graduate'), ug('CSE 40113', 'undergraduate'), ug('CSE 40166', 'undergraduate')], held);
    const chosen = bestCountedToward(s, rules, TODAY);
    assert.equal(chosen.length, 4);
    const apply = (answers: CountedToward[]): Student => ({ ...s, courses: s.courses.map((c, i) => ({ ...c, countedToward: answers[i]! })) });
    const scoreOf = (answers: CountedToward[]) => creditsCounted(audit(apply(answers), rules, TODAY), s);
    const all = countedTowardOptions(true).map(([v]) => v);
    let best = -1;
    for (const a of all) for (const b of all) for (const c of all) for (const d of all) best = Math.max(best, scoreOf([a, b, c, d]));
    const ours = scoreOf(chosen.map((x) => x.answer));
    assert.ok(ours >= best - 1e-9, `the page's choice counts ${ours}, the exhaustive best ${best}`);
    assert.ok(ours >= 9 - 1e-9, 'three courses count now: two 60000-level in full and CSE 40113 inside the allowance (CSE 40166 waits for the DGS, as the course rules say)');
    // Ties go to the answer most likely true of a 4+1: 60000-level → the MSCSE, below it → "extra".
    assert.deepEqual(Object.fromEntries(chosen.map((x) => [x.courseId, x.answer])), { 'CSE 60641': 'mscse', 'CSE 60111': 'mscse', 'CSE 40113': 'neither', 'CSE 40166': 'neither' });
  });
  it('without a Notre Dame master’s, only the two answers that can be true are tried', () => {
    const s = student([ug('CSE 60641', 'graduate'), ug('CSE 40113', 'undergraduate')]);
    const chosen = bestCountedToward(s, rules, TODAY);
    assert.deepEqual(chosen.map((x) => x.answer), ['neither', 'neither']);
    const scoreOf = (answers: CountedToward[]) => creditsCounted(audit({ ...s, courses: s.courses.map((c, i) => ({ ...c, countedToward: answers[i]! })) }, rules, TODAY), s);
    let best = -1;
    for (const a of ['neither', 'bs'] as const) for (const b of ['neither', 'bs'] as const) best = Math.max(best, scoreOf([a, b]));
    assert.ok(scoreOf(['neither', 'neither']) >= best - 1e-9);
  });
  it('a student’s own answer is left alone; the page’s own earlier choice is re-read', () => {
    const s = student([ug('CSE 60641', 'graduate', 'bs'), ug('CSE 60111', 'graduate', 'bs', true), ug('CSE 40113', 'undergraduate')], held);
    const chosen = bestCountedToward(s, rules, TODAY);
    assert.deepEqual(chosen.map((x) => x.courseId), ['CSE 60111', 'CSE 40113'], 'the student’s own “bs” on CSE 60641 is not touched');
    assert.equal(chosen[0]!.answer, 'mscse');
  });
  it('nothing is open when the bachelor’s term is not set or the course cannot count', () => {
    assert.deepEqual(bestCountedToward(student([{ ...ug('CSE 60641', 'graduate'), degreeLevel: 'masters' }], { ...held, bachelorsAwarded: undefined }), rules, TODAY), [], 'not filed as bachelor’s coursework and no award term: not asked');
    assert.deepEqual(bestCountedToward(student([ug('MATH 10550', 'undergraduate')], held), rules, TODAY), []);
  });
});

describe('what the page says about an answer it chose', () => {
  const s = student([ug('CSE 60641', 'graduate', 'mscse', true), ug('CSE 40113', 'undergraduate', 'neither', true), ug('CSE 60111', 'graduate', 'neither')], held);
  const report = audit(s, rules, TODAY);
  it('a warning with the DGS’s three points, naming the courses', () => {
    const w = report.warnings.find((x) => x.startsWith('This page chose the “already counted toward” answer'));
    assert.ok(w, JSON.stringify(report.warnings));
    assert.match(w, /for CSE 40113 and CSE 60641 — which earlier degrees they counted toward — picking the answer that counts the most credits/);
    assert.match(w, /must match what the Dean’s office, the Graduate School and the Registrar have on file/);
    assert.match(w, /if you are unsure, contact the DGS/);
  });
  it('a fact on each card whose count rests on such an answer — and on no other', () => {
    const regular = report.requirements.find((r) => r.id === 'phd.credits.regular')!;
    const hint = (regular.detailParts ?? []).find((p) => typeof p === 'string' && /this page chose for you/.test(p)) as string | undefined;
    assert.ok(hint, JSON.stringify(regular.detailParts));
    assert.match(hint, /^CSE 40113 and CSE 60641 \(6 credits\) count here on answers this page chose for you — check them under Coursework\.$/);
    assert.ok(!regular.detail.includes('this page chose'), 'the card’s prose for the emails is unchanged');
    const fourk = report.requirements.find((r) => r.id === 'phd.cap.fourk')!;
    const capHint = (fourk.detailParts ?? []).find((p) => typeof p === 'string' && /this page chose/.test(p)) as string | undefined;
    assert.ok(capHint, JSON.stringify(fourk.detailParts));
    assert.match(capHint, /^CSE 40113 \(3 credits\) draws on this allowance on an answer this page chose for you/);
    const gpa = report.requirements.find((r) => r.id === 'shared.gpa')!;
    assert.ok(!(gpa.detailParts ?? []).some((p) => typeof p === 'string' && /this page chose/.test(p)));
  });
  it('no warning and no facts for a student’s own answers', () => {
    const own = audit(student([ug('CSE 60641', 'graduate', 'mscse')], held), rules, TODAY);
    assert.ok(!own.warnings.some((x) => x.startsWith('This page chose')));
    assert.ok(!own.requirements.some((r) => (r.detailParts ?? []).some((p) => typeof p === 'string' && /this page chose/.test(p))));
  });
});
