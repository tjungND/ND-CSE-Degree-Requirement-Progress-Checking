// The GPA in the two generated emails (policy review round 3, P3-cse-1-2-1;
// DGS 2026-10-06: "Apply the suggested handling"). The §2.2 card prints the
// entered GPA to at least two decimals without rounding past the minimum
// (DECISIONS 2026-10-03: 2.996 stays 2.996), but the advisor summary and the
// Grad Admin request printed it with two decimals — "cumulative GPA 3.00" for
// a 2.996 that does not meet CSE §2.2's 3.0. Both now use the card's gpaText.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { audit } from '../src/engine/audit.ts';
import type { Student } from '../src/engine/types.ts';
import { advisorSummary } from '../src/ui/advisor-summary.ts';
import { gradAdminRequest } from '../src/ui/grad-admin-request.ts';
import { buildRules } from './helpers.ts';
import { ndCourse, phdStudent } from './helpers/student.ts';

const rules = buildRules();
const TODAY = '2026-10-06';
const student = (gpa: number): Student =>
  phdStudent({ entryTerm: { season: 'fall', year: 2025 }, bachelorsAwarded: { season: 'spring', year: 2025 }, gpa, courses: [ndCourse('CSE 60641', { term: { season: 'fall', year: 2025 } })] });

describe('the emails print the GPA as the §2.2 card does', () => {
  for (const [gpa, shown] of [
    [2.996, '2.996'],
    [2.9, '2.90'],
    [3.5, '3.50'],
    [3.456, '3.456'],
  ] as const) {
    it(`${gpa} prints as ${shown} in both emails, text and HTML`, () => {
      const s = student(gpa);
      const report = audit(s, rules, TODAY);
      const opts = { todayIso: TODAY, entryTerm: 'Fall 2025', priorStudy: 'None', gpa };
      const advisor = advisorSummary(report, opts);
      const grad = gradAdminRequest(report, s, rules, opts);
      for (const [name, body] of [
        ['advisor text', advisor.text],
        ['advisor html', advisor.html],
        ['grad admin text', grad.text],
        ['grad admin html', grad.html],
      ] as const) {
        assert.ok(body.includes(`cumulative GPA ${shown}`), `${name} should say “cumulative GPA ${shown}”`);
        if (gpa === 2.996) assert.ok(!/GPA:?\s*3\.00\b|cumulative GPA 3\.00\b|>3\.00</.test(body), `${name} must never round 2.996 up to 3.00`);
      }
    });
  }
  it('the §2.2 card agrees: 2.996 is below the minimum', () => {
    const card = audit(student(2.996), rules, TODAY).requirements.find((r) => r.id === 'shared.gpa')!;
    assert.equal(card.status, 'unmet');
    assert.match(card.detail, /Cumulative GPA 2\.996 is below the 3\.0 minimum/);
  });
});
