// The CSE handbook's text behind the section chips (DGS 2026-10-05: "when the
// cursor hovers over the section of CSE handbook …, show its relevant texts").
// src/ui/handbook-text.ts is GENERATED from the handbook PDF by
// `npm run handbook-text`; these tests fail when the two disagree, so a new
// edition of the PDF cannot ship with the old edition's words.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { HANDBOOK_SECTIONS, HANDBOOK_SOURCE } from '../src/ui/handbook-text.ts';
import { sectionsFor } from '../src/ui/section-ref.ts';

describe('the handbook text behind the section chips', () => {
  it('was generated from the handbook PDF in policy-sources (run `npm run handbook-text` after replacing it)', () => {
    const pdf = readFileSync(new URL(`../${HANDBOOK_SOURCE.file}`, import.meta.url));
    assert.equal(createHash('sha256').update(pdf).digest('hex'), HANDBOOK_SOURCE.sha256, 'the handbook PDF changed — run `npm run handbook-text` and commit src/ui/handbook-text.ts');
  });

  it('holds the sections the pages cite, in the handbook’s own words', () => {
    const byId = new Map(HANDBOOK_SECTIONS.map((s) => [s.id, s]));
    for (const id of ['2.3', '3.2', '3.4', '4.2', '4.4', '4.4.1', '4.4.2', '4.4.3', '4.5', '4.6', '4.7']) assert.ok((byId.get(id)?.paragraphs.length ?? 0) > 0, id);
    assert.equal(byId.get('4.4.1')!.title, 'Core Knowledge Requirement');
    assert.equal(byId.get('3.5')!.title, 'Integrated B.S. + M.S. in Computer Science and Engineering', 'a wrapped title is joined');
    const text = (id: string) => byId.get(id)!.paragraphs.join(' ');
    assert.match(text('4.4.1'), /All PhD students are required to pass \(or have previously passed\) an Operating Systems course, an Algorithms course, and a Computer Architecture course/);
    assert.match(text('4.2'), /Up to six \(6\) credits from CSE 4xxxx may count toward both the graduate school’s 60-credit requirement/);
    assert.match(text('2.3'), /A research advisor must be a Tenure and Tenure Track \(TTT\) faculty member of the department\./);
    // §4.4.2's five groups are their own lines, not run into the next sentence.
    assert.ok(byId.get('4.4.2')!.paragraphs.includes('5. Systems and Software'));
  });

  it('reads ligatures as letters ("first", not "fi rst")', () => {
    const all = HANDBOOK_SECTIONS.flatMap((s) => s.paragraphs).join(' ');
    assert.doesNotMatch(all, /\b\w* f[il] [a-z]+/);
    assert.match(all, /\bfirst\b/);
  });

  it('a chip’s sections: one number with its subsections, a range through its last number', () => {
    const ids = (ref: string) => sectionsFor(ref).map((s) => s.id);
    assert.deepEqual(ids('§4.2'), ['4.2']);
    assert.deepEqual(ids('§4.4'), ['4.4', '4.4.1', '4.4.2', '4.4.3']);
    assert.deepEqual(ids('§2.3, §4.4–4.7'), ['2.3', '4.4', '4.4.1', '4.4.2', '4.4.3', '4.5', '4.6', '4.7']);
    assert.deepEqual(ids('§2.3, §3.4'), ['2.3', '3.4']);
    assert.deepEqual(ids('§9.9'), []);
  });
});
