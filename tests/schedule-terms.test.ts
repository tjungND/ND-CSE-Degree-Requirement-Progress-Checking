// Which semesters the course-rules page's two schedule cards stand for, and
// whether a row's offered_now / offered_next may still be shown under them —
// dated per row by the Courses tab's `last_offered` (DGS 2026-09-14; the
// whole-sheet `current_semester` stamp of 2026-09-09 is retired).
//
// The concern this answers, in the DGS's words: if a DGS fails to update the
// columns on time, "students will see past records, but the titles of the card
// will be updated according to the page loading time". A row updated for this
// semester is read as written; one updated last semester has its "next"
// column read as this semester; anything older, or undated, shows nothing.
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
  it('updated for the semester before: what it recorded as next is this semester, and nothing about the one after', () => {
    assert.deepEqual(rowSchedule(spring(2027), row(fall(2026), true, true)), { freshness: 'one-behind', this: true });
    assert.deepEqual(rowSchedule(spring(2027), row(fall(2026), true)), { freshness: 'one-behind' });
  });
  it('dated ahead (the registrar already lists next semester): read as written', () => {
    assert.deepEqual(rowSchedule(fall(2026), row(spring(2027), true, true)), { freshness: 'current', this: true, next: true });
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
    assert.deepEqual(rowSchedule(summer(2026), row(spring(2026), false, true)), { freshness: 'one-behind', this: true });
  });
});
