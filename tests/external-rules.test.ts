// The ExternalCourses tab (courses at other universities, decisions 2026-09-01):
// parsing + diagnostics, forgiving matching, and how a DGS ruling changes the
// engine — core knowledge confirmed outright (§4.4.1), transferability
// pre-approved / denied / undecided (§5.2), pro-rata nd_credits, and the
// Bachelor's-level rule (core knowledge yes, transfer credit never).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { findExternalRule, normalizeCourseId, normalizeUniversity } from '../src/data/external.ts';
import { buildCombinedReviewRequest } from '../src/transcript/external.ts';
import { parseExternalTab } from '../src/data/parse.ts';
import type { SheetIssue } from '../src/data/types.ts';
import { audit } from '../src/engine/audit.ts';
import { classify } from '../src/engine/allocate.ts';
import type { CourseEntry, Student } from '../src/engine/types.ts';
import { buildRules } from './helpers.ts';

const CORE = [
  { code: 'os', name: 'Operating Systems' },
  { code: 'algorithms', name: 'Algorithms' },
  { code: 'architecture', name: 'Computer Architecture' },
];

const student = (courses: Partial<CourseEntry>[], priorMs: Student['priorMs'] = 'completed'): Student => ({
  schemaVersion: 1,
  program: 'phd',
  entryTerm: { season: 'fall', year: 2026 },
  priorMs,
  courses: courses.map((c) => ({
    courseId: 'CS 50300',
    credits: 3,
    term: { season: 'fall', year: 2024 },
    grade: 'A',
    origin: 'transfer',
    institution: 'Purdue University',
    ...c,
  })) as CourseEntry[],
  milestones: {},
  attestations: {},
});

const rules = buildRules(); // fixture ExternalCourses tab included

describe('ExternalCourses parsing', () => {
  it('reads the fixture rows and skips the prose note row', () => {
    assert.equal(rules.external.length, 4);
    assert.equal(rules.issues.filter((i) => i.tab === 'ExternalCourses').length, 0);
  });

  it('reports bad values in plain English and keeps the rest of the row', () => {
    const issues: SheetIssue[] = [];
    const rows = parseExternalTab(
      'university,course_id,course_title,satisfies_core_area,transferable,nd_credits\n' +
        'Purdue University,CS 1,Good,os,yes,3\n' +
        'Purdue University,CS 2,Bad core,networking,yes,\n' +
        'Purdue University,CS 3,Bad transferable,os,maybe,\n' +
        'Purdue University,CS 4,Bad credits,os,yes,lots\n' +
        ',CS 5,No university,,,\n',
      CORE,
      issues,
    );
    assert.equal(rows.length, 4); // the university-less row is skipped entirely
    assert.equal(rows[1]?.satisfiesCoreArea, undefined);
    assert.equal(rows[2]?.transferable, undefined);
    assert.equal(rows[3]?.ndCredits, undefined);
    assert.equal(issues.length, 4);
    for (const i of issues) assert.match(i.message, /ExternalCourses row \d/);
    assert.match(issues[0]!.message, /not one of the Categories tab/);
    assert.match(issues[1]!.message, /'yes', 'no' or blank/);
    assert.match(issues[2]!.message, /not a number/);
  });

  it('warns on duplicate (university, course) pairs — first row wins', () => {
    const issues: SheetIssue[] = [];
    const rows = parseExternalTab(
      'university,course_id,transferable\nPURDUE UNIVERSITY,CS 1,yes\nPurdue-University,CS-1,no\n',
      CORE,
      issues,
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.transferable, true);
    assert.match(issues[0]?.message ?? '', /first row wins/);
  });

  it('a leftover university_aliases column is ignored, with one gentle warning', () => {
    const issues: SheetIssue[] = [];
    const rows = parseExternalTab(
      'university,university_aliases,course_id,transferable\nPURDUE UNIVERSITY,Purdue;PU,CS 1,yes\n',
      CORE,
      issues,
    );
    assert.equal(rows.length, 1);
    assert.equal(findExternalRule(rows, 'Purdue', 'CS 1'), undefined); // the alias no longer matches
    assert.ok(findExternalRule(rows, 'purdue university', 'CS 1'));
    assert.equal(issues.length, 1);
    assert.match(issues[0]!.message, /no longer used/);
    assert.match(issues[0]!.message, /can be deleted/);
  });
});

describe('matching is forgiving about spelling, never about identity', () => {
  it('normalizes case, punctuation, diacritics and spacing', () => {
    assert.equal(normalizeUniversity('  Université  de Montréal! '), 'universite de montreal');
    assert.equal(normalizeCourseId('cs-50300'), 'CS50300');
    assert.equal(normalizeCourseId('CS 503 00'), 'CS50300');
  });

  it('finds rules via the transcript-printed name — forgiving spelling, no aliases', () => {
    for (const uni of ['PURDUE UNIVERSITY', 'Purdue University', ' purdue-university ']) {
      assert.ok(findExternalRule(rules.external, uni, 'cs 50300'), uni);
    }
    assert.ok(findExternalRule(rules.external, 'Université de Montréal', 'IFT 2125')); // diacritics stripped both ways
    assert.ok(findExternalRule(rules.external, 'Tsinghua University', '30240233'));
    assert.equal(findExternalRule(rules.external, 'Purdue', 'CS 50300'), undefined); // abbreviations no longer match
    assert.equal(findExternalRule(rules.external, '清华大学', '30240233'), undefined); // native script retired with aliases
    assert.equal(findExternalRule(rules.external, 'Purdue University', 'CS 99999'), undefined);
    assert.equal(findExternalRule(rules.external, 'Indiana University', 'CS 50300'), undefined);
    assert.equal(findExternalRule(rules.external, '', 'CS 50300'), undefined);
  });
});

describe('the combined review request (one email for everything, 2026-09-03)', () => {
  const built = buildCombinedReviewRequest(
    [
      { courseId: 'MATH 60610', title: 'Real Analysis I', credits: 3, grade: 'A', termText: 'Fall 2026', reason: 'not in the course rules yet', unlisted: true },
      { courseId: 'CSE 40567', credits: 3, grade: 'B', termText: 'Fall 2026', reason: 'needs advisor + DGS approval per the rules sheet', unlisted: false },
    ],
    [
      { institution: 'Purdue University', courseId: 'CS 50300', title: 'Operating Systems', credits: 3, grade: 'A', termText: 'Fall 2023', slotLabel: 'Previous Master\u2019s Transcript', reason: 'not yet reviewed by the DGS', unlisted: true },
      { institution: 'Purdue University', courseId: 'CS 51400', title: 'Data & "Structures" <II>', credits: 1, grade: 'B+', termText: 'Fall 2024', reason: 'transferability not yet decided', unlisted: false },
    ],
  );

  it('is one email, addressed to both decision-makers', () => {
    assert.match(built.text, /^Subject: Course review request/);
    assert.match(built.text, /Dear DGS and Graduate Program Administrator,/);
  });

  it('text flavor: one tab-separated section per sheet tab, rows only for unlisted courses', () => {
    const { text } = built;
    assert.ok(text.includes('MATH 60610\tReal Analysis I'), 'Courses-tab row');
    assert.ok(text.includes('PURDUE UNIVERSITY\tCS 50300\tOperating Systems'), 'ExternalCourses-tab row, university upper-cased');
    assert.ok(!text.includes('CSE 40567\t'), 'sheet-listed ND course gets no new row');
    assert.ok(!text.includes('\tCS 51400'), 'ruled-but-undecided external course gets no new row');
    assert.match(text, /CSE 40567 \(Notre Dame\): 3 credits, grade B, Fall 2026 \u2014 needs advisor \+ DGS approval/u);
    assert.match(text, /Fall 2023 \(Previous Master\u2019s Transcript\) \u2014 not yet reviewed by the DGS/u);
    assert.match(text, /paste into the sheet/);
  });

  it('html flavor: real tables (tabs do not survive HTML email), entities escaped', () => {
    const { html } = built;
    assert.equal((html.match(/<table/g) ?? []).length, 2, 'one table per sheet tab');
    assert.ok(html.includes('<tr><td>MATH 60610</td><td>Real Analysis I</td></tr>'));
    assert.ok(html.includes('<tr><td>PURDUE UNIVERSITY</td><td>CS 50300</td><td>Operating Systems</td></tr>'));
    assert.ok(html.includes('Data &amp; &quot;Structures&quot; &lt;II&gt;'), 'titles are HTML-escaped');
    assert.ok(!html.includes('<II>'), 'no raw markup leaks from titles');
  });

  it('a section with no unlisted rows disappears entirely', () => {
    const only = buildCombinedReviewRequest(
      [{ courseId: 'CSE 40567', credits: 3, grade: 'B', termText: 'Fall 2026', reason: 'needs advisor + DGS approval per the rules sheet', unlisted: false }],
      [],
    );
    assert.ok(!only.text.includes('Rows for the Courses tab'));
    assert.ok(!only.text.includes('Rows for the ExternalCourses tab'));
    assert.equal((only.html.match(/<table/g) ?? []).length, 0);
  });
});

describe('what a DGS ruling changes in the engine', () => {
  it('confirmed core area → the §4.4.1 row is MET, not needs-review', () => {
    const report = audit(student([{ courseId: 'CS 50300' }]), rules, '2026-09-01');
    const os = report.requirements.find((r) => r.id === 'phd.qualifier.core.os');
    assert.equal(os?.status, 'met');
    assert.match(os?.detail ?? '', /confirmed in the DGS’s external-course rules/);
  });

  it("a Bachelor's-level course earns no credit but still satisfies core knowledge", () => {
    const report = audit(student([{ courseId: 'CS 50300', degreeLevel: 'bachelors' }]), rules, '2026-09-01');
    const os = report.requirements.find((r) => r.id === 'phd.qualifier.core.os');
    const transfer = report.requirements.find((r) => r.id === 'phd.transfer');
    assert.equal(os?.status, 'met');
    assert.match(transfer?.detail ?? '', /0 of 24 transfer credits counted/);
    assert.match(transfer?.detail ?? '', /Bachelor's coursework cannot transfer/);
  });

  it('transferable=no → not counted, with the DGS ruling named', () => {
    const { classified } = classify(student([{ courseId: 'CS 59000' }]), rules);
    // The message quotes the university as the sheet spells it (capital English).
    assert.match(classified[0]?.ineligibleReason ?? '', /ruled this PURDUE UNIVERSITY course non-transferable/);
  });

  it('transferable=yes → still provisional until the §5.2 request, but pre-approved wording', () => {
    const { classified } = classify(student([{ courseId: 'CS 50300' }]), rules);
    assert.equal(classified[0]?.tier, 'provisional');
    assert.match(classified[0]?.approvalPending ?? '', /pre-approved in the DGS’s external-course rules/);
    const report = audit(student([{ courseId: 'CS 50300' }]), rules, '2026-09-01');
    const transfer = report.requirements.find((r) => r.id === 'phd.transfer');
    assert.equal(transfer?.status, 'needs_dgs_review');
    assert.match(transfer?.detail ?? '', /Pre-approved in the DGS’s external-course rules: CS 50300/);
  });

  it('transferable undecided vs not reviewed at all — different pending messages', () => {
    const undecided = classify(student([{ courseId: 'IFT-2125', institution: 'Université de Montréal', term: { season: 'fall', year: 2024 } }]), rules);
    assert.match(undecided.classified[0]?.approvalPending ?? '', /transferability is not yet decided/);
    const unreviewed = classify(student([{ courseId: 'CS 77777' }]), rules);
    assert.match(unreviewed.classified[0]?.approvalPending ?? '', /not yet reviewed by the DGS/);
    const report = audit(student([{ courseId: 'CS 77777' }]), rules, '2026-09-01');
    const transfer = report.requirements.find((r) => r.id === 'phd.transfer');
    assert.match(transfer?.detail ?? '', /Not yet reviewed by the DGS: CS 77777/);
  });

  it('nd_credits (pro-rata, §5.2) is what counts — not the transcript credits', () => {
    const s = student([{ courseId: '30240233', institution: 'Tsinghua University', credits: 4 }]);
    s.attestations.transferApproved = true;
    const report = audit(s, rules, '2026-09-01');
    const transfer = report.requirements.find((r) => r.id === 'phd.transfer');
    assert.match(transfer?.detail ?? '', /2\.5 of 24 transfer credits counted/);
    const line = report.courseLines.find((l) => l.courseId === '30240233');
    assert.match(line?.text ?? '', /counted as 2\.5 ND credits/);
  });

  it('the app still runs with no ExternalCourses tab at all — everything degrades to unreviewed', () => {
    const bare = buildRules({ external: [] });
    assert.equal(bare.external.length, 0);
    const report = audit(student([{ courseId: 'CS 50300' }]), bare, '2026-09-01');
    const os = report.requirements.find((r) => r.id === 'phd.qualifier.core.os');
    assert.equal(os?.status, 'unmet'); // nothing claimed, nothing confirmed
  });
});
