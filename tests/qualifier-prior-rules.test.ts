// The prior-rules qualifier attestation (DGS 2026-09-21): third year or later.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { audit } from '../src/engine/audit.ts';
import { qualifierPriorRulesEligible } from '../src/engine/requirements/phd.ts';
import { buildRules } from './helpers.ts';
import { phdStudent } from './helpers/student.ts';

describe('qualifier passed under the earlier requirements (DGS 2026-09-21)', () => {
  it('is eligible from the fifth semester after entry', () => {
    assert.equal(qualifierPriorRulesEligible({ season: 'fall', year: 2024 }, '2026-09-21'), true); // Fall 2026 = semester 5
    assert.equal(qualifierPriorRulesEligible({ season: 'fall', year: 2024 }, '2026-04-01'), false); // Spring 2026 = semester 4
    assert.equal(qualifierPriorRulesEligible({ season: 'spring', year: 2025 }, '2027-02-01'), true); // Spring 2027 = semester 5
  });
  it('a ticked box on a second-year record is ignored and warned about', () => {
    const rules = buildRules();
    const report = audit(phdStudent({ entryTerm: { season: 'fall', year: 2025 }, attestations: { qualifierPassedUnderPriorRules: true } }), rules, '2026-09-21');
    assert.ok(report.warnings.some((w) => /not yet in your third year/.test(w)), report.warnings.join('\n'));
    assert.notEqual(report.requirements.find((r) => r.id === 'phd.qualifier')?.status, 'met');
  });
  it('a third-year record with the box ticked has the qualifier met and its components not applicable', () => {
    const rules = buildRules();
    const report = audit(phdStudent({ entryTerm: { season: 'fall', year: 2023 }, attestations: { qualifierPassedUnderPriorRules: true } }), rules, '2026-09-21');
    assert.equal(report.warnings.filter((w) => /third year/.test(w)).length, 0);
    assert.equal(report.requirements.find((r) => r.id === 'phd.qualifier')?.status, 'met');
    for (const r of report.requirements.filter((r) => r.id.startsWith('phd.qualifier.'))) assert.equal(r.status, 'not_applicable', r.id);
  });
});
