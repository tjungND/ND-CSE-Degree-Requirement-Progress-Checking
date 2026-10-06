// The EARLY START (policy review round 3, P3-chg-other-1; DGS 2026-10-05:
// "Apply handling (a)"). Academic Code §3.6, Summer Registration Requirements:
//   "Incoming students who are full-time admits, but choose to start in the
//    summer term, are considered fulltime students in the summer with any
//    registration"
// (also DGS Handbook §3.3 and §4.2.6). Admissions are in fall and spring (DGS
// 2026-10-03), so such a student's entry term is that FALL, and every clock,
// the §5.2 window and residency still run from it (DGS 2026-10-03 and
// 2026-10-04 — a summer before the fall is not residence). What (a) settles is
// the summer's COURSEWORK: the Notre Dame courses of the summer just before a
// fall entry are this program's own — not an earlier program's (§5.2) and not
// non-degree work (Academic Code §2.3).
//
// The summer is the program's only when nothing on the record ties it to an
// earlier Notre Dame degree, so the earlier rulings keep their ground:
//   - a row registered at the UNDERGRADUATE level (the transcript's UG/GR
//     column) belongs to the undergraduate career;
//   - a summer in or before the bachelor's award term (an August degree) was
//     taken as an undergraduate (DGS 2026-09-06, §5.2 criterion 2);
//   - a summer in which a Notre Dame degree was awarded finished that degree,
//     and a Notre Dame master's whose award term is not known may have ended
//     there — those rows stay earlier coursework, which the DGS reviews (§5.2).
// Pure: the transcript import's preview, the course list's re-filing and the
// engine's own warning all ask the same question here.
import { compareTerm, normalizeEntryTerm, termIndex, termOfDate } from './term.ts';
import type { CourseEntry, Student, Term } from './types.ts';

type RegisteredLevel = NonNullable<CourseEntry['registeredLevel']>;

/** True for the summer just before a FALL entry term (a spring entry has no
 * summer before it). */
export function isEarlyStartSummer(t: Term, entry: Term): boolean {
  const e = normalizeEntryTerm(entry).term;
  return t.season === 'summer' && e.season === 'fall' && t.year === e.year;
}

/** The record facts the test reads — a Student satisfies it; the import
 * preview passes what the transcript itself says. */
export type EarlyStartFacts = Pick<Student, 'entryTerm' | 'bachelorsAwarded'> & {
  readonly ndDegrees?: readonly { readonly date: string }[];
  readonly ndMasters?: { readonly term?: Term };
};

/** Is this Notre Dame course early-start coursework of THIS program — dated
 * in the summer just before a fall entry, with nothing on the record tying
 * that summer to an earlier Notre Dame degree (see the head of this file)? */
export function isEarlyStartCourse(c: { readonly term: Term; readonly registeredLevel?: RegisteredLevel }, f: EarlyStartFacts): boolean {
  if (!isEarlyStartSummer(c.term, f.entryTerm)) return false;
  if (c.registeredLevel === 'undergraduate') return false;
  if (f.bachelorsAwarded !== undefined && compareTerm(c.term, f.bachelorsAwarded) <= 0) return false;
  if ((f.ndDegrees ?? []).some((d) => termIndex(termOfDate(d.date)) === termIndex(c.term))) return false;
  if (f.ndMasters !== undefined && (f.ndMasters.term === undefined || compareTerm(f.ndMasters.term, c.term) >= 0)) return false;
  return true;
}

/** Dated before the program began: before the entry term, except a course of
 * the early-start summer. */
export function beforeProgramStart(c: { readonly term: Term; readonly registeredLevel?: RegisteredLevel }, f: EarlyStartFacts): boolean {
  return compareTerm(c.term, normalizeEntryTerm(f.entryTerm).term) < 0 && !isEarlyStartCourse(c, f);
}
