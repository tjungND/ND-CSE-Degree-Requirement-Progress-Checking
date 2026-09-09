// Notre Dame coursework taken BEFORE the entry term (2026-09-05).
//
// A student's Notre Dame unofficial transcript can hold an earlier Notre Dame
// degree — eight undergraduate semesters, a prior M.S., a 4+1 — on the same
// pages as the current program. Those courses are not this program's
// coursework: they do not count toward residence (§4.3), credits (§4.2) or
// specialization (§4.4.2), and their credits, if graduate, are §5.2 transfers
// ("These five requirements also apply to the transfer of credits earned in
// another program at Notre Dame"). §4.4.1 core knowledge is the exception —
// a core course passed "either at Notre Dame or at their previous institution"
// counts, and for a Notre Dame course the Courses tab already says which area.
//
// So a Notre Dame course dated before the entry term is filed as PRIOR
// COURSEWORK: origin 'transfer', institution "University of Notre Dame",
// degreeLevel from the level the student was registered at (the transcript's
// UG/GR column, kept as `registeredLevel`; else the bachelor's award term
// when known (2026-09-06); the course number as a last resort).
// The sort is redone whenever the entry term changes, so correcting the
// dropdown re-files the courses without a re-import. Pure functions — no DOM.
import { NOTRE_DAME, isNotreDameInstitution } from '../data/external.ts';
import { termIndex } from '../engine/term.ts';
import type { CourseEntry, Student, Term } from '../engine/types.ts';
import { levelFromNumber } from '../transcript/parse.ts';

/** Bachelor's or Master's prior coursework. The level the student was
 * registered at (the transcript's UG/GR column) decides; without it, the term
 * against the bachelor's award term when that is known (DGS 2026-09-06: dated
 * in or before it → taken as an undergraduate); only then the course number
 * (1xxxx–4xxxx undergraduate, else graduate). The number is a last resort for
 * hand-typed rows and never decides credit — the engine's §5.2 rule on
 * `bachelorsAwarded` does (allocate.ts), and every transfer credit stays
 * "pending DGS review" until approved. */
export function priorNdDegreeLevel(
  c: Pick<CourseEntry, 'courseId' | 'registeredLevel' | 'term'>,
  bachelorsAwarded?: Term,
): 'bachelors' | 'masters' {
  if (c.registeredLevel !== undefined) return c.registeredLevel === 'undergraduate' ? 'bachelors' : 'masters';
  if (bachelorsAwarded !== undefined) return termIndex(c.term) <= termIndex(bachelorsAwarded) ? 'bachelors' : 'masters';
  return levelFromNumber(c.courseId) === 'undergraduate' ? 'bachelors' : 'masters';
}

/** Prior GRADUATE coursework — the rows that mean "this student was in a
 * graduate program before this one". A 4+1's senior-year course is not one of
 * them: it is registered at the graduate level but was taken in or before the
 * term the bachelor's degree was awarded, so it belongs to the undergraduate
 * career (DGS 2026-09-06 on §5.2 criterion 2). Without this test a single
 * GR-labelled senior course made the app announce a master's the student never
 * started (2026-09-09). */
export function hasPriorGraduateStudy(student: Student): boolean {
  return student.courses.some((c) => {
    if (c.origin !== 'transfer' || c.degreeLevel === 'bachelors' || c.degreeLevel === undefined) return false;
    if (!isNotreDameCourse(c)) return true; // another university's graduate transcript
    if (!isPriorNd(c, student.entryTerm)) return false;
    const awarded = student.bachelorsAwarded;
    return awarded === undefined || termIndex(c.term) > termIndex(awarded);
  });
}

/** Keep "Prior graduate study" in step with the coursework (2026-09-09).
 * The value is inferred on a transcript import; it also has to follow a later
 * correction to the entry term or the bachelor's award term, which can turn
 * program coursework into prior coursework and back. A value the student chose
 * themselves is never touched — only the untouched default and a value this
 * function or an import inferred. Returns true when it changed something. */
export function derivePriorMs(student: Student): boolean {
  if (student.priorMs !== 'none' && student.priorMsInferred !== true) return false; // their own answer
  const before = student.priorMs;
  if (hasPriorGraduateStudy(student)) {
    // Notre Dame's own master's degree is a fact the transcript records; any
    // other prior graduate coursework leaves "completed" to the student, with
    // the standing card's warning asking for it.
    if (student.priorMs === 'none') {
      student.priorMs = student.ndMasters !== undefined ? 'completed' : 'unfinished';
      student.priorMsInferred = true;
    }
  } else if (student.priorMsInferred === true) {
    student.priorMs = 'none';
    student.priorMsInferred = undefined;
  }
  return student.priorMs !== before;
}

/** True for a Notre Dame course — program coursework or prior coursework. */
export function isNotreDameCourse(c: CourseEntry): boolean {
  return c.origin === 'nd' || (c.origin === 'transfer' && isNotreDameInstitution(c.institution));
}

/** Prior Notre Dame coursework: a Notre Dame course dated before `entry`. */
export function isPriorNd(c: CourseEntry, entry: Term): boolean {
  return isNotreDameCourse(c) && termIndex(c.term) < termIndex(entry);
}

/** Re-file every Notre Dame course by the student's entry term: before it →
 * prior coursework, from it on → program coursework. Courses from other
 * institutions (the transcript's own transfer-credit block, external
 * transcripts) are untouched. Prior rows are also re-levelled against the
 * bachelor's award term on every call, so importing the transcript and
 * setting that term give the same result in either order (DGS 2026-09-07).
 * Returns how many entries moved each way. */
export function reclassifyNotreDameCourses(student: Student): { toPrior: number; toProgram: number } {
  let toPrior = 0;
  let toProgram = 0;
  for (const c of student.courses) {
    if (!isNotreDameCourse(c)) continue;
    if (isPriorNd(c, student.entryTerm)) {
      // A row already filed as prior stays prior, but is RE-LEVELLED (DGS
      // 2026-09-07). The bachelor's award term is normally set after the
      // transcript import — the field sits under Your standing, below the
      // transcripts card — and before this fix a row filed first kept the
      // level guessed from its course number, so the order of the two
      // actions changed what the student saw. priorNdDegreeLevel still
      // prefers the transcript's own UG/GR label, so a labelled row never
      // moves; clearing the term falls back to the course number.
      if (c.origin === 'transfer') {
        c.degreeLevel = priorNdDegreeLevel(c, student.bachelorsAwarded);
        continue;
      }
      c.origin = 'transfer';
      c.institution = NOTRE_DAME;
      c.degreeLevel = priorNdDegreeLevel(c, student.bachelorsAwarded);
      toPrior += 1;
    } else if (c.origin === 'transfer') {
      c.origin = 'nd';
      delete c.institution;
      delete c.degreeLevel;
      toProgram += 1;
    }
  }
  return { toPrior, toProgram };
}
