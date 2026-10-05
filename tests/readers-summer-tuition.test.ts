// Policy review 2026-10-04 (DGS: "Apply suggested handling"):
// P2-dh-10-19 — the MSCSE thesis readers: tenured or tenure-track CSE faculty,
//   neither of them the advisor (CSE §3.4), an outside reader with the
//   Graduate School's prior approval (DGS Handbook §10.3.8) — one question;
//   "no" or "not sure" goes to the ADGS.
// P2-dh-3.14-3.20-23 — a Ph.D. student without an advisor may be dismissed
//   (CSE §2.3; DGS Handbook §3.17): a note on the unmet advisor row.
// P2-dh-4-5-4 — Graduate School tuition scholarships run through the 8th
//   (doctoral) or 5th (master's) year (DGS Handbook §4.2.6): a note on the
//   time-limit row once the limit is near or past.
// P2-dh-3.21-3.24-3 — a master's student attending summer session only has
//   seven years (Academic Code §6.1.4): when every Notre Dame term on the
//   record is a summer session, the five-year row goes to the ADGS instead of
//   reading Overdue while the seven years run.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { audit } from '../src/engine/audit.ts';
import type { Milestones, Student, Term } from '../src/engine/types.ts';
import { deadlineText } from '../src/ui/milestone-deadline.ts';
import { validateStudent } from '../src/ui/state.ts';
import { buildRules } from './helpers.ts';
import { ndCourse, phdStudent } from './helpers/student.ts';

const rules = buildRules();
const fall = (year: number): Term => ({ season: 'fall', year });
const spring = (year: number): Term => ({ season: 'spring', year });
const summer = (year: number): Term => ({ season: 'summer', year });
const REGULAR = ['CSE 60641', 'CSE 60111', 'CSE 60321', 'CSE 60427', 'CSE 60535', 'CSE 60762', 'CSE 60770', 'CSE 60876'];
/** An MSCSE student (Fall 2024) whose 24 regular credits end in Spring 2026. */
const ms = (msOption: Student['msOption'], milestones: Milestones = {}, terms: Term[] = [fall(2024), spring(2025), fall(2025), spring(2026)]): Student => ({
  schemaVersion: 1,
  program: 'mscse',
  msOption,
  entryTerm: fall(2024),
  priorMs: 'none',
  gpa: 3.5,
  courses: REGULAR.map((id, i) => ndCourse(id, { term: terms[Math.floor((i * terms.length) / REGULAR.length)]! })),
  milestones: { advisorIdentified: '2024-10-01', advisorName: 'Prof. Example', ...milestones },
  attestations: {},
});
const row = (s: Student, id: string, today: string) => audit(s, rules, today).requirements.find((r) => r.id === id)!;
const flags = (s: Student, today: string) => audit(s, rules, today).reviewFlags ?? [];

describe('MSCSE thesis readers: tenured or tenure-track CSE faculty, neither the advisor (§3.4; DGS Handbook §10.3.8)', () => {
  it('“No” before the defense: the row stays In progress with the rule, and the review request asks the ADGS', () => {
    const s = ms('thesis', { thesisReadersTtt: 'no' });
    const r = row(s, 'ms.thesis.defense', '2026-10-04');
    assert.equal(r.status, 'unmet'); // never "Conditionally met" for a defense not yet held
    assert.match(r.detail, /^Not yet passed\./);
    assert.match(r.detail, /Thesis readers come from the department’s tenured and tenure-track faculty, and your advisor may not be one of the two \(§3\.4\): a non-TTT CSE reader or one from outside the department needs prior approval — you and your advisor send the ADGS a written request — and a reader from outside the program needs the Graduate School’s prior approval too \(DGS Handbook §10\.3\.8\) — this is in the review request; ask the ADGS/);
    const f = flags(s, '2026-10-04').find((x) => x.startsWith('Thesis readers:'));
    assert.ok(f);
    assert.match(f!, /^Thesis readers: not both tenured or tenure-track CSE faculty, or one of them is my advisor\. Thesis readers come from the department’s tenured and tenure-track faculty, and the advisor may not be one of the two \(§3\.4\): a non-TTT CSE reader or one from outside the department needs prior approval — the advisor and the student send the ADGS a written request/);
  });
  it('“Not sure” after the defense: Met becomes Conditionally met (needs_dgs_review)', () => {
    const s = ms('thesis', { thesisReadersTtt: 'unsure', thesisDefensePassed: '2026-11-20' });
    assert.equal(row(s, 'ms.thesis.defense', '2026-12-01').status, 'needs_dgs_review');
    assert.ok(flags(s, '2026-12-01').some((x) => x.startsWith('Thesis readers: I am not sure whether both are tenured or tenure-track CSE faculty and neither is my advisor.')));
  });
  it('“Yes”: the defense row is unchanged, and nothing goes to the ADGS', () => {
    const s = ms('thesis', { thesisReadersTtt: 'yes', thesisDefensePassed: '2026-11-20' });
    assert.equal(row(s, 'ms.thesis.defense', '2026-12-01').status, 'met');
    assert.ok(!flags(s, '2026-12-01').some((x) => x.startsWith('Thesis readers:')));
  });
  it('unanswered: no status change; pointed to while the defense is not yet dated', () => {
    const open = row(ms('thesis'), 'ms.thesis.defense', '2026-10-04');
    assert.equal(open.status, 'unmet');
    assert.match(open.detail, /Once your two readers are nominated, answer under Milestones whether both are tenured or tenure-track CSE faculty and neither is your advisor \(§3\.4\)/);
    const done = row(ms('thesis', { thesisDefensePassed: '2026-11-20' }), 'ms.thesis.defense', '2026-12-01');
    assert.equal(done.status, 'met');
    assert.doesNotMatch(done.detail, /readers/);
  });
  it('off the thesis route, a stored answer does nothing', () => {
    for (const option of ['project', 'undecided'] as const) {
      const s = ms(option, { thesisReadersTtt: 'no' });
      assert.ok(!flags(s, '2026-10-04').some((x) => x.startsWith('Thesis readers:')), option);
      const thesisRow = audit(s, rules, '2026-10-04').requirements.find((r) => r.id === 'ms.thesis.defense');
      if (thesisRow) assert.notEqual(thesisRow.status, 'needs_dgs_review', option);
    }
  });
  it('a missed retake still reads Overdue, with the readers’ sentence beside it', () => {
    const r = row(ms('thesis', { thesisReadersTtt: 'no', thesisDefenseFailed: '2026-04-20' }), 'ms.thesis.defense', '2027-02-01');
    assert.equal(r.status, 'unmet');
    assert.equal(r.deadline?.state, 'overdue');
    assert.match(r.detail, /Thesis readers come from/);
  });
  it('a saved file keeps one of the three answers and drops anything else', () => {
    const base = ms('thesis');
    assert.equal(validateStudent({ ...base, milestones: { thesisReadersTtt: 'unsure' } }, []).milestones.thesisReadersTtt, 'unsure');
    assert.equal(validateStudent({ ...base, milestones: { thesisReadersTtt: 'maybe' } }, []).milestones.thesisReadersTtt, undefined);
  });
});

describe('a Ph.D. student without an advisor may be dismissed (§2.3; DGS Handbook §3.17)', () => {
  it('the unmet Ph.D. advisor row says so behind Details', () => {
    const r = row(phdStudent(), 'shared.advisor', '2026-10-04');
    assert.equal(r.status, 'unmet');
    assert.ok(r.detailParts?.some((p) => typeof p === 'object' && 'note' in p && /may be subject to dismissal from the program \(§2\.3; DGS Handbook §3\.17\) — report any disruption to the DGS at once$/.test(p.note)));
  });
  it('the MSCSE advisor row is unchanged', () => {
    const r = row({ ...ms('project'), milestones: {} }, 'shared.advisor', '2026-10-04');
    assert.doesNotMatch(r.detail, /dismissal/);
  });
});

describe('Graduate School tuition scholarships through the 8th / 5th year (DGS Handbook §4.2.6)', () => {
  it('a Ph.D. past the eight years: the time-limit row says the tuition scholarships ended', () => {
    const r = row(phdStudent({ entryTerm: fall(2017), gpa: 3.5 }), 'phd.timeLimit', '2026-10-04');
    assert.equal(r.status, 'unmet');
    assert.match(r.detail, /Doctoral students in good standing are eligible for Graduate School tuition scholarships through the 8th year \(DGS Handbook §4\.2\.6\)/);
  });
  it('an MSCSE student in the last semester before the five years: said', () => {
    const r = row({ ...ms('project', {}, [fall(2021), spring(2022)]), entryTerm: fall(2021) }, 'ms.timeLimit', '2026-03-01');
    assert.equal(r.deadline?.state, 'due_soon');
    assert.match(r.detail, /Master’s students in good standing are eligible for Graduate School tuition scholarships through the 5th year \(DGS Handbook §4\.2\.6\)/);
  });
  it('far from the limit: not said', () => {
    assert.doesNotMatch(row(ms('project'), 'ms.timeLimit', '2025-01-15').detail, /tuition/);
  });
});

describe('summer session only: seven years for the DGS to confirm (Academic Code §6.1.4)', () => {
  // Every Notre Dame course in a summer session, entered for Fall 2021.
  const summerOnly = (milestones: Milestones = {}) => ({ ...ms('project', milestones, [summer(2022), summer(2023), summer(2024), summer(2025)]), entryTerm: fall(2021) });
  it('past the five years, inside the seven: In progress against the seven, not Overdue, and the review request asks', () => {
    const r = row(summerOnly(), 'ms.timeLimit', '2026-10-02');
    assert.equal(r.status, 'in_progress'); // not "Conditionally met": nothing is complete
    assert.notEqual(r.deadline?.state, 'overdue');
    assert.equal(r.deadline?.label, 'Due before Fall 2028 if the 7-year limit applies (approximate)');
    assert.match(r.detail, /^The 5-year limit passed at the start of Fall 2026 \(approximate\)\. Every Notre Dame term on your record is a summer session: a student attending summer session only has seven years \(Academic Code §6\.1\.4\), until the start of Fall 2028 \(approximate\) — whether it applies to you is for the ADGS to confirm\./);
    assert.ok(flags(summerOnly(), '2026-10-02').some((x) => x === 'Time limit: every Notre Dame term on my record is a summer session. The 5 years of §3.3 passed at the start of Fall 2026 (approximate); a student attending summer session only has seven years (Academic Code §6.1.4), until the start of Fall 2028 — please confirm whether they apply to me.'));
  });
  it('past the seven years too: Overdue, as before, and saying so', () => {
    const r = row(summerOnly(), 'ms.timeLimit', '2028-09-01');
    assert.equal(r.status, 'unmet');
    assert.equal(r.deadline?.state, 'overdue');
    assert.match(r.detail, /and that limit passed at the start of Fall 2028 too \(approximate\)/);
    assert.ok(!flags(summerOnly(), '2028-09-01').some((x) => x.startsWith('Time limit:')));
  });
  it('before the five years: In progress on the five, with the seven named', () => {
    const r = row(summerOnly(), 'ms.timeLimit', '2025-10-02');
    assert.equal(r.status, 'in_progress');
    assert.match(r.deadline!.label, /^Due before Fall 2026/);
    assert.match(r.detail, /a student attending summer session only has seven years \(Academic Code §6\.1\.4\)/);
  });
  it('one academic-year course on the record: the five years, Overdue as before', () => {
    const s = summerOnly();
    s.courses = [...s.courses, ndCourse('CSE 60001', { term: fall(2022) })];
    const r = row(s, 'ms.timeLimit', '2026-10-02');
    assert.equal(r.status, 'unmet');
    assert.doesNotMatch(r.detail, /summer session/);
  });
  it('a project report dated after the five years names the seven too', () => {
    const r = row(summerOnly({ projectReportAccepted: '2027-05-01' }), 'ms.project.report', '2027-06-01');
    assert.equal(r.statusLabel, 'Eligibility at risk');
    assert.equal(r.status, 'needs_dgs_review');
    assert.match(r.detail, /unless the Graduate School granted an extension or the seven years of a student attending summer session only apply to you \(Academic Code §6\.1\.4\), so confirm it with the ADGS/);
  });
  it('the Milestones card: the seven beside the five while open, the seven once the five have passed', () => {
    const before = audit(summerOnly(), rules, '2025-10-02').milestoneDeadlines!;
    assert.equal(deadlineText(before.projectReportAccepted!), 'Due before Fall 2026 — the 5-year limit (§3.3); or before Fall 2028 if you attend summer sessions only — seven years (Academic Code §6.1.4), as the ADGS confirms');
    const after = audit(summerOnly(), rules, '2026-10-02').milestoneDeadlines!;
    assert.equal(deadlineText(after.projectReportAccepted!), 'Due before Fall 2028 — seven years if you attend summer sessions only, as the ADGS confirms (Academic Code §6.1.4)');
  });
});

// University funding and the eight-year row (policy review 2026-10-04,
// P2-dh-4-5-1; DGS: apply the suggested handling — "whether the MSCSE years
// count is not the DGS's call. It's the graduate school's call"). DGS
// Handbook §4.1: good standing includes "graduate enrollment at Notre Dame
// fewer than eight years". Notes only; no status changes.
describe('funding notes on the Ph.D. eight-year row (DGS Handbook §4.1)', () => {
  const rulesF = buildRules();
  const timeRow = (s: Student, today: string) => audit(s, rulesF, today).requirements.find((r) => r.id === 'phd.timeLimit')!;
  const FUNDING = /The Graduate School also ties University funding to academic good standing, which includes graduate enrollment at Notre Dame of fewer than eight years \(DGS Handbook §4\.1\)/;
  const MS_YEARS = /the years of your Notre Dame MSCSE may count toward the eight; whether they do is the Graduate School’s call/;

  it('said once the limit is past, not years before it', () => {
    const s = phdStudent({ entryTerm: { season: 'fall', year: 2020 } }); // limit: Fall 2028 (a later cohort than Appendix A's)
    assert.match(timeRow(s, '2029-03-01').detail, FUNDING);
    assert.ok(['unmet', 'cannot_evaluate'].includes(timeRow(s, '2029-03-01').status)); // a note: the status is the row's own
    assert.doesNotMatch(timeRow(phdStudent(), '2027-03-01').detail, FUNDING);
  });

  it('a Ph.D. student who holds a Notre Dame MSCSE is told the Graduate School decides whether those years count', () => {
    const r = timeRow(phdStudent({ ndMasters: { term: { season: 'spring', year: 2026 } } }), '2027-03-01');
    assert.match(r.detail, MS_YEARS);
    assert.equal(r.status, 'in_progress');
    assert.doesNotMatch(timeRow(phdStudent(), '2027-03-01').detail, MS_YEARS);
  });
});
