// The earlier-degrees questions (DGS 2026-09-22): which transcript rows each answer needs.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { applyBackground, completeBackground, describeBackground, graduateOptions, priorSlotsFor } from '../src/ui/background.ts';
import { validateStudent } from '../src/ui/state.ts';
import { phdStudent } from './helpers/student.ts';

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
  it('a transfer from the MSCSE keeps its transfer term when given, and is complete without it (DGS 2026-09-28)', () => {
    assert.deepEqual(completeBackground({ bachelors: 'elsewhere', graduate: 'nd-mscse-transfer', transferredTerm: { season: 'spring', year: 2025 }, alsoElsewhere: false }, 'phd'), { bachelors: 'elsewhere', graduate: 'nd-mscse-transfer', transferredTerm: { season: 'spring', year: 2025 }, alsoElsewhere: false });
    assert.deepEqual(completeBackground({ bachelors: 'elsewhere', graduate: 'nd-mscse-transfer', alsoElsewhere: false }, 'phd'), { bachelors: 'elsewhere', graduate: 'nd-mscse-transfer', alsoElsewhere: false });
    assert.deepEqual(completeBackground({ bachelors: 'elsewhere', graduate: 'nd-mscse', transferredTerm: { season: 'spring', year: 2025 } }, 'phd'), { bachelors: 'elsewhere', graduate: 'nd-mscse' }, 'a term left over from another answer is dropped');
  });

  it('an answer is complete only when every question that applies is answered', () => {
    assert.equal(completeBackground({ bachelors: 'elsewhere' }, 'phd'), undefined);
    assert.equal(completeBackground({ bachelors: 'elsewhere', graduate: 'elsewhere', samePlace: true }, 'phd'), undefined, 'finished? still open');
    assert.deepEqual(completeBackground({ bachelors: 'elsewhere', graduate: 'elsewhere', samePlace: true, finished: false }, 'phd'), { bachelors: 'elsewhere', graduate: 'elsewhere', samePlace: true, finished: false });
    // A Notre Dame CSE bachelor's is asked about the 4+1 on BOTH tabs since 2026-10-03 (a Ph.D. student's undergraduate 60000-level courses count only through it).
    assert.equal(completeBackground({ bachelors: 'nd-cse', graduate: 'none', samePlace: true }, 'phd'), undefined, '4+1? still open');
    assert.deepEqual(completeBackground({ bachelors: 'nd-cse', ndIntegrated: false, graduate: 'none', samePlace: true }, 'phd'), { bachelors: 'nd-cse', ndIntegrated: false, graduate: 'none' });
    // An MSCSE student with a Notre Dame CSE bachelor's is asked about the 4+1; one cannot already hold the MSCSE.
    assert.equal(completeBackground({ bachelors: 'nd-cse', graduate: 'none' }, 'mscse'), undefined);
    assert.deepEqual(completeBackground({ bachelors: 'nd-cse', ndIntegrated: true, graduate: 'none' }, 'mscse'), { bachelors: 'nd-cse', ndIntegrated: true, graduate: 'none' });
    assert.equal(completeBackground({ bachelors: 'elsewhere', graduate: 'nd-mscse' }, 'mscse'), undefined);
  });
  it('a transfer from the MSCSE into the Ph.D. (DGS 2026-09-26) is a Ph.D.-only answer that settles no prior degree', () => {
    assert.ok(graduateOptions('phd').some(([v]) => v === 'nd-mscse-transfer'));
    assert.ok(!graduateOptions('mscse').some(([v]) => v === 'nd-mscse-transfer'));
    assert.equal(completeBackground({ bachelors: 'elsewhere', graduate: 'nd-mscse-transfer' }, 'mscse'), undefined);
    assert.deepEqual(completeBackground({ bachelors: 'nd-cse', ndIntegrated: true, graduate: 'nd-mscse-transfer', alsoElsewhere: false }, 'phd'), { bachelors: 'nd-cse', ndIntegrated: true, graduate: 'nd-mscse-transfer', alsoElsewhere: false });
    assert.deepEqual(priorSlotsFor({ bachelors: 'nd-cse', graduate: 'nd-mscse-transfer' }), []);
    const s = { ...phdStudent(), program: 'phd' as const };
    applyBackground(s, { bachelors: 'nd-cse', graduate: 'nd-mscse-transfer', alsoElsewhere: false });
    assert.equal(s.priorMs, 'none');
    assert.equal(s.ndMasters, undefined);
    assert.equal(s.integratedBsMs, false);
  });
  // Policy review round 3, P3-prior-programs-2 (DGS 2026-10-07: option (a)):
  // the transfer answer asks about a degree elsewhere too, and "Did you finish
  // it?" after a yes. It used to record no earlier program at all (a 6-credit
  // meter, every outside course held as "taken outside any degree program").
  it('a transfer from the MSCSE beside a degree elsewhere: asked, and it sets the §5.2 cap (P3-prior-programs-2)', () => {
    assert.equal(completeBackground({ bachelors: 'elsewhere', graduate: 'nd-mscse-transfer' }, 'phd'), undefined, 'the other-university question is still open');
    assert.equal(completeBackground({ bachelors: 'elsewhere', graduate: 'nd-mscse-transfer', alsoElsewhere: true }, 'phd'), undefined, 'finished? still open');
    const done = completeBackground({ bachelors: 'elsewhere', graduate: 'nd-mscse-transfer', transferredTerm: { season: 'fall', year: 2024 }, alsoElsewhere: true, finished: true }, 'phd');
    assert.deepEqual(done, { bachelors: 'elsewhere', graduate: 'nd-mscse-transfer', transferredTerm: { season: 'fall', year: 2024 }, alsoElsewhere: true, finished: true });
    assert.deepEqual(completeBackground({ bachelors: 'elsewhere', graduate: 'nd-mscse-transfer', alsoElsewhere: false, finished: true }, 'phd'), { bachelors: 'elsewhere', graduate: 'nd-mscse-transfer', alsoElsewhere: false }, 'a finished answer left over from a yes is dropped');
    assert.deepEqual(priorSlotsFor(done), ['bachelors', 'masters', 'phd']);
    assert.deepEqual(priorSlotsFor({ bachelors: 'nd-cse', graduate: 'nd-mscse-transfer', alsoElsewhere: true, finished: false }), ['masters', 'phd']);
    const s = { ...phdStudent(), program: 'phd' as const };
    applyBackground(s, done!);
    assert.equal(s.priorMs, 'completed');
    assert.equal(s.ndMasters, undefined, 'the MSCSE was not finished');
    applyBackground(s, { bachelors: 'elsewhere', graduate: 'nd-mscse-transfer', alsoElsewhere: true, finished: false });
    assert.equal(s.priorMs, 'unfinished');
    assert.match(describeBackground(done!), /Graduate degree before this program: finished, at another university; and transferred into the Ph\.D\. from the Notre Dame MSCSE in Fall 2024/);
    assert.match(describeBackground({ bachelors: 'elsewhere', graduate: 'nd-mscse-transfer', alsoElsewhere: false }), /Graduate degree before this program: none — transferred into the Ph\.D\. from the Notre Dame MSCSE/);
  });
  it('a saved file from before the question keeps its answer and reads as before', () => {
    const old = validateStudent({ ...phdStudent(), background: { bachelors: 'elsewhere', graduate: 'nd-mscse-transfer' } }, []);
    assert.deepEqual(old.background, { bachelors: 'elsewhere', graduate: 'nd-mscse-transfer' });
    const kept = validateStudent({ ...phdStudent(), background: { bachelors: 'elsewhere', graduate: 'nd-mscse-transfer', alsoElsewhere: true, finished: false } }, []);
    assert.deepEqual(kept.background, { bachelors: 'elsewhere', graduate: 'nd-mscse-transfer', alsoElsewhere: true, finished: false });
  });
  it('an answer settles the record’s prior-degree facts (the standing card’s controls, gone 2026-09-22)', () => {
    const base = phdStudent();
    const a = { ...base, program: 'phd' as const };
    applyBackground(a, { bachelors: 'elsewhere', graduate: 'elsewhere', samePlace: false, finished: true });
    assert.equal(a.priorMs, 'completed');
    assert.equal(a.ndMasters, undefined);
    assert.equal(a.integratedBsMs, false);
    const b = { ...base, program: 'phd' as const };
    applyBackground(b, { bachelors: 'nd-cse', graduate: 'nd-4plus1' });
    assert.deepEqual(b.ndMasters, {});
    assert.equal(b.integratedBsMs, true);
    assert.equal(b.priorMs, 'none');
    const c = { ...base, program: 'mscse' as const };
    applyBackground(c, { bachelors: 'nd-cse', ndIntegrated: true, graduate: 'none' });
    assert.equal(c.integratedBsMs, true);
    assert.equal(c.ndMasters, undefined);
  });
});
