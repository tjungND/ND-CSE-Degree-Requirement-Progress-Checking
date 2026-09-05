// Direct unit tests for the engine's tricky corners: order independence, the
// cap allocator, group matching, the status algebra, and term arithmetic.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { allocate, type CapSpec, type ClassifiedCourse } from '../src/engine/allocate.ts';
import { audit } from '../src/engine/audit.ts';
import { matchDistinctGroups } from '../src/engine/matching.ts';
import { combineAll, deadlineStatus, thresholdStatus } from '../src/engine/status.ts';
import {
  maxConsecutiveFullTime,
  normalizeEntryTerm,
  nthSemester,
  semesterNumber,
  termOfDate,
} from '../src/engine/term.ts';
import type { CourseEntry, Status, Student } from '../src/engine/types.ts';
import { buildRules, type ScenarioFile } from './helpers.ts';

const here = dirname(fileURLToPath(import.meta.url));
const scenario = (name: string): ScenarioFile =>
  JSON.parse(readFileSync(join(here, 'scenarios', `${name}.json`), 'utf8'));

describe('order independence', () => {
  // The prototype's biggest bug: entry order changed the verdict. Permuting the
  // course list must never change any requirement status or counted totals.
  const rules = buildRules();
  for (const name of ['phd-4xxxx-overuse', 'mscse-noncse-ten', 'phd-transfer-prior-ms']) {
    it(name, () => {
      const sc = scenario(name);
      const base = audit(sc.student, rules, sc.today);
      const courses = sc.student.courses;
      for (let shift = 1; shift < courses.length; shift++) {
        const rotated = [...courses.slice(shift), ...courses.slice(0, shift)].reverse();
        const permuted: Student = { ...sc.student, courses: rotated };
        const report = audit(permuted, rules, sc.today);
        assert.deepEqual(
          report.requirements.map((r) => [r.id, r.status]),
          base.requirements.map((r) => [r.id, r.status]),
          `statuses changed under permutation ${shift}`,
        );
        assert.deepEqual(report.summary, base.summary);
      }
    });
  }
});

describe('allocator', () => {
  const mk = (
    courseId: string,
    credits: number,
    caps: ClassifiedCourse['caps'],
  ): ClassifiedCourse => ({
    entry: {
      courseId,
      credits,
      term: { season: 'fall', year: 2026 },
      grade: 'A',
      origin: 'nd',
    },
    pool: 'regular',
    caps,
    tier: 'definite',
  });
  const caps: CapSpec[] = [
    { id: 'fourk', limit: 3, label: '3-credit A cap', section: '§t' },
    { id: 'noncse', limit: 3, label: '3-credit B cap', section: '§t' },
  ];

  it('multi-cap courses never displace single-cap credits (exact, not greedy)', () => {
    // X consumes both caps; entry-order greedy would count X first and lose 3.
    const X = mk('CSE 10001', 3, ['fourk', 'noncse']);
    const Y = mk('CSE 10002', 3, ['fourk']);
    const Z = mk('CSE 10003', 3, ['noncse']);
    const r = allocate([X, Y, Z], caps);
    assert.equal(r.regular.definite, 6, 'optimal picks Y and Z, not X');
    const forX = r.perCourse.find((p) => p.course === X)!;
    assert.equal(forX.countedRegular, 0);
  });

  it('caps allocate at credit granularity (partial counting)', () => {
    const A = mk('CSE 10001', 4, ['fourk']); // 4 credits against a 3-credit cap
    const r = allocate([A], caps);
    const line = r.perCourse[0]!;
    assert.equal(line.countedRegular, 3);
    assert.equal(line.excluded, 1);
    assert.ok(line.explanation.includes('3 of 4'), line.explanation);
  });

  it('definite credits consume caps before in-progress credits', () => {
    const done = mk('CSE 10002', 3, ['fourk']);
    const ip: ClassifiedCourse = {
      ...mk('CSE 10001', 3, ['fourk']),
      tier: 'in_progress',
    };
    const r = allocate([ip, done], caps); // ip listed first on purpose
    assert.equal(r.regular.definite, 3);
    assert.equal(r.regular.in_progress, 0);
  });
});

describe('distinct-group matching', () => {
  const groups = ['alg', 'hcc', 'arch', 'dsai', 'sys'];
  it("an 'any' course fills the missing group", () => {
    const r = matchDistinctGroups(
      [
        { courseId: 'A', title: '', groups: ['alg'], sortKey: '1' },
        { courseId: 'B', title: '', groups: ['alg'], sortKey: '2' },
        { courseId: 'RM', title: 'Research Methods', groups, sortKey: '3' },
      ],
      groups,
    );
    assert.equal(r.distinctCount, 2);
    assert.equal(r.assignment.get('RM') !== 'alg', true, 'RM must not waste itself on alg');
  });

  it('a suboptimal pin is honored but flagged', () => {
    const r = matchDistinctGroups(
      [
        { courseId: 'A', title: '', groups: ['alg'], sortKey: '1' },
        { courseId: 'RM', title: '', groups, pinned: 'alg', sortKey: '2' },
      ],
      groups,
    );
    assert.equal(r.distinctCount, 1, 'pin forces both onto alg');
    assert.ok(r.suggestions.length > 0);
  });
});

describe('status algebra', () => {
  it('threshold ladder: worst credit actually needed', () => {
    const s = (definite: number, in_progress: number, provisional: number) => ({
      definite,
      in_progress,
      provisional,
    });
    assert.equal(thresholdStatus(s(24, 0, 0), 24), 'met');
    assert.equal(thresholdStatus(s(21, 3, 0), 24), 'in_progress');
    assert.equal(thresholdStatus(s(21, 0, 3), 24), 'needs_dgs_review');
    assert.equal(thresholdStatus(s(21, 2, 1), 24), 'needs_dgs_review');
    assert.equal(thresholdStatus(s(21, 0, 0), 24), 'unmet');
    assert.equal(thresholdStatus(s(999, 0, 0), undefined), 'cannot_evaluate');
  });

  it('combineAll is worst-first and ignores n/a', () => {
    const c = (...xs: Status[]) => combineAll(xs);
    assert.equal(c('met', 'met'), 'met');
    assert.equal(c('met', 'in_progress'), 'in_progress');
    assert.equal(c('in_progress', 'needs_dgs_review'), 'needs_dgs_review');
    assert.equal(c('needs_dgs_review', 'cannot_evaluate'), 'cannot_evaluate');
    assert.equal(c('cannot_evaluate', 'unmet'), 'unmet');
    assert.equal(c('met', 'not_applicable'), 'met');
    assert.equal(c('not_applicable'), 'not_applicable');
  });

  it('a milestone completed after its deadline needs DGS review (Q22)', () => {
    const r = deadlineStatus({
      doneOn: '2030-09-01',
      deadline: { date: '2030-05-31', approx: true },
      today: '2030-10-01',
      deadlineLabel: 'the end of Spring 2030',
    });
    assert.equal(r.status, 'needs_dgs_review');
    const ext = deadlineStatus({
      doneOn: '2030-09-01',
      deadline: { date: '2030-05-31', approx: true },
      today: '2030-10-01',
      deadlineLabel: 'the end of Spring 2030',
      extensionGranted: true,
    });
    assert.equal(ext.status, 'met');
  });
});

describe('term arithmetic', () => {
  it('termOfDate boundaries: June–mid-August are summer (prototype counted them as spring)', () => {
    assert.deepEqual(termOfDate('2027-05-31'), { season: 'spring', year: 2027 });
    assert.deepEqual(termOfDate('2027-06-15'), { season: 'summer', year: 2027 });
    assert.deepEqual(termOfDate('2027-07-31'), { season: 'summer', year: 2027 });
    assert.deepEqual(termOfDate('2027-08-14'), { season: 'summer', year: 2027 });
    assert.deepEqual(termOfDate('2027-08-15'), { season: 'fall', year: 2027 });
  });

  it('semester numbering counts fall/spring only', () => {
    const entry = { season: 'fall', year: 2026 } as const;
    assert.equal(semesterNumber(entry, { season: 'fall', year: 2026 }), 1);
    assert.equal(semesterNumber(entry, { season: 'spring', year: 2027 }), 2);
    assert.equal(semesterNumber(entry, { season: 'summer', year: 2027 }), 2); // summer ≙ preceding semester
    assert.equal(semesterNumber(entry, { season: 'spring', year: 2028 }), 4);
    assert.deepEqual(nthSemester(entry, 8), { season: 'spring', year: 2030 });
  });

  it('summer entry normalizes to the following fall (Q17c)', () => {
    const n = normalizeEntryTerm({ season: 'summer', year: 2026 });
    assert.deepEqual(n.term, { season: 'fall', year: 2026 });
    assert.equal(n.normalized, true);
  });

  it('consecutive full-time runs skip summers but break on a missed semester', () => {
    const t = (season: 'fall' | 'spring' | 'summer', year: number, fullTime = true) => ({
      term: { season, year },
      fullTime,
    });
    // fall26, spring27, [no summer], fall27, spring28 → run of 4
    assert.equal(
      maxConsecutiveFullTime([t('fall', 2026), t('spring', 2027), t('fall', 2027), t('spring', 2028)]),
      4,
    );
    // gap in fall27 breaks the run
    assert.equal(
      maxConsecutiveFullTime([t('fall', 2026), t('spring', 2027), t('spring', 2028)]),
      2,
    );
    // summer terms never contribute or break
    assert.equal(
      maxConsecutiveFullTime([t('fall', 2026), t('summer', 2027), t('spring', 2027)]),
      2,
    );
  });
});

// Residence counts only from the entry term (2026-09-05): a combined Notre Dame
// transcript's undergraduate semesters are not Ph.D. residence (§4.3).
describe('residency from the entry term (2026-09-05)', () => {
  it('ignores Notre Dame terms and overrides dated before the entry term', async () => {
    const { fullTimeTermRecords } = await import('../src/engine/requirements/residency.ts');
    const rules = buildRules();
    const nd = (season: 'fall' | 'spring', year: number): CourseEntry => ({ courseId: 'CSE 60641', credits: 9, term: { season, year }, grade: 'A', origin: 'nd' });
    const student: Student = {
      schemaVersion: 1,
      program: 'phd',
      entryTerm: { season: 'fall', year: 2024 },
      priorMs: 'none',
      courses: [nd('fall', 2020), nd('spring', 2021), nd('fall', 2024), nd('spring', 2025)],
      fullTimeTermOverrides: [{ season: 'fall', year: 2023 }, { season: 'fall', year: 2025 }],
      milestones: {},
      attestations: {},
    };
    const ctx = { student, rules, params: rules.parameters } as unknown as Parameters<typeof fullTimeTermRecords>[0];
    const records = fullTimeTermRecords(ctx);
    assert.deepEqual(
      records.map((r) => `${r.term.season} ${r.term.year}${r.fullTime ? ' ft' : ''}`),
      ['fall 2024 ft', 'spring 2025 ft', 'fall 2025 ft'],
    );
    assert.equal(maxConsecutiveFullTime(records), 3);
  });
});

// Deadline chips name SEMESTERS, never dates (DGS request 2026-09-05). The
// engine keeps the ISO date underneath for ordering and comparisons.
describe('deadline chips read as semesters (2026-09-05)', () => {
  it('a fresh Fall 2026 Ph.D. student sees terms on every deadline chip', () => {
    const sc = scenario('phd-fresh');
    const report = audit(sc.student, buildRules(), sc.today);
    const label = (id: string) => report.requirements.find((r) => r.id === id)?.deadline?.label;
    assert.equal(label('phd.timeLimit'), 'Due before Fall 2034 — 8 years after entry (approximate)');
    assert.equal(label('phd.qualifier.research'), 'Due by mid-Spring 2028 — 18 months after entry (approximate)');
    assert.equal(label('phd.qualifier'), 'Due by the end of Spring 2028 (approximate)');
    assert.equal(label('phd.candidacy'), 'Due by the end of Spring 2030 — semester 8 (approximate)');
    for (const r of report.requirements) {
      if (r.deadline) assert.doesNotMatch(r.deadline.label, /\d{4}-\d{2}-\d{2}/, `${r.id}: ${r.deadline.label}`);
      assert.doesNotMatch(r.detail, /\d{4}-\d{2}-\d{2}/, `${r.id} detail: ${r.detail}`);
    }
    assert.equal(report.requirements.find((r) => r.id === 'phd.timeLimit')?.deadline?.date, '2034-08-15', 'the ISO date is still carried underneath');
  });

  it('an overdue chip names the semester too', () => {
    const sc = scenario('phd-past-candidacy-deadline');
    const report = audit(sc.student, buildRules(), sc.today);
    const cand = report.requirements.find((r) => r.id === 'phd.candidacy');
    assert.equal(cand?.deadline?.state, 'overdue');
    assert.match(cand?.deadline?.label ?? '', /^Overdue — the deadline was the end of (Spring|Fall) \d{4} — semester 8 \(approximate\)$/);
  });
});
