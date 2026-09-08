// Printing credit counts once they can be fractional (DGS 2026-09-08).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatCredits } from '../src/engine/credits.ts';

describe('formatCredits', () => {
  it('whole numbers stay plain', () => {
    assert.equal(formatCredits(3), '3');
    assert.equal(formatCredits(0), '0');
    assert.equal(formatCredits(24), '24');
  });

  it('a converted quarter course reads as a number, not a float', () => {
    assert.equal(formatCredits(4 * (2 / 3)), '2.67');
    assert.equal(formatCredits(2 * (2 / 3)), '1.33');
    assert.equal(formatCredits(9 * (2 / 3)), '6', 'nine quarter hours are exactly six');
  });

  it('halves keep one decimal, not a trailing zero', () => {
    assert.equal(formatCredits(2.5), '2.5');
    assert.equal(formatCredits(1.5), '1.5');
  });
});
