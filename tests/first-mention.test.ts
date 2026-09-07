// "Oral Candidacy Exam (OCE)" once, then "OCE" (DGS, 2026-09-06 evening).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { OCE_FULL, shortenAfterFirst } from '../src/ui/first-mention.ts';

describe('shortenAfterFirst — the OCE first-mention rule', () => {
  it('keeps the first mention and shortens every later one', () => {
    const text = `Take the ${OCE_FULL} by the end of Spring 2030. The ${OCE_FULL} needs a committee; the ${OCE_FULL} is oral.`;
    assert.equal(shortenAfterFirst(text), `Take the ${OCE_FULL} by the end of Spring 2030. The OCE needs a committee; the OCE is oral.`);
  });

  it('is case-insensitive, so an upper-cased heading counts as the first mention', () => {
    const text = `ORAL CANDIDACY EXAM (OCE) — §4.5\n  [IN PROGRESS] ${OCE_FULL} passed (§4.5)`;
    assert.equal(shortenAfterFirst(text), 'ORAL CANDIDACY EXAM (OCE) — §4.5\n  [IN PROGRESS] OCE passed (§4.5)');
  });

  it('shortens a later bare "Oral Candidacy Exam" too, and never touches a lone "OCE"', () => {
    assert.equal(shortenAfterFirst(`${OCE_FULL}; then the Oral Candidacy Exam again; OCE stays.`), `${OCE_FULL}; then the OCE again; OCE stays.`);
  });

  it('leaves text without a mention alone and is idempotent', () => {
    assert.equal(shortenAfterFirst('No exam here.'), 'No exam here.');
    const once = shortenAfterFirst(`${OCE_FULL} and ${OCE_FULL}`);
    assert.equal(shortenAfterFirst(once), once);
  });
});
