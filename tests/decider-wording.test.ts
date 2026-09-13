// Who a sentence names as the decider (DGS 2026-09-11: the ADGS decides for
// MSCSE students, the DGS for Ph.D. students) and the sheet's per-course
// override (`dgs_approval` / `adgs_approval`, 2026-09-12), which wins over the
// program default. Three red-team findings of 2026-09-13 live here.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { decisionWording, decisionWordingDeep } from '../src/engine/decider.ts';
import { audit } from '../src/engine/audit.ts';
import { undergraduateGraduateCourseworkFlag } from '../src/engine/review.ts';
import type { Student } from '../src/engine/types.ts';
import { buildRules } from './helpers.ts';

describe('decisionWording', () => {
  it('rewrites a standalone DGS for an MSCSE student, and leaves the Ph.D. alone', () => {
    assert.equal(decisionWording('mscse', 'ask the DGS'), 'ask the ADGS');
    assert.equal(decisionWording('phd', 'ask the DGS'), 'ask the DGS');
    // "ADGS" has no word boundary before the D, so it is never rewritten twice.
    assert.equal(decisionWording('mscse', 'ask the ADGS'), 'ask the ADGS');
  });

  it('unwraps the sheet’s per-course token for BOTH programs', () => {
    assert.equal(decisionWording('phd', 'needs {{DGS}} approval'), 'needs DGS approval');
    assert.equal(decisionWording('phd', 'needs {{ADGS}} approval'), 'needs ADGS approval');
    assert.equal(decisionWording('mscse', 'needs {{ADGS}} approval'), 'needs ADGS approval');
  });

  it('a per-course {{DGS}} survives the MSCSE rewrite — the sheet says who, per course', () => {
    // The bug: \bDGS\b matches inside "{{DGS}}" (a brace is a word boundary),
    // so the override used to collapse to the program default.
    assert.equal(decisionWording('mscse', 'needs {{DGS}} approval'), 'needs DGS approval');
  });

  it('rewrites the text around a token without touching the token', () => {
    assert.equal(
      decisionWording('mscse', 'the DGS decides; this course needs {{DGS}} approval; ask the DGS'),
      'the ADGS decides; this course needs DGS approval; ask the ADGS',
    );
  });
});

describe('decisionWordingDeep', () => {
  it('unwraps tokens for a Ph.D. student too — braces must never reach the page', () => {
    const row = { detail: 'needs advisor + {{DGS}} approval', parts: ['and {{ADGS}} too'] };
    assert.deepEqual(decisionWordingDeep('phd', row), {
      detail: 'needs advisor + DGS approval',
      parts: ['and ADGS too'],
    });
  });

  it('still rewrites for the MSCSE, and never rewrites a handbook quote', () => {
    const row = { detail: 'ask the DGS', citation: { section: '§4.2', quote: 'approval of the student’s advisor and DGS.' } };
    const out = decisionWordingDeep('mscse', row);
    assert.equal(out.detail, 'ask the ADGS');
    assert.equal(out.citation.quote, 'approval of the student’s advisor and DGS.');
  });
});

describe('the §3.5 more-than-two note names the degree’s decider', () => {
  const student = (program: 'phd' | 'mscse'): Student => ({
    schemaVersion: 1,
    program,
    entryTerm: { season: 'fall', year: 2026 },
    bachelorsAwarded: { season: 'spring', year: 2026 },
    priorMs: 'none',
    integratedBsMs: true,
    courses: ['CSE 60641', 'CSE 60111', 'CSE 60321'].map((courseId) => ({
      courseId,
      credits: 3,
      term: { season: 'fall' as const, year: 2025 },
      grade: 'A' as const,
      origin: 'transfer' as const,
      institution: 'University of Notre Dame',
      degreeLevel: 'bachelors' as const,
    })),
    milestones: {},
    attestations: {},
  });

  it('says ADGS for an MSCSE student and DGS for a Ph.D. student, on the card and in the report', () => {
    const rules = buildRules();
    const ms = undergraduateGraduateCourseworkFlag(student('mscse'), rules);
    assert.ok(ms, 'three counted 6xxxx undergraduate courses raise the note');
    assert.match(ms, /the ADGS should confirm/);
    assert.doesNotMatch(ms, /\bthe DGS\b/);

    const phd = undergraduateGraduateCourseworkFlag(student('phd'), rules);
    assert.ok(phd);
    assert.match(phd, /the DGS should confirm/);

    // The same sentence reaches the report's warnings and reviewFlags.
    const report = audit(student('mscse'), rules, '2027-06-01');
    assert.ok(report.warnings.some((w) => /the ADGS should confirm/.test(w)), JSON.stringify(report.warnings));
    assert.ok((report.reviewFlags ?? []).every((f) => !/\bthe DGS\b/.test(f)), JSON.stringify(report.reviewFlags));
  });
});
