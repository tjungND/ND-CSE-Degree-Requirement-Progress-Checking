// Which semesters the course-rules page's two schedule cards stand for, and
// whether a row's offered_now / offered_next may still be shown under them —
// dated per row by the Courses tab's `last_offered` (DGS 2026-09-14; the
// whole-sheet `current_semester` stamp of 2026-09-09 is retired).
//
// The concern this answers, in the DGS's words: if a DGS fails to update the
// columns on time, "students will see past records, but the titles of the card
// will be updated according to the page loading time".
//
// What `last_offered` MEANS was settled on 2026-09-18 (DGS: "the last time
// this course was offered"), and that decides the matrix below. A course
// running this semester was last offered this semester, so a row dated this
// semester is the DGS describing the schedule now and both columns are read as
// written. A row dated any other semester — earlier, or a term that has not
// happened — describes a different schedule, or none, and shows nothing: the
// one-semester-forward shift this file used to pin printed a green "Fall '26"
// tag on a spring-only course (review R-1).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Term } from '../src/engine/types.ts';
import { afterTeachingTerm, rowSchedule, scheduleTerms, teachingTermOf } from '../src/ui/schedule-terms.ts';

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
    assert.deepEqual(scheduleTerms(summer(2027)), { thisTerm: fall(2027), nextTerm: spring(2028) });
    assert.deepEqual(scheduleTerms(fall(2026)), { thisTerm: fall(2026), nextTerm: spring(2027) });
  });
});

describe('what one row may say about the two cards', () => {
  const row = (lastOffered: Term | undefined, offeredNow?: boolean, offeredNext?: boolean) => ({ ...(lastOffered ? { lastOffered } : {}), ...(offeredNow !== undefined ? { offeredNow } : {}), ...(offeredNext !== undefined ? { offeredNext } : {}) });
  it('updated for this semester: both columns as written', () => {
    assert.deepEqual(rowSchedule(fall(2026), row(fall(2026), true, false)), { freshness: 'current', this: true, next: false });
    assert.deepEqual(rowSchedule(fall(2026), row(fall(2026), true)), { freshness: 'current', this: true });
  });
  it('dated the semester before: nothing, because "next" names a semester nobody can identify', () => {
    // Written in Fall 2026, `offered_next` means Spring 2027 — but read in
    // Spring 2027 the same cell would be shifted onto Spring 2027 itself, and
    // a spring-only course marked this way surfaced as a FALL offering.
    assert.deepEqual(rowSchedule(spring(2027), row(fall(2026), true, true)), { freshness: 'stale' });
    assert.deepEqual(rowSchedule(spring(2027), row(fall(2026), true)), { freshness: 'stale' });
  });
  it('dated ahead of today: nothing, because a course cannot last have been offered in the future', () => {
    assert.deepEqual(rowSchedule(fall(2026), row(spring(2027), true, true)), { freshness: 'ahead' });
    assert.deepEqual(rowSchedule(fall(2026), row(fall(2027), true)), { freshness: 'ahead' });
  });
  it('two or more semesters old, or undated: nothing, whatever the columns say', () => {
    assert.deepEqual(rowSchedule(fall(2026), row(fall(2025), true, true)), { freshness: 'stale' });
    assert.deepEqual(rowSchedule(fall(2026), row(spring(2011), true)), { freshness: 'stale' });
    assert.deepEqual(rowSchedule(fall(2026), row(undefined, true)), { freshness: 'undated' });
  });
  it('a summer last_offered counts as the fall that follows it', () => {
    assert.deepEqual(rowSchedule(fall(2026), row(summer(2026), true)), { freshness: 'current', this: true });
    assert.deepEqual(rowSchedule(fall(2026), row(summer(2025), false, true)), { freshness: 'stale' });
  });
  it('during the summer the row is read against the coming fall', () => {
    assert.deepEqual(rowSchedule(summer(2026), row(fall(2026), true)), { freshness: 'current', this: true });
    assert.deepEqual(rowSchedule(summer(2026), row(spring(2026), false, true)), { freshness: 'stale' });
  });
  it('the live sheet keeps working: every offered row is dated this semester', () => {
    // The 42 rows the DGS marks as offered all carry last_offered "Fall 2026",
    // which is the `current` case — the rule change costs the live page nothing.
    assert.deepEqual(rowSchedule(fall(2026), row(fall(2026), true, false)), { freshness: 'current', this: true, next: false });
  });
});
