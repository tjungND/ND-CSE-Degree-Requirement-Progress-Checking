// The transcript's unregistered semesters against the leave count (policy
// review round 3, P3-ac-5a-5; DGS 2026-10-07: option (a) for both parts —
// "In the audit", and the selector stays open while the mismatch stands).
// Scenario phd-transcript-gaps-beyond-leave has the finding's student.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { audit } from '../src/engine/audit.ts';
import { uncoveredRegistrationGaps } from '../src/engine/registration-gaps.ts';
import type { CourseEntry, Student, Term } from '../src/engine/types.ts';
import { buildRules } from './helpers.ts';
import { phdStudent } from './helpers/student.ts';

const fall = (year: number): Term => ({ season: 'fall', year });
const spring = (year: number): Term => ({ season: 'spring', year });
const nd = (courseId: string, term: Term): CourseEntry => ({ courseId, credits: 3, term, grade: 'A', origin: 'nd', fromNdTranscript: true });
const TODAY = '2026-10-05';
/** Registered through Spring 2024 and again in Spring 2026: no registration in Fall 2024, Spring 2025 and Fall 2025. */
const record = (over: Partial<Student> = {}): Student =>
  phdStudent({ entryTerm: fall(2022), courses: [nd('CSE 60641', fall(2022)), nd('CSE 60111', spring(2023)), nd('CSE 60321', fall(2023)), nd('CSE 60876', spring(2024)), nd('CSE 60427', spring(2026))], ...over });
const gapWarning = (s: Student) => audit(s, buildRules(), TODAY).warnings.find((w) => /^Your Notre Dame transcript shows no registration in/.test(w));

describe('unregistered semesters the leave count does not cover (P3-ac-5a-5)', () => {
  it('two leave semesters for three gaps, no readmission: warned, and the review request asks', () => {
    const s = record({ leaveSemesters: 2 });
    assert.deepEqual(uncoveredRegistrationGaps(s, TODAY), [fall(2024), spring(2025), fall(2025)]);
    assert.ok(gapWarning(s));
    assert.ok((audit(s, buildRules(), TODAY).reviewFlags ?? []).some((f) => /^Semesters without registration: my Notre Dame transcript shows none in Fall 2024, Spring 2025 and Fall 2025, more than the 2 semesters of medical leave I entered/.test(f)));
  });
  it('the readmission term on file settles it: the readmission’s own warning takes over', () => {
    const s = record({ leaveSemesters: 2, readmittedTerm: spring(2026) });
    assert.equal(uncoveredRegistrationGaps(s, TODAY), undefined);
    assert.equal(gapWarning(s), undefined);
  });
  it('no leave count: the question is still unanswered, and the selector asks (2026-10-04) — no warning', () => {
    assert.equal(uncoveredRegistrationGaps(record(), TODAY), undefined);
  });
  it('a leave count that covers the gaps: nothing to say', () => {
    const s = record({ leaveSemesters: 3 });
    assert.equal(uncoveredRegistrationGaps(s, TODAY), undefined);
    assert.equal(gapWarning(s), undefined, 'the three-semester leave has its own warning');
  });
  it('the current semester is left out — its registration may not have posted yet', () => {
    // Registered through Spring 2026, nothing yet in Fall 2026 (today), one leave semester.
    const s = phdStudent({ entryTerm: fall(2024), leaveSemesters: 1, courses: [nd('CSE 60641', fall(2024)), nd('CSE 60111', spring(2025)), nd('CSE 60427', spring(2026))] });
    assert.equal(uncoveredRegistrationGaps(s, TODAY), undefined, 'Fall 2025 is covered; Fall 2026 is now');
  });
  it('a hand-entered record is not read this way', () => {
    const s = record({ leaveSemesters: 1, courses: record().courses.map(({ fromNdTranscript: _f, ...c }) => c) });
    assert.equal(uncoveredRegistrationGaps(s, TODAY), undefined);
  });
});
