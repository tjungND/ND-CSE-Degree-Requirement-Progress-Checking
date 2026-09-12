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
import { signOffActors } from '../src/engine/requirements/shared.ts';
import { actionItems, advisorSummary } from '../src/ui/advisor-summary.ts';
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
    assert.equal(rules.external.length, 7); // incl. the `none` row (2026-09-06), the quarter-system row and the `dgs_approval` row (2026-09-08)
    assert.equal(rules.issues.filter((i) => i.tab === 'ExternalCourses').length, 0);
  });

  it('reports bad values in plain English and keeps the rest of the row', () => {
    const issues: SheetIssue[] = [];
    const rows = parseExternalTab(
      'university,course_id,course_title,satisfies_core_area,transferable_PhD,nd_credits\n' +
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
    assert.equal(rows[2]?.transferablePhd, undefined);
    assert.equal(rows[3]?.ndCredits, undefined);
    assert.equal(issues.length, 4);
    for (const i of issues) assert.match(i.message, /ExternalCourses row \d/);
    assert.match(issues[0]!.message, /not one of the Categories tab/);
    assert.match(issues[1]!.message, /'yes', 'no', 'dgs_approval', 'adgs_approval' or blank/);
    assert.match(issues[2]!.message, /not a number/);
  });

  it('warns on duplicate (university, course) pairs — the last row wins (DGS 2026-09-06)', () => {
    const issues: SheetIssue[] = [];
    const rows = parseExternalTab(
      'university,course_id,transferable_PhD\nPURDUE UNIVERSITY,CS 1,yes\nPurdue-University,CS-1,no\n',
      CORE,
      issues,
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.transferablePhd, 'no', 'the later row (transferable = no) replaces the earlier one');
    assert.equal(rows[0]?.sheetRow, 3);
    assert.match(issues[0]?.message ?? '', /the last row wins: row 3 replaces row 2/);
  });

  it('a leftover university_aliases column is ignored, with one gentle warning', () => {
    const issues: SheetIssue[] = [];
    const rows = parseExternalTab(
      'university,university_aliases,course_id,transferable_PhD\nPURDUE UNIVERSITY,Purdue;PU,CS 1,yes\n',
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
  const built = buildCombinedReviewRequest({
    priorStudy: 'Completed prior M.S. or Ph.D.',
    nd: [
      { courseId: 'MATH 60610', title: 'Real Analysis I', credits: 3, grade: 'A', termText: 'Fall 2026', reason: 'not in the course rules yet', unlisted: true },
      { courseId: 'CSE 40567', credits: 3, grade: 'B', termText: 'Fall 2026', reason: 'needs advisor + DGS approval per the rules sheet', unlisted: false },
    ],
    external: [
      { institution: 'Purdue University', courseId: 'CS 50300', title: 'Operating Systems', credits: 3, grade: 'A', termText: 'Fall 2023', slotLabel: 'Previous Master\u2019s Transcript', reason: 'not yet reviewed by the DGS', unlisted: true },
      { institution: 'Purdue University', courseId: 'CS 51400', title: 'Data & "Structures" <II>', credits: 1, grade: 'B+', termText: 'Fall 2024', slotLabel: 'Previous Master\u2019s Transcript', reason: 'transferability not yet decided', unlisted: false },
    ],
  });

  // A student may take the same course several times — a master's project or
  // thesis credit — and every attempt used to become its own paste-ready row,
  // which is how the sheet collected duplicates that shadow each other (DGS
  // 2026-09-09, seeing eight duplicated pairs in the live tab).
  it('the paste-ready rows are one per course, while the details keep every attempt', () => {
    const twice = buildCombinedReviewRequest({
      priorStudy: 'Completed prior M.S. or Ph.D.',
      nd: [
        { courseId: 'CSE 63900', title: 'Master Project', credits: 3, grade: 'S', termText: 'Fall 2026', reason: 'not in the course rules yet', unlisted: true },
        { courseId: 'CSE 63900', title: 'Master Project', credits: 3, grade: 'S', termText: 'Spring 2027', reason: 'not in the course rules yet', unlisted: true },
      ],
      external: [
        // The sheet matches ids without spaces and hyphens, so these are one
        // course and must not become two rows.
        { institution: 'Purdue University', courseId: 'CS 59800', title: 'Thesis', credits: 3, grade: 'A', termText: 'Fall 2023', reason: 'not yet reviewed by the DGS', unlisted: true },
        { institution: 'PURDUE UNIVERSITY', courseId: 'CS-59800', title: 'Thesis', credits: 3, grade: 'A', termText: 'Spring 2024', reason: 'not yet reviewed by the DGS', unlisted: true },
      ],
    });
    // Between one table's heading and the next: the paste-ready rows alone.
    const between = (from: string, to: string): string => twice.text.slice(twice.text.indexOf(from) + from.length, twice.text.indexOf(to));
    const coursesTab = between('rules sheet — Courses tab:', 'rules sheet — ExternalCourses tab:');
    const externalTab = between('rules sheet — ExternalCourses tab:', 'Course details:');
    assert.equal((coursesTab.match(/CSE 63900/g) ?? []).length, 1, 'one Courses-tab row for the repeated course: ' + coursesTab);
    assert.equal((externalTab.match(/CS[- ]59800/g) ?? []).length, 1, 'one ExternalCourses row, whichever way the id is spaced: ' + externalTab);
    assert.match(twice.text, /one row per course — a course taken more than once is listed once here/);
    // The details are the evidence: both terms are still there.
    assert.match(twice.text, /Fall 2026/);
    assert.match(twice.text, /Spring 2027/);
    assert.match(twice.text, /Fall 2023/);
    assert.match(twice.text, /Spring 2024/);
  });

  it('says nothing about repeats when there are none', () => {
    assert.doesNotMatch(built.text, /one row per course/);
  });

  it('is one email to the DGS (2026-09-06: not the Grad Admin), says self-check (not audit), and carries prior graduate study', () => {
    assert.match(built.text, /^Subject: Course review request/);
    assert.match(built.text, /Dear DGS,\n/);
    assert.doesNotMatch(built.text, /Grad Admin/);
    assert.match(built.text, /Prior graduate study: Completed prior M\.S\. or Ph\.D\./);
    assert.match(built.text, /transcripts .* are attached to this email/i);
    assert.ok(!built.text.includes('audit'), 'the request says self-check, never audit');
    // The human half (sign-off included) sits ABOVE one line; everything
    // machine-readable is below it, marked exactly once.
    assert.equal(built.text.match(/DO NOT MODIFY/g)?.length, 1);
    // The student's half is marked editable right above the divider (2026-09-06).
    assert.match(built.text, /Thank you!\n\n\(You may edit anything above this line\)\n-{10,}\n\(DO NOT MODIFY ANYTHING BELOW THIS LINE\)/);
    assert.ok(built.text.indexOf('(DO NOT MODIFY') < built.text.indexOf('Courses tab'), 'the line precedes the tables');
  });

  it('text flavor: one table per sheet tab, rows only for unlisted courses', () => {
    const { text } = built;
    assert.match(text, /imported to the DGS\u2019s rules sheet \u2014 Courses tab:/u);
    assert.match(text, /imported to the DGS\u2019s rules sheet \u2014 ExternalCourses tab:/u);
    assert.ok(text.includes('MATH 60610\tReal Analysis I'), 'Courses-tab row');
    assert.ok(text.includes('Purdue University\tCS 50300\tOperating Systems'), 'ExternalCourses-tab row, university as the record spells it (2026-09-06, late evening: no upper-casing)');
    assert.ok(!text.includes('CSE 40567\t'), 'sheet-listed ND course gets no new row');
    assert.ok(!text.includes('\tCS 51400'), 'ruled-but-undecided external course gets no new row');
  });

  it('details: one table per transcript, below the line (2026-09-06: tables, not bullet lines)', () => {
    const { text } = built;
    assert.match(text, /Course details:/);
    const header = 'Course | Title | Credits | Grade | Term | Why it needs a decision';
    assert.match(text, new RegExp(`Notre Dame:\\n${header.replace(/[|]/g, '\\|')}\\nMATH 60610 \\| Real Analysis I \\| 3 \\| A \\| Fall 2026 \\| not in the course rules yet\\n`));
    assert.match(text, /Previous Master\u2019s Transcript \u2014 Purdue University:\n[^\n]*\nCS 50300 \| Operating Systems \| 3 \| A \| Fall 2023 \| not yet reviewed by the DGS/u);
    assert.match(text, /CSE 40567 \|  \| 3 \| B \| Fall 2026 \| needs advisor \+ DGS approval/u);
    assert.match(text, /CS 51400 \| .* \| 1 \| B\+ \| Fall 2024 \| transferability not yet decided/u);
  });

  it('html flavor: real tables (tabs do not survive HTML email), entities escaped, one details table per transcript', () => {
    const { html } = built;
    assert.equal((html.match(/<table/g) ?? []).length, 4, 'one table per sheet tab + one per transcript in the details');
    assert.ok(html.includes('<p><strong>(You may edit anything above this line)</strong></p><hr><p><strong>(DO NOT MODIFY ANYTHING BELOW THIS LINE)</strong></p>'), 'both markers around the line in HTML');
    assert.ok(html.includes('<tr><td>MATH 60610</td><td>Real Analysis I</td></tr>'));
    assert.ok(html.includes('<tr><td>Purdue University</td><td>CS 50300</td><td>Operating Systems</td></tr>'));
    assert.ok(html.includes('<p><strong>Notre Dame:</strong></p><table'));
    assert.ok(html.includes('<tr><th>Course</th><th>Title</th><th>Credits</th><th>Grade</th><th>Term</th><th>Why it needs a decision</th></tr>'));
    assert.ok(html.includes('<tr><td>CSE 40567</td><td></td><td>3</td><td>B</td><td>Fall 2026</td><td>needs advisor + DGS approval per the rules sheet</td></tr>'));
    assert.ok(html.includes('Data &amp; &quot;Structures&quot; &lt;II&gt;'), 'titles are HTML-escaped');
    assert.ok(!html.includes('<II>'), 'no raw markup leaks from titles');
  });

  it('a section with no unlisted rows disappears entirely', () => {
    const only = buildCombinedReviewRequest({
      priorStudy: 'No prior graduate degree',
      nd: [{ courseId: 'CSE 40567', credits: 3, grade: 'B', termText: 'Fall 2026', reason: 'needs advisor + DGS approval per the rules sheet', unlisted: false }],
      external: [],
    });
    assert.equal((only.html.match(/<table/g) ?? []).length, 1, 'only the details table remains');
    assert.ok(!only.text.includes('rules sheet \u2014 Courses tab'));
    assert.ok(!only.text.includes('rules sheet \u2014 ExternalCourses tab'));
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
    // Undergraduate courses are invisible to the transfer card (2026-09-04) —
    // with nothing else entered it reads as if no transfer courses exist.
    assert.equal(transfer?.status, 'not_applicable');
    assert.match(transfer?.detail ?? '', /No transfer courses entered/);
    // The per-course line focuses on the core knowledge the DGS confirmed.
    const line = report.courseLines.find((l) => l.courseId === 'CS 50300');
    assert.match(line?.text ?? '', /satisfies the .* core-knowledge requirement \(§4\.4\.1\) — confirmed by the DGS/);
    // 2026-09-06 dropped "no transfer credit" from the line; the DGS put it
    // back on 2026-09-07 WITH its reason (the student's status, not the
    // course's level). The line is still painted green — a core area earned.
    assert.match(line?.text ?? '', /; taken as an undergraduate student — no transfer credit \(§5\.2\)$/);
    assert.equal(line?.mark, 'counts');
  });

  it('transferable=no → not counted, with the DGS ruling named', () => {
    const { classified } = classify(student([{ courseId: 'CS 59000' }]), rules);
    // The message quotes the university as the sheet spells it (capital English).
    assert.match(classified[0]?.ineligibleReason ?? '', /ruled this Purdue University course non-transferable/);
  });

  it('transferable=yes → still provisional until the §5.2 request, but pre-approved wording, never "pending DGS review" (DGS 2026-09-07)', () => {
    const { classified } = classify(student([{ courseId: 'CS 50300' }]), rules);
    assert.equal(classified[0]?.tier, 'provisional');
    assert.match(classified[0]?.approvalPending ?? '', /pre-approved in the DGS’s external-course rules/);
    const l = audit(student([{ courseId: 'CS 50300' }]), rules, '2026-09-01').courseLines.find((c) => c.courseId === 'CS 50300')!;
    assert.ok(l.text.startsWith('pre-approved by the DGS — will count toward regular courses (3 cr) as transfer credit once the Grad Admin has processed it; send the Grad Admin the processing request (§5.2)'), l.text);
    assert.match(l.text, /; satisfies the Operating Systems core-knowledge requirement \(§4\.4\.1\) — confirmed by the DGS$/, 'the fixture row also confirms a core area');
    assert.doesNotMatch(l.text, /pending DGS review|once approved|transfer credit \(§5\.2\);/);
    assert.equal(l.mark, 'pending', 'amber until processed');
    const report = audit(student([{ courseId: 'CS 50300' }]), rules, '2026-09-01');
    const transfer = report.requirements.find((r) => r.id === 'phd.transfer');
    assert.equal(transfer?.status, 'in_progress', 'nothing left for the DGS to decide — the card is not "Needs DGS review"');
    assert.match(transfer?.detail ?? '', /Pre-approved by the DGS: CS 50300 — final once the Grad Admin has processed the transfer; send the Grad Admin the processing request \(§5\.2\)/);
    assert.doesNotMatch(transfer?.detail ?? '', /Not yet reviewed/);
    // An unreviewed course alongside keeps the card on "Needs DGS review".
    const mixed = audit(student([{ courseId: 'CS 50300' }, { courseId: 'CS 59900', title: 'Special Topics', term: { season: 'spring', year: 2025 } }]), rules, '2026-09-01');
    assert.equal(mixed.requirements.find((r) => r.id === 'phd.transfer')?.status, 'needs_dgs_review');
  });

  // The DGS's third value (2026-09-08): a course outside the usual CSE ground
  // that can still transfer when it serves the student's dissertation. It is a
  // decision about the COURSE and an open question about the STUDENT, so it
  // behaves like a candidate everywhere — never pre-approved, never processed
  // by the Grad Admin without the DGS's ruling — but says why.
  it('transferable=dgs_approval → a candidate, stated plainly and never explained at the student', () => {
    const one = [{ courseId: 'STAT 51200', title: 'Applied Regression Analysis', term: { season: 'fall' as const, year: 2024 } }];
    const { classified } = classify(student(one), rules);
    assert.equal(classified[0]?.tier, 'provisional');
    assert.match(classified[0]?.approvalPending ?? '', /^transfer — needs DGS approval \(§5\.2\)/);
    // The rule is EXPLAINED once, in the review card (DGS 2026-09-08); every
    // other surface states the fact and stops. No second person here either:
    // this string is copied verbatim into the advisor e-mail, which re-voices
    // only the requirement details. And no claim about the course's subject —
    // a case-by-case course may have a confirmed §4.4.1 core area beside it.
    assert.doesNotMatch(classified[0]?.approvalPending ?? '', /\byour\b|research|outside the usual CSE ground/i);
    assert.doesNotMatch(classified[0]?.approvalPending ?? '', /^pre-approved/);
    assert.equal(classified[0]?.ineligibleReason, undefined, 'it is not ruled out — it can still transfer');

    const report = audit(student(one), rules, '2026-09-01');
    const line = report.courseLines.find((c) => c.courseId === 'STAT 51200')!;
    assert.ok(line.text.startsWith('pending DGS review — candidate for transfer credit (§5.2)'), line.text);
    assert.doesNotMatch(line.text, /case by case|research/, 'the course line is not where the rule is explained: ' + line.text);
    assert.equal(line.mark, 'pending');

    const transfer = report.requirements.find((r) => r.id === 'phd.transfer');
    assert.equal(transfer?.status, 'needs_dgs_review', 'the DGS still has this student’s case to decide');
    assert.match(transfer?.detail ?? '', /Needs DGS approval: STAT 51200\./);
    assert.doesNotMatch(transfer?.detail ?? '', /research/, 'nor the transfer card');
    assert.doesNotMatch(transfer?.detail ?? '', /Pre-approved by the DGS/);
    assert.doesNotMatch(transfer?.detail ?? '', /Not yet reviewed by the DGS/, 'the DGS HAS reviewed the course — what is open is the student’s case');

    // Who is asked to act. The advisor summary routes by the WORDING of the
    // pending reason, not by the sheet value, so a reworded string could
    // silently send this course to the Grad Admin — it must not.
    // Nothing anywhere asks the student to make the case for the course: that
    // is between the advisor and the DGS (2026-09-08).
    for (const text of [line.text, transfer?.detail ?? '', classified[0]?.approvalPending ?? '']) {
      assert.doesNotMatch(text, /research|say how/i, text);
    }
    const todo = actionItems(report);
    assert.ok(todo.dgs.some((t) => t.includes('STAT 51200')), JSON.stringify(todo.dgs));
    assert.ok(!todo.gradAdmin.some((t) => t.includes('STAT 51200')), JSON.stringify(todo.gradAdmin));
    assert.ok(todo.student.some((t) => /Send the DGS the review request/.test(t) && t.includes('STAT 51200')), JSON.stringify(todo.student));
    // And the approvals row files it under the DGS, not the Grad Admin.
    const approvals = report.requirements.find((r) => r.id === 'shared.approvals');
    assert.equal(approvals?.status, 'needs_dgs_review');
    const lead = (approvals?.detailParts ?? []).find((pt) => typeof pt !== 'string' && pt.items.some((i) => i.startsWith('STAT 51200')));
    assert.match(typeof lead === 'string' ? lead : (lead?.lead ?? ''), /The DGS has still to decide these/);
  });

  it('transferable undecided vs not reviewed at all — different pending messages', () => {
    const undecided = classify(student([{ courseId: 'IFT-2125', institution: 'Université de Montréal', term: { season: 'fall', year: 2024 } }]), rules);
    assert.match(undecided.classified[0]?.approvalPending ?? '', /transferability is not yet decided/);
    // The transfer card names all four kinds of pending course; a listed row
    // with a blank cell used to be the one it left silent (2026-09-08).
    const listed = audit(student([{ courseId: 'IFT-2125', institution: 'Université de Montréal', term: { season: 'fall', year: 2024 } }]), rules, '2026-09-01');
    assert.match(
      listed.requirements.find((r) => r.id === 'phd.transfer')?.detail ?? '',
      /Reviewed by the DGS, but transferability not yet decided: IFT-2125\./,
    );
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

// §5.2 criterion 2 — "the student had graduate student status when they took
// these courses" (DGS 2026-09-06: graduate-level courses taken before the
// bachelor's degree do not count). The award term is Student.bachelorsAwarded.
describe('graduate student status — §5.2 criterion 2 (DGS 2026-09-06)', () => {
  const withBachelors = (courses: Partial<CourseEntry>[], awarded: Student['bachelorsAwarded'] = { season: 'spring', year: 2024 }): Student => ({
    ...student(courses),
    bachelorsAwarded: awarded,
  });
  const line = (s: Student, courseId: string) => audit(s, rules, '2026-09-01').courseLines.find((l) => l.courseId === courseId);

  it('a course dated in or before the award term earns no transfer credit; an unknown award term changes nothing', () => {
    const before = classify(withBachelors([{ courseId: 'CS 51000', title: 'Algorithms', term: { season: 'fall', year: 2023 } }]), rules).classified[0]!;
    assert.equal(before.pool, 'none');
    assert.match(before.ineligibleReason ?? '', /^not counted — taken before your bachelor’s degree was awarded \(Spring 2024\), so not as a graduate student \(§5\.2\); may still satisfy the Algorithms/);
    const inTerm = classify(withBachelors([{ courseId: 'CS 52300', title: 'Compilers', term: { season: 'spring', year: 2024 } }]), rules).classified[0]!;
    assert.match(inTerm.ineligibleReason ?? '', /taken in the term your bachelor’s degree was awarded/);
    const after = classify(withBachelors([{ courseId: 'CS 52300', title: 'Compilers', term: { season: 'summer', year: 2024 } }]), rules).classified[0]!;
    assert.equal(after.pool, 'regular');
    const unknown = classify(student([{ courseId: 'CS 51000', title: 'Algorithms', term: { season: 'fall', year: 2023 } }]), rules).classified[0]!;
    assert.equal(unknown.pool, 'regular', 'no award term → degreeLevel decides, as before');
  });

  it('the award term is absolute: a transferable=yes ruling does not restore a pre-bachelor’s course (DGS, later 2026-09-06), its core note stays', () => {
    const ruled = classify(withBachelors([{ courseId: 'CS 50300', title: 'Operating Systems', term: { season: 'fall', year: 2023 } }]), rules).classified[0]!;
    assert.equal(ruled.pool, 'none');
    assert.match(ruled.ineligibleReason ?? '', /^not counted — taken before your bachelor’s degree was awarded \(Spring 2024\)/);
    assert.match(ruled.ineligibleReason ?? '', /satisfies the Operating Systems core-knowledge requirement \(§4\.4\.1\) — confirmed by the DGS/);
    const after = classify(withBachelors([{ courseId: 'CS 50300', title: 'Operating Systems', term: { season: 'fall', year: 2024 } }]), rules).classified[0]!;
    assert.equal(after.pool, 'regular', 'after the award the ruling applies as before');
    assert.match(after.approvalPending ?? '', /^pre-approved/);
  });

  // 2026-09-11: a line that says "not counted" is never green, whatever core
  // area it also earns — that fact has its own §4.4.1 row. Keyword titles stay
  // amber (a review could still confirm them).
  it('marks: a "not counted" line is red even with a confirmed core area; a keyword title amber', () => {
    const confirmed = line(withBachelors([{ courseId: 'IFT-2125', title: 'Introduction à l’algorithmique', institution: 'Université de Montréal', term: { season: 'fall', year: 2023 } }]), 'IFT-2125')!;
    assert.match(confirmed.text, /^not counted — taken before/);
    assert.match(confirmed.text, /confirmed by the DGS/);
    assert.equal(confirmed.mark, 'excluded');
    assert.equal(line(withBachelors([{ courseId: 'CS 51000', title: 'Algorithms', term: { season: 'fall', year: 2023 } }]), 'CS 51000')!.mark, 'excluded');
    assert.equal(line(withBachelors([{ courseId: 'CS 52300', title: 'Compilers', term: { season: 'fall', year: 2023 } }]), 'CS 52300')!.mark, 'excluded');
  });

  it('an award term that is not before the entry term is warned about', () => {
    const report = audit(withBachelors([], { season: 'fall', year: 2026 }), rules, '2026-09-01');
    assert.ok(report.warnings.some((w) => /not before your entry term \(Fall 2026\)/.test(w)), JSON.stringify(report.warnings));
  });
});

// Who still has to act (DGS 2026-09-07). The row used to say "Needs DGS
// review" whenever anything was outstanding — even when every course was
// pre-approved and only the Grad Admin had work left, or when the only gap
// was the advisor's plan-of-study approval.
describe('the sign-off row names who must act (2026-09-07)', () => {
  const withPlanApproved = (courses: Partial<CourseEntry>[]): Student => {
    const s = student(courses);
    s.attestations.advisorApprovedPlan = true; // isolate the course routing
    return s;
  };
  const approvals = (s: Student) => audit(s, rules, '2026-09-01').requirements.find((r) => r.id === 'shared.approvals')!;

  it('routes every reason string allocate.ts writes', () => {
    assert.deepEqual(signOffActors('pre-approved in the DGS’s external-course rules — to have it processed, send the Grad Admin the processing request (§5.2)'), ['gradAdmin']);
    assert.deepEqual(signOffActors('transfer — not yet reviewed by the DGS; needs DGS + Graduate School approval (§5.2)'), ['dgs']);
    assert.deepEqual(signOffActors('transfer — reviewed by the DGS, but transferability is not yet decided (§5.2)'), ['dgs']);
    assert.deepEqual(signOffActors('not in the rules sheet — counted provisionally; needs DGS review'), ['dgs']);
    assert.deepEqual(signOffActors('the rules sheet does not say whether it counts — needs DGS review'), ['dgs']);
    // Both people, so the course is listed under both.
    assert.deepEqual(signOffActors('non-CSE course — needs advisor + DGS approval (§3.2/§4.2)'), ['advisor', 'dgs']);
    assert.deepEqual(signOffActors('needs advisor + DGS approval per the rules sheet'), ['advisor', 'dgs']);
    assert.deepEqual(signOffActors('wording nobody anticipated'), ['dgs'], 'an unrecognised reason falls back to the DGS');
  });

  it('a pre-approved course is the Grad Admin’s to process, so the row is not "Needs DGS review"', () => {
    const row = approvals(withPlanApproved([{ courseId: 'CS 50300' }]));
    assert.equal(row.title, 'Courses still to be approved or processed');
    assert.equal(row.status, 'in_progress', 'nothing is left for the DGS to decide');
    assert.match(row.detail ?? '', /Already decided by the DGS — the Grad Admin has still to process these: CS 50300/);
    assert.doesNotMatch(row.detail ?? '', /The DGS has still to decide/);
  });

  it('one unreviewed course puts the DGS back in the picture, under its own heading', () => {
    const row = approvals(withPlanApproved([{ courseId: 'CS 50300' }, { courseId: 'CS 59900', title: 'Special Topics', term: { season: 'spring', year: 2025 } }]));
    assert.equal(row.status, 'needs_dgs_review');
    assert.match(row.detail ?? '', /The DGS has still to decide these — send the review request: CS 59900/);
    assert.match(row.detail ?? '', /the Grad Admin has still to process these: CS 50300/);
  });

  it('an unticked plan of study alone is the advisor’s, not a DGS review', () => {
    const s = student([{ courseId: 'CS 50300' }]);
    s.attestations.transferApproved = true; // the course itself is settled
    const row = approvals(s);
    assert.equal(row.status, 'in_progress');
    assert.match(row.detail ?? '', /advisor approved your plan of study/);
    assert.doesNotMatch(row.detail ?? '', /The DGS has still to decide/);
  });

  // Regression (2026-09-07): splitting the row into per-actor groups made a
  // course that needs BOTH the advisor and the DGS appear in two groups, and
  // the summary the student emails named it twice in one sentence.
  it('a course needing two people is named once — on screen and in the emailed summary', () => {
    const s: Student = {
      ...student([]),
      courses: [{ courseId: 'MATH 60610', title: 'Real Analysis I', credits: 3, term: { season: 'fall', year: 2026 }, grade: 'A', origin: 'nd' } as CourseEntry],
    };
    const report = audit(s, rules, '2027-03-01');
    const row = report.requirements.find((r) => r.id === 'shared.approvals')!;
    assert.match(row.detail ?? '', /Your advisor and the DGS must both approve these — send the review request/);
    assert.equal((row.detail ?? '').split('MATH 60610').length - 1, 1, 'listed once on screen');
    assert.equal(row.status, 'needs_dgs_review', 'the DGS is one of the two');

    const built = advisorSummary(report, { todayIso: '2027-03-01', entryTerm: 'Fall 2026', priorStudy: 'Completed prior M.S. or Ph.D.', gpa: 3.5 });
    const line = built.text.split('\n').find((l) => /review request for/.test(l)) ?? '';
    assert.equal(line.split('MATH 60610').length - 1, 1, `named once in the emailed summary, got: ${line}`);
  });

  // A DGS ruling can answer §5.2 and leave §4.4.1 blank: the transfer is the
  // Grad Admin's to process, but the review request still asks about the core
  // area, so the row must not claim the DGS is finished (2026-09-07).
  it('a pre-approved transfer whose core area is undecided belongs to the DGS as well', () => {
    const half = buildRules({ external: [{ university: 'PURDUE UNIVERSITY', course_id: 'CS 51400', course_title: 'Numerical Algorithms', satisfies_core_area: '', transferable: 'yes' }] });
    const s = student([{ courseId: 'CS 51400', title: 'Numerical Algorithms', degreeLevel: 'masters' }]);
    s.attestations.advisorApprovedPlan = true;
    const row = audit(s, half, '2027-03-01').requirements.find((r) => r.id === 'shared.approvals')!;
    assert.equal(row.status, 'needs_dgs_review', 'the DGS still has the core area to record');
    assert.match(row.detail ?? '', /The transfer is approved — the Grad Admin processes it, and the DGS has still to record the core-knowledge area/);
    assert.equal((row.detail ?? '').split('CS 51400').length - 1, 1, 'listed once');
  });

  it('nothing outstanding: the row does not apply', () => {
    const s = student([{ courseId: 'CS 50300' }]);
    s.attestations.transferApproved = true;
    s.attestations.advisorApprovedPlan = true;
    const row = approvals(s);
    assert.equal(row.status, 'not_applicable');
    assert.equal(row.detail, 'No entered course that counts toward the degree is waiting on anyone.');
  });
});

// Quarter-system universities (DGS 2026-09-08). nd_credits can only hold one
// fixed number, which is useless for a course worth 2 credits one term and 4
// the next; credit_system converts whatever the student's transcript prints.
describe('credit_system: quarter hours become Notre Dame hours', () => {
  const usc = (courseId: string, credits: number): Student =>
    student([{ courseId, title: 'Analysis of Algorithms', credits, institution: 'University of Southern California', term: { season: 'fall', year: 2024 } }]);

  it('reads the column, and rejects anything but quarter/semester/blank', () => {
    const rule = rules.external.find((r) => r.courseId === 'CSCI 570')!;
    assert.equal(rule.creditSystem, 'quarter');
    assert.equal(rules.external.find((r) => r.courseId === 'CS 50300')?.creditSystem, undefined);
    const issues: SheetIssue[] = [];
    const parsed = parseExternalTab(
      'university,course_id,transferable,credit_system\nX UNIVERSITY,CS 1,yes,trimester\n',
      CORE,
      issues,
    );
    assert.equal(parsed[0]?.creditSystem, undefined, 'a bad value is ignored, the row is kept');
    assert.match(issues[0]?.message ?? '', /credit_system must be 'quarter', 'semester' or blank/);
  });

  it('converts the credits the transcript prints — the exact value, whatever the course is worth', () => {
    const four = classify(usc('CSCI 570', 4), rules).classified[0]!;
    assert.equal(four.effectiveCredits, 4 * (2 / 3));
    assert.equal(four.creditsConverted, true);
    // The same course at 2 credits in another term converts on its own terms —
    // the thing a fixed nd_credits could never do.
    assert.equal(classify(usc('CSCI 570', 2), rules).classified[0]?.effectiveCredits, 2 * (2 / 3));
  });

  it('applies to every course from that university, listed in the tab or not', () => {
    const unlisted = classify(usc('CSCI 999', 4), rules).classified[0]!;
    assert.equal(unlisted.effectiveCredits, 4 * (2 / 3), 'the university, not the row, carries the system');
  });

  it('a fixed nd_credits still wins over the conversion', () => {
    const tsinghua = student([{ courseId: '30240233', credits: 4, institution: 'Tsinghua University', term: { season: 'fall', year: 2024 } }]);
    const c = classify(tsinghua, rules).classified[0]!;
    assert.equal(c.effectiveCredits, 2.5, 'the DGS’s own figure for that course');
    assert.equal(c.creditsConverted, undefined);
  });

  it('a semester university is left alone', () => {
    const purdue = classify(student([{ courseId: 'CS 50300', credits: 3 }]), rules).classified[0]!;
    assert.equal(purdue.effectiveCredits, undefined, 'credits count as printed');
  });

  it('the student’s line says the credits were converted, and reads as a number', () => {
    const l = audit(usc('CSCI 570', 4), rules, '2026-09-01').courseLines.find((c) => c.courseId === 'CSCI 570')!;
    assert.match(l.text, /counted as 2\.67 ND credits converted from the quarter system \(transcript shows 4; §5\.2\)/);
    assert.doesNotMatch(l.text, /2\.66666/);
  });
});
