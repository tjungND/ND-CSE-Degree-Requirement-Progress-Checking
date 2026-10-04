// On probation (Academic Code §5.7.2) — a rare case asked under Your standing
// behind a selector (DGS 2026-10-04, policy review P2-ac-5b-6.1-3). The
// letter's deadline is said at the top of the report; no row is recomputed.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { audit } from '../src/engine/audit.ts';
import { validateStudent } from '../src/ui/state.ts';
import { buildRules } from './helpers.ts';
import { phdStudent } from './helpers/student.ts';

const rules = buildRules();

describe('a probation letter’s deadline', () => {
  it('ahead: the letter governs, the page’s deadlines do not extend it', () => {
    const r = audit(phdStudent({ probationLetterDeadline: '2026-12-15' }), rules, '2026-10-04');
    assert.ok(
      r.warnings.includes('On probation: the deadline in your probation letter is 2026-12-15. The letter’s stipulations and that date govern — the deadlines on this page do not extend them, and missing them can lead to dismissal (Academic Code §5.7.2, §5.8).'),
      r.warnings.join('\n'),
    );
  });

  it('passed: confirm the standing with the DGS (the ADGS on the MSCSE tab)', () => {
    const phd = audit(phdStudent({ probationLetterDeadline: '2026-05-01' }), rules, '2026-10-04');
    assert.ok(phd.warnings.some((w) => /^On probation: the deadline in your probation letter, 2026-05-01, has passed\. Confirm your standing with the DGS/.test(w)), phd.warnings.join('\n'));
    const ms = audit(phdStudent({ program: 'mscse', probationLetterDeadline: '2026-05-01' }), rules, '2026-10-04');
    assert.ok(ms.warnings.some((w) => /Confirm your standing with the ADGS/.test(w)), ms.warnings.join('\n'));
  });

  it('changes no requirement row', () => {
    const plain = audit(phdStudent(), rules, '2026-10-04').requirements.map((q) => `${q.id}:${q.status}:${q.deadline?.label ?? ''}`);
    const onProbation = audit(phdStudent({ probationLetterDeadline: '2026-12-15' }), rules, '2026-10-04').requirements.map((q) => `${q.id}:${q.status}:${q.deadline?.label ?? ''}`);
    assert.deepEqual(onProbation, plain);
  });

  it('a saved record keeps a well-formed date and drops anything else', () => {
    const base = { ...phdStudent() } as Record<string, unknown>;
    assert.equal(validateStudent({ ...base, probationLetterDeadline: '2026-12-15' }).probationLetterDeadline, '2026-12-15');
    assert.equal(validateStudent({ ...base, probationLetterDeadline: 'next spring' }).probationLetterDeadline, undefined);
  });
});
