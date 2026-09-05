// §3 — Requirements for the Master of Science Degree (MSCSE).
// Every builder quotes the handbook sentence it implements.
import { addYearsIso, deadlineTermLabel, dueTermPhrase, startOfTerm, termLabel } from '../term.ts';
import type { RequirementResult, Status } from '../types.ts';
import type { Ctx } from './context.ts';
import { capRow, missingParamDetail, thresholdRow } from './context.ts';
import { fullTimeTermRecords } from './residency.ts';

const COURSEWORK = 'Coursework — §3.2';
const TIME = 'Residence and time — §3.3';
const PROJECT_THESIS = 'M.S. project or thesis — §3.4';

const REGULAR_QUOTE =
  'The MSCSE degree requires a minimum of twenty-four (24) credit hours of regular courses and six (6) credits hours of Masters project (CSE 68902) or Masters thesis direction (CSE 68901).';

export function mscseRows(ctx: Ctx): RequirementResult[] {
  const rows: RequirementResult[] = [];
  const provisionalRegular = ctx.classified
    .filter((c) => c.pool === 'regular' && c.tier === 'provisional' && !c.superseded)
    .map((c) => c.entry.courseId);

  // §3.2: "The graduate school requires a total of thirty (30) credits of
  // courses and research for the M.S. degree." Only passed courses count
  // toward the total (DGS decision 2026-08-31).
  rows.push(
    thresholdRow({
      id: 'ms.credits.total',
      group: COURSEWORK,
      title: '30 total credits of courses and research',
      sums: ctx.alloc.total,
      required: ctx.params.number('ms_total_credits_min'),
      requiredKey: 'ms_total_credits_min',
      section: '§3.2',
      quote:
        'The graduate school requires a total of thirty (30) credits of courses and research for the M.S. degree.',
      provisionalCourses: provisionalRegular,
    }),
  );

  // §3.2: 24 regular-course credits. "Regular courses are defined as classes
  // with a regular meeting time, assigned readings, graded assignments, and a
  // final exam. Research seminar, research credits, independent study, and
  // other similar courses do not count as regular courses."
  rows.push(
    thresholdRow({
      id: 'ms.credits.regular',
      group: COURSEWORK,
      title: '24 credit hours of regular courses',
      sums: ctx.alloc.regular,
      required: ctx.params.number('ms_regular_credits_min'),
      requiredKey: 'ms_regular_credits_min',
      section: '§3.2',
      quote: REGULAR_QUOTE,
      provisionalCourses: provisionalRegular,
    }),
  );

  // §3.2: 6 credits of CSE 68902 (project) or CSE 68901 (thesis direction).
  // §3.4(i) says 68901 for the project — a handbook typo; either id is
  // accepted so a mis-registration never costs a student credit (decision Q3).
  rows.push(
    thresholdRow({
      id: 'ms.credits.project',
      group: COURSEWORK,
      title: '6 credit hours of M.S. project or thesis direction',
      sums: ctx.alloc.project,
      required: ctx.params.number('ms_project_credits_min'),
      requiredKey: 'ms_project_credits_min',
      section: '§3.2',
      quote: REGULAR_QUOTE,
      extraDetail: ['Register for CSE 68902 (project) or CSE 68901 (thesis direction)'],
    }),
  );

  // §3.2: "Up to six (6) credits at the 40000 level may be used to satisfy the
  // course requirement." Per the DGS (2026-08-31): CSE 4xxxx only, counted
  // inside the 24; non-CSE 40000-level courses do not count at all.
  rows.push(
    capRow({
      id: 'ms.cap.fourk',
      group: COURSEWORK,
      title: 'At most 6 credits at the 40000 level',
      capId: 'fourk',
      capLabel: '40000-level cap credits',
      limitKey: 'ms_4xxxx_credits_max',
      section: '§3.2',
      quote: 'Up to six (6) credits at the 40000 level may be used to satisfy the course requirement.',
      ctx,
    }),
  );

  // §3.2: "Up to nine (9) credits taken from a department other than CSE may be
  // used to satisfy the course requirement, subject to approval by the advisor
  // and the DGS."
  rows.push(
    capRow({
      id: 'ms.cap.noncse',
      group: COURSEWORK,
      title: 'At most 9 credits from outside CSE',
      capId: 'noncse',
      capLabel: 'non-CSE cap credits',
      limitKey: 'ms_noncse_credits_max',
      section: '§3.2',
      quote:
        'Up to nine (9) credits taken from a department other than CSE may be used to satisfy the course requirement, subject to approval by the advisor and the DGS.',
      ctx,
      approvalDriven: true,
    }),
  );

  rows.push(residencyRow(ctx));
  rows.push(...optionRows(ctx));
  return rows;
}

/** §3.3: "The minimum residency requirement for the M.S. degree is registration
 * in full-time status for one semester during the academic year or for one
 * summer session." */
function residencyRow(ctx: Ctx): RequirementResult {
  const quote =
    'The minimum residency requirement for the M.S. degree is registration in full-time status for one semester during the academic year or for one summer session.';
  const records = fullTimeTermRecords(ctx);
  const fullTime = records.filter((r) => r.fullTime);
  const floor = ctx.params.number('fulltime_credits_min');
  let status: Status;
  let detail: string;
  if (floor === undefined) {
    status = 'cannot_evaluate';
    detail = missingParamDetail('fulltime_credits_min');
  } else if (fullTime.length > 0) {
    status = 'met';
    detail = `Full-time (${floor}+ credits, §2.1.2) in ${fullTime.map((r) => termLabel(r.term)).join(', ')}.`;
  } else {
    status = 'in_progress';
    detail = `No full-time term yet — a term counts once its entered credits reach ${floor} (§2.1.2), or mark a research-heavy term as full-time.`;
  }
  return {
    id: 'ms.residency',
    group: TIME,
    title: 'One semester of full-time status (or one summer session)',
    status,
    detail,
    citation: { section: '§3.3', quote },
  };
}

/** §3.3: "Failure to complete all requirements for the M.S. degree within
 * 5 years results in forfeiture of degree eligibility." */
export function msTimeLimitRow(ctx: Ctx, othersAllMet: boolean): RequirementResult {
  const quote =
    'Failure to complete all requirements for the M.S. degree within 5 years results in forfeiture of degree eligibility.';
  const years = ctx.params.number('ms_time_limit_years');
  let status: Status;
  let detail: string;
  let deadline: RequirementResult['deadline'];
  if (years === undefined) {
    status = 'cannot_evaluate';
    detail = missingParamDetail('ms_time_limit_years');
  } else {
    const date = addYearsIso(startOfTerm(ctx.entry).date, years);
    if (othersAllMet) {
      status = 'met';
      detail = `All requirements are complete within the ${years}-year limit.`;
      deadline = { date, approx: true, state: 'done', label: 'Complete' };
    } else if (ctx.today > date) {
      status = 'unmet';
      detail = `Overdue — the ${years}-year limit passed at ${deadlineTermLabel(date)} (approximate). Talk to the DGS.`;
      deadline = { date, approx: true, state: 'overdue', label: `Overdue — the ${years}-year limit passed at ${deadlineTermLabel(date)}` };
    } else {
      status = 'in_progress';
      detail = ''; // the deadline chip carries the when (2026-09-03)
      // A semester, never a date (DGS request 2026-09-05).
      deadline = { date, approx: true, state: 'upcoming', label: `Due ${dueTermPhrase(date)} — ${years} years after entry (approximate)` };
    }
  }
  return {
    id: 'ms.timeLimit',
    group: TIME,
    title: 'All requirements complete within 5 years',
    status,
    detail,
    deadline,
    citation: { section: '§3.3', quote },
  };
}

function optionRows(ctx: Ctx): RequirementResult[] {
  const rows: RequirementResult[] = [];
  const option = ctx.student.msOption ?? 'undecided';
  const m = ctx.student.milestones;

  if (option === 'thesis' || option === 'undecided') {
    // §3.4: "Upon acceptance of the thesis by the thesis defense examination
    // committee (advisor and two readers), the student must successfully pass
    // the oral thesis defense examination."
    const quote =
      'Upon acceptance of the thesis by the thesis defense examination committee (advisor and two readers), the student must successfully pass the oral thesis defense examination.';
    const readers = ctx.params.number('ms_thesis_readers_min');
    let status: Status;
    let detail: string;
    if (m.thesisDefensePassed) {
      status = 'met';
      detail = `Thesis defense passed ${m.thesisDefensePassed}${m.thesisApprovedByReaders ? ` (thesis approved by the readers ${m.thesisApprovedByReaders})` : ''}.`;
    } else {
      status = 'unmet';
      detail = `Not yet passed.`;
      const min = ctx.params.number('gpa_min');
      if (min !== undefined && ctx.student.gpa !== undefined && ctx.student.gpa < min) {
        detail += ` Note §2.2: a student whose cumulative GPA is below ${min.toFixed(1)} may not defend.`;
      }
    }
    rows.push({
      id: 'ms.thesis.defense',
      group: PROJECT_THESIS,
      title: 'Thesis accepted and oral defense passed (thesis option)',
      status,
      detail,
      citation: { section: '§3.4', quote },
    });
  }

  if (option === 'project' || option === 'undecided') {
    // §3.4: "The project report and deliverables must be accepted and approved
    // by the advisor to satisfy the project requirement."
    const quote =
      'The project report and deliverables must be accepted and approved by the advisor to satisfy the project requirement.';
    rows.push({
      id: 'ms.project.report',
      group: PROJECT_THESIS,
      title: 'Project report accepted by the advisor (project option)',
      status: m.projectReportAccepted ? 'met' : 'unmet',
      detail: m.projectReportAccepted
        ? `Project report accepted ${m.projectReportAccepted}.`
        : 'Not yet: the written project report and deliverables must be accepted and approved by your advisor (§3.4).',
      citation: { section: '§3.4', quote },
    });
  }
  return rows;
}
