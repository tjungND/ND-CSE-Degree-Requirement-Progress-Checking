// What each course counts toward (DGS request 2026-09-08). One course routinely
// serves several requirements — a 60000-level course feeds the total credits,
// the regular-course credits, the nine at Notre Dame, a §4.4.1 core area and a
// §4.4.2 specialization group — but the course's line named only its credit
// pool. `audit()` now indexes the requirement rows the other way round.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { audit } from '../src/engine/audit.ts';
import type { CourseEntry, Student } from '../src/engine/types.ts';
import { buildRules } from './helpers.ts';
import { ndCourse as nd, phdStudent } from './helpers/student.ts';

const rules = buildRules();
const student = (courses: CourseEntry[]): Student => phdStudent({ gpa: 3.5, courses });
const countsFor = (s: Student, courseId: string) =>
  audit(s, rules, '2027-03-01').courseLines.find((l) => l.courseId === courseId)?.counts ?? [];

describe('what a course counts toward', () => {
  it('names every requirement the course feeds, not just its credit pool', () => {
    const titles = countsFor(student([nd('CSE 60641', { title: 'Graduate Operating Systems' })]), 'CSE 60641')
      .filter((c) => c.when === 'now')
      .map((c) => c.title);
    assert.ok(titles.length >= 3, `expected several requirements, got ${JSON.stringify(titles)}`);
    assert.ok(titles.some((t) => /total credits/.test(t)), JSON.stringify(titles));
    assert.ok(titles.some((t) => /regular-course credits/.test(t)), JSON.stringify(titles));
    // Short forms in this column (DGS 2026-09-08); the row's own title keeps
    // "At least 9 credits taken at Notre Dame".
    assert.ok(titles.some((t) => /credits at ND/.test(t)), JSON.stringify(titles));
    assert.ok(titles.some((t) => /^Core: /.test(t)), 'the §4.4.1 area the course covers: ' + JSON.stringify(titles));
  });

  it('a course still to be passed says what it WILL count toward', () => {
    const counts = countsFor(student([nd('CSE 60641', { grade: 'IP' })]), 'CSE 60641');
    assert.equal(counts.filter((c) => c.when === 'now').length, 0, 'nothing counts yet');
    const later = counts.filter((c) => c.when === 'later').map((c) => c.title);
    assert.ok(later.some((t) => /total credits/.test(t)), JSON.stringify(later));
    assert.ok(later.some((t) => /regular-course credits/.test(t)), JSON.stringify(later));
  });

  it('a seminar counts toward the seminar requirement and the total, not the regular-course credits', () => {
    const titles = countsFor(student([nd('CSE 63801', { credits: 1, grade: 'S' })]), 'CSE 63801').map((c) => c.title);
    assert.ok(titles.some((t) => /Research seminar/i.test(t)), JSON.stringify(titles));
    assert.ok(titles.some((t) => /total credits/.test(t)), JSON.stringify(titles));
    assert.ok(!titles.some((t) => /regular-course credits/.test(t)), 'a seminar is not a regular course: ' + JSON.stringify(titles));
  });

  it('a course that earns nothing lists nothing', () => {
    // 50000-level CSE courses do not count (decision Q19), and since
    // 2026-09-12 (red-team F8) neither does anything below the 40000 level;
    // an unlisted 6xxxx course is a different case — it is counted
    // provisionally pending review, and its line says what it WOULD feed.
    assert.deepEqual(countsFor(student([nd('CSE 50001')]), 'CSE 50001'), []);
    assert.deepEqual(countsFor(student([nd('CSE 10001')]), 'CSE 10001'), []);
    const unlisted = countsFor(student([nd('CSE 69999')]), 'CSE 69999');
    assert.ok(unlisted.length > 0 && unlisted.every((c) => c.when === 'later'), 'provisional, so everything is conditional: ' + JSON.stringify(unlisted));
  });

  it('every listed requirement is a real row, so its link resolves', () => {
    const report = audit(student([nd('CSE 60641'), nd('CSE 63801', { credits: 1, grade: 'S' })]), rules, '2027-03-01');
    const ids = new Set(report.requirements.map((r) => r.id));
    for (const line of report.courseLines) {
      for (const c of line.counts) assert.ok(ids.has(c.id), `${line.courseId} points at a row that does not exist: ${c.id}`);
    }
  });

  it('semesters are never mistaken for courses (the residency row lists terms)', () => {
    const report = audit(student([nd('CSE 60641')]), rules, '2027-03-01');
    const entered = new Set(report.courseLines.map((l) => l.courseId));
    for (const line of report.courseLines) {
      for (const c of line.counts) assert.ok(entered.has(line.courseId), c.title);
      assert.ok(!line.counts.some((c) => /residence/i.test(c.title)), 'residency counts semesters, not courses');
    }
  });
});

// The sheet may name SEVERAL specialization groups for one course (DGS
// 2026-09-08): a course can then satisfy any one of them, not just one group
// or all five, and the student picks which.
describe('a course listed under several specialization groups', () => {
  // The sheet's one such course is CSE 60876 Research Methods, whose cell
  // spells the five groups out — `alg, hcc, arch, dsai, sys`, separated by
  // commas and spaces where the sheet elsewhere uses a semicolon. CSE 60427
  // and CSE 60641 name a single group each. (Re-pointed 2026-09-18, when the
  // fixture was re-read off the live sheet: CSE 60427 is `hcc` alone there,
  // and the `any` keyword this block used to exercise has left both the
  // Courses tab and the live Categories tab.)
  const rule = (id: string) => rules.courses.get(id)?.[0];

  it('the sheet cell is read as a list', () => {
    assert.deepEqual(
      rule('CSE 60876')?.categoryGroups,
      ['alg', 'hcc', 'arch', 'dsai', 'sys'],
      'commas and spaces separate the codes just as a semicolon does',
    );
    assert.deepEqual(rule('CSE 60427')?.categoryGroups, ['hcc'], 'one group still reads as a list of one');
    assert.deepEqual(rule('CSE 60641')?.categoryGroups, ['sys'], 'one group still reads as a list of one');
    assert.equal(rule('CSE 40113')?.categoryIneligible, true);
  });

  it('offers only the groups the course is listed under, minus those another course covers', () => {
    const s = student([
      nd('CSE 60876', { title: 'Research Methods' }),
      nd('CSE 60641', { title: 'Graduate Operating Systems' }),
    ]);
    const row = audit(s, rules, '2027-03-01').requirements.find((r) => r.id === 'phd.qualifier.categories');
    const offered = row?.groupChoices?.['CSE 60876'] ?? [];
    assert.ok(offered.length > 0, 'its own groups: ' + JSON.stringify(offered));
    assert.ok(!offered.includes('sys'), 'CSE 60641 already covers sys, so it is not offered again: ' + JSON.stringify(offered));
    // "Only the groups it is listed under" has no course left to bite on while
    // the sheet's one multi-group course is listed under all five; the check
    // stays as the invariant a narrower cell would have to honour.
    const listed = rule('CSE 60876')?.categoryGroups ?? [];
    assert.ok(offered.every((g) => listed.includes(g)), 'never a group it is not listed under: ' + JSON.stringify(offered));
    // A course the sheet pins to one group is offered no choice at all.
    assert.equal(row?.groupChoices?.['CSE 60641'], undefined, 'the sheet fixes this course’s group');
  });

  it('a multi-group course can fill any one of them, so it covers whichever is still open', () => {
    const s = student([
      nd('CSE 60876', { title: 'Research Methods' }),
      nd('CSE 60641', { title: 'Graduate Operating Systems' }),
      nd('CSE 60111', { title: 'Complexity and Algorithms' }),
    ]);
    const row = audit(s, rules, '2027-03-01').requirements.find((r) => r.id === 'phd.qualifier.categories');
    assert.equal(row?.status, 'met', String(row?.detail));
    assert.ok((row?.satisfiedBy ?? []).includes('CSE 60876'), JSON.stringify(row?.satisfiedBy));
  });
});
