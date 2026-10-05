// The Oral Candidacy Exam and admission to doctoral candidacy are two rows
// (DGS 2026-10-04, P2-dh-3.21-3.24-16): "OCE and doctoral candidacy are two
// different things. One can pass OCE first and then enter the doctoral
// candidacy later. Passing OCE is one of the requirements of doctoral
// candidacy." The OCE row keeps §4.5's exam and its coursework condition; the
// admission row (phd.candidacyAdmission) carries the Graduate School's
// conditions — Academic Code §6.2.9 and the DGS Handbook's list (§3.22.3) —
// and its eighth-semester deadline (§5.7.3, §3.22.3).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { audit } from '../src/engine/audit.ts';
import type { Milestones, Student, Term } from '../src/engine/types.ts';
import { actionItems, advisorSummary } from '../src/ui/advisor-summary.ts';
import { gradAdminRequest } from '../src/ui/grad-admin-request.ts';
import { buildRules } from './helpers.ts';
import { ndCourse, phdStudent, transferCourse } from './helpers/student.ts';

const rules = buildRules();
const fall = (year: number): Term => ({ season: 'fall', year });
const spring = (year: number): Term => ({ season: 'spring', year });
const REGULAR = ['CSE 60641', 'CSE 60111', 'CSE 60321', 'CSE 60427', 'CSE 60535', 'CSE 60762', 'CSE 60770', 'CSE 60876'];
/** A Fall 2026 entrant with the 24 regular credits over the first four
 * semesters, those four ticked full-time, a 3.6 GPA and the RCR training. */
function ready(milestones: Milestones, over: Partial<Student> = {}): Student {
  const terms = [fall(2026), spring(2027), fall(2027), spring(2028)];
  return phdStudent({
    gpa: 3.6,
    courses: REGULAR.map((id, i) => ndCourse(id, { term: terms[Math.floor(i / 2)]! })),
    fullTimeTermOverrides: terms,
    milestones: { advisorIdentified: '2026-10-01', advisorName: 'Prof. Example', advisorTtt: 'yes', rcrTrainingCompleted: '2027-09-15', ...milestones },
    ...over,
  });
}
const rows = (s: Student, today: string) => {
  const r = audit(s, rules, today);
  return { report: r, oce: r.requirements.find((x) => x.id === 'phd.candidacy')!, admission: r.requirements.find((x) => x.id === 'phd.candidacyAdmission')! };
};

describe('the OCE passed is not yet admission to candidacy (P2-dh-3.21-3.24-16)', () => {
  it('an OCE passed in the third semester: the OCE row is Met, admission waits for the fourth full-time semester', () => {
    // The review's own case, moved to this fixture's calendar: the exam in
    // semester 3 (Fall 2027), three full-time semesters so far.
    const s = ready({ candidacyPassed: '2027-12-10' }, { fullTimeTermOverrides: [fall(2026), spring(2027), fall(2027)] });
    const { oce, admission } = rows(s, '2028-01-15');
    assert.equal(oce.status, 'met');
    assert.match(oce.detail, /Passing the OCE is one of the conditions for admission to doctoral candidacy|Passing the Oral Candidacy Exam \(OCE\) is one of the conditions for admission to doctoral candidacy/);
    assert.equal(admission.status, 'in_progress');
    assert.equal(admission.title, 'Admitted to doctoral candidacy');
    assert.equal(admission.citation.section, 'Academic Code §6.2.9');
    assert.match(admission.detail, /Oral Candidacy Exam \(OCE\): passed 2027-12-10/);
    assert.match(admission.detail, /4 consecutive full-time semesters: 3 so far \(Fall 2026–Fall 2027\)/);
    assert.doesNotMatch(admission.detail, /Every condition is met/);
    assert.equal(admission.deadline?.label, 'Due by the end of Spring 2030 — semester 8 (approximate)');
  });

  it('the OCE row no longer weighs the GPA; the admission row does', () => {
    const { oce, admission } = rows(ready({ candidacyPassed: '2028-04-01' }, { gpa: 2.8 }), '2028-06-01');
    assert.equal(oce.status, 'met');
    assert.doesNotMatch(oce.detail, /GPA/);
    assert.match(admission.detail, /Cumulative GPA of 3\.0 or better: 2\.80 — below it/);
    assert.equal(admission.status, 'in_progress');
  });

  it('the coursework condition stays on the exam (§4.5): an OCE dated with credits short goes to the DGS', () => {
    const s = ready({ candidacyPassed: '2027-04-01' }, { courses: [ndCourse('CSE 60641')] });
    const { oce, admission } = rows(s, '2027-06-01');
    assert.equal(oce.status, 'needs_dgs_review');
    assert.match(oce.detail, /You show 3 of 24 regular credits — §4\.5 requires that before the exam/);
    assert.match(admission.detail, /Coursework: 3 of 24 regular-course credits complete/);
  });
});

describe('every condition met, not yet admitted', () => {
  const s = ready({ candidacyPassed: '2028-04-01' });
  const today = '2028-06-01';
  it('the row says to apply, and names the Graduate School’s form', () => {
    const { admission } = rows(s, today);
    assert.equal(admission.status, 'in_progress');
    assert.match(admission.detail, /4 consecutive full-time semesters: done \(Fall 2026–Spring 2028\)/);
    assert.match(admission.detail, /Coursework: 24 of 24 regular-course credits complete/);
    assert.match(admission.detail, /Every condition is met: apply now — the Grad Admin submits the Graduate School’s Application for Admission to Doctoral Candidacy/);
  });
  it('the advisor summary and the processing request carry the application', () => {
    const { report } = rows(s, today);
    const items = actionItems(report);
    assert.ok(items.student.some((t) => /^Apply for admission to doctoral candidacy through the Grad Admin by the end of Spring 2030 \(Academic Code §6\.2\.9\)\.$/.test(t)), JSON.stringify(items.student));
    assert.ok(items.gradAdmin.includes('Submit my Application for Admission to Doctoral Candidacy to the Graduate School (DGS Handbook §3.22.3).'), JSON.stringify(items.gradAdmin));
    const { text } = gradAdminRequest(report, s, rules, { todayIso: today, entryTerm: 'Fall 2026', priorStudy: 'None', gpa: 3.6 });
    assert.match(text, /\d\. Initiate my Application for Admission to Doctoral Candidacy — the self-check shows every condition met \(DGS Handbook §3\.22\.3\)\.\n/);
    assert.match(text, /ADMISSION TO DOCTORAL CANDIDACY \(ACADEMIC CODE §6\.2\.9\)\n/i);
  });
});

describe('a dated admission', () => {
  it('on time: Met, and the time-limit row counts it', () => {
    const { oce, admission } = rows(ready({ candidacyPassed: '2028-04-01', candidacyAdmitted: '2028-05-01' }), '2028-06-01');
    assert.equal(admission.status, 'met');
    assert.equal(admission.detail, 'Admitted to doctoral candidacy 2028-05-01.');
    assert.doesNotMatch(oce.detail, /one of the conditions for admission/);
  });
  it('after the eighth semester: the DGS confirms the standing', () => {
    const { admission } = rows(ready({ candidacyPassed: '2030-04-01', candidacyAdmitted: '2030-09-15' }), '2030-10-01');
    assert.equal(admission.status, 'needs_dgs_review');
    assert.match(admission.detail, /Completed after the end of Spring 2030 — semester 8 \(approximate\) — you may have been placed on probation \(Academic Code §5\.7\.3\), and admission after the eighth semester risks the loss of Graduate School funding/);
    assert.equal(admission.completedLate, true, 'late only: the eight-year row counts it done');
  });
  it('before the OCE date: the dates are checked with the DGS', () => {
    const { admission } = rows(ready({ candidacyPassed: '2028-04-01', candidacyAdmitted: '2028-03-01' }), '2028-06-01');
    assert.equal(admission.status, 'needs_dgs_review');
    assert.match(admission.detail, /The admission date is before the Oral Candidacy Exam \(OCE\) date \(2028-04-01\)/);
  });
  it('with no OCE date: Met, and the OCE row asks for its date instead of reading Overdue', () => {
    const { oce, admission } = rows(ready({ candidacyAdmitted: '2028-05-01' }), '2030-10-01');
    assert.equal(admission.status, 'met');
    assert.equal(oce.status, 'cannot_evaluate');
    assert.equal(oce.deadline, undefined);
    assert.match(oce.detail, /^Admitted to doctoral candidacy 2028-05-01\. Enter the date you passed the Oral Candidacy Exam \(OCE\) under Milestones — admission to candidacy requires it \(Academic Code §6\.2\.9\)\.$/);
  });
  it('below the 3.0 GPA: the date goes to the DGS (§2.2, as the dated candidacy did since 2026-09-12)', () => {
    const { admission } = rows(ready({ candidacyPassed: '2028-04-01', candidacyAdmitted: '2028-05-01' }, { gpa: 2.8 }), '2028-06-01');
    assert.equal(admission.status, 'needs_dgs_review');
    assert.equal(admission.completedLate, undefined);
    assert.match(admission.detail, /You show a 2\.80 GPA — §2\.2 requires a 3\.0 for admission to candidacy; confirm your admission with the DGS/);
  });
  it('late but complete: the eight-year row still reads Met', () => {
    const s = ready({ candidacyPassed: '2030-04-01', candidacyAdmitted: '2030-09-15', researchQualifierPassed: '2027-11-01', defensePassed: '2031-11-10', dissertationSubmitted: '2031-12-01' }, {
      courses: [...REGULAR.map((id, i) => ndCourse(id, { term: [fall(2026), spring(2027), fall(2027), spring(2028)][Math.floor(i / 2)]! })), ndCourse('CSE 63801', { credits: 1 }), ndCourse('CSE 63802', { credits: 1, term: spring(2027) }), ...[fall(2026), spring(2027), fall(2027), spring(2028)].map((t) => ndCourse('CSE 98900', { credits: 9, term: t, grade: 'S' }))],
    });
    const { report, admission } = rows(s, '2032-01-15');
    assert.equal(admission.status, 'needs_dgs_review');
    const limit = report.requirements.find((r) => r.id === 'phd.timeLimit')!;
    assert.equal(limit.status, 'met', limit.detail);
  });
});

describe('a record whose dissertation milestones are dated but not the admission', () => {
  it('asks for the admission date — no “apply now”, no probation — and the eight-year row cannot judge yet', () => {
    // Every saved record predates the admission field (review of the split, 2026-10-04).
    const s = ready({ candidacyPassed: '2029-04-01', defensePassed: '2031-11-10', dissertationSubmitted: '2031-12-01' });
    const { report, admission } = rows(s, '2035-02-01');
    assert.equal(admission.status, 'cannot_evaluate');
    assert.equal(admission.deadline, undefined);
    assert.match(admission.detail, /^Admission date not entered\. Your dissertation milestones are dated, so enter the date you were admitted to doctoral candidacy under Milestones\.$/);
    const items = actionItems(report);
    assert.ok(!items.student.some((t) => /Apply for admission/.test(t)) && !items.dgs.some((t) => /candidacy-admission/.test(t)), JSON.stringify(items));
    const limit = report.requirements.find((r) => r.id === 'phd.timeLimit')!;
    assert.equal(limit.status, 'cannot_evaluate');
    assert.match(limit.detail, /a value is missing from the rules sheet or from your record, and that row says which/);
  });
});

describe('a late OCE still leaves the application to make (review of the split, 2026-10-04)', () => {
  it('the advisor summary and the processing request agree', () => {
    const s = ready({ candidacyPassed: '2030-09-15' });
    const { report, oce, admission } = rows(s, '2030-10-01');
    assert.equal(oce.status, 'needs_dgs_review');
    assert.equal(admission.status, 'unmet');
    const items = actionItems(report);
    assert.ok(items.student.some((t) => t.startsWith('Apply for admission to doctoral candidacy through the Grad Admin')), JSON.stringify(items.student));
    assert.ok(items.gradAdmin.includes('Submit my Application for Admission to Doctoral Candidacy to the Graduate School (DGS Handbook §3.22.3).'));
    assert.ok(items.dgs.includes('Advise the student on the Graduate School’s consequence for the missed candidacy-admission deadline (DGS Handbook §3.22.3).'), JSON.stringify(items.dgs));
    const { text } = gradAdminRequest(report, s, rules, { todayIso: '2030-10-01', entryTerm: 'Fall 2026', priorStudy: 'None', gpa: 3.6 });
    assert.match(text, /Initiate my Application for Admission to Doctoral Candidacy/);
  });
  it('the emails read in the first person without “admits I” or the page’s Milestones card', () => {
    const opts = (todayIso: string) => ({ todayIso, entryTerm: 'Fall 2026', priorStudy: 'None', gpa: 3.6 });
    const notYet = advisorSummary(rows(ready({}), '2030-10-01').report, opts('2030-10-01'));
    const ready2 = advisorSummary(rows(ready({ candidacyPassed: '2028-04-01' }), '2028-06-01').report, opts('2028-06-01'));
    const late = advisorSummary(rows(ready({ candidacyPassed: '2030-04-01', candidacyAdmitted: '2030-09-15' }), '2030-10-01').report, opts('2030-10-01'));
    for (const t of [notYet.text, ready2.text, late.text]) {
      assert.doesNotMatch(t, /admits I\b|placed I\b|under Milestones/, t);
    }
    assert.match(late.text, /I may have been placed on probation \(Academic Code §5\.7\.3\)/);
  });
});

describe('the eighth semester', () => {
  it('not admitted by then: Overdue, with the Graduate School’s probation', () => {
    const { admission } = rows(ready({ candidacyPassed: '2028-04-01' }), '2030-08-01');
    assert.equal(admission.status, 'unmet');
    assert.equal(admission.deadline?.state, 'overdue');
    assert.match(admission.detail, /the Graduate School may place a student not admitted to doctoral candidacy by the end of the eighth semester on probation \(Academic Code §5\.7\.3\)/);
  });
  it('the Spring 2020 cohort: the ninth semester, with the probation (DGS 2026-10-04: Appendix A.4’s silence about admission is an oversight)', () => {
    const s = ready({ candidacyPassed: '2023-04-20' }, { entryTerm: fall(2019), fullTimeTermOverrides: [fall(2019), spring(2020), fall(2020), spring(2021)], courses: REGULAR.map((id, i) => ndCourse(id, { term: [fall(2019), spring(2020), fall(2020), spring(2021)][Math.floor(i / 2)]! })) });
    const { admission } = rows(s, '2026-10-04');
    assert.equal(admission.status, 'unmet');
    assert.equal(admission.deadline?.label, 'Overdue — the deadline was the end of Fall 2023 — semester 9 (approximate)');
    assert.match(admission.detail, /Overdue — the Graduate School may place a student not admitted to doctoral candidacy by the end of the ninth semester on probation \(Academic Code §5\.7\.3, Appendix A\.4\), and the student risks the loss of Graduate School funding \(DGS Handbook §3\.22\.3\)/);
    // Admitted after the ninth semester: the late note names both.
    const late = rows(ready({ candidacyPassed: '2023-04-20', candidacyAdmitted: '2024-03-01' }, { entryTerm: fall(2019), fullTimeTermOverrides: [fall(2019), spring(2020), fall(2020), spring(2021)], courses: REGULAR.map((id, i) => ndCourse(id, { term: [fall(2019), spring(2020), fall(2020), spring(2021)][Math.floor(i / 2)]! })) }), '2026-10-04').admission;
    assert.equal(late.status, 'needs_dgs_review');
    assert.match(late.detail, /you may have been placed on probation \(Academic Code §5\.7\.3, Appendix A\.4\), and admission after the ninth semester risks the loss of Graduate School funding/);
  });
  it('moves with an approved leave, as the OCE’s does', () => {
    const { oce, admission } = rows(ready({}, { leaveSemesters: 1 }), '2027-01-15');
    assert.equal(admission.deadline?.label, oce.deadline?.label);
    assert.equal(admission.deadline?.label, 'Due by the end of Fall 2030 — semester 9 (approximate)');
  });
});

// One card for the OCE, the RCR training and admission to candidacy (DGS
// 2026-10-04: "These seem to overlap. Can they be merged into one card?").
describe('the merged candidacy card', () => {
  const rulesM = buildRules();
  const reqs = (s: Student, today: string, r = rulesM) => audit(s, r, today).requirements;
  // A student whose OCE coursework is done (DGS 2026-10-05: the 24
  // regular-course credits and the qualifier's course components): eight
  // regular courses, the first three filling the core areas and three
  // specialization groups.
  const s = phdStudent({
    entryTerm: { season: 'fall', year: 2026 },
    // Two semesters: Academic Code §3.8 counts at most 15 graduate credits a semester.
    courses: REGULAR.map((id, i) => ndCourse(id, { term: i < 4 ? { season: 'fall', year: 2026 } : { season: 'spring', year: 2027 } })),
  });

  it('the OCE and RCR rows are kept, unscored and shown inside the admission card', () => {
    const r = reqs(s, '2027-03-01');
    for (const id of ['phd.candidacy', 'phd.rcr']) {
      const row = r.find((x) => x.id === id)!;
      assert.equal(row.mergedInto, 'phd.candidacyAdmission', id);
      assert.equal(row.unscored, true, id);
    }
    const admission = r.find((x) => x.id === 'phd.candidacyAdmission')!;
    assert.match(admission.detail, /Responsible Conduct of Research training: not yet/);
    assert.match(admission.detail, /Complete the Graduate School’s Responsible Conduct of Research and ethics training modules/);
  });

  it('an OCE deadline earlier than the admission’s shows on the OCE line, and an overdue OCE makes the card Overdue', () => {
    const early = buildRules({ parameters: { candidacy_deadline_semester: '6' } });
    const open = reqs(s, '2027-03-01', early).find((x) => x.id === 'phd.candidacyAdmission')!;
    assert.match(open.detail, /Oral Candidacy Exam \(OCE\): not yet — due by the end of Spring 2029 — semester 6 \(approximate\)/);
    const late = reqs(s, '2029-09-01', early).find((x) => x.id === 'phd.candidacyAdmission')!;
    assert.equal(late.status, 'unmet');
    assert.equal(late.deadline!.state, 'overdue');
    assert.match(late.detail, /Oral Candidacy Exam \(OCE\): Overdue — the Graduate School places a student who has not passed the candidacy exam/);
  });

  it('a missing OCE parameter is said on the card, which cannot be evaluated', () => {
    const missing = buildRules({ parameters: { candidacy_deadline_semester: null } });
    const card = reqs(s, '2027-03-01', missing).find((x) => x.id === 'phd.candidacyAdmission')!;
    assert.equal(card.status, 'cannot_evaluate');
    assert.match(card.detail, /Oral Candidacy Exam \(OCE\): .*candidacy_deadline_semester/);
  });

});

// The OCE waits for the coursework (CSE §4.5; DGS 2026-10-05: "both 24 credits
// of regular courses and course components of the qualifier examination are
// needed (either completed or expected to complete in the same semester)").
describe('the OCE and admission wait for the coursework', () => {
  const rulesQ = buildRules();
  const row = (st: Student, id: string, today: string) => audit(st, rulesQ, today).requirements.find((x) => x.id === id)!;
  const fall26 = { season: 'fall' as const, year: 2026 };
  const spring27 = { season: 'spring' as const, year: 2027 };

  it('a first-year student: both Not started, with the eighth-semester deadline still shown', () => {
    const st = phdStudent({ entryTerm: fall26 });
    for (const id of ['phd.candidacy', 'phd.candidacyAdmission']) {
      const r = row(st, id, '2026-10-04');
      assert.equal(r.status, 'unmet', id);
      assert.match(r.detail, /^Not started\./, id);
      assert.ok(r.deadline, id);
    }
  });

  it('the last courses in progress THIS semester: the OCE can be taken — without the research component', () => {
    const st = phdStudent({
      entryTerm: fall26,
      courses: REGULAR.map((id, i) => ndCourse(id, { term: i < 4 ? fall26 : spring27, ...(i < 4 ? {} : { grade: 'IP' as const }) })),
    });
    assert.equal(row(st, 'phd.candidacy', '2027-03-01').status, 'in_progress');
    // …but not while those courses are a semester away.
    assert.equal(row(st, 'phd.candidacy', '2026-11-01').status, 'unmet');
  });

  it('the qualifier’s course components done but the 24 credits short: Not started', () => {
    const st = phdStudent({ entryTerm: fall26, courses: REGULAR.slice(0, 3).map((id) => ndCourse(id, { term: fall26 })) });
    assert.match(row(st, 'phd.candidacy', '2027-03-01').detail, /^Not started\. The Oral Candidacy Exam \(OCE\) can be taken once your coursework is complete or in progress the same semester — the 24 regular-course credits \(transferred regular-course credits count\)/);
  });

  it('transferred regular-course credits count toward the 24', () => {
    const st = phdStudent({
      entryTerm: fall26,
      priorMs: 'completed',
      bachelorsAwarded: { season: 'spring', year: 2022 },
      courses: [...REGULAR.slice(0, 7).map((id, i) => ndCourse(id, { term: i < 4 ? fall26 : spring27 })), transferCourse('CS 50300', 'Operating Systems', { institution: 'Purdue University', degreeLevel: 'masters' })],
    });
    assert.equal(row(st, 'phd.candidacy', '2027-03-01').status, 'in_progress');
    assert.match(row(st, 'phd.candidacyAdmission', '2027-03-01').detail, /Coursework: 24 of 24 regular-course credits complete \(transferred regular-course credits count\)/);
  });

  it('past the eighth semester it still reads Overdue', () => {
    const r = row(phdStudent({ entryTerm: fall26 }), 'phd.candidacy', '2030-09-01');
    assert.equal(r.deadline!.state, 'overdue');
    assert.doesNotMatch(r.detail, /^Not started/);
  });
});
