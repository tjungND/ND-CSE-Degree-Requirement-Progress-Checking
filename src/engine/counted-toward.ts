// "Which degrees has this course already counted toward?" — the question a
// Ph.D. student is asked about Notre Dame coursework taken as an undergraduate
// (Graduate School through the DGS, 2026-09-10 evening; 2026-09-22), and the
// answer the page fills in for them (DGS 2026-10-08: "pre-fill the selections
// in a way that will maximize the requirement satisfactions, i.e., the number
// of credits that will be accepted towards the degree requirements", then warn
// that the choice is the page's, must match what the Dean's office, the
// Graduate School and the Registrar read from the system, and that the DGS is
// the one to ask). Pure: the audit itself is the yardstick, so nothing here
// restates a rule.
//
// Why no search over combinations is needed. The answers are independent in
// their effect: an answer only adds caps to its OWN course ('bs' draws on the
// six credits that may count toward two degrees, provisionally) or refuses it
// ('both': three degrees), and never frees or costs another course anything —
// the one coupling, the two-degree allowance shrinking by the credits answered
// 'both', only ever lowers a count. So the assignment that counts the most
// credits is the one that counts the most for each course on its own, and a
// per-course choice is the exact optimum; neither a brute-force search nor a
// dynamic programme over the allowances is needed (tests/counted-toward.test.ts
// checks the choice against an exhaustive search). The loop below re-reads the
// courses until nothing moves, a guard should a future rule couple them.
import { resolveRuleRow } from '../data/assemble.ts';
import { isNotreDameInstitution } from '../data/external.ts';
import type { Rules } from '../data/types.ts';
import { levelOf, priorNdUndergraduateCanCount } from './allocate.ts';
import { audit } from './audit.ts';
import { termIndex } from './term.ts';
import type { AuditReport, CourseEntry, Student } from './types.ts';

export type CountedToward = NonNullable<CourseEntry['countedToward']>;

/** Which degrees a course has already counted toward is asked of a Ph.D.
 * student about Notre Dame coursework taken as an undergraduate (dated in or
 * before the bachelor's term, or filed as bachelor's coursework) that COULD
 * count toward the degree (priorNdUndergraduateCanCount) — the course table's
 * select, the Next-steps item and the pre-fill read this one test (UI review,
 * 2026-10-08). The MSCSE is never asked (DGS 2026-09-11). */
export function asksWhichDegrees(c: CourseEntry, student: Student, rules: Rules): boolean {
  const awardTerm = student.bachelorsAwarded;
  const asUndergraduate = isNotreDameInstitution(c.institution) && (c.degreeLevel === 'bachelors' || (awardTerm !== undefined && termIndex(c.term) <= termIndex(awardTerm)));
  return asUndergraduate && student.program === 'phd' && priorNdUndergraduateCanCount(c, resolveRuleRow(rules, c.courseId, c.term), student.program);
}

/** The answers a Ph.D. student can give, with the labels the select shows. A
 * student who holds no Notre Dame master's is offered the two that can be
 * true of them (2026-09-22): only the bachelor's can have used the course. */
export function countedTowardOptions(holdsNdMasters: boolean): [CountedToward, string][] {
  return holdsNdMasters
    ? [
        ['neither', 'Neither — it was extra'],
        ['bs', 'My bachelor’s degree'],
        ['mscse', 'My MSCSE'],
        ['both', 'Both my bachelor’s and my MSCSE'],
      ]
    : [
        ['neither', 'Nothing — it was extra'],
        ['bs', 'My bachelor’s degree'],
      ];
}

/** What the record counts under an assignment: the credits of every course
 * line that counts now, and — a long way behind — the credits that would count
 * once approved. A tie between two answers is decided by `plausibleOrder`. */
export function creditsCounted(report: AuditReport, student: Student): number {
  let definite = 0;
  let pending = 0;
  for (const line of report.courseLines) {
    const credits = student.courses.find((c) => c.courseId === line.courseId && termIndex(c.term) === termIndex(line.term))?.credits ?? 0;
    if (line.mark === 'counts') definite += credits;
    else if (line.mark === 'pending') pending += credits;
  }
  return definite + pending / 1000;
}

/** Between answers that count the same, the one most likely true of a 4+1: a
 * 60000-level course counted toward the MSCSE (that is what the 4+1's
 * graduate courses are for); a course below that was the bachelor's own, and
 * "extra" is the nearest answer that still counts it. */
function plausibleOrder(c: CourseEntry, rules: Rules): CountedToward[] {
  return levelOf(c, resolveRuleRow(rules, c.courseId, c.term)) >= 6 ? ['mscse', 'neither', 'bs', 'both'] : ['neither', 'mscse', 'bs', 'both'];
}

export interface CountedTowardChoice {
  /** The course's index in `student.courses`. */
  index: number;
  courseId: string;
  answer: CountedToward;
}

/** The answer, for each asked course the student has not answered themselves
 * (unanswered, or still the page's own choice), that counts the most credits
 * toward the degree — the student's own answers are left alone and taken as
 * given. Empty when nothing is open. */
export function bestCountedToward(student: Student, rules: Rules, today: string): CountedTowardChoice[] {
  const open = student.courses
    .map((c, index) => ({ c, index }))
    .filter(({ c }) => (c.countedToward === undefined || c.countedTowardInferred === true) && asksWhichDegrees(c, student, rules));
  if (open.length === 0) return [];
  // 'both' refuses the course (no course counts toward three degrees): never
  // the answer that counts the most, so it is not tried.
  const allowed = countedTowardOptions(student.ndMasters !== undefined)
    .map(([value]) => value)
    .filter((value) => value !== 'both');
  const working: Student = { ...student, courses: student.courses.map((c) => ({ ...c })) };
  const score = (): number => creditsCounted(audit(working, rules, today), working);
  for (let pass = 0; pass < 3; pass++) {
    let moved = false;
    for (const { c, index } of open) {
      const before = working.courses[index]!.countedToward;
      const order = plausibleOrder(c, rules);
      let best: { answer: CountedToward; score: number } | undefined;
      for (const answer of [...allowed].sort((a, b) => order.indexOf(a) - order.indexOf(b))) {
        working.courses[index]!.countedToward = answer;
        const s = score();
        if (best === undefined || s > best.score + 1e-9) best = { answer, score: s };
      }
      working.courses[index]!.countedToward = best!.answer;
      if (before !== best!.answer) moved = true;
    }
    if (!moved) break;
  }
  return open.map(({ c, index }) => ({ index, courseId: c.courseId, answer: working.courses[index]!.countedToward! }));
}
