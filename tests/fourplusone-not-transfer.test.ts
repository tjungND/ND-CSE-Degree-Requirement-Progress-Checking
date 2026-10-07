// A 4+1's graduate course from before the bachelor's is never §5.2 transfer
// credit, whatever level the transcript registered it at (Academic Code §4.6,
// last paragraph: "With advanced approval from the graduate program of study,
// a Notre Dame undergraduate who is registered for graduate courses at Notre
// Dame may use this coursework") — policy review round 3, P3-fourplusone-5 and
// -7 (DGS 2026-10-07: "apply the suggested handling"). A GR-registered row was
// sent to the DGS for a §5.2 recommendation and to the Grad Admin for a
// Transfer of Credits form; and a ticked case-by-case row's line said the
// rules had said yes.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { audit } from '../src/engine/audit.ts';
import { coursesNeedingDgsReview } from '../src/engine/review.ts';
import type { CourseEntry, Student, Term } from '../src/engine/types.ts';
import { processingItems } from '../src/ui/grad-admin-request.ts';
import { buildRules } from './helpers.ts';
import { phdStudent } from './helpers/student.ts';

const fall = (year: number): Term => ({ season: 'fall', year });
const spring = (year: number): Term => ({ season: 'spring', year });
const TODAY = '2026-10-07';
// CSE 60641 made case by case for the MSCSE, so the GR row waits on an approval.
const rules = buildRules({ courses: [{ course_id: 'CSE 60641', set: { counts_toward_mscse: 'adgs_approval' } }] });
const nd = (courseId: string, term: Term, registeredLevel: 'graduate' | 'undergraduate', extra: Partial<CourseEntry> = {}): CourseEntry => ({
  courseId, credits: 3, term, grade: 'A', origin: 'transfer', institution: 'University of Notre Dame',
  degreeLevel: registeredLevel === 'graduate' ? 'masters' : 'bachelors', registeredLevel, ...extra,
});
const student = (gr: Partial<CourseEntry> = {}): Student =>
  phdStudent({
    program: 'mscse',
    msOption: 'project',
    entryTerm: fall(2026),
    bachelorsAwarded: spring(2026),
    integratedBsMs: true,
    integratedAdmitted: fall(2025),
    gpa: 3.7,
    attestations: { dgsApproved4xxxx: true },
    courses: [nd('CSE 40113', fall(2025), 'undergraduate'), nd('CSE 40243', fall(2025), 'undergraduate'), nd('CSE 60641', spring(2026), 'graduate', gr), nd('MATH 60610', spring(2026), 'graduate')],
  });

describe('a 4+1’s GR-registered course from before the bachelor’s (P3-fourplusone-5)', () => {
  it('the review asks for the approval the line waits on, never a §5.2 recommendation', () => {
    const pending = coursesNeedingDgsReview(student(), rules, TODAY);
    const row = pending.find((p) => p.course.entry.courseId === 'CSE 60641');
    assert.ok(row, JSON.stringify(pending.map((p) => p.course.entry.courseId)));
    assert.deepEqual(row.ask?.decide, ['approve it for me — the course rules say case by case']);
    for (const p of pending) {
      assert.doesNotMatch(JSON.stringify(p.ask), /recommend the transfer credit/, p.course.entry.courseId);
      assert.doesNotMatch(p.reason, /transfer credit needs a DGS recommendation/, p.course.entry.courseId);
    }
  });
  it('the processing request lists no transfer, before or after the tick', () => {
    for (const s of [student(), student({ dgsApproved: true })]) {
      const report = audit(s, rules, TODAY);
      assert.deepEqual(processingItems(report, s, rules).transfers, []);
    }
  });
});

describe('a ticked case-by-case line does not claim the rules said yes (P3-fourplusone-7)', () => {
  it('ticked: the tick’s sentence, not “counted on the course rules’ yes”', () => {
    const report = audit(student({ dgsApproved: true }), rules, TODAY);
    const line = report.courseLines.find((l) => l.courseId === 'CSE 60641')!.text;
    assert.doesNotMatch(line, /counted on the course rules’ yes/, line);
  });
  it('a yes row keeps it', () => {
    const report = audit(student(), buildRules(), TODAY);
    const line = report.courseLines.find((l) => l.courseId === 'CSE 60641')!.text;
    assert.match(line, /counted on the course rules’ yes, which is the program’s advance approval/, line);
  });
});
