// The unofficial-transcript warning in the three generated emails (DGS
// 2026-10-03, P1-transfer-eligibility-16): §5.2 adds transfer credit only on an
// official transcript, so when an imported external transcript was marked
// "unofficial" the review request (DGS/ADGS), the advisor summary and the Grad
// Admin request all say which transcripts — bachelor's, master's, prior Ph.D. —
// were unofficial copies. The flag lives on the imported rows
// (`fromUnofficialTranscript`), so removing a transcript removes its warning.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { audit } from '../src/engine/audit.ts';
import type { CourseEntry, Student } from '../src/engine/types.ts';
import { buildCombinedReviewRequest } from '../src/transcript/external.ts';
import { advisorSummary } from '../src/ui/advisor-summary.ts';
import { unofficialTranscriptNote } from '../src/ui/email-html.ts';
import { gradAdminRequest } from '../src/ui/grad-admin-request.ts';
import { buildRules } from './helpers.ts';

const row = (courseId: string, degreeLevel: CourseEntry['degreeLevel'], unofficial: boolean): CourseEntry => ({
  courseId,
  credits: 3,
  term: { season: 'fall', year: 2024 },
  grade: 'A',
  origin: 'transfer',
  institution: 'Purdue University',
  degreeLevel,
  ...(unofficial ? { fromUnofficialTranscript: true as const } : {}),
});

describe('unofficialTranscriptNote', () => {
  it('is empty when no imported row was flagged', () => {
    assert.equal(unofficialTranscriptNote([row('CS 50300', 'masters', false)]), '');
    assert.equal(unofficialTranscriptNote([]), '');
  });
  it('names the one transcript that was unofficial', () => {
    assert.equal(
      unofficialTranscriptNote([row('CS 50300', 'masters', true), row('CS 24000', 'bachelors', false)]),
      'Note: the master’s transcript I imported into the self-check was an unofficial copy. An official transcript from the university is required before any transfer credit can be reviewed, approved or added to my record (§5.2) — I will have the university’s registrar send it directly to the Graduate School.',
    );
  });
  it('lists several, in bachelor’s / master’s / prior Ph.D. order', () => {
    const note = unofficialTranscriptNote([row('CS 59000', 'phd', true), row('CS 24000', 'bachelors', true), row('CS 50300', 'masters', true)]);
    assert.match(note, /^Note: the bachelor’s, master’s and prior Ph\.D\. transcripts I imported into the self-check were unofficial copies\./);
  });
  it('a hand-entered transfer row (no degree level) counts as the master’s transcript', () => {
    assert.match(unofficialTranscriptNote([{ ...row('CS 50300', undefined, true) }]), /^Note: the master’s transcript/);
  });
});

describe('the three emails carry the warning', () => {
  const rules = buildRules({
    external: [{ university: 'PURDUE UNIVERSITY', course_id: 'CS 50300', course_title: 'Operating Systems', transferable_PhD: 'yes', transferable_MSCSE: 'yes' }],
  });
  const student: Student = {
    schemaVersion: 1,
    program: 'phd',
    entryTerm: { season: 'fall', year: 2026 },
    bachelorsAwarded: { season: 'spring', year: 2022 },
    priorMs: 'completed',
    gpa: 3.6,
    milestones: {},
    attestations: {},
    courses: [row('CS 50300', 'masters', true), row('CS 24000', 'bachelors', true)],
  };
  const report = audit(student, rules, '2027-06-01');
  const opts = { todayIso: '2027-06-01', entryTerm: 'Fall 2026', priorStudy: 'Completed prior M.S. or Ph.D.', gpa: 3.6 };
  const note = unofficialTranscriptNote(student.courses);
  assert.match(note, /bachelor’s and master’s transcripts/);

  it('Grad Admin request: after the "Attached:" line, in text and HTML', () => {
    const built = gradAdminRequest(report, student, rules, opts);
    assert.ok(built.text.includes(`Attached: copies of my transcripts as PDFs. The official transcripts are to be sent directly to the Graduate School by each university’s registrar.\n${note}\n`), built.text.slice(0, 900));
    assert.ok(built.html.includes(`<strong>${note.replace(/’/g, '’')}</strong>`) || built.html.includes(note.replace(/&/g, '&amp;')), 'HTML carries the note');
  });
  it('advisor summary: in the standing paragraph when the app passes the note', () => {
    const built = advisorSummary(report, { ...opts, unofficialNote: note });
    assert.ok(built.text.includes(`\n${note}\n`), built.text.slice(0, 900));
    assert.ok(built.html.includes(note.replace(/&/g, '&amp;')));
    assert.ok(!advisorSummary(report, opts).text.includes('unofficial copy'), 'nothing without the note');
  });
  it('review request: among the context lines after "My transcripts are attached."', () => {
    const built = buildCombinedReviewRequest({ priorStudy: opts.priorStudy, nd: [], external: [], unofficial: note });
    assert.ok(built.text.includes('My transcripts are attached.'), built.text.slice(0, 600));
    assert.ok(built.text.indexOf(note) > built.text.indexOf('My transcripts are attached.'), built.text.slice(0, 900));
    assert.ok(built.html.includes(note.replace(/&/g, '&amp;')));
  });
});
