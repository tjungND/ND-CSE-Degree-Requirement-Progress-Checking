// §4 — Requirements for the Doctor of Philosophy Degree.
// Every builder quotes the handbook sentence it implements.
import { resolveRuleRow } from '../../data/assemble.ts';
import { isNotreDameInstitution, needsApproval } from '../../data/external.ts';
import { coreTitleMatchesArea } from '../core-title.ts';
import { isInProgress, isPassed, meetsGradeFloor } from '../grades.ts';
import { matchDistinctGroups, type GroupCandidate } from '../matching.ts';
import { shortName } from '../short-names.ts';
import { combineAll, deadlineStatus } from '../status.ts';
import {
  addMonthsIso,
  addYearsIso,
  compareTerm,
  deadlineTerm,
  deadlineTermLabel,
  dueTermPhrase,
  endOfTerm,
  maxConsecutiveFullTime,
  nthSemester,
  semesterNumber,
  startOfTerm,
  termIndex,
  termLabel,
  termOfDate,
} from '../term.ts';
import type { DetailPart, Grade, RequirementResult, Status } from '../types.ts';
import type { Ctx } from './context.ts';
import { capRow, joinedDetail, missingParamDetail, thresholdRow, countedCourseIds, pendingCourseIds } from './context.ts';
import { fullTimeTermRecords, longestFullTimeRun } from './residency.ts';

const COURSEWORK = 'Coursework — §4.2';
const TIME = 'Residence and time — §4.3';
const QUALIFIER = 'Qualifying examination — §4.4';
const CANDIDACY = 'Oral Candidacy Exam (OCE) — §4.5'; // the DGS's name for the §4.5 examination (2026-09-06); the handbook quotes below stay verbatim
const DISSERTATION = 'Dissertation and defense — §4.6–4.7';

export function phdRows(ctx: Ctx): RequirementResult[] {
  const rows: RequirementResult[] = [];
  const provisionalRegular = ctx.classified
    .filter((c) => c.pool === 'regular' && c.tier === 'provisional' && !c.superseded)
    .map((c) => c.entry.courseId);

  // §4.2: "The graduate school requires a total of sixty (60) credits of
  // courses and research for the Ph.D." Only passed courses count toward the
  // total (DGS decision 2026-08-31).
  rows.push(
    thresholdRow({
      id: 'phd.credits.total',
      group: COURSEWORK,
      title: '60 total credits of courses and research',
      shortTitle: '60 total credits',
      sums: ctx.alloc.total,
      satisfiedBy: countedCourseIds(ctx, (p) => p.countedRegular + p.countedOther),
      pendingBy: pendingCourseIds(ctx, (p) => p.countedRegular + p.countedOther),
      required: ctx.params.number('phd_total_credits_min'),
      requiredKey: 'phd_total_credits_min',
      section: '§4.2',
      quote: 'The graduate school requires a total of sixty (60) credits of courses and research for the Ph.D.',
      provisionalCourses: provisionalRegular,
    }),
  );

  // §4.2: "The CSE department requires a minimum of twenty-four (24) credit
  // hours of regular courses at the 60000 level or higher." Up to 6 CSE-4xxxx
  // credits count inside the 24 (DGS answer to Q4, 2026-08-31).
  rows.push(
    thresholdRow({
      id: 'phd.credits.regular',
      group: COURSEWORK,
      title: '24 credit hours of regular courses at the 60000 level or higher',
      shortTitle: '24 regular-course credits',
      sums: ctx.alloc.regular,
      satisfiedBy: countedCourseIds(ctx, (p) => p.countedRegular),
      pendingBy: pendingCourseIds(ctx, (p) => p.countedRegular),
      required: ctx.params.number('phd_regular_credits_min'),
      requiredKey: 'phd_regular_credits_min',
      section: '§4.2',
      quote:
        'The CSE department requires a minimum of twenty-four (24) credit hours of regular courses at the 60000 level or higher.',
      provisionalCourses: provisionalRegular,
    }),
  );

  rows.push(seminarRow(ctx));

  // §4.2: "Up to six (6) credits from CSE 4xxxx may be used to satisfy the
  // course requirement, subject to approval of the student's advisor and DGS."
  // The handbook's allowance names the 40000 level; the DGS applies the SAME
  // six credits to any CSE course below the 60000 level the rules sheet
  // permits, 50000-level bridge courses included (2026-09-09): a sheet cell
  // saying a course may count toward the degree is a permission, not an
  // exemption from §4.2's other limits.
  rows.push(
    capRow({
      id: 'phd.cap.fourk',
      group: COURSEWORK,
      title: 'At most 6 credits from CSE courses below the 60000 level',
      capId: 'fourk',
      capLabel: 'credits below the 60000 level',
      limitKey: 'phd_4xxxx_cse_credits_max',
      section: '§4.2',
      quote:
        "Up to six (6) credits from CSE 4xxxx may be used to satisfy the course requirement, subject to approval of the student's advisor and DGS.",
      ctx,
    }),
  );

  // §4.2: "Up to nine (9) credits at the 6xxxx level taken from a department
  // other than CSE may be used to satisfy the course requirement, subject to
  // approval of the student's advisor and DGS."
  rows.push(
    capRow({
      id: 'phd.cap.noncse',
      group: COURSEWORK,
      title: 'At most 9 credits at 6xxxx from outside CSE',
      capId: 'noncse',
      capLabel: 'non-CSE cap credits',
      limitKey: 'phd_noncse_6xxxx_credits_max',
      section: '§4.2',
      quote:
        "Up to nine (9) credits at the 6xxxx level taken from a department other than CSE may be used to satisfy the course requirement, subject to approval of the student's advisor and DGS.",
      ctx,
      approvalDriven: true,
    }),
  );

  // §4.2: "Regardless of any credits transferred, all Ph.D. students must take
  // at least nine (9) credits at Notre Dame in order to satisfy the qualifying
  // examination described in section 4.4."
  rows.push(
    thresholdRow({
      id: 'phd.credits.nd',
      group: COURSEWORK,
      title: 'At least 9 credits taken at Notre Dame',
      shortTitle: '9 credits at ND',
      sums: ctx.alloc.ndRegular,
      pendingBy: pendingCourseIds(ctx, (p) => (p.course.entry.origin === 'nd' && p.course.pool === 'regular' ? p.countedRegular : 0)),
      satisfiedBy: countedCourseIds(ctx, (p) => (p.course.entry.origin === 'nd' && p.course.pool === 'regular' ? p.countedRegular : 0)),
      required: ctx.params.number('phd_nd_credits_min'),
      requiredKey: 'phd_nd_credits_min',
      section: '§4.2',
      quote:
        'Regardless of any credits transferred, all Ph.D. students must take at least nine (9) credits at Notre Dame in order to satisfy the qualifying examination described in section 4.4.',
    }),
  );

  rows.push(transferRow(ctx));
  rows.push(residencyRow(ctx));

  const qualifierChildren = [
    ...coreRows(ctx),
    categoriesRow(ctx),
    researchQualifierRow(ctx),
  ];
  rows.push(qualifierUmbrellaRow(ctx, qualifierChildren));
  rows.push(...qualifierChildren);
  rows.push(candidacyRow(ctx));
  rows.push(...dissertationRows(ctx));
  // §4.5's MSCSE cannot be earned twice. A Ph.D. student who already holds the
  // Notre Dame MSCSE (their master's before this program) has no along-the-way
  // row at all — showing it would offer them a degree they hold and count
  // their credits from zero toward it (DGS 2026-09-09).
  if (ctx.student.ndMasters === undefined) rows.push(msAlongTheWayRow(ctx));
  return rows;
}

/** §4.2: "Two credits of Research Seminar (CSE 63801 and CSE 63802) are
 * required and expected to be taken during the ﬁrst year of the program." */
function seminarRow(ctx: Ctx): RequirementResult {
  const quote =
    'Two credits of Research Seminar (CSE 63801 and CSE 63802) are required and expected to be taken during the first year of the program.';
  const wanted = ctx.params.courseList('phd_seminar_courses');
  let status: Status;
  const parts: string[] = [];
  const satisfied: string[] = [];
  if (wanted === undefined) {
    status = 'cannot_evaluate';
    parts.push(missingParamDetail('phd_seminar_courses'));
  } else {
    const states = wanted.map((id) => {
      const entries = ctx.classified.filter((c) => !c.superseded && c.entry.courseId === id);
      const passed = entries.some((c) => isPassed(c.entry.grade));
      const ip = entries.some((c) => isInProgress(c.entry.grade));
      if (passed) satisfied.push(id);
      parts.push(`${id}: ${passed ? 'done' : ip ? 'in progress' : 'not yet'}`);
      return passed ? 'met' : ip ? 'in_progress' : 'unmet';
    });
    status = states.every((s) => s === 'met')
      ? 'met'
      : states.every((s) => s !== 'unmet')
        ? 'in_progress'
        : 'unmet';
    const sem = semesterNumber(ctx.entry, termOfDate(ctx.today));
    if (status !== 'met' && sem > 2) {
      parts.push(`§4.2 expects these during the first year — you are in semester ${sem}`);
    }
  }
  return {
    id: 'phd.seminar',
    group: COURSEWORK,
    title: '2 credits of Research Seminar in year one',
    shortTitle: 'Research seminar (2 cr)',
    status,
    ...joinedDetail(parts),
    ...(satisfied.length > 0 ? { satisfiedBy: satisfied } : {}),
    citation: { section: '§4.2', quote },
  };
}

/** §4.2 + §5.2 transfer credit: window, B floor, and the 6/24 caps are enforced
 * by the classifier/allocator; this row reports the result. Every transfer is
 * needs-DGS-review until attested (§5.2 requires DGS + Graduate School approval) —
 * except when every pending course is already ruled transferable: then the row
 * is "in progress" until the Grad Admin has processed it (DGS 2026-09-07). */
function transferRow(ctx: Ctx): RequirementResult {
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
      ? 'phd_transfer_completed_ms_credits_max'
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
    const counted =
      ctx.alloc.transfer.definite + ctx.alloc.transfer.in_progress + ctx.alloc.transfer.provisional;
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
    status = ctx.student.attestations.transferApproved
      ? 'met'
      : pending.length === 0
        ? 'not_applicable'
        : preApproved.length === pending.length
          ? 'in_progress'
          : 'needs_dgs_review';
    parts.push(
      `${counted} of ${cap} transfer credits counted (§5.2 cap for a ${ctx.student.priorMs === 'completed' ? 'completed prior degree' : 'prior program that was not completed'})`,
    );
    const excluded = ctx.alloc.perCourse.filter(
      (p) => p.course.entry.origin === 'transfer' && p.course.entry.degreeLevel !== 'bachelors' && p.excluded > 0,
    );
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
    id: 'phd.transfer',
    ...(transferSatisfied.length > 0 ? { satisfiedBy: transferSatisfied } : {}),
    group: COURSEWORK,
    title: 'Transfer credit from a prior M.S.',
    shortTitle: 'Transfer credit (§5.2)',
    status,
    ...joinedDetail(parts),
    citation: { section: '§4.2, §5.2', quote },
  };
}

/** §4.3: "The minimum residence requirement for the Ph.D. degree is full-time
 * status for four (4) consecutive semesters (not including the summer session)." */
function residencyRow(ctx: Ctx): RequirementResult {
  const quote =
    'The minimum residence requirement for the Ph.D. degree is full-time status for four (4) consecutive semesters (not including the summer session).';
  const required = ctx.params.number('phd_residency_semesters');
  const floor = ctx.params.number('fulltime_credits_min');
  let status: Status;
  let detail: string;
  let satisfied: string[] = [];
  if (required === undefined || floor === undefined) {
    status = 'cannot_evaluate';
    detail = missingParamDetail(required === undefined ? 'phd_residency_semesters' : 'fulltime_credits_min');
  } else {
    const records = fullTimeTermRecords(ctx);
    const run = maxConsecutiveFullTime(records);
    if (run >= required) {
      status = 'met';
      detail = `${run} consecutive full-time semesters (summers excluded, §4.3).`;
      satisfied = longestFullTimeRun(records).map((t) => termLabel(t));
    } else {
      status = 'in_progress';
      detail = `Longest consecutive full-time run so far: ${run} of ${required} semesters.`;
    }
  }
  return {
    id: 'phd.residency',
    group: TIME,
    title: 'Four consecutive full-time semesters of residence',
    status,
    detail,
    ...(satisfied.length > 0 ? { satisfiedBy: satisfied } : {}),
    citation: { section: '§4.3', quote },
  };
}

/** §4.3: "Failure to complete all requirements for the Ph.D. degree within
 * eight (8) years results in forfeiture of degree eligibility." */
export function phdTimeLimitRow(ctx: Ctx, othersAllMet: boolean): RequirementResult {
  const quote =
    'Failure to complete all requirements for the Ph.D. degree within eight (8) years results in forfeiture of degree eligibility.';
  const years = ctx.params.number('phd_time_limit_years');
  let status: Status;
  let detail: string;
  let deadline: RequirementResult['deadline'];
  if (years === undefined) {
    status = 'cannot_evaluate';
    detail = missingParamDetail('phd_time_limit_years');
  } else {
    // Shown as a semester, never a date (DGS request 2026-09-05): eight years
    // from the entry term's start is the start of a term.
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
      deadline = { date, approx: true, state: 'upcoming', label: `Due ${dueTermPhrase(date)} — ${years} years after entry (approximate)` };
    }
  }
  return {
    id: 'phd.timeLimit',
    group: TIME,
    title: 'All requirements complete within 8 years',
    status,
    detail,
    deadline,
    citation: { section: '§4.3', quote },
  };
}

/** §4.4: "Students must complete all three components of the qualiﬁer
 * requirement within four (4) semesters of starting; the DGS may extend the
 * deadline on a case-by-case basis." */
function qualifierUmbrellaRow(ctx: Ctx, children: RequirementResult[]): RequirementResult {
  const quote =
    'Students must complete all three components of the qualifier requirement within four (4) semesters of starting; the DGS may extend the deadline on a case-by-case basis.';
  const semesters = ctx.params.number('qualifier_deadline_semesters');
  let status = combineAll(children.map((c) => c.status));
  const parts: string[] = ['Three components: core knowledge (§4.4.1 — one card per core area below), category specialization (§4.4.2), research (§4.4.3)'];
  let deadline: RequirementResult['deadline'];
  if (semesters === undefined) {
    status = 'cannot_evaluate';
    parts.push(missingParamDetail('qualifier_deadline_semesters'));
  } else {
    const term = nthSemester(ctx.entry, semesters);
    const date = endOfTerm(term).date;
    if (status === 'met') {
      deadline = { date, approx: true, state: 'done', label: 'Complete' };
      if (!ctx.student.milestones.qualifierFormFiled) {
        parts.push('Remember to file the qualifier completion form with the Grad Admin (§4.4)');
      }
    } else if (ctx.today > date && !ctx.student.attestations.qualifierExtensionGranted) {
      // Decision Q17b: a deadline past with the work incomplete is unmet, even
      // when a component is still in progress (matching deadlineStatus()).
      status = 'unmet';
      // The deadline chip carries the when (2026-09-03).
      parts.push(`Overdue — talk to the DGS`);
      deadline = { date, approx: true, state: 'overdue', label: `Overdue — was due by the end of ${termLabel(term)} (approximate)` };
    } else {
      deadline = { date, approx: true, state: 'upcoming', label: `Due by the end of ${termLabel(term)} (approximate)` };
    }
  }
  return {
    id: 'phd.qualifier',
    group: QUALIFIER,
    title: 'Qualifying examination — all components', // "all components", not "all three": five cards sit under it (DGS 2026-09-06)
    status,
    ...joinedDetail(parts),
    deadline,
    citation: { section: '§4.4', quote },
  };
}

/** §4.4.1: "All PhD students are required to pass (or have previously passed)
 * an Operating Systems course, an Algorithms course, and a Computer
 * Architecture course, either at Notre Dame or at their previous institution." */
function coreRows(ctx: Ctx): RequirementResult[] {
  const quote =
    'All PhD students are required to pass (or have previously passed) an Operating Systems course, an Algorithms course, and a Computer Architecture course, either at Notre Dame or at their previous institution.';
  return ctx.rules.coreAreas.map((area) => {
    // A course satisfies a core area when its rules row tags it (core_area) and
    // it passed — any passing grade (decision Q9). An EXTERNAL course passes
    // this row outright when the DGS's ExternalCourses tab confirms the area
    // (2026-09-01). The old student-claimed area and "previously passed
    // elsewhere" attestation paths were RETIRED 2026-09-03 (they predated the
    // ExternalCourses tab and duplicated it; Q12 superseded) — a course from a
    // previous institution counts only via the DGS's ruling in that tab. The
    // §5.2 window/floor/degree-level rules do not apply here ("or have
    // previously passed" is about knowledge, not credit — an undergraduate
    // course counts).
    let done: string | undefined;
    let confirmed: string | undefined;
    let ip: string | undefined;
    let pending: string | undefined;
    for (const c of ctx.classified) {
      if (c.superseded) continue;
      if (c.entry.origin === 'nd') {
        if (c.rule?.coreArea === area.code) {
          if (isPassed(c.entry.grade)) done = c.entry.courseId;
          else if (isInProgress(c.entry.grade)) ip ??= c.entry.courseId;
          continue;
        }
        // An ND course the rules sheet does not know yet, whose title matches
        // this area's keyword, may be confirmed once the DGS reviews it
        // (2026-09-04) — the row says "pending review", not "not yet".
        if (c.unknown === true && isPassed(c.entry.grade) && coreTitleMatchesArea(c.entry.title, area.code)) {
          pending ??= c.entry.courseId;
        }
      } else if (c.external?.satisfiesCoreArea === area.code && isPassed(c.entry.grade)) {
        confirmed ??= `${c.entry.courseId} (${c.external.university})`;
      } else if (isNotreDameInstitution(c.entry.institution) && c.rule?.coreArea === area.code) {
        // Prior Notre Dame coursework (2026-09-05): the Courses tab's core
        // area applies to a Notre Dame course whenever it was taken — an
        // earlier degree's course needs no ExternalCourses ruling.
        if (isPassed(c.entry.grade)) done ??= `${c.entry.courseId} (Notre Dame, before entering the program)`;
        else if (isInProgress(c.entry.grade)) ip ??= c.entry.courseId;
      } else if (c.external === undefined && isPassed(c.entry.grade) && coreTitleMatchesArea(c.entry.title, area.code)) {
        // Unreviewed course from a previous institution (any level — §4.4.1
        // has no §5.2 restrictions) whose title suggests this area: the DGS's
        // ruling is what decides, so the row shows "pending review"
        // (2026-09-04). A course the DGS has already ruled on (even with no
        // core area) is decided, never pending.
        pending ??= `${c.entry.courseId}${c.entry.institution ? ` (${c.entry.institution})` : ''}`;
      }
    }
    const status: Status = done || confirmed ? 'met' : ip ? 'in_progress' : pending ? 'needs_dgs_review' : 'unmet';
    const detail = done
      ? `Satisfied by ${done}.`
      : confirmed
        ? `Satisfied by ${confirmed} — confirmed in the DGS’s external-course rules (§4.4.1 allows a course from a previous institution).`
        : ip
          ? `${ip} is in progress.`
          : pending
            ? `Pending review: ${pending} — its title suggests ${area.name}, and the DGS can confirm it (§4.4.1) via the review request.`
            : `No ${area.name} course yet.`;
    return {
      id: `phd.qualifier.core.${area.code}`,
      group: QUALIFIER,
      title: `Core knowledge: ${area.name}`,
      shortTitle: `Core: ${shortName(area.name)}`,
      status,
      detail,
      citation: { section: '§4.4.1', quote },
      // The course id alone (the detail may add "(Purdue University)" etc.).
      ...(status === 'met' ? { satisfiedBy: [(done ?? confirmed)!.replace(/ \(.*\)$/, '')] } : {}),
      // In progress, or waiting on the DGS: it will satisfy this area, and the
      // course's own line says so (2026-09-08).
      ...(status !== 'met' && (ip ?? pending) ? { pendingBy: [(ip ?? pending)!.replace(/ \(.*\)$/, '')] } : {}),
    };
  });
}

/** §4.4.2: "Students are required to take three category specialization courses
 * from three distinct groups and pass them with a grade of B or higher."
 * ("Core Knowledge courses and Category Specialization courses may overlap.") */
function categoriesRow(ctx: Ctx): RequirementResult {
  const quote =
    'Students are required to take three category specialization courses from three distinct groups and pass them with a grade of B or higher.';
  const coursesReq = ctx.params.number('category_courses_required');
  const groupsReq = ctx.params.number('category_distinct_groups_required');
  const floor = ctx.params.gradeLetter('category_min_grade');
  if (coursesReq === undefined || groupsReq === undefined || floor === undefined) {
    const missing =
      coursesReq === undefined
        ? 'category_courses_required'
        : groupsReq === undefined
          ? 'category_distinct_groups_required'
          : 'category_min_grade';
    return {
      id: 'phd.qualifier.categories',
      group: QUALIFIER,
      title: 'Three specialization courses from three distinct groups, each B or higher',
      status: 'cannot_evaluate',
      detail: missingParamDetail(missing),
      citation: { section: '§4.4.2', quote },
    };
  }

  const allGroups = ctx.rules.categoryGroups.map((g) => g.code);
  const groupName = (code: string) => ctx.rules.categoryGroups.find((g) => g.code === code)?.name ?? code;
  const qualifying: GroupCandidate[] = [];
  const inProgress: GroupCandidate[] = [];
  const belowFloor: string[] = [];
  // A course taken in an EARLIER Notre Dame program (a prior MSCSE, a 4+1)
  // whose §5.2 transfer credit is not approved yet — named, never counted
  // (DGS 2026-09-09).
  const awaitingTransfer: GroupCandidate[] = [];
  const countedCredits = new Map<(typeof ctx.classified)[number], number>();
  for (const p of ctx.alloc.perCourse) countedCredits.set(p.course, p.countedRegular + p.countedOther);
  for (const c of ctx.classified) {
    if (c.superseded) continue;
    // §4.4.2 names no institution and no term — unlike §4.4.1's "or have
    // previously passed", it says only that the student must "take three
    // category specialization courses … and pass them with a grade of B or
    // higher". A course from an earlier Notre Dame program therefore counts
    // once its credit actually transfers into the Ph.D. under §5.2, because
    // the DGS's recommendation and the Graduate School's approval are what
    // make it part of this degree (DGS 2026-09-09). Coursework from another
    // university cannot reach this row at all: only the Courses tab carries
    // §4.4.2 group tags, and it lists Notre Dame's courses.
    let priorNd = false;
    if (c.entry.origin !== 'nd') {
      if (!isNotreDameInstitution(c.entry.institution)) continue;
      // A course taken BEFORE the bachelor's degree — §3.5's junior/senior-year
      // 6xxxx courses — brings no credit into the Ph.D. while §5.2 criterion 2
      // is read strictly, but it still counts here (DGS 2026-09-10, evening:
      // "they can still be used to satisfy the core knowledge and
      // specialization category requirements in the qualifying exam
      // requirement"). §4.4.2 asks the student to have taken and passed the
      // course, and neither component of the qualifier is credit.
      const awarded = ctx.student.bachelorsAwarded;
      const beforeBachelors = awarded !== undefined && compareTerm(c.entry.term, awarded) <= 0;
      if (!beforeBachelors) {
        if (!c.caps.includes('transfer')) continue; // excluded by §5.2 — not this degree's course
        if ((countedCredits.get(c) ?? 0) <= 0) continue; // over the §5.2 cap: no credit transferred
      }
      priorNd = !beforeBachelors;
    }
    // The sheet may name one group, several, or `any` (DGS 2026-09-08).
    // 'ineligible' and a blank cell are both "not a candidate"; a code the
    // Categories tab does not list is dropped defensively, so a stale sheet
    // value can never inflate the count.
    const listed = c.rule?.categoryGroups;
    if (!listed || listed.length === 0) continue;
    const groups = listed.includes('any') ? allGroups : listed.filter((g) => allGroups.includes(g));
    if (groups.length === 0) continue;
    const cand: GroupCandidate = {
      courseId: c.entry.courseId,
      title: c.rule?.title ?? c.entry.title ?? '',
      groups,
      // The student's own choice applies whenever the course leaves one open.
      pinned: groups.length > 1 ? c.entry.assignedGroup : undefined,
      sortKey: `${termIndex(c.entry.term)}|${c.entry.courseId}`,
    };
    // A prior Notre Dame course counts only once the transfer is approved —
    // `definite` is exactly that state (the student has recorded the DGS's
    // recommendation and the Graduate School's approval). Before then it is
    // named as waiting, so the student can see what the approval would buy.
    if (priorNd && c.tier !== 'definite') {
      if (meetsGradeFloor(c.entry.grade, floor as Grade)) awaitingTransfer.push(cand);
      continue;
    }
    if (isInProgress(c.entry.grade)) inProgress.push(cand);
    else if (meetsGradeFloor(c.entry.grade, floor as Grade)) qualifying.push(cand);
    else if (isPassed(c.entry.grade)) belowFloor.push(`${c.entry.courseId} (${c.entry.grade})`);
  }

  const def = matchDistinctGroups(qualifying, allGroups);
  const combined = matchDistinctGroups([...qualifying, ...inProgress], allGroups);
  const withTransfers = matchDistinctGroups([...qualifying, ...inProgress, ...awaitingTransfer], allGroups);

  let status: Status;
  // Two versions of the same statements (DGS 2026-09-08): `parts` spells the
  // group names out and is what the copied messages re-voice; `shortParts` is
  // what the page shows. `add` keeps them in step — pass a short variant only
  // where a group NAME appears, never for a course title.
  const parts: DetailPart[] = [];
  const shortParts: DetailPart[] = [];
  const add = (full: DetailPart, short?: DetailPart) => {
    parts.push(full);
    shortParts.push(short ?? full);
  };
  if (def.distinctCount >= groupsReq && qualifying.length >= coursesReq) {
    status = 'met';
    const assignmentLine = (short: boolean) => ([courseId, g]: [string, string]) => {
      const cand = qualifying.find((q) => q.courseId === courseId);
      const isAny = (cand?.groups.length ?? 0) > 1;
      const name = short ? shortName(groupName(g)) : groupName(g);
      return `${courseId}${cand?.title ? ` ${cand.title}` : ''} → ${name}${isAny ? ' (flexible course — your assignment)' : ''}`;
    };
    const lead = `${qualifying.length} qualifying courses covering ${def.distinctCount} distinct groups`;
    const entries = [...def.assignment.entries()];
    add({ lead, items: entries.map(assignmentLine(false)) }, { lead, items: entries.map(assignmentLine(true)) });
  } else if (combined.distinctCount >= groupsReq && qualifying.length + inProgress.length >= coursesReq) {
    status = 'in_progress';
    add(
      `${qualifying.length} done (${def.distinctCount} distinct groups) with ${inProgress.length} in progress — on track for ${groupsReq} distinct groups`,
    );
  } else {
    status = 'unmet';
    add(
      `${qualifying.length} qualifying course${qualifying.length === 1 ? '' : 's'} covering ${def.distinctCount} distinct group${def.distinctCount === 1 ? '' : 's'} — ${groupsReq} distinct groups and ${coursesReq} courses with a grade of ${floor} or higher are required`,
    );
    if (def.missingGroups.length > 0) {
      add(
        `still open: ${def.missingGroups.map(groupName).join(', ')}`,
        `still open: ${def.missingGroups.map((g) => shortName(groupName(g))).join(', ')}`,
      );
    }
  }
  // Courses from an earlier Notre Dame program that would cover a group once
  // their transfer is approved (DGS 2026-09-09). They never change a "met" —
  // a requirement already satisfied needs nothing from them — but where they
  // would complete the row, the row waits on the DGS rather than reading
  // "unmet", so the student can see that the approval is what is missing.
  if (awaitingTransfer.length > 0) {
    const wouldFinish =
      status !== 'met' &&
      withTransfers.distinctCount >= groupsReq &&
      qualifying.length + inProgress.length + awaitingTransfer.length >= coursesReq;
    if (wouldFinish) status = 'needs_dgs_review';
    const ids = awaitingTransfer.map((c) => c.courseId).join(', ');
    add(
      wouldFinish
        ? `${ids} — taken in your earlier Notre Dame program — would complete this once the DGS recommends the §5.2 transfer and the Graduate School approves it; send the review request`
        : `${ids} — taken in your earlier Notre Dame program — will count here once the §5.2 transfer is approved`,
    );
  }
  if (belowFloor.length > 0) {
    add(
      `below the ${floor} floor: ${belowFloor.join(', ')} — you may retake the course to replace the grade or take another course (§4.4.2)`,
    );
  }
  for (const suggestion of def.suggestions) add(suggestion);
  add('The approved course list is on the course rules page');
  // Which group each flexible course should be set to (DGS request
  // 2026-09-08): the ones no OTHER course of theirs already covers. Read off
  // the best matching over everything they have, so a suggestion is never one
  // that another course is already filling.
  const groupChoices: Record<string, string[]> = {};
  for (const cand of [...qualifying, ...inProgress]) {
    if (cand.groups.length <= 1) continue; // the sheet fixes this course's group
    const coveredByOthers = new Set(
      [...combined.assignment.entries()].filter(([courseId]) => courseId !== cand.courseId).map(([, g]) => g),
    );
    // Only the groups this course is actually listed under (2026-09-08): a
    // course named for two groups must never be offered the other three.
    groupChoices[cand.courseId] = cand.groups.filter((g) => !coveredByOthers.has(g));
  }

  const stillPending = new Set(ctx.classified.filter((c) => c.tier !== 'definite' && !c.superseded).map((c) => c.entry.courseId));
  const assigned = [...def.assignment.keys()];
  const assignedDone = assigned.filter((id) => !stillPending.has(id));
  const assignedPending = assigned.filter((id) => stillPending.has(id));
  return {
    id: 'phd.qualifier.categories',
    group: QUALIFIER,
    title: 'Three specialization courses from three distinct groups, each B or higher',
    shortTitle: 'Specialization (3 groups)',
    status,
    ...joinedDetail(parts),
    // Only when the two actually differ, so a row with no group name in it
    // carries nothing extra.
    ...(shortParts.some((p, i) => p !== parts[i]) ? { shortDetailParts: shortParts } : {}),
    // The assigned courses, whether or not the row is complete (2026-09-08):
    // each course's own line names this requirement, and a course that is
    // passed contributes now even while the requirement as a whole is not met.
    ...(Object.keys(groupChoices).length > 0 ? { groupChoices } : {}),
    ...(assignedDone.length > 0 ? { satisfiedBy: assignedDone } : {}),
    ...(assignedPending.length > 0 ? { pendingBy: assignedPending } : {}),
    citation: { section: '§4.4.2', quote },
  };
}

/** §4.4.3: "Within 18 months of the student entering the program, the research
 * advisor must determine whether the student has passed or failed the research
 * component of the qualiﬁer." */
function researchQualifierRow(ctx: Ctx): RequirementResult {
  const quote =
    'Within 18 months of the student entering the program, the research advisor must determine whether the student has passed or failed the research component of the qualifier.';
  const months = ctx.params.number('research_qualifier_deadline_months');
  if (months === undefined) {
    return {
      id: 'phd.qualifier.research',
      group: QUALIFIER,
      title: 'Research component: a significant research contribution',
      status: 'cannot_evaluate',
      detail: missingParamDetail('research_qualifier_deadline_months'),
      citation: { section: '§4.4.3', quote },
    };
  }
  const date = addMonthsIso(startOfTerm(ctx.entry).date, months);
  const r = deadlineStatus({
    doneOn: ctx.student.milestones.researchQualifierPassed,
    deadline: { date, approx: true },
    today: ctx.today,
    // A semester, not a date (DGS request 2026-09-05): 18 months after a fall
    // entry lands in the middle of the second spring — "mid-Spring 2028".
    deadlineLabel: `${deadlineTerm(date).when === 'during' ? `mid-${termLabel(deadlineTerm(date).term)}` : deadlineTermLabel(date)} — ${months} months after entry`,
    extensionGranted: ctx.student.attestations.qualifierExtensionGranted,
  });
  const detail =
    r.status === 'met'
      ? `Research qualifier passed ${ctx.student.milestones.researchQualifierPassed}.`
      : r.status === 'needs_dgs_review'
        ? `Passed ${ctx.student.milestones.researchQualifierPassed}, ${r.lateNote}.`
        : r.status === 'unmet'
          ? // The deadline chip carries the when — the detail stays progress-only.
            `Overdue — talk to your advisor and the DGS.`
          : `The advisor's Research-Qualifier form is not filed yet.`;
  return {
    id: 'phd.qualifier.research',
    group: QUALIFIER,
    title: 'Research component: a significant research contribution',
    status: r.status,
    detail,
    deadline: r.deadline,
    citation: { section: '§4.4.3', quote },
  };
}

/** §4.5: "The candidacy exam must be taken before the end of the eighth
 * semester in the program." */
function candidacyRow(ctx: Ctx): RequirementResult {
  const quote = 'The candidacy exam must be taken before the end of the eighth semester in the program.';
  const sem = ctx.params.number('candidacy_deadline_semester');
  if (sem === undefined) {
    return {
      id: 'phd.candidacy',
      group: CANDIDACY,
      title: 'Oral Candidacy Exam (OCE) passed',
      status: 'cannot_evaluate',
      detail: missingParamDetail('candidacy_deadline_semester'),
      citation: { section: '§4.5', quote },
    };
  }
  const term = nthSemester(ctx.entry, sem);
  const date = endOfTerm(term).date;
  const r = deadlineStatus({
    doneOn: ctx.student.milestones.candidacyPassed,
    deadline: { date, approx: true },
    today: ctx.today,
    deadlineLabel: `the end of ${termLabel(term)} — semester ${sem}`,
  });
  const parts: string[] = [];
  if (r.status === 'met') parts.push(`Oral Candidacy Exam (OCE) passed ${ctx.student.milestones.candidacyPassed}`);
  else if (r.status === 'needs_dgs_review')
    parts.push(`Passed ${ctx.student.milestones.candidacyPassed}, ${r.lateNote ?? ''}`);
  else if (r.status === 'unmet')
    // The deadline chip carries the when; policy (coursework-before-exam,
    // committee make-up) lives behind the § chip (2026-09-03).
    parts.push(`Overdue — talk to the DGS`);
  return {
    id: 'phd.candidacy',
    group: CANDIDACY,
    title: 'Oral Candidacy Exam (OCE) passed',
    status: r.status,
    ...(parts.length > 0 ? joinedDetail(parts) : { detail: '' }),
    deadline: r.deadline,
    citation: { section: '§4.5', quote },
  };
}

function dissertationRows(ctx: Ctx): RequirementResult[] {
  const m = ctx.student.milestones;
  const min = ctx.params.number('gpa_min');
  const gpaGate =
    min !== undefined && ctx.student.gpa !== undefined && ctx.student.gpa < min
      ? ` Note §2.2: a student whose cumulative GPA is below ${min.toFixed(1)} may not defend.`
      : '';
  return [
    // §4.6: "Only a dissertation, which has been unanimously approved for
    // defense by the readers, may be defended."
    {
      id: 'phd.dissertation.approval',
      group: DISSERTATION,
      title: 'Dissertation unanimously approved for defense by the readers',
      status: m.dissertationApprovedForDefense ? 'met' : 'unmet',
      detail: m.dissertationApprovedForDefense
        ? `Approved for defense ${m.dissertationApprovedForDefense}.`
        : 'Not yet approved.',
      citation: {
        section: '§4.6',
        quote: 'Only a dissertation, which has been unanimously approved for defense by the readers, may be defended.',
      },
    },
    // §4.7: the dissertation defense.
    {
      id: 'phd.dissertation.defense',
      group: DISSERTATION,
      title: 'Dissertation defense passed',
      status: m.defensePassed ? 'met' : 'unmet',
      detail: m.defensePassed
        ? `Defense passed ${m.defensePassed}. Submit the final dissertation electronically per the Graduate School's procedures (§4.7).`
        : `Not yet: three votes of four (or four of five) are required to pass (§4.7).${gpaGate}`,
      citation: {
        section: '§4.7',
        quote: 'In defending the dissertation, the doctoral candidate supports its claims, procedures and results.',
      },
    },
  ];
}

/** §4.5: "The Ph.D. candidacy exam can be used by Ph.D. students to satisfy
 * both the M.S. thesis requirement and the Ph.D. candidacy exam simultaneously,
 * thus earning the MSCSE degree on successfully passing the candidacy exam." */
function msAlongTheWayRow(ctx: Ctx): RequirementResult {
  const quote =
    'The Ph.D. candidacy exam can be used by Ph.D. students to satisfy both the M.S. thesis requirement and the Ph.D. candidacy exam simultaneously, thus earning the MSCSE degree on successfully passing the candidacy exam.';
  const passed = ctx.student.milestones.candidacyPassed;
  // DGS policy (2026-09-03; research credits added 2026-09-04): the
  // along-the-way MSCSE needs the M.S. coursework done AT NOTRE DAME — the
  // MSCSE's regular-course credits (ms_regular_credits_min) AND its research
  // credits (ms_project_credits_min; here research means courses the rules
  // sheet types 'research' or 'project', i.e. research/dissertation and
  // thesis-project direction — independent study does not count).
  const reqReg = ctx.params.number('ms_regular_credits_min');
  const reqRes = ctx.params.number('ms_project_credits_min');
  const doneReg = ctx.alloc.ndRegular.definite;
  const doneRes = ctx.alloc.ndResearch.definite;
  let status: Status;
  let detail: string;
  if (reqReg === undefined || reqRes === undefined) {
    status = 'cannot_evaluate';
    detail = missingParamDetail(reqReg === undefined ? 'ms_regular_credits_min' : 'ms_project_credits_min');
  } else if (passed && doneReg >= reqReg && doneRes >= reqRes) {
    status = 'met';
    detail = `Oral Candidacy Exam (OCE) passed ${passed}, with ${doneReg} regular course credits and ${doneRes} research credits completed at Notre Dame — the Grad Admin processes the MSCSE award; it is in the processing request (§4.5).`;
  } else if (passed) {
    status = 'in_progress';
    detail = `${doneReg} of ${reqReg} regular course credits and ${doneRes} of ${reqRes} research credits completed at Notre Dame.`;
  } else {
    status = 'not_applicable';
    detail = `Passing the Oral Candidacy Exam (OCE) can also earn the MSCSE (§4.5) once ${reqReg} regular course credits and ${reqRes} research credits are completed at Notre Dame — ${doneReg} of ${reqReg} and ${doneRes} of ${reqRes} so far.`;
  }
  return {
    id: 'phd.msAlongTheWay',
    group: CANDIDACY,
    title: 'MSCSE awarded along the way',
    status,
    informational: true,
    detail,
    citation: { section: '§4.5', quote },
  };
}
