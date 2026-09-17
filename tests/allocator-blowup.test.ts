// Regression (DGS report 2026-09-16): the multi-cap processing-order search
// must not be factorial.
//
// bestMultiOrder() in src/engine/allocate.ts used to enumerate every
// permutation of the courses that draw on more than one credit cap, and build
// the whole list before scoring any of it. A prior-program course that is also
// non-CSE draws on two caps ('transfer' + 'noncse'), so a Ph.D. student who
// imported a master's transcript put ten or more courses into that search:
// 3.6 million arrays at ten, 40 million at eleven. The page froze at load —
// the renderer pinned at ~200% CPU until Chrome offered "Page Unresponsive".
// Nothing in the suite covered it, because every scenario fixture stays well
// under ten multi-cap courses.
//
// Ten is deliberate: the old code took ~13.5 s there (a regression fails this
// test in seconds, not the half hour that twelve would have cost), while the
// memoized search takes single-digit milliseconds — a margin of some 4,000×,
// so the bound below is not a flaky timing assertion.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { audit } from '../src/engine/audit.ts';
import { buildRules } from './helpers.ts';

const SUBJECTS = ['INFO', 'TELE', 'MENG', 'BIOS', 'ECON', 'PSYC', 'HIST', 'MATH', 'STAT', 'PHIL'];
const MULTI_CAP_COURSES = 10;
const BUDGET_MS = 2_000;

function priorProgramCourses(n: number): { id: string }[] {
  return Array.from({ length: n }, (_, i) => ({ id: `${SUBJECTS[i % SUBJECTS.length]} 5${String(1000 + i).slice(-4)}` }));
}

function studentWithPriorMasters(n: number) {
  return {
    schemaVersion: 1,
    program: 'phd',
    entryTerm: { season: 'fall', year: 2026 },
    bachelorsAwarded: { season: 'spring', year: 2020 },
    priorMs: 'completed',
    gpa: 3.7,
    courses: priorProgramCourses(n).map((c) => ({
      courseId: c.id,
      credits: 3,
      term: { season: 'fall', year: 2024 },
      grade: 'A',
      origin: 'transfer',
      institution: 'Purdue University',
      degreeLevel: 'masters',
    })),
    milestones: {},
    attestations: { transferApproved: true },
  };
}

function rulesForPriorProgram(n: number) {
  return buildRules({
    parameters: { cse_subject_codes: 'CS; CSCI; COMPSCI; CSYE' },
    external: priorProgramCourses(n).map((c) => ({
      university: 'PURDUE UNIVERSITY',
      course_id: c.id,
      course_title: 'Some Course',
      transferable_PhD: 'yes',
      transferable_MSCSE: 'yes',
    })),
  });
}

describe('the multi-cap order search does not blow up', () => {
  it(`audits a student with ${MULTI_CAP_COURSES} two-cap prior-program courses well inside ${BUDGET_MS} ms`, () => {
    const rules = rulesForPriorProgram(MULTI_CAP_COURSES);
    const student = studentWithPriorMasters(MULTI_CAP_COURSES);
    const started = performance.now();
    const report = audit(student as never, rules, '2027-06-01');
    const elapsed = performance.now() - started;
    assert.ok(
      elapsed < BUDGET_MS,
      `audit() took ${(elapsed / 1000).toFixed(1)} s for ${MULTI_CAP_COURSES} multi-cap courses — the order search is enumerating permutations again (see src/engine/allocate.ts, bestMultiOrder)`,
    );
    assert.ok(report.requirements.length > 0, 'the report must still be produced');
  });

  it('counts the same credits it did with the permutation search', () => {
    // Six courses is inside what the old exhaustive search handled comfortably,
    // so these totals are the pre-fix answers: the new search must agree.
    const rules = rulesForPriorProgram(6);
    const report = audit(studentWithPriorMasters(6) as never, rules, '2027-06-01');
    const byId = new Map(report.requirements.map((r) => [r.id, r]));
    assert.equal(byId.get('phd.cap.noncse')?.status, 'met');
    assert.match(byId.get('phd.cap.noncse')?.detail ?? '', /9 of the 9 non-CSE cap credits used/);
  });
});
