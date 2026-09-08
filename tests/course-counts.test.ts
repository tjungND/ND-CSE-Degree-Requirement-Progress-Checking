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

const rules = buildRules();
const nd = (courseId: string, extra: Partial<CourseEntry> = {}): CourseEntry => ({
  courseId,
  credits: 3,
  term: { season: 'fall', year: 2026 },
  grade: 'A',
  origin: 'nd',
  ...extra,
});
const student = (courses: CourseEntry[]): Student => ({
  schemaVersion: 1,
  program: 'phd',
  entryTerm: { season: 'fall', year: 2026 },
  priorMs: 'none',
  gpa: 3.5,
  courses,
  milestones: {},
  attestations: {},
});
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
    // 50000-level CSE courses do not count (decision Q19); an unlisted 1xxxx
    // course is a different case — it is counted provisionally pending review,
    // and its line correctly says what it WOULD then feed.
    assert.deepEqual(countsFor(student([nd('CSE 50001')]), 'CSE 50001'), []);
    const unlisted = countsFor(student([nd('CSE 10001')]), 'CSE 10001');
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
  // The fixture sheet lists CSE 60427 under two groups (`hcc;dsai`).
  const rule = (id: string) => rules.courses.get(id)?.[0];

  it('the sheet cell is read as a list', () => {
    assert.deepEqual(rule('CSE 60427')?.categoryGroups, ['hcc', 'dsai']);
    assert.deepEqual(rule('CSE 60641')?.categoryGroups, ['sys'], 'one group still reads as a list of one');
    assert.deepEqual(rule('CSE 60876')?.categoryGroups, ['any'], '`any` still means every group');
    assert.equal(rule('CSE 40113')?.categoryIneligible, true);
  });

  it('offers only the groups the course is listed under, minus those another course covers', () => {
    const s = student([
      nd('CSE 60427', { title: 'Human-Centered Computing' }),
      nd('CSE 60641', { title: 'Graduate Operating Systems' }),
    ]);
    const row = audit(s, rules, '2027-03-01').requirements.find((r) => r.id === 'phd.qualifier.categories');
    const offered = row?.groupChoices?.['CSE 60427'] ?? [];
    assert.ok(offered.includes('hcc') || offered.includes('dsai'), 'its own groups: ' + JSON.stringify(offered));
    assert.ok(!offered.includes('arch') && !offered.includes('alg'), 'never a group it is not listed under: ' + JSON.stringify(offered));
  });

  it('a two-group course can fill either one, so it covers whichever is still open', () => {
    const s = student([
      nd('CSE 60427', { title: 'Human-Centered Computing' }),
      nd('CSE 60641', { title: 'Graduate Operating Systems' }),
      nd('CSE 60111', { title: 'Complexity and Algorithms' }),
    ]);
    const row = audit(s, rules, '2027-03-01').requirements.find((r) => r.id === 'phd.qualifier.categories');
    assert.equal(row?.status, 'met', String(row?.detail));
    assert.ok((row?.satisfiedBy ?? []).includes('CSE 60427'), JSON.stringify(row?.satisfiedBy));
  });
});
