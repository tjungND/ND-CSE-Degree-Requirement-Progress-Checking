// Capitals headings keep their document names as written, so the copy's
// citations are labelled right (policy review round 3, P3-emails-3 and
// P3-emails-8; DGS 2026-10-06: "apply the suggested handling"). The plain-text
// processing request upper-cased "(Academic Code §6.2.9)", the label check
// (case-sensitive by design) missed it, and the copy read "ACADEMIC CODE CSE
// §6.2.9".
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { audit } from '../src/engine/audit.ts';
import { labelCitations } from '../src/ui/citations.ts';
import { upperHeading } from '../src/ui/email-html.ts';
import { gradAdminRequest } from '../src/ui/grad-admin-request.ts';
import { allScenarios, buildRules } from './helpers.ts';

describe('capitals headings and their citations (P3-emails-3, P3-emails-8)', () => {
  it('upperHeading keeps the documents’ names', () => {
    assert.equal(upperHeading('Admission to doctoral candidacy (Academic Code §6.2.9; DGS Handbook §3.22.3)'), 'ADMISSION TO DOCTORAL CANDIDACY (Academic Code §6.2.9; DGS Handbook §3.22.3)');
  });
  it('no labelled processing request puts “CSE §” after a Graduate School document, in any case', () => {
    for (const sc of allScenarios()) {
      const rules = buildRules(sc.rules.patch);
      const report = audit(sc.student, rules, sc.today);
      const { text } = gradAdminRequest(report, sc.student, rules, { todayIso: sc.today, entryTerm: 'Fall 2026', priorStudy: 'None' });
      const labelled = labelCitations(text);
      assert.doesNotMatch(labelled, /(?:academic code|dgs handbook)\s+CSE §/i, `${sc.name}: ${labelled.match(/.{0,40}(?:academic code|dgs handbook)\s+CSE §.{0,20}/i)?.[0]}`);
    }
  });
});
