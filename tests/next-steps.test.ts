// The "Next steps" block under the dial (DGS 2026-09-27, clarity proposal 1):
// the coursework sentence read off the course lines, the record-level steps
// each shown only when it applies, and the nearest deadline for the empty
// state. Minimal hand-built reports; no DOM.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { AuditReport, CourseLine, RequirementResult, Student } from '../src/engine/types.ts';
import { courseworkSentence, nearestDeadline, nextSteps } from '../src/ui/next-steps.ts';
import { phdStudent } from './helpers/student.ts';

const line = (courseId: string, mark: CourseLine['mark'], text: string): CourseLine => ({ courseId, term: { season: 'fall', year: 2026 }, text, mark, counts: [] });
const row = (id: string, status: RequirementResult['status'], extra: Partial<RequirementResult> = {}): RequirementResult =>
  ({ id, group: 'g', title: id, status, detail: '', citation: { section: '§', quote: '' }, ...extra }) as RequirementResult;
const report = (requirements: RequirementResult[], courseLines: CourseLine[] = []): AuditReport =>
  ({ program: 'phd', requirements, courseLines, summary: { met: 0, conditional: 0, scored: 0 }, warnings: [], tracks: [], reviewFlags: [] }) as unknown as AuditReport;

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
    const s: Student = { ...phdStudent(), courses: [{ courseId: 'CSE 60641', credits: 3, term: { season: 'fall', year: 2026 }, grade: 'A', origin: 'nd' }] };
    s.entryTermInferred = { how: 'the admit-term line on your transcript' };
    s.bachelorsAwarded = { season: 'spring', year: 2021 };
    s.bachelorsAwardedInferred = { how: 'the Bachelor of Science awarded 2021-05-16' };
    const r = report([row('shared.advisor', 'unmet'), row('shared.approvals', 'needs_dgs_review')]);
    const steps = nextSteps({ report: r, student: s, reviewCount: 2, processingCount: 0 });
    assert.deepEqual(steps.map((x) => x.text), [
      'Check what your transcript set — first semester Fall 2026, bachelor’s degree Spring 2021 (Your standing).',
      'Send the review request for 2 courses — the DGS decides.',
      'Enter your advisor’s name under Milestones.',
      'Confirm your advisor approved your plan of study and tick the box under Approvals.',
      'When the DGS answers, tick the approvals, then send the processing request — the Grad Admin records it.',
      'Send the summary to your advisor whenever you like.',
    ]);
    assert.deepEqual(steps.map((x) => x.href), ['#standing', '#dgs-review', '#milestones', '#milestones', '#grad-admin', undefined]);
  });
  it('a settled record has only the advisor summary left; an empty record has nothing', () => {
    const s: Student = { ...phdStudent(), courses: [{ courseId: 'CSE 60641', credits: 3, term: { season: 'fall', year: 2026 }, grade: 'A', origin: 'nd' }] };
    s.attestations.advisorApprovedPlan = true;
    const r = report([row('shared.advisor', 'met'), row('shared.approvals', 'not_applicable')]);
    assert.deepEqual(nextSteps({ report: r, student: s, reviewCount: 0, processingCount: 0 }).map((x) => x.text), ['Send the summary to your advisor whenever you like.']);
    assert.deepEqual(nextSteps({ report: r, student: s, reviewCount: 0, processingCount: 2 }).map((x) => x.text), ['Send the processing request (2 items) — the Grad Admin records it.', 'Send the summary to your advisor whenever you like.']);
    assert.deepEqual(nextSteps({ report: report([row('shared.advisor', 'met')]), student: phdStudent(), reviewCount: 0, processingCount: 0 }), []);
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
