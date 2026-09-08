// Which preview rows get the one-line layout (DGS bug 2026-09-07): a row that
// still asks the student for a value must NOT be forced onto one line, or its
// full-size controls overflow the card and the "Taken as" dropdown is cut off.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Term } from '../src/engine/types.ts';
import { bachelorsPrefill, rowIsCompact } from '../src/transcript/preview-layout.ts';

describe('preview row layout', () => {
  const read = { locked: true, credits: 3, grade: 'A', year: 2023 };

  it('one line only when the transcript gave every value', () => {
    assert.equal(rowIsCompact(read), true);
  });

  it('anything still to fill in keeps the labelled layout that can wrap', () => {
    assert.equal(rowIsCompact({ ...read, year: undefined }), false, 'the year the parser could not read');
    assert.equal(rowIsCompact({ ...read, grade: '' }), false, 'a grade that must be chosen');
    assert.equal(rowIsCompact({ ...read, credits: undefined }), false, 'credits the parser could not read');
  });

  it('OCR and hand-typed rows are never compact — every field is editable', () => {
    assert.equal(rowIsCompact({ ...read, locked: false }), false);
    assert.equal(rowIsCompact({ locked: false, grade: '' }), false);
  });

  it('zero credits is a value, not a gap', () => {
    assert.equal(rowIsCompact({ ...read, credits: 0 }), true);
  });
});

// The bachelor's award term a preview shows (DGS bug 2026-09-07): uploading a
// Master's transcript reset the year the student had entered after uploading
// their undergraduate one.
describe('which bachelor’s award term a preview shows', () => {
  const hand: Term = { season: 'spring', year: 2019 };
  const transcript: Term = { season: 'spring', year: 2024 };

  it('a term the student set by hand survives a later import', () => {
    assert.deepEqual(bachelorsPrefill(hand, transcript), { term: hand, source: 'student' });
  });

  it('with nothing set by hand, the transcript’s conferral date fills it in', () => {
    assert.deepEqual(bachelorsPrefill(undefined, transcript), { term: transcript, source: 'transcript' });
  });

  it('neither: the control stays empty and the student is asked', () => {
    assert.equal(bachelorsPrefill(undefined, undefined), undefined);
  });

  it('a hand-set term with no conferral line on the transcript is still kept', () => {
    assert.deepEqual(bachelorsPrefill(hand, undefined), { term: hand, source: 'student' });
  });
});
