// The early start (policy review round 3, P3-chg-other-1; DGS 2026-10-05:
// "Apply handling (a)"). Academic Code §3.6: "Incoming students who are
// full-time admits, but choose to start in the summer term, are considered
// fulltime students in the summer with any registration". A Notre Dame course
// from the summer just before a fall entry is this program's coursework —
// counted, never refused with "check the entry term", never filed as an
// earlier program's — while every clock, the §5.2 window and residency still
// run from the fall (DGS 2026-10-03, 2026-10-04). The summer stays earlier
// coursework when the record ties it to an earlier Notre Dame degree.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { classify, overMaxTerms } from '../src/engine/allocate.ts';
import { audit } from '../src/engine/audit.ts';
import { beforeProgramStart, isEarlyStartCourse, isEarlyStartSummer } from '../src/engine/early-start.ts';
import type { CourseEntry, Student } from '../src/engine/types.ts';
import { derivePriorMs, hasPriorGraduateStudy, isPriorNd, reclassifyNotreDameCourses } from '../src/ui/prior-nd.ts';
import { parseTranscript } from '../src/transcript/parse.ts';
import { validateStudent } from '../src/ui/state.ts';
import { buildRules } from './helpers.ts';
import { ndCourse, phdStudent } from './helpers/student.ts';

const rules = buildRules();
const TODAY = '2026-10-06';
const summer = (year: number) => ({ season: 'summer' as const, year });
const spring = (year: number) => ({ season: 'spring' as const, year });
const fall = (year: number) => ({ season: 'fall' as const, year });
const ND = 'University of Notre Dame';

/** The finding's student: an MSCSE admit for Fall 2026 who started early,
 * CSE 60111 in Summer 2026 (A), and is taking CSE 60641 this fall. */
const SUMMER_COURSE = (extra: Partial<CourseEntry> = {}): CourseEntry => ndCourse('CSE 60111', { term: summer(2026), registeredLevel: 'graduate', ...extra });
const earlyStarter = (extra: Partial<Student> = {}, courses: CourseEntry[] = [SUMMER_COURSE()]): Student =>
  phdStudent({
    program: 'mscse',
    msOption: 'project',
    entryTerm: fall(2026),
    bachelorsAwarded: spring(2026),
    gpa: 3.7,
    courses: [...courses, ndCourse('CSE 60641', { term: fall(2026), grade: 'IP' })],
    ...extra,
  });

describe('the early-start summer: the term, and what ties it to an earlier degree', () => {
  it('only the summer just before a FALL entry', () => {
    assert.equal(isEarlyStartSummer(summer(2026), fall(2026)), true);
    assert.equal(isEarlyStartSummer(summer(2025), fall(2026)), false, 'a summer a year earlier');
    assert.equal(isEarlyStartSummer(spring(2026), fall(2026)), false, 'the spring before');
    assert.equal(isEarlyStartSummer(summer(2026), spring(2027)), false, 'a spring entry has no summer before it');
    assert.equal(isEarlyStartSummer(summer(2027), fall(2026)), false, 'a summer after entry is ordinary program coursework');
  });
  it('the record can tie that summer to an earlier Notre Dame degree', () => {
    const facts = { entryTerm: fall(2026), bachelorsAwarded: spring(2026) };
    const row = { term: summer(2026), registeredLevel: 'graduate' as const };
    assert.equal(isEarlyStartCourse(row, facts), true);
    assert.equal(isEarlyStartCourse({ term: summer(2026) }, { entryTerm: fall(2026) }), true, 'a hand-typed row with nothing else known');
    assert.equal(isEarlyStartCourse({ ...row, registeredLevel: 'undergraduate' }, facts), false, 'registered as an undergraduate');
    assert.equal(isEarlyStartCourse(row, { ...facts, bachelorsAwarded: summer(2026) }), false, 'an August bachelor’s: taken as an undergraduate (DGS 2026-09-06)');
    assert.equal(isEarlyStartCourse(row, { ...facts, ndDegrees: [{ date: '2026-08-07' }] }), false, 'a Notre Dame degree awarded that summer');
    assert.equal(isEarlyStartCourse(row, { ...facts, ndDegrees: [{ date: '2026-05-17' }] }), true, 'a degree finished in May leaves the summer to the new program');
    assert.equal(isEarlyStartCourse(row, { ...facts, ndMasters: {} }), false, 'a Notre Dame master’s with no known award term may have ended that summer');
    assert.equal(isEarlyStartCourse(row, { ...facts, ndMasters: { term: spring(2026) } }), true);
    assert.equal(beforeProgramStart(row, facts), false);
    assert.equal(beforeProgramStart({ term: spring(2026) }, facts), true);
    assert.equal(beforeProgramStart({ term: fall(2026) }, facts), false);
  });
});

describe('the engine counts it; the clocks and residency stay from the fall', () => {
  it('counted, with no "check the entry term" anywhere', () => {
    const r = audit(earlyStarter(), rules, TODAY);
    const line = r.courseLines.find((l) => l.courseId === 'CSE 60111')!;
    assert.equal(line.mark, 'counts');
    assert.equal(line.text, 'counts toward regular courses (3 cr)');
    assert.ok(!r.warnings.some((w) => /dated before your entry term|check the entry term/.test(w)), JSON.stringify(r.warnings));
    assert.match(r.requirements.find((q) => q.id === 'ms.credits.total')!.detail, /^3 of 30 credits complete/);
  });
  it('the time limit runs from the fall, as without the summer', () => {
    const deadline = (s: Student) => audit(s, rules, TODAY).requirements.find((q) => q.id === 'ms.timeLimit')!.deadline;
    assert.deepEqual(deadline(earlyStarter()), deadline(earlyStarter({}, [])));
    assert.equal(deadline(earlyStarter())?.date, '2031-08-15');
  });
  it('six credits in that summer are still not residence (DGS 2026-10-04)', () => {
    const r = audit(earlyStarter({}, [SUMMER_COURSE(), ndCourse('CSE 60321', { term: summer(2026), registeredLevel: 'graduate' })]), rules, TODAY);
    const residency = r.requirements.find((q) => q.id === 'ms.residency')!;
    assert.doesNotMatch(residency.detail, /Summer 2026/);
    assert.match(residency.detail, /^No full-time semester yet/);
  });
  it('its registration is a graduate summer under Academic Code §3.8’s cap; an older summer is not', () => {
    const four = (year: number) => [1, 2, 3, 4].map((i) => ndCourse(`CSE 6064${i}`, { term: summer(year) }));
    const s = earlyStarter({}, four(2026));
    assert.deepEqual(
      overMaxTerms(classify(s, rules, TODAY).classified, s, s.entryTerm).map((o) => [o.term, o.credits, o.max]),
      [[summer(2026), 12, 10]],
    );
    const older = earlyStarter({}, four(2025));
    assert.deepEqual(overMaxTerms(classify(older, rules, TODAY).classified, older, older.entryTerm), []);
  });
  it('a program row from the spring before still gets the warning', () => {
    const r = audit(earlyStarter({}, [ndCourse('CSE 60111', { term: spring(2026) })]), rules, TODAY);
    assert.ok(r.warnings.some((w) => /CSE 60111 \(Spring 2026\) is entered as coursework of this program but dated before your entry term/.test(w)), JSON.stringify(r.warnings));
  });
});

describe('the page files it as the program’s', () => {
  it('re-filing keeps the summer in the program and files the spring as earlier coursework', () => {
    const s = earlyStarter({}, [SUMMER_COURSE(), ndCourse('CSE 60321', { term: spring(2026), registeredLevel: 'graduate' })]);
    assert.deepEqual(reclassifyNotreDameCourses(s), { toPrior: 1, toProgram: 0 });
    const summerRow = s.courses.find((c) => c.term.season === 'summer')!;
    assert.equal(summerRow.origin, 'nd');
    assert.equal(isPriorNd(summerRow, s), false);
    assert.equal(s.courses.find((c) => c.courseId === 'CSE 60321')!.origin, 'transfer');
  });
  it('a summer row an earlier build filed as prior comes back on the next re-filing', () => {
    const s = earlyStarter({}, [SUMMER_COURSE({ origin: 'transfer', institution: ND, degreeLevel: 'masters' })]);
    assert.deepEqual(reclassifyNotreDameCourses(s), { toPrior: 0, toProgram: 1 });
    assert.equal(s.courses[0]!.origin, 'nd');
  });
  it('a Notre Dame master’s awarded that summer keeps the summer with it', () => {
    const s = earlyStarter({ program: 'phd', ndDegrees: [{ level: 'masters', date: '2026-08-07' }] });
    assert.deepEqual(reclassifyNotreDameCourses(s), { toPrior: 1, toProgram: 0 });
  });
  it('the summer alone is no prior graduate program (the cse-3 variant)', () => {
    const s = earlyStarter();
    reclassifyNotreDameCourses(s);
    assert.equal(hasPriorGraduateStudy(s), false);
    assert.equal(derivePriorMs(s), false);
    assert.equal(s.priorMs, 'none');
  });
  it('an answered earlier-degrees question is never re-derived, whatever is added', () => {
    const s = earlyStarter(
      { bachelorsAwarded: spring(2025), background: { bachelors: 'nd-cse', graduate: 'none' } as Student['background'] },
      [ndCourse('CSE 60321', { term: fall(2025), registeredLevel: 'graduate' })],
    );
    reclassifyNotreDameCourses(s);
    assert.equal(hasPriorGraduateStudy(s), true, 'a graduate course after the bachelor’s and before entry is earlier graduate coursework');
    assert.equal(derivePriorMs(s), false, 'but the student answered “none”');
    assert.equal(s.priorMs, 'none');
  });
});

describe('a saved record gets its early-start rows back', () => {
  const saved = (courses: unknown[], extra: Record<string, unknown> = {}) =>
    JSON.stringify({
      schemaVersion: 1,
      program: 'mscse',
      msOption: 'project',
      entryTerm: fall(2026),
      bachelorsAwarded: spring(2026),
      priorMs: 'unfinished',
      priorMsInferred: true,
      courses,
      milestones: {},
      attestations: {},
      ...extra,
    });
  it('re-filed as program coursework, and the prior master’s inferred from it goes too', () => {
    const s = validateStudent(JSON.parse(saved([{ courseId: 'CSE 60111', credits: 3, term: summer(2026), grade: 'A', origin: 'transfer', institution: ND, degreeLevel: 'masters', registeredLevel: 'graduate' }])));
    const c = s.courses[0]!;
    assert.deepEqual([c.origin, c.institution, c.degreeLevel], ['nd', undefined, undefined]);
    assert.equal(s.priorMs, 'none');
    assert.equal(s.priorMsInferred, undefined);
    const line = audit(s, rules, TODAY).courseLines.find((l) => l.courseId === 'CSE 60111')!;
    assert.equal(line.mark, 'counts');
  });
  it('nothing else moves: a program row from the spring stays (and is warned about); another university’s course is untouched', () => {
    const s = validateStudent(
      JSON.parse(
        saved(
          [
            { courseId: 'CSE 60321', credits: 3, term: spring(2026), grade: 'A', origin: 'nd' },
            { courseId: 'CS 50300', credits: 3, term: summer(2026), grade: 'A', origin: 'transfer', institution: 'Purdue University' },
          ],
          { priorMs: 'none', priorMsInferred: undefined },
        ),
      ),
    );
    assert.deepEqual(
      s.courses.map((c) => [c.courseId, c.origin, c.institution]),
      [
        ['CSE 60321', 'nd', undefined],
        ['CS 50300', 'transfer', 'Purdue University'],
      ],
    );
  });
  it('a prior master’s inferred past an answered earlier-degrees question gives way to the answer', () => {
    const answered = (background: Record<string, unknown>, priorMs: string, priorMsInferred?: true) =>
      validateStudent(JSON.parse(saved([{ courseId: 'CSE 60111', credits: 3, term: summer(2026), grade: 'A', origin: 'nd' }], { background, priorMs, priorMsInferred })));
    const none = answered({ bachelors: 'nd-cse', graduate: 'none' }, 'unfinished', true);
    assert.deepEqual([none.priorMs, none.priorMsInferred], ['none', undefined], 'the hand-add bug’s leftover');
    const mscse = answered({ bachelors: 'nd-cse', graduate: 'nd-mscse' }, 'completed', true);
    assert.equal(mscse.priorMs, 'none', 'the Notre Dame MSCSE is not a prior program');
    const elsewhere = answered({ bachelors: 'elsewhere', graduate: 'elsewhere', finished: true }, 'unfinished', true);
    assert.equal(elsewhere.priorMs, 'completed');
    const own = answered({ bachelors: 'elsewhere', graduate: 'elsewhere', finished: false }, 'unfinished');
    assert.deepEqual([own.priorMs, own.priorMsInferred], ['unfinished', undefined], 'the answer itself is untouched');
  });
  it('a summer tied to the bachelor’s stays earlier coursework', () => {
    const s = validateStudent(JSON.parse(saved([{ courseId: 'CSE 60111', credits: 3, term: summer(2026), grade: 'A', origin: 'transfer', institution: ND, degreeLevel: 'bachelors' }], { bachelorsAwarded: summer(2026), priorMs: 'none', priorMsInferred: undefined })));
    assert.equal(s.courses[0]!.origin, 'transfer');
  });
});

describe('the Notre Dame transcript import', () => {
  it('a summer start reads as that fall, and the summer’s courses are filed as the program’s', () => {
    const parsed = parseTranscript([
      'University of Notre Dame',
      'Unofficial Academic Transcript',
      'INSTITUTION CREDIT',
      'Summer Session 2026',
      'CSE 60111 GR Complexity and Algorithms A 3.000 12.000',
      'Fall Semester 2026',
      'CSE 60641 GR Graduate Operating Systems A 3.000 12.000',
    ]);
    assert.deepEqual(parsed.entryTerm?.term, fall(2026));
    assert.match(parsed.entryTerm!.how, /a summer start, so your official matriculation is that fall/);
    // What the import's Add does with the rows (nd-upload.ts).
    const s = phdStudent({
      program: 'mscse',
      msOption: 'project',
      entryTerm: parsed.entryTerm!.term,
      courses: parsed.courses.map((c) => ({ courseId: c.courseId, title: c.title, credits: c.credits, term: c.term, grade: c.grade, origin: c.origin, registeredLevel: c.level, fromNdTranscript: true })),
    });
    assert.deepEqual(reclassifyNotreDameCourses(s), { toPrior: 0, toProgram: 0 });
    assert.equal(derivePriorMs(s), false);
    const line = audit(s, rules, TODAY).courseLines.find((l) => l.courseId === 'CSE 60111')!;
    assert.equal(line.mark, 'counts');
  });
});
