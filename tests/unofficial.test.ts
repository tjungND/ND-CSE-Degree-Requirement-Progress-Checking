// Previous-degree slots refuse unofficial transcripts (DGS 2026-09-15) — but
// "unofficial" must describe the transcript, not a grade legend's "UW
// Unofficial Withdraw" (DGS 2026-09-16: a false rejection).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isUnofficial } from '../src/ui/external-upload.ts';

describe('what counts as an unofficial transcript', () => {
  it('headings, stamps and disclaimers do', () => {
    for (const l of ['Unofficial Transcript', 'UNOFFICIAL ACADEMIC TRANSCRIPT', 'Student Unofficial Transcript', 'UNOFFICIAL University at Buffalo Transcript', 'This is not an official transcript.', 'UNOFFICIAL', 'Unofficial copy of the academic record']) {
      assert.equal(isUnofficial(['Purdue University', l, 'Fall 2023']), true, l);
    }
  });
  it('a grade legend does not', () => {
    assert.equal(isUnofficial(['Official Transcript', 'I   Incomplete', 'W   Officially Withdraw', 'UW  Unofficial Withdraw', 'P   Passed', 'FD  Failed (Disciplinary)']), false);
    assert.equal(isUnofficial(['Official Transcript', 'UW = unofficial withdrawal']), false);
    assert.equal(isUnofficial(['Official Transcript', 'Grades: A, B, C; W withdrawn; UW unofficially withdrawn']), false);
  });
});
