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

// Deadlines travel with the summary (DGS request 2026-09-05): a DEADLINES
// block right after the standing line, and each due row says its date.
describe('advisor summary carries the deadlines', () => {
  const withDeadlines: AuditReport = {
    ...report,
    requirements: [
      ...report.requirements,
      {
        ...req('phd.candidacy', 'Candidacy examination (dissertation proposal) passed', 'in_progress', ''),
        deadline: { date: '2030-05-31', approx: true, state: 'upcoming', label: 'Due by the end of Spring 2030 — semester 8 (2030-05-31) (approximate)' },
      },
      {
        ...req('phd.qualifier.research', 'Research component: a significant research contribution', 'unmet', 'Overdue — talk to your advisor and the DGS.'),
        deadline: { date: '2028-02-15', approx: true, state: 'overdue', label: 'Overdue' },
      },
      {
        ...req('phd.timeLimit', 'All requirements complete within 8 years', 'in_progress', ''),
        deadline: { date: '2034-08-15', approx: true, state: 'upcoming', label: 'Due by 2034-08-15 (approximate)' },
      },
      {
        ...req('done', 'Something already done', 'met', 'Done.'),
        deadline: { date: '2027-01-01', approx: true, state: 'done', label: 'Complete' },
      },
    ],
  };
  const { text, html } = advisorSummary(withDeadlines, { ...opts, entryTerm: 'Fall 2026' });

  it('text: a DEADLINES block in date order, counted from the entry term, skipping done rows', () => {
    const block = /DEADLINES \(counted from Fall 2026; semesters are approximate[^\n]*\)\n((?:- .*\n)+)/.exec(text);
    assert.ok(block, 'DEADLINES block present');
    // Semesters, never dates (DGS 2026-09-05): mid-term → "during", a term's
    // last day → "by the end of", a term's first day → "before".
    assert.deepEqual(block![1]!.trim().split('\n'), [
      '- Research component: a significant research contribution (§4.2): overdue — was due during Spring 2028 (approximate)',
      '- Candidacy examination (dissertation proposal) passed (§4.2): due by the end of Spring 2030 (approximate)',
      '- All requirements complete within 8 years (§4.2): due before Fall 2034 (approximate)',
    ]);
    assert.ok(text.indexOf('DEADLINES') < text.indexOf('NOT YET MET'), 'deadlines come right after the standing line');
  });

  it('text: each due row also says its semester inline', () => {
    assert.match(text, /^- Candidacy examination \(dissertation proposal\) passed \(§4\.2\) Due by the end of Spring 2030 \(approximate\)\.$/m);
    assert.match(text, /^- \*\*Research component: a significant research contribution\*\* \(§4\.2\) — Overdue — talk to your advisor and the DGS\. Overdue — was due during Spring 2028 \(approximate\)\.$/m);
    assert.doesNotMatch(text, /Something already done.*(2027|Spring 2027)/);
    for (const dueLine of text.split('\n').filter((l) => /\bdue\b/i.test(l))) {
      assert.doesNotMatch(dueLine, /\d{4}-\d{2}-\d{2}/, `no ISO date in a deadline line: ${dueLine}`);
    }
  });

  it('HTML: a Deadlines table plus a Deadline column on the groups that need one', () => {
    assert.match(html, /<p><strong>Deadlines<\/strong> \(counted from Fall 2026;/);
    assert.match(html, /<th>Requirement<\/th><th>§<\/th><th>Deadline<\/th><\/tr><tr><td><strong style="[^"]+">Research component/);
    assert.match(html, /<td>due before Fall 2034 \(approximate\)<\/td>/);
    // The Met group has no due row, so no Deadline column there.
    assert.match(html, /<p><strong>Met<\/strong><\/p><table[^>]*><tr><th>Requirement<\/th><th>§<\/th><th>Status<\/th><\/tr>/);
    assert.match(html, /<p><strong>In progress<\/strong><\/p><table[^>]*><tr><th>Requirement<\/th><th>§<\/th><th>Status<\/th><th>Deadline<\/th><\/tr>/);
  });
});
