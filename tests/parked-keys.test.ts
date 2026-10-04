// Parked parameter keys (src/data/types.ts PARKED_PARAMETER_KEYS): the sheet
// may carry them, the app does not read them, and a missing row is not an
// error. `ms_thesis_readers_min` joined on 2026-10-04 (DGS, policy review
// P1-sheet-6: "Move this to the parked list") — no reader count is checked.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DISPLAY_PARAMETER_KEYS, KNOWN_PARAMETER_KEYS } from '../src/data/types.ts';
import { audit } from '../src/engine/audit.ts';
import { buildRules } from './helpers.ts';
import { phdStudent } from './helpers/student.ts';

describe('parked parameter keys', () => {
  it('ms_thesis_readers_min is parked, not required', () => {
    assert.equal((KNOWN_PARAMETER_KEYS as readonly string[]).includes('ms_thesis_readers_min'), false);
    assert.equal((DISPLAY_PARAMETER_KEYS as readonly string[]).includes('ms_thesis_readers_min'), true, 'listed, so a sheet that carries it is not told the key is unknown');
  });

  it('a sheet without the row loads with no issue about it, and no MSCSE row cannot be evaluated for it', () => {
    const rules = buildRules({ parameters: { ms_thesis_readers_min: null } });
    assert.deepEqual(rules.issues.filter((i) => /ms_thesis_readers_min/.test(i.message)), []);
    // The same rows come out with and without it (a blank GPA aside, nothing here is unevaluable).
    const student = phdStudent({ program: 'mscse', msOption: 'thesis', gpa: 3.6 });
    const statuses = (rr: typeof rules) => audit(student, rr, '2027-01-15').requirements.map((q) => `${q.id}:${q.status}`);
    assert.deepEqual(statuses(rules), statuses(buildRules()));
    assert.equal(audit(student, rules, '2027-01-15').requirements.some((q) => q.status === 'cannot_evaluate'), false);
  });

  it('a sheet that keeps the row is not warned about it either', () => {
    assert.deepEqual(buildRules().issues.filter((i) => /ms_thesis_readers_min/.test(i.message)), []);
  });
});

describe('candidacy_committee_additional_members_min is parked too (DGS 2026-10-04)', () => {
  it('not required, listed so a sheet that keeps it is not warned, and a sheet without it has no issue', () => {
    assert.equal((KNOWN_PARAMETER_KEYS as readonly string[]).includes('candidacy_committee_additional_members_min'), false);
    assert.equal((DISPLAY_PARAMETER_KEYS as readonly string[]).includes('candidacy_committee_additional_members_min'), true);
    assert.deepEqual(buildRules({ parameters: { candidacy_committee_additional_members_min: null } }).issues.filter((i) => /candidacy_committee/.test(i.message)), []);
    assert.deepEqual(buildRules().issues.filter((i) => /candidacy_committee/.test(i.message)), []);
  });
});
