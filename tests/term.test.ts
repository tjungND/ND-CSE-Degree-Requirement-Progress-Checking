// Term labels (src/engine/term.ts): the full name for prose and the short form
// for table cells (DGS 2026-09-07).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseTermLabel, termLabel, termShort } from '../src/engine/term.ts';

describe('term labels', () => {
  it('termShort: season code + two-digit year (FA26 / SP25 / SU25); termLabel keeps the full name', () => {
    assert.equal(termShort({ season: 'fall', year: 2026 }), 'FA26');
    assert.equal(termShort({ season: 'spring', year: 2025 }), 'SP25');
    assert.equal(termShort({ season: 'summer', year: 2030 }), 'SU30');
    assert.equal(termShort({ season: 'spring', year: 2005 }), 'SP05', 'two digits, zero-padded');
    assert.equal(termLabel({ season: 'fall', year: 2026 }), 'Fall 2026');
    assert.deepEqual(parseTermLabel(termLabel({ season: 'summer', year: 2027 })), { season: 'summer', year: 2027 });
  });
});
