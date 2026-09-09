// Which semesters the course-rules page's two schedule cards stand for, and
// whether the sheet's offered_now / offered_next columns may still be shown
// under them (DGS 2026-09-09).
//
// The concern this answers, in the DGS's words: if a DGS fails to update the
// columns on time, "students will see past records, but the titles of the card
// will be updated according to the page loading time" — a page that names this
// semester over last semester's courses. So the sheet says which semester it
// wrote the schedule for, and anything the page cannot line up with today is
// not shown at all.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Term } from '../src/engine/types.ts';
import { afterTeachingTerm, scheduleView, teachingTermOf } from '../src/ui/schedule-terms.ts';

const fall = (year: number): Term => ({ season: 'fall', year });
const spring = (year: number): Term => ({ season: 'spring', year });
const summer = (year: number): Term => ({ season: 'summer', year });

describe('the teaching terms a schedule is kept for', () => {
  it('fall is followed by the next spring, spring by the same year’s fall', () => {
    assert.deepEqual(afterTeachingTerm(fall(2026)), spring(2027));
    assert.deepEqual(afterTeachingTerm(spring(2027)), fall(2027));
  });

  it('during the summer, "this semester" is the fall that is coming', () => {
    assert.deepEqual(teachingTermOf(summer(2027)), fall(2027));
    assert.deepEqual(teachingTermOf(fall(2026)), fall(2026));
    assert.deepEqual(teachingTermOf(spring(2027)), spring(2027));
  });
});

describe('what the two schedule cards may show', () => {
  it('the sheet names this semester: both columns are read as written', () => {
    const v = scheduleView(fall(2026), fall(2026));
    assert.equal(v.age, 'current');
    assert.deepEqual(v.thisTerm, fall(2026));
    assert.deepEqual(v.nextTerm, spring(2027));
    assert.deepEqual(v.source, { this: 'offeredNow', next: 'offeredNext' });
  });

  it('the sheet is ONE semester behind: what it called next is now this, and nothing is known about the one after', () => {
    // The exact case the DGS asked for: the semester turned over before the
    // columns were updated.
    const v = scheduleView(spring(2027), fall(2026));
    assert.equal(v.age, 'one-behind');
    assert.deepEqual(v.thisTerm, spring(2027));
    assert.deepEqual(v.nextTerm, fall(2027));
    assert.equal(v.source.this, 'offeredNext', 'last semester’s "next" is this semester');
    assert.equal(v.source.next, undefined, 'and the one after it is not released');
  });

  it('two semesters behind is too old to shift: nothing is shown', () => {
    const v = scheduleView(fall(2027), fall(2026));
    assert.equal(v.age, 'unusable');
    assert.deepEqual(v.source, {});
  });

  it('a sheet that says nothing shows nothing — the page never guesses the semester', () => {
    const v = scheduleView(fall(2026), undefined);
    assert.equal(v.age, 'unusable');
    assert.deepEqual(v.source, {});
    // The cards still know their own names, so they can say "not released yet"
    // under the right heading.
    assert.deepEqual(v.thisTerm, fall(2026));
    assert.deepEqual(v.nextTerm, spring(2027));
  });

  it('a sheet filled in ahead of time is not shown under the wrong semester either', () => {
    const v = scheduleView(fall(2026), spring(2027));
    assert.equal(v.age, 'unusable');
  });

  it('the summer of a stale year behaves like the fall it leads into', () => {
    // Today is summer 2027, the sheet was written for spring 2027: its "next"
    // is fall 2027, which is what "this semester" means in the summer.
    const v = scheduleView(summer(2027), spring(2027));
    assert.equal(v.age, 'one-behind');
    assert.deepEqual(v.thisTerm, fall(2027));
    assert.deepEqual(v.nextTerm, spring(2028));
    assert.equal(v.source.this, 'offeredNext');
  });

  it('a summer code cannot date a schedule: it is refused, not read as one behind', () => {
    // Schedules are kept for fall and spring. Without this guard "SU26" read
    // as one semester before the coming fall and SHIFTED the columns on the
    // strength of it, so the fall list in offered_now was never shown at all
    // (found reviewing this feature, 2026-09-09).
    for (const today of [summer(2026), fall(2026), spring(2027)]) {
      const v = scheduleView(today, summer(2026));
      assert.equal(v.age, 'unusable', JSON.stringify(today));
      assert.equal(v.reason, 'summer');
      assert.deepEqual(v.source, {});
    }
  });

  it('says WHICH of the four reasons it is, and what the sheet said', () => {
    // The page quotes the recorded semester back, so a DGS is not sent hunting
    // for a row that is present and looks right.
    assert.equal(scheduleView(fall(2026), undefined).reason, 'missing');
    assert.equal(scheduleView(fall(2026), fall(2025)).reason, 'stale');
    assert.equal(scheduleView(fall(2026), spring(2027)).reason, 'ahead');
    assert.equal(scheduleView(fall(2026), summer(2026)).reason, 'summer');
    assert.deepEqual(scheduleView(fall(2026), fall(2025)).recordedFor, fall(2025));
    assert.equal(scheduleView(fall(2026), undefined).recordedFor, undefined);
    assert.equal(scheduleView(fall(2026), fall(2026)).reason, undefined, 'a usable sheet has no reason to give');
  });

  it('summer with an up-to-date sheet reads the fall from offered_now', () => {
    const v = scheduleView(summer(2027), fall(2027));
    assert.equal(v.age, 'current');
    assert.deepEqual(v.thisTerm, fall(2027));
  });
});
