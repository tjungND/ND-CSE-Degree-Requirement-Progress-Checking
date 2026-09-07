// Hand-typed university names: Title Case and the known-universities list
// (DGS request 2026-09-06 evening). src/ui/university-name.ts.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { canonicalUniversityName, knownUniversities, titleCaseUniversity } from '../src/ui/university-name.ts';
import { buildRules } from './helpers.ts';

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
