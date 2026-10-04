// Retired parameter keys (src/data/types.ts RETIRED_PARAMETER_KEYS): rows the
// sheet once carried and the app no longer reads. On 2026-10-04 the DGS had
// all five deleted from the live Parameters tab ("remove any rows that are not
// needed any more"): the two Graduate School credit factors that moved into
// the code, and the three rows that had been PARKED — kept, read by nothing.
// A sheet without them loads with no issue; a sheet that carries one again is
// told why the row does nothing. (The factors' own behaviour is tested in
// tests/external-rules.test.ts.)
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DISPLAY_PARAMETER_KEYS, KNOWN_PARAMETER_KEYS, RETIRED_PARAMETER_KEYS } from '../src/data/types.ts';
import { audit } from '../src/engine/audit.ts';
import { buildRules } from './helpers.ts';
import { phdStudent } from './helpers/student.ts';

const REMOVED = ['quarter_credit_factor', 'trimester_credit_factor', 'ms_thesis_readers_min', 'candidacy_committee_additional_members_min', 'phd_senior_grad_credits_max'];

describe('the Parameters rows removed on 2026-10-04', () => {
  it('none is required or displayed; each is a retired key with its reason', () => {
    for (const key of REMOVED) {
      assert.equal((KNOWN_PARAMETER_KEYS as readonly string[]).includes(key), false, key);
      assert.equal((DISPLAY_PARAMETER_KEYS as readonly string[]).includes(key), false, key);
      assert.ok(RETIRED_PARAMETER_KEYS[key], key);
    }
  });

  it('the sheet without them loads with no issue about any of them', () => {
    const rules = buildRules();
    for (const key of REMOVED) {
      assert.equal(rules.parameters.raw.has(key), false, `${key} is not in the fixture sheet`);
      assert.deepEqual(rules.issues.filter((i) => i.message.includes(key)), [], key);
    }
  });

  it('a sheet that carries one again is told it is no longer read — and nothing about the audit changes', () => {
    const readers = buildRules({ parameters: { ms_thesis_readers_min: '2' } });
    const warning = readers.issues.find((i) => i.message.includes('ms_thesis_readers_min'));
    assert.equal(warning?.severity, 'warning');
    assert.match(warning!.message, /'ms_thesis_readers_min' is no longer read — no reader count is checked; the thesis row checks the defense \(DGS 2026-10-04\)\. Changing the row changes nothing; delete it\./);
    assert.match(buildRules({ parameters: { candidacy_committee_additional_members_min: '3' } }).issues.find((i) => i.message.includes('candidacy_committee'))!.message, /the candidacy committee is not counted/);
    assert.match(buildRules({ parameters: { phd_senior_grad_credits_max: '6' } }).issues.find((i) => i.message.includes('phd_senior_grad_credits_max'))!.message, /no allowance to size/);
    // The same rows come out with and without the row.
    const student = phdStudent({ program: 'mscse', msOption: 'thesis', gpa: 3.6 });
    const statuses = (rr: ReturnType<typeof buildRules>) => audit(student, rr, '2027-01-15').requirements.map((q) => `${q.id}:${q.status}`);
    assert.deepEqual(statuses(readers), statuses(buildRules()));
    assert.equal(audit(student, buildRules(), '2027-01-15').requirements.some((q) => q.status === 'cannot_evaluate'), false);
  });
});
