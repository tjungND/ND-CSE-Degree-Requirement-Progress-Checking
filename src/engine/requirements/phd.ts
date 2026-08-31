// §4 — Requirements for the Doctor of Philosophy Degree.
// Every builder quotes the handbook sentence it implements.
import { resolveRuleRow } from '../../data/assemble.ts';
import { isInProgress, isPassed, meetsGradeFloor } from '../grades.ts';
import { matchDistinctGroups, type GroupCandidate } from '../matching.ts';
import { combineAll, deadlineStatus } from '../status.ts';
import {
  addMonthsIso,
  addYearsIso,
  endOfTerm,
  maxConsecutiveFullTime,
  nthSemester,
  semesterNumber,
  startOfTerm,
  termIndex,
  termLabel,
  termOfDate,
} from '../term.ts';
import type { Grade, RequirementResult, Status } from '../types.ts';
import type { Ctx } from './context.ts';
import { capRow, missingParamDetail, thresholdRow } from './context.ts';
import { fullTimeTermRecords } from './residency.ts';

const COURSEWORK = 'Coursework — §4.2';
const TIME = 'Residence and time — §4.3';
const QUALIFIER = 'Qualifying examination — §4.4';
const CANDIDACY = 'Candidacy examination — §4.5';
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
      sums: ctx.alloc.total,
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
      sums: ctx.alloc.regular,
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
  rows.push(
    capRow({
      id: 'phd.cap.fourk',
      group: COURSEWORK,
      title: 'At most 6 credits from CSE 4xxxx',
      capId: 'fourk',
      capLabel: '40000-level cap credits',
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
      sums: ctx.alloc.ndRegular,
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
  rows.push(msAlongTheWayRow(ctx));
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
  if (wanted === undefined) {
    status = 'cannot_evaluate';
    parts.push(missingParamDetail('phd_seminar_courses'));
  } else {
    const states = wanted.map((id) => {
      const entries = ctx.classified.filter((c) => !c.superseded && c.entry.courseId === id);
      const passed = entries.some((c) => isPassed(c.entry.grade));
      const ip = entries.some((c) => isInProgress(c.entry.grade));
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
    status,
    detail: parts.join('. ') + '.',
    citation: { section: '§4.2', quote },
  };
}

/** §4.2 + §5.2 transfer credit: window, B floor, and the 6/24 caps are enforced
 * by the classifier/allocator; this row reports the result. Every transfer is
 * needs-DGS-review until attested (§5.2 requires DGS + Graduate School approval). */
function transferRow(ctx: Ctx): RequirementResult {
  const quote =
    'Courses from a M.S. degree earned at Notre Dame or another institution within the last five years prior to admission may be used to satisfy the course requirement.';
  const transfers = ctx.classified.filter((c) => c.entry.origin === 'transfer');
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
    status = ctx.student.attestations.transferApproved ? 'met' : 'needs_dgs_review';
    parts.push(
      `${counted} of ${cap} transfer credits counted (§5.2 cap for a ${ctx.student.priorMs === 'completed' ? 'completed prior degree' : 'prior program that was not completed'})`,
    );
    const excluded = ctx.alloc.perCourse.filter(
      (p) => p.course.entry.origin === 'transfer' && p.excluded > 0,
    );
    for (const p of excluded) parts.push(`${p.course.entry.courseId}: ${p.excludedReason ?? 'not counted'}`);
    if (status === 'needs_dgs_review') {
      parts.push('Transfer requires a DGS recommendation and Graduate School approval (§5.2)');
    }
    parts.push('Transferred grades are not included in your GPA (§5.2)');
  }
  return {
    id: 'phd.transfer',
    group: COURSEWORK,
    title: 'Transfer credit from a prior M.S. (within 5 years, B or better)',
    status,
    detail: parts.join('. ') + '.',
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
  if (required === undefined || floor === undefined) {
    status = 'cannot_evaluate';
    detail = missingParamDetail(required === undefined ? 'phd_residency_semesters' : 'fulltime_credits_min');
  } else {
    const run = maxConsecutiveFullTime(fullTimeTermRecords(ctx));
    if (run >= required) {
      status = 'met';
      detail = `${run} consecutive full-time semesters (summers excluded, §4.3).`;
    } else {
      status = 'in_progress';
      detail = `Longest consecutive full-time run so far: ${run} of ${required} semesters (a term is full-time at ${floor}+ entered credits, §2.1.2; summers don't break the run; mark research-heavy terms full-time if needed).`;
    }
  }
  return {
    id: 'phd.residency',
    group: TIME,
    title: 'Four consecutive full-time semesters of residence',
    status,
    detail,
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
    const date = addYearsIso(startOfTerm(ctx.entry).date, years);
    if (othersAllMet) {
      status = 'met';
      detail = `All requirements are complete within the ${years}-year limit.`;
      deadline = { date, approx: true, state: 'done', label: 'Complete' };
    } else if (ctx.today > date) {
      status = 'unmet';
      detail = `Overdue — the ${years}-year limit passed on ${date} (approximate). §4.3: failure to complete within ${years} years forfeits degree eligibility. Talk to the DGS.`;
      deadline = { date, approx: true, state: 'overdue', label: `Overdue since ${date}` };
    } else {
      status = 'in_progress';
      detail = `Complete all requirements by ${date} (approximate — ${years} years from entry).`;
      deadline = { date, approx: true, state: 'upcoming', label: `Due by ${date} (approximate)` };
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
  const parts: string[] = ['Three components: core knowledge (§4.4.1), category specialization (§4.4.2), research (§4.4.3)'];
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
        parts.push('Remember to notify the CSE DGS office by filing the qualifier form (§4.4)');
      }
    } else if (ctx.today > date && !ctx.student.attestations.qualifierExtensionGranted) {
      // Decision Q17b: a deadline past with the work incomplete is unmet, even
      // when a component is still in progress (matching deadlineStatus()).
      status = 'unmet';
      parts.push(
        `Overdue — all three components were due by the end of ${termLabel(term)} (${date}, approximate). The DGS may extend the deadline on a case-by-case basis (§4.4)`,
      );
      deadline = { date, approx: true, state: 'overdue', label: `Overdue — was due by the end of ${termLabel(term)} (approximate)` };
    } else {
      parts.push(`All three components due by the end of ${termLabel(term)} — semester ${semesters} (${date}, approximate)`);
      deadline = { date, approx: true, state: 'upcoming', label: `Due by the end of ${termLabel(term)} (approximate)` };
    }
  }
  return {
    id: 'phd.qualifier',
    group: QUALIFIER,
    title: 'Qualifying examination — all three components',
    status,
    detail: parts.join('. ') + '.',
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
    // it passed — any passing grade (decision Q9). Transfer courses claimed for
    // an area, and "previously passed elsewhere" attestations, count only as
    // needs-DGS-review (decision Q12); the §5.2 window/floor do not apply here
    // ("or have previously passed" is about knowledge, not credit).
    let done: string | undefined;
    let ip: string | undefined;
    let provisional: string | undefined;
    for (const c of ctx.classified) {
      if (c.superseded) continue;
      if (c.entry.origin === 'nd') {
        if (c.rule?.coreArea !== area.code) continue;
        if (isPassed(c.entry.grade)) done = c.entry.courseId;
        else if (isInProgress(c.entry.grade)) ip ??= c.entry.courseId;
      } else if (c.entry.claimedCoreArea === area.code && isPassed(c.entry.grade)) {
        provisional ??= `${c.entry.courseId}${c.entry.institution ? ` (${c.entry.institution})` : ''}`;
      }
    }
    if (ctx.student.attestations.corePassedElsewhere?.includes(area.code as never)) {
      provisional ??= 'passed at a previous institution (your attestation)';
    }
    const status: Status = done ? 'met' : ip ? 'in_progress' : provisional ? 'needs_dgs_review' : 'unmet';
    const detail = done
      ? `Satisfied by ${done}.`
      : ip
        ? `${ip} is in progress.`
        : provisional
          ? `Claimed via ${provisional} — needs DGS confirmation (§4.4.1 allows a course from a previous institution).`
          : `No ${area.name} course yet. Courses tagged for this area in the rules sheet satisfy it; one at a previous institution needs DGS confirmation.`;
    return {
      id: `phd.qualifier.core.${area.code}`,
      group: QUALIFIER,
      title: `Core knowledge: ${area.name}`,
      status,
      detail,
      citation: { section: '§4.4.1', quote },
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
  for (const c of ctx.classified) {
    if (c.superseded || c.entry.origin !== 'nd') continue;
    const group = c.rule?.categoryGroup;
    if (!group) continue;
    const cand: GroupCandidate = {
      courseId: c.entry.courseId,
      title: c.rule?.title ?? c.entry.title ?? '',
      groups: group === 'any' ? allGroups : [group],
      pinned: group === 'any' ? c.entry.assignedGroup : undefined,
      sortKey: `${termIndex(c.entry.term)}|${c.entry.courseId}`,
    };
    if (isInProgress(c.entry.grade)) inProgress.push(cand);
    else if (meetsGradeFloor(c.entry.grade, floor as Grade)) qualifying.push(cand);
    else if (isPassed(c.entry.grade)) belowFloor.push(`${c.entry.courseId} (${c.entry.grade})`);
  }

  const def = matchDistinctGroups(qualifying, allGroups);
  const combined = matchDistinctGroups([...qualifying, ...inProgress], allGroups);

  let status: Status;
  const parts: string[] = [];
  if (def.distinctCount >= groupsReq && qualifying.length >= coursesReq) {
    status = 'met';
    const lines = [...def.assignment.entries()].map(([courseId, g]) => {
      const cand = qualifying.find((q) => q.courseId === courseId);
      const isAny = (cand?.groups.length ?? 0) > 1;
      return `${courseId}${cand?.title ? ` ${cand.title}` : ''} → ${groupName(g)}${isAny ? ' (flexible course — your assignment)' : ''}`;
    });
    parts.push(`${qualifying.length} qualifying courses covering ${def.distinctCount} distinct groups: ${lines.join('; ')}`);
  } else if (combined.distinctCount >= groupsReq && qualifying.length + inProgress.length >= coursesReq) {
    status = 'in_progress';
    parts.push(
      `${qualifying.length} done (${def.distinctCount} distinct groups) with ${inProgress.length} in progress — on track for ${groupsReq} distinct groups`,
    );
  } else {
    status = 'unmet';
    parts.push(
      `${qualifying.length} qualifying course${qualifying.length === 1 ? '' : 's'} covering ${def.distinctCount} distinct group${def.distinctCount === 1 ? '' : 's'} — ${groupsReq} distinct groups and ${coursesReq} courses with a grade of ${floor} or higher are required`,
    );
    if (def.missingGroups.length > 0) {
      parts.push(`still open: ${def.missingGroups.map(groupName).join(', ')}`);
    }
  }
  if (belowFloor.length > 0) {
    parts.push(
      `below the ${floor} floor: ${belowFloor.join(', ')} — you may retake the course to replace the grade or take another course (§4.4.2)`,
    );
  }
  parts.push(...def.suggestions);
  parts.push('The approved list is announced by email at the start of each term');
  return {
    id: 'phd.qualifier.categories',
    group: QUALIFIER,
    title: 'Three specialization courses from three distinct groups, each B or higher',
    status,
    detail: parts.join('. ') + '.',
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
    deadlineLabel: `${months} months after entry (${date})`,
    extensionGranted: ctx.student.attestations.qualifierExtensionGranted,
  });
  const detail =
    r.status === 'met'
      ? `Research qualifier passed ${ctx.student.milestones.researchQualifierPassed}.`
      : r.status === 'needs_dgs_review'
        ? `Passed ${ctx.student.milestones.researchQualifierPassed}, ${r.lateNote}.`
        : r.status === 'unmet'
          ? `Overdue — the advisor's determination was due within ${months} months of entry (${date}, approximate). Talk to your advisor and the DGS.`
          : `The research advisor's determination (Research-Qualifier form) is due within ${months} months of entry — by ${date} (approximate).`;
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
  const committee = ctx.params.number('candidacy_committee_additional_members_min');
  if (sem === undefined) {
    return {
      id: 'phd.candidacy',
      group: CANDIDACY,
      title: 'Candidacy examination (dissertation proposal) passed',
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
    deadlineLabel: `the end of ${termLabel(term)} — semester ${sem} (${date})`,
  });
  const parts: string[] = [];
  if (r.status === 'met') parts.push(`Candidacy exam passed ${ctx.student.milestones.candidacyPassed}`);
  else if (r.status === 'needs_dgs_review')
    parts.push(`Passed ${ctx.student.milestones.candidacyPassed}, ${r.lateNote ?? ''}`);
  else if (r.status === 'unmet')
    parts.push(`Overdue — the exam was due before the end of ${termLabel(term)} (semester ${sem}; ${date}, approximate). Talk to the DGS`);
  else parts.push(`Due by the end of ${termLabel(term)} — semester ${sem} (${date}, approximate)`);
  parts.push(
    'All Ph.D. coursework must be completed, or in progress the same semester, before the exam (§4.5)',
  );
  parts.push(
    `Committee: your advisor (and co-advisor if any) plus at least ${committee ?? 3} additional voting members, approved by the DGS (§4.5)`,
  );
  return {
    id: 'phd.candidacy',
    group: CANDIDACY,
    title: 'Candidacy examination (dissertation proposal) passed',
    status: r.status,
    detail: parts.join('. ') + '.',
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
        : 'Not yet: after the advisor approves, the candidacy-committee readers get two to four weeks and must approve unanimously (§4.6).',
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
  return {
    id: 'phd.msAlongTheWay',
    group: CANDIDACY,
    title: 'MSCSE awarded along the way (information)',
    status: passed ? 'met' : 'not_applicable',
    informational: true,
    detail: passed
      ? `You passed candidacy ${passed} — ask the Graduate Program Coordinator about receiving the MSCSE (§4.5).`
      : 'Passing the candidacy exam can also earn you the MSCSE degree (§4.5) — no action needed now.',
    citation: { section: '§4.5', quote },
  };
}
