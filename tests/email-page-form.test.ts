// The page's own form stays on the page (policy review round 3, P3-emails-4;
// DGS 2026-10-07: "apply the suggested handling"): "enter the date under
// Milestones" was copied into the advisor's email from the master's
// candidacy step, the thesis readers, the thesis submission and the ethics
// training. The instruction is cut and the fact kept.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { audit } from '../src/engine/audit.ts';
import { actionItems, advisorSummary, whyFor } from '../src/ui/advisor-summary.ts';
import { allScenarios, buildRules } from './helpers.ts';

describe('the advisor email never says “under Milestones” (P3-emails-4)', () => {
  it('no scenario’s advisor email does', () => {
    for (const sc of allScenarios()) {
      const rules = buildRules(sc.rules.patch);
      const report = audit(sc.student, rules, sc.today);
      const { text } = advisorSummary(report, { todayIso: sc.today, entryTerm: 'Fall 2026', priorStudy: 'None' });
      assert.doesNotMatch(text, /under Milestones/i, `${sc.name}: ${text.match(/.{0,80}under Milestones.{0,40}/i)?.[0]}`);
    }
  });
  it('a fact before the instruction is kept', () => {
    const row = {
      id: 'phd.rcr',
      group: 'Candidacy',
      title: 'Responsible Conduct of Research training',
      status: 'unmet' as const,
      detail: '',
      detailParts: ['Not yet', { note: 'A condition of admission to candidacy (DGS Handbook §3.22.3); enter the date under Milestones once all are done' }],
      citation: { section: 'DGS Handbook §3.22.3', quote: '' },
    };
    assert.equal(whyFor(row), 'Not yet. A condition of admission to candidacy (DGS Handbook §3.22.3).');
    const advisor = { ...row, id: 'shared.advisor', detailParts: ['No advisor entered', { note: 'Enter your advisor under Milestones. A student who is not under the supervision of a faculty advisor may be subject to dismissal from the program (§2.3)' }] };
    assert.equal(whyFor(advisor), 'No advisor entered. A student who is not under the supervision of a faculty advisor may be subject to dismissal from the program (§2.3).');
  });
  it('an open thesis topic asks the advisor for the approval the Academic Code requires', () => {
    const sc = allScenarios().find((x) => x.student.program === 'mscse' && x.student.msOption === 'thesis' && !x.student.milestones.thesisTopicApproved && !x.student.milestones.thesisDefensePassed);
    assert.ok(sc, 'a thesis-option scenario with the topic open');
    const todo = actionItems(audit(sc.student, buildRules(sc.rules.patch), sc.today));
    assert.ok(todo.student.includes('Propose my thesis topic, with my advisor’s approval, for the program’s approval (Academic Code §6.1.7).'), JSON.stringify(todo.student));
    assert.ok(todo.advisor.includes('Approve my thesis topic proposal (Academic Code §6.1.7).'), JSON.stringify(todo.advisor));
    assert.ok(!todo.dgs.some((t) => /topic/.test(t)), 'who gives the program’s approval is open (HANDBOOK-REVISIONS item 13)');
  });
});
