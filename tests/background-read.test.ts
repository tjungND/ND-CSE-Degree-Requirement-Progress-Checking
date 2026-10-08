// Reading the earlier degrees from transcripts (DGS 2026-10-08, Option 1). The
// term lists are invented; their shapes are the two redacted insideND
// transcripts the DGS provided: a student who moved into the Ph.D. after one
// MSCSE semester (graduate CSE terms only), and a 4+1 who stayed for the Ph.D.
// (undergraduate terms, majors First Year → Computer Engineering, then
// graduate CSE terms).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Term } from '../src/engine/types.ts';
import type { TranscriptTerm } from '../src/transcript/parse.ts';
import { isCseMajor, readBackgroundFromNdTerms, readBackgroundFromPriorBachelors, readBackgroundFromPriorGraduate } from '../src/ui/background-read.ts';
import { sameUniversity } from '../src/engine/nd-posting.ts';

const T = (season: Term['season'], year: number, level: TranscriptTerm['level'], major?: string, college = 'College of Engineering'): TranscriptTerm => ({ term: { season, year }, ...(level ? { level } : {}), college, ...(major ? { major } : {}) });
const CSE = 'Computer Science & Engineering';

describe('the earlier degrees, read from a Notre Dame transcript', () => {
  it('graduate CSE terms only (the move into the Ph.D. after one MSCSE semester): nothing is read — the transcript does not say it covers every level, and the graduate history is not on it', () => {
    const r = readBackgroundFromNdTerms([T('fall', 2022, 'graduate', CSE), T('spring', 2023, 'graduate', CSE), T('fall', 2026, undefined, CSE)]);
    assert.deepEqual(r.answer, {});
  });
  it('a Notre Dame 4+1 who stayed: a CSE bachelor’s, read from the last undergraduate major', () => {
    const r = readBackgroundFromNdTerms([
      T('fall', 2020, 'undergraduate', 'Computer Science', 'First Year of Studies'),
      T('spring', 2021, 'undergraduate', 'Computer Engineering', 'First Year of Studies'),
      T('spring', 2024, 'undergraduate', 'Computer Engineering'),
      T('fall', 2024, 'graduate', CSE),
    ]);
    assert.deepEqual(r.answer, { bachelors: 'nd-cse' });
    assert.equal(r.how.bachelors, 'your Notre Dame transcript shows undergraduate terms through Spring 2024, majoring in Computer Engineering');
  });
  it('another department’s bachelor’s: the last undergraduate major decides, not the first', () => {
    const r = readBackgroundFromNdTerms([T('fall', 2018, 'undergraduate', 'Computer Science', 'First Year of Studies'), T('spring', 2022, 'undergraduate', 'Mathematics', 'College of Science'), T('fall', 2022, 'graduate', CSE)]);
    assert.equal(r.answer.bachelors, 'nd-other');
  });
  it('a graduate program in another Notre Dame department before CSE', () => {
    const r = readBackgroundFromNdTerms([T('fall', 2021, 'graduate', 'Electrical Engineering'), T('spring', 2022, 'graduate', 'Electrical Engineering'), T('fall', 2022, 'graduate', CSE)]);
    assert.deepEqual(r.answer, { graduate: 'nd-other' });
    assert.match(r.how.graduate ?? '', /graduate terms in Electrical Engineering from Fall 2021, before your CSE terms/);
  });
  it('a layout that marks no term levels: nothing is read', () => {
    assert.deepEqual(readBackgroundFromNdTerms([{ term: { season: 'fall', year: 2022 }, major: CSE }]).answer, {});
    assert.deepEqual(readBackgroundFromNdTerms(undefined).answer, {});
  });
  it('CSE’s majors', () => {
    for (const m of ['Computer Science', 'Computer Engineering', 'Computer Science & Engineering', 'Computer Science and Engineering']) assert.ok(isCseMajor(m), m);
    for (const m of ['Electrical Engineering', 'Mathematics', undefined]) assert.ok(!isCseMajor(m), String(m));
  });
});

describe('the earlier degrees, read from a previous graduate transcript', () => {
  it('conferred, at the bachelor’s university: all three facts', () => {
    const r = readBackgroundFromPriorGraduate({ slot: 'masters', university: 'Purdue University', conferred: true, bachelorsUniversity: 'PURDUE UNIVERSITY', sameUniversity });
    assert.deepEqual(r.answer, { graduate: 'elsewhere', finished: true, samePlace: true });
  });
  it('no conferral line, no bachelor’s transcript: only that there was a program', () => {
    const r = readBackgroundFromPriorGraduate({ slot: 'phd', university: 'Purdue University', sameUniversity });
    assert.deepEqual(r.answer, { graduate: 'elsewhere' });
    assert.equal(r.how.graduate, 'you added a previous Ph.D. transcript from Purdue University');
  });
});

import { answerBackground, mergeReading } from '../src/ui/background-read.ts';
import { priorSlotsForDraft } from '../src/ui/background.ts';
import { validateStudent } from '../src/ui/state.ts';
import { phdStudent } from './helpers/student.ts';

describe('folding readings into the record, and the student’s own answers', () => {
  const NDCSE = readBackgroundFromNdTerms([T('spring', 2024, 'undergraduate', 'Computer Engineering'), T('fall', 2024, 'graduate', CSE)]);
  it('a reading fills a draft; the page asks the rest', () => {
    const s = phdStudent();
    assert.equal(mergeReading(s, NDCSE), 'filled');
    assert.deepEqual(s.backgroundDraft, { bachelors: 'nd-cse' });
    assert.match(s.backgroundRead?.bachelors ?? '', /majoring in Computer Engineering/);
    assert.equal(s.background, undefined, 'incomplete: the engine still sees no answer');
  });
  it('a reading never overwrites what is there, and nothing changes once answered', () => {
    const s = phdStudent({ backgroundDraft: { bachelors: 'elsewhere' } });
    assert.equal(mergeReading(s, NDCSE), false);
    assert.equal(s.backgroundDraft?.bachelors, 'elsewhere');
    const answered = phdStudent({ background: { bachelors: 'elsewhere', graduate: 'none' } });
    assert.equal(mergeReading(answered, NDCSE), false);
  });
  it('the student finishes the answer on the page: applied, and a changed part is theirs', () => {
    const s = phdStudent();
    mergeReading(s, NDCSE);
    answerBackground(s, { ...s.backgroundDraft, ndIntegrated: false, graduate: 'none' });
    assert.deepEqual(s.background, { bachelors: 'nd-cse', ndIntegrated: false, graduate: 'none' });
    assert.equal(s.backgroundDraft, undefined);
    assert.ok(s.backgroundRead?.bachelors, 'the bachelor’s is still marked as read');
    answerBackground(s, { ...s.background, bachelors: 'nd-other' });
    assert.equal(s.backgroundRead, undefined, 'changed by the student: no longer "read"');
  });
  it('a previous master’s transcript after the student said the Notre Dame MSCSE: "also elsewhere", finished', () => {
    const s = phdStudent({ backgroundDraft: { bachelors: 'elsewhere', graduate: 'nd-mscse' } });
    mergeReading(s, readBackgroundFromPriorGraduate({ slot: 'masters', university: 'Purdue University', conferred: true, sameUniversity }));
    assert.deepEqual(s.background, { bachelors: 'elsewhere', graduate: 'nd-mscse', alsoElsewhere: true, finished: true });
    assert.equal(s.priorMs, 'completed');
  });
  it('the transcript rows while the answer is incomplete', () => {
    assert.deepEqual(priorSlotsForDraft(undefined), ['bachelors', 'masters', 'phd']);
    assert.deepEqual(priorSlotsForDraft({ bachelors: 'nd-cse' }), ['masters', 'phd']);
    assert.deepEqual(priorSlotsForDraft({ bachelors: 'nd-cse', graduate: 'none' }), []);
    assert.deepEqual(priorSlotsForDraft({ bachelors: 'elsewhere', graduate: 'nd-mscse', alsoElsewhere: false }), ['bachelors']);
  });
  it('a saved file keeps the draft and what was read; a draft beside a complete answer is dropped', () => {
    const v = validateStudent({ ...phdStudent(), backgroundDraft: { bachelors: 'nd-cse', graduate: 'bogus' }, backgroundRead: { bachelors: 'your Notre Dame transcript shows …', nope: 'x' } } as never, []);
    assert.deepEqual(v.backgroundDraft, { bachelors: 'nd-cse' });
    assert.deepEqual(v.backgroundRead, { bachelors: 'your Notre Dame transcript shows …' });
    const both = validateStudent({ ...phdStudent(), background: { bachelors: 'elsewhere', graduate: 'none' }, backgroundDraft: { bachelors: 'nd-cse' } } as never, []);
    assert.equal(both.backgroundDraft, undefined);
  });
});

import { draftForProgram, withdrawBackground } from '../src/ui/background-read.ts';
import { applyBackground } from '../src/ui/background.ts';

// The adversarial review of Option 1 (2026-10-08).
describe('a reading’s follow-ups only where the answer asks them; a program change', () => {
  const PURDUE_MS = readBackgroundFromPriorGraduate({ slot: 'masters', university: 'Purdue University', conferred: true, bachelorsUniversity: 'Purdue University', sameUniversity });
  it('an outside master’s does not mark another Notre Dame department’s program finished', () => {
    const s = phdStudent({ backgroundDraft: { bachelors: 'elsewhere', graduate: 'nd-other' } });
    assert.equal(mergeReading(s, PURDUE_MS), false);
    assert.deepEqual(s.backgroundDraft, { bachelors: 'elsewhere', graduate: 'nd-other' });
    assert.equal(s.backgroundRead, undefined);
  });
  it('nor fills hidden follow-ups beside “No”, or beside the MSCSE with “No” to a degree elsewhere', () => {
    for (const d of [{ graduate: 'none' as const }, { graduate: 'nd-mscse' as const, alsoElsewhere: false }]) {
      const s = phdStudent({ backgroundDraft: { ...d } });
      assert.equal(mergeReading(s, PURDUE_MS), false, JSON.stringify(d));
      assert.deepEqual(s.backgroundDraft, d);
    }
  });
  it('beside “Yes, at another university”, all three are filled', () => {
    const s = phdStudent({ backgroundDraft: { bachelors: 'elsewhere' } });
    mergeReading(s, PURDUE_MS);
    assert.deepEqual(s.background, { bachelors: 'elsewhere', graduate: 'elsewhere', samePlace: true, finished: true });
  });
  it('the MSCSE cannot hold or leave the Notre Dame MSCSE: those answers, and what they asked, go', () => {
    const d = { bachelors: 'elsewhere' as const, graduate: 'nd-mscse-transfer' as const, transferredTerm: { season: 'spring' as const, year: 2023 }, alsoElsewhere: true, finished: true };
    assert.deepEqual(draftForProgram(d, 'mscse'), { bachelors: 'elsewhere' });
    assert.deepEqual(draftForProgram(d, 'phd'), d);
    assert.deepEqual(draftForProgram({ bachelors: 'nd-cse', graduate: 'elsewhere', samePlace: false, finished: true }, 'mscse'), { bachelors: 'nd-cse', graduate: 'elsewhere', samePlace: false, finished: true });
  });
  it('an answer withdrawn by a program change undoes what it settled', () => {
    const s = phdStudent();
    applyBackground(s, { bachelors: 'nd-cse', graduate: 'nd-4plus1', alsoElsewhere: true, finished: true });
    s.backgroundRead = { bachelors: 'read', finished: 'read' };
    assert.equal(s.priorMs, 'completed');
    assert.equal(s.integratedBsMs, true);
    assert.ok(s.ndMasters);
    s.program = 'mscse';
    withdrawBackground(s, draftForProgram(s.background!, s.program));
    assert.equal(s.background, undefined);
    assert.deepEqual(s.backgroundDraft, { bachelors: 'nd-cse' });
    assert.deepEqual(s.backgroundRead, { bachelors: 'read' });
    assert.equal(s.priorMs, 'none');
    assert.equal(s.integratedBsMs, undefined);
    assert.equal(s.ndMasters, undefined);
  });
});

import { reconcileInferences } from '../src/ui/background-read.ts';

describe('the import-time inferences agree with a partial answer (review of Option 1)', () => {
  it('a Notre Dame master’s from another department is not “the MSCSE held” once the draft says another department', () => {
    const s = phdStudent({ entryTerm: { season: 'fall', year: 2024 }, ndDegrees: [{ level: 'masters', date: '2024-05-15' }] } as never);
    s.backgroundDraft = { graduate: 'nd-other' };
    s.ndMasters = { term: { season: 'spring', year: 2024 }, inferred: { how: 'x' } };
    reconcileInferences(s);
    assert.equal(s.ndMasters, undefined);
  });
  it('a draft “No” to a graduate degree keeps prior graduate study at none', () => {
    const s = phdStudent();
    s.priorMs = 'unfinished';
    s.priorMsInferred = true;
    s.backgroundDraft = { graduate: 'none' };
    reconcileInferences(s);
    assert.equal(s.priorMs, 'none');
    assert.equal(s.priorMsInferred, undefined);
  });
  it('a draft “No” to the 4+1 withdraws an inferred 4+1', () => {
    const s = phdStudent();
    s.integratedBsMs = true;
    s.integratedBsMsInferred = { how: 'x' };
    answerBackground(s, { bachelors: 'nd-cse', ndIntegrated: false });
    assert.equal(s.integratedBsMs, undefined);
  });
});

import { priorStudyLabel } from '../src/ui/program-history.ts';

describe('the emails, before the earlier degrees are answered (review of Option 1)', () => {
  it('say “not answered yet”, not “no prior graduate degree”', () => {
    assert.equal(priorStudyLabel(phdStudent()), 'not answered yet');
    const inferred = phdStudent();
    inferred.priorMs = 'unfinished';
    inferred.priorMsInferred = true;
    assert.notEqual(priorStudyLabel(inferred), 'not answered yet');
    assert.notEqual(priorStudyLabel(phdStudent({ background: { bachelors: 'elsewhere', graduate: 'none' } })), 'not answered yet');
  });
});

import { isOtherDepartmentMajor } from '../src/ui/background-read.ts';

describe('only a positive reading is evidence (review of Option 1)', () => {
  it('a wrapped or placeholder major cell is no department at all', () => {
    for (const m of ['Computer', 'Computer Science', 'Computer Science &', '-', 'Good Standing', 'College of', 'Applied & Computational Mathematics &']) assert.equal(isOtherDepartmentMajor(m), false, m);
    for (const m of ['Mathematics', 'Electrical Engineering', 'Applied & Computational Mathematics & Statistics', 'Finance']) assert.equal(isOtherDepartmentMajor(m), true, m);
    assert.deepEqual(readBackgroundFromNdTerms([T('spring', 2024, 'undergraduate', 'Computer'), T('fall', 2024, 'graduate', CSE)]).answer, {});
    assert.deepEqual(readBackgroundFromNdTerms([T('fall', 2021, 'graduate', 'Good Standing'), T('fall', 2022, 'graduate', CSE)]).answer, {});
  });
  it('two transcripts that disagree about a part neither the student answered: the part is asked', () => {
    const s = phdStudent();
    mergeReading(s, readBackgroundFromPriorBachelors('Purdue University'));
    assert.equal(s.backgroundDraft?.bachelors, 'elsewhere');
    assert.equal(mergeReading(s, readBackgroundFromNdTerms([T('spring', 2024, 'undergraduate', 'Computer Engineering'), T('fall', 2024, 'graduate', CSE)])), 'disagree');
    assert.equal(s.backgroundDraft?.bachelors, undefined);
    assert.equal(s.backgroundRead?.bachelors, undefined);
  });
  it('a part the student answered stays theirs', () => {
    const s = phdStudent();
    answerBackground(s, { bachelors: 'elsewhere' });
    assert.equal(mergeReading(s, readBackgroundFromNdTerms([T('spring', 2024, 'undergraduate', 'Computer Engineering')])), false);
    assert.equal(s.backgroundDraft?.bachelors, 'elsewhere');
  });
});
