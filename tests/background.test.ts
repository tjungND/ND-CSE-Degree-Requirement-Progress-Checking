// The earlier-degrees questions (DGS 2026-09-22): which transcript rows each answer needs.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { completeBackground, priorSlotsFor } from '../src/ui/background.ts';

describe('earlier degrees → previous-transcript rows (DGS 2026-09-22)', () => {
  it('a bachelor’s elsewhere and no graduate degree: the Undergraduate row', () => {
    assert.deepEqual(priorSlotsFor({ bachelors: 'elsewhere', graduate: 'none' }), ['bachelors']);
  });
  it('a bachelor’s and a graduate degree elsewhere, different universities: all three rows', () => {
    assert.deepEqual(priorSlotsFor({ bachelors: 'elsewhere', graduate: 'elsewhere', samePlace: false }), ['bachelors', 'masters', 'phd']);
  });
  it('a 4+1 elsewhere: every row too — it may come as one transcript or two; the fold opens to say which row takes which', () => {
    assert.deepEqual(priorSlotsFor({ bachelors: 'elsewhere', graduate: 'elsewhere', samePlace: true }), ['bachelors', 'masters', 'phd']);
  });
  it('a Notre Dame bachelor’s (CSE or another department) and no or a Notre Dame graduate degree: no previous row at all', () => {
    assert.deepEqual(priorSlotsFor({ bachelors: 'nd-cse', graduate: 'none' }), []);
    assert.deepEqual(priorSlotsFor({ bachelors: 'nd-other', graduate: 'nd-mscse' }), []);
    assert.deepEqual(priorSlotsFor({ bachelors: 'nd-cse', graduate: 'nd-other' }), []);
  });
  it('a Notre Dame bachelor’s and a graduate degree elsewhere: the Master’s and Ph.D. rows', () => {
    assert.deepEqual(priorSlotsFor({ bachelors: 'nd-cse', graduate: 'elsewhere', samePlace: false }), ['masters', 'phd']);
  });
  it('no answer yet: every row, as before the questions', () => {
    assert.deepEqual(priorSlotsFor(undefined), ['bachelors', 'masters', 'phd']);
  });
  it('an answer is complete only when every question that applies is answered', () => {
    assert.equal(completeBackground({ bachelors: 'elsewhere' }), undefined);
    assert.equal(completeBackground({ bachelors: 'elsewhere', graduate: 'elsewhere' }), undefined);
    assert.deepEqual(completeBackground({ bachelors: 'elsewhere', graduate: 'elsewhere', samePlace: true }), { bachelors: 'elsewhere', graduate: 'elsewhere', samePlace: true });
    assert.deepEqual(completeBackground({ bachelors: 'nd-cse', graduate: 'none', samePlace: true }), { bachelors: 'nd-cse', graduate: 'none' });
  });
});
