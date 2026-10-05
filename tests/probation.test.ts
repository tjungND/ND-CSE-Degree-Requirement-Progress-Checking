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

  it('changes no other requirement row', () => {
    const plain = audit(phdStudent(), rules, '2026-10-04').requirements.map((q) => `${q.id}:${q.status}:${q.deadline?.label ?? ''}`);
    const onProbation = audit(phdStudent({ probationLetterDeadline: '2026-12-15' }), rules, '2026-10-04')
      .requirements.filter((q) => q.id !== 'shared.goodStanding')
      .map((q) => `${q.id}:${q.status}:${q.deadline?.label ?? ''}`);
    assert.deepEqual(onProbation, plain);
  });

  // Academic Code §5.7.1 (policy review 2026-10-04, P2-ac-5b-6.1-2): "Students
  // must be in good standing to receive a graduate degree" — a scored row while
  // the letter is on the record, so an otherwise complete record does not read
  // as all satisfied.
  it('adds a good-standing row, In progress, with the letter’s deadline', () => {
    const row = (today: string) => audit(phdStudent({ probationLetterDeadline: '2026-12-15' }), rules, today).requirements.find((q) => q.id === 'shared.goodStanding')!;
    assert.equal(row('2026-10-04').status, 'in_progress');
    assert.match(row('2026-10-04').detail, /^On probation — the letter’s deadline is 2026-12-15\. A degree is conferred only to a student in good standing \(Academic Code §5\.7\.1\)/);
    assert.equal(row('2027-01-10').deadline!.state, 'overdue');
    assert.ok(!audit(phdStudent(), rules, '2026-10-04').requirements.some((q) => q.id === 'shared.goodStanding'));
  });

  it('a saved record keeps a well-formed date and drops anything else', () => {
    const base = { ...phdStudent() } as Record<string, unknown>;
    assert.equal(validateStudent({ ...base, probationLetterDeadline: '2026-12-15' }).probationLetterDeadline, '2026-12-15');
    assert.equal(validateStudent({ ...base, probationLetterDeadline: 'next spring' }).probationLetterDeadline, undefined);
  });
});
