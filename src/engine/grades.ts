// Grade scale and floors. DGS decision 2026-08-31: only passed courses earn
// credit at all (pass = any non-failing final grade: A…D or S; F/U/IP earn
// nothing yet). DGS decision 2026-09-12, reading the Grad School Academic
// Code §4.3 ("Grades of C- and D ... will not be accepted for completion of
// graduate degree requirements, specific required coursework, and/or total
// credit hours"): a passed grade below C still satisfies §4.4.1's "passed"
// wording (core knowledge), but no longer counts toward any credit-hour
// requirement — see passesCreditFloor() below.
// S satisfies the §4.4.2 "B or higher" floor (S/U courses have no letter grade).
import type { Grade } from './types.ts';

export const GRADE_POINTS: Partial<Record<Grade, number>> = {
  A: 4,
  'A-': 3.667,
  'B+': 3.333,
  B: 3,
  'B-': 2.667,
  'C+': 2.333,
  C: 2,
  'C-': 1.667,
  D: 1,
  F: 0,
  // Academic Code §4.3: "I 0.000 (until Incomplete is removed)" — an
  // outstanding Incomplete counts as zero quality points in the GPA.
  I: 0,
};

/** The grades the form offers and the engine accepts. I (Incomplete) and W
 * (withdrawn) joined on 2026-10-03: both are registrations (Academic Code
 * §3.3's full-time count sees them), neither earns credit. */
export const GRADES: Grade[] = ['A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D', 'F', 'S', 'U', 'IP', 'I', 'W'];

/** Registered, no final grade yet: IP, and an Incomplete — until it lapses
 * (Academic Code §4.4: 30 days to finish + 14 to report, then an F), which the
 * classifier decides against today's date, since it needs the term. */
export function isInProgress(grade: Grade): boolean {
  return grade === 'IP' || grade === 'I';
}

/** Withdrawn (Academic Code §4.2): a registration that earns nothing. */
export function isWithdrawn(grade: Grade): boolean {
  return grade === 'W';
}

/** Passed = a final, non-failing grade. */
export function isPassed(grade: Grade): boolean {
  if (grade === 'S') return true;
  if (grade === 'U' || grade === 'F' || grade === 'IP' || grade === 'I' || grade === 'W') return false;
  return (GRADE_POINTS[grade] ?? 0) > 0;
}

/** Does `grade` meet a letter floor like "B" (§4.4.2)? S counts as meeting it
 * (DGS 2026-08-31, for §4.4.2 — the §5.2 transfer floor is handled apart in
 * the classifier since 2026-10-03: an S cannot show a B there). */
export function meetsGradeFloor(grade: Grade, floor: Grade): boolean {
  if (grade === 'S') return true;
  if (grade === 'U' || grade === 'F' || grade === 'IP' || grade === 'I' || grade === 'W') return false;
  const got = GRADE_POINTS[grade];
  const need = GRADE_POINTS[floor];
  if (got === undefined || need === undefined) return false;
  return got >= need;
}

/** Does `grade` clear the credit-hour floor (DGS decision 2026-09-12, Academic
 * Code §4.3) — stricter than merely passing: C- and D no longer count toward
 * any credit-hour requirement. An in-progress grade is not yet final, so it is
 * never excluded by this floor — whether it will count is decided once it is
 * graded. */
export function passesCreditFloor(grade: Grade): boolean {
  return isInProgress(grade) || meetsGradeFloor(grade, 'C');
}
