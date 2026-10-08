// Policy review 2026-10-04 (DGS: "Apply the suggested handling"):
// P2-ac-5b-6.1-11 — Academic Code §6.1.5's timing: the master's examination
//   (for CSE, the project report or the thesis defense) by the end of the term
//   after the coursework; a note on an open route row, no status change.
// P2-ac-5b-6.1-12 — a failed thesis defense: one retake, by the end of the
//   following semester (Academic Code §6.1.5).
// P2-ac-6.2-app-8 — a Ph.D. advisor who is tenured or tenure-track CSE
//   faculty (CSE §2.3; Academic Code §6.2.7), as the student answers it.
// P2-ac-5b-6.1-14 — the thesis topic, proposed with the advisor's approval
//   for the program's (Academic Code §6.1.7): an uncounted step before the
//   defense.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { audit } from '../src/engine/audit.ts';
import type { Milestones, Student } from '../src/engine/types.ts';
import { deadlineText } from '../src/ui/milestone-deadline.ts';
import { validateStudent } from '../src/ui/state.ts';
import { buildRules } from './helpers.ts';
import { ndCourse, phdStudent } from './helpers/student.ts';

const rules = buildRules();
const fall = (year: number) => ({ season: 'fall' as const, year });
const spring = (year: number) => ({ season: 'spring' as const, year });
const REGULAR = ['CSE 60641', 'CSE 60111', 'CSE 60321', 'CSE 60427', 'CSE 60535', 'CSE 60762', 'CSE 60770', 'CSE 60876'];
/** An MSCSE student (Fall 2024) whose 24 regular credits end in Spring 2026. */
const ms = (msOption: Student['msOption'], milestones: Milestones = {}): Student => ({
  schemaVersion: 1,
  program: 'mscse',
  msOption,
  entryTerm: fall(2024),
  priorMs: 'none',
  gpa: 3.5,
  courses: REGULAR.map((id, i) => ndCourse(id, { term: [fall(2024), spring(2025), fall(2025), spring(2026)][Math.floor(i / 2)]! })),
  milestones: { advisorIdentified: '2024-10-01', advisorName: 'Prof. Example', ...milestones },
  attestations: {},
});
const row = (s: Student, id: string, today: string) => audit(s, rules, today).requirements.find((r) => r.id === id)!;

describe('Academic Code §6.1.5: the master’s examination by the end of the term after the coursework', () => {
  it('past that term with neither route dated: a note on the open row, no status change', () => {
    const r = row(ms('project'), 'ms.project.report', '2027-01-15');
    assert.equal(r.status, 'unmet');
    assert.match(r.detail, /Academic Code §6\.1\.5 expects the master’s examination — for CSE, the project report or the thesis defense — by the end of the term after your coursework, here the end of Fall 2026 \(approximate\); confirm your timeline with the ADGS/);
  });
  it('before that term ends, or with a route dated: nothing', () => {
    assert.doesNotMatch(row(ms('project'), 'ms.project.report', '2026-10-04').detail, /§6\.1\.5/);
    assert.doesNotMatch(row(ms('project', { projectReportAccepted: '2026-12-01' }), 'ms.project.report', '2027-01-15').detail, /§6\.1\.5/);
  });
});

describe('a failed thesis defense: one retake, by the end of the following semester (Academic Code §6.1.5)', () => {
  const failed = (extra: Milestones = {}) => ms('thesis', { thesisDefenseFailed: '2026-04-20', ...extra });
  it('inside the window: In progress, with the retake’s deadline', () => {
    const r = row(failed(), 'ms.thesis.defense', '2026-10-04');
    assert.equal(r.status, 'in_progress');
    assert.equal(r.deadline?.label, 'Retake due by the end of Fall 2026 (approximate)');
    assert.match(r.detail, /^Thesis defense failed 2026-04-20 — one retake, if the program recommends it\. Academic Code §6\.1\.5: a failed master’s examination forfeits degree eligibility unless the program recommends a retake; only one retake is allowed, by the end of the following semester — the ADGS decides/);
  });
  it('past the window with no pass: Overdue', () => {
    const r = row(failed(), 'ms.thesis.defense', '2027-02-01');
    assert.equal(r.status, 'unmet');
    assert.equal(r.deadline?.state, 'overdue');
    assert.equal(r.deadline?.label, 'Overdue — the retake was due by the end of Fall 2026 (approximate)');
  });
  it('passed on the retake inside the window: Met, and says so', () => {
    const r = row(failed({ thesisDefensePassed: '2026-11-20' }), 'ms.thesis.defense', '2027-02-01');
    assert.equal(r.status, 'met');
    assert.match(r.detail, /^Thesis defense passed 2026-11-20 — the retake, after a failed attempt on 2026-04-20\./);
  });
  it('passed after the window: the ADGS confirms', () => {
    const r = row(failed({ thesisDefensePassed: '2027-03-01' }), 'ms.thesis.defense', '2027-04-01');
    assert.equal(r.status, 'needs_dgs_review');
    assert.match(r.detail, /The retake was due by the end of Fall 2026 \(approximate\), the end of the semester after the fail \(Academic Code §6\.1\.5\) — confirm with the ADGS/);
  });
  it('the Milestones card dates the retake beside the defense box', () => {
    const d = audit(failed(), rules, '2026-10-04').milestoneDeadlines!;
    assert.equal(deadlineText(d.thesisDefensePassed!), 'Due by the end of Fall 2026 — the retake, if the program recommends one, by the end of the semester after the fail (Academic Code §6.1.5) · due this semester');
    assert.equal(d.thesisDefenseFailed!.state, undefined);
  });
});

describe('a Ph.D. advisor who is tenured or tenure-track CSE faculty (§2.3; Academic Code §6.2.7)', () => {
  const phd = (m: Milestones) => phdStudent({ milestones: { advisorIdentified: '2026-09-10', advisorName: 'Prof. A', ...m } });
  const advisor = (s: Student) => audit(s, rules, '2027-01-15');
  it('“yes”: Met, as before', () => {
    assert.equal(advisor(phd({ advisorTtt: 'yes' })).requirements.find((r) => r.id === 'shared.advisor')!.status, 'met');
  });
  it('not answered: a missing input, asked for', () => {
    const r = advisor(phd({})).requirements.find((x) => x.id === 'shared.advisor')!;
    assert.equal(r.status, 'cannot_evaluate');
    assert.match(r.detail, /Answer under Milestones whether your advisor is tenured or tenure-track CSE faculty — a dissertation director must be \(§2\.3; Academic Code §6\.2\.7\)/);
  });
  it('“no” or “not sure”: Conditionally met, and in the review request', () => {
    const report = advisor(phd({ advisorTtt: 'unsure' }));
    const r = report.requirements.find((x) => x.id === 'shared.advisor')!;
    assert.equal(r.status, 'needs_dgs_review');
    // The two cases, and no exception for a non-tenure-track advisor (P3-cross-doc-2; DGS 2026-10-07, department policy).
    assert.match(r.detail, /an advisor who is not tenured or tenure-track cannot advise alone — a tenured or tenure-track co-advisor is required/);
    assert.doesNotMatch(r.detail, /written approval/);
    assert.ok((report.reviewFlags ?? []).includes('Advisor’s faculty status: Prof. A — not sure whether tenured or tenure-track CSE faculty. A dissertation director must be tenured or tenure-track CSE faculty (§2.3; Academic Code §6.2.7) — an advisor who is tenured or tenure-track in another Notre Dame department needs the DGS’s approval (§2.3); an advisor who is not tenured or tenure-track cannot advise alone — a tenured or tenure-track co-advisor is required (department policy; Academic Code §6.2.7; DGS Handbook §10.3.1).'), JSON.stringify(report.reviewFlags));
  });
  it('two advisors: one “yes” is enough; “no” for both goes to the DGS', () => {
    assert.equal(advisor(phd({ advisorName2: 'Prof. B', advisorTtt: 'no', advisorTtt2: 'yes' })).requirements.find((r) => r.id === 'shared.advisor')!.status, 'met');
    assert.equal(advisor(phd({ advisorName2: 'Prof. B', advisorTtt: 'no', advisorTtt2: 'no' })).requirements.find((r) => r.id === 'shared.advisor')!.status, 'needs_dgs_review');
  });
  it('the MSCSE is not asked', () => {
    const r = audit(ms('project'), rules, '2026-10-04').requirements.find((x) => x.id === 'shared.advisor')!;
    assert.equal(r.status, 'met');
  });
  it('a saved file keeps only the three answers', () => {
    assert.deepEqual(validateStudent({ ...phd({}), milestones: { advisorName: 'Prof. A', advisorTtt: 'maybe', advisorTtt2: 'no' } }, []).milestones, { advisorName: 'Prof. A', advisorTtt2: 'no' });
  });
});

describe('the thesis topic, approved before the defense (Academic Code §6.1.7)', () => {
  const report = (s: Student, today = '2026-10-04') => audit(s, rules, today);
  const topicRow = (s: Student, today?: string) => report(s, today).requirements.find((r) => r.id === 'ms.thesis.topic');
  it('the thesis route shows it, “Not started” until dated, and it is not counted', () => {
    const r = topicRow(ms('thesis'))!;
    assert.equal(r.status, 'unmet');
    assert.equal(r.unscored, true);
    assert.match(r.detail, /^Not started\. With your advisor’s approval you propose a thesis topic for the program’s approval \(§3\.4; Academic Code §6\.1\.7\)/);
    const withTopic = report(ms('thesis', { thesisTopicApproved: '2026-02-15' }));
    assert.equal(withTopic.requirements.find((x) => x.id === 'ms.thesis.topic')!.detail, 'Thesis topic approved 2026-02-15.');
    assert.equal(withTopic.summary.scored, report(ms('thesis')).summary.scored, 'the headline does not count it');
  });
  it('a passed defense means the topic came before it', () => {
    const r = topicRow(ms('thesis', { thesisDefensePassed: '2026-11-20' }), '2027-01-15')!;
    assert.equal(r.status, 'met');
    assert.equal(r.detail, 'Approved before the thesis defense (passed 2026-11-20).');
  });
  it('the project route does not show it; an approved topic marks the thesis route when none is chosen', () => {
    assert.equal(topicRow(ms('project')), undefined);
    assert.equal(topicRow(ms('undecided')), undefined);
    assert.ok(topicRow(ms('undecided', { thesisTopicApproved: '2026-02-15' })), 'the topic date is evidence of the thesis route');
  });
});

describe('the topic’s sections name their documents', () => {
  it('“§3.4” is the CSE handbook’s next to the Academic Code’s §6.1.7', async () => {
    const { labelCitations } = await import('../src/ui/citations.ts');
    const r = audit(ms('thesis'), rules, '2026-10-04').requirements.find((x) => x.id === 'ms.thesis.topic')!;
    assert.match(labelCitations(r.detail), /\(CSE §3\.4; Academic Code §6\.1\.7\)/);
  });
});

// The MSCSE thesis advisor's faculty status (policy review 2026-10-04,
// P2-dh-10-5; DGS: "Apply suggested handling"): CSE §2.3 and the Graduate
// School's thesis-adviser criteria (DGS Handbook §10.3.2, §10.3.8). Asked on
// the thesis option only — the project option is the handbook's to settle.
describe('MSCSE thesis advisor: tenured or tenure-track (CSE §2.3; DGS Handbook §10.3.2, §10.3.8)', () => {
  const today = '2026-03-01';
  it('the thesis option asks: unanswered cannot be evaluated, yes is met', () => {
    assert.equal(row(ms('thesis'), 'shared.advisor', today).status, 'cannot_evaluate');
    assert.match(row(ms('thesis'), 'shared.advisor', today).detail, /Answer under Milestones whether your thesis advisor is tenured or tenure-track CSE faculty/);
    assert.equal(row(ms('thesis', { advisorTtt: 'yes' }), 'shared.advisor', today).status, 'met');
  });

  it('“no” or “not sure” for every advisor goes to the ADGS; a TTT co-advisor settles it', () => {
    for (const answer of ['no', 'unsure'] as const) {
      const report = audit(ms('thesis', { advisorTtt: answer }), rules, today);
      const advisor = report.requirements.find((r) => r.id === 'shared.advisor')!;
      assert.equal(advisor.status, 'needs_dgs_review');
      assert.match(advisor.detail, /tenured or tenure-track in another Notre Dame department needs the ADGS’s approval \(§2\.3\); an advisor who is not tenured or tenure-track cannot advise alone — a tenured or tenure-track co-advisor is required \(department policy; DGS Handbook §10\.3\.2\)/);
      assert.ok((report.reviewFlags ?? []).some((f) => /^Thesis advisor’s faculty status: Prof\. Example — not (sure whether )?tenured or tenure-track CSE faculty/.test(f) && /cannot advise alone/.test(f)));
    }
    assert.equal(row(ms('thesis', { advisorTtt: 'no', advisorName2: 'Prof. Co', advisorTtt2: 'yes' }), 'shared.advisor', today).status, 'met');
  });

  it('the project option and an undecided student are not asked', () => {
    for (const option of ['project', 'undecided'] as const) {
      const report = audit(ms(option, { advisorTtt: 'no' }), rules, today);
      assert.equal(report.requirements.find((r) => r.id === 'shared.advisor')!.status, 'met');
      assert.ok(!(report.reviewFlags ?? []).some((f) => /faculty status/.test(f)));
    }
  });
});
