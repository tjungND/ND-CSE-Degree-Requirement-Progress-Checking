// Two notes on course lines from the policy review (DGS 2026-10-03, "follow the
// suggested fix"): a transfer grade the student chose for a mark the app could
// not map says so (P1-transfer-eligibility-7), and a 4+1's counted 60000-level
// course taken as an undergraduate names the Courses tab's `yes` as the
// Academic Code's advance approval (P1-transfer-eligibility-24).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { audit } from '../src/engine/audit.ts';
import type { Student } from '../src/engine/types.ts';
import { buildRules } from './helpers.ts';

const base: Student = {
  schemaVersion: 1,
  program: 'phd',
  entryTerm: { season: 'fall', year: 2026 },
  bachelorsAwarded: { season: 'spring', year: 2022 },
  priorMs: 'completed',
  gpa: 3.6,
  milestones: {},
  attestations: {},
  courses: [],
};
const rules = buildRules({ external: [{ university: 'PURDUE UNIVERSITY', course_id: 'CS 50300', course_title: 'Operating Systems', transferable_PhD: 'yes', transferable_MSCSE: 'yes' }] });
const lineOf = (s: Student, id: string) => audit(s, rules, '2027-06-01').courseLines.find((l) => l.courseId === id)!.text;

describe('a transfer grade chosen for an unmapped mark', () => {
  const row = { courseId: 'CS 50300', credits: 3, term: { season: 'fall' as const, year: 2024 }, grade: 'B' as const, origin: 'transfer' as const, institution: 'Purdue University', degreeLevel: 'masters' as const };
  it('says the letter is the student’s own reading of the printed mark', () => {
    const text = lineOf({ ...base, courses: [{ ...row, transcriptMark: '85' }] }, 'CS 50300');
    assert.ok(text.includes('B is your own reading of the transcript’s mark “85” — the DGS checks it against the B that §5.2 requires'), text);
  });
  it('says nothing when the transcript printed a letter the app mapped itself', () => {
    assert.ok(!lineOf({ ...base, courses: [row] }, 'CS 50300').includes('your own reading'));
  });
});

describe('a 4+1’s counted 60000-level undergraduate course', () => {
  const fourPlusOne: Student = {
    ...base,
    priorMs: 'none',
    bachelorsAwarded: { season: 'spring', year: 2026 },
    integratedBsMs: true,
    courses: [
      { courseId: 'CSE 60641', credits: 3, term: { season: 'fall', year: 2025 }, grade: 'A', origin: 'transfer', institution: 'University of Notre Dame', degreeLevel: 'bachelors', registeredLevel: 'graduate', countedToward: 'neither' },
    ],
  };
  it('names the course rules’ yes as the program’s advance approval (Academic Code §4.6)', () => {
    const text = lineOf(fourPlusOne, 'CSE 60641');
    assert.ok(text.startsWith('counts toward regular courses (3 cr)'), text);
    assert.ok(text.includes('counted on the course rules’ yes, which is the program’s advance approval for graduate coursework taken as an undergraduate (Academic Code §4.6)'), text);
  });
  it('a provisional course (registered UG, move unverified) waits instead', () => {
    const ug: Student = { ...fourPlusOne, courses: [{ ...fourPlusOne.courses[0]!, registeredLevel: 'undergraduate' }] };
    const text = lineOf(ug, 'CSE 60641');
    assert.ok(text.startsWith('waiting for the DGS'), text);
    assert.ok(!text.includes('advance approval for graduate coursework'), text);
  });
});
