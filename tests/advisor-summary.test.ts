// The "Copy summary for advisor" email (src/ui/advisor-summary.ts), in the
// shape the DGS asked for on 2026-09-06: the requirements in handbook order,
// one section per group, each row coloured by status (green met / amber in
// progress or needs review / red not yet), with its why and deadline; then
// what the student, the advisor and the DGS each need to do. advisorSummary
// is pure string building over an AuditReport, so hand-made reports are
// enough; no rules or DOM needed.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { AuditReport, RequirementResult } from '../src/engine/types.ts';
import { COLORS, actionItems, advisorSummary, whyFor } from '../src/ui/advisor-summary.ts';

function req(id: string, title: string, status: RequirementResult['status'], detail = '', group = 'Coursework — §4.2', section = '§4.2'): RequirementResult {
  return { id, group, title, status, detail, citation: { section, quote: 'quote' } };
}

const report: AuditReport = {
  program: 'phd',
  requirements: [
    req('shared.gpa', 'Cumulative GPA of at least 3.0', 'met', 'Cumulative GPA 3.50 meets the 3.0 minimum.', 'Basic requirements — §2.2–2.3', '§2.2'),
    req('phd.credits.total', '60 total credits of courses & research', 'unmet', '14 of 60 credits complete. 9 in progress.'),
    req('phd.credits.regular', '24 credit hours of regular courses', 'in_progress', '12 of 24 credits complete. 3 in progress.'),
    req('phd.cap.noncse', 'At most 9 credits at 6xxxx from outside CSE', 'needs_dgs_review', 'needs approval: MATH 60610.'),
    req('phd.transfer', 'Transfer credit from a prior M.S.', 'not_applicable', 'No prior M.S.'),
    {
      ...req('shared.approvals', 'Courses still to be approved or processed', 'needs_dgs_review', '', 'Approvals', '§3.2/§4.2/§5.2'),
      informational: true,
      detailParts: [{ lead: 'Your advisor and the DGS must both approve these — send the review request', items: ['MATH 60610 (non-CSE course — needs advisor + DGS approval (§3.2/§4.2))'] }],
    },
  ],
  courseLines: [{ courseId: 'CSE 60641', term: { season: 'fall', year: 2026 }, text: 'counts toward regular courses (3 cr)', mark: 'counts', counts: [] }],
  summary: { met: 1, scored: 4 },
  warnings: [],
};

const opts = { todayIso: '2026-09-04', entryTerm: 'Fall 2026', priorStudy: 'No prior graduate degree', gpa: 3.5 };

describe('advisor summary: sections in handbook order, rows coloured by status', () => {
  const { text, html } = advisorSummary(report, opts);

  it('subject line and standing paragraph carry the headline facts', () => {
    assert.match(text, /^Subject: Degree self-check — Ph\.D\., entered Fall 2026 — 1 requirement not yet met\n/);
    assert.match(text, /\nHere is my current standing from the CSE degree self-check tool, as of September 4, 2026\.\n/);
    assert.match(text, /\nPh\.D\. \(Handbook §4\); entered Fall 2026; no prior graduate degree; cumulative GPA 3\.50\.\n/);
    assert.match(text, /\n1 of 4 requirements met · 1 in progress · 1 not yet met · 1 needs DGS review\.\n/);
    assert.doesNotMatch(text, /2026-09-04/, 'no ISO date anywhere');
  });

  it('text: one section per group in report order; every row tagged with the page status word', () => {
    const basic = text.indexOf('\nBASIC REQUIREMENTS — §2.2–2.3\n');
    const coursework = text.indexOf('\nCOURSEWORK — §4.2\n');
    assert.ok(basic >= 0 && coursework > basic, 'sections in handbook order');
    assert.match(text, /\n  \[MET\] Cumulative GPA of at least 3\.0 \(§2\.2\)\n/);
    assert.match(text, /\n  \[NOT YET\] 60 total credits of courses & research \(§4\.2\) — 14 of 60 credits complete\. 9 in progress\.\n/);
    assert.match(text, /\n  \[IN PROGRESS\] 24 credit hours of regular courses \(§4\.2\) — 12 of 24 credits complete\. 3 in progress\.\n/);
    assert.match(text, /\n  \[NEEDS DGS REVIEW\] At most 9 credits at 6xxxx from outside CSE \(§4\.2\) — Needs approval: MATH 60610\.\n/);
    assert.doesNotMatch(text, /Transfer credit from a prior M\.S\./, '"does not apply" rows are left out');
    assert.doesNotMatch(text, /\nAPPROVALS\n|Courses still to be approved or processed/, 'the sign-off list feeds the to-do lists, not a section');
    assert.doesNotMatch(text, /CSE 60641|COURSES COUNTED/, 'no course list');
  });

  it('HTML: one table per section; status word and requirement name in the status colour', () => {
    assert.match(html, /<p><strong>Basic requirements — §2\.2–2\.3<\/strong><\/p><table[^>]*><tr><th>Status<\/th><th>Requirement<\/th><th>§<\/th><th>Why<\/th><\/tr>/);
    const green = `<span style="color:${COLORS.green};font-weight:bold">`;
    const amber = `<span style="color:${COLORS.amber};font-weight:bold">`;
    const red = `<span style="color:${COLORS.red};font-weight:bold">`;
    assert.ok(html.includes(`<td>${green}MET</span></td><td>${green}Cumulative GPA of at least 3.0</span></td>`));
    assert.ok(html.includes(`<td>${red}NOT YET</span></td><td>${red}60 total credits of courses &amp; research</span></td><td>§4.2</td><td>14 of 60 credits complete. 9 in progress.</td>`));
    assert.ok(html.includes(`<td>${amber}IN PROGRESS</span></td><td>${amber}24 credit hours of regular courses</span></td>`));
    assert.ok(html.includes(`<td>${amber}NEEDS DGS REVIEW</span></td>`));
    assert.doesNotMatch(html, /Transfer credit from a prior M\.S\./);
  });

  it('to-do lists follow the sections and end the email before the notices', () => {
    const order = ['WHAT I NEED TO DO', 'WHAT I NEED FROM YOU, MY ADVISOR', 'WHAT THE DGS NEEDS TO DO', 'WHAT THE GRAD ADMIN NEEDS TO DO', 'Alpha version under testing.'].map((h) => text.indexOf(`\n${h}`));
    assert.ok(order.every((i) => i >= 0) && order[0]! > text.indexOf('COURSEWORK — §4.2'), `all present, after the sections: ${order}`);
    assert.deepEqual([...order].sort((a, b) => a - b), order);
    assert.match(text, /\nWHAT I NEED TO DO\n- Complete 46 more credits toward the total-credit requirement \(9 of them in progress\) \(§4\.2\)\.\n- Complete 12 more credits of regular courses \(3 of them in progress\) \(§4\.2\)\.\n- Send the DGS the review request for MATH 60610 \(with my transcripts attached\)\.\n/);
    assert.match(text, /\nWHAT I NEED FROM YOU, MY ADVISOR\n- Approve MATH 60610 — non-CSE course \(§3\.2\/§4\.2\)\.\n/);
    assert.match(text, /\nWHAT THE DGS NEEDS TO DO\n- Decide on MATH 60610 — non-CSE course — needs advisor \+ DGS approval \(§3\.2\/§4\.2\)\.\n/);
    assert.match(html, /<p><strong>What I need to do<\/strong><\/p><ul><li>Complete 46 more credits/);
    assert.match(html, /<p><strong>What the DGS needs to do<\/strong><\/p><ul><li>Decide on MATH 60610/);
  });

  it('closes with the alpha/no-warranty notice and the handbook edition; no deadline footnote without deadlines', () => {
    assert.match(text, /Alpha version under testing\. Informational only, no warranty — not an official degree audit; every final decision rests with the Director of Graduate Studies\. Checked against the CSE Graduate Studies Handbook, July 2026 \(https:\/\/[^)]+\)\.\n\nThank you!\n$/);
    assert.doesNotMatch(text, /transcript-PDF|Not all cases are covered|Deadlines are counted from/);
  });
});

describe('advisor summary: deadlines on the rows that have them', () => {
  const withDeadlines: AuditReport = {
    ...report,
    requirements: [
      ...report.requirements,
      {
        ...req('phd.qualifier.research', 'Research component: a significant research contribution', 'unmet', 'Overdue — talk to your advisor and the DGS.', 'Qualifying examination — §4.4', '§4.4.3'),
        deadline: { date: '2028-02-15', approx: true, state: 'overdue', label: 'Overdue' },
      },
      {
        ...req('phd.candidacy', 'Oral Candidacy Exam (OCE) passed', 'in_progress', '', 'Oral Candidacy Exam (OCE) — §4.5', '§4.5'),
        deadline: { date: '2030-05-31', approx: true, state: 'upcoming', label: 'Due by the end of Spring 2030 — semester 8 (2030-05-31) (approximate)' },
      },
      {
        ...req('done', 'Something already done', 'met', 'Done.', 'Oral Candidacy Exam (OCE) — §4.5', '§4.5'),
        deadline: { date: '2027-01-01', approx: true, state: 'done', label: 'Complete' },
      },
    ],
    summary: { met: 2, scored: 6 },
  };
  const { text, html } = advisorSummary(withDeadlines, opts);

  it('subject line adds the passed deadline; rows say their semester, never a date', () => {
    assert.match(text, /^Subject: Degree self-check — Ph\.D\., entered Fall 2026 — 2 requirements not yet met, 1 deadline passed\n/);
    assert.match(text, /\nQUALIFYING EXAMINATION — §4\.4\n  \[NOT YET\] Research component: a significant research contribution \(§4\.4\.3\) — Deadline passed \(was due during Spring 2028\)\.\n/);
    assert.match(text, /\nORAL CANDIDACY EXAM \(OCE\) — §4\.5\n  \[IN PROGRESS\] OCE passed \(§4\.5\) — Due by the end of Spring 2030\.\n  \[MET\] Something already done \(§4\.5\)\n/);
    for (const dueLine of text.split('\n').filter((l: string) => /\bdue\b/i.test(l))) {
      assert.doesNotMatch(dueLine, /\d{4}-\d{2}-\d{2}/, `no ISO date in a deadline line: ${dueLine}`);
    }
    assert.doesNotMatch(text, /\(approximate\)/, 'said once in the footnote');
    assert.match(text, /^Deadlines are counted from Fall 2026 and given by semester; they are approximate — the registrar's calendar sets the exact dates\.$/m);
  });

  it('HTML: a Deadline column only on sections that need one; a passed deadline in red', () => {
    assert.match(html, /<p><strong>Qualifying examination — §4\.4<\/strong><\/p><table[^>]*><tr><th>Status<\/th><th>Requirement<\/th><th>§<\/th><th>Why<\/th><th>Deadline<\/th><\/tr>/);
    assert.ok(html.includes(`<td><span style="color:${COLORS.red};font-weight:bold">Deadline passed (was due during Spring 2028)</span></td>`));
    assert.ok(html.includes('<td>Due by the end of Spring 2030</td>'));
    assert.match(html, /<p><strong>Basic requirements — §2\.2–2\.3<\/strong><\/p><table[^>]*><tr><th>Status<\/th><th>Requirement<\/th><th>§<\/th><th>Why<\/th><\/tr>/);
  });

  it('to-dos: the passed research deadline asks the advisor to decide and the DGS to rule on an extension', () => {
    const todo = actionItems(withDeadlines);
    assert.ok(todo.student.includes('Pass the research component of the qualifier — the deadline (Spring 2028) has passed (§4.4.3).'));
    assert.ok(todo.student.includes('Take the Oral Candidacy Exam (OCE) by the end of Spring 2030 (§4.5).'));
    assert.ok(todo.advisor.includes('Determine whether I have passed the research component and file the Research-Qualifier form (§4.4.3).'));
    assert.ok(todo.dgs.includes('Decide whether to extend the research-component deadline (§4.4.3).'));
  });
});

describe('actionItems: the rest of the rules', () => {
  it('basic rows, residency, seminar, categories below the floor, missing parameters, plan of study', () => {
    const r: AuditReport = {
      program: 'phd',
      requirements: [
        req('shared.gpa', 'Cumulative GPA of at least 3.0', 'cannot_evaluate', 'Enter your cumulative GPA from your transcript (transferred grades are not part of it, §5.2).', 'Basic requirements — §2.2–2.3', '§2.2'),
        req('shared.advisor', 'Under continuous advisor supervision', 'unmet', 'No advisor entered — was expected by your first semester. Talk to the DGS.', 'Basic requirements — §2.2–2.3', '§2.3'),
        req('phd.seminar', '2 credits of Research Seminar in year one', 'in_progress', 'CSE 63801: done. CSE 63802: not yet.'),
        req('phd.residency', 'Four consecutive full-time semesters of residence', 'in_progress', 'Longest consecutive full-time run so far: 1 of 4 semesters.', 'Residence and time — §4.3', '§4.3'),
        req('phd.timeLimit', 'All requirements complete within 8 years', 'cannot_evaluate', "Cannot evaluate — the rules sheet is missing 'phd_time_limit_years'. Ask the DGS to add it to the Parameters tab", 'Residence and time — §4.3', '§4.3'),
        {
          ...req('phd.qualifier.categories', 'Three specialization courses from three distinct groups, each B or higher', 'in_progress', '', 'Qualifying examination — §4.4', '§4.4.2'),
          detailParts: ['3 done (2 distinct groups) with 1 in progress — on track for 3 distinct groups', 'below the B floor: CSE 60111 (B-) — you may retake the course to replace the grade or take another course (§4.4.2)', 'The approved course list is on the course rules page'],
        },
        req('phd.qualifier.core.os', 'Core knowledge: Operating Systems', 'needs_dgs_review', 'CS 50300 (Purdue) — not yet reviewed by the DGS.', 'Qualifying examination — §4.4', '§4.4.1'),
        req('phd.qualifier.core.algorithms', 'Core knowledge: Algorithms', 'unmet', 'No course yet.', 'Qualifying examination — §4.4', '§4.4.1'),
        req('phd.candidacy', 'Oral Candidacy Exam (OCE) passed', 'met', 'Oral Candidacy Exam (OCE) passed 2029-04-01.', 'Oral Candidacy Exam (OCE) — §4.5', '§4.5'),
        req('phd.dissertation.approval', 'Dissertation unanimously approved for defense by the readers', 'unmet', 'Not yet approved.', 'Dissertation and defense — §4.6–4.7', '§4.6'),
        req('phd.dissertation.defense', 'Dissertation defense passed', 'unmet', 'Not yet.', 'Dissertation and defense — §4.6–4.7', '§4.7'),
        {
          ...req('shared.approvals', 'Courses still to be approved or processed', 'needs_dgs_review', '', 'Approvals', '§3.2/§4.2/§5.2'),
          informational: true,
          detailParts: [
            { lead: 'The DGS has still to decide these — send the review request', items: ['CS 51000 (transfer — not yet reviewed by the DGS; needs DGS + Graduate School approval (§5.2))', 'CSE 60999 (not in the rules sheet — counted provisionally; needs DGS review)'] },
            'Confirm your advisor approved your plan of study (§3.2/§4.2) and tick the attestation below the milestones',
            'The attestation checkboxes record approvals you already have',
          ],
        },
      ],
      courseLines: [],
      summary: { met: 1, scored: 10 },
      warnings: [],
    };
    const todo = actionItems(r);
    assert.deepEqual(todo.student, [
      'Report my cumulative GPA (§2.2).',
      'Identify a thesis or project advisor (§2.3).',
      'Take CSE 63802 — the research seminar (§4.2).',
      'Register full-time for 3 more consecutive semesters (§4.3).',
      'Pass a course that covers Algorithms — core knowledge (§4.4.1).',
      'Retake or replace CSE 60111 (B-) — a specialization course below the grade floor (§4.4.2).',
      'Get the dissertation approved for defense by all readers (§4.6).',
      'Defend the dissertation (§4.7).',
      'Send the DGS the review request for CS 51000, CSE 60999 (with my transcripts attached).',
    ]);
    assert.deepEqual(todo.advisor, ['Approve my plan of study (§3.2/§4.2).']);
    assert.deepEqual(todo.dgs, [
      'Confirm the Operating Systems core-knowledge course named in the review request (§4.4.1).',
      'Decide on CS 51000 — transfer — not yet reviewed by the DGS; needs DGS + Graduate School approval (§5.2).',
      'Decide on CSE 60999 — not in the rules sheet — counted provisionally; needs DGS review.',
      "Add the missing parameter 'phd_time_limit_years' to the rules sheet so all requirements complete within 8 years can be checked.",
    ]);
    assert.deepEqual(todo.gradAdmin, []);
    // Dissertation items appear only because candidacy is met here.
    const early = { ...r, requirements: r.requirements.map((x) => (x.id === 'phd.candidacy' ? { ...x, status: 'in_progress' as const, detail: '' } : x)) };
    assert.ok(!actionItems(early).student.some((s) => /dissertation/i.test(s)));
    // Empty lists say so in the email.
    const { text } = advisorSummary({ program: 'mscse', requirements: [req('shared.gpa', 'Cumulative GPA of at least 3.0', 'met', 'ok', 'Basic requirements — §2.2–2.3', '§2.2')], courseLines: [], summary: { met: 1, scored: 1 }, warnings: [] }, opts);
    assert.match(text, /\nWHAT I NEED TO DO\n- Nothing at the moment\.\n\nWHAT I NEED FROM YOU, MY ADVISOR\n- Nothing at the moment\.\n\nWHAT THE DGS NEEDS TO DO\n- Nothing at the moment\.\n\nWHAT THE GRAD ADMIN NEEDS TO DO\n- Nothing at the moment\.\n/);
    assert.match(text, /^Subject: Degree self-check — M\.S\. in CSE, entered Fall 2026 — all checked requirements met\n/);
  });

  it('M.S. rows: project report (student + advisor), thesis defense, one full-time semester', () => {
    const r: AuditReport = {
      program: 'mscse',
      requirements: [
        req('ms.credits.regular', '24 credit hours of regular courses', 'in_progress', '18 of 24 credits complete.', 'Coursework — §3.2', '§3.2'),
        req('ms.residency', 'One full-time semester of residence', 'unmet', 'No full-time term yet — a term counts once its entered credits reach 9 (§2.1.2), or mark a research-heavy term as full-time.', 'Residence and time — §3.3', '§3.3'),
        req('ms.project.report', 'Project report accepted and approved by the advisor', 'unmet', 'Not yet: the written project report and deliverables must be accepted and approved by your advisor (§3.4).', 'M.S. project or thesis — §3.4', '§3.4'),
        req('ms.thesis.defense', 'Thesis defense passed', 'unmet', 'Not yet passed.', 'M.S. project or thesis — §3.4', '§3.4'),
      ],
      courseLines: [],
      summary: { met: 0, scored: 4 },
      warnings: [],
    };
    const todo = actionItems(r);
    assert.deepEqual(todo.student, [
      'Complete 6 more credits of regular courses (§3.2).',
      'Register full-time for one semester (or one summer session) (§3.3).',
      'Defend the thesis (§3.4).',
      'Complete the project report and deliverables (§3.4).',
    ]);
    assert.deepEqual(todo.advisor, ['Accept and approve the project report and deliverables (§3.4).']);
    assert.deepEqual(todo.dgs, []);
    assert.deepEqual(todo.gradAdmin, []);
  });
});

// The engine's details address the student at the page; the email re-voices
// them (statements about the page dropped, "Overdue —" left to the deadline
// phrase, you/your → I/my) and keeps what is left as short sentences.
describe('whyFor re-voices the engine detail for the advisor', () => {
  it('drops page instructions and "Talk to the DGS", keeps the facts as sentences', () => {
    const r: RequirementResult = {
      ...req('shared.approvals', 'Courses still to be approved or processed', 'needs_dgs_review'),
      detailParts: [
        { lead: 'Your advisor and the DGS must both approve these — send the review request', items: ['MATH 60610 (non-CSE course — needs advisor + DGS approval (§3.2/§4.2))'] },
        'Confirm your advisor approved your plan of study (§3.2/§4.2) and tick the attestation below the milestones',
        'The attestation checkboxes record approvals you already have',
      ],
    };
    assert.equal(
      whyFor(r),
      'My advisor and the DGS must both approve these — send the review request: MATH 60610 (non-CSE course — needs advisor + DGS approval (§3.2/§4.2)). Advisor approval of my plan of study (§3.2/§4.2) is not yet recorded.',
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

// Two people, two jobs (DGS 2026-09-06 evening): the DGS list holds eligibility
// decisions only; processing goes to a fourth list for the Grad Admin.
describe('to-dos: the Grad Admin list (2026-09-06 evening)', () => {
  const req = (id: string, title: string, status: RequirementResult['status'], detail: string, group: string, section: string): RequirementResult => ({
    id,
    title,
    status,
    detail,
    group,
    citation: { section, quote: '' },
  });
  it('a pre-approved transfer is the Grad Admin’s to process, not the DGS’s to decide; the MSCSE and the qualifier form are processing too', () => {
    const r: AuditReport = {
      program: 'phd',
      requirements: [
        { ...req('phd.qualifier', 'Qualifying examination — all components', 'met', 'Three components complete. Remember to file the qualifier completion form with the Grad Admin (§4.4)', 'Qualifying examination — §4.4', '§4.4') },
        { ...req('phd.msAlongTheWay', 'MSCSE awarded along the way', 'met', 'OCE passed 2029-04-01, with 24 regular course credits and 6 research credits completed at Notre Dame.', 'Oral Candidacy Exam (OCE) — §4.5', '§4.5'), informational: true },
        {
          ...req('shared.approvals', 'Courses still to be approved or processed', 'needs_dgs_review', '', 'Approvals', '§3.2/§4.2/§5.2'),
          detailParts: [
            {
              lead: 'Courses pending approval',
              items: [
                'CS 50300 (pre-approved in the DGS’s external-course rules — to have it processed, send the Grad Admin the processing request (§5.2))',
                'CS 77777 (transfer — not yet reviewed by the DGS; needs DGS + Graduate School approval (§5.2))',
              ],
            },
          ],
        },
      ],
      courseLines: [],
      summary: { met: 2, scored: 3 },
      warnings: [],
    };
    const todo = actionItems(r);
    assert.deepEqual(todo.gradAdmin, [
      'Process the MSCSE awarded along the way (§4.5).',
      'Record the completed qualifier once my form arrives (§4.4).',
      'Process the transfer credit for CS 50300 — pre-approved by the DGS (§5.2).',
    ]);
    assert.deepEqual(todo.dgs, ['Decide on CS 77777 — transfer — not yet reviewed by the DGS; needs DGS + Graduate School approval (§5.2).']);
    assert.ok(todo.student.includes('Send the Grad Admin the processing request for the MSCSE along the way (§4.5).'));
    assert.ok(todo.student.includes('File the qualifier completion form with the Grad Admin (§4.4).'));
    assert.ok(todo.student.includes('Send the Grad Admin the processing request for CS 50300 (with my transcripts attached).'));
    assert.ok(todo.student.includes('Send the DGS the review request for CS 77777 (with my transcripts attached).'));
    const { text, html, subject } = advisorSummary(r, { todayIso: '2029-05-01', entryTerm: 'Fall 2026', priorStudy: 'Completed prior M.S. or Ph.D.', gpa: 3.5 });
    assert.equal(subject, 'Degree self-check — Ph.D., entered Fall 2026 — nothing not yet met — 0 in progress, 1 needs DGS review');
    assert.match(text, /\nWHAT THE GRAD ADMIN NEEDS TO DO\n- Process the MSCSE awarded along the way \(§4\.5\)\.\n/);
    assert.match(html, /<p><strong>What the Grad Admin needs to do<\/strong><\/p><ul><li>Process the MSCSE awarded along the way/);
  });
});
