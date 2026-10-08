// The Graduate School's probation and dismissal grounds, and two transcript
// rows the import used to get wrong (policy review 2026-10-04; DGS: "Apply the
// suggested handling"): P2-ac-5b-6.1-4 (Academic Code §5.7.3, a cumulative GPA
// below 3.0 in two semesters), -7 (§5.8, a semester GPA below 2.5, or below
// 3.0 in two consecutive semesters), -6 (§5.7.3 / §5.8, U in research in two /
// three consecutive semesters), P2-ac-4-11 (NR is a pending grade) and
// P2-ac-1-3-15 (the zero-credit Independent Summer Research registration).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { audit } from '../src/engine/audit.ts';
import type { Student, TermGpa } from '../src/engine/types.ts';
import { parseTranscript } from '../src/transcript/parse.ts';
import { labelCitations } from '../src/ui/citations.ts';
import { validateStudent } from '../src/ui/state.ts';
import { buildRules } from './helpers.ts';
import { ndCourse, phdStudent } from './helpers/student.ts';

const rules = buildRules();
const fall = (year: number) => ({ season: 'fall' as const, year });
const spring = (year: number) => ({ season: 'spring' as const, year });
const summer = (year: number) => ({ season: 'summer' as const, year });
const warningsOf = (s: Student, today = '2026-10-04') => audit(s, rules, today).warnings;
const withGpas = (termGpas: TermGpa[], over: Partial<Student> = {}) => phdStudent({ entryTerm: fall(2025), termGpas, ...over });

describe('the transcript keeps each graduate term’s GPA figures', () => {
  const lines = (nr = false) => [
    'Academic Transcript', 'Transcript Level   Transcript Type', 'Graduate   Web Transcript   Level', 'Institution Credit',
    'Term : Fall Semester 2025',
    'Subject Course Campus Level Title   Grade Credit Hours Quality Points R',
    'CSE   60641   Main   GR   Graduate Operating Systems   C+   3.000   6.999',
    `CSE   60111   Main   GR   Complexity and Algorithms   ${nr ? 'NR' : 'B'}   3.000   ${nr ? '0.000' : '9.000'}`,
    'Term Totals (Graduate)   Attempt Hours Passed Hours Earned Hours GPA Hours Quality Points GPA',
    'Current Term   6.000   3.000   3.000   3.000   6.999   2.333',
    'Cumulative   6.000   3.000   3.000   3.000   6.999   2.333',
    'Term : Spring Semester 2026',
    'CSE   60321   Main   GR   Advanced Computer Architecture   A   3.000   12.000',
    'Term Totals (Graduate)   Attempt Hours Passed Hours Earned Hours GPA Hours Quality Points GPA',
    'Current Term   3.000   3.000   3.000   3.000   12.000   4.000',
    'Cumulative   9.000   6.000   6.000   6.000   18.999   3.167',
    'https://bxestuprod.oit.nd.edu/StudentSelfService/ssb/academicTranscript',
  ];
  it('“Current Term” and “Cumulative” under Term Totals (Graduate), per term', () => {
    assert.deepEqual(parseTranscript(lines()).termGpas, [
      { term: fall(2025), termGpa: 2.333, cumulativeGpa: 2.333 },
      { term: spring(2026), termGpa: 4, cumulativeGpa: 3.167 },
    ]);
  });
  it('an undergraduate term’s figures are not kept', () => {
    const ug = lines().map((l) => l.replace('Term Totals (Graduate)', 'Term Totals (Undergraduate)'));
    assert.equal(parseTranscript(ug).termGpas, undefined);
  });
  it('NR is a pending grade: kept as in progress, and the preview says why (P2-ac-4-11)', () => {
    const p = parseTranscript(lines(true));
    const nr = p.courses.find((c) => c.courseId === 'CSE 60111')!;
    assert.equal(nr.grade, 'IP');
    assert.equal(nr.credits, 3);
    assert.ok(p.warnings.includes('Grade not reported yet (NR): CSE 60111 (Fall 2025) — added as in progress, so the registration and its credits count until the grade arrives; ask the instructor or the Registrar.'), JSON.stringify(p.warnings));
  });
  // P3-ac-5b-6.1-1 (policy review round 3; DGS 2026-10-05): a semester graded
  // only S (research) or W has no GPA hours, and Banner prints 0.000 — or
  // leaves the GPA cell blank, so the last figure is the quality points.
  const researchOnly = (gpaCell: string) => [
    ...lines().slice(0, -1),
    'Term : Fall Semester 2026',
    'CSE   98900   Main   GR   Research and Dissertation   S   9.000   0.000',
    'Term Totals (Graduate)   Attempt Hours Passed Hours Earned Hours GPA Hours Quality Points GPA',
    `Current Term   9.000   9.000   9.000   0.000   0.000${gpaCell}`,
    'Cumulative   18.000   15.000   15.000   6.000   18.999   3.167',
    'Term : Spring Semester 2027',
    'CSE   98900   Main   GR   Research and Dissertation   W   9.000   0.000',
    'Term Totals (Graduate)   Attempt Hours Passed Hours Earned Hours GPA Hours Quality Points GPA',
    `Current Term   9.000   0.000   0.000   0.000   0.000${gpaCell}`,
    'Cumulative   27.000   15.000   15.000   6.000   18.999   3.167',
    'https://bxestuprod.oit.nd.edu/StudentSelfService/ssb/academicTranscript',
  ];
  for (const [label, cell] of [['a 0.000 GPA', '   0.000'], ['a blank GPA cell', '']] as const) {
    it(`a research-only or withdrawn-only term (${label}) has no semester GPA; its cumulative figure stays (P3-ac-5b-6.1-1)`, () => {
      assert.deepEqual(parseTranscript(researchOnly(cell)).termGpas, [
        { term: fall(2025), termGpa: 2.333, cumulativeGpa: 2.333 },
        { term: spring(2026), termGpa: 4, cumulativeGpa: 3.167 },
        { term: fall(2026), cumulativeGpa: 3.167 },
        { term: spring(2027), cumulativeGpa: 3.167 },
      ]);
    });
  }
  it('a record’s labelled totals with no GPA hours give no GPA (P3-ac-5b-6.1-1)', () => {
    const p = parseTranscript([
      'University of Notre Dame', 'Course Level: Graduate', 'UNIVERSITY OF NOTRE DAME CREDIT:', 'Fall Semester 2026',
      'CSE   98900   Research and Dissertation   9.000 S   0.000',
      'OVERALL   Ehrs:   9.000 QPts:   0.000', 'GPA-Hrs:   0.000   GPA:   0.000',
    ]);
    assert.equal(p.cumulativeGpa, undefined);
  });
  it('a saved record’s 0.00 for a semester with no course graded into the GPA raises no dismissal ground (P3-ac-5b-6.1-1)', () => {
    const research = (term: { season: 'fall' | 'spring'; year: number }) => ndCourse('CSE 98900', { term, credits: 9, grade: 'S' });
    const s = withGpas(
      [{ term: fall(2025), termGpa: 3.8, cumulativeGpa: 3.8 }, { term: spring(2026), termGpa: 0, cumulativeGpa: 3.8 }, { term: fall(2026), termGpa: 0, cumulativeGpa: 3.8 }],
      { courses: [ndCourse('CSE 60641', { term: fall(2025) }), research(spring(2026)), research(fall(2026))] },
    );
    assert.equal(warningsOf(s, '2027-01-15').some((w) => /semester GPA below/.test(w)), false);
    // A real 0.00 — every course failed — is still a dismissal ground.
    const failed = withGpas([{ term: fall(2025), termGpa: 0, cumulativeGpa: 0 }], { courses: [ndCourse('CSE 60641', { term: fall(2025), grade: 'F' })] });
    assert.ok(warningsOf(failed, '2026-01-15').some((w) => /semester GPA below 2\.5 \(Fall 2025: 0\.00\)/.test(w)));
  });
  it('a saved file keeps only well-formed figures', () => {
    const s = validateStudent({ ...phdStudent(), termGpas: [{ term: fall(2025), termGpa: 2.5, cumulativeGpa: 9 }, { term: { season: 'winter', year: 2025 }, termGpa: 3 }, { term: spring(2026) }] }, []);
    assert.deepEqual(s.termGpas, [{ term: fall(2025), termGpa: 2.5 }]);
  });
});

describe('Academic Code §5.7.3 and §5.8, from the transcript’s figures', () => {
  it('a cumulative GPA below 3.0 in two semesters: the probation trigger', () => {
    const w = warningsOf(withGpas([{ term: fall(2025), cumulativeGpa: 2.8 }, { term: spring(2026), cumulativeGpa: 2.9 }]));
    assert.ok(w.includes('Your transcript shows a cumulative GPA below 3.0 in 2 semesters (Fall 2025: 2.80, Spring 2026: 2.90) — a Graduate School probation trigger (Academic Code §5.7.3); confirm your standing with the DGS.'), JSON.stringify(w));
  });
  it('one semester below 3.0 cumulative, or a summer, is not two semesters', () => {
    assert.equal(warningsOf(withGpas([{ term: fall(2025), cumulativeGpa: 2.8 }, { term: spring(2026), cumulativeGpa: 3.1 }])).some((x) => /probation trigger/.test(x)), false);
    assert.equal(warningsOf(withGpas([{ term: spring(2026), cumulativeGpa: 2.8 }, { term: summer(2026), cumulativeGpa: 2.9 }])).some((x) => /probation trigger/.test(x)), false);
  });
  it('a semester GPA below 2.5: a dismissal ground', () => {
    const w = warningsOf(withGpas([{ term: fall(2025), termGpa: 3.4 }, { term: spring(2026), termGpa: 2.33 }]));
    assert.ok(w.includes('Your transcript shows a semester GPA below 2.5 (Spring 2026: 2.33) — the Academic Code lists this as a ground for dismissal (Academic Code §5.8, extreme under-performance); talk to the DGS.'), JSON.stringify(w));
  });
  it('a semester GPA below 3.0 in two consecutive semesters: a dismissal ground; not when they are apart', () => {
    const w = warningsOf(withGpas([{ term: fall(2025), termGpa: 2.8 }, { term: spring(2026), termGpa: 2.9 }]));
    assert.ok(w.includes('Your transcript shows a semester GPA below 3.0 in 2 consecutive semesters (Fall 2025: 2.80, Spring 2026: 2.90) — the Academic Code lists this as a ground for dismissal (Academic Code §5.8, extreme under-performance); talk to the DGS.'), JSON.stringify(w));
    assert.equal(warningsOf(withGpas([{ term: fall(2025), termGpa: 2.8 }, { term: spring(2026), termGpa: 3.5 }, { term: fall(2026), termGpa: 2.9 }])).some((x) => /consecutive semesters/.test(x)), false);
  });
  it('a hand-entered record, with no transcript figures, gets no GPA line', () => {
    assert.equal(warningsOf(phdStudent({ gpa: 2.5 })).some((x) => /probation trigger|ground for dismissal/.test(x)), false);
  });
  it('U in research in two consecutive semesters: the probation trigger; three: a dismissal ground', () => {
    const research = (term: { season: 'fall' | 'spring'; year: number }) => ndCourse('CSE 98900', { term, credits: 9, grade: 'U' });
    const two = warningsOf(phdStudent({ entryTerm: fall(2024), courses: [research(fall(2025)), research(spring(2026))] }));
    assert.ok(two.includes('A U in research in two consecutive semesters (Fall 2025, Spring 2026) — a Graduate School probation trigger (Academic Code §5.7.3); a third in a row is a ground for dismissal (Academic Code §5.8). Talk to the DGS.'), JSON.stringify(two));
    const three = warningsOf(phdStudent({ entryTerm: fall(2024), courses: [research(spring(2025)), research(fall(2025)), research(spring(2026))] }));
    assert.ok(three.includes('A U in research in 3 consecutive semesters (Spring 2025, Fall 2025, Spring 2026) — the Academic Code lists three consecutive U grades in research as a ground for dismissal (Academic Code §5.8, extreme under-performance); talk to the DGS.'), JSON.stringify(three));
    const apart = warningsOf(phdStudent({ entryTerm: fall(2024), courses: [research(fall(2024)), research(fall(2025))] }));
    assert.equal(apart.some((x) => /U in research/.test(x)), false);
  });
});

describe('the zero-credit Independent Summer Research registration (P2-ac-1-3-15)', () => {
  // The fixture's research row, turned into the live sheet's CSE 67890 row
  // (credit_min / credit_max / credits_default 0, research, counts no / no).
  const withSummerResearch = buildRules({
    courses: [{ course_id: 'CSE 98900', set: { course_id: 'CSE 67890', title: 'Independent Summer Research', credit_min: '0', credit_max: '0', credits_default: '0', counts_toward_mscse: 'no', counts_toward_phd: 'no' } }],
  });
  it('is right as entered: no “correct the row”, and the line says it is expected', () => {
    const s = phdStudent({ courses: [ndCourse('CSE 67890', { term: summer(2027), credits: 0, grade: 'S' })] });
    const r = audit(s, withSummerResearch, '2027-09-01');
    assert.equal(r.warnings.some((w) => /CSE 67890 is entered with 0 credits/.test(w)), false, JSON.stringify(r.warnings));
    const line = r.courseLines.find((l) => l.courseId === 'CSE 67890')!;
    assert.match(line.text, /zero-credit summer registration \(Academic Code §3\.6\) — counts toward nothing, as expected/);
  });
  it('a course the rules give credits, entered at 0, is still questioned', () => {
    const s = phdStudent({ courses: [ndCourse('CSE 60641', { credits: 0 })] });
    assert.ok(audit(s, rules, '2027-01-15').warnings.includes('CSE 60641 is entered with 0 credits, so it counts toward nothing. Check the credit hours on your transcript and correct the row.'));
  });
});

describe('the page names each section’s document (src/ui/citations.ts)', () => {
  it('§5.8 is the Academic Code’s on every dismissal line, never “CSE §5.8”', () => {
    const lines = [
      ...warningsOf(withGpas([{ term: fall(2025), termGpa: 2.4 }, { term: spring(2026), termGpa: 2.9 }])),
      ...warningsOf(phdStudent({ entryTerm: fall(2024), courses: [spring(2025), fall(2025), spring(2026)].map((term) => ndCourse('CSE 98900', { term, credits: 9, grade: 'U' })) })),
    ].filter((w) => /§5\.8/.test(w));
    assert.equal(lines.length, 3);
    for (const w of lines) assert.doesNotMatch(labelCitations(w), /CSE §5\.8/, w);
  });
});

// Policy review round 3, P3-cse-5-6-4 (the citation part): the two-semester
// maximum is CSE §5.7's, which holds for every student; the Academic Code's
// §5.1 says three for the Spring 2020 cohort (Appendix A.2).
describe('more than two semesters of medical leave', () => {
  it('the warning cites CSE §5.7 for the two-semester maximum', () => {
    const w = warningsOf(phdStudent({ entryTerm: fall(2022), leaveSemesters: 3 })).find((x) => /semesters on medical leave/.test(x));
    assert.ok(w, 'the leave warning is shown');
    assert.match(labelCitations(w), /a leave of absence lasts at most two consecutive semesters \(CSE §5\.7\) — a student who did not return at its end needed readmission/);
    assert.doesNotMatch(w, /Academic Code §5\.1/);
    assert.doesNotMatch(w, /Appendix A\.2/, 'the cohort note is for the Spring 2020 cohort only');
  });
  // P3-ac-5a-4 (DGS 2026-10-07: option (a), "Keep two for everyone, and add a note for the cohort").
  it('a student enrolled in Spring 2020: still warned at three, with the Graduate School’s three named', () => {
    const w = warningsOf(phdStudent({ entryTerm: fall(2019), leaveSemesters: 3 })).find((x) => /semesters on medical leave/.test(x));
    assert.ok(w, 'the leave warning is shown');
    assert.match(w, /needed readmission, and the program may reject some or all earlier credits \(DGS Handbook §3\.3\)\. For students enrolled in Spring 2020, the Graduate School allowed three consecutive semesters \(Academic Code Appendix A\.2\)\. Confirm your standing with the DGS\.$/);
    assert.equal(warningsOf(phdStudent({ entryTerm: fall(2019), leaveSemesters: 2 })).some((x) => /semesters on medical leave/.test(x)), false);
  });
});

// CSE §5.1's Incomplete pattern, fall and spring only (policy review round 3,
// P3-cse-5-6-2; DGS 2026-10-07: option A — a summer session is not one of the
// "semesters", as the GPA and U-in-research warnings already read it).
describe('§5.1: Incompletes in a semester, or in consecutive semesters', () => {
  const inc = (courseId: string, term: Student['entryTerm']) => ndCourse(courseId, { term, grade: 'I' });
  const i51 = (s: Student) => warningsOf(s).find((w) => /Incomplete/.test(w) && /§5\.1/.test(w));
  it('a Spring and a Summer Incomplete: no warning — the summer is not a semester', () => {
    assert.equal(i51(phdStudent({ entryTerm: fall(2025), courses: [inc('CSE 60641', spring(2026)), inc('CSE 60111', summer(2026))] })), undefined);
  });
  it('a Summer and a Fall Incomplete: no warning either', () => {
    assert.equal(i51(phdStudent({ entryTerm: fall(2025), courses: [inc('CSE 60641', summer(2026)), inc('CSE 60111', fall(2026))] })), undefined);
  });
  it('a Fall and the next Spring: two consecutive semesters', () => {
    assert.match(i51(phdStudent({ entryTerm: fall(2025), courses: [inc('CSE 60641', fall(2025)), inc('CSE 60111', spring(2026))] })) ?? '', /^Incompletes in two consecutive semesters/);
  });
  it('two in one Fall: more than one in one semester', () => {
    assert.match(i51(phdStudent({ entryTerm: fall(2025), courses: [inc('CSE 60641', fall(2025)), inc('CSE 60111', fall(2025))] })) ?? '', /^More than one Incomplete in one semester/);
  });
});

// The Spring 2020 cohort's Incomplete (policy review round 3, P3-cse-5-6-4;
// DGS 2026-10-07: option (b)): 30 + 14 days, as for everyone, and the line
// names Appendix A.1's 60 days for the DGS to confirm.
describe('a Spring 2020 cohort student’s Incomplete (Academic Code Appendix A.1)', () => {
  const lineOf = (s: Student, id: string, today: string) => audit(s, rules, today).courseLines.find((l) => l.courseId === id)!.text;
  const withI = (entry: Student['entryTerm'], term: Student['entryTerm']) => phdStudent({ entryTerm: entry, courses: [ndCourse('CSE 60641', { term, grade: 'I' })] });
  it('open: the rule, then the appendix for the DGS to confirm', () => {
    assert.match(lineOf(withI(fall(2019), fall(2026)), 'CSE 60641', '2026-10-05'), /the instructor then has 14 days to report the grade \(Academic Code §4\.4; CSE §5\.1\)\. For students enrolled in Spring 2020, Academic Code Appendix A\.1 may give 60 days — confirm with the DGS/);
    assert.doesNotMatch(lineOf(withI(fall(2021), fall(2026)), 'CSE 60641', '2026-10-05'), /Appendix A\.1/, 'not the cohort');
  });
  it('lapsed: still "the DGS confirms", with the appendix named', () => {
    assert.match(lineOf(withI(fall(2019), spring(2025)), 'CSE 60641', '2026-10-05'), /it became an F unless the Graduate School extended it \(Academic Code §4\.4\); for students enrolled in Spring 2020, Academic Code Appendix A\.1 may give 60 days instead of 30; the DGS confirms/);
  });
});
