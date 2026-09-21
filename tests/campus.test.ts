// Multi-campus systems (DGS 2026-09-12): a transcript that prints only the
// system's name must have its campus chosen; a campus the record names is
// pre-filled; the flagship-by-default schools are not systems at all.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveCampus } from '../src/transcript/campus.ts';
import { parseExternalTranscript } from '../src/transcript/external.ts';

const HEAD = ['Office of the University Registrar', 'This is an unofficial transcript produced for the student named below and may not be released to any third party without consent.', 'Student: (name withheld)   Program: Master of Science, Computer Science'];

describe('multi-campus systems', () => {
  it('the bare system name is a system with no campus; a campus in the name resolves it', () => {
    const bare = resolveCampus('University of California');
    assert.equal(bare.system?.system, 'University of California');
    assert.equal(bare.campus, undefined);
    assert.equal(resolveCampus('University of California, San Diego').campus?.name, 'San Diego');
    assert.equal(resolveCampus('UNIVERSITY OF ILLINOIS URBANA-CHAMPAIGN').campus?.full, 'University of Illinois Urbana-Champaign');
    assert.equal(resolveCampus('The University of Texas at Dallas').campus?.full, 'The University of Texas at Dallas');
  });
  it('a campus named in the header resolves it; one deep in the record does not', () => {
    assert.equal(resolveCampus('University of California', ['UNIVERSITY OF CALIFORNIA', '9500 Gilman Drive, La Jolla, CA']).campus?.name, 'San Diego');
    const deep = [...Array.from({ length: 45 }, () => 'x'), 'Degrees awarded by other institutions: University of California, Los Angeles'];
    assert.equal(resolveCampus('University of California', deep).campus, undefined);
  });
  it('schools whose bare name means the flagship are not systems', () => {
    for (const name of ['Purdue University', 'Michigan State University', 'California State University', 'Notre Dame']) {
      assert.equal(resolveCampus(name).system, undefined, name);
    }
  });
  it('University of Washington asks unless the record names Seattle, Tacoma or Bothell (DGS 2026-09-13)', () => {
    assert.equal(resolveCampus('University of Washington').campus, undefined);
    assert.equal(resolveCampus('University of Washington').system?.system, 'University of Washington');
    assert.equal(resolveCampus('University of Washington', ['UNIVERSITY OF WASHINGTON', 'Seattle, WA 98195']).campus?.full, 'University of Washington');
    assert.equal(resolveCampus('University of Washington Tacoma').campus?.full, 'University of Washington Tacoma');
    assert.equal(resolveCampus('University of Washington', ['UNIVERSITY OF WASHINGTON', 'Bothell Campus']).campus?.name, 'Bothell');
  });
  it('University of Michigan asks unless the record names Ann Arbor, Dearborn or Flint (DGS 2026-09-20)', () => {
    assert.equal(resolveCampus('University of Michigan').campus, undefined);
    assert.equal(resolveCampus('University of Michigan').system?.system, 'University of Michigan');
    assert.equal(resolveCampus('University of Michigan', ['UNIVERSITY OF MICHIGAN', 'Ann Arbor, MI 48109']).campus?.full, 'University of Michigan');
    assert.equal(resolveCampus('University of Michigan-Dearborn').campus?.full, 'University of Michigan-Dearborn');
    assert.equal(resolveCampus('University of Michigan', ['UNIVERSITY OF MICHIGAN', 'Flint Campus']).campus?.name, 'Flint');
  });
  it('the parser carries the system and the campus', () => {
    const lines = ['UNIVERSITY OF CALIFORNIA', ...HEAD, 'Fall Quarter 2023', 'CSE 202   Algorithm Design and Analysis   4.0   A'];
    const r = parseExternalTranscript(lines);
    assert.equal(r.university, 'University of California');
    assert.equal(r.campusSystem, 'University of California');
    assert.equal(r.campus, undefined);
    const named = parseExternalTranscript(['UNIVERSITY OF CALIFORNIA', 'La Jolla, California', ...HEAD, 'Fall Quarter 2023', 'CSE 202   Algorithm Design and Analysis   4.0   A']);
    assert.equal(named.university, 'University of California, San Diego');
    assert.equal(named.campus, 'San Diego');
    // The 2026-09-09 UCSD sample still resolves through its acronym.
    const acr = parseExternalTranscript(['UNIVERSITY OF CALIFORNIA', ...HEAD, '------------UCSD DEGREES AWARDED-----------', 'Fall Quarter 2023', 'CSE 202   Algorithm Design and Analysis   4.0   A']);
    assert.equal(acr.university, 'University of California, San Diego');
  });
});
