// An Incomplete or a W from ANOTHER university (policy review round 3,
// P3-ac-4-1; DGS 2026-10-05: "Apply the suggested handling. For the question at
// the end: an outside I should be held for DGS review"). Academic Code §4.4's
// clock — 30 days after grades were due, then an F unless the Graduate School's
// associate dean extends it — governs Notre Dame's own graduate courses; another
// university's Incomplete follows that university's rules, and with no final
// grade it cannot show the B that §5.2 requires. A W elsewhere says nothing
// about a Notre Dame semester's full-time status, which counts Notre Dame
// registrations only (residency.ts).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { audit } from '../src/engine/audit.ts';
import { coursesNeedingDgsReview } from '../src/engine/review.ts';
import type { CourseEntry, Student } from '../src/engine/types.ts';
import { approvalItems } from '../src/ui/advisor-summary.ts';
import { buildRules } from './helpers.ts';
import { ndCourse, phdStudent, transferCourse } from './helpers/student.ts';

const rules = buildRules();
const spring = (year: number) => ({ season: 'spring' as const, year });
const fall = (year: number) => ({ season: 'fall' as const, year });
const UMASS = 'University of Massachusetts Amherst';
const outside = (grade: CourseEntry['grade']) => transferCourse('COMPSCI 589', 'Machine Learning', { term: spring(2026), grade, institution: UMASS, degreeLevel: 'masters' });
const student = (courses: CourseEntry[]): Student => phdStudent({ entryTerm: fall(2026), priorMs: 'completed', bachelorsAwarded: spring(2024), gpa: 3.6, courses });
const lineOf = (s: Student, today: string, id: string) => audit(s, rules, today).courseLines.find((l) => l.courseId === id)!;

describe('an Incomplete from another university is held for the DGS, never on Notre Dame’s §4.4 clock', () => {
  for (const today of ['2026-06-20', '2026-10-05']) {
    it(`before and after Notre Dame's 44 days (${today}): no date, no "became an F", waiting for the DGS`, () => {
      const s = student([outside('I')]);
      const line = lineOf(s, today, 'COMPSCI 589');
      assert.equal(line.mark, 'pending');
      assert.match(line.text, /graded I \(Incomplete\) at University of Massachusetts Amherst — no final grade yet, so it cannot show the B that §5\.2 requires — the DGS decides once the grade is final/);
      assert.doesNotMatch(line.text, /complete the work by|became an F|Academic Code §4\.4/);
      const row = audit(s, rules, today).requirements.find((r) => r.id === 'phd.transfer')!;
      assert.equal(row.status, 'needs_dgs_review');
      assert.match(row.detail, /COMPSCI 589: Graded I \(Incomplete\) at University of Massachusetts Amherst/);
      assert.doesNotMatch(row.detail, /Academic Code §4\.4/);
      const ask = coursesNeedingDgsReview(s, rules, today)[0]!;
      assert.ok(ask.ask.decide.includes('decide this course once its final grade is posted — it is graded I (Incomplete) at my previous university, so it cannot show the B that §5.2 requires yet'), JSON.stringify(ask.ask));
      assert.equal(ask.ask.replyNeeded, true);
      assert.doesNotMatch(ask.reason, /not in the course rules yet.*not in the course rules yet/, 'said once');
    });
  }
  it('a DGS “yes” in the course rules does not count it while it is an I', () => {
    const withRow = buildRules({ external: [{ university: UMASS, course_id: 'COMPSCI 589', course_title: 'Machine Learning', transferable_PhD: 'yes', transferable_MSCSE: 'yes', credit_system: 'semester', is_cse: 'yes', satisfies_core_area: 'none' }] });
    const line = audit(student([outside('I')]), withRow, '2026-10-05').courseLines.find((l) => l.courseId === 'COMPSCI 589')!;
    assert.equal(line.mark, 'pending');
    assert.match(line.text, /^waiting for the DGS — would count toward regular courses \(3 cr\) once approved/);
  });
  it('a Notre Dame course’s Incomplete keeps the §4.4 clock', () => {
    const nd = lineOf(phdStudent({ entryTerm: fall(2025), courses: [ndCourse('CSE 60641', { term: spring(2026), grade: 'I' })] }), '2026-06-20', 'CSE 60641');
    assert.match(nd.text, /Incomplete \(I\): complete the work by about 2026-07-14/);
  });
  it('the advisor email asks the DGS to decide once the grade is posted', () => {
    const reason = `graded I (Incomplete) at ${UMASS} — no final grade yet, so it cannot show the B that §5.2 requires — the DGS decides once the grade is final`;
    assert.equal(approvalItems('COMPSCI 589', reason, 'phd').dgs, 'Decide on COMPSCI 589 once its final grade is posted — it is graded I (Incomplete) at my previous university (§5.2).');
  });
});

describe('a W from another university says nothing about a Notre Dame semester', () => {
  it('no full-time clause on another university’s W; a Notre Dame W keeps it', () => {
    assert.equal(lineOf(student([outside('W')]), '2026-10-05', 'COMPSCI 589').text, 'not counted — withdrawn (W) — earns no credit');
    const ndW = lineOf(phdStudent({ entryTerm: fall(2025), courses: [ndCourse('CSE 60641', { term: fall(2025), grade: 'W' })] }), '2026-10-05', 'CSE 60641');
    assert.match(ndW.text, /withdrawn \(W\) — earns no credit; it still counts as a registration for that semester’s full-time status \(Academic Code §3\.3\)/);
  });
});
