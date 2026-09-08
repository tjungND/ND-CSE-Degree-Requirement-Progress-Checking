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

const rules = buildRules(); // fixture ExternalCourses tab: CS 50300 transferable=yes (core os), CS 59000 no
const purdue = (courseId: string, title: string): CourseEntry => ({
  courseId,
  title,
  credits: 3,
  term: { season: 'fall', year: 2024 },
  grade: 'A',
  origin: 'transfer',
  institution: 'Purdue University',
  degreeLevel: 'masters',
});
const nd = (courseId: string, title: string, season: 'fall' | 'spring', year: number, grade: Grade = 'A', credits = 3): CourseEntry => ({ courseId, title, credits, term: { season, year }, grade, origin: 'nd' });
const student = (extra: Partial<Student> = {}): Student => ({
  schemaVersion: 1,
  program: 'phd',
  entryTerm: { season: 'fall', year: 2026 },
  priorMs: 'completed',
  gpa: 3.5,
  courses: [purdue('CS 50300', 'Operating Systems'), purdue('CS 59000', 'Special Topics'), purdue('CS 77777', 'Unruled Topics')],
  milestones: { advisorIdentified: '2026-09-10', advisorName: 'Prof. Example', candidacyPassed: '2029-04-01' },
  attestations: {},
  ...extra,
});
const opts = { todayIso: '2029-05-01', entryTerm: 'Fall 2026', priorStudy: 'Completed prior M.S. or Ph.D.', gpa: 3.5 };
const build = (s: Student) => gradAdminRequest(audit(s, rules, opts.todayIso), s, rules, opts);

describe('processingItems', () => {
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
    assert.match(items.lines.at(-1)!, /^\d+ requirements met so far — the request lists each with the courses, semesters or dates that meet it, for the record$/);
    assert.match(items.lines[0]!, /^CS 50300 \(Purdue University\) — transfer credit pre-approved by the DGS, to be processed \(§5\.2\)$/);
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

  it('the §5.2 attestation moves the transfers to "already approved"; an M.S. student lists only §3.4 milestones', () => {
    const s = student({ attestations: { transferApproved: true } });
    const items = processingItems(audit(s, rules, opts.todayIso), s, rules);
    assert.deepEqual(items.transfers.map((t) => `${t.courseId}:${t.state}`), ['CS 50300:approved', 'CS 77777:approved']);
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
    assert.match(built.text, /The DGS decides eligibility by the course rules; this request is only for the processing of what has already been decided\./);
    assert.match(built.text, /\nAttached: my original transcripts as PDFs \(Bachelor’s \/ Master’s \/ Ph\.D\., whichever apply\) and my self-check file \(cse-degree-audit-phd\.json\)\.\n\nThank you!\n\n\(You may edit anything above this line\)\n-{10,}\n\(DO NOT MODIFY ANYTHING BELOW THIS LINE\)\n\nTRANSFER CREDIT TO PROCESS/);
    assert.match(built.text, /\nTRANSFER CREDIT TO PROCESS \(§5\.2\) — RULED TRANSFERABLE BY THE DGS IN THE EXTERNAL-COURSE RULES; MY ORIGINAL TRANSCRIPTS ARE ATTACHED\nUniversity\tCourse\tTitle\tCredits\tND credits\tGrade\tTerm\nPurdue University\tCS 50300\tOperating Systems\t3\t\tA\tFall 2024\n/);
    assert.match(built.text, /\nMET — CUMULATIVE GPA OF AT LEAST 3\.0 \(§2\.2\)\nWhat\tEvidence\nCumulative GPA\t3\.50\n/);
    assert.match(built.text, /\nMET — UNDER CONTINUOUS ADVISOR SUPERVISION \(§2\.3\)\nWhat\tEvidence\nAdvisor\tProf\. Example\nDate\t2026-09-10\n/);
    assert.match(built.text, /\nMET — ORAL CANDIDACY EXAM \(OCE\) PASSED \(§4\.5\)\nWhat\tEvidence\nDate\t2029-04-01\n/);
    assert.match(built.text, /The DGS is in cc\. Generated by the CSE degree self-check tool .*\.\n$/);
    assert.ok(!/audit/i.test(built.text.replace(/cse-degree-audit-\w+\.json/g, '')), 'never the word "audit" (the saved file’s name aside)');
    assert.doesNotMatch(built.text, /CS 59000|CS 77777/);
    assert.equal(built.text.split(/oral candidacy exam \(oce\)/i).length - 1, 1, 'the full OCE name once');
    assert.match(built.html, /<p>Dear Grad Admin,<\/p>/);
    assert.match(built.html, /<strong>Attached: my original transcripts/);
    assert.match(built.html, /<p><strong>\(You may edit anything above this line\)<\/strong><\/p><hr><p><strong>\(DO NOT MODIFY ANYTHING BELOW THIS LINE\)<\/strong><\/p>/);
    assert.match(built.html, /<table border="1" cellspacing="0" cellpadding="4"><tr><th>University<\/th><th>Course<\/th>/);
    assert.match(built.html, /<td>Purdue University<\/td><td>CS 50300<\/td><td>Operating Systems<\/td>/);
    assert.match(built.html, /<p><strong>Met — Cumulative GPA of at least 3\.0 \(§2\.2\)<\/strong><\/p><table/);
    assert.equal(selfCheckFileName('mscse'), 'cse-degree-audit-mscse.json');
  });

  it('omits empty sections; a met requirement alone still makes the request worth sending (2026-09-06, late evening)', () => {
    const bare = student({ courses: [], milestones: {}, attestations: {} });
    const built = build(bare);
    assert.doesNotMatch(built.text, /TRANSFER CREDIT|MSCSE ALONG THE WAY|QUALIFIER COMPLETION FORM/);
    assert.equal(built.items.count, 1, 'nothing but the met-requirements line');
    assert.equal(built.items.count, built.items.lines.length, 'the chip counts exactly what the card lists');
    assert.ok(built.items.met.length >= 1, 'the met GPA row alone activates the Grad Admin button');
    // (the GPA row is met, so a "MET —" table still follows the marker)
    assert.match(built.text, /\(DO NOT MODIFY ANYTHING BELOW THIS LINE\)\n\nMET — CUMULATIVE GPA/);
  });
});
