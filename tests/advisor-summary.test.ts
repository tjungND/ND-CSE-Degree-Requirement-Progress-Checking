// The "Copy summary for your advisor" email (src/ui/report.ts advisorSummary):
// unmet requirements are highlighted BY NAME (DGS request, 2026-09-04) — red
// bold in the HTML flavor, **asterisks** in the plain-text flavor — and no
// other status is. advisorSummary is pure string building over an AuditReport,
// so a hand-made report is enough; no rules or DOM needed.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { AuditReport, RequirementResult } from '../src/engine/types.ts';
import { advisorSummary } from '../src/ui/report.ts';

function req(id: string, title: string, status: RequirementResult['status'], detail = ''): RequirementResult {
  return { id, group: 'Coursework — §4.2', title, status, detail, citation: { section: '§4.2', quote: 'quote' } };
}

const report: AuditReport = {
  program: 'phd',
  requirements: [
    req('total', '60 total credits of courses & research', 'unmet', '14 of 60 credits complete.'),
    req('regular', '24 credit hours of regular courses', 'in_progress', '12 of 24 credits complete.'),
    req('review', 'At most 9 credits at 6xxxx from outside CSE', 'needs_dgs_review', 'needs approval: MATH 60610.'),
    req('gpa', 'Cumulative GPA of at least 3.0', 'met', 'Cumulative GPA 3.50 meets the 3.0 minimum.'),
  ],
  courseLines: [],
  summary: { met: 1, scored: 4 },
  warnings: [],
};

const opts = { todayIso: '2026-09-04', entryTerm: 'Fall 2026', priorStudy: 'none', gpa: 3.5 };

describe('advisor summary highlights unmet requirements by name', () => {
  const { text, html } = advisorSummary(report, opts);

  it('HTML: the unmet title is red bold (inline style, escaped), others are plain cells', () => {
    assert.match(html, /<td><strong style="color:#a81e14;font-weight:bold">60 total credits of courses &amp; research<\/strong><\/td>/);
    assert.match(html, /<td>24 credit hours of regular courses<\/td>/);
    assert.match(html, /<td>At most 9 credits at 6xxxx from outside CSE<\/td>/);
    assert.match(html, /<td>Cumulative GPA of at least 3\.0<\/td>/);
    assert.equal((html.match(/<strong style=/g) ?? []).length, 1);
    assert.doesNotMatch(html, /<td>60 total credits/); // never unstyled
  });

  it('text: the unmet title is wrapped in ** **, others are not', () => {
    assert.match(text, /^- \*\*60 total credits of courses & research\*\* \(§4\.2\) — 14 of 60 credits complete\.$/m);
    assert.match(text, /^- 24 credit hours of regular courses \(§4\.2\)/m);
    assert.match(text, /^- Cumulative GPA of at least 3\.0 \(§4\.2\)$/m); // met rows carry no detail
    assert.equal((text.match(/\*\*/g) ?? []).length, 2);
  });

  it('keeps the attention-first grouping (Not yet met first, Met last)', () => {
    const order = ['NOT YET MET', 'NEEDS A DECISION OR APPROVAL', 'IN PROGRESS', 'MET'].map((h) => text.indexOf(`\n${h}\n`));
    assert.ok(order.every((i) => i >= 0), 'every group heading present');
    assert.deepEqual([...order].sort((a, b) => a - b), order);
  });
});
