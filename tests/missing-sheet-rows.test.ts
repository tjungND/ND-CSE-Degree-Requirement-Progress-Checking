// Two missing Parameters rows, said as they really behave (policy review
// round 3, P3-sheet-6 (a)(b); DGS 2026-10-07: "apply the suggested handling").
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { audit } from '../src/engine/audit.ts';
import type { CourseEntry } from '../src/engine/types.ts';
import { buildRules } from './helpers.ts';
import { phdStudent } from './helpers/student.ts';

describe('cse_subject_codes missing or blank (P3-sheet-6 (a))', () => {
  it('missing: the diagnostics say transferred courses are held, not that the limit is skipped', () => {
    const issue = buildRules({ parameters: { cse_subject_codes: null } }).issues.find((i) => i.message.includes("'cse_subject_codes'"))!;
    assert.match(issue.message, /every such course without one is held for the DGS instead of counting/);
    assert.doesNotMatch(issue.message, /not applied/);
  });
  it('blank: an error too, where there was none', () => {
    const issue = buildRules({ parameters: { cse_subject_codes: '' } }).issues.find((i) => i.message.includes("'cse_subject_codes' is blank"));
    assert.ok(issue);
    assert.equal(issue.severity, 'error');
  });
});

// The six credits shared with a bachelor's degree are the Graduate School's
// and live in the code since 2026-10-07 (P3-sheet-5 (a), which settles
// P3-sheet-6 (c)): the row cannot go missing, and an old row is retired.
describe('the six shared credits live in the code (P3-sheet-5 (a))', () => {
  const ug = (courseId: string, season: 'fall' | 'spring', year: number): CourseEntry => ({ courseId, credits: 3, term: { season, year }, grade: 'A', origin: 'transfer', institution: 'University of Notre Dame', degreeLevel: 'bachelors', registeredLevel: 'graduate' });
  const s = phdStudent({
    program: 'mscse', msOption: 'project', entryTerm: { season: 'fall', year: 2026 }, bachelorsAwarded: { season: 'spring', year: 2026 },
    integratedBsMs: true, integratedAdmitted: { season: 'fall', year: 2025 }, gpa: 3.6, attestations: { dgsApproved4xxxx: true },
    courses: [ug('CSE 40113', 'fall', 2025), ug('CSE 40243', 'fall', 2025), ug('CSE 60641', 'spring', 2026)],
  });
  it('no row: the six still apply — two 40000-level courses fill them', () => {
    const r = audit(s, buildRules({ parameters: { ms_bs_double_count_credits_max: null } }), '2026-10-07');
    assert.equal(r.requirements.find((x) => x.id === 'ms.cap.sharedbs')?.status, 'met');
    assert.equal(r.requirements.find((x) => x.id === 'ms.cap.sharedbs')?.title, 'At most 6 credits shared with your bachelor’s degree');
  });
  it('a row on the sheet changes nothing, and the diagnostics say it can be deleted', () => {
    const rules = buildRules({ parameters: { ms_bs_double_count_credits_max: '9' } });
    assert.ok(rules.issues.some((i) => /'ms_bs_double_count_credits_max' is no longer read — the six credits shared with a bachelor’s degree are the Graduate School’s — Academic Code §4\.6 — and have lived in the code since 2026-10-07 \(README § A5b\)\. Changing the row changes nothing; delete it\./.test(i.message)));
    const r = audit(s, rules, '2026-10-07');
    assert.equal(r.requirements.find((x) => x.id === 'ms.cap.sharedbs')?.title, 'At most 6 credits shared with your bachelor’s degree');
  });
  it('present: two 40000-level courses fill the six, as before', () => {
    const r = audit(s, buildRules(), '2026-10-07');
    assert.equal(r.requirements.find((x) => x.id === 'ms.cap.sharedbs')?.status, 'met');
  });
});

// The same transfer course on two rows, whatever their terms (policy review
// round 3, P3-import-2): warned, unless it is the Notre Dame block's row and
// its twin, which already count once (P3-import-1 (c)).
describe('a transfer course entered twice in different terms (P3-import-2)', () => {
  const row = (term: { season: 'fall' | 'spring'; year: number }, extra: Partial<CourseEntry> = {}): CourseEntry => ({ courseId: 'CS 50300', title: 'Operating Systems', credits: 3, term, grade: 'A', origin: 'transfer', institution: 'Purdue University', degreeLevel: 'masters', ...extra });
  const warn = (courses: CourseEntry[]) => audit(phdStudent({ entryTerm: { season: 'fall', year: 2025 }, priorMs: 'completed', bachelorsAwarded: { season: 'spring', year: 2021 }, courses }), buildRules(), '2026-10-07').warnings.filter((w) => /CS 50300 from .* is entered 2 times/.test(w));
  it('two rows from one university: warned, with both terms', () => {
    const w = warn([row({ season: 'fall', year: 2023 }), row({ season: 'spring', year: 2024 }, { institution: 'PURDUE UNIVERSITY' })]);
    assert.equal(w.length, 1);
    assert.match(w[0]!, /entered 2 times \(Fall 2023, Spring 2024\)\. Each row is counted separately, so its credit may be counted twice/);
  });
  it('one row: nothing', () => {
    assert.deepEqual(warn([row({ season: 'fall', year: 2023 })]), []);
  });
});
