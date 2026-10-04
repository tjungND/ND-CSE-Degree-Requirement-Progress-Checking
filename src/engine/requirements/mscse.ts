// §3 — Requirements for the Master of Science Degree (MSCSE).
// Every builder quotes the handbook sentence it implements.
import { openDeadline } from '../status.ts';
import { compareTerm, deadlineTermLabel, endOfNextSemester, endOfTerm, termLabel } from '../term.ts';
import type { DeadlineInfo, DetailPart, RequirementResult, Status } from '../types.ts';
import type { Ctx } from './context.ts';
import { defendedBelowGpaNote } from './shared.ts';
import { noteOf, joinedDetail, capRow, countedCourseIds, courseContributions, defendGpaNote, pendingCourseIds, missingParamDetail, provisionalRegularIds, thresholdRow, timeLimitDate, timeLimitRow } from './context.ts';
import { candidacyFormSentence } from './phd.ts';
import { fullTimeTermRecords, graduateLevelParts } from './residency.ts';
import { transferRow } from './transfer.ts';

const COURSEWORK = 'Coursework — §3.2';
const ALLOWANCES = 'Allowances — §3.2, §3.5'; // meters, not verdicts (DGS 2026-09-27)
const TIME = 'Residence and time — §3.3';
const PROJECT_THESIS = 'M.S. project or thesis — §3.4';

// The whole §3.2 sentence, "earned at Notre Dame" included — the clause the
// engine applies to a transferred project/thesis course (policy review
// 2026-10-03, P1-page-text-engine-5: the quote used to stop at "(CSE 68901).").
const REGULAR_QUOTE =
  'The MSCSE degree requires a minimum of twenty-four (24) credit hours of regular courses and six (6) credits hours of Masters project (CSE 68902) or Masters thesis direction (CSE 68901) earned at Notre Dame.';

export function mscseRows(ctx: Ctx): RequirementResult[] {
  const rows: RequirementResult[] = [];
  const provisionalRegular = provisionalRegularIds(ctx);

  // §3.2: "The graduate school requires a total of thirty (30) credits of
  // courses and research for the M.S. degree." Only passed courses count
  // toward the total (DGS decision 2026-08-31).
  rows.push(
    thresholdRow({
      id: 'ms.credits.total',
      group: COURSEWORK,
      title: '30 total credits of courses and research',
      shortTitle: '30 total credits',
      sums: ctx.alloc.total,
      satisfiedBy: countedCourseIds(ctx, (p) => p.countedRegular + p.countedOther),
      pendingBy: pendingCourseIds(ctx, (p) => p.countedRegular + p.countedOther),
      contributions: courseContributions(ctx, (p) => p.countedRegular + p.countedOther),
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
      shortTitle: '24 regular-course credits',
      sums: ctx.alloc.regular,
      satisfiedBy: countedCourseIds(ctx, (p) => p.countedRegular),
      pendingBy: pendingCourseIds(ctx, (p) => p.countedRegular),
      contributions: courseContributions(ctx, (p) => p.countedRegular),
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
      shortTitle: 'Project/thesis (6 cr)',
      sums: ctx.alloc.project,
      satisfiedBy: countedCourseIds(ctx, (p) => (p.course.pool === 'project' ? p.countedOther : 0)),
      pendingBy: pendingCourseIds(ctx, (p) => (p.course.pool === 'project' ? p.countedOther : 0)),
      contributions: courseContributions(ctx, (p) => (p.course.pool === 'project' ? p.countedOther : 0)),
      required: ctx.params.number('ms_project_credits_min'),
      requiredKey: 'ms_project_credits_min',
      section: '§3.2',
      quote: REGULAR_QUOTE,
      extraDetail: ['Register for CSE 68902 (project) or CSE 68901 (thesis direction)'],
      extraDetailWhenShort: true,
    }),
  );

  // §5.2's cap on credit brought in from an earlier program — nine credits
  // with a completed master's, six with one that was not finished. The cap was
  // always enforced; this row is what says so (DGS 2026-09-11), and it is the
  // Ph.D.'s own row with the master's parameter key.
  rows.push(
    transferRow(ctx, {
      id: 'ms.transfer',
      group: COURSEWORK,
      capKeyCompleted: 'ms_transfer_completed_ms_credits_max',
      section: '§3.2, §5.2',
    }),
  );

  // §3.2 (September 2026 edition): "Up to six (6) credits at the 40000 level
  // may count toward both the graduate school's 30-credit requirement and the
  // department's 24-credit regular course requirement, subject to approval by
  // the advisor and the ADGS." Per the DGS (2026-08-31): CSE 4xxxx only,
  // counted inside the 24; non-CSE 40000-level courses do not count at all.
  // The same six credits also carry any CSE 50000-level course the rules
  // sheet permits (DGS 2026-09-09) — the sheet's permission does not lift
  // §3.2's limit. The approval clause is new (2026-10-02): the row reads
  // Conditionally met while a course it admits still waits for it.
  rows.push(
    capRow({
      id: 'ms.cap.fourk',
      group: ALLOWANCES,
      title: 'At most 6 credits from CSE courses below the 60000 level',
      capId: 'fourk',
      capLabel: 'credits below the 60000 level',
      limitKey: 'ms_4xxxx_credits_max',
      section: '§3.2',
      quote:
        'Up to six (6) credits at the 40000 level may count toward both the graduate school’s 30-credit requirement and the department’s 24-credit regular course requirement, subject to approval by the advisor and the ADGS.',
      ctx,
      approvalDriven: true,
    }),
  );

  // §3.5, through the DGS (2026-09-10): "an ND 4+1 student can have up to 6
  // credits (whether 40xxx or 60xxx courses) counted towards both degrees."
  // The 40000-level sharing is not in §3.5's text nor the Academic Code's: it
  // is the Graduate School's written answer to the DGS (email, Maureen
  // Collins, 2026-09-10; DGS 2026-10-03, P1-units-4plus1-12), for ANY Notre
  // Dame undergraduate, subject to the Courses tab's verdict on each course —
  // so the row says where the rule comes from. The row appears only for a
  // student who has such a course.
  if (ctx.classified.some((c) => c.caps.includes('sharedbs'))) {
    rows.push(
      capRow({
        id: 'ms.cap.sharedbs',
        group: ALLOWANCES,
        title: 'At most 6 credits shared with your bachelor\u2019s degree',
        capId: 'sharedbs',
        capLabel: 'credits shared with your bachelor\u2019s degree',
        limitKey: 'ms_bs_double_count_credits_max',
        section: '\u00a73.5',
        quote:
          'With approval of the instructor and DGS, students in the integrated B.S. + M.S. program may, over the second semester of their junior year and their senior year, take one or two 3-credit CSE regular courses at the 60000 level or higher, and count these both as undergraduate CSE electives/Tech electives and as course requirements for the MSCSE degree. — §3.5 names 60000-level courses; that up to six credits of 40000-level CSE courses may count toward both degrees too, subject to the course rules, is the Graduate School’s written answer (email, 2026-09-10)',
        ctx,
        // "With approval of the instructor and DGS" — §3.5's own first words,
        // quoted on this card. A shared course still waiting on an approval no
        // longer leaves the row reading Met (interface review R3, 2026-09-18).
        approvalDriven: true,
      }),
    );
  }

  // §3.2 (September 2026 edition): "Up to nine (9) credits at the 60000 level
  // or higher taken from a department other than CSE may count toward both the
  // graduate school's 30-credit requirement and the department's 24-credit
  // regular course requirement, subject to approval by the advisor and the
  // ADGS." The level floor is new in the text (2026-10-02) but not in the
  // engine: non-CSE courses below the 60000 level have never counted for the
  // MSCSE (DGS 2026-08-31, allocate.ts).
  rows.push(
    capRow({
      id: 'ms.cap.noncse',
      group: ALLOWANCES,
      title: 'At most 9 credits from outside CSE (60000 level or higher)',
      capId: 'noncse',
      capLabel: 'non-CSE allowance credits',
      limitKey: 'ms_noncse_credits_max',
      section: '§3.2',
      quote:
        'Up to nine (9) credits at the 60000 level or higher taken from a department other than CSE may count toward both the graduate school’s 30-credit requirement and the department’s 24-credit regular course requirement, subject to approval by the advisor and the ADGS.',
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
  // The semesters are the fact; how they are counted is a note (DGS 2026-10-03).
  const parts: DetailPart[] = [];
  let satisfied: string[] = [];
  if (floor === undefined) {
    status = 'cannot_evaluate';
    parts.push(missingParamDetail('fulltime_credits_min'));
  } else if (fullTime.length > 0) {
    status = 'met';
    parts.push(`Full-time in ${fullTime.map((r) => termLabel(r.term)).join(', ')}`, { note: `Full-time means ${floor} or more registered credits in the semester (§2.1.2)` });
    if (fullTime.some((r) => r.term.season === 'summer')) parts.push({ note: 'A summer session counts with any registration after a full-time academic-year semester (Academic Code §3.6)' });
    satisfied = fullTime.map((r) => termLabel(r.term));
  } else {
    status = 'in_progress';
    // A summer session counts too (§3.3 "or for one summer session"): the
    // Academic Code (§3.6) treats a student who was full-time in the academic
    // year as full-time in the summer with any registration — the engine
    // applies that; the nine credits are "per semester" (policy review 2026-10-03).
    parts.push(
      'No full-time semester yet',
      { note: `A semester counts once the courses you entered for it add up to ${floor} credits (§2.1.2); if you were full-time on research, tick that semester under Your standing (Full-time terms)` },
      { note: 'A summer session counts with any registration after a full-time academic-year semester (Academic Code §3.6)' },
    );
  }
  const withdrawnOnly = records.filter((r) => r.withdrawnOnly).map((r) => termLabel(r.term));
  if (withdrawnOnly.length > 0) parts.push(`${withdrawnOnly.join(', ')}: every course withdrawn — not counted`, { note: 'If you were registered full-time at census, tick the semester under Full-time terms, or ask the DGS' });
  // Academic Code §4.1 (policy review 2026-10-03, P1-residency-enrollment-c5).
  const belowGraduate = graduateLevelParts(records, floor);
  if (belowGraduate.length > 0) {
    parts.push(...belowGraduate);
    if (status === 'met') status = 'needs_dgs_review';
  }
  return {
    id: 'ms.residency',
    group: TIME,
    title: 'One semester of full-time status (or one summer session)',
    status,
    ...joinedDetail(parts),
    ...(satisfied.length > 0 ? { satisfiedBy: satisfied } : {}),
    citation: { section: '§3.3', quote },
  };
}

/** §3.3: "Failure to complete all requirements for the M.S. degree within
 * 5 years results in forfeiture of degree eligibility." */
export function msTimeLimitRow(ctx: Ctx, others: { allMet: boolean; anyCannotEvaluate: boolean }): RequirementResult {
  const quote =
    'Failure to complete all requirements for the M.S. degree within 5 years results in forfeiture of degree eligibility.';
  // The same row as the Ph.D.'s, with the master's key and quote — and the
  // thesis defense or project report as the last dated requirement (policy
  // review 2026-10-03: a defense after the limit used to close the row).
  const m = ctx.student.milestones;
  const completedOn = [m.thesisDefensePassed, m.projectReportAccepted].filter((d): d is string => d !== undefined).sort().pop();
  return timeLimitRow(ctx, others, {
    id: 'ms.timeLimit',
    group: TIME,
    title: 'All requirements complete within 5 years',
    yearsKey: 'ms_time_limit_years',
    section: '§3.3',
    quote,
    completedOn,
  });
}

/** Which §3.4 route the record itself shows (2026-09-12): a Master's project
 * course or an accepted project report → project; thesis direction or a
 * defense → thesis; both or neither → undefined. The
 * page pre-fills "Project or thesis option" from this and says so; the
 * student's own choice always wins. */
export function inferMsOption(student: Ctx['student']): 'project' | 'thesis' | undefined {
  const m = student.milestones;
  const ids = new Set(student.courses.map((c) => c.courseId.toUpperCase().replace(/\s+/g, ' ')));
  const project = ids.has('CSE 68902') || m.projectReportAccepted !== undefined;
  const thesis = ids.has('CSE 68901') || m.thesisDefensePassed !== undefined;
  if (project && !thesis) return 'project';
  if (thesis && !project) return 'thesis';
  return undefined;
}

function optionRows(ctx: Ctx): RequirementResult[] {
  const rows: RequirementResult[] = [];
  const chosen = ctx.student.msOption ?? 'undecided';
  const option = chosen === 'undecided' ? (inferMsOption(ctx.student) ?? 'undecided') : chosen;
  const m = ctx.student.milestones;
  // While no route is chosen or visible, the two rows are ALTERNATIVES (§3.4:
  // "in one of two ways"): either finished satisfies both (F4, 2026-09-12).
  const eitherDone = option === 'undecided' && (m.thesisDefensePassed !== undefined || m.projectReportAccepted !== undefined);
  const alternative: DetailPart[] = option === 'undecided' ? [{ note: 'Either route satisfies §3.4 — pick yours under Your standing' }] : [];
  // §3.3: "Failure to complete all requirements for the M.S. degree within 5
  // years results in forfeiture of degree eligibility." A thesis defense or a
  // project report dated after the limit cannot simply read Met — the same
  // guard the Ph.D. defense has had since 2026-09-13 (policy review 2026-10-03).
  const years = ctx.params.number('ms_time_limit_years');
  const limitDate = years === undefined ? undefined : timeLimitDate(ctx, years);
  const late = (date: string | undefined): boolean => limitDate !== undefined && date !== undefined && date > limitDate;
  // When it was late is the fact; what that means is a note (DGS 2026-10-03).
  const lateFact = ` — after the ${years}-year limit, which passed at ${limitDate === undefined ? '' : deadlineTermLabel(limitDate)} (approximate)`;
  const lateRule: DetailPart = { note: '§3.3 makes that a forfeiture of degree eligibility unless the Graduate School granted an extension, so confirm it with the DGS' };
  // The master's degree needs admission to master's candidacy — a Graduate
  // School form by its calendar deadline (Academic Code §6.1.6) — said once
  // the route is complete (policy review 2026-10-03).
  const formNote: DetailPart = { note: candidacyFormSentence(ctx, 'master’s') };
  // Academic Code §6.1.5 (policy review 2026-10-04, P2-ac-5b-6.1-11; DGS:
  // "apply the suggested handling"): "By the end of the term following
  // completion of the coursework required by the program, the degree
  // candidate must have taken an oral and/or written master's examination" —
  // for CSE, the project report or the thesis defense, the "equivalent
  // requirement in lieu" (DGS Handbook §3.21.2). Once the 24 regular-course
  // credits are complete, the term after the last of them; past its end with
  // neither route dated, an open route row says so. No status changes.
  const regularMin = ctx.params.number('ms_regular_credits_min');
  const lastRegular =
    regularMin !== undefined && ctx.alloc.regular.definite >= regularMin
      ? ctx.classified
          .filter((c) => c.pool === 'regular' && c.tier === 'definite' && !c.superseded && c.ineligibleReason === undefined)
          .map((c) => c.entry.term)
          .sort(compareTerm)
          .pop()
      : undefined;
  const examDue = lastRegular ? endOfNextSemester(endOfTerm(lastRegular).date, 1) : undefined;
  const examNote: DetailPart[] =
    examDue !== undefined && ctx.today > examDue && !m.thesisDefensePassed && !m.projectReportAccepted
      ? [{ note: `Academic Code §6.1.5 expects the master’s examination — for CSE, the project report or the thesis defense — by the end of the term after your coursework, here ${deadlineTermLabel(examDue)} (approximate); confirm your timeline with the DGS` }]
      : [];

  if (option === 'thesis' || option === 'undecided') {
    // §3.4: "Upon acceptance of the thesis by the thesis defense examination
    // committee (advisor and two readers), the student must successfully pass
    // the oral thesis defense examination."
    const quote =
      'Upon acceptance of the thesis by the thesis defense examination committee (advisor and two readers), the student must successfully pass the oral thesis defense examination.';
    let status: Status;
    let parts: DetailPart[];
    const lateDefense = late(m.thesisDefensePassed);
    // §2.2 for a thesis defense already dated (policy review 2026-10-03,
    // P1-gpa-10): passed while the cumulative GPA was below the minimum goes to
    // the DGS rather than reading Met. (§2.2 names the thesis; the project
    // report below is not gated.)
    const gpaAtDefense = m.thesisDefensePassed ? defendedBelowGpaNote(ctx) : '';
    // A failed first attempt (Academic Code §6.1.5, policy review 2026-10-04,
    // P2-ac-5b-6.1-12): "Failure in either one or both parts of the
    // examination results in automatic forfeiture of degree eligibility,
    // unless the program recommends a retake" — one retake, "by the end of the
    // following semester". The retake decision is the program's, so the row
    // says so and dates the window; a missed window reads Overdue.
    const failedOn = m.thesisDefenseFailed;
    const retakeDue = failedOn ? endOfNextSemester(failedOn, 1) : undefined;
    const retakeRule = 'Academic Code §6.1.5: a failed master’s examination forfeits degree eligibility unless the program recommends a retake; only one retake is allowed, by the end of the following semester — the DGS decides';
    let deadline: DeadlineInfo | undefined;
    if (m.thesisDefensePassed || eitherDone) {
      status = lateDefense || gpaAtDefense !== '' ? 'needs_dgs_review' : 'met';
      const retakeLate = failedOn !== undefined && retakeDue !== undefined && m.thesisDefensePassed !== undefined && m.thesisDefensePassed > retakeDue;
      if (retakeLate) status = 'needs_dgs_review';
      parts = m.thesisDefensePassed
        ? [
            // No readers' date of its own since 2026-10-04 (DGS: "Apply the
            // same to MSCSE thesis") — the defense stands for both.
            `Thesis defense passed ${m.thesisDefensePassed}${failedOn ? ` — the retake, after a failed attempt on ${failedOn}` : ''}${lateDefense ? lateFact : ''}`,
            ...(lateDefense ? [lateRule] : []),
            ...(retakeLate ? [{ note: `The retake was due by ${deadlineTermLabel(retakeDue!)} (approximate), the end of the semester after the fail (Academic Code §6.1.5) — confirm with the DGS` }] : []),
            ...noteOf(gpaAtDefense),
            ...(lateDefense ? [] : [formNote]),
          ]
        : [`Not needed — the project route is complete (project report accepted ${m.projectReportAccepted})`, ...alternative];
    } else if (failedOn !== undefined && retakeDue !== undefined) {
      if (ctx.today <= retakeDue) {
        status = 'in_progress';
        parts = [`Thesis defense failed ${failedOn} — one retake allowed`, { note: retakeRule }, ...alternative];
        deadline = openDeadline(retakeDue, ctx.today, `Retake due by ${deadlineTermLabel(retakeDue)} (approximate)`);
      } else {
        status = 'unmet';
        parts = [`Thesis defense failed ${failedOn}, and no retake is recorded`, { note: `${retakeRule}; talk to the DGS` }, ...alternative];
        deadline = { date: retakeDue, approx: true, state: 'overdue', label: `Overdue — the retake was due by ${deadlineTermLabel(retakeDue)} (approximate)` };
      }
    } else {
      status = 'unmet';
      parts = ['Not yet passed', ...alternative, ...noteOf(defendGpaNote(ctx)), ...examNote];
    }
    rows.push({
      id: 'ms.thesis.defense',
      group: PROJECT_THESIS,
      title: 'Thesis accepted and oral defense passed (thesis option)',
      status,
      ...(lateDefense ? { statusLabel: 'Eligibility at risk' } : {}),
      ...joinedDetail(parts),
      ...(deadline ? { deadline } : {}),
      citation: { section: '§3.4', quote },
    });
  }

  if (option === 'project' || option === 'undecided') {
    // §3.4: "The project report and deliverables must be accepted and approved
    // by the advisor to satisfy the project requirement."
    const quote =
      'The project report and deliverables must be accepted and approved by the advisor to satisfy the project requirement.';
    const lateReport = late(m.projectReportAccepted);
    rows.push({
      id: 'ms.project.report',
      group: PROJECT_THESIS,
      title: 'Project report accepted by the advisor (project option)',
      status: m.projectReportAccepted || eitherDone ? (lateReport ? 'needs_dgs_review' : 'met') : 'unmet',
      ...(lateReport ? { statusLabel: 'Eligibility at risk' } : {}),
      ...joinedDetail(
        m.projectReportAccepted
          ? [`Project report accepted ${m.projectReportAccepted}${lateReport ? lateFact : ''}`, lateReport ? lateRule : formNote]
          : eitherDone
            ? [`Not needed — the thesis route is complete (defense passed ${m.thesisDefensePassed})`, ...alternative]
            : ['Not yet accepted', { note: 'The written project report and deliverables must be accepted and approved by your advisor (§3.4)' }, ...alternative, ...examNote],
      ),
      citation: { section: '§3.4', quote },
    });
  }
  return rows;
}
