// A previous-undergraduate transcript is refused while the degree is in
// progress (DGS 2026-09-11) — but not when the transcript itself says the
// degree was conferred and a row merely has no readable grade (DGS
// 2026-09-16: a false rejection).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { undergraduateInProgress } from '../src/ui/external-upload.ts';

describe('is the undergraduate transcript still in progress?', () => {
  const rows = [{ grade: 'A' }, { grade: '' }, { grade: 'IP' }];
  it('ungraded rows mean in progress only while no conferral is stated', () => {
    assert.equal(undergraduateInProgress('bachelors', rows), true);
    assert.equal(undergraduateInProgress('bachelors', rows, true), false, 'the transcript says the degree was conferred');
    assert.equal(undergraduateInProgress('bachelors', [{ grade: 'A' }, { grade: 'B+' }]), false);
  });
  it('never applies to a master\'s or Ph.D. slot', () => {
    assert.equal(undergraduateInProgress('masters', rows), false);
    assert.equal(undergraduateInProgress('phd', rows), false);
  });
});
