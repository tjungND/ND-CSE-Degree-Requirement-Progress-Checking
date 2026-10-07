// The MSCSE along the way's five years run on the MSCSE's own clock (policy
// review round 3, P3-dh-3.21-3.24-2): approved medical leave moves them, as it
// moves the MSCSE's five-year row (DGS 2026-10-03, Item 17); Appendix A's
// year is the doctorate's alone.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { audit } from '../src/engine/audit.ts';
import { allScenarios, buildRules } from './helpers.ts';

const base = allScenarios().find((s) => s.name === 'phd-ms-along-the-way-leave-moves-five-years')!;
const along = (over: Record<string, unknown>, today = base.today) =>
  audit({ ...base.student, ...over }, buildRules(), today).requirements.find((r) => r.id === 'phd.msAlongTheWay')!;

describe('the along-the-way five years and an approved leave (P3-dh-3.21-3.24-2)', () => {
  it('without the leave the same exam is past the five years, and held', () => {
    const r = along({ leaveSemesters: 0, leaveTerms: [] });
    assert.equal(r.status, 'needs_dgs_review');
    assert.match(r.detail, /The exam came more than 5 years after you entered, and the master’s five-year limit may apply to the award/);
  });
  it('past even the shifted five years: held, and the leave is said', () => {
    const r = along({ milestones: { ...base.student.milestones, candidacyPassed: '2026-10-01' } }, '2026-11-01');
    assert.equal(r.status, 'needs_dgs_review');
    assert.match(r.detail, /The exam came more than 5 years after you entered — extended by 2 semesters on approved medical leave, and the master’s five-year limit may apply/);
  });
});
