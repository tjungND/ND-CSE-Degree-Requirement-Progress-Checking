// Which document a section is from, and what a result card may show (DGS
// 2026-10-03): "When sections are cited, need to clarify whether it's from CSE
// handbook, Grad school academic code, or DGS handbook. Clarify this without
// making texts too long." — and "In those cards, only need to show what are
// satisfied by what. Other supplementary explanation all need to be hidden with
// selectors. Apply this to future changes too."
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { audit } from '../src/engine/audit.ts';
import type { DetailPart } from '../src/engine/types.ts';
import { labelCitations, sourceName, withoutCitations } from '../src/ui/citations.ts';
import { allScenarios, buildRules } from './helpers.ts';

describe('labelCitations: a bare § is the CSE handbook, once per run of sections', () => {
  const cases: [string, string][] = [
    ['Advisor name (§2.3)', 'Advisor name (CSE §2.3)'],
    ['§2.3, §4.4–4.7', 'CSE §2.3, §4.4–4.7'],
    ['§3.2/§4.2/§5.2', 'CSE §3.2/§4.2/§5.2'],
    ['(§5.2; DGS Handbook §3.14)', '(CSE §5.2; DGS Handbook §3.14)'],
    ['(Academic Code §4.3; DGS Handbook §3.12)', '(Academic Code §4.3; DGS Handbook §3.12)'],
    ['Academic Code §5.1, §5.4', 'Academic Code §5.1, §5.4'],
    ['the Academic Code (§4.6) lets it', 'the Academic Code (§4.6) lets it'],
    ['Ph.D. (Handbook §4)', 'Ph.D. (CSE Handbook §4)'],
    ['CSE Graduate Handbook §4.2: “…”', 'CSE Graduate Handbook §4.2: “…”'],
    ['§5.2’s window', 'CSE §5.2’s window'],
    ['no section here', 'no section here'],
  ];
  for (const [given, want] of cases) it(given, () => assert.equal(labelCitations(given), want));
  it('is idempotent', () => assert.equal(labelCitations(labelCitations('(§3.2, §3.6.1)')), '(CSE §3.2, §3.6.1)'));
});

describe('withoutCitations: a card fact without its sources', () => {
  const cases: [string, string][] = [
    ['transfer credit (§5.2)', 'transfer credit'],
    ['Full-time (9+ credits, §2.1.2) in Fall 2026', 'Full-time (9+ credits) in Fall 2026'],
    ['not counted — completed more than 5 years before you entered (before Fall 2021; §5.2)', 'not counted — completed more than 5 years before you entered (before Fall 2021)'],
    ['still open: Operating Systems core knowledge (§4.4.1), the research component (§4.4.3)', 'still open: Operating Systems core knowledge, the research component'],
    ['Satisfied by CSE 60641 (Notre Dame, before entering the program).', 'Satisfied by CSE 60641 (Notre Dame, before entering the program).'],
    ['inside the 6 credits (Graduate School)', 'inside the 6 credits'],
    ['X (Academic Code Appendix A)', 'X'],
    ['needs approval (§3.2/§4.2)', 'needs approval'],
  ];
  for (const [given, want] of cases) it(given, () => assert.equal(withoutCitations(given), want));
});

describe('sourceName: the rule quote names its document in full', () => {
  it('CSE handbook', () => assert.equal(sourceName('§4.2'), 'CSE Graduate Handbook §4.2'));
  it('Academic Code', () => assert.equal(sourceName('Academic Code §6.2.4'), 'Graduate School Academic Code §6.2.4'));
  it('DGS Handbook', () => assert.equal(sourceName('DGS Handbook §3.14'), 'Graduate School DGS Handbook §3.14'));
  it('anything else as written', () => assert.equal(sourceName('Graduate School (2026-09-22 answer)'), 'Graduate School (2026-09-22 answer)'));
});

// The guard for "apply this to future changes too": over every fixture, what a
// card shows (its facts, after the page strips bracketed sources) never cites a
// section — a new sentence that explains belongs in a `{ note }` part.
describe('result cards show facts, not citations', () => {
  it('no visible fact on any row of any fixture carries a §', () => {
    const offending: string[] = [];
    const texts = (p: DetailPart): string[] =>
      typeof p === 'string' ? [p] : 'warn' in p ? [p.warn] : 'note' in p ? [] : 'check' in p ? [p.check] : [p.lead, ...p.items];
    for (const sc of allScenarios()) {
      const report = audit(sc.student, buildRules(sc.rules.patch), sc.today);
      for (const r of report.requirements) {
        const parts = r.shortDetailParts ?? r.detailParts ?? (r.detail ? [r.detail] : []);
        for (const t of parts.flatMap(texts)) if (withoutCitations(t).includes('§')) offending.push(`${sc.name} ${r.id}: ${t}`);
      }
    }
    assert.deepEqual([...new Set(offending)].slice(0, 12), []);
  });
});
