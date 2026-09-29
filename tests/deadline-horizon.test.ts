// The deadline alert (DGS 2026-09-28): "When a deadline is approaching soon,
// 1 semester before, students need to see the alert." "Due soon" is one
// semester's notice — the deadline falls in this semester or the next — not
// the 120-day count it was. src/engine/term.ts deadlineHorizon, status.ts
// openDeadline, and the pill / Grad Admin wording that carries it.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { audit } from '../src/engine/audit.ts';
import { openDeadline } from '../src/engine/status.ts';
import { deadlineHorizon } from '../src/engine/term.ts';
import type { RequirementResult } from '../src/engine/types.ts';
import { gradAdminRequest } from '../src/ui/grad-admin-request.ts';
import { dueWording, isDueSoon, pillLabel } from '../src/ui/report.ts';
import { buildRules } from './helpers.ts';
import { phdStudent } from './helpers/student.ts';

const rules = buildRules();

describe('deadlineHorizon', () => {
  it('this semester, next semester, or nothing — counted on fall/spring slots', () => {
    assert.equal(deadlineHorizon('2027-05-15', '2026-09-28'), 'next', 'Fall 2026 → end of Spring 2027');
    assert.equal(deadlineHorizon('2027-05-15', '2027-02-01'), 'this', 'Spring 2027 → end of Spring 2027');
    assert.equal(deadlineHorizon('2027-05-15', '2026-02-01'), undefined, 'Spring 2026 → Spring 2027 is two semesters off');
    assert.equal(deadlineHorizon('2026-08-15', '2026-05-01'), 'next', 'Spring 2026 → the start of Fall 2026');
    assert.equal(deadlineHorizon('2026-08-15', '2026-07-01'), 'next', 'summer belongs to the spring before it, so the fall is still "next"');
    assert.equal(deadlineHorizon('2026-12-31', '2026-07-01'), 'next', 'summer → the end of the coming fall');
    assert.equal(deadlineHorizon('2027-12-31', '2026-09-28'), undefined, 'Fall 2026 → end of Fall 2027');
  });

  it('a deadline many days off but in the next semester is due soon; the 120-day count is gone', () => {
    // 2026-09-01 → 2027-05-15 is 256 days: "upcoming" under the old rule.
    const d = openDeadline('2027-05-15', '2026-09-01', 'Due by the end of Spring 2027 (approximate)');
    assert.equal(d.state, 'due_soon');
    assert.equal(d.horizon, 'next');
    assert.equal(d.label, 'Due by the end of Spring 2027 (approximate)');
    const far = openDeadline('2027-12-31', '2026-09-01', 'Due by the end of Fall 2027');
    assert.equal(far.state, 'upcoming');
    assert.equal(far.horizon, undefined);
  });
});

describe('the alert on the page and in the Grad Admin request', () => {
  const entered = (today: string) => audit(phdStudent({ entryTerm: { season: 'fall', year: 2025 }, milestones: { advisorIdentified: '2025-09-01', advisorName: 'Prof. Example' } }), rules, today);
  const qualifier = (today: string): RequirementResult => entered(today).requirements.find((r) => r.id === 'phd.qualifier')!;

  it('the qualifier’s four semesters: next semester in the third, this semester in the fourth, nothing in the second', () => {
    const third = qualifier('2026-09-28');
    assert.equal(third.deadline?.state, 'due_soon');
    assert.equal(third.deadline?.horizon, 'next');
    assert.equal(pillLabel(third), 'In progress · due next semester');
    assert.equal(dueWording(third), 'due next semester');
    const fourth = qualifier('2027-02-01');
    assert.equal(fourth.deadline?.horizon, 'this');
    assert.equal(pillLabel(fourth), 'In progress · due this semester');
    const second = qualifier('2026-02-01');
    assert.equal(second.deadline?.state, 'upcoming');
    assert.equal(pillLabel(second), 'In progress');
    assert.equal(isDueSoon(second), false);
  });

  it('a passed deadline reads Overdue, never "due this semester"', () => {
    const late = qualifier('2027-08-20');
    assert.equal(late.deadline?.state, 'overdue');
    assert.equal(pillLabel(late), 'Overdue');
    assert.equal(isDueSoon(late), false);
  });

  it('the Grad Admin request highlights the deadline in plain text and in HTML, and counts it', () => {
    const today = '2026-09-28';
    const s = phdStudent({ entryTerm: { season: 'fall', year: 2025 }, milestones: { advisorIdentified: '2025-09-01', advisorName: 'Prof. Example' } });
    const built = gradAdminRequest(audit(s, rules, today), s, rules, { todayIso: today, entryTerm: 'Fall 2025', priorStudy: 'No prior graduate study', gpa: s.gpa });
    assert.equal(built.items.tally.dueSoon, 1, 'the qualifier umbrella; its parts are unscored');
    assert.match(built.text, /\n- 1 deadline in this semester or the next — highlighted below\.\n/);
    assert.match(built.text, /\n\[IN PROGRESS\] Qualifying examination — all components \(§4\.4\)\n    !! DEADLINE NEXT SEMESTER: Due by the end of Spring 2027 \(approximate\)\n/);
    assert.match(built.html, /<p style="[^"]*background:#ffe3c9;color:#8a3a00;border-left:4px solid #e0863a"><strong>Deadline next semester:<\/strong> Due by the end of Spring 2027 \(approximate\)<\/p>/);
    // A row whose deadline is further off states it without the highlight.
    assert.match(built.text, /\n\[IN PROGRESS\] Oral Candidacy Exam \(OCE\) passed \(§4\.5\)\n    Deadline: Due by the end of Spring 2029 — semester 8 \(approximate\)\n/);
    assert.doesNotMatch(built.text, /!! DEADLINE [A-Z]+ SEMESTER: Due by the end of Spring 2029/);
  });
});
