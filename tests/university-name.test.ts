// Hand-typed university names: Title Case and the known-universities list
// (DGS request 2026-09-06 evening). src/ui/university-name.ts.
import { expandInstitutionAbbreviations, normalizeUniversity } from '../src/data/external.ts';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { canonicalUniversityName, knownUniversities, titleCaseUniversity } from '../src/ui/university-name.ts';
import { buildRules } from './helpers.ts';

// A sheet row and a parsed name must find each other however the article is
// written: "The Johns Hopkins University" and "Johns Hopkins University" name
// one school (2026-09-08).
describe('a leading article is not part of the key', () => {
  it('matches with or without "The"', () => {
    assert.equal(normalizeUniversity('The Johns Hopkins University'), normalizeUniversity('Johns Hopkins University'));
    assert.equal(normalizeUniversity('THE OHIO STATE UNIVERSITY'), normalizeUniversity('Ohio State University'));
  });

  it('an article inside the name is left alone', () => {
    assert.equal(normalizeUniversity('University of the Pacific'), 'university of the pacific');
  });
});

describe('titleCaseUniversity', () => {
  it('raises the first letter of each word and keeps the rest as typed', () => {
    assert.equal(titleCaseUniversity('purdue university'), 'Purdue University');
    assert.equal(titleCaseUniversity('UCLA'), 'UCLA');
    assert.equal(titleCaseUniversity('ucla'), 'Ucla'); // a limitation the student can fix by typing the capitals
    assert.equal(titleCaseUniversity('university of notre dame'), 'University of Notre Dame');
    assert.equal(titleCaseUniversity('the ohio state university'), 'The Ohio State University');
    assert.equal(titleCaseUniversity('université de montréal'), 'Université de Montréal');
    assert.equal(titleCaseUniversity('saint-louis university'), 'Saint-Louis University');
    assert.equal(titleCaseUniversity('  purdue   university '), 'Purdue University');
    assert.equal(titleCaseUniversity('UNIVERSITY OF MASSACHUSETTS AMHERST'), 'UNIVERSITY OF MASSACHUSETTS AMHERST'); // as typed: capitals stay
    assert.equal(titleCaseUniversity(''), '');
  });

  it('canonicalUniversityName is the trimmed Title Case of what was typed', () => {
    assert.equal(canonicalUniversityName(' example institute of technology '), 'Example Institute of Technology');
    assert.equal(canonicalUniversityName(''), '');
  });
});

describe('knownUniversities', () => {
  it('lists the distinct universities of the ExternalCourses tab, Title-Cased and sorted', () => {
    const rules = buildRules();
    const names = knownUniversities(rules.external);
    assert.ok(names.length >= 1, 'the fixture ExternalCourses tab has rows');
    assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b)));
    assert.equal(new Set(names.map((n) => n.toLowerCase())).size, names.length, 'distinct');
    for (const n of names) assert.match(n, /^[^a-z]/, `starts with a capital: ${n}`);
    assert.ok(names.includes('Purdue University'), JSON.stringify(names));
  });
});

// Abbreviated institution names (DGS 2026-09-08): an unofficial transcript may
// print "Georgia Inst. of Technology"; everyone who reads the name — the
// student, the DGS review request, the Grad Admin processing request — should
// see it spelled out, and the sheet must match either spelling.
describe('spelling out abbreviations in an institution name', () => {
  it('expands the abbreviations transcripts actually use', () => {
    assert.equal(expandInstitutionAbbreviations('Georgia Inst. of Technology'), 'Georgia Institute of Technology');
    assert.equal(expandInstitutionAbbreviations('Georgia Inst of Technology'), 'Georgia Institute of Technology');
    assert.equal(expandInstitutionAbbreviations('Univ. of Southern California'), 'University of Southern California');
    assert.equal(expandInstitutionAbbreviations('Mass. Inst. of Tech.'), 'Mass. Institute of Technology');
    assert.equal(expandInstitutionAbbreviations('Rensselaer Poly. Institute'), 'Rensselaer Polytechnic Institute');
  });

  it('leaves alone what is not an abbreviation', () => {
    // "Georgia Tech" and "Virginia Tech" ARE the names — only "Tech." expands.
    assert.equal(expandInstitutionAbbreviations('Georgia Tech'), 'Georgia Tech');
    assert.equal(expandInstitutionAbbreviations('Virginia Tech'), 'Virginia Tech');
    // "St." is Saint in one name and State in another, so it is never touched.
    assert.equal(expandInstitutionAbbreviations('St. Louis University'), 'St. Louis University');
    // A word that merely starts with an abbreviation is not one.
    assert.equal(expandInstitutionAbbreviations('Instrumentation College'), 'Instrumentation College');
    assert.equal(expandInstitutionAbbreviations('Purdue University'), 'Purdue University');
  });

  it('the sheet matches either spelling, so an old row keeps working', () => {
    assert.equal(
      normalizeUniversity('Georgia Inst. of Technology'),
      normalizeUniversity('GEORGIA INSTITUTE OF TECHNOLOGY'),
    );
  });

  it('a name typed by hand is spelled out and Title-Cased', () => {
    assert.equal(canonicalUniversityName('georgia inst. of technology'), 'Georgia Institute of Technology');
  });
});
