// Two missing Parameters rows, said as they really behave (policy review
// round 3, P3-sheet-6 (a)(b); DGS 2026-10-07: "apply the suggested handling").
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { audit } from '../src/engine/audit.ts';
import type { CourseEntry } from '../src/engine/types.ts';
import { buildRules } from './helpers.ts';
import { phdStudent } from './helpers/student.ts';

describe('cse_subject_codes missing or blank (P3-sheet-6 (a))', () => {
  it('missing: the diagnostics say transferred courses are held, not that the limit is skipped', () => {
    const issue = buildRules({ parameters: { cse_subject_codes: null } }).issues.find((i) => i.message.includes("'cse_subject_codes'"))!;
    assert.match(issue.message, /every such course without one is held for the DGS instead of counting/);
    assert.doesNotMatch(issue.message, /not applied/);
  });
  it('blank: an error too, where there was none', () => {
    const issue = buildRules({ parameters: { cse_subject_codes: '' } }).issues.find((i) => i.message.includes("'cse_subject_codes' is blank"));
    assert.ok(issue);
    assert.equal(issue.severity, 'error');
  });
});

describe('ms_bs_double_count_credits_max missing (P3-sheet-6 (b))', () => {
  const ug = (courseId: string, season: 'fall' | 'spring', year: number): CourseEntry => ({ courseId, credits: 3, term: { season, year }, grade: 'A', origin: 'transfer', institution: 'University of Notre Dame', degreeLevel: 'bachelors', registeredLevel: 'graduate' });
  const s = phdStudent({
    program: 'mscse', msOption: 'project', entryTerm: { season: 'fall', year: 2026 }, bachelorsAwarded: { season: 'spring', year: 2026 },
    integratedBsMs: true, integratedAdmitted: { season: 'fall', year: 2025 }, gpa: 3.6, attestations: { dgsApproved4xxxx: true },
    courses: [ug('CSE 40113', 'fall', 2025), ug('CSE 40243', 'fall', 2025), ug('CSE 60641', 'spring', 2026)],
  });
  it('the MSCSE: the shareable courses wait and the allowance card cannot be evaluated — as the Ph.D. already does', () => {
    const r = audit(s, buildRules({ parameters: { ms_bs_double_count_credits_max: null } }), '2026-10-07');
    assert.equal(r.requirements.find((x) => x.id === 'ms.cap.sharedbs')?.status, 'cannot_evaluate');
    for (const id of ['CSE 40113', 'CSE 40243', 'CSE 60641']) {
      const line = r.courseLines.find((l) => l.courseId === id)!;
      assert.equal(line.mark, 'pending', id);
      assert.match(line.text, /the rules sheet does not say what the allowance for coursework shared with your bachelor’s degree is/, id);
    }
  });
  it('present: two 40000-level courses fill the six, as before', () => {
    const r = audit(s, buildRules(), '2026-10-07');
    assert.equal(r.requirements.find((x) => x.id === 'ms.cap.sharedbs')?.status, 'met');
  });
});
