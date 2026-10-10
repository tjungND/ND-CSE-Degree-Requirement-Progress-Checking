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
import { courseEntryOf, creditSystemNote } from '../src/ui/external-upload.ts';

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

// Who chose the credit system (DGS 2026-10-10, item 3: "Fix it"). The preview
// note and the report both said the transcript named the system when the
// student had picked it by hand.

describe('credit system chosen by hand', () => {
  it('the preview note, for every reading × choice', () => {
    const t = (read: 'quarter' | 'trimester' | undefined, sel: 'quarter' | 'trimester' | 'semester' | undefined) => creditSystemNote(read, sel);
    // The parser's own reading, untouched: W-CL424.
    assert.match(t('quarter', 'quarter').text, /^ — read from how the transcript names its terms\. Its credits will be converted \(a 4-credit course counts 2\.64 Notre Dame credits/);
    assert.match(t('trimester', 'trimester').text, /read from how the transcript names its terms\. Its credits will be converted \(a 4-credit course counts 3\.52/);
    // Picked by hand over nothing found, or over the other system: W-CL427.
    assert.equal(t(undefined, 'quarter').text, ' — chosen by you; the parser found none on the transcript. Its credits will be converted (a 4-credit course counts 2.64 Notre Dame credits, §5.2 pro-rata); the DGS’s ruling for the university overrides your choice.');
    assert.match(t('quarter', 'trimester').text, /^ — chosen by you; the parser read quarter hours\. Its credits will be converted \(a 4-credit course counts 3\.52/);
    // Semester over a system the parser read: W-CL428.
    assert.equal(t('trimester', 'semester').text, ' — chosen by you; the parser read trimester hours. Its credits will be counted as printed; the DGS’s ruling for the university overrides your choice.');
    // Nothing read, nothing changed: the old hint, no warning.
    for (const sel of [undefined, 'semester'] as const) {
      assert.match(t(undefined, sel).text, /parser did not notice/);
      assert.equal(t(undefined, sel).warn, false);
    }
    for (const [r, s] of [['quarter', 'quarter'], [undefined, 'trimester'], ['quarter', 'semester']] as const) assert.equal(t(r, s).warn, true);
    for (const [r, s] of [[undefined, 'quarter'], ['quarter', 'trimester'], ['trimester', 'semester']] as const) assert.doesNotMatch(t(r, s).text, /read from how/);
  });

  const preview = (creditSystem: 'quarter' | 'trimester' | 'semester' | undefined, creditSystemRead: 'quarter' | 'trimester' | undefined) => ({ slot: 'masters' as const, unofficial: undefined, creditSystem, creditSystemRead });
  const previewRow = { courseId: 'CS 50300', title: 'Operating Systems', credits: 4, season: 'fall' as const, year: 2024, grade: 'A', level: 'graduate' as const };
  const entry = (sys: 'quarter' | 'trimester' | 'semester' | undefined, read: 'quarter' | 'trimester' | undefined) =>
    courseEntryOf(previewRow as unknown as Parameters<typeof courseEntryOf>[0], preview(sys, read), 'Purdue University');

  it('the record marks a system the student chose, and only that', () => {
    assert.equal(entry('quarter', 'quarter').creditSystemChosen, undefined);
    assert.equal(entry('quarter', 'quarter').creditSystem, 'quarter');
    assert.equal(entry('quarter', undefined).creditSystemChosen, true);
    assert.equal(entry('trimester', 'quarter').creditSystemChosen, true);
    assert.equal(entry('semester', 'quarter').creditSystem, undefined, 'semester is the default: nothing to record');
    assert.equal(entry('semester', 'quarter').creditSystemChosen, undefined);
  });

  it('the report says who chose it', () => {
    const read = line(row({ credits: 4, creditSystem: 'quarter' }), [purdue()]);
    assert.ok(read.includes('— your transcript says quarter terms; the DGS’s decision for the university can correct this'), read);
    const chosen = line(row({ credits: 4, creditSystem: 'quarter', creditSystemChosen: true }), [purdue()]);
    assert.ok(chosen.includes('converted from the quarter system'), chosen);
    assert.ok(chosen.includes('— you chose quarter terms when importing; the DGS’s decision for the university can correct this'), chosen);
    assert.ok(!chosen.includes('your transcript says'), chosen);
    // The sheet's credit_system wins, whoever chose: no source sentence.
    const sheet = line(row({ credits: 4, creditSystem: 'trimester', creditSystemChosen: true }), [purdue({ credit_system: 'quarter' })]);
    assert.ok(sheet.includes('converted from the quarter system') && !sheet.includes('you chose') && !sheet.includes('your transcript says'), sheet);
  });
});
