// The "Next steps" block under the dial (DGS 2026-09-27, clarity proposal 1):
// the coursework sentence read off the course lines, the record-level steps
// each shown only when it applies, and the nearest deadline for the empty
// state. Minimal hand-built reports; no DOM.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { audit } from '../src/engine/audit.ts';
import type { AuditReport, CourseLine, RequirementResult, Student } from '../src/engine/types.ts';
import { courseworkSentence, nearestDeadline, nextSteps } from '../src/ui/next-steps.ts';
import { buildRules } from './helpers.ts';
import { ndCourse, phdStudent } from './helpers/student.ts';

const line = (courseId: string, mark: CourseLine['mark'], text: string): CourseLine => ({ courseId, term: { season: 'fall', year: 2026 }, text, mark, counts: [] });
const row = (id: string, status: RequirementResult['status'], extra: Partial<RequirementResult> = {}): RequirementResult =>
  ({ id, group: 'g', title: id, status, detail: '', citation: { section: '§', quote: '' }, ...extra }) as RequirementResult;
const report = (requirements: RequirementResult[], courseLines: CourseLine[] = []): AuditReport =>
  ({ program: 'phd', requirements, courseLines, summary: { met: 0, conditional: 0, scored: 0 }, warnings: [], tracks: [], reviewFlags: [] }) as unknown as AuditReport;

// An answered earlier-degrees question (2026-10-08): unanswered, Next steps
// leads with asking it (the test at the end of this file).
const ANSWERED: Student['background'] = { bachelors: 'elsewhere', graduate: 'none' };

describe('next steps (DGS 2026-09-27)', () => {
  it('the coursework sentence counts the marks and quotes a refused line’s own reason', () => {
    const r = report([], [
      line('CSE 60641', 'counts', 'counts toward regular courses (3 cr)'),
      line('CSE 60876', 'in_progress', 'in progress — will count toward regular courses (3 cr) when passed'),
      line('MATH 60610', 'pending', 'waiting for the DGS — would count toward regular courses (3 cr) once approved'),
      line('CS 50300', 'excluded', 'not counted — taken before your bachelor’s degree was awarded (Spring 2021), so not as a graduate student (§5.2); may still satisfy the Operating Systems core-knowledge requirement (§4.4.1) after DGS review'),
    ]);
    assert.equal(
      courseworkSentence(r),
      'Your coursework: 1 course counts now, 1 is in progress, 1 is waiting for the DGS (MATH 60610), 1 does not count (CS 50300 — taken before your bachelor’s degree was awarded (Spring 2021), so not as a graduate student (§5.2)).',
    );
    assert.equal(courseworkSentence(report([])), undefined);
  });
  it('each step appears only when it applies, in the order a student takes them', () => {
    const s: Student = { ...phdStudent(), background: ANSWERED, courses: [{ courseId: 'CSE 60641', credits: 3, term: { season: 'fall', year: 2026 }, grade: 'A', origin: 'nd' }] };
    s.entryTermInferred = { how: 'the admit-term line on your transcript' };
    s.bachelorsAwarded = { season: 'spring', year: 2021 };
    s.bachelorsAwardedInferred = { how: 'the Bachelor of Science awarded 2021-05-16' };
    const r = report([row('shared.advisor', 'unmet'), row('shared.approvals', 'needs_dgs_review')]);
    const steps = nextSteps({ report: r, student: s, review: { unlisted: 1, caseByCase: 1 }, processingCount: 0 });
    assert.deepEqual(steps.map((x) => x.text), [
      'Check what your transcript set — first semester Fall 2026, bachelor’s degree Spring 2021 (Your standing).',
      'Send the review request: 1 course is not in the course rules yet, and 1 needs the DGS’s approval for you.',
      'Enter your advisor’s name under Milestones.',
      'Confirm your advisor approved your plan of study and tick the box under Approvals.',
      'When the DGS answers, come back to this page — it reads the latest course rules — and tick the box next to each course approved for you; then send the processing request, and the Grad Admin records it.',
      'Send the summary to your advisor whenever you like.',
    ]);
    assert.deepEqual(steps.map((x) => x.href), ['#standing', '#dgs-review', '#milestones', '#milestones', '#grad-admin', undefined]);
    // The rows a step covers leave the attention list (no double listing).
    assert.deepEqual(steps[1]?.covers, ['phd.transfer', 'ms.transfer', 'shared.approvals']);
    assert.deepEqual(steps[2]?.covers, ['shared.advisor']);
  });
  it('a settled record has only the advisor summary left; an empty record has nothing', () => {
    const s: Student = { ...phdStudent(), background: ANSWERED, courses: [{ courseId: 'CSE 60641', credits: 3, term: { season: 'fall', year: 2026 }, grade: 'A', origin: 'nd' }] };
    s.attestations.advisorApprovedPlan = true;
    const r = report([row('shared.advisor', 'met'), row('shared.approvals', 'not_applicable')]);
    assert.deepEqual(nextSteps({ report: r, student: s, review: { unlisted: 0, caseByCase: 0 }, processingCount: 0 }).map((x) => x.text), ['Send the summary to your advisor whenever you like.']);
    assert.deepEqual(nextSteps({ report: r, student: s, review: { unlisted: 0, caseByCase: 0 }, processingCount: 2 }).map((x) => x.text), ['Send the processing request (2 items) — the Grad Admin records it.', 'Send the summary to your advisor whenever you like.']);
    assert.deepEqual(nextSteps({ report: report([row('shared.advisor', 'met')]), student: { ...phdStudent(), background: ANSWERED }, review: { unlisted: 0, caseByCase: 0 }, processingCount: 0 }), []);
  });
  it('the nearest deadline still ahead names the row and its chip', () => {
    const r = report([
      row('phd.candidacy', 'in_progress', { shortTitle: 'OCE', deadline: { date: '2030-05-31', approx: true, state: 'upcoming', label: 'Due by the end of Spring 2030 — semester 8 (approximate)' } }),
      row('phd.qualifier', 'in_progress', { deadline: { date: '2028-05-31', approx: true, state: 'upcoming', label: 'Due by the end of Spring 2028 (approximate)' } }),
      row('phd.timeLimit', 'met', { deadline: { date: '2027-01-01', approx: true, state: 'done', label: 'Complete' } }),
    ]);
    assert.equal(nearestDeadline(r), 'phd.qualifier: Due by the end of Spring 2028 (approximate)');
    assert.equal(nearestDeadline(report([])), undefined);
  });
});

// The advisor step follows the advisor card (policy review round 3,
// P3-cse-1-2-2; DGS 2026-10-06: "Apply the suggested handling"). Since
// 2026-10-04 the card is also not met with a name on file — the faculty-status
// question unanswered, or answered No or Not sure — and the step still said
// "Enter your advisor’s name". The review-request step now also counts the
// request's non-course items, and says the advisor's when the DGS must
// approve it; neither triggers the "tick the box next to each course" step.
describe('the advisor step and the review request’s other items (P3-cse-1-2-2)', () => {
  const withCourse = (): Student => ({ ...phdStudent(), background: ANSWERED, courses: [{ courseId: 'CSE 60641', credits: 3, term: { season: 'fall', year: 2026 }, grade: 'A', origin: 'nd' }], attestations: { advisorApprovedPlan: true } });
  const steps = (r: AuditReport, review = { unlisted: 0, caseByCase: 0 }) => nextSteps({ report: r, student: withCourse(), review, processingCount: 0 });
  const FLAG = 'Advisor’s faculty status: Prof. Example — not sure whether tenured or tenure-track CSE faculty. A dissertation director must be tenured or tenure-track CSE faculty (§2.3; Academic Code §6.2.7) — an advisor who is tenured or tenure-track in another Notre Dame department needs the DGS’s approval (§2.3); an advisor who is not tenured or tenure-track cannot advise alone — a tenured or tenure-track co-advisor is required (department policy; Academic Code §6.2.7; DGS Handbook §10.3.1).';
  const withFlags = (rows: RequirementResult[], flags: string[]) => ({ ...report(rows), reviewFlags: flags }) as AuditReport;

  it('(b) a name on file, faculty status unanswered: answer it — not “enter the name”', () => {
    const st = steps(report([row('shared.advisor', 'cannot_evaluate')]));
    assert.deepEqual(st.map((x) => x.text), ['Answer under Milestones whether your advisor is tenured or tenure-track CSE faculty (§2.3).', 'Send the summary to your advisor whenever you like.']);
    assert.deepEqual(st[0]?.covers, ['shared.advisor']);
    assert.equal(st[0]?.href, '#milestones');
  });
  it('(c) No or Not sure: the review request, which carries it; no “tick the box next to each course”', () => {
    const st = steps(withFlags([row('shared.advisor', 'needs_dgs_review')], [FLAG]));
    assert.deepEqual(st.map((x) => x.text), ['Send the review request — your advisor’s faculty status needs the DGS’s approval (§2.3).', 'Send the summary to your advisor whenever you like.']);
    assert.deepEqual(st[0]?.covers, ['shared.advisor']);
    assert.equal(st[0]?.href, '#dgs-review');
  });
  it('one review-request step for courses, the advisor and other items, counted as items', () => {
    const r = withFlags([row('shared.advisor', 'needs_dgs_review'), row('shared.approvals', 'needs_dgs_review')], [FLAG, 'Readmission: I was readmitted in Fall 2024 …']);
    const st = steps(r, { unlisted: 1, caseByCase: 0 });
    assert.equal(st[0]?.text, 'Send the review request: 1 course is not in the course rules yet, your advisor’s faculty status needs the DGS’s approval (§2.3), and 1 other item needs the DGS’s decision.');
    assert.deepEqual(st[0]?.covers, ['phd.transfer', 'ms.transfer', 'shared.approvals', 'shared.advisor']);
    assert.equal(st.filter((x) => x.text.startsWith('Send the review request')).length, 1, 'said once');
  });
  it('other items alone: counted, with no course step after them', () => {
    const st = steps(withFlags([row('shared.advisor', 'met')], ['Readmission: …', 'Time limit: …']));
    assert.deepEqual(st.map((x) => x.text), ['Send the review request: 2 items need the DGS’s decision.', 'Send the summary to your advisor whenever you like.']);
    assert.equal(st[0]?.covers, undefined, 'no course rows to cover');
  });
  // P3-emails-4 (3) (DGS 2026-10-07: option (a)): the page lists the step the advisor email's to-do carries.
  it('the MSCSE thesis topic not yet approved: a step to propose it; approved, none', () => {
    const r = { ...report([row('shared.advisor', 'met'), row('ms.thesis.topic', 'unmet')]), program: 'mscse' } as AuditReport;
    const st = steps(r);
    const topic = st.find((x) => /thesis topic/.test(x.text));
    assert.equal(topic?.text, 'Propose your thesis topic, with your advisor’s approval, for the program’s approval (Academic Code §6.1.7).');
    assert.deepEqual(topic?.covers, ['ms.thesis.topic']);
    assert.equal(steps({ ...report([row('shared.advisor', 'met'), row('ms.thesis.topic', 'met')]), program: 'mscse' } as AuditReport).some((x) => /thesis topic/.test(x.text)), false);
  });
  it('the MSCSE thesis option says “thesis advisor”', () => {
    const r = { ...report([row('shared.advisor', 'cannot_evaluate')]), program: 'mscse' } as AuditReport;
    assert.equal(steps(r)[0]?.text, 'Answer under Milestones whether your thesis advisor is tenured or tenure-track CSE faculty (§2.3).');
  });
  it('from the engine: a saved record with a name and no answer; then “Not sure”', () => {
    const rules = buildRules();
    const s = (advisorTtt?: 'yes' | 'no' | 'unsure'): Student => ({
      ...phdStudent({ background: ANSWERED, entryTerm: { season: 'fall', year: 2025 }, gpa: 3.5, courses: [ndCourse('CSE 60641', { term: { season: 'fall', year: 2025 } })] }),
      milestones: { advisorIdentified: '2025-10-01', advisorName: 'Prof. Example', ...(advisorTtt ? { advisorTtt } : {}) },
      attestations: { advisorApprovedPlan: true },
    });
    const run = (st: Student) => nextSteps({ report: audit(st, rules, '2026-10-06'), student: st, review: { unlisted: 0, caseByCase: 0 }, processingCount: 0 }).map((x) => x.text);
    assert.ok(run(s()).includes('Answer under Milestones whether your advisor is tenured or tenure-track CSE faculty (§2.3).'));
    assert.ok(!run(s()).some((t) => t.startsWith('Enter your advisor’s name')));
    const unsure = run(s('unsure'));
    assert.equal(unsure[0], 'Send the review request — your advisor’s faculty status needs the DGS’s approval (§2.3).', JSON.stringify(unsure));
    assert.ok(!unsure.some((t) => /tick the box next to each course/.test(t)));
    assert.ok(!run(s('yes')).some((t) => /advisor’s (name|faculty status)|tenured or tenure-track/.test(t)), 'a Yes leaves nothing to do');
  });
});

// The earlier-degrees questions moved from the opening dialog to the page (DGS
// 2026-10-08, Option 1): unanswered, Next steps asks for them.
describe('the earlier-degrees questions, asked on the page (2026-10-08)', () => {
  it('unanswered: a step pointing at the Transcripts card; answered: none', () => {
    const r = report([row('shared.advisor', 'met')]);
    const steps = nextSteps({ report: r, student: phdStudent(), review: { unlisted: 0, caseByCase: 0 }, processingCount: 0 });
    assert.deepEqual(steps[0], { text: 'Answer the questions about your earlier degrees in the Transcripts card — they decide which earlier transcripts to add and how §5.2 applies to them.', href: '#earlier-degrees' });
    assert.equal(nextSteps({ report: r, student: { ...phdStudent(), background: ANSWERED }, review: { unlisted: 0, caseByCase: 0 }, processingCount: 0 }).length, 0);
  });
});

describe('UI review (2026-10-08): what waits for the student, and what waits for the earlier degrees', () => {
  it('a course waiting on the student’s answer “needs your answer”, with a step', () => {
    const r = report([], [
      line('CSE 60111', 'pending', 'not counted yet — say which degrees this course has already counted toward, next to the course'),
      line('CSE 60999', 'pending', 'waiting for the DGS — would count toward regular courses (3 cr) once approved'),
    ]);
    assert.equal(courseworkSentence(r, ['CSE 60111']), 'Your coursework: 1 needs your answer (CSE 60111), 1 is waiting for the DGS (CSE 60999).');
    const s: Student = { ...phdStudent(), background: ANSWERED, courses: [{ courseId: 'CSE 60111', credits: 3, term: { season: 'fall', year: 2024 }, grade: 'A', origin: 'nd' }] };
    const steps = nextSteps({ report: r, student: s, review: { unlisted: 0, caseByCase: 0 }, processingCount: 0, needsAnswer: ['CSE 60111', 'CSE 60321'] });
    assert.ok(steps.some((x) => x.text === 'Say which degrees CSE 60111 and CSE 60321 already counted toward — next to each course under Coursework; if you are not sure, ask the DGS.' && x.href === '#coursework'));
  });
  it('before the earlier degrees are answered, a review of earlier coursework only waits — and so does “When the DGS answers”', () => {
    const s: Student = { ...phdStudent(), courses: [{ courseId: 'CS 50300', credits: 3, term: { season: 'fall', year: 2022 }, grade: 'A', origin: 'transfer', institution: 'Purdue University', degreeLevel: 'masters' }] };
    const r = report([row('shared.approvals', 'needs_dgs_review'), row('phd.transfer', 'needs_dgs_review')]);
    const steps = nextSteps({ report: r, student: s, review: { unlisted: 1, caseByCase: 0, earlierOnly: true }, processingCount: 0 });
    assert.ok(steps[0]?.text.startsWith('Answer the questions about your earlier degrees'));
    assert.ok(!steps.some((x) => /review request|When the DGS answers/.test(x.text)), JSON.stringify(steps.map((x) => x.text)));
    assert.deepEqual(steps[0]?.covers, ['shared.approvals', 'phd.transfer', 'ms.transfer']);
  });
  it('a Ph.D. student who finished the Notre Dame MSCSE is told to set the Ph.D. start', () => {
    const s: Student = { ...phdStudent(), background: { bachelors: 'nd-cse', ndIntegrated: true, graduate: 'nd-4plus1', alsoElsewhere: false }, entryTerm: { season: 'fall', year: 2024 }, entryTermInferred: { how: 'the first graduate-level term on your transcript' } };
    const steps = nextSteps({ report: report([]), student: s, review: { unlisted: 0, caseByCase: 0 }, processingCount: 0 });
    assert.equal(steps[0]?.text, 'Set the semester you entered the Ph.D. (Your standing) — Fall 2024, read from your transcript, is your MSCSE’s first semester.');
  });
});
