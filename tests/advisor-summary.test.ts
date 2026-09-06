// The "Copy summary for advisor" email (src/ui/advisor-summary.ts). Redesigned
// 2026-09-06 for busy advisors (DGS request): what is not met, why, and by
// when — first; everything else short or gone. Unmet requirements are
// highlighted BY NAME (DGS 2026-09-04) — red bold in the HTML flavor,
// **asterisks** in the plain-text flavor — and no other status is.
// advisorSummary is pure string building over an AuditReport, so a hand-made
// report is enough; no rules or DOM needed.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { AuditReport, RequirementResult } from '../src/engine/types.ts';
import { advisorSummary, whyFor } from '../src/ui/advisor-summary.ts';

function req(id: string, title: string, status: RequirementResult['status'], detail = ''): RequirementResult {
  return { id, group: 'Coursework — §4.2', title, status, detail, citation: { section: '§4.2', quote: 'quote' } };
}

const report: AuditReport = {
  program: 'phd',
  requirements: [
    req('total', '60 total credits of courses & research', 'unmet', '14 of 60 credits complete.'),
    req('regular', '24 credit hours of regular courses', 'in_progress', '12 of 24 credits complete. 3 in progress.'),
    req('review', 'At most 9 credits at 6xxxx from outside CSE', 'needs_dgs_review', 'needs approval: MATH 60610.'),
    req('gpa', 'Cumulative GPA of at least 3.0', 'met', 'Cumulative GPA 3.50 meets the 3.0 minimum.'),
    req('na', 'Transfer credit from a prior M.S.', 'not_applicable', 'No prior M.S.'),
  ],
  courseLines: [{ courseId: 'CSE 60641', term: { season: 'fall', year: 2026 }, text: 'counts toward regular courses (3 cr)' }],
  summary: { met: 1, scored: 4 },
  warnings: [],
};

const opts = { todayIso: '2026-09-04', entryTerm: 'Fall 2026', priorStudy: 'No prior graduate degree', gpa: 3.5 };

describe('advisor summary: the answer first', () => {
  const { text, html } = advisorSummary(report, opts);

  it('subject line carries the degree, the entry term and the count of unmet requirements', () => {
    assert.match(text, /^Subject: Degree self-check — Ph\.D\., entered Fall 2026 — 1 requirement not yet met\n/);
    assert.match(html, /^<p>Subject: Degree self-check — Ph\.D\., entered Fall 2026 — 1 requirement not yet met<\/p>/);
  });

  it('one standing paragraph: date in words, program, entry term, prior study, GPA, then the counts', () => {
    assert.match(text, /\nHere is my current standing from the CSE degree self-check tool, as of September 4, 2026\.\n/);
    assert.match(text, /\nPh\.D\. \(Handbook §4\); entered Fall 2026; no prior graduate degree; cumulative GPA 3\.50\.\n/);
    assert.match(text, /\n1 of 4 requirements met · 1 in progress · 1 not yet met · 1 needs DGS review\.\n/);
    assert.match(html, /<strong>1 of 4 requirements met · 1 in progress · 1 not yet met · 1 needs DGS review\.<\/strong>/);
    assert.doesNotMatch(text, /2026-09-04/, 'no ISO date anywhere');
  });

  it('sections in the order an advisor needs them; "does not apply" rows and the course list are left out', () => {
    const order = ['NOT YET MET — what is missing, and by when', 'NEEDS DGS REVIEW', 'IN PROGRESS', 'Met: '].map((h) => text.indexOf(`\n${h}`));
    assert.ok(order.every((i) => i >= 0), `every section present: ${order}`);
    assert.deepEqual([...order].sort((a, b) => a - b), order);
    assert.doesNotMatch(text, /Transfer credit from a prior M\.S\./);
    assert.doesNotMatch(text, /CSE 60641|COURSES/);
    assert.doesNotMatch(html, /CSE 60641|Courses counted/);
    assert.doesNotMatch(text, /CANNOT EVALUATE/, 'an empty section is not printed');
  });

  it('text: the unmet name is wrapped in ** ** and numbered; other rows are plain dashes', () => {
    assert.match(text, /^1\. \*\*60 total credits of courses & research\*\* \(§4\.2\) — 14 of 60 credits complete\.$/m);
    assert.match(text, /^- At most 9 credits at 6xxxx from outside CSE \(§4\.2\) — Needs approval: MATH 60610\.$/m);
    assert.equal((text.match(/\*\*/g) ?? []).length, 2);
  });

  it('HTML: the unmet name is red bold (inline style, escaped); others are plain cells', () => {
    assert.match(html, /<td><strong style="color:#a81e14;font-weight:bold">60 total credits of courses &amp; research<\/strong><\/td>/);
    assert.match(html, /<td>24 credit hours of regular courses<\/td>/);
    assert.match(html, /<td>At most 9 credits at 6xxxx from outside CSE<\/td>/);
    assert.equal((html.match(/<strong style=/g) ?? []).length, 1);
    assert.doesNotMatch(html, /<td>60 total credits/); // never unstyled
  });

  it('in-progress rows keep only their first statement; met rows are names only, one line', () => {
    assert.match(text, /^- 24 credit hours of regular courses \(§4\.2\) — 12 of 24 credits complete\.$/m);
    assert.match(text, /^Met: Cumulative GPA of at least 3\.0\.$/m);
    assert.doesNotMatch(text, /meets the 3\.0 minimum/);
    assert.match(html, /<p><strong>Met:<\/strong> Cumulative GPA of at least 3\.0\.<\/p>/);
  });

  it('closes with the alpha/no-warranty notice and the handbook edition — nothing about PDF parsing', () => {
    assert.match(text, /Alpha version under testing\. Informational only, no warranty — not an official degree audit; every final decision rests with the Director of Graduate Studies\. Checked against the CSE Graduate Studies Handbook, July 2026 \(https:\/\/[^)]+\)\.\n\nThank you!\n$/);
    assert.doesNotMatch(text, /transcript-PDF|Not all cases are covered/);
    assert.doesNotMatch(text, /Deadlines are counted from/, 'no deadline footnote when no row has a deadline');
  });
});

// Deadlines travel with each requirement (DGS 2026-09-05: semesters, not
// dates; 2026-09-06: on the line itself, no separate block).
describe('advisor summary: deadlines on the lines that have them', () => {
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
        ...req('phd.qualifier', 'Qualifying examination — all three components', 'unmet', 'Three components: core knowledge (§4.4.1), category specialization (§4.4.2), research (§4.4.3).'),
        deadline: { date: '2028-05-31', approx: true, state: 'upcoming', label: 'Due by the end of Spring 2028' },
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
    summary: { met: 2, scored: 8 },
  };
  const { text, html } = advisorSummary(withDeadlines, opts);

  it('subject line adds the passed deadline', () => {
    assert.match(text, /^Subject: Degree self-check — Ph\.D\., entered Fall 2026 — 3 requirements not yet met, 1 deadline passed\n/);
  });

  it('text: NOT YET MET is ordered deadline passed → nearest deadline → the rest; each line ends with its semester', () => {
    const block = /NOT YET MET — what is missing, and by when\n((?:\d\. .*\n)+)/.exec(text);
    assert.ok(block, 'section present');
    assert.deepEqual(block![1]!.trim().split('\n'), [
      '1. **Research component: a significant research contribution** (§4.2) — Not yet. Deadline passed (was due during Spring 2028).',
      '2. **Qualifying examination — all three components** (§4.2) — Three components: core knowledge (§4.4.1), category specialization (§4.4.2), research (§4.4.3). Due by the end of Spring 2028.',
      '3. **60 total credits of courses & research** (§4.2) — 14 of 60 credits complete.',
    ]);
    assert.doesNotMatch(text, /\(approximate\)/, 'said once in the footnote, not on every line');
    assert.match(text, /^Deadlines are counted from Fall 2026 and given by semester; they are approximate — the registrar's calendar sets the exact dates\.$/m);
  });

  it('text: in-progress rows with a deadline come first and say it; done deadlines are silent', () => {
    const block = /IN PROGRESS\n((?:- .*\n)+)/.exec(text);
    assert.deepEqual(block![1]!.trim().split('\n'), [
      '- Candidacy examination (dissertation proposal) passed (§4.2) — Due by the end of Spring 2030.',
      '- All requirements complete within 8 years (§4.2) — Due before Fall 2034.',
      '- 24 credit hours of regular courses (§4.2) — 12 of 24 credits complete.',
    ]);
    assert.doesNotMatch(text, /Something already done.*(2027|Spring 2027)/);
    for (const dueLine of text.split('\n').filter((l: string) => /\bdue\b/i.test(l))) {
      assert.doesNotMatch(dueLine, /\d{4}-\d{2}-\d{2}/, `no ISO date in a deadline line: ${dueLine}`);
    }
  });

  it('HTML: a Deadline column only on the tables that need one; a passed deadline is red bold', () => {
    assert.match(html, /<p><strong>Not yet met<\/strong> — what is missing, and by when<\/p><table[^>]*><tr><th>Requirement<\/th><th>§<\/th><th>What is missing<\/th><th>Deadline<\/th><\/tr>/);
    assert.match(html, /<td><strong style="color:#a81e14;font-weight:bold">Deadline passed \(was due during Spring 2028\)<\/strong><\/td>/);
    assert.match(html, /<td>Due by the end of Spring 2028<\/td>/);
    assert.match(html, /<p><strong>Needs DGS review<\/strong><\/p><table[^>]*><tr><th>Requirement<\/th><th>§<\/th><th>What is pending<\/th><\/tr>/);
    assert.match(html, /<p><strong>In progress<\/strong><\/p><table[^>]*><tr><th>Requirement<\/th><th>§<\/th><th>Progress<\/th><th>Deadline<\/th><\/tr>/);
    assert.match(html, /<td>Due before Fall 2034<\/td>/);
  });
});

describe('advisor summary: the other headline shapes', () => {
  it('nothing unmet → "nothing not yet met — N in progress"; everything met → says so', () => {
    const onTrack = { ...report, requirements: report.requirements.filter((r) => r.status !== 'unmet'), summary: { met: 1, scored: 3 } };
    assert.match(advisorSummary(onTrack, opts).text, /^Subject: .* — nothing not yet met — 1 in progress, 1 needs DGS review\n/);
    const allMet = { ...report, requirements: report.requirements.filter((r) => r.status === 'met'), summary: { met: 1, scored: 1 } };
    const { text } = advisorSummary(allMet, opts);
    assert.match(text, /^Subject: .* — all checked requirements met\n/);
    assert.match(text, /\n1 of 1 requirements met\.\n/);
    assert.doesNotMatch(text, /NOT YET MET|IN PROGRESS|NEEDS DGS REVIEW/);
  });

  it('GPA not entered, M.S. program, a cannot-evaluate row', () => {
    const ms: AuditReport = {
      program: 'mscse',
      requirements: [req('gpa', 'Cumulative GPA of at least 3.0', 'cannot_evaluate', 'Enter your cumulative GPA from your transcript (transferred grades are not part of it, §5.2).')],
      courseLines: [],
      summary: { met: 0, scored: 1 },
      warnings: [],
    };
    const { text, html } = advisorSummary(ms, { ...opts, gpa: undefined, priorStudy: 'Prior M.S., not completed' });
    assert.match(text, /^Subject: Degree self-check — M\.S\. in CSE, entered Fall 2026 — nothing not yet met — 0 in progress\n/);
    assert.match(text, /\nM\.S\. in CSE \(Handbook §3\); entered Fall 2026; prior M\.S\., not completed; cumulative GPA not entered yet\.\n0 of 1 requirements met · 1 cannot be evaluated\.\n/);
    assert.match(text, /\nCANNOT EVALUATE — information missing\n- Cumulative GPA of at least 3\.0 \(§4\.2\) — Cumulative GPA not entered yet\.\n/);
    assert.match(html, /<p><strong>Cannot evaluate<\/strong> — information missing<\/p><table[^>]*><tr><th>Requirement<\/th><th>§<\/th><th>What is missing<\/th><\/tr><tr><td>Cumulative GPA of at least 3\.0<\/td><td>§4\.2<\/td><td>Cumulative GPA not entered yet\.<\/td><\/tr>/);
  });
});

// The engine's details address the student at the page; the email re-voices
// them (statements about the page dropped, "Overdue —" left to the deadline
// phrase, you/your → I/my) and keeps what is left as short sentences.
describe('whyFor re-voices the engine detail for the advisor', () => {
  it('drops page instructions and "Talk to the DGS", keeps the facts as sentences', () => {
    const r: RequirementResult = {
      ...req('shared.approvals', 'Courses needing DGS or advisor sign-off', 'needs_dgs_review'),
      detailParts: [
        { lead: 'These courses are counted provisionally until the sign-off happens', items: ['MATH 60610 (non-CSE course — needs advisor + DGS approval (§3.2/§4.2))'] },
        'Confirm your advisor approved your plan of study (§3.2/§4.2) and tick the attestation below the milestones',
        'The attestation checkboxes record approvals you already have',
      ],
    };
    assert.equal(
      whyFor(r),
      'These courses are counted provisionally until the sign-off happens: MATH 60610 (non-CSE course — needs advisor + DGS approval (§3.2/§4.2)). Advisor approval of my plan of study (§3.2/§4.2) is not yet recorded.',
    );
    assert.equal(whyFor(req('x', 'x', 'in_progress', 'No advisor entered — was expected by your first semester. Talk to the DGS.')), 'No advisor entered — was expected by my first semester.');
    assert.equal(whyFor(req('x', 'x', 'cannot_evaluate', "Cannot evaluate — the rules sheet is missing 'ms_regular_credits_min'. Ask the DGS to add it to the Parameters tab")), "Cannot evaluate — the rules sheet is missing 'ms_regular_credits_min'.");
  });

  it('"Overdue —" statements go only when the row has a passed deadline; you/your become I/my', () => {
    const overdue: RequirementResult = { ...req('x', 'x', 'unmet', 'Overdue — the 8-year limit passed at the start of Fall 2034 (approximate). Talk to the DGS.'), deadline: { date: '2034-08-15', approx: true, state: 'overdue', label: 'Overdue' } };
    assert.equal(whyFor(overdue), '');
    assert.equal(whyFor(req('x', 'x', 'unmet', 'Overdue — the 8-year limit passed at the start of Fall 2034 (approximate). Talk to the DGS.')), 'Overdue — the 8-year limit passed at the start of Fall 2034 (approximate).');
    const spec: RequirementResult = {
      ...req('x', 'x', 'in_progress'),
      detailParts: ['3 done (2 distinct groups) with 1 in progress — on track for 3 distinct groups', 'below the B floor: CSE 60111 (B-) — you may retake the course to replace the grade or take another course (§4.4.2)', 'The approved course list is on the course rules page'],
    };
    assert.equal(whyFor(spec), '3 done (2 distinct groups) with 1 in progress — on track for 3 distinct groups. Below the B floor: CSE 60111 (B-) — I may retake the course to replace the grade or take another course (§4.4.2).');
    assert.equal(whyFor(spec, true), '3 done (2 distinct groups) with 1 in progress — on track for 3 distinct groups.');
    assert.equal(whyFor(req('x', 'x', 'unmet', 'Cumulative GPA 2.80 is below the 3.0 minimum — you cannot receive a degree or defend until it recovers (§2.2).')), 'Cumulative GPA 2.80 is below the 3.0 minimum — I cannot receive a degree or defend until it recovers (§2.2).');
    assert.equal(whyFor(req('x', 'x', 'in_progress', '§4.2 expects these during the first year — you are in semester 2.')), '§4.2 expects these during the first year — I am in semester 2.');
  });

  it('splits prose at sentence ends but not inside M.S. / Ph.D. / e.g.', () => {
    assert.equal(whyFor(req('x', 'x', 'in_progress', 'Courses from a prior M.S. may transfer (§5.2). The Ph.D. cap is 24 credits, e.g. eight courses.')), 'Courses from a prior M.S. may transfer (§5.2). The Ph.D. cap is 24 credits, e.g. eight courses.');
    assert.equal(whyFor(req('x', 'x', 'in_progress', 'Courses from a prior M.S. may transfer (§5.2). The Ph.D. cap is 24 credits, e.g. eight courses.'), true), 'Courses from a prior M.S. may transfer (§5.2).');
  });
});
