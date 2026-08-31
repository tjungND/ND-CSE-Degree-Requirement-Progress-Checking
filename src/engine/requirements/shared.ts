// §2 requirements shared by both programs.
import { startOfTerm } from '../term.ts';
import type { RequirementResult } from '../types.ts';
import type { Ctx } from './context.ts';
import { missingParamDetail } from './context.ts';

const GROUP = 'Basic requirements — §2.2–2.3';

/** §2.2: "Continuation in a CSE graduate degree program, admission to degree
 * candidacy, and graduation require maintenance of at least a 3.0 (B)
 * cumulative GPA." */
export function gpaRow(ctx: Ctx): RequirementResult {
  const quote =
    'Continuation in a CSE graduate degree program, admission to degree candidacy, and graduation require maintenance of at least a 3.0 (B) cumulative GPA.';
  const min = ctx.params.number('gpa_min');
  const gpa = ctx.student.gpa;
  let status: RequirementResult['status'];
  let detail: string;
  if (min === undefined) {
    status = 'cannot_evaluate';
    detail = missingParamDetail('gpa_min');
  } else if (gpa === undefined) {
    status = 'cannot_evaluate';
    detail = `Enter your cumulative GPA from your transcript (transferred grades are not part of it, §5.2).`;
  } else if (gpa >= min) {
    status = 'met';
    detail = `Cumulative GPA ${gpa.toFixed(2)} meets the ${min.toFixed(1)} minimum.`;
  } else {
    status = 'unmet';
    detail = `Cumulative GPA ${gpa.toFixed(2)} is below the ${min.toFixed(1)} minimum — you cannot receive a degree or defend until it recovers (§2.2).`;
  }
  return {
    id: 'shared.gpa',
    group: GROUP,
    title: 'Cumulative GPA of at least 3.0',
    status,
    detail,
    citation: { section: '§2.2', quote },
  };
}

/** §2.3: "M.S. students, with assistance from the DGS, are expected to identify
 * a thesis or project advisor by the beginning of their first semester." /
 * "Continuous advisor supervision is required throughout the duration of the
 * Ph.D. program." */
export function advisorRow(ctx: Ctx): RequirementResult {
  const ms = ctx.student.program === 'mscse';
  const quote = ms
    ? 'M.S. students, with assistance from the DGS, are expected to identify a thesis or project advisor by the beginning of their first semester.'
    : 'Continuous advisor supervision is required throughout the duration of the Ph.D. program.';
  const { advisorIdentified, advisorName } = ctx.student.milestones;
  let status: RequirementResult['status'];
  let detail: string;
  if (advisorIdentified || advisorName) {
    status = 'met';
    detail = `Advisor${advisorName ? `: ${advisorName}` : ' identified'}${advisorIdentified ? ` (since ${advisorIdentified})` : ''}.`;
    if (!ms) detail += ' Any disruption to this relationship must be reported to the DGS immediately (§2.3).';
  } else {
    status = 'unmet';
    const start = startOfTerm(ctx.entry).date;
    detail = ms
      ? ctx.today > start
        ? `No advisor entered — an advisor was expected by the beginning of your first semester (§2.3). Talk to the DGS.`
        : `Identify a thesis or project advisor by the beginning of your first semester (§2.3).`
      : `No advisor entered — continuous advisor supervision is required for the whole Ph.D. (§2.3).`;
  }
  return {
    id: 'shared.advisor',
    group: GROUP,
    title: ms ? 'A project or thesis advisor is identified' : 'Under continuous advisor supervision',
    status,
    detail,
    citation: { section: '§2.3', quote },
  };
}

/** Advisory row aggregating every course that still needs a human sign-off
 * (dgs_approval rows, unknown courses, free-text non-CSE, transfers). */
export function approvalsRow(ctx: Ctx): RequirementResult {
  const pending = ctx.classified.filter((c) => !c.superseded && c.approvalPending && c.pool !== 'none');
  const status = pending.length === 0 ? 'not_applicable' : 'needs_dgs_review';
  const detail =
    pending.length === 0
      ? 'No entered course needs a DGS decision.'
      : `These courses are counted provisionally until the sign-off happens: ${pending
          .map((c) => `${c.entry.courseId} (${c.approvalPending})`)
          .join('; ')}. The attestation checkboxes record approvals you already have.`;
  return {
    id: 'shared.approvals',
    group: 'Approvals',
    title: 'Courses needing DGS or advisor sign-off',
    status,
    informational: true,
    detail,
    citation: {
      section: '§3.2/§4.2/§5.2',
      quote: 'All courses taken by a student must have the approval of their advisor.',
    },
  };
}
