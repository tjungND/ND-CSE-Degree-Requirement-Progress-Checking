// Warnings for the people who decide and process (DGS 2026-10-04): a `yes`
// in the ExternalCourses tab for a course whose number looks undergraduate
// (P1-sheet-48: "If a course is an undergrad version, they should not
// transfer … a warning needs to be shown to ADGS/DGS/Grad Admin") or whose
// title suggests a non-regular course (P1-sheet-c2). src/data/course-checks.ts.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { looksNonRegularTitle, looksUndergraduateNumber } from '../src/data/course-checks.ts';
import { parseExternalTab } from '../src/data/parse.ts';
import type { SheetIssue } from '../src/data/types.ts';
import { audit } from '../src/engine/audit.ts';
import { gradAdminRequest } from '../src/ui/grad-admin-request.ts';
import { buildRules } from './helpers.ts';
import { ndCourse, phdStudent, transferCourse } from './helpers/student.ts';

describe('the two guesses', () => {
  it('an undergraduate-looking number: 4- and 5-digit below 5000/50000, 3-digit in the 100s, 300s and 400s', () => {
    for (const id of ['ECE 4804', 'CS 455', 'CS 101', 'CS 30100', 'MATH 3510']) assert.equal(looksUndergraduateNumber(id), true, id);
    // The 200s stay out (the University of California's graduate courses);
    // graduate numbers, and ids with no 3–5-digit number, are never flagged.
    for (const id of ['ECE 201', 'CSCI 570', 'CS 8903', 'CS 50300', 'COMP 9417', '30240233', '6.006', 'CSE 60641']) assert.equal(looksUndergraduateNumber(id), false, id);
  });

  it('a title that suggests a non-regular course', () => {
    for (const t of ['Special Problems', 'Reading and Special Problems', "Master's Thesis", 'Doctoral Seminar', 'Independent Study', 'MENG INTERNSHIP PROJECT', 'Graduate Research'])
      assert.equal(looksNonRegularTitle(t), true, t);
    for (const t of ['Special Topics', 'Research Methods', 'Advanced Database Organization', 'Machine Learning', undefined]) assert.equal(looksNonRegularTitle(t), false, String(t));
  });
});

describe('the sheet check warns the DGS about a `yes` row only', () => {
  const header = 'university,course_id,course_title,satisfies_core_area,transferable_PhD,transferable_MSCSE,is_cse,nd_credits,credit_system,decided_on,notes';
  it('an undergraduate number and a special-problems title, each a warning; a case-by-case row none', () => {
    const csv = [
      header,
      'GEORGIA INSTITUTE OF TECHNOLOGY,ECE 4804,Special Topics,none,yes,no,yes,,semester,2026-10-04,',
      'GEORGIA INSTITUTE OF TECHNOLOGY,CS 8903,Special Problems,none,yes,adgs_approval,yes,,semester,2026-10-04,',
      'ILLINOIS INSTITUTE OF TECHNOLOGY,CS 430,Introduction Algorithms,none,no,adgs_approval,yes,,semester,2026-10-04,',
    ].join('\n');
    const issues: SheetIssue[] = [];
    parseExternalTab(csv, [{ code: 'os', name: 'Operating Systems' }], issues);
    const warnings = issues.filter((i) => i.severity === 'warning').map((i) => i.message);
    assert.equal(warnings.length, 2, warnings.join('\n'));
    assert.match(warnings[0]!, /^ExternalCourses row 2: GEORGIA INSTITUTE OF TECHNOLOGY ECE 4804 transfers for the Ph\.D\. \(yes\), but its number looks like an undergraduate course — only graduate courses transfer \(Academic Code §4\.6\)\./);
    assert.match(warnings[1]!, /^ExternalCourses row 3: GEORGIA INSTITUTE OF TECHNOLOGY CS 8903 “Special Problems” transfers for the Ph\.D\. \(yes\) and would count toward the regular-course credits/);
  });
});

describe('the review and processing requests carry the checks for a student’s own courses', () => {
  const rules = buildRules({
    external: [
      { university: 'GEORGIA INSTITUTE OF TECHNOLOGY', course_id: 'ECE 4804', course_title: 'Special Topics', satisfies_core_area: 'none', transferable_PhD: 'yes', transferable_MSCSE: 'no', is_cse: 'yes' },
      { university: 'GEORGIA INSTITUTE OF TECHNOLOGY', course_id: 'CS 8903', course_title: 'Special Problems', satisfies_core_area: 'none', transferable_PhD: 'yes', transferable_MSCSE: 'no', is_cse: 'yes' },
      { university: 'GEORGIA INSTITUTE OF TECHNOLOGY', course_id: 'CS 6210', course_title: 'Advanced Operating Systems', satisfies_core_area: 'os', transferable_PhD: 'yes', transferable_MSCSE: 'no', is_cse: 'yes' },
    ],
  });
  const gt = (courseId: string, title: string) => transferCourse(courseId, title, { institution: 'Georgia Institute of Technology', degreeLevel: 'masters', dgsApproved: undefined });
  const student = phdStudent({
    priorMs: 'completed',
    bachelorsAwarded: { season: 'spring', year: 2022 },
    gpa: 3.6,
    courses: [gt('ECE 4804', 'Special Topics'), gt('CS 8903', 'Special Problems'), gt('CS 6210', 'Advanced Operating Systems'), ndCourse('CSE 60641')],
    milestones: { advisorIdentified: '2026-09-10', advisorName: 'Prof. Example' },
  });

  it('the report lists one check per course and guess; a graduate regular course gets none', () => {
    const r = audit(student, rules, '2027-01-15');
    assert.deepEqual(
      (r.staffChecks ?? []).map((t) => t.split(':')[0]).sort(),
      ['CS 8903 (Georgia Institute of Technology) “Special Problems”', 'ECE 4804 (Georgia Institute of Technology)'],
      JSON.stringify(r.staffChecks),
    );
  });

  it('the processing request says them before anything is processed', () => {
    const r = audit(student, rules, '2027-01-15');
    const { text } = gradAdminRequest(r, student, rules, { todayIso: '2027-01-15', entryTerm: 'Fall 2026', priorStudy: 'Completed prior M.S. or Ph.D.', gpa: 3.6 });
    // First below the line, before the transfer tables.
    assert.match(text, /\(DO NOT MODIFY ANYTHING BELOW THIS LINE\)\n\nPLEASE CHECK BEFORE PROCESSING\n- /);
    assert.match(text, /\n- ECE 4804 \(Georgia Institute of Technology\): the course rules let it transfer, but its number looks like an undergraduate course/);
    assert.match(text, /\n- CS 8903 \(Georgia Institute of Technology\) “Special Problems”: the course rules let it transfer, and it counts toward the regular-course credits, but its title suggests independent study, research or a seminar, which are not regular courses \(§4\.2\)\./);
    // The Graduate School's own rows keep their section (it printed "()" until 2026-10-04).
    assert.match(text, /\[IN PROGRESS\] Responsible Conduct of Research and ethics training complete \(Academic Code §6\.2\.4\)\n/);
    assert.doesNotMatch(text, /\(\)/);
  });

  it('nothing for a student with no such course', () => {
    const plain = phdStudent({ priorMs: 'completed', bachelorsAwarded: { season: 'spring', year: 2022 }, courses: [gt('CS 6210', 'Advanced Operating Systems')] });
    assert.equal(audit(plain, rules, '2027-01-15').staffChecks, undefined);
  });
});
