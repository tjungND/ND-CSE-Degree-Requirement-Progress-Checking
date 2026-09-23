// The "Load example" student records (moved out of app.ts, 2026-09-20): one
// mid-degree record per program, built from courses the sheet actually
// carries, dated against Notre Dame's own date. Pure data — app.ts loads,
// counts and removes them.
import { termOfDate } from '../engine/term.ts';
import type { Program, Student } from '../engine/types.ts';

/** What "Load example" fills in BESIDE the courses. Kept here so removing the
 * example rows can take these back too — but only where the student has not
 * since changed them, since a value they edited is theirs (R5, 2026-09-18). */
export const EXAMPLE_MILESTONES: Student['milestones'] = { advisorIdentified: '2026-09-10', advisorName: 'Prof. Example' };
export const EXAMPLE_ATTESTATIONS: Student['attestations'] = { advisorApprovedPlan: true };

/** The example for the program the student is actually looking at (DGS
 * 2026-09-18). One example for both was a Ph.D. record: an MSCSE student who
 * pressed "Load example" to see what the tool does was shown a dissertation,
 * two research seminars and a qualifying examination, and the report switched
 * to §4 under them. Each example is a real mid-degree record for its own
 * degree, built from courses the sheet actually carries. */
export function exampleFor(program: Program, todayIso: string): Student {
  // "Last year" and "this year" against Notre Dame's own date, which the
  // loading card settled.
  const thisYear = termOfDate(todayIso).year;
  const lastYear = thisYear - 1;
  const common = {
    schemaVersion: 1 as const,
    isExample: true as const,
    // A student a year into the degree, so the finished courses sit in terms
    // that have finished. Dated from this year rather than hard-coded, so the
    // example does not drift into the past as the years pass — and so a
    // final grade never lands in a semester that has not happened, which the
    // report warns about, in an example meant to show the tool working.
    entryTerm: { season: 'fall' as const, year: lastYear },
    // The example is a complete record: the bachelor's term is required
    // (2026-09-07), so leaving it out made the demo warn about itself.
    bachelorsAwarded: { season: 'spring' as const, year: lastYear },
    priorMs: 'none' as const,
    // The example's Purdue course is a bachelor's elsewhere with no graduate degree (2026-09-22).
    background: { bachelors: 'elsewhere' as const, graduate: 'none' as const },
    milestones: { ...EXAMPLE_MILESTONES },
    attestations: { ...EXAMPLE_ATTESTATIONS },
  };
  // Every seeded row is tagged (R5, 2026-09-18), so the banner can count
  // what is the example's and "Remove the example rows" can take back
  // exactly those, leaving anything the student added.
  if (program === 'mscse') {
    return {
      ...common,
      program: 'mscse',
      // §3.4's two routes: the project, which the tool also infers from
      // CSE 68902 being on the record.
      msOption: 'project',
      gpa: 3.6,
      // The 40000-level pair is deliberate: §3.2 allows six credits and this
      // record uses exactly six, so the cap reads as met rather than unused.
      attestations: { ...EXAMPLE_ATTESTATIONS, dgsApproved4xxxx: true },
      courses: [
        { courseId: 'CSE 60641', title: 'Graduate Operating Systems', credits: 3, term: { season: 'fall', year: lastYear }, grade: 'A', origin: 'nd', fromExample: true },
        { courseId: 'CSE 60535', title: 'Computer Vision', credits: 3, term: { season: 'fall', year: lastYear }, grade: 'A-', origin: 'nd', fromExample: true },
        { courseId: 'CSE 40113', title: 'Design/Analysis of Algorithms', credits: 3, term: { season: 'fall', year: lastYear }, grade: 'B+', origin: 'nd', fromExample: true },
        { courseId: 'CSE 60770', title: 'Secure Software Engineering', credits: 3, term: { season: 'spring', year: thisYear }, grade: 'A', origin: 'nd', fromExample: true },
        { courseId: 'CSE 60424', title: 'Graduate Human Computer Interaction', credits: 3, term: { season: 'spring', year: thisYear }, grade: 'B+', origin: 'nd', fromExample: true },
        { courseId: 'CSE 40166', title: 'Computer Graphics', credits: 3, term: { season: 'spring', year: thisYear }, grade: 'B', origin: 'nd', fromExample: true },
        { courseId: 'CSE 60625', title: 'Advanced Topics in Machine Learning', credits: 3, term: { season: 'fall', year: thisYear }, grade: 'IP', origin: 'nd', fromExample: true },
        { courseId: 'CSE 68902', title: 'Thesis Project', credits: 6, term: { season: 'fall', year: thisYear }, grade: 'IP', origin: 'nd', fromExample: true },
      ],
    };
  }
  return {
    ...common,
    program: 'phd',
    gpa: 3.5,
    courses: [
      { courseId: 'CSE 60641', title: 'Graduate Operating Systems', credits: 3, term: { season: 'fall', year: lastYear }, grade: 'A', origin: 'nd', fromExample: true },
      { courseId: 'CSE 63801', title: 'Research Seminar I', credits: 1, term: { season: 'fall', year: lastYear }, grade: 'S', origin: 'nd', fromExample: true },
      { courseId: 'CSE 60111', title: 'Complexity and Algorithms', credits: 3, term: { season: 'spring', year: thisYear }, grade: 'B-', origin: 'nd', fromExample: true },
      { courseId: 'CSE 60321', title: 'Advanced Computer Architecture', credits: 3, term: { season: 'spring', year: thisYear }, grade: 'B+', origin: 'nd', fromExample: true },
      { courseId: 'CSE 63802', title: 'Research Seminar II', credits: 1, term: { season: 'spring', year: thisYear }, grade: 'S', origin: 'nd', fromExample: true },
      { courseId: 'CSE 60770', title: 'Secure Software Engineering', credits: 3, term: { season: 'fall', year: thisYear }, grade: 'IP', origin: 'nd', fromExample: true },
      { courseId: 'CSE 60876', title: 'Research Methods', credits: 3, term: { season: 'spring', year: thisYear + 1 }, grade: 'IP', origin: 'nd', assignedGroup: 'dsai', fromExample: true },
      { courseId: 'CSE 98900', title: 'Research and Dissertation', credits: 6, term: { season: 'spring', year: thisYear + 1 }, grade: 'IP', origin: 'nd', fromExample: true },
    ],
  };
}
