// A withdrawal the Notre Dame transcript shows by its grades asks the
// readmission question (policy review round 3, P3-dh-3.1-3.13-1; DGS
// 2026-10-06: "Apply the suggested handling"). The question used to appear
// only for a fall or spring with no registration; a withdrawal after the
// course-discontinuance date leaves every course W (Academic Code §5.5), and
// leaving without the Separation form an F in every course, so the
// readmission field — and the DGS's review of the earlier credits (DGS
// Handbook §3.3; 2026-10-04) — was never reached.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { audit } from '../src/engine/audit.ts';
import { termLabel } from '../src/engine/term.ts';
import type { CourseEntry, Grade, Student, Term } from '../src/engine/types.ts';
import { withdrawalQuestion, withdrawalSemesters } from '../src/ui/withdrawals.ts';
import { buildRules } from './helpers.ts';
import { ndCourse } from './helpers/student.ts';

const t = (season: Term['season'], year: number): Term => ({ season, year });
const imported = (id: string, term: Term, grade: Grade = 'A'): CourseEntry => ({ ...ndCourse(id, { term, grade }), fromNdTranscript: true });
/** The finding's MSCSE student: Fall 2024 and Spring 2025 at 9 credits, every Fall 2025 course W, back in Spring 2026. */
const record = (fall2025: Grade, more: CourseEntry[] = [imported('CSE 60868', t('spring', 2026), 'IP')]): Student => ({
  schemaVersion: 1,
  program: 'mscse',
  entryTerm: t('fall', 2024),
  priorMs: 'none',
  milestones: {},
  attestations: {},
  courses: [
    imported('CSE 60641', t('fall', 2024)),
    imported('CSE 60111', t('fall', 2024)),
    imported('CSE 60321', t('fall', 2024)),
    imported('CSE 60427', t('spring', 2025)),
    imported('CSE 60535', t('spring', 2025)),
    imported('CSE 60762', t('spring', 2025)),
    imported('CSE 60770', t('fall', 2025), fall2025),
    imported('CSE 60876', t('fall', 2025), fall2025),
    imported('CSE 60011', t('fall', 2025), fall2025),
    ...more,
  ],
});

describe('an all-W or all-F semester with a return after it (P3-dh-3.1-3.13-1)', () => {
  it('every course withdrawn in Fall 2025, back in Spring 2026: asked', () => {
    const found = withdrawalSemesters(record('W'));
    assert.deepEqual(found, [{ term: t('fall', 2025), kind: 'W' }]);
    assert.equal(withdrawalQuestion(found!, termLabel), 'Your transcript shows every course withdrawn in Fall 2025 — did you withdraw from the University and return?');
  });
  it('an F in every course: asked, more softly', () => {
    const found = withdrawalSemesters(record('F'))!;
    assert.deepEqual(found, [{ term: t('fall', 2025), kind: 'F' }]);
    assert.match(withdrawalQuestion(found, termLabel), /an F in every course in Fall 2025 — if you left the University without the Separation form, did you return\?/);
  });
  it('not yet returned (the all-W semester is the latest): not asked', () => {
    assert.deepEqual(withdrawalSemesters(record('W', [])), []);
  });
  it('a semester with one course passed is not a withdrawal', () => {
    const s = record('W');
    s.courses = s.courses.map((c) => (c.courseId === 'CSE 60011' ? { ...c, grade: 'B' as Grade } : c));
    assert.deepEqual(withdrawalSemesters(s), []);
  });
  it('a hand-entered record is not read this way', () => {
    const s = record('W');
    s.courses = s.courses.map(({ fromNdTranscript: _drop, ...c }) => c);
    assert.equal(withdrawalSemesters(s), undefined);
  });
  it('the residency card points the all-W semester at the readmission question', () => {
    const r = audit(record('W'), buildRules(), '2026-03-01').requirements.find((x) => x.id === 'ms.residency')!;
    assert.match(r.detail, /Fall 2025: every course withdrawn — not counted/);
    assert.match(r.detail, /if you withdrew from the University and returned, enter your readmission under Your standing \(Academic Code §5\.5\); otherwise ask the ADGS/, 'the MSCSE’s decider is the ADGS');
  });
});
