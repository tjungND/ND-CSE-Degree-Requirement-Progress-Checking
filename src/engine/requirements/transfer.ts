// §5.2 transfer credit — the same row for both degrees (2026-09-11).
//
// The Ph.D. has reported its transfer cap since the app was built; the MSCSE
// enforced the cap but never showed it, so a master's student with a completed
// prior degree could only discover their nine credits by going over them (DGS
// 2026-09-11: "add a row to show how many credits may be transferred if a
// MSCSE student submits a prior transcript"). The caps themselves live in the
// Parameters tab, one key per degree and prior-degree state.
import { needsApproval } from '../../data/external.ts';
import { formatCredits } from '../credits.ts';
import { compareTerm } from '../term.ts';
import type { RequirementResult, Status } from '../types.ts';
import type { Ctx } from './context.ts';
import { joinedDetail, missingParamDetail, countedCourseIds } from './context.ts';

/** §4.2 + §5.2 transfer credit: window, B floor, and the 6/24 caps are enforced
 * by the classifier/allocator; this row reports the result. Every transfer is
 * needs-DGS-review until attested (§5.2 requires DGS + Graduate School approval) —
 * except when every pending course is already ruled transferable: then the row
 * is "in progress" until the Grad Admin has processed it (DGS 2026-09-07). */
export function transferRow(ctx: Ctx, opts: { id: string; group: string; capKeyCompleted: string; section: string }): RequirementResult {
  const quote =
    'Courses from a M.S. degree earned at Notre Dame or another institution within the last five years prior to admission may be used to satisfy the course requirement.';
  // Undergraduate courses are invisible here (DGS request 2026-09-04): they
  // can never transfer (§5.2), so this card neither lists nor counts them —
  // their core-knowledge role shows on the coursework list and the core rows.
  // …and neither is Notre Dame coursework taken as an undergraduate, which
  // counts toward the degree without being transfer credit (2026-09-10): it
  // has no 'transfer' cap, and listing it here would ask the DGS to decide a
  // transfer nobody is requesting.
  const transfers = ctx.classified.filter(
    (c) =>
      c.entry.origin === 'transfer' &&
      c.entry.degreeLevel !== 'bachelors' &&
      (c.caps.includes('transfer') || c.pool === 'none'),
  );
  const capKey =
    ctx.student.priorMs === 'completed'
      ? opts.capKeyCompleted
      : 'transfer_unfinished_ms_credits_max';
  const cap = ctx.params.number(capKey);
  let status: Status;
  const parts: string[] = [];
  if (transfers.length === 0) {
    status = 'not_applicable';
    parts.push('No transfer courses entered');
  } else if (cap === undefined) {
    status = 'cannot_evaluate';
    parts.push(missingParamDetail(capKey));
  } else {
    // "Counted" means counted: provisional credit is said separately, so a
    // row whose every course is still pending no longer reads "24 of 24
    // transfer credits counted" (2026-09-11).
    const counted = ctx.alloc.transfer.definite + ctx.alloc.transfer.in_progress;
    const provisional = ctx.alloc.transfer.provisional;
    // Split the pending courses by what the DGS's ExternalCourses tab says,
    // so the student knows exactly what to do next (2026-09-01). Ruled
    // transferable already → nothing is left for the DGS to decide: the
    // credit waits for the Grad Admin's processing, so the row is "in
    // progress", not "needs DGS review" (DGS 2026-09-07).
    const pending = transfers.filter((c) => !c.superseded && c.approvalPending);
    const preApproved = pending.filter((c) => c.transferable === 'yes');
    // Ruled `dgs_approval` / `adgs_approval`: the sheet says this one needs an
    // approval, so it is neither pre-approved nor unreviewed (2026-09-08,
    // split by program 2026-09-09).
    const caseByCase = pending.filter((c) => needsApproval(c.transferable));
    const unreviewed = pending.filter((c) => !c.external);
    const listedUndecided = pending.filter((c) => c.external && c.transferable === undefined);
    // "Needs DGS review" only while the DGS actually has a course to decide
    // (2026-09-09 — the sibling shared.approvals row already worked this way).
    // With every entered course excluded on its own terms — taken before the
    // bachelor's degree, below the B floor, outside the five-year window, or
    // ruled non-transferable — there is nothing to ask for, and an amber row
    // the student can never clear is worse than no row.
    // The attestation makes the row "met" only when it has settled every
    // course: a never-reviewed course stays pending whatever is ticked
    // (2026-09-11), and the row must say so rather than read met beside it.
    status = pending.length === 0
      ? ctx.student.attestations.transferApproved
        ? 'met'
        : 'not_applicable'
        : preApproved.length === pending.length
          ? 'in_progress'
          : 'needs_dgs_review';
    // The cap's name says whose cap it is. A student with no prior graduate
    // program at all is under the smaller cap too, but is not "a prior program
    // that was not completed" (2026-09-11).
    const capFor =
      ctx.student.priorMs === 'completed'
        ? 'a completed prior degree'
        : ctx.student.priorMs === 'unfinished'
          ? 'a prior program that was not completed'
          : 'a student with no prior graduate degree';
    parts.push(`${formatCredits(counted)} of ${cap} transfer credits counted (§5.2 cap for ${capFor})${provisional > 0 ? `; ${formatCredits(provisional)} more pending review` : ''}`);
    // Only courses under §5.2's own cap belong on this row: Notre Dame
    // coursework taken as an undergraduate is filed as 'transfer' but is not
    // transfer credit (2026-09-10), and its lines used to be repeated here.
    const awarded = ctx.student.bachelorsAwarded;
    const excluded = ctx.alloc.perCourse.filter((p) => {
      const e = p.course.entry;
      if (e.origin !== 'transfer' || e.degreeLevel === 'bachelors' || p.excluded <= 0) return false;
      // Notre Dame coursework taken in or before the bachelor's award term went
      // down the undergraduate path, not §5.2's.
      if (awarded !== undefined && /notre\s*dame/i.test(e.institution ?? '') && compareTerm(e.term, awarded) <= 0) return false;
      // An unreviewed candidate the allocator happened to leave outside the
      // cap is not "over the cap" — the DGS decides which candidates transfer
      // (2026-09-06); the line already says "candidate", and so does this row.
      if (p.course.tier === 'provisional' && p.course.transferable !== 'yes' && p.course.caps.includes('transfer') && p.course.ineligibleReason === undefined) return false;
      return true;
    });
    for (const p of excluded) parts.push(`${p.course.entry.courseId}: ${p.excludedReason ?? 'not counted'}`);
    if (status === 'not_applicable') {
      parts.push('Nothing here needs a DGS decision — none of the courses you entered can transfer under §5.2, for the reasons on their lines');
    }
    if (status !== 'met') {
      if (preApproved.length > 0) {
        parts.push(
          `Pre-approved by the DGS: ${preApproved.map((c) => c.entry.courseId).join(', ')} — final once the Grad Admin has processed the transfer; send the Grad Admin the processing request (§5.2)`,
        );
      }
      if (caseByCase.length > 0) {
        parts.push(
          `Needs DGS approval: ${caseByCase.map((c) => c.entry.courseId).join(', ')}`,
        );
      }
      // A row whose transferable cell is blank is none of the three above, and
      // used to go unnamed here (found reviewing the dgs_approval change).
      if (listedUndecided.length > 0) {
        parts.push(
          `Reviewed by the DGS, but transferability not yet decided: ${listedUndecided.map((c) => c.entry.courseId).join(', ')}`,
        );
      }
      if (unreviewed.length > 0) {
        parts.push(
          `Not yet reviewed by the DGS: ${unreviewed.map((c) => c.entry.courseId).join(', ')} — the transcripts card has a copy-ready request to email`,
        );
      }
    }
  }
  // The counted transfer courses — what the processing request tables (2026-09-06).
  const transferSatisfied = countedCourseIds(ctx, (p) => (p.course.caps.includes('transfer') ? p.countedRegular : 0));
  return {
    id: opts.id,
    ...(transferSatisfied.length > 0 ? { satisfiedBy: transferSatisfied } : {}),
    group: opts.group,
    title: 'Transfer credit from a prior M.S.',
    shortTitle: 'Transfer credit (§5.2)',
    status,
    ...joinedDetail(parts),
    citation: { section: opts.section, quote },
  };
}
