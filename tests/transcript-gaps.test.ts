// The leave question after a Notre Dame transcript import (policy review round
// 3, P3-dh-3.1-3.13-2; DGS 2026-10-06: "Apply the handling with option (b)").
// An empty fall or spring counted as a gap only between two registered
// semesters, so a student on leave THIS semester was never asked, and saw the
// eighth-semester deadlines a semester early. The gap now runs through the
// current semester, the range the full-time list already uses; and a medical
// leave approved for a coming semester — which no transcript shows — can
// always be entered (app.ts: the count is always in the selector).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { CourseEntry, Student, Term } from '../src/engine/types.ts';
import { transcriptGapSemesters } from '../src/ui/withdrawals.ts';
import { ndCourse, phdStudent } from './helpers/student.ts';

const t = (season: Term['season'], year: number): Term => ({ season, year });
const imported = (id: string, term: Term, grade: CourseEntry['grade'] = 'A'): CourseEntry => ({ ...ndCourse(id, { term, grade }), fromNdTranscript: true });
const THROUGH_SPRING_2026 = [t('fall', 2023), t('spring', 2024), t('fall', 2024), t('spring', 2025), t('fall', 2025), t('spring', 2026)].map((term, i) => imported(`CSE 6064${i}`, term));
const student = (courses: CourseEntry[]): Student => phdStudent({ entryTerm: t('fall', 2023), courses });

describe('empty semesters on the Notre Dame transcript (P3-dh-3.1-3.13-2)', () => {
  it('the finding’s case: registered through Spring 2026, nothing in Fall 2026, imported 2026-10-05 — Fall 2026 is named', () => {
    assert.deepEqual(transcriptGapSemesters(student(THROUGH_SPRING_2026), '2026-10-05'), [t('fall', 2026)]);
  });
  it('registered this semester: no gap', () => {
    assert.deepEqual(transcriptGapSemesters(student([...THROUGH_SPRING_2026, imported('CSE 60868', t('fall', 2026), 'IP')]), '2026-10-05'), []);
  });
  it('a semester between two registered ones is still named', () => {
    const s = student([...THROUGH_SPRING_2026.filter((c) => !(c.term.season === 'fall' && c.term.year === 2024)), imported('CSE 60868', t('fall', 2026), 'IP')]);
    assert.deepEqual(transcriptGapSemesters(s, '2026-10-05'), [t('fall', 2024)]);
  });
  it('the summer does not make the coming fall a gap', () => {
    assert.deepEqual(transcriptGapSemesters(student(THROUGH_SPRING_2026), '2026-07-01'), []);
  });
  it('a hand-entered record is not read this way', () => {
    assert.equal(transcriptGapSemesters(student(THROUGH_SPRING_2026.map(({ fromNdTranscript: _drop, ...c }) => c)), '2026-10-05'), undefined);
  });
});
