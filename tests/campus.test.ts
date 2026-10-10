// Multi-campus systems (DGS 2026-09-12): a transcript that prints only the
// system's name must have its campus chosen; a campus the record names is
// pre-filled; the flagship-by-default schools are not systems at all.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MULTI_CAMPUS_SYSTEMS, resolveCampus } from '../src/transcript/campus.ts';
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
  it('a campus’s own name resolves through the system printed in the header (an eScrip-Safe cover names "Binghamton University"; F5, 2026-10-09)', () => {
    const r = resolveCampus('Binghamton University', ['Official Academic Transcript from Binghamton University', ...HEAD, 'BINGHAMTON UNIVERSITY, STATE UNIVERSITY OF NEW YORK']);
    assert.equal(r.system?.system, 'State University of New York');
    assert.equal(r.campus?.name, 'Binghamton');
    assert.equal(resolveCampus('Binghamton University', HEAD).system, undefined, 'without the system in the header the name is its own');
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
  it('the City University of New York is 26 colleges: the college the header names FIRST, never a transfer line’s (DGS 2026-10-10, answer 4b)', () => {
    const bare = resolveCampus('The City University of New York');
    assert.equal(bare.system?.system, 'City University of New York');
    assert.equal(bare.campus, undefined);
    const ccny = ['THE CITY COLLEGE OF NEW YORK', 'The City University of New York', ...HEAD, 'Transfer Credit from Borough of Manhattan Community College'];
    assert.equal(resolveCampus('The City University of New York', ccny).campus?.full, 'The City College of New York');
    // A transfer line names another school; the campus is then asked.
    assert.equal(resolveCampus('The City University of New York', ['The City University of New York', ...HEAD, 'Transfer Credit from Borough of Manhattan Community College']).campus, undefined);
    // The first-named campus wins, not the first in the list (Baruch precedes Hunter there).
    assert.equal(resolveCampus('The City University of New York', ['HUNTER COLLEGE', 'The City University of New York', 'Previously enrolled: Baruch College']).campus?.name, 'Hunter');
    // Names that contain another college's words.
    const only = (header: string) => resolveCampus('The City University of New York', [header, 'The City University of New York']).campus?.name;
    assert.equal(only('NEW YORK CITY COLLEGE OF TECHNOLOGY'), 'City Tech');
    assert.equal(only('QUEENSBOROUGH COMMUNITY COLLEGE'), 'Queensborough');
    assert.equal(only('QUEENS COLLEGE'), 'Queens');
    assert.equal(only('YORK COLLEGE'), 'York');
    assert.equal(only('LAGUARDIA COMMUNITY COLLEGE'), 'LaGuardia');
    // The college printed with the system after it.
    assert.equal(resolveCampus('Hunter College of the City University of New York').campus?.full, 'Hunter College');
    // Every college's own name reads as itself, under a header naming the system.
    const cuny = MULTI_CAMPUS_SYSTEMS.find((s) => s.system === 'City University of New York')!;
    assert.equal(cuny.campuses.length, 26);
    for (const cp of cuny.campuses) assert.equal(resolveCampus(cp.full, ['The City University of New York']).campus?.name, cp.name, cp.full);
  });
  it('review, 2026-10-10: a surname is no college, a longer name holding an alias is another school, and other systems keep list order', () => {
    for (const name of ['GUTTMAN, SAMPLE', 'BARUCH, SAMPLE', 'MACAULAY, SAMPLE', 'HOSTOS, SAMPLE', 'JOHN JAY SAMPLE']) {
      assert.equal(resolveCampus('The City University of New York', ['THE CITY UNIVERSITY OF NEW YORK', `Name: ${name}`]).campus, undefined, name);
    }
    for (const [school, prior] of [
      ['FORDHAM UNIVERSITY SCHOOL OF LAW', 'Prior Institution: Queens College, The City University of New York'],
      ['COLUMBIA UNIVERSITY SCHOOL OF PROFESSIONAL STUDIES', 'Transfer Credit from Hunter College, The City University of New York'],
      ['UNIVERSITY OF PITTSBURGH GRADUATE SCHOOL OF PUBLIC HEALTH', 'Prior degree: City University of New York'],
    ] as const) {
      assert.equal(resolveCampus(school, [school, ...HEAD, prior]).system, undefined, school);
    }
    assert.equal(resolveCampus('The University of Tennessee', ['THE UNIVERSITY OF TENNESSEE', 'Name: MARTIN, SAMPLE', 'Office of the University Registrar   Knoxville, Tennessee 37996']).campus?.name, 'Knoxville');
    assert.equal(resolveCampus('University of Michigan', ['UNIVERSITY OF MICHIGAN', 'Name: FLINT, SAMPLE', 'Ann Arbor, Michigan 48109']).campus?.name, 'Ann Arbor');
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
