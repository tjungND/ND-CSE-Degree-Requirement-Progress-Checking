// §5.2's five-year window for a student who finished the Notre Dame MSCSE
// before the Ph.D. counts back from the MSCSE admission (policy review round 3,
// P3-prior-programs-4; DGS 2026-10-07: option (b)). The record dates that
// admission by its earliest MSCSE course; without one, a course outside the
// Ph.D.'s window is held for the DGS, never refused. Scenario
// phd-nd-mscse-and-masters-elsewhere-window has the MSCSE courses.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { audit } from '../src/engine/audit.ts';
import { coursesNeedingDgsReview } from '../src/engine/review.ts';
import type { CourseEntry, Student } from '../src/engine/types.ts';
import { buildRules } from './helpers.ts';
import { ndCourse, phdStudent } from './helpers/student.ts';

const fall = (year: number) => ({ season: 'fall' as const, year });
const spring = (year: number) => ({ season: 'spring' as const, year });
const ne = (courseId: string, term: Student['entryTerm']): CourseEntry => ({ courseId, credits: 4, term, grade: 'A', origin: 'transfer', institution: 'Northeastern University', degreeLevel: 'masters' });
const rules = buildRules({ external: [{ university: 'NORTHEASTERN UNIVERSITY', course_id: 'CS 5004', course_title: 'Object-Oriented Design', transferable_PhD: 'yes', transferable_MSCSE: 'yes', is_cse: 'yes', credit_system: 'semester' }] });
/** The Notre Dame MSCSE held (conferred Spring 2023), a finished master's elsewhere, the Ph.D. from Fall 2024 — and no MSCSE course on the record. */
const record = (over: Partial<Student> = {}): Student =>
  phdStudent({
    entryTerm: fall(2024),
    bachelorsAwarded: spring(2013),
    priorMs: 'completed',
    ndMasters: { term: spring(2023) },
    background: { bachelors: 'elsewhere', graduate: 'nd-mscse', alsoElsewhere: true, finished: true },
    courses: [ne('CS 5004', fall(2018)), ndCourse('CSE 60321', { term: fall(2024) })],
    ...over,
  });

describe('the five-year window from the MSCSE admission (P3-prior-programs-4 (b))', () => {
  it('no MSCSE course on the record: a course outside the Ph.D.’s window waits for the DGS', () => {
    const r = audit(record(), rules, '2026-10-07');
    const line = r.courseLines.find((l) => l.courseId === 'CS 5004')!.text;
    assert.match(line, /^waiting for the DGS — would count toward regular courses \(4 cr\) once approved; completed more than 5 years before your Ph\.D\. entry \(before Fall 2019\) — §5\.2’s five years count back from your admission to the Notre Dame MSCSE, which this record does not date/);
    const ask = coursesNeedingDgsReview(record(), rules, '2026-10-07').find((p) => p.course.entry.courseId === 'CS 5004');
    assert.match(JSON.stringify(ask), /confirm this course falls within five years before my admission to the Notre Dame MSCSE/);
  });
  it('a student who never held the Notre Dame MSCSE: the Ph.D. entry, as before', () => {
    const s = record({ ndMasters: undefined, background: { bachelors: 'elsewhere', graduate: 'elsewhere', samePlace: false, finished: true } });
    assert.match(audit(s, rules, '2026-10-07').courseLines.find((l) => l.courseId === 'CS 5004')!.text, /^not counted — completed more than 5 years before you entered \(before Fall 2019; §5\.2\)/);
  });
  it('a transfer from the unfinished MSCSE: its entry term is the MSCSE’s already', () => {
    const s = record({ entryTerm: fall(2021), ndMasters: undefined, background: { bachelors: 'elsewhere', graduate: 'nd-mscse-transfer', alsoElsewhere: true, finished: true } });
    assert.match(audit(s, rules, '2026-10-07').courseLines.find((l) => l.courseId === 'CS 5004')!.text, /^counts toward regular courses/);
  });
});
