// Which preview rows get the one-line layout (DGS bug 2026-09-07): a row that
// still asks the student for a value must NOT be forced onto one line, or its
// full-size controls overflow the card and the "Taken as" dropdown is cut off.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Term } from '../src/engine/types.ts';
import { bachelorsPrefill, ocrReducedPagesNote, rowIsCompact } from '../src/transcript/preview-layout.ts';

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

describe('ocrReducedPagesNote (OCR step 12, W-CL373)', () => {
  it('says nothing when every page was read at the usual resolution', () => {
    assert.equal(ocrReducedPagesNote([]), '');
  });
  it('names one page and its resolution', () => {
    assert.equal(ocrReducedPagesNote([{ page: 2, dpi: 100 }]), 'Page 2 is much larger than a letter page and was read at a lower resolution than usual (about 100 dpi), so its rows may be rougher — check them with extra care.');
  });
  it('lists several pages in order, with the lowest resolution among them', () => {
    assert.equal(
      ocrReducedPagesNote([{ page: 3, dpi: 150 }, { page: 1, dpi: 100 }, { page: 2, dpi: 120 }]),
      'Pages 1, 2 and 3 are much larger than a letter page and were read at a lower resolution than usual (about 100 dpi), so their rows may be rougher — check them with extra care.',
    );
    assert.match(ocrReducedPagesNote([{ page: 1, dpi: 90 }, { page: 2, dpi: 90 }]), /^Pages 1 and 2 are /);
  });
});
