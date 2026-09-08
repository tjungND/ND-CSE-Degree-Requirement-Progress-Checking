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
    assert.ok(titles.some((t) => /regular courses/.test(t)), JSON.stringify(titles));
    assert.ok(titles.some((t) => /taken at Notre Dame/.test(t)), JSON.stringify(titles));
    assert.ok(titles.some((t) => /^Core knowledge: /.test(t)), 'the §4.4.1 area the course covers: ' + JSON.stringify(titles));
  });

  it('a course still to be passed says what it WILL count toward', () => {
    const counts = countsFor(student([nd('CSE 60641', { grade: 'IP' })]), 'CSE 60641');
    assert.equal(counts.filter((c) => c.when === 'now').length, 0, 'nothing counts yet');
    const later = counts.filter((c) => c.when === 'later').map((c) => c.title);
    assert.ok(later.some((t) => /total credits/.test(t)), JSON.stringify(later));
    assert.ok(later.some((t) => /regular courses/.test(t)), JSON.stringify(later));
  });

  it('a seminar counts toward the seminar requirement and the total, not the regular-course credits', () => {
    const titles = countsFor(student([nd('CSE 63801', { credits: 1, grade: 'S' })]), 'CSE 63801').map((c) => c.title);
    assert.ok(titles.some((t) => /Research Seminar/.test(t)), JSON.stringify(titles));
    assert.ok(titles.some((t) => /total credits/.test(t)), JSON.stringify(titles));
    assert.ok(!titles.some((t) => /regular courses at the 60000/.test(t)), 'a seminar is not a regular course: ' + JSON.stringify(titles));
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
