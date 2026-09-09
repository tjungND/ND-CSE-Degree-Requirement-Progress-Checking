// Which courses still need a DGS decision — and why. Moved out of the "Ask
// the DGS to review" card (2026-09-06 evening) so the rule is one pure
// function with a test matrix (tests/review-pending.test.ts).
//
// The DGS's rulings for courses from other universities live in the
// ExternalCourses tab. A row there is a DECISION only where its cells say
// something: `transferable` (yes / no) decides the §5.2 part, and
// `satisfies_core_area` (a core area, or `none`) decides the §4.4.1 part.
// `transferable = dgs_approval` (DGS 2026-09-08) is a decision about the
// COURSE — outside the usual CSE ground, transferable when it serves the
// dissertation — but not about this student, so such a course stays in the
// request until the DGS has ruled on their case. A
// row pasted straight from the review request — both cells still blank — is
// not a decision yet, and the course stays in the request. (The card used to
// treat any row as "ruled" and dropped such courses for good — the DGS's
// "the card disappears and never reappears until the courses are re-added".)
//
// §4.4.1: the core-knowledge courses may have been passed "either at Notre
// Dame or at their previous institution" — undergraduate or graduate — once
// the DGS confirms the course. §5.2 criterion 5: "the transfer is recommended
// by the DGS and approved by the Graduate School."
import { isNotreDameInstitution, needsApproval } from '../data/external.ts';
import type { Rules } from '../data/types.ts';
import { classify, type ClassifiedCourse } from './allocate.ts';
import { CORE_TITLE_RE } from './core-title.ts';
import type { Student } from './types.ts';

export interface PendingDgsReview {
  course: ClassifiedCourse;
  /** Program coursework at Notre Dame; Notre Dame coursework from before the
   * entry term (asked about as a Notre Dame course); a course from another
   * university. */
  kind: 'nd' | 'priorNd' | 'external';
  /** "Why it needs a decision" — the card line and the request's last column. */
  reason: string;
  /** Needs a NEW sheet row: no Courses-tab row (a Notre Dame course — CSE or
   * not), or no ExternalCourses row. A course with a row needs a decision in
   * that row, not another row. */
  unlisted: boolean;
}

/** The courses the review request asks the DGS about, in the order the
 * request lists them: Notre Dame program coursework, Notre Dame coursework
 * from before entry, then other universities. */
export function coursesNeedingDgsReview(student: Student, rules: Rules): PendingDgsReview[] {
  const { classified } = classify(student, rules);
  const nd: PendingDgsReview[] = [];
  const priorNd: PendingDgsReview[] = [];
  const external: PendingDgsReview[] = [];
  const coreTitle = (c: ClassifiedCourse) => CORE_TITLE_RE.test(c.entry.title ?? '');

  for (const c of classified) {
    if (c.superseded) continue;

    // Notre Dame program coursework: not in the Courses tab (CSE or not — an
    // unlisted non-CSE course needs a row as much as an unlisted CSE one), or
    // a row that needs an approval the student has not attested
    // (dgs_approval, non-CSE, a blank verdict).
    if (c.entry.origin === 'nd') {
      if (c.unknown === true || c.approvalPending !== undefined) {
        nd.push({
          course: c,
          kind: 'nd',
          reason: c.unknown === true ? 'not in the course rules yet' : (c.approvalPending ?? 'needs DGS review'),
          unlisted: c.rule === undefined,
        });
      }
      continue;
    }
    if (c.entry.origin !== 'transfer') continue;

    const fromNotreDame = isNotreDameInstitution(c.entry.institution);
    const bachelors = c.entry.degreeLevel === 'bachelors';
    // Prior Notre Dame coursework whose Courses-tab row names a core area is
    // decided for §4.4.1 already (2026-09-05) — no ruling to ask for.
    const coreDecidedByCoursesTab = fromNotreDame && c.rule?.coreArea !== undefined;

    if (c.external !== undefined) {
      // Ruled — or merely listed. Pending while transferability is undecided
      // (graduate rows the engine has not already excluded — bachelors never
      // transfers), and while a core-sounding title has no core-area decision.
      const caseByCase = needsApproval(c.transferable);
      // A student who has ticked "the DGS and the Graduate School approved my
      // transfer" is not waiting on a transferability decision — every other
      // surface already treats that attestation as closing the §5.2 question
      // (allocate.ts clears `approvalPending`, and the §5.2 row reads "met"),
      // and the card used to go on asking anyway (2026-09-08).
      const transferAttested = student.attestations.transferApproved === true;
      const transferUndecided = (c.transferable === undefined || caseByCase) && !bachelors && !transferAttested && c.ineligibleReason === undefined;
      const coreUndecided = c.external.satisfiesCoreArea === undefined && !coreDecidedByCoursesTab && coreTitle(c);
      if (!transferUndecided && !coreUndecided) continue;
      // Why the course is decided case by case — its relevance to the
      // student's research — is settled between the advisor and the DGS (DGS
      // 2026-09-08), so the student is told only that the decision is open.
      const transferReason = caseByCase ? 'transfer needs DGS approval (§5.2)' : 'transferability not yet decided';
      const reason =
        transferUndecided && coreUndecided
          ? `${transferReason}, and no core area recorded although the title suggests a §4.4.1 core area`
          : transferUndecided
            ? transferReason
            : 'reviewed by the DGS, but no core area recorded — the title suggests a §4.4.1 core area';
      (fromNotreDame ? priorNd : external).push({ course: c, kind: fromNotreDame ? 'priorNd' : 'external', reason, unlisted: false });
      continue;
    }

    // Unreviewed. Undergraduate courses earn no transfer credit, but the DGS
    // keywords (2026-09-03) flag the ones whose TITLE suggests a §4.4.1 core
    // area — those are worth a ruling. Graduate courses are pending when
    // transfer credit is still possible (no hard §5.2 ineligibility) — and
    // even when it is not (outside the window, below the grade floor, before
    // the bachelor's degree), a core-keyword title still belongs in the
    // request, because §4.4.1 core knowledge has no such restrictions.
    const keyword = !coreDecidedByCoursesTab && coreTitle(c);
    const pending = bachelors ? keyword : c.ineligibleReason === undefined || keyword;
    if (!pending) continue;
    if (fromNotreDame) {
      // Asked about as a NOTRE DAME course — a row for the Courses tab when
      // it is not listed there (its core_area then decides §4.4.1); the §5.2
      // transfer part stays a per-student recommendation.
      priorNd.push({
        course: c,
        kind: 'priorNd',
        reason:
          `taken at Notre Dame before entering the program (${bachelors ? 'undergraduate' : 'graduate'}) — ` +
          (c.rule === undefined ? 'not in the course rules yet; does it cover a §4.4.1 core area?' : 'transfer credit needs a DGS recommendation (§5.2)'),
        unlisted: c.rule === undefined,
      });
    } else {
      external.push({
        course: c,
        kind: 'external',
        reason: bachelors
          ? 'title suggests a §4.4.1 core area — not yet reviewed by the DGS'
          : c.ineligibleReason !== undefined
            ? 'no transfer credit, but the title suggests a §4.4.1 core area — not yet reviewed by the DGS'
            : 'not yet reviewed by the DGS',
        unlisted: true,
      });
    }
  }
  return [...nd, ...priorNd, ...external];
}
