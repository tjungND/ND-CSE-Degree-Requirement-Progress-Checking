// Term labels (src/engine/term.ts): the full name for prose and the short form
// for table cells (DGS 2026-09-07).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseTermCode, parseTermLabel, termLabel, termShort } from '../src/engine/term.ts';

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

// The rules sheet takes the same code the pages print (DGS 2026-09-09: "I'm
// afraid people will make mistakes in filling the values" — four characters
// leave less room for one than "Fall 2026" does).
describe('parseTermCode — the sheet writes what the page shows', () => {
  it('reads the code the pages print, and is the inverse of termShort', () => {
    assert.deepEqual(parseTermCode('FA26'), { season: 'fall', year: 2026 });
    assert.deepEqual(parseTermCode('SP27'), { season: 'spring', year: 2027 });
    assert.deepEqual(parseTermCode('SU26'), { season: 'summer', year: 2026 });
    for (const t of [{ season: 'fall', year: 2026 }, { season: 'spring', year: 2027 }, { season: 'summer', year: 2030 }] as const) {
      assert.deepEqual(parseTermCode(termShort(t)), t, termShort(t));
    }
  });

  it('forgives the ways a person types it', () => {
    for (const typed of ['fa26', 'Fa26', 'FA 26', 'fa-26', '  FA26  ', 'FA2026']) {
      assert.deepEqual(parseTermCode(typed), { season: 'fall', year: 2026 }, typed);
    }
  });

  it('the long form still works, so a cell written the old way keeps its meaning', () => {
    assert.deepEqual(parseTermCode('Fall 2026'), { season: 'fall', year: 2026 });
    assert.deepEqual(parseTermCode('spring 2027'), { season: 'spring', year: 2027 });
  });

  it('anything else is undefined — the page never guesses a semester', () => {
    for (const bad of ['', 'FA', '26', 'FL26', 'FA261', 'Fal 26', 'Fall26', 'F26', 'next semester']) {
      assert.equal(parseTermCode(bad), undefined, JSON.stringify(bad));
    }
  });
});
