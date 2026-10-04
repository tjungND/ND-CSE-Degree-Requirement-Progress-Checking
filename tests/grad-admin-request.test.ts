// The processing request for the Grad Admin (DGS request 2026-09-06 evening,
// second pass later that evening): everything processable, every met
// requirement as a table of what satisfies it, the editable / do-not-modify
// markers, the attachments line, the DGS in cc. src/ui/grad-admin-request.ts.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { audit } from '../src/engine/audit.ts';
import type { CourseEntry, Grade, Student } from '../src/engine/types.ts';
import { OCE_FULL } from '../src/ui/first-mention.ts';
import { gradAdminRequest, processingItems, selfCheckFileName } from '../src/ui/grad-admin-request.ts';
import { buildRules } from './helpers.ts';
import { ndCourse, phdStudent, transferCourse } from './helpers/student.ts';

const rules = buildRules(); // fixture ExternalCourses tab: CS 50300 transferable=yes (core os), CS 59000 no
const purdue = (courseId: string, title: string): CourseEntry => transferCourse(courseId, title, { degreeLevel: 'masters' });
const nd = (courseId: string, title: string, season: 'fall' | 'spring', year: number, grade: Grade = 'A', credits = 3): CourseEntry => ndCourse(courseId, { title, credits, term: { season, year }, grade });
const student = (extra: Partial<Student> = {}): Student => phdStudent({
  priorMs: 'completed',
  gpa: 3.5,
  courses: [
    purdue('CS 50300', 'Operating Systems'),
    purdue('CS 59000', 'Special Topics'),
    purdue('CS 77777', 'Unruled Topics'),
    // The candidacy exam needs the coursework complete or in progress (§4.5,
    // enforced since 2026-09-12): eight regular courses at Notre Dame.
    ...['CSE 60641', 'CSE 60111', 'CSE 60321', 'CSE 60427', 'CSE 60535', 'CSE 60762', 'CSE 60770', 'CSE 60876'].map((courseId, i) => ({
      courseId, credits: 3, term: { season: (i % 2 === 0 ? 'fall' : 'spring') as 'fall' | 'spring', year: 2026 + Math.floor(i / 2) + (i % 2) }, grade: 'A' as const, origin: 'nd' as const,
    })),
  ],
  milestones: { advisorIdentified: '2026-09-10', advisorName: 'Prof. Example', candidacyPassed: '2029-04-01' },
  ...extra,
});
const opts = { todayIso: '2029-05-01', entryTerm: 'Fall 2026', priorStudy: 'Completed prior M.S. or Ph.D.', gpa: 3.5 };
const build = (s: Student) => gradAdminRequest(audit(s, rules, opts.todayIso), s, rules, opts);

describe('re-voicing for an email from the student', () => {
  // The engine speaks to the student ("your"); the processing request is the
  // student writing (advisor-summary.ts firstPerson). The seminar row's note for
  // an MSCSE→Ph.D. transfer is one such sentence (2026-10-04).
  it('“your transfer” reads “my transfer”', () => {
    const s = student({ background: { bachelors: 'elsewhere', graduate: 'nd-mscse-transfer', transferredTerm: { season: 'spring', year: 2027 } } });
    const built = build(s);
    assert.match(built.text, /The first year is counted from my transfer into the Ph\.D\. in Spring 2027/);
    assert.doesNotMatch(built.text, /\byour transfer\b/);
  });
});

describe('processingItems', () => {
  // `dgs_approval` (DGS 2026-09-08): the DGS has ruled on the COURSE but not on
  // this student, so the Grad Admin has nothing to process until they do.
  it('a course the DGS decides case by case is not processable until the tick on that course records the approval (per course since 2026-09-27)', () => {
    const withCase = student({ courses: [purdue('STAT 51200', 'Applied Regression Analysis')] });
    const items = processingItems(audit(withCase, rules, opts.todayIso), withCase, rules);
    assert.deepEqual(items.transfers.map((t) => t.courseId), [], 'nothing for the Grad Admin yet');
    assert.doesNotMatch(build(withCase).text, /STAT 51200/, 'and it stays out of the processing request');
    // Once the DGS's approval has come through and the student says so, it is
    // processed like any other approved transfer.
    const attested = { ...withCase, courses: withCase.courses.map((c) => ({ ...c, dgsApproved: true as const })) };
    const after = processingItems(audit(attested, rules, opts.todayIso), attested, rules);
    assert.deepEqual(after.transfers.map((t) => `${t.courseId}:${t.state}`), ['STAT 51200:approved']);
  });

  it('lists the pre-approved transfer, the milestone dates, every met requirement, and the count; unruled and denied courses never appear', () => {
    const s = student();
    const items = processingItems(audit(s, rules, opts.todayIso), s, rules);
    assert.deepEqual(items.transfers.map((t) => `${t.courseId}:${t.state}`), ['CS 50300:pre-approved']);
    assert.deepEqual(items.milestones.map((m) => `${m.label} ${m.date} (${m.section})`), ['Advisor identified 2026-09-10 (§2.3)', `${OCE_FULL} passed 2029-04-01 (§4.5)`]);
    assert.equal(items.advisorName, 'Prof. Example');
    assert.equal(items.msAlongTheWay, false, 'no M.S. coursework at Notre Dame yet');
    assert.ok(items.met.length >= 2, 'the GPA and the OCE rows are met');
    // The met requirements are one LINE on the card, so they are one item in
    // the chip (2026-09-08) — the chip and the card must agree.
    assert.equal(items.count, 4, 'transfer + two milestones + the met-requirements line');
    assert.equal(items.count, items.lines.length, 'the chip counts exactly what the card lists');
    // Since 2026-09-28 the line tallies the open rows too, and the request
    // lists every requirement with its standing.
    // Two overdue since 2026-10-04: this student has no research seminar past the first year (P1-sheet-9).
    assert.match(items.lines.at(-1)!, /^\d+ requirements met, 2 overdue, \d+ in progress, 1 not started — the request lists every requirement with its standing, what meets it so far and its deadline, for the record$/);
    assert.deepEqual(items.standing.map((t) => t.color).filter((c, i, a) => a.indexOf(c) === i), ['red', 'green', 'amber', 'grey'], 'overdue first, then the page’s colours (grey: the dissertation submission, "Not started", since 2026-10-03)');
    assert.ok(!items.standing.some((t) => /Transfer credit from prior/.test(t.heading)), 'the transfer row is the transfer sections’ business');
    assert.match(items.lines[0]!, /^CS 50300 \(Purdue University\) — transfer credit approved by the DGS in the course rules, to be processed \(§5\.2\)$/);
    const headings = items.met.map((t) => t.heading);
    assert.ok(headings.includes('Cumulative GPA of at least 3.0 (§2.2)'), JSON.stringify(headings));
    assert.ok(headings.includes(`${OCE_FULL} passed (§4.5)`), JSON.stringify(headings));
    const gpa = items.met.find((t) => t.heading.startsWith('Cumulative GPA'))!;
    assert.deepEqual(gpa.rows, [['Cumulative GPA', '3.50']]);
    const advisor = items.met.find((t) => t.heading.startsWith('Under continuous advisor'))!;
    assert.deepEqual(advisor.rows, [['Advisor', 'Prof. Example'], ['Date', '2026-09-10']]);
    const oce = items.met.find((t) => t.heading.startsWith(OCE_FULL))!;
    assert.deepEqual(oce.rows, [['Date', '2029-04-01']]);
  });

  it('a tick changes nothing for a yes course and cannot settle an unlisted one (2026-09-27); an M.S. student lists only §3.4 milestones', () => {
    const s = student();
    for (const c of s.courses) c.dgsApproved = true;
    const items = processingItems(audit(s, rules, opts.todayIso), s, rules);
    assert.deepEqual(items.transfers.map((t) => `${t.courseId}:${t.state}`), ['CS 50300:pre-approved']);
    const ms = student({ program: 'mscse', milestones: { thesisDefensePassed: '2028-04-01', candidacyPassed: '2029-04-01' } });
    const msItems = processingItems(audit(ms, rules, opts.todayIso), ms, rules);
    assert.deepEqual(msItems.milestones.map((m) => m.section), ['§3.4']);
  });

  it('course-based requirements table the courses the engine counted; residency tables the semesters', () => {
    // Ph.D.: core knowledge from a Notre Dame course, the two seminars.
    const s = student({
      courses: [nd('CSE 60641', 'Graduate Operating Systems', 'fall', 2026), nd('CSE 63801', 'Research Seminar I', 'fall', 2026, 'S', 1), nd('CSE 63802', 'Research Seminar II', 'spring', 2027, 'S', 1)],
      milestones: {},
      priorMs: 'none',
    });
    const items = processingItems(audit(s, rules, '2027-06-01'), s, rules);
    const os = items.met.find((t) => t.heading === 'Core knowledge: Operating Systems (§4.4.1)')!;
    assert.deepEqual(os.columns, ['Course', 'Title', 'Credits', 'Grade', 'Term', 'Where']);
    assert.deepEqual(os.rows, [['CSE 60641', 'Graduate Operating Systems', '3', 'A', 'Fall 2026', 'Notre Dame']]);
    const seminar = items.met.find((t) => t.heading.startsWith('2 credits of Research Seminar'))!;
    assert.deepEqual(seminar.rows.map((r) => r[0]), ['CSE 63801', 'CSE 63802']);
    // M.S.: one full-time semester (9+ credits) satisfies residency — a semester table.
    const ms = student({
      program: 'mscse',
      priorMs: 'none',
      milestones: {},
      courses: [nd('CSE 60641', 'Graduate Operating Systems', 'fall', 2026), nd('CSE 60111', 'Complexity and Algorithms', 'fall', 2026), nd('CSE 60321', 'Advanced Computer Architecture', 'fall', 2026)],
    });
    const msItems = processingItems(audit(ms, rules, '2027-06-01'), ms, rules);
    const residency = msItems.met.find((t) => t.heading.startsWith('One semester of full-time status'))!;
    assert.deepEqual(residency, { heading: 'One semester of full-time status (or one summer session) (§3.3)', columns: ['Semester'], rows: [['Fall 2026']] });
  });
});

describe('gradAdminRequest', () => {
  it('addresses the Grad Admin with the DGS in cc; carries the subject, the attachments line, the markers and the tables; never says "audit"', () => {
    const built = build(student());
    assert.equal(built.subject, 'Processing request (degree self-check) — Ph.D., entered Fall 2026');
    assert.match(built.text, /^Subject: Processing request \(degree self-check\) — Ph\.D\., entered Fall 2026\n\nDear Grad Admin,\n\n/);
    assert.match(built.text, /The DGS, in cc, decides eligibility; this request is only for processing what has already been decided\./);
    // The same skeleton as the other emails (DGS 2026-09-28): the student
    // line, then the numbered actions above the sign-off.
    assert.match(built.text, /\n\nDear Grad Admin,\n\nStudent: \[your name, netID and NDID\]\n\nCould you process/);
    assert.match(
      built.text,
      /\nAttached: my original transcripts as PDFs\.\n\nACTION REQUESTED\n1\. Process the transfer credit for CS 50300 Operating Systems \(Purdue University, Fall 2024, 3 credits\) — approved by the DGS in the course rules \(§5\.2\)\.\n2\. Record the milestone: Advisor identified, 2026-09-10 \(§2\.3\)\.\n3\. Record the milestone: Oral Candidacy Exam \(OCE\) passed, 2029-04-01 \(§4\.5\)\.\n4\. Keep my standing below on file: 5 requirements met, 2 overdue, 7 in progress, 1 not started\.\n\nThank you!\n\n\(You may edit anything above this line\)\n-{10,}\n\(DO NOT MODIFY ANYTHING BELOW THIS LINE\)\n\nTRANSFER CREDIT TO PROCESS/,
    );
    // ONE course table, each course with every requirement it feeds (DGS 2026-09-28).
    assert.match(built.text, /\nCOURSES COUNTED SO FAR\nCourse\tTitle\tCredits\tGrade\tTerm\tWhere\tCounts toward\nCS 50300\tOperating Systems\t3\tA\tFall 2024\tPurdue University\t60 total credits \(§4\.2\); 24 regular-course credits \(§4\.2\)\nCSE 60641\t\t3\tA\tFall 2026\tNotre Dame\t60 total credits \(§4\.2\); 24 regular-course credits \(§4\.2\); 9 regular credits at ND \(§4\.2\)\n/);
    assert.equal((built.text.match(/CSE 60876\t/g) ?? []).length, 1, 'a course prints once, not under every row it feeds');
    assert.match(built.text, /\nTRANSFER CREDIT TO PROCESS \(§5\.2\) — APPROVED BY THE DGS IN THE COURSE RULES\nUniversity\tCourse\tTitle\tCredits\tND credits\tGrade\tTerm\nPurdue University\tCS 50300\tOperating Systems\t3\t\tA\tFall 2024\n/);
    // The standing list (DGS 2026-09-28): a [WORD] tag per row in plain text.
    // The seminar row leads the overdue rows since 2026-10-04 (P1-sheet-9: the first year is a requirement).
    assert.match(built.text, /\nMY STANDING, REQUIREMENT BY REQUIREMENT\n- \d+ requirements met, 2 overdue, \d+ in progress, 1 not started\.\n\n\[OVERDUE\] 2 credits of Research Seminar in year one \(§4\.2\)\n    !! DEADLINE PASSED: Overdue — was due by the end of Spring 2027 — the first year \(approximate\)\n/);
    assert.match(built.text, /\n\[OVERDUE\] Qualifying examination — all components \(§4\.4\)\n    !! DEADLINE PASSED: Overdue — was due by the end of Spring 2028 \(approximate\)\n/);
    // Lines, not filler tables (DGS 2026-09-28): what meets a row, or its progress re-voiced for an email.
    assert.match(built.text, /\n\[MET\] Cumulative GPA of at least 3\.0 \(§2\.2\)\n    Evidence: cumulative GPA 3\.50\.\n/);
    assert.match(built.text, /\n\[MET\] Under continuous advisor supervision \(§2\.3\)\n    Evidence: advisor Prof\. Example; date 2026-09-10\.\n/);
    assert.match(built.text, /\n\[MET\] OCE passed \(§4\.5\)\n    Evidence: date 2029-04-01\.\n/, 'the full OCE name went to the action list, its first mention');
    assert.match(built.text, /\n\[MET\] At least 9 credits of regular courses taken at Notre Dame \(§4\.2\)\n    Evidence: CSE 60641, CSE 60111, [^\n]*CSE 60876 \(in the course table above\)\.\n/);
    // The seminar row is Overdue since 2026-10-04 (P1-sheet-9); the second-person re-voicing is checked below with a transfer student.
    assert.match(built.text, /\n\[OVERDUE\] 2 credits of Research Seminar in year one \(§4\.2\)\n    !! DEADLINE PASSED: Overdue — was due by the end of Spring 2027 — the first year \(approximate\)\n    Progress: CSE 63801: not yet\. CSE 63802: not yet\. §4\.2 requires both seminars in the first year of the program; talk to the DGS about taking the missing one\.\n/);
    assert.match(built.text, /\n\[IN PROGRESS\] Dissertation defense passed \(§4\.7\)\n    Progress: Not yet passed[^\n]*\n/);
    assert.match(built.text, /\n\[IN PROGRESS\] All requirements complete within 8 years \(§4\.3\)\n    Deadline: Due before Fall 2034 — 8 years after entry \(approximate\)\n\n/, 'a far deadline is stated, not highlighted; no empty progress table');
    assert.match(built.text, /\nGenerated by the CSE degree self-check tool \(alpha version under testing; informational only — every decision rests with the DGS\)\.\n$/);
    assert.ok(!/audit/i.test(built.text.replace(/cse-degree-audit-\w+\.json/g, '')), 'never the word "audit" (the saved file’s name aside)');
    assert.doesNotMatch(built.text, /CS 59000|CS 77777/);
    assert.equal(built.text.split(/oral candidacy exam \(oce\)/i).length - 1, 1, 'the full OCE name once');
    assert.match(built.html, /<p>Dear Grad Admin,<\/p>/);
    assert.match(built.html, /<strong>Attached: my original transcripts/);
    assert.match(built.html, /<p><strong>\(You may edit anything above this line\)<\/strong><\/p><hr><p><strong>\(DO NOT MODIFY ANYTHING BELOW THIS LINE\)<\/strong><\/p>/);
    assert.match(built.html, /<table border="1" cellspacing="0" cellpadding="4"><tr><th>University<\/th><th>Course<\/th>/);
    assert.match(built.html, /<td>Purdue University<\/td><td>CS 50300<\/td><td>Operating Systems<\/td>/);
    // HTML: the page's pill colours inline (mail clients keep no stylesheet).
    // One bordered block per requirement (DGS 2026-09-28, evening), the evidence inside it.
    assert.match(built.html, /<div style="[^"]*border-left:4px solid #10693f;background:#f7f8fa"><p style="margin:0"><span style="[^"]*background:#e4f2ea;color:#10693f">Met<\/span> <strong>Cumulative GPA of at least 3\.0<\/strong> \(§2\.2\)<\/p><p style="margin:4px 0 0">Evidence: cumulative GPA 3\.50\.<\/p><\/div>/);
    assert.match(built.html, /<p>Dear Grad Admin,<\/p><p>Student: <strong>\[your name, netID and NDID\]<\/strong><\/p>/);
    assert.match(built.html, /<p><strong>Action requested<\/strong><\/p><ol><li>Process the transfer credit for CS 50300/);
    assert.match(built.html, /<tr><th>Course<\/th><th>Title<\/th><th>Credits<\/th><th>Grade<\/th><th>Term<\/th><th>Where<\/th><th>Counts toward<\/th><\/tr>/);
    assert.match(built.html, /<span style="[^"]*background:#fbe9e7;color:#a81e14">Overdue<\/span> <strong>Qualifying examination[^<]*<\/strong> \(§4\.4\)<\/p><p style="[^"]*background:#fbe9e7[^"]*"><strong>Deadline passed:<\/strong> Overdue — was due by the end of Spring 2028 \(approximate\)<\/p>/);
    assert.match(built.html, /<span style="[^"]*background:#fbeedd;color:#8e5108">In progress<\/span>/);
    assert.equal(selfCheckFileName('mscse'), 'cse-degree-audit-mscse.json');
  });

  it('omits empty sections; a met requirement alone still makes the request worth sending (2026-09-06, late evening)', () => {
    const bare = student({ courses: [], milestones: {}, attestations: {} });
    const built = build(bare);
    assert.doesNotMatch(built.text, /TRANSFER CREDIT|MSCSE ALONG THE WAY|QUALIFIER COMPLETION FORM/);
    assert.equal(built.items.count, 1, 'nothing but the met-requirements line');
    assert.equal(built.items.count, built.items.lines.length, 'the chip counts exactly what the card lists');
    assert.ok(built.items.met.length >= 1, 'the met GPA row alone activates the Grad Admin button');
    // (the GPA row is met, so the standing list still follows the marker)
    assert.match(built.text, /\(DO NOT MODIFY ANYTHING BELOW THIS LINE\)\n\nMY STANDING, REQUIREMENT BY REQUIREMENT\n- 1 requirement met, 2 overdue, \d+ in progress, 3 not started\.\n\n\[OVERDUE\]/);
    assert.match(built.text, /\n\[NOT STARTED\] Dissertation defense passed \(§4\.7\)\n/);
    assert.match(built.html, /<span style="[^"]*background:#eef0f3;color:#5a6472">Not started<\/span>/);
  });
});
