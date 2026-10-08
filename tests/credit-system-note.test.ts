// The "credits as your transcript prints them" note (DGS 2026-10-03,
// P1-units-4plus1-c7): on every course from another university whose credit
// system is unknown — no ExternalCourses row, a row with a blank credit_system,
// or a value the sheet parser rejected — unless nd_credits fixes the number or
// the student's own transcript said quarter/trimester. Not only, as before,
// when the row was missing.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { audit } from '../src/engine/audit.ts';
import type { CourseEntry, Student } from '../src/engine/types.ts';
import { buildRules } from './helpers.ts';

const NOTE = 'credits as your transcript prints them — the DGS converts quarter, trimester or other units (§5.2 pro-rata)';
const row = (extra: Partial<CourseEntry> = {}): CourseEntry => ({ courseId: 'CS 50300', credits: 3, term: { season: 'fall', year: 2024 }, grade: 'A', origin: 'transfer', institution: 'Purdue University', degreeLevel: 'masters', ...extra });
const student = (c: CourseEntry): Student => ({ schemaVersion: 1, program: 'phd', entryTerm: { season: 'fall', year: 2026 }, bachelorsAwarded: { season: 'spring', year: 2022 }, priorMs: 'completed', gpa: 3.6, milestones: {}, attestations: {}, courses: [c] });
const line = (c: CourseEntry, external?: Record<string, string>[]) =>
  audit(student(c), buildRules(external === undefined ? {} : { external }), '2027-06-01').courseLines.find((l) => l.courseId === 'CS 50300')!.text;
const purdue = (extra: Record<string, string> = {}) => ({ university: 'PURDUE UNIVERSITY', course_id: 'CS 50300', course_title: 'Operating Systems', transferable_PhD: 'yes', transferable_MSCSE: 'yes', ...extra });

describe('credits-as-printed note', () => {
  it('no ExternalCourses row at all → the note, on the pending line', () => {
    const t = line(row(), []);
    assert.ok(t.startsWith('waiting for the DGS'), t);
    assert.ok(t.includes(NOTE), t);
  });
  it('a row with a blank credit_system → the note, on the counted line (new 2026-10-03)', () => {
    const t = line(row(), [purdue()]);
    assert.ok(t.startsWith('counts toward regular courses (3 cr)'), t);
    assert.ok(t.includes(NOTE), t);
  });
  it('a row whose credit_system the sheet rejected (e.g. "units") → the note', () => {
    const t = line(row(), [purdue({ credit_system: 'units' })]);
    assert.ok(t.includes(NOTE), t);
  });
  it('credit_system "semester" → no note', () => {
    assert.ok(!line(row(), [purdue({ credit_system: 'semester' })]).includes('as your transcript prints them'));
  });
  it('credit_system "quarter" → converted, no note', () => {
    const t = line(row({ credits: 4 }), [purdue({ credit_system: 'quarter' })]);
    assert.ok(t.includes('converted from the quarter system'), t);
    assert.ok(!t.includes('as your transcript prints them'), t);
  });
  it('nd_credits set → no note (the DGS fixed the number)', () => {
    assert.ok(!line(row(), [purdue({ nd_credits: '3' })]).includes('as your transcript prints them'));
  });
  it('the transcript’s own quarter reading converts, no note', () => {
    const t = line(row({ credits: 4, creditSystem: 'quarter' }), [purdue()]);
    assert.ok(t.includes('converted from the quarter system'), t);
    assert.ok(!t.includes('as your transcript prints them'), t);
  });
});
