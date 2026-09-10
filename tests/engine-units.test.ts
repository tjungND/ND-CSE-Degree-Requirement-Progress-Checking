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
import { coursesNeedingDgsReview } from '../src/engine/review.ts';
import { isCseCourse, subjectCode } from '../src/data/external.ts';
import { specialTracks } from '../src/engine/tracks.ts';
import { classify } from '../src/engine/allocate.ts';
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

// Non-CSE courses for a Ph.D. student (§4.2: "Up to nine (9) credits at the
// 6xxxx level taken from a department other than CSE may be used to satisfy
// the course requirement, subject to approval of the student's advisor and
// DGS."). Three defects found on 2026-09-09 while checking that path.
describe('non-CSE courses', () => {
  const nonCseStudent = (courses: CourseEntry[], attestations: Student['attestations'] = {}): Student => ({
    schemaVersion: 1,
    program: 'phd',
    entryTerm: { season: 'fall', year: 2026 },
    bachelorsAwarded: { season: 'spring', year: 2026 },
    priorMs: 'none',
    gpa: 3.6,
    courses,
    milestones: {},
    attestations,
  });
  const course = (courseId: string, title: string, credits = 3): CourseEntry => ({
    courseId,
    title,
    credits,
    term: { season: 'fall', year: 2026 },
    grade: 'A',
    origin: 'nd',
  });

  // §4.4.1 puts no department limit on a core course ("an Operating Systems
  // course, an Algorithms course, and a Computer Architecture course, either
  // at Notre Dame or at their previous institution"), and Notre Dame's own
  // architecture course may well be EE's. The core row keys its "pending
  // review" path off `unknown`, which the non-CSE branch never set — so the
  // student was told "No Computer Architecture course yet" while holding one.
  it('an unlisted non-CSE course with a core-area title reaches §4.4.1', () => {
    const report = audit(nonCseStudent([course('EE 60566', 'Advanced Computer Architecture')]), buildRules(), '2027-06-01');
    const row = report.requirements.find((r) => r.id === 'phd.qualifier.core.architecture');
    assert.equal(row?.status, 'needs_dgs_review');
    assert.match(row!.detail, /Pending review: EE 60566/);
    assert.match(row!.detail, /Computer Architecture/);
  });

  it('the same course is in the review request, named as both unlisted and needing approval', () => {
    const s = nonCseStudent([course('EE 60566', 'Advanced Computer Architecture')]);
    const pending = coursesNeedingDgsReview(s, buildRules());
    assert.equal(pending.length, 1);
    assert.equal(pending[0]!.unlisted, true, 'it needs a new Courses-tab row');
    assert.match(pending[0]!.reason, /not in the course rules yet/);
    assert.match(pending[0]!.reason, /non-CSE course/);
  });

  // CLAUDE.md: "A missing parameter renders 'cannot evaluate', never a
  // default." The allocator's room was `limit ?? 0`, so a cap the sheet does
  // not give read as ZERO: the cap row said "cannot evaluate" while every
  // non-CSE course was painted red "over the ?-credit non-CSE cap".
  it('a cap the Parameters tab is missing is unknown, not zero', () => {
    const rules = buildRules({ parameters: { phd_noncse_6xxxx_credits_max: null } });
    const report = audit(nonCseStudent([course('MATH 60610', 'Applied Mathematics')], { dgsApprovedNonCse: true }), rules, '2027-06-01');
    assert.equal(report.requirements.find((r) => r.id === 'phd.cap.noncse')?.status, 'cannot_evaluate');
    const line = report.courseLines.find((l) => l.courseId === 'MATH 60610');
    assert.equal(line?.mark, 'pending', 'amber, not a red "over the cap"');
    assert.doesNotMatch(line!.text, /over the/);
    assert.match(line!.text, /does not say what the non-CSE cap is/);
    assert.match(line!.text, /ask the DGS/);
  });

  // "counts" is third-person; only "would count" / "will count" take the bare
  // verb. A passed course partly over a cap read "count 1 of 4 credits".
  it('a passed course partly over the cap keeps its verb', () => {
    const courses = [course('MATH 60610', 'A', 4), course('ACMS 60842', 'B', 4), course('EE 60566', 'C', 4)];
    const report = audit(nonCseStudent(courses, { dgsApprovedNonCse: true }), buildRules(), '2027-06-01');
    const partial = report.courseLines.find((l) => /of 4 credits/.test(l.text));
    assert.ok(partial, 'one course should be partly over the 9-credit cap');
    assert.match(partial!.text, /^counts 1 of 4 credits toward regular courses/);
    assert.match(partial!.text, /3 not counted — over the 9-credit non-CSE cap \(§4\.2\)/);
  });
});

// Which transferred courses are CSE (DGS 2026-09-09). §4.2 caps credits "taken
// from a department other than CSE" at nine, and another university's
// transcript names the department every way there is — CS, CompSci, CSCI,
// CSYE, ECE, CE — several of which mean CSE at one school and not at another.
describe('is a transferred course a CSE course?', () => {
  const rule = (isCse?: boolean) => ({ university: 'X', universityKey: 'x', courseId: 'ECE 60146', title: '', sheetRow: 2, ...(isCse === undefined ? {} : { isCse }) });
  const codes = ['CS', 'CSCI', 'COMPSCI', 'CSYE'];

  it('reads the subject code however it is punctuated or cased', () => {
    assert.equal(subjectCode('CompSci 537'), 'COMPSCI');
    assert.equal(subjectCode('CS-503'), 'CS');
    assert.equal(subjectCode('csye 6200'), 'CSYE');
    assert.equal(subjectCode('60610'), '');
  });

  it('the sheet\u2019s code list decides, and a code it does not name is outside CSE', () => {
    assert.equal(isCseCourse('CS 50300', undefined, codes), true);
    assert.equal(isCseCourse('CompSci 537', undefined, codes), true);
    assert.equal(isCseCourse('ECE 60146', undefined, codes), false);
    assert.equal(isCseCourse('MENG 50100', undefined, codes), false);
  });

  it('a per-course is_cse ruling wins over the list, both ways', () => {
    assert.equal(isCseCourse('ECE 60146', rule(true), codes), true, 'this ECE department teaches computing');
    assert.equal(isCseCourse('CS 59000', rule(false), codes), false, 'and a CS-coded course need not be one');
  });

  // Without the list the app knows nothing about departments elsewhere, and
  // says so by leaving the allowance off the course — never by guessing.
  it('no list in the sheet means no answer at all', () => {
    assert.equal(isCseCourse('ECE 60146', undefined, undefined), undefined);
    assert.equal(isCseCourse('ECE 60146', rule(true), undefined), true, 'a ruling still stands on its own');
  });

  // A blank cell must not read as "no code means CSE" — that would put every
  // transferred course inside the nine-credit allowance on an empty cell.
  it('a blank cse_subject_codes cell reads as no answer, not as an empty list', () => {
    const rules = buildRules({ parameters: { cse_subject_codes: '' } });
    assert.equal(rules.parameters.codeList('cse_subject_codes'), undefined);
    assert.equal(rules.parameters.codeList('nope'), undefined);
    assert.deepEqual(buildRules().parameters.codeList('cse_subject_codes'), ['CS', 'CSCI', 'COMPSCI', 'CSE', 'CMSC', 'EECS', 'CSYE']);
  });
});

// Transition to Computing bridge courses for a Ph.D. student (§3.6). The
// handbook writes §3.6 for the MSCSE — "CSE 50xxx courses are preparatory and
// do not count toward the MSCSE degree requirements in §3.1-3.5" — and says
// nothing about a Ph.D. student required to take them; the sheet decides,
// course by course (DGS 2026-09-03 for CSE 50502).
describe('50000-level bridge courses', () => {
  const bridgeStudent = (attestations: Student['attestations'] = {}): Student => ({
    schemaVersion: 1,
    program: 'phd',
    entryTerm: { season: 'fall', year: 2026 },
    bachelorsAwarded: { season: 'spring', year: 2026 },
    priorMs: 'none',
    gpa: 3.5,
    courses: [{ courseId: 'CSE 50120', credits: 3, term: { season: 'fall', year: 2026 }, grade: 'A', origin: 'nd' }],
    milestones: {},
    attestations,
  });

  // The checkbox was renamed to "courses below the 60000 level" when the DGS
  // put both levels under one cap (2026-09-09), but it still only cleared
  // level 4 — so the one bridge course the sheet permits could never be
  // approved, and stayed amber and in the review request for good.
  it('the below-60000 approval checkbox clears a 50000-level course', () => {
    const before = audit(bridgeStudent(), buildRules(), '2027-06-01');
    assert.equal(before.requirements.find((r) => r.id === 'phd.credits.regular')?.status, 'unmet');
    assert.match(before.courseLines.find((l) => l.courseId === 'CSE 50120')!.text, /needs advisor \+ DGS approval/);

    const after = audit(bridgeStudent({ dgsApproved4xxxx: true }), buildRules(), '2027-06-01');
    const line = after.courseLines.find((l) => l.courseId === 'CSE 50120');
    assert.equal(line?.mark, 'counts');
    assert.match(line!.text, /^counts toward regular courses \(3 cr\)/);
    assert.match(after.requirements.find((r) => r.id === 'phd.credits.regular')!.detail, /3 of 24/);
    assert.equal(coursesNeedingDgsReview(bridgeStudent({ dgsApproved4xxxx: true }), buildRules()).length, 0);
  });

  // The line names the course's OWN level: the cap covers both, and a bridge
  // course was telling the student it used "the 40000-level allowance".
  it('the allowance line names the level the course is at', () => {
    const after = audit(bridgeStudent({ dgsApproved4xxxx: true }), buildRules(), '2027-06-01');
    assert.match(after.courseLines.find((l) => l.courseId === 'CSE 50120')!.text, /uses the 50000-level allowance \(6 credits, §4\.2\)/);
  });

  // §3.6.1 for the MSCSE, straight from the sheet's counts_toward_mscse = no.
  it('the same course counts nothing toward the MSCSE', () => {
    const ms = audit({ ...bridgeStudent({ dgsApproved4xxxx: true }), program: 'mscse' }, buildRules(), '2027-06-01');
    assert.match(ms.courseLines.find((l) => l.courseId === 'CSE 50120')!.text, /does not count toward the MSCSE/);
    assert.match(ms.requirements.find((r) => r.id === 'ms.credits.total')!.detail, /0 of 30/);
  });

  // §4.3 residence counts REGISTERED credits, not credits that count toward
  // the degree — a bridge semester is still a full-time semester.
  it('a bridge semester still counts toward residence', () => {
    const s = bridgeStudent();
    s.courses = ['CSE 50120', 'CSE 60641', 'CSE 60111'].map((courseId) => ({
      courseId, credits: 3, term: { season: 'fall', year: 2026 }, grade: 'A', origin: 'nd' as const,
    }));
    assert.match(audit(s, buildRules(), '2027-06-01').requirements.find((r) => r.id === 'phd.residency')!.detail, /1 of 4 semesters/);
  });
});

// The two tracks this audit does not model (§3.5, §3.6). Promised 2026-08-31
// ("students on those tracks see a clearly-worded 'talk to the DGS' note"),
// built 2026-09-10. Recognised from the coursework, never asked for.
describe('§3.5 / §3.6 track notes', () => {
  const rules = buildRules();
  const student = (courses: CourseEntry[], over: Partial<Student> = {}): Student => ({
    schemaVersion: 1,
    program: 'phd',
    entryTerm: { season: 'fall', year: 2026 },
    bachelorsAwarded: { season: 'spring', year: 2026 },
    priorMs: 'none',
    gpa: 3.5,
    courses,
    milestones: {},
    attestations: {},
    ...over,
  });
  const course = (courseId: string, year = 2026, season: 'fall' | 'spring' = 'fall'): CourseEntry => ({
    courseId, credits: 3, term: { season, year }, grade: 'A', origin: 'nd',
  });
  const tracksOf = (s: Student) => specialTracks(s, classify(s, rules).classified);

  it('a bridge course raises the §3.6 note, and says something different to each program', () => {
    const phd = tracksOf(student([course('CSE 50120')]));
    assert.deepEqual(phd.map((t) => t.id), ['transition']);
    assert.match(phd[0]!.text, /ask them/i);
    const ms = tracksOf(student([course('CSE 50120')], { program: 'mscse' }));
    assert.match(ms[0]!.text, /do not count toward the MSCSE degree requirements/);
  });

  it('an unlisted 50000-level CSE course raises it too — the sheet need not know the course', () => {
    assert.deepEqual(tracksOf(student([course('CSE 59999')])).map((t) => t.id), ['transition']);
  });

  it('ordinary coursework raises nothing', () => {
    assert.deepEqual(tracksOf(student([course('CSE 60641'), course('CSE 40113')])), []);
  });

  it('a graduate course taken before the bachelor’s degree raises the §3.5 note', () => {
    const s = student([course('CSE 60641', 2026, 'spring')]); // awarded Spring 2026
    assert.deepEqual(tracksOf(s).map((t) => t.id), ['integrated']);
    // A year later, after the degree, it is ordinary coursework.
    assert.deepEqual(tracksOf(student([course('CSE 60641', 2027, 'spring')])), []);
    // And with no award term recorded the app says nothing rather than guessing.
    assert.deepEqual(tracksOf(student([course('CSE 60641', 2026, 'spring')], { bachelorsAwarded: undefined })), []);
  });

  it('both at once — a 4+1 who then needs bridge courses', () => {
    const s = student([course('CSE 60641', 2026, 'spring'), course('CSE 50120')]);
    assert.deepEqual(tracksOf(s).map((t) => t.id), ['transition', 'integrated']);
    assert.deepEqual(audit(s, rules, '2027-06-01').tracks.map((t) => t.section), ['§3.6', '§3.5']);
  });
});

// §3.5's allowance, and where it stops (DGS 2026-09-10). It reverses the
// 2026-09-06 rule for NOTRE DAME's own 4+1 courses only: §5.2 criterion 2
// still bars every other course taken before the bachelor's degree.
describe('§3.5 allowance boundaries', () => {
  const rules = buildRules();
  const student = (courses: CourseEntry[], over: Partial<Student> = {}): Student => ({
    schemaVersion: 1,
    program: 'phd',
    entryTerm: { season: 'fall', year: 2026 },
    bachelorsAwarded: { season: 'spring', year: 2026 },
    priorMs: 'completed',
    gpa: 3.8,
    courses,
    milestones: {},
    attestations: { transferApproved: true },
    ...over,
  });
  const before = (courseId: string, institution = 'University of Notre Dame'): CourseEntry => ({
    courseId, credits: 3, term: { season: 'fall', year: 2025 }, grade: 'A', origin: 'transfer',
    institution, degreeLevel: 'masters', registeredLevel: 'graduate',
  });
  const lineFor = (s: Student, id: string) => audit(s, rules, '2027-06-01').courseLines.find((l) => l.courseId === id)!.text;

  it('a Notre Dame 6xxxx course from before the degree transfers', () => {
    assert.match(lineFor(student([before('CSE 60641')]), 'CSE 60641'), /counts toward regular courses/);
  });

  it('the same course from ANOTHER university does not — §5.2 criterion 2 stands', () => {
    assert.match(lineFor(student([before('CS 50300', 'Purdue University')]), 'CS 50300'), /taken before your bachelor’s degree was awarded/);
  });

  it('a non-CSE Notre Dame course does not — §3.5 is about CSE courses', () => {
    assert.match(lineFor(student([before('MATH 60610')]), 'MATH 60610'), /taken before your bachelor’s degree was awarded/);
  });

  it('a 40000-level Notre Dame course does not — §3.5 says 6xxxx', () => {
    assert.match(lineFor(student([before('CSE 40113')]), 'CSE 40113'), /taken as an undergraduate student|taken before your bachelor’s degree/);
  });

  it('an MSCSE student is unaffected — §3.5 already counts those toward their own degree', () => {
    const ms = student([before('CSE 60641')], { program: 'mscse' });
    assert.match(lineFor(ms, 'CSE 60641'), /taken before your bachelor’s degree was awarded/);
  });

  it('the allowance is a credit cap, and the row appears only for a student who has one', () => {
    const one = audit(student([before('CSE 60641')]), rules, '2027-06-01');
    assert.equal(one.requirements.find((r) => r.id === 'phd.cap.seniorgrad')?.status, 'met');
    const none = audit(student([{ courseId: 'CSE 60641', credits: 3, term: { season: 'fall', year: 2026 }, grade: 'A', origin: 'nd' }]), rules, '2027-06-01');
    assert.equal(none.requirements.find((r) => r.id === 'phd.cap.seniorgrad'), undefined);
  });
});
