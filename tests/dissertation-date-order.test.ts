// A dated defense or submission with no OCE date, and dates out of order
// (policy review round 3, P3-cse-4b-3; DGS 2026-10-06: "Apply the suggested
// handling"). §4.6: "After satisfying the above requirements, and upon
// approval of the dissertation director, the Ph.D. student can start writing
// the dissertation." The OCE comes first, so a dated defense with a blank OCE
// date is a missing date — it used to read Overdue with the probation note
// beside "Defense passed — Met", and the advisor email asked the student to
// take the OCE. The 2026-10-04 missing-date rule covered only a dated
// admission; it now covers the dissertation milestones too. And the order of
// the dates is checked, as admission against the OCE already was.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { audit } from '../src/engine/audit.ts';
import type { Milestones, Student } from '../src/engine/types.ts';
import { actionItems } from '../src/ui/advisor-summary.ts';
import { buildRules } from './helpers.ts';
import { ndCourse, phdStudent } from './helpers/student.ts';

const rules = buildRules();
const IDS = ['CSE 60641', 'CSE 60111', 'CSE 60321', 'CSE 60427', 'CSE 60535', 'CSE 60762', 'CSE 60770', 'CSE 60868'];
/** Entered Fall 2019 — the eighth semester ended with Spring 2023. */
const student = (milestones: Milestones): Student =>
  phdStudent({
    entryTerm: { season: 'fall', year: 2019 },
    bachelorsAwarded: { season: 'spring', year: 2019 },
    gpa: 3.6,
    courses: IDS.map((id, i) => ndCourse(id, { term: { season: i % 2 === 0 ? 'fall' : 'spring', year: 2019 + Math.ceil(i / 2) } })),
    milestones: { advisorIdentified: '2019-10-01', advisorName: 'Prof. Example', advisorTtt: 'yes', researchQualifierPassed: '2020-12-01', rcrTrainingCompleted: '2020-09-15', ...milestones },
  });
const run = (s: Student, today = '2025-06-01') => {
  const report = audit(s, rules, today);
  const find = (id: string) => report.requirements.find((r) => r.id === id)!;
  return { report, find };
};

describe('a dated defense or submission with no OCE date: the date is missing, not late', () => {
  it('the finding’s case: defense passed 2025-04-01, OCE date blank', () => {
    const { report, find } = run(student({ defensePassed: '2025-04-01' }));
    const oce = find('phd.candidacy');
    assert.equal(oce.status, 'cannot_evaluate');
    assert.equal(oce.deadline, undefined);
    assert.match(oce.detail, /Enter the date you passed the Oral Candidacy Exam \(OCE\) under Milestones — the dissertation comes after it \(§4\.6\)/);
    assert.doesNotMatch(oce.detail, /probation|Overdue/);
    const admission = find('phd.candidacyAdmission');
    assert.equal(admission.status, 'cannot_evaluate');
    assert.match(admission.detail, /^Oral Candidacy Exam \(OCE\) date not entered\. Admission date not entered\./);
    assert.match(admission.detail, /enter the dates you passed the Oral Candidacy Exam \(OCE\) and were admitted to doctoral candidacy under Milestones/);
    assert.equal(report.milestoneDeadlines?.candidacyPassed?.state, undefined, 'no state on the OCE box');
    const items = actionItems(report);
    assert.ok(!items.student.some((s) => s.startsWith('Take the Oral Candidacy Exam')), JSON.stringify(items.student));
    assert.ok(!items.dgs.some((s) => /missed Oral Candidacy Exam/.test(s)), JSON.stringify(items.dgs));
  });
  it('a submission alone does the same, and the defense asks for its own date', () => {
    const { find } = run(student({ dissertationSubmitted: '2025-04-20' }));
    assert.equal(find('phd.candidacy').status, 'cannot_evaluate');
    const defense = find('phd.dissertation.defense');
    assert.equal(defense.status, 'cannot_evaluate');
    assert.match(defense.detail, /^Defense date not entered\. Your final dissertation is submitted \(2025-04-20\), so enter the date you passed the defense under Milestones/);
  });
  it('an OCE on file with the admission missing still asks for the admission only', () => {
    const { find } = run(student({ candidacyPassed: '2022-04-01', defensePassed: '2025-04-01' }));
    const admission = find('phd.candidacyAdmission');
    assert.match(admission.detail, /^Admission date not entered\. Your dissertation milestones are dated, so enter the date you were admitted/);
  });
});

describe('dates out of order go to the DGS: check both', () => {
  it('a defense dated before the OCE', () => {
    const { find } = run(student({ candidacyPassed: '2022-04-01', candidacyAdmitted: '2022-05-01', defensePassed: '2021-04-01' }));
    const defense = find('phd.dissertation.defense');
    assert.equal(defense.status, 'needs_dgs_review');
    assert.match(defense.detail, /The defense date is before the Oral Candidacy Exam \(OCE\) date \(2022-04-01\) — the OCE comes first \(§4\.5, §4\.6\); check both dates, and confirm with the DGS if both are right/);
  });
  it('a submission dated before the defense', () => {
    const { find } = run(student({ candidacyPassed: '2022-04-01', candidacyAdmitted: '2022-05-01', defensePassed: '2025-04-01', dissertationSubmitted: '2025-03-01' }));
    const submitted = find('phd.dissertation.submitted');
    assert.equal(submitted.status, 'needs_dgs_review');
    assert.match(submitted.detail, /The submission date is before the defense date \(2025-04-01\) — the defense comes first \(§4\.7; Academic Code §6\.2\.12\); check both dates/);
  });
  it('dates in order are unchanged', () => {
    const { find } = run(student({ candidacyPassed: '2022-04-01', candidacyAdmitted: '2022-05-01', defensePassed: '2025-04-01', dissertationSubmitted: '2025-04-20' }));
    assert.equal(find('phd.dissertation.defense').status, 'met');
    assert.equal(find('phd.dissertation.submitted').status, 'met');
  });
});
