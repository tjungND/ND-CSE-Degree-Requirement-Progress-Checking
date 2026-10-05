// §4 — Requirements for the Doctor of Philosophy Degree.
// Every builder quotes the handbook sentence it implements.
import { formatCredits } from '../credits.ts';
import { isNotreDameInstitution } from '../../data/external.ts';
import { coreTitleMatchesArea } from '../core-title.ts';
import { isInProgress, isPassed, meetsGradeFloor, passesCreditFloor } from '../grades.ts';
import { matchDistinctGroups, type GroupCandidate } from '../matching.ts';
import { usableGpa } from '../ranges.ts';
import { shortName } from '../short-names.ts';
import { combineAll, deadlineStatus, openDeadline } from '../status.ts';
import { addMonthsIso, addYearsIso, deadlineTerm, deadlineTermLabel, endOfNextSemester, endOfTerm, maxConsecutiveFullTime, nthSemester, semesterNumber, startOfTerm, termIndex, termLabel, termOfDate, compareTerm } from '../term.ts';
import type { DetailPart, Grade, RequirementResult, Status, Term, DeadlineInfo } from '../types.ts';
import type { Ctx } from './context.ts';
import { noteOf, capRow, clockShiftNote, defenseRegistrationNote, courseContributions, defendGpaNote, joinedDetail, missingParamDetail, provisionalRegularIds, thresholdRow, timeLimitDate, timeLimitRow, countedCourseIds, pendingCourseIds } from './context.ts';
import { fullTimeTermRecords, graduateLevelParts, longestFullTimeRun } from './residency.ts';
import { advisorTttState, defendedBelowGpaNote, gpaText, msCandidacyApplicationRow, otherDegreeCapRow } from './shared.ts';
import { transferRow } from './transfer.ts';
import { spentOnBachelorsAndMasters } from '../allocate.ts';

/** How many additional semesters the DGS granted under §4.4 (DGS 2026-10-03:
 * any number; the older tick box reads as one). */
export function qualifierExtensionSemesters(ctx: Ctx): number {
  const a = ctx.student.attestations;
  const n = a.qualifierExtensionSemesters;
  if (n !== undefined && Number.isFinite(n) && n > 0) return Math.floor(n);
  return a.qualifierExtensionGranted ? 1 : 0;
}

/** Admission to candidacy needs the Graduate School's own form by its calendar
 * deadline (Academic Code §6.1.6 / §6.2.9: "It is the student's responsibility
 * to apply for admission by submitting the appropriate form"). The dates
 * change every year and are not in the rules sheet; a display-only
 * `candidacy_form_deadlines` row may carry this year's (policy review 2026-10-03). */
export function candidacyFormSentence(ctx: Ctx, degree: 'doctoral' | 'master’s'): string {
  const dates = ctx.rules.parameters.raw.get('candidacy_form_deadlines')?.value.trim();
  return `Admission to ${degree} candidacy also needs the Graduate School’s application form, submitted through the Grad Admin by the Graduate School calendar’s deadline for that semester${dates ? ` (${dates})` : ''} (Academic Code ${degree === 'doctoral' ? '§6.2.9' : '§6.1.6'})`;
}

const COURSEWORK = 'Coursework — §4.2';
const ALLOWANCES = 'Allowances — §4.2'; // meters, not verdicts (DGS 2026-09-27)
const TIME = 'Residence and time — §4.3';
const QUALIFIER = 'Qualifying examination — §4.4';
// The DGS's name for the §4.5 examination (2026-09-06); the handbook quotes
// below stay verbatim. "and candidacy" since admission to candidacy became a
// row of its own (DGS 2026-10-04).
const CANDIDACY = 'Oral Candidacy Exam (OCE) and candidacy — §4.5';
const DISSERTATION = 'Dissertation and defense — §4.7';

/** Taken at Notre Dame for §4.2's nine: in this program, or in the student's
 * own Notre Dame MSCSE (DGS 2026-09-22). */
const atNotreDame = (c: { entry: { origin: string }; ndMastersCredit?: true }): boolean => c.entry.origin === 'nd' || c.ndMastersCredit === true;

export function phdRows(ctx: Ctx): RequirementResult[] {
  const rows: RequirementResult[] = [];
  const provisionalRegular = provisionalRegularIds(ctx);

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
      contributions: courseContributions(ctx, (p) => p.countedRegular + p.countedOther),
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
      // The title names the allowance the department reads into the next
      // sentence (red-team wording table, DGS 2026-09-12): a student planning
      // from the title alone should not plan against a floor the app does not
      // enforce.
      // The allowance left the title on 2026-09-27 (DGS: it wrapped to three
      // lines everywhere) for a sentence on every unmet card; the cap card
      // states it permanently.
      title: 'At least 24 credits of regular courses at the 60000 level or higher',
      shortTitle: '24 regular-course credits',
      extraDetail: [`Up to ${ctx.params.number('phd_4xxxx_cse_credits_max') ?? 'a limited number of'} approved CSE 4xxxx credits may count inside these (§4.2)`],
      sums: ctx.alloc.regular,
      satisfiedBy: countedCourseIds(ctx, (p) => p.countedRegular),
      pendingBy: pendingCourseIds(ctx, (p) => p.countedRegular),
      contributions: courseContributions(ctx, (p) => p.countedRegular),
      required: ctx.params.number('phd_regular_credits_min'),
      requiredKey: 'phd_regular_credits_min',
      section: '§4.2',
      quote:
        'The CSE department requires a minimum of twenty-four (24) credit hours of regular courses at the 60000 level or higher.',
      provisionalCourses: provisionalRegular,
    }),
  );

  rows.push(seminarRow(ctx));

  // §4.2 (September 2026 edition): "Up to six (6) credits from CSE 4xxxx may
  // count toward both the graduate school's 60-credit requirement and the
  // department's 24-credit regular course requirement, subject to approval of
  // the student's advisor and DGS." The handbook's allowance names the 40000
  // level; the DGS applies the SAME six credits to any CSE course below the
  // 60000 level the rules sheet permits, 50000-level bridge courses included
  // (2026-09-09): a sheet cell saying a course may count toward the degree is
  // a permission, not an exemption from §4.2's other limits.
  rows.push(
    capRow({
      id: 'phd.cap.fourk',
      group: ALLOWANCES,
      title: 'At most 6 credits from CSE courses below the 60000 level',
      capId: 'fourk',
      capLabel: 'credits below the 60000 level',
      limitKey: 'phd_4xxxx_cse_credits_max',
      section: '§4.2',
      quote:
        "Up to six (6) credits from CSE 4xxxx may count toward both the graduate school's 60-credit requirement and the department's 24-credit regular course requirement, subject to approval of the student's advisor and DGS.",
      ctx,
      // "subject to approval of the student's advisor and DGS" — the sentence
      // this row quotes to the student. The row used to read Met while naming
      // the very courses awaiting that approval (interface review R3,
      // 2026-09-18); it now reads as conditionally satisfied until they have
      // it, exactly as the non-CSE cap below already did.
      approvalDriven: true,
    }),
  );

  // §4.2 (September 2026 edition): "Up to nine (9) credits at the 60000 level
  // or higher taken from a department other than CSE may be used to satisfy
  // the course requirement, subject to approval of the student's advisor and
  // DGS."
  rows.push(
    capRow({
      id: 'phd.cap.noncse',
      group: ALLOWANCES,
      title: 'At most 9 credits from outside CSE (60000 level or higher)',
      capId: 'noncse',
      capLabel: 'non-CSE allowance credits',
      limitKey: 'phd_noncse_6xxxx_credits_max',
      section: '§4.2',
      quote:
        "Up to nine (9) credits at the 60000 level or higher taken from a department other than CSE may be used to satisfy the course requirement, subject to approval of the student's advisor and DGS.",
      ctx,
      approvalDriven: true,
    }),
  );

  // §4.2 (September 2026 edition): "Regardless of any credits transferred, all
  // Ph.D. students must take at least nine (9) credits of regular courses at
  // Notre Dame in order to satisfy the qualifying examination described in
  // section 4.4." (The July text lacked "of regular courses"; the DGS's
  // 2026-09-11 reading is now the handbook's own — P1-page-text-engine-3.)
  rows.push(
    thresholdRow({
      id: 'phd.credits.nd',
      group: COURSEWORK,
      // Regular-course credits only (DGS 2026-09-11: "the 9 credits at ND
      // should be regular classes") — research and seminar credits taken at
      // Notre Dame do not satisfy this, and the title says so.
      title: 'At least 9 credits of regular courses taken at Notre Dame',
      shortTitle: '9 regular credits at ND',
      sums: ctx.alloc.ndRegular,
      pendingBy: pendingCourseIds(ctx, (p) => (atNotreDame(p.course) && p.course.pool === 'regular' ? p.countedRegular : 0)),
      contributions: courseContributions(ctx, (p) => (atNotreDame(p.course) && p.course.pool === 'regular' ? p.countedRegular : 0)),
      satisfiedBy: countedCourseIds(ctx, (p) => (atNotreDame(p.course) && p.course.pool === 'regular' ? p.countedRegular : 0)),
      required: ctx.params.number('phd_nd_credits_min'),
      requiredKey: 'phd_nd_credits_min',
      section: '§4.2',
      quote:
        'Regardless of any credits transferred, all Ph.D. students must take at least nine (9) credits of regular courses at Notre Dame in order to satisfy the qualifying examination described in section 4.4.',
      // Notre Dame coursework from BEFORE this program: a 4+1's undergraduate
      // 60000-level courses count toward the 60 and the 24 but not toward
      // these nine (DGS 2026-09-13: "it does not count towards the nine new
      // credits that need to be earned at Notre Dame during the degree
      // program"); the regular courses of the student's own Notre Dame MSCSE
      // DO count here (DGS 2026-09-22: "The regular courses taken at ND during
      // the MSCSE should count"). Said out loud only when the student actually
      // has undergraduate coursework of that kind, so a shortfall does not
      // read as a data-entry problem they could fix.
      extraDetail: ctx.classified.some(
        (c) => c.entry.origin === 'transfer' && isNotreDameInstitution(c.entry.institution) && !c.ndMastersCredit && c.pool === 'regular' && c.ineligibleReason === undefined,
      )
        ? ['Notre Dame coursework you took as an undergraduate counts toward the 60 and the 24, but not here: these nine are graduate credits earned at Notre Dame — in the Ph.D., or in your Notre Dame MSCSE, which the Graduate School treats as the same graduate program (§4.2)']
        : undefined,
    }),
  );

  // The Graduate School, through the DGS (2026-09-22): "Only up to 6 credits
  // may double-count towards two degrees. If 6 credits have double-counted to
  // BS & MS, no more credits can double-count to BS & PhD later when the
  // student pursues PhD." The row appears only for a student with a course
  // that draws on it — Notre Dame coursework their bachelor's degree used.
  if (ctx.classified.some((c) => c.caps.includes('sharedbs'))) {
    const spent = spentOnBachelorsAndMasters(ctx.student);
    const base = ctx.params.number('ms_bs_double_count_credits_max');
    rows.push(
      capRow({
        id: 'phd.cap.sharedbs',
        group: ALLOWANCES,
        title: 'At most 6 credits counted toward two degrees (your bachelor’s and the Ph.D.)',
        capId: 'sharedbs',
        capLabel: 'credits that may still count toward both your bachelor’s degree and the Ph.D.',
        limitKey: 'ms_bs_double_count_credits_max',
        section: 'Graduate School (2026-09-22 answer)',
        quote:
          'Only up to 6 credits may double-count towards two degrees. If 6 credits have double-counted to BS & MS, no more credits can double-count to BS & PhD later when the student pursues PhD. (The Graduate School’s answer to the department, through the DGS, 2026-09-22 — Academic Code §4.6 writes the six-credit exception for an integrated bachelor’s/master’s program only, so each such course waits for the DGS’s confirmation.)',
        ctx,
        approvalDriven: true,
        extraDetail:
          spent > 0 && base !== undefined
            ? [
                base - spent <= 0
                  ? `All ${formatCredits(base)} shared credits were used by the courses you said counted toward both your bachelor’s degree and your MSCSE, so none can also count toward the Ph.D.`
                  : `${formatCredits(spent)} of the ${formatCredits(base)} credits were used by the courses you said counted toward both your bachelor’s degree and your MSCSE, so ${formatCredits(base - spent)} ${base - spent === 1 ? 'credit' : 'credits'} can still count toward both your bachelor’s degree and the Ph.D.`,
              ]
            : undefined,
      }),
    );
  }

  // Academic Code §2.2's nine credits shared with a second Notre Dame
  // degree the student is enrolled in at the same time (policy review
  // 2026-10-04, P2-ac-1-3-2) — shown only when a course draws on it.
  const otherDegree = otherDegreeCapRow(ctx, { id: 'phd.cap.otherdegree', group: ALLOWANCES });
  if (otherDegree) rows.push(otherDegree);

  rows.push(transferRow(ctx, { id: 'phd.transfer', group: COURSEWORK, capKeyCompleted: 'phd_transfer_completed_ms_credits_max', section: '§4.2, §5.2' }));
  rows.push(residencyRow(ctx));

  // The five parts carry their own pills but the umbrella is what the
  // headline counts (DGS 2026-09-27: it counted the qualifier six times).
  const qualifierChildren = [...coreRows(ctx), categoriesRow(ctx), researchQualifierRow(ctx)].map((c) => ({ ...c, unscored: true as const }));
  // §4.4's four semesters bind EVERY component (DGS 2026-09-29: a core area
  // still open after the umbrella's deadline read "In progress" while the
  // umbrella read "Overdue"): each open component carries the umbrella's
  // deadline, and reads Overdue once it has passed. The research component
  // keeps its own, earlier, §4.4.3 deadline.
  const qualifierDue = qualifierDeadline(ctx);
  // §4.2 conditions the qualifier on nine regular credits at Notre Dame (F3,
  // 2026-09-12): the umbrella cannot read "met" while that row is not.
  if (qualifierPassedUnderPriorRules(ctx)) {
    // The qualifier rule changed several times in four years (DGS
    // 2026-09-21): a student in their third year or later may attest that
    // they passed the examination under the requirements in force at the
    // time. The examination is then complete — the Grad Admin's record is
    // what counts — and the current rule's three components do not apply.
    rows.push(...qualifierRowsPassedUnderPriorRules(ctx, qualifierChildren));
  } else {
    const dated = qualifierChildren.map((c) => withQualifierDeadline(c, qualifierDue));
    rows.push(qualifierUmbrellaRow(ctx, dated, rows.find((r) => r.id === 'phd.credits.nd'), qualifierDue));
    rows.push(...dated);
  }
  // One card for the three (DGS 2026-10-04: "These seem to overlap. Can they
  // be merged into one card?"): admission to candidacy lists the OCE and the
  // RCR training among its conditions, so their rows are kept — the emails
  // and the milestone dates read them — but shown inside the admission card
  // and not counted on their own.
  // The OCE waits for the coursework (CSE §4.5; DGS 2026-10-05: the 24
  // regular-course credits and the qualifier's core-knowledge and
  // specialization courses, completed or finishing this semester). Until then
  // the OCE and admission read Not started (DGS 2026-10-04).
  const ready = oceCourseworkReady(ctx, rows);
  const rcr = rcrRow(ctx);
  const oce = candidacyRow(ctx, ready);
  rows.push({ ...rcr, unscored: true, mergedInto: 'phd.candidacyAdmission' });
  rows.push({ ...oce, unscored: true, mergedInto: 'phd.candidacyAdmission' });
  rows.push(candidacyAdmissionRow(ctx, { oce, rcr, courseworkReady: ready }));
  rows.push(...dissertationRows(ctx));
  // §4.5's MSCSE cannot be earned twice. A Ph.D. student who already holds the
  // Notre Dame MSCSE (their master's before this program) has no along-the-way
  // row at all — showing it would offer them a degree they hold and count
  // their credits from zero toward it (DGS 2026-09-09).
  if (ctx.student.ndMasters === undefined) {
    const along = msAlongTheWayRow(ctx);
    rows.push(along);
    // The MSCSE along the way needs the master's candidacy application too
    // (DGS Handbook §3.21.1; 2026-10-04): shown once the award's
    // requirements are met, or once dated.
    const candidacy = msCandidacyApplicationRow(ctx, { group: CANDIDACY, ready: along.status === 'met', alongTheWay: true });
    if (candidacy) rows.push(candidacy);
  }
  return rows;
}

/** The attestation stands only for a student in their third year or later
 * (DGS 2026-09-21): the fifth semester after entry has begun. A ticked box on
 * a record whose entry term is later than that is ignored (and audit() warns). */
export function qualifierPriorRulesEligible(entry: Term, todayIso: string): boolean {
  return compareTerm(termOfDate(todayIso), nthSemester(entry, 5)) >= 0;
}
export function qualifierPassedUnderPriorRules(ctx: Ctx): boolean {
  return ctx.student.attestations.qualifierPassedUnderPriorRules === true && qualifierPriorRulesEligible(ctx.entry, ctx.today);
}
function qualifierRowsPassedUnderPriorRules(ctx: Ctx, children: RequirementResult[]): RequirementResult[] {
  // No quote (DGS 2026-10-03, P1-page-text-engine-7: "Do not quote anything.
  // Just state that those who passed the qualifier under earlier rules are not
  // subject to the new rules."). The card used to show a paraphrase as if it
  // were §4.4's own sentence; the exemption is the DGS's (2026-09-21), so it
  // is stated as a note that names the section, and the citation carries no
  // quote (report.ts then prints none).
  const umbrella: RequirementResult = {
    id: 'phd.qualifier',
    group: QUALIFIER,
    title: 'Qualifying examination — all components',
    status: 'met',
    ...joinedDetail([
      'Passed under the earlier qualifier requirements, as you attested under “Approvals you already have”',
      { note: 'Students who passed the qualifying examination under the earlier rules are not subject to the current requirements of §4.4 (DGS 2026-09-21)' },
      { note: 'The Grad Admin’s record of the examination is what counts' },
      ...(ctx.student.milestones.qualifierFormFiled ? [] : [{ note: 'If the completion form is not on file, file it with the Grad Admin (§4.4)' }]),
    ]),
    deadline: { date: ctx.today, approx: true, state: 'done', label: 'Complete' },
    citation: { section: '§4.4', quote: '' },
  };
  const components = children.map((c) => ({
    ...c,
    status: 'not_applicable' as const,
    detail: 'Not required: the qualifying examination was passed under the earlier requirements (your attestation).',
    deadline: undefined,
  }));
  return [umbrella, ...components];
}

/** §4.2: "Two credits of Research Seminar (CSE 63801 and CSE 63802) are
 * required and expected to be taken during the ﬁrst year of the program."
 *
 * The first year is a requirement, not only an expectation (DGS 2026-10-04,
 * P1-sheet-9: "Make this a requirement."): both seminars are due by the end of
 * the program's second semester — counted from the Ph.D.'s own start, the
 * transfer term for a student who came from the MSCSE (DGS 2026-10-03, with
 * the §4.4 qualifier clocks). "The first year" is the handbook's own phrase,
 * so its two semesters are written here, not on the sheet. A seminar passed
 * after that goes to the DGS; a missing one reads Overdue once it is past. */
function seminarRow(ctx: Ctx): RequirementResult {
  const quote =
    'Two credits of Research Seminar (CSE 63801 and CSE 63802) are required and expected to be taken during the first year of the program.';
  const wanted = ctx.params.courseList('phd_seminar_courses');
  let status: Status;
  const parts: DetailPart[] = [];
  const satisfied: string[] = [];
  let deadline: DeadlineInfo | undefined;
  if (wanted === undefined) {
    status = 'cannot_evaluate';
    parts.push(missingParamDetail('phd_seminar_courses'));
  } else {
    const dueTerm = nthSemester(ctx.qualifierEntry, 2);
    const dueDate = endOfTerm(dueTerm).date;
    const dueLabel = `the end of ${termLabel(dueTerm)} — the first year`;
    const passedIn: Term[] = [];
    const states = wanted.map((id) => {
      const entries = ctx.classified.filter((c) => !c.superseded && c.entry.courseId === id);
      // §4.2 names this a credit requirement (2 credits), so a passed grade
      // below C does not satisfy it either (Academic Code §4.3, DGS decision
      // 2026-09-12) — unlike §4.4.1 core knowledge, which only asks "passed".
      // A seminar entry the allocator refused (an unrecognised duplicate, a
      // lapsed Incomplete) does not satisfy it either (policy review 2026-10-03).
      const passedEntry = entries.find((c) => passesCreditFloor(c.entry.grade) && isPassed(c.entry.grade) && c.ineligibleReason === undefined);
      const ip = entries.some((c) => isInProgress(c.entry.grade) && !c.incompleteLapsed);
      if (passedEntry) {
        satisfied.push(id);
        passedIn.push(passedEntry.entry.term);
      }
      // The semester it was taken (DGS 2026-09-22, for the advisor summary):
      // "CSE 63801: done (Fall 2026)".
      const taken = passedEntry ?? entries.find((c) => isInProgress(c.entry.grade));
      parts.push(`${id}: ${passedEntry ? 'done' : ip ? 'in progress' : 'not yet'}${taken ? ` (${termLabel(taken.entry.term)})` : ''}`);
      return passedEntry ? 'met' : ip ? 'in_progress' : 'unmet';
    });
    const transferNote: DetailPart[] =
      compareTerm(ctx.qualifierEntry, ctx.entry) !== 0
        ? [{ note: `The first year is counted from your transfer into the Ph.D. in ${termLabel(ctx.qualifierEntry)}` }]
        : [];
    if (states.every((x) => x === 'met')) {
      // Done: on time when the later of the two was passed by the end of the
      // first year; after it, the DGS confirms.
      const last = passedIn.reduce((a, b) => (compareTerm(a, b) >= 0 ? a : b));
      if (compareTerm(last, dueTerm) <= 0) {
        status = 'met';
        deadline = { date: dueDate, approx: true, state: 'done', label: `Done ${termLabel(last)}` };
      } else {
        status = 'needs_dgs_review';
        deadline = { date: dueDate, approx: true, state: 'done', label: `Done ${termLabel(last)} — after ${dueLabel}` };
        parts.push({ note: `Taken after ${dueLabel} (approximate) — §4.2 requires both seminars in the first year of the program; confirm with the DGS` }, ...transferNote);
      }
    } else if (ctx.today > dueDate) {
      status = 'unmet';
      deadline = { date: dueDate, approx: true, state: 'overdue', label: `Overdue — was due by ${dueLabel} (approximate)` };
      parts.push({ note: '§4.2 requires both seminars in the first year of the program; talk to the DGS about taking the missing one' }, ...transferNote);
    } else {
      status = states.every((x) => x !== 'unmet') ? 'in_progress' : 'unmet';
      deadline = openDeadline(dueDate, ctx.today, `Due by ${dueLabel} (approximate)`);
      parts.push(...transferNote);
    }
  }
  return {
    id: 'phd.seminar',
    group: COURSEWORK,
    title: '2 credits of Research Seminar in year one',
    shortTitle: 'Research seminar (2 cr)',
    status,
    ...joinedDetail(parts),
    ...(deadline ? { deadline } : {}),
    ...(satisfied.length > 0 ? { satisfiedBy: satisfied } : {}),
    citation: { section: '§4.2', quote },
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
  // The semesters of the run are the fact; how a run counts and restarts is a
  // note (DGS 2026-10-03).
  const parts: DetailPart[] = [];
  let satisfied: string[] = [];
  if (required === undefined || floor === undefined) {
    status = 'cannot_evaluate';
    parts.push(missingParamDetail(required === undefined ? 'phd_residency_semesters' : 'fulltime_credits_min'));
  } else {
    const records = fullTimeTermRecords(ctx);
    const run = maxConsecutiveFullTime(records);
    const runTerms = longestFullTimeRun(records).map((t) => termLabel(t));
    if (run >= required) {
      status = 'met';
      parts.push(`${run} consecutive full-time semesters: ${runTerms.join(', ')}`, { note: 'Summer sessions do not count toward the run (§4.3)' });
      satisfied = runTerms;
    } else {
      status = 'in_progress';
      parts.push(`Longest consecutive full-time run so far: ${run} of ${required} semesters${run > 0 ? ` (${runTerms.join(', ')})` : ''}`);
    }
    // A semester of nothing but withdrawals is a full withdrawal, not a
    // semester of residence — and a missed fall or spring needs readmission
    // (Academic Code §3.1/§3.5; DGS Handbook §3.3: the program "may require the
    // student to reapply … and reject some or all past credits"). Said, since
    // the run restarts silently otherwise (policy review 2026-10-03).
    const withdrawnOnly = records.filter((r) => r.withdrawnOnly).map((r) => termLabel(r.term));
    if (withdrawnOnly.length > 0) parts.push(`${withdrawnOnly.join(', ')}: every course withdrawn — not counted as residence`, { note: 'If you were registered full-time at census, tick the semester under Full-time terms, or ask the DGS' });
    // Academic Code §4.1's three graduate-level credits a semester (policy
    // review 2026-10-03, P1-residency-enrollment-c5): the semester still
    // counts, the row goes to the DGS.
    const belowGraduate = graduateLevelParts(records, floor);
    if (belowGraduate.length > 0) {
      parts.push(...belowGraduate);
      if (status === 'met') status = 'needs_dgs_review';
    }
    if (status === 'in_progress' && run > 0 && records.some((r) => r.term.season !== 'summer' && !r.fullTime)) {
      parts.push({ note: 'A fall or spring semester that was not full-time restarts the run; a semester not registered at all needs readmission through the department and the Graduate School (Academic Code §3.1), which may reject earlier credits (DGS Handbook §3.3) — ask the DGS' });
      // The Graduate School's own residency rule is "normally full-time status
      // for four semesters" (Academic Code §6.2.2) — consecutiveness comes from
      // §4.3 and the DGS Handbook's candidacy list (§3.22.3) — so a broken run
      // is where an exception can matter (DGS 2026-10-03, P1-residency-enrollment-7:
      // "the row could note that the Graduate School's rule says 'normally'").
      parts.push({ note: 'The Graduate School’s own rule asks for four full-time semesters “normally” (Academic Code §6.2.2), so an exception is possible — ask the DGS' });
    }
    // A leave (policy review 2026-10-04, P2-ac-5a-3; DECISIONS 2026-08-31:
    // "An approved leave currently breaks the run and the report says so").
    // The record has the number of leave semesters, not which ones, so the
    // row says what a leave does and the review request asks the DGS.
    const leaves = ctx.student.leaveSemesters ?? 0;
    if (status === 'in_progress' && leaves > 0) {
      parts.push({
        note: `You were on an approved leave for ${leaves} ${leaves === 1 ? 'semester' : 'semesters'}: a leave ends the consecutive run, and the four consecutive full-time semesters restart after it. The Graduate School says a leave “stops the student’s eligibility clock” (DGS Handbook §3.7.2), so whether the run may continue across it is the DGS’s call — this is in the review request`,
      });
    }
  }
  return {
    id: 'phd.residency',
    group: TIME,
    title: 'Four consecutive full-time semesters of residence',
    status,
    ...joinedDetail(parts),
    ...(satisfied.length > 0 ? { satisfiedBy: satisfied } : {}),
    citation: { section: '§4.3', quote },
  };
}

/** §4.3: "Failure to complete all requirements for the Ph.D. degree within
 * eight (8) years results in forfeiture of degree eligibility." */
export function phdTimeLimitRow(ctx: Ctx, others: { allMet: boolean; anyCannotEvaluate: boolean }): RequirementResult {
  const quote =
    'Failure to complete all requirements for the Ph.D. degree within eight (8) years results in forfeiture of degree eligibility.';
  // The last requirement is the OFFICIAL SUBMISSION (Academic Code §6.2.6:
  // "including the dissertation, its defense, and the official submission
  // within eight years") — the defense alone no longer closes the row
  // (policy review 2026-10-03).
  const m = ctx.student.milestones;
  const completedOn = [m.dissertationSubmitted, m.defensePassed].filter((d): d is string => d !== undefined).sort().pop();
  return timeLimitRow(ctx, others, {
    id: 'phd.timeLimit',
    group: TIME,
    title: 'All requirements complete within 8 years',
    yearsKey: 'phd_time_limit_years',
    section: '§4.3',
    quote,
    completedOn,
    // DGS Handbook §4.1 (policy review 2026-10-04, P2-dh-4-5-1; DGS: "Apply
    // the suggested handling" — with "whether the MSCSE years count is not the
    // DGS's call. It's the graduate school's call"): University funding needs
    // "academic good standing (i.e., GPA of 3.0 or higher, a dissertation
    // proposal approved within eight semesters, graduate enrollment at Notre
    // Dame fewer than eight years)". Notes only — the app gives no funding
    // verdict: it cannot see registration, probation letters or the Graduate
    // School's own counting.
    funding: {
      whenDue: { note: 'The Graduate School also ties University funding to academic good standing, which includes graduate enrollment at Notre Dame of fewer than eight years (DGS Handbook §4.1)' },
      // After a Notre Dame master's (policy review 2026-10-04, P2-dh-4-5-3;
      // DGS: "Apply the suggested handling"). DGS Handbook §4.1: "Students
      // progressing from a master's degree to a Ph.D. degree within the same
      // program will not have their funding eligibility reset. Students who
      // complete a master's degree at Notre Dame and then enroll in a separate
      // Ph.D. program are eligible for full support in the Ph.D. program."
      // Whether the CSE Ph.D. is "separate" from the CSE MSCSE is the Graduate
      // School's call (DGS 2026-10-04, on P2-dh-4-5-1), so the note says so.
      ...(ctx.student.background?.graduate === 'nd-mscse-transfer'
        ? {
            always: {
              note: `For funding, a move from the master’s to the Ph.D. within the same program does not reset funding eligibility (DGS Handbook §4.1), so your funding years count from ${termLabel(ctx.entry)}, when you started the MSCSE — as the degree’s clocks do`,
            },
          }
        : ctx.student.ndMasters !== undefined
          ? {
              always: {
                note: 'For funding, the Graduate School counts your total graduate enrollment at Notre Dame — “fewer than eight years” (DGS Handbook §4.1) — so the years of your Notre Dame MSCSE may count toward the eight. A student who finishes a master’s at Notre Dame and then enrolls in a separate Ph.D. program is eligible for full support (DGS Handbook §4.1); whether the CSE Ph.D. is separate from the CSE MSCSE, and so whether those years count, is the Graduate School’s call. The degree’s own eight years count from your Ph.D. entry',
              },
            }
          : {}),
    },
  });
}

/** §4.4: "Students must complete all three components of the qualiﬁer
 * requirement within four (4) semesters of starting; the DGS may extend the
 * deadline on a case-by-case basis." */
/** The §4.4 deadline — "within four (4) semesters of starting", plus the
 * DGS's ONE-semester extension (2026-09-13) — computed once for the umbrella
 * and its components. Undefined while the rules sheet lacks the parameter. */
export interface QualifierDeadline {
  term: Term;
  extendedTerm?: Term;
  effectiveDate: string;
  passed: boolean;
  /** The chip: overdue once passed, else open (due soon / upcoming). */
  deadline: DeadlineInfo;
}
export function qualifierDeadline(ctx: Ctx): QualifierDeadline | undefined {
  const semesters = ctx.params.number('qualifier_deadline_semesters');
  if (semesters === undefined) return undefined;
  // "Within four (4) semesters of starting" — the Ph.D.'s start, which for a
  // transfer from the MSCSE is the term of the transfer (DGS 2026-10-03).
  const term = nthSemester(ctx.qualifierEntry, semesters);
  const date = endOfTerm(term).date;
  // §4.4's extension is a number of additional semesters (DGS 2026-09-13: one
  // at a time; 2026-10-03: "any number") — the terms after the four, not an
  // open-ended waiver. Once the last of them is over the row goes overdue
  // like any other.
  const extra = qualifierExtensionSemesters(ctx);
  const extendedTerm = extra > 0 ? nthSemester(ctx.qualifierEntry, semesters + extra) : undefined;
  const effectiveDate = extendedTerm ? endOfTerm(extendedTerm).date : date;
  const passed = ctx.today > effectiveDate;
  const extensionWord = extra === 1 ? 'one-semester' : `${extra}-semester`;
  const deadline: DeadlineInfo = passed
    ? {
        date: effectiveDate,
        approx: true,
        state: 'overdue',
        label: extendedTerm
          ? `Overdue — the DGS’s ${extensionWord} extension ran out at the end of ${termLabel(extendedTerm)} (approximate)`
          : `Overdue — was due by the end of ${termLabel(term)} (approximate)`,
      }
    : extendedTerm
      ? openDeadline(effectiveDate, ctx.today, `Due by the end of ${termLabel(extendedTerm)} — the DGS’s ${extensionWord} extension (approximate)`)
      : openDeadline(date, ctx.today, `Due by the end of ${termLabel(term)} (approximate)`);
  return { term, extendedTerm, effectiveDate, passed, deadline };
}

/** A component of the qualifier under the umbrella's deadline (DGS
 * 2026-09-29): an open core-knowledge or specialization row carries the same
 * chip as the umbrella and, once the deadline has passed, reads Overdue —
 * decision Q17b as for the umbrella: in progress is not done. A met,
 * conditionally met or unevaluable row is left alone, and so is the research
 * component, whose own §4.4.3 deadline comes first. */
function withQualifierDeadline(c: RequirementResult, due: QualifierDeadline | undefined): RequirementResult {
  if (due === undefined || c.id === 'phd.qualifier.research') return c;
  if (c.status !== 'unmet' && c.status !== 'in_progress') return c;
  return { ...c, ...(due.passed ? { status: 'unmet' as const } : {}), deadline: due.deadline };
}

function qualifierUmbrellaRow(ctx: Ctx, children: RequirementResult[], ndCredits: RequirementResult | undefined, due: QualifierDeadline | undefined): RequirementResult {
  const quote =
    'Students must complete all three components of the qualifier requirement within four (4) semesters of starting; the DGS may extend the deadline on a case-by-case basis.';
  let status = combineAll([...children.map((c) => c.status), ...(ndCredits ? [ndCredits.status] : [])]);
  // The standing first (DGS 2026-09-27): how many parts are done and which
  // are still open — the first sentence used to describe the page layout.
  const partName = (c: RequirementResult): string =>
    c.id === 'phd.qualifier.categories' ? 'specialization (§4.4.2)' : c.id === 'phd.qualifier.research' ? 'the research component (§4.4.3)' : `${c.title.replace(/^Core knowledge:\s*/, '')} core knowledge (§4.4.1)`;
  const open = children.filter((c) => c.status !== 'met');
  // The standing is the fact; everything else is a note (DGS 2026-10-03).
  const parts: DetailPart[] = [
    `${children.length - open.length} of ${children.length} parts done${open.length > 0 ? ` — still open: ${open.map(partName).join(', ')}` : ''}`,
    { note: 'One card per part below' },
  ];
  if (ndCredits && ndCredits.status !== 'met') {
    // §4.2: "all Ph.D. students must take at least nine (9) credits of regular
    // courses at Notre Dame in order to satisfy the qualifying examination". Said once (trim
    // review 2026-09-18, P-24); the tail is the credits row's own first sentence.
    parts.push({ note: `§4.2 also requires at least nine credits of regular courses taken at Notre Dame before the examination — ${ndCredits.detail.split('.')[0]}` });
  }
  let deadline: RequirementResult['deadline'];
  if (due === undefined) {
    status = 'cannot_evaluate';
    parts.push(missingParamDetail('qualifier_deadline_semesters'));
  } else {
    const { term, extendedTerm, effectiveDate, passed } = due;
    if (status === 'met') {
      deadline = { date: effectiveDate, approx: true, state: 'done', label: 'Complete' };
      if (!ctx.student.milestones.qualifierFormFiled) {
        parts.push({ note: 'Remember to file the qualifier completion form with the Grad Admin (§4.4)' });
      }
    } else if (passed) {
      // Decision Q17b: a deadline past with the work incomplete is unmet, even
      // when a component is still in progress (matching deadlineStatus()).
      // A deadline cannot make a MISSING PARAMETER into a missed requirement,
      // though (red-team 2026-09-13): "cannot evaluate" survives the override,
      // so a blank rules-sheet cell never reads as "overdue — forfeiture".
      if (status === 'cannot_evaluate') {
        parts.push(`The deadline (${extendedTerm ? `the DGS’s extension, the end of ${termLabel(extendedTerm)}` : `the end of ${termLabel(term)}`}) has passed, but a component above cannot be evaluated until the rules sheet is complete — so this row cannot be judged either`);
      } else {
        status = 'unmet';
        // The deadline chip carries the when (2026-09-03).
        parts.push({ note: 'Overdue — talk to the DGS' });
      }
      deadline = due.deadline;
    } else {
      deadline = due.deadline;
      if (extendedTerm) {
        const extra = qualifierExtensionSemesters(ctx);
        parts.push({ note: `Deadline extended by ${extra === 1 ? 'one semester' : `${extra} semesters`} by the DGS — now the end of ${termLabel(extendedTerm)}; a further extension is the DGS’s to grant` });
      }
      if (compareTerm(ctx.qualifierEntry, ctx.entry) !== 0) parts.push({ note: `The four semesters are counted from your transfer into the Ph.D. in ${termLabel(ctx.qualifierEntry)} (§4.4 “of starting”; DGS 2026-10-03)` });
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
          else if (isInProgress(c.entry.grade) && !c.incompleteLapsed) ip ??= c.entry.courseId; // a lapsed Incomplete is an F until the Graduate School says otherwise (2026-10-03)
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
    // The course id alone (the detail may add "(Purdue University)" etc.).
    const bareId = (s: string) => s.replace(/ \(.*\)$/, '');
    // Which course satisfies it is the fact; why it may is a note (DGS 2026-10-03).
    const detailParts: DetailPart[] = done
      ? [`Satisfied by ${done}`]
      : confirmed
        ? [`Satisfied by ${confirmed} — confirmed in the DGS’s course rules`, { note: '§4.4.1 allows a course from a previous institution' }]
        : ip
          ? [`${ip} is in progress`]
          : pending
            ? [`Pending review: ${pending}`, { note: `Its title suggests ${area.name}, and the DGS can confirm it (§4.4.1) via the review request` }]
            : [`No ${area.name} course yet`];
    return {
      id: `phd.qualifier.core.${area.code}`,
      group: QUALIFIER,
      title: `Core knowledge: ${area.name}`,
      shortTitle: `Core: ${shortName(area.name)}`,
      status,
      ...joinedDetail(detailParts),
      citation: { section: '§4.4.1', quote },
      ...(status === 'met' ? { satisfiedBy: [bareId((done ?? confirmed)!)] } : {}),
      // In progress, or waiting on the DGS: it will satisfy this area, and the
      // course's own line says so (2026-09-08).
      ...(status !== 'met' && (ip ?? pending) ? { pendingBy: [bareId((ip ?? pending)!)] } : {}),
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
    if (c.entry.origin !== 'nd') {
      if (!isNotreDameInstitution(c.entry.institution)) continue;
      // A course taken BEFORE the bachelor's degree — §3.5's junior/senior-year
      // 6xxxx courses — brings no credit into the Ph.D. while §5.2 criterion 2
      // is read strictly, but it still counts here (DGS 2026-09-10, evening:
      // "they can still be used to satisfy the core knowledge and
      // specialization category requirements in the qualifying exam
      // requirement"). §4.4.2 asks the student to have taken and passed the
      // course, and neither component of the qualifier is credit.
      // …and since 2026-09-11 that reading covers ALL Notre Dame coursework,
      // whenever it was taken (DGS: "4.4.2 is satisfied by the courses taken
      // at ND (whether during BS, MSCSE, or PhD) even though the courses do
      // not count towards the credit requirements of PhD"). A prior Notre
      // Dame course no longer waits for its §5.2 transfer, is not dropped for
      // falling over the §5.2 cap, and is not dropped for being outside the
      // five-year window or below the transfer grade floor — §4.4.2 has its
      // own grade floor, applied below like everyone else's.
    }
    // The sheet may name one group, several, or `any` (DGS 2026-09-08).
    // 'ineligible' and a blank cell are both "not a candidate"; a code the
    // Categories tab does not list is dropped defensively, so a stale sheet
    // value can never inflate the count.
    const listed = c.rule?.categoryGroups;
    if (!listed || listed.length === 0) continue;
    const groups = listed.filter((g) => allGroups.includes(g));
    if (groups.length === 0) continue;
    const cand: GroupCandidate = {
      courseId: c.entry.courseId,
      title: c.rule?.title ?? c.entry.title ?? '',
      groups,
      // The student's own choice applies whenever the course leaves one open.
      pinned: groups.length > 1 ? c.entry.assignedGroup : undefined,
      sortKey: `${termIndex(c.entry.term)}|${c.entry.courseId}`,
    };
    if (isInProgress(c.entry.grade)) {
      if (!c.incompleteLapsed) inProgress.push(cand); // a lapsed Incomplete is an F until the Graduate School says otherwise (2026-10-03)
    } else if (meetsGradeFloor(c.entry.grade, floor as Grade)) qualifying.push(cand);
    else if (isPassed(c.entry.grade)) belowFloor.push(`${c.entry.courseId} (${c.entry.grade})`);
  }

  const flexible = new Set([...qualifying, ...inProgress].filter((c) => c.groups.length > 1).map((c) => c.courseId));
  const def = matchDistinctGroups(qualifying, allGroups);
  const combined = matchDistinctGroups([...qualifying, ...inProgress], allGroups);

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
  } else {
    // Which course fills which group — and which course in progress may fill
    // which (DGS 2026-10-02: "show which courses satisfy which categories, and
    // which in-progress courses may satisfy which categories"). One matching
    // over both, the passed courses placed FIRST: an augmenting-path matching
    // never unmatches a course once matched, so every group a passed course
    // holds today is the group it is shown under, and the courses in progress
    // fill what is left.
    const display = matchDistinctGroups(
      [...qualifying.map((c) => ({ ...c, sortKey: `0|${c.sortKey}` })), ...inProgress.map((c) => ({ ...c, sortKey: `1|${c.sortKey}` }))],
      allGroups,
    );
    const item = (short: boolean, cand: GroupCandidate, done: boolean): string => {
      const nameOf = (g: string) => (short ? shortName(groupName(g)) : groupName(g));
      const g = display.assignment.get(cand.courseId);
      const head = `${cand.courseId}${cand.title ? ` ${cand.title}` : ''} → ${g ? nameOf(g) : cand.groups.map(nameOf).join(' or ')}`;
      const flex = g && cand.groups.length > 1 ? ' (flexible course — your assignment)' : '';
      if (done) return g ? `${head}${flex}` : `${head} — that group is already covered`;
      return g ? `${head}${flex} — in progress; counts with a ${floor} or higher` : `${head} — in progress; that group is already covered`;
    };
    const items = (short: boolean) => [...qualifying.map((c) => item(short, c, true)), ...inProgress.map((c) => item(short, c, false))];
    // The course-by-course list behind a selector on the card (DGS
    // 2026-10-04: "hide these details with a selector"); the lead stays.
    const fold = `Which course fills which group (${qualifying.length + inProgress.length})`;
    const withItems = (lead: string) => (qualifying.length + inProgress.length > 0 ? add({ lead, items: items(false), fold }, { lead, items: items(true), fold }) : add(lead));
    if (combined.distinctCount >= groupsReq && qualifying.length + inProgress.length >= coursesReq) {
      status = 'in_progress';
      // How many of the courses in progress are needed — the ones the matching
      // gives a group of their own — not how many there are (2026-10-02).
      const needed = inProgress.filter((c) => display.assignment.has(c.courseId)).length;
      withItems(
        `${qualifying.length} of ${coursesReq} done, in ${def.distinctCount} different group${def.distinctCount === 1 ? '' : 's'}; ${needed === inProgress.length ? `the ${inProgress.length === 1 ? 'course' : `${inProgress.length} courses`} in progress would complete it` : `${needed} of the ${inProgress.length} courses in progress would complete it`}`,
      );
    } else {
      status = 'unmet';
      // What is covered, and which groups are still open, are the facts; the
      // rule is a note (DGS 2026-10-03).
      withItems(`${qualifying.length} qualifying course${qualifying.length === 1 ? '' : 's'} covering ${def.distinctCount} distinct group${def.distinctCount === 1 ? '' : 's'}`);
      if (def.missingGroups.length > 0) {
        add(
          `still open: ${def.missingGroups.map(groupName).join(', ')}`,
          `still open: ${def.missingGroups.map((g) => shortName(groupName(g))).join(', ')}`,
        );
      }
      add({ note: `${groupsReq} distinct groups and ${coursesReq} courses with a grade of ${floor} or higher are required (§4.4.2)` });
    }
  }
  if (belowFloor.length > 0) {
    add({ note: `${belowFloor.join(', ')} ${belowFloor.length === 1 ? 'is' : 'are'} below the ${floor} floor — retake ${belowFloor.length === 1 ? 'it' : 'them'} or take another course (§4.4.2)` });
  }
  for (const suggestion of def.suggestions) add({ note: suggestion });
  // "The approved course list is on the course rules page" left the row on
  // 2026-09-26 (clarity review): the "See the specialization categories →"
  // link directly above the detail is that pointer (2026-09-04).
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
    // The coverage-maximising pick per flexible course (F2, 2026-09-12) — the
    // page pre-fills an unset group from it and tells the student.
    // Read off the matching over passed AND in-progress courses (like
    // `groupChoices`), so a course still being taken is placed too.
    ...(flexible.size > 0 ? { groupAssignments: Object.fromEntries([...combined.bestAssignment].filter(([id]) => flexible.has(id))) } : {}),
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
  // "Of the student entering the program" — the Ph.D.'s start, which for a
  // transfer from the MSCSE is the term of the transfer (DGS 2026-10-03).
  const date = addMonthsIso(startOfTerm(ctx.qualifierEntry).date, months);
  // §4.4's extension, in semesters (DGS 2026-09-13: one at a time; 2026-10-03:
  // any number) — here, the end of the Nth fall/spring term after the one the
  // 18-month mark falls in.
  const extra = qualifierExtensionSemesters(ctx);
  const extendedDate = extra > 0 ? endOfNextSemester(date, extra) : undefined;
  const m = ctx.student.milestones;
  const r = deadlineStatus({
    doneOn: m.researchQualifierPassed,
    deadline: { date, approx: true },
    today: ctx.today,
    // A semester, not a date (DGS request 2026-09-05): 18 months after a fall
    // entry lands in the middle of the second spring — "mid-Spring 2028".
    deadlineLabel: `${deadlineTerm(date).when === 'during' ? `mid-${termLabel(deadlineTerm(date).term)}` : deadlineTermLabel(date)} — ${months} months after entry`,
    extension: extendedDate ? { date: extendedDate, label: deadlineTermLabel(extendedDate), semesters: extra } : undefined,
  });
  // A FAIL inside the 18 months satisfies §4.4.3's timing — "the research
  // advisor must determine whether the student has passed or failed" — and
  // starts the DGS committee's clock: "forming a final judgement on the case
  // within 6 months" (policy review 2026-10-03). While that window is open
  // the row is in progress against the committee's date; past it with no
  // pass recorded, the DGS is asked rather than a bare Overdue.
  const failedOn = m.researchQualifierFailed;
  const remediationDue = failedOn !== undefined ? addMonthsIso(failedOn, 6) : undefined;
  let status = r.status;
  let deadline = r.deadline;
  // Passed, failed or not yet filed is the fact; why late and what to do are
  // notes (DGS 2026-10-03).
  const upper = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
  let parts: DetailPart[] =
    r.status === 'met'
      ? // A pass inside the DGS's extension is met, and says so: the record
        // keeps how late it was rather than reading like an on-time pass
        // (DGS 2026-09-13).
        [`Research qualifier passed ${m.researchQualifierPassed}${r.lateNote ? ` — ${r.lateNote}` : ''}`]
      : r.status === 'needs_dgs_review'
        ? [`Passed ${m.researchQualifierPassed}`, ...(r.lateNote ? [{ note: upper(r.lateNote) }] : [])]
        : r.status === 'unmet'
          ? // The deadline chip carries the when; the pill says Overdue.
            [{ note: 'Overdue — talk to your advisor and the DGS' }]
          : ['The advisor’s Research-Qualifier form is not filed yet'];
  // A pass recorded AFTER a fail is measured against the committee's six
  // months, not the 18: the fail met §4.4.3's timing and started the
  // committee's clock (2026-10-03), so a pass inside those six months is on
  // time — it used to go to the DGS asking to "confirm the DGS extended the
  // deadline", an extension the student never needed (review of the
  // Milestones deadlines, 2026-10-04). A pass dated before the fail, or one
  // the 18 months (or the DGS's extension) already covers, is unchanged.
  if (m.researchQualifierPassed && failedOn && remediationDue && failedOn <= m.researchQualifierPassed && r.status !== 'met') {
    const afterFail = deadlineStatus({
      doneOn: m.researchQualifierPassed,
      deadline: { date: remediationDue, approx: true },
      today: ctx.today,
      deadlineLabel: `${deadlineTerm(remediationDue).when === 'during' ? `mid-${termLabel(deadlineTerm(remediationDue).term)}` : deadlineTermLabel(remediationDue)} — six months after the fail`,
      lateWording: 'after the DGS’s committee’s six months; confirm the outcome with the DGS (§4.4.3)',
    });
    status = afterFail.status;
    deadline = afterFail.deadline;
    parts =
      afterFail.status === 'met'
        ? [`Research qualifier passed ${m.researchQualifierPassed} — after a fail on ${failedOn}, within the DGS’s committee’s six months`]
        : [`Passed ${m.researchQualifierPassed}`, ...(afterFail.lateNote ? [{ note: upper(afterFail.lateNote) }] : [])];
  }
  if (m.researchQualifierPassed === undefined && failedOn !== undefined && remediationDue !== undefined) {
    const inWindow = ctx.today <= remediationDue;
    if (inWindow) {
      status = 'in_progress';
      parts = [
        `Research component failed ${failedOn} — remediation under way`,
        { note: `The DGS’s committee decides within six months, by ${deadlineTerm(remediationDue).when === 'during' ? `mid-${termLabel(deadlineTerm(remediationDue).term)}` : deadlineTermLabel(remediationDue)} (§4.4.3)` },
      ];
      deadline = openDeadline(remediationDue, ctx.today, `Committee’s judgement due by ${deadlineTermLabel(remediationDue)} — six months after the fail (approximate)`);
    } else {
      status = 'needs_dgs_review';
      parts = [
        `Research component failed ${failedOn}, and the committee’s six months ran out at ${deadlineTermLabel(remediationDue)} (approximate) with no pass recorded`,
        { note: 'Confirm the outcome with the DGS (§4.4.3)' },
      ];
      deadline = { date: remediationDue, approx: true, state: 'overdue', label: `The committee’s six months ran out at ${deadlineTermLabel(remediationDue)}` };
    }
  }
  if (status !== 'met' && compareTerm(ctx.qualifierEntry, ctx.entry) !== 0) parts.push({ note: `The ${months} months are counted from your transfer into the Ph.D. in ${termLabel(ctx.qualifierEntry)} (DGS 2026-10-03)` });
  return {
    id: 'phd.qualifier.research',
    group: QUALIFIER,
    title: 'Research component: a significant research contribution',
    status,
    ...joinedDetail(parts),
    deadline,
    citation: { section: '§4.4.3', quote },
  };
}

/** Academic Code §6.2.4: "the Graduate School requires all Ph.D. students to
 * complete any and all training modules for the Responsible Conduct of Research
 * and Ethics requirements." The DGS Handbook (§3.22.3) lists them among the
 * conditions for admission to candidacy. Not in the CSE handbook — the
 * citation is the Code's (policy review 2026-10-03). */
function rcrRow(ctx: Ctx): RequirementResult {
  const quote =
    'As part of its holistic approach to graduate education, the Graduate School requires all Ph.D. students to complete any and all training modules for the Responsible Conduct of Research and Ethics requirements.';
  const done = ctx.student.milestones.rcrTrainingCompleted;
  return {
    id: 'phd.rcr',
    group: CANDIDACY,
    title: 'Responsible Conduct of Research and ethics training complete',
    shortTitle: 'RCR training',
    status: done ? 'met' : 'in_progress',
    // The date is the fact; the instruction is a note (DGS 2026-10-03).
    ...joinedDetail(done ? [`Completed ${done}`] : [{ note: 'Complete the Graduate School’s Responsible Conduct of Research and ethics training modules — a Graduate School requirement for every Ph.D. student, and a condition of admission to candidacy (DGS Handbook §3.22.3); enter the date under Milestones once done' }]),
    citation: { section: 'Academic Code §6.2.4', quote },
  };
}

/** The eighth semester of enrollment, as both candidacy rows count it: moved
 * out by every semester of approved leave or accommodation (DGS 2026-10-03;
 * Academic Code §6.2.8 counts "semester of enrollment"), and by one more for
 * the COVID cohort (DGS 2026-10-03, Item 15: "apply the 1-year extension if
 * the admission is in Spring 2020 or before"; Appendix A.4 itself extends only
 * the exam — "by the end of the ninth semester"). */
export function eighthSemester(ctx: Ctx, sem: number): { effectiveSem: number; term: Term; date: string } {
  const effectiveSem = sem + ctx.clockShift + (ctx.covidCohort ? 1 : 0);
  const term = nthSemester(ctx.entry, effectiveSem);
  return { effectiveSem, term, date: endOfTerm(term).date };
}

/** Whose eighth semester, and what moved it — the notes both candidacy rows
 * carry while they are open. */
function eighthSemesterNotes(ctx: Ctx, sem: number, effectiveSem: number, open: boolean, row: 'oce' | 'admission'): DetailPart[] {
  const parts: DetailPart[] = [];
  // Whose eighth semester (DGS 2026-09-26): "when someone has a completed MS
  // degree at CSE@ND, their OCE clock starts when they enter the PhD program.
  // However, when someone initially started as an MS in our department but
  // has transferred into PhD program in the middle, the OCE clock starts when
  // they started the MS program." Both are the record's entry term — the
  // opening dialog's answer says which — and the line names the start so a
  // wrong entry term is noticed. The Graduate School's admission deadline
  // keeps the same clock (2026-10-04, a default: one entry term counts both
  // eighth semesters), and says so without the §4.4 qualifier clause.
  if (ctx.student.background?.graduate === 'nd-mscse-transfer')
    parts.push({
      note:
        row === 'oce'
          ? `Semesters are counted from ${termLabel(ctx.entry)}, when you started the MSCSE — a transfer into the Ph.D. keeps that clock (§4.5); the §4.4 qualifier clocks count from the transfer`
          : `Semesters are counted from ${termLabel(ctx.entry)}, when you started the MSCSE — as for the Oral Candidacy Exam (OCE), a transfer into the Ph.D. keeps that clock`,
    });
  else if (ctx.student.ndMasters !== undefined)
    parts.push({
      note:
        row === 'oce'
          ? `Semesters are counted from ${termLabel(ctx.entry)}, your Ph.D. entry — the MSCSE you finished before it does not count toward the eight (§4.5)`
          : `Semesters are counted from ${termLabel(ctx.entry)}, your Ph.D. entry — as for the Oral Candidacy Exam (OCE), the MSCSE you finished before it is not counted`,
    });
  const shift = clockShiftNote(ctx);
  if (shift !== '' && open) parts.push({ note: `Semester ${sem} is counted as semester ${effectiveSem}${shift}` });
  return parts;
}

/** Whether the Oral Candidacy Exam can be scheduled yet. CSE §4.5: "All
 * coursework for the Ph.D. must be completed (or in progress the same
 * semester) before the candidacy exam can be taken." The DGS (2026-10-05):
 * "OCE does require coursework to be completed. This includes the course
 * components in the qualifier examination -- core knowledge and
 * specialization categories … both 24 credits of regular courses and course
 * components of the qualifier examination are needed (either completed or
 * expected to complete in the same semester) for OCE to start." (This
 * corrects the 2026-10-04 reading, which waited for the whole qualifier.)
 *
 * Ready when the 24 regular-course credits are complete or in progress, and
 * every core-knowledge area and the specialization are met or In progress, on
 * courses of this semester or earlier: no course in progress is dated after
 * it. Transferred regular-course credits count (they are in the regular pool);
 * credits still waiting for a DGS decision do not. A qualifier passed under the
 * earlier requirements covers the course components. */
function oceCourseworkReady(ctx: Ctx, rows: RequirementResult[]): boolean {
  const regularMin = ctx.params.number('phd_regular_credits_min');
  if (regularMin === undefined || ctx.alloc.regular.definite + ctx.alloc.regular.in_progress < regularMin) return false;
  const done = (r: RequirementResult): boolean => r.status === 'met' || (r.status === 'needs_dgs_review' && r.statusLabel === undefined);
  if (!qualifierPassedUnderPriorRules(ctx)) {
    const courseParts = rows.filter((r) => r.id.startsWith('phd.qualifier.core') || r.id === 'phd.qualifier.categories');
    if (!courseParts.every((r) => done(r) || r.status === 'in_progress')) return false;
  }
  const now = termOfDate(ctx.today);
  return !ctx.classified.some((c) => !c.superseded && c.tier === 'in_progress' && compareTerm(c.entry.term, now) > 0);
}

/** §4.5: "The candidacy exam must be taken before the end of the eighth
 * semester in the program."
 *
 * The EXAM only (DGS 2026-10-04, P2-dh-3.21-3.24-16: "OCE and doctoral
 * candidacy are two different things. One can pass OCE first and then enter
 * the doctoral candidacy later. Passing OCE is one of the requirements of
 * doctoral candidacy."). Admission to candidacy — with the GPA, the four
 * full-time semesters, the RCR training and the Graduate School's form — is
 * the next row. */
function candidacyRow(ctx: Ctx, courseworkReady: boolean): RequirementResult {
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
  const m = ctx.student.milestones;
  // An admission dated with no exam date: the record says the exam was
  // passed (admission requires it) but not when — a missing input, never an
  // overdue exam (review of the split, 2026-10-04).
  if (m.candidacyAdmitted && !m.candidacyPassed) {
    return {
      id: 'phd.candidacy',
      group: CANDIDACY,
      title: 'Oral Candidacy Exam (OCE) passed',
      status: 'cannot_evaluate',
      ...joinedDetail([`Admitted to doctoral candidacy ${m.candidacyAdmitted}`, { note: 'Enter the date you passed the Oral Candidacy Exam (OCE) under Milestones — admission to candidacy requires it (Academic Code §6.2.9)' }]),
      citation: { section: '§4.5', quote },
    };
  }
  const { effectiveSem, term, date } = eighthSemester(ctx, sem);
  const passed = m.candidacyPassed || undefined;
  const r = deadlineStatus({
    doneOn: passed,
    deadline: { date, approx: true },
    today: ctx.today,
    deadlineLabel: `the end of ${termLabel(term)} — semester ${effectiveSem}`,
    // §4.5 gives the DGS no extension to grant (that is §4.4's); a late pass
    // is still a pass, and the Graduate School's consequence is probation and
    // discontinued funding (Academic Code §6.2.8; policy review 2026-10-03).
    // "you" as the subject, so the emails' "I" reads right (2026-10-04).
    lateWording: 'you may have been placed on probation and lost University funding (Academic Code §6.2.8); confirm your standing with the DGS',
  });
  // Not started until the coursework is complete or finishing this semester
  // (§4.5; DGS 2026-10-05) — an Overdue eighth semester still reads Overdue.
  if (passed === undefined && !courseworkReady && r.status !== 'unmet') {
    return {
      id: 'phd.candidacy',
      group: CANDIDACY,
      title: 'Oral Candidacy Exam (OCE) passed',
      status: 'unmet',
      ...joinedDetail([
        'Not started',
        { note: 'The Oral Candidacy Exam (OCE) can be taken once your coursework is complete or in progress the same semester — the 24 regular-course credits (transferred regular-course credits count) and the qualifying examination’s core-knowledge and specialization courses (§4.5)' },
        ...eighthSemesterNotes(ctx, sem, effectiveSem, true, 'oce'),
      ]),
      deadline: r.deadline,
      citation: { section: '§4.5', quote },
    };
  }
  // The pass is the fact; every other sentence is a note (DGS 2026-10-03).
  const parts: DetailPart[] = [];
  if (r.status === 'met') parts.push(`Oral Candidacy Exam (OCE) passed ${passed}`);
  else if (r.status === 'needs_dgs_review') parts.push(`Passed ${passed}`, ...(r.lateNote ? [{ note: r.lateNote.charAt(0).toUpperCase() + r.lateNote.slice(1) }] : []));
  else if (r.status === 'unmet')
    // The deadline chip carries the when; policy (coursework-before-exam,
    // committee make-up) lives behind the § chip (2026-09-03). What a missed
    // eighth semester means at the Graduate School: probation and the end of
    // University funding, not forfeiture (Academic Code §6.2.8/§5.7.3) — for
    // the EXAM here; the admission row says the same of admission.
    parts.push({ note: 'Overdue — the Graduate School places a student who has not passed the candidacy exam by the end of the eighth semester on probation and discontinues University funding (Academic Code §6.2.8); talk to the DGS' });
  parts.push(...eighthSemesterNotes(ctx, sem, effectiveSem, r.status !== 'met', 'oce'));
  // The exam's one condition (red-team F8, DGS 2026-09-12). §4.5: "All
  // coursework for the Ph.D. must be completed (or in progress the same
  // semester) before the candidacy exam can be taken." A date entered while it
  // is unmet is not a met row: it goes to the DGS. §2.2's 3.0 GPA gates
  // ADMISSION to candidacy, not sitting the exam (P1-gpa-8, DGS 2026-10-03),
  // so it is the admission row's since the split (DGS 2026-10-04).
  const regularMin = ctx.params.number('phd_regular_credits_min');
  const regularDone = ctx.alloc.regular.definite + ctx.alloc.regular.in_progress;
  const courseworkShort = regularMin !== undefined && regularDone < regularMin;
  const credits = `${formatCredits(regularDone)} of ${regularMin}`;
  let status = r.status;
  if (courseworkShort) {
    if (passed !== undefined) {
      status = status === 'met' ? 'needs_dgs_review' : status;
      parts.push({ note: `You show ${credits} regular credits — §4.5 requires that before the exam; confirm with the DGS that it could be taken` });
    } else {
      // The precondition in the student's terms (clarity review 2026-09-26).
      parts.push({ note: `You can take the exam once your ${regularMin} regular-course credits are complete or in progress — you have ${credits} (§4.5)` });
    }
  }
  // Passing is not admission (DGS 2026-10-04): say so while the next row is open.
  if (passed !== undefined && !m.candidacyAdmitted)
    parts.push({ note: 'Passing the Oral Candidacy Exam (OCE) is one of the conditions for admission to doctoral candidacy, a separate step with the Graduate School — the next row' });
  return {
    id: 'phd.candidacy',
    group: CANDIDACY,
    title: 'Oral Candidacy Exam (OCE) passed',
    status,
    // Late is the only question: done, for the eight-year row (2026-10-04).
    ...(status === 'needs_dgs_review' && r.status === 'needs_dgs_review' && !courseworkShort ? { completedLate: true as const } : {}),
    ...(parts.length > 0 ? joinedDetail(parts) : { detail: '' }),
    deadline: r.deadline,
    citation: { section: '§4.5', quote },
  };
}

/** The Graduate School's own numbers for admission to doctoral candidacy (DGS
 * Handbook §3.22.3), kept in code like the Academic Code's other numbers
 * (SEMESTER_GRADUATE_CREDITS_MAX, NON_DEGREE_CREDITS_MAX): the rules sheet
 * carries the department's policy, and these are not the department's. */
export const ADMISSION_DEADLINE_SEMESTER = 8;
const ADMISSION_FULL_TIME_SEMESTERS = 4;

/** Every condition for admission to doctoral candidacy, as Relevant Policies
 * (DGS 2026-10-05: "Doctoral candidacy has more conditions than this. Double
 * check … Check all the policies and include them in this card."). Gathered
 * from the Academic Code (§3.1, §3.3, §5.7.3, §6.2.2, §6.2.4, §6.2.7, §6.2.8,
 * §6.2.9), the DGS Handbook (§2.10.6, §3.22.3, §6.3.1, §10.3.1 — the
 * application's own fields) and the CSE handbook (§2.2, §2.3, §4.2, §4.3,
 * §4.5, §5.3); every quote verified against the texts. Page-only: the emails
 * carry the facts, not the rulebook. */
function admissionPolicyNotes(ctx: Ctx, args: { semesterWord: string; probationCite: string; form: string }): DetailPart[] {
  const regularMin = ctx.params.number('phd_regular_credits_min');
  const gpaMin = ctx.params.number('gpa_min');
  const floor = ctx.params.number('fulltime_credits_min');
  const policy = (note: string): DetailPart => ({ note, pageOnly: true });
  return [
    policy('Admission to doctoral candidacy follows the Oral Candidacy Exam (OCE) and requires every condition below; the Graduate School admits you on the program’s application (Academic Code §6.2.9; DGS Handbook §3.22.3)'),
    policy('Enrolled in the Ph.D. program and registered — the application records “Enrolled and registered” (Academic Code §3.1, §6.2.9; DGS Handbook §3.22.3, §10.3.1)'),
    policy(`Four consecutive semesters at full-time status in the program — at least ${floor ?? 9} credit hours each fall and spring, counted from your entry term; summers do not count (§2.1.2, §4.3; Academic Code §3.3, §6.2.2; DGS Handbook §3.22.3)`),
    policy(`The department’s coursework: the ${regularMin ?? 24} regular-course credits (§4.2) — transferred regular-course credits count, and approved CSE 4xxxx credits count within §4.2’s allowance (Academic Code §6.2.9; DGS Handbook §3.22.3)`),
    policy(`A cumulative GPA of ${(gpaMin ?? 3).toFixed(1)} or better (§2.2; Academic Code §6.2.9; DGS Handbook §3.22.3)`),
    policy('All training modules for the Responsible Conduct of Research and ethics: the Graduate School’s training for every Ph.D. student, and any training your role or your research funding requires (Academic Code §6.2.4; DGS Handbook §3.22.3, §6.3.1)'),
    policy('The doctoral candidacy examination passed, its written and oral parts: in CSE the written part is the dissertation proposal, so passing the Oral Candidacy Exam (OCE) normally also approves the proposal. The OCE can be taken once your coursework is complete or in progress the same semester — the regular-course credits and the qualifying examination’s core-knowledge and specialization courses (§4.5; Academic Code §6.2.8, §6.2.9)'),
    policy('Before the OCE: send the DGS a written request naming your committee — your advisor and at least three voting members, with CVs for members from outside Notre Dame — and give the committee your written proposal at least two weeks before the exam, which is held on campus (§4.5)'),
    policy('At least one dissertation advisor who is tenured or tenure-track Notre Dame faculty, or a co-advisor who is; the application confirms it. CSE asks for tenured or tenure-track CSE faculty, with exceptions approved by the DGS (§2.3; Academic Code §6.2.7; DGS Handbook §10.3.1)'),
    policy('CSE has no language requirement (§5.3)'),
    policy('The application also records whether the Graduate School holds your official undergraduate transcript (or diploma) showing your bachelor’s degree conferred — if you are not sure it arrived, ask the Grad Admin (DGS Handbook §2.10.6, §10.3.1)'),
    policy(`Be admitted by the end of your ${args.semesterWord} semester: a student not admitted by then may be placed on probation and risks the loss of Graduate School funding (${args.probationCite}; DGS Handbook §3.22.3). Once every condition is met, ${args.form}`),
  ];
}

/** Admission to doctoral candidacy — a step of its own after the OCE (DGS
 * 2026-10-04, P2-dh-3.21-3.24-16: "OCE and doctoral candidacy are two
 * different things. One can pass OCE first and then enter the doctoral
 * candidacy later. Passing OCE is one of the requirements of doctoral
 * candidacy."). The CSE handbook names it only in §2.2 ("admission to degree
 * candidacy … require[s] … at least a 3.0 (B) cumulative GPA"); the conditions
 * are the Graduate School's.
 *
 * Academic Code §6.2.9: "To qualify for admission to doctoral candidacy, a
 * student must: be in a doctoral program, complete the program coursework and
 * language requirements with a cumulative G.P.A. of 3.0 or better, pass the
 * written and oral parts of the doctoral candidacy examination, and have the
 * dissertation proposal approved (if this is not part of the candidacy exam)."
 * The DGS Handbook's list (§3.22.3) adds "Have been enrolled in the program
 * for at least four consecutive semesters at full-time status" and "Completed
 * all training modules for the Responsible Conduct of Research and Ethics
 * requirements", and: "Students must be admitted to degree candidacy by the
 * end of their eighth semester or risk the loss of Graduate School funding."
 * Academic Code §5.7.3 adds probation for "a failure to … be admitted to
 * doctoral degree candidacy by the end of the eighth semester". For students
 * enrolled in Spring 2020, Appendix A.4 gives "a failure to pass candidacy
 * exams by the end of the ninth semester" and does not mention admission; the
 * DGS reads that silence as an oversight (2026-10-04: "ninth for both, and
 * also mention probation"), so their row counts the ninth semester and names
 * the probation too.
 *
 * CSE has no language requirement (§5.3), and its written candidacy exam IS
 * the dissertation proposal (§4.5), so the OCE covers the proposal. The
 * coursework is the OCE row's own measure — the regular-course credits
 * (2026-09-12) — here COMPLETED, not in progress ("complete the program
 * coursework"). A dated admission is the Graduate School's decision: the row
 * reads Met, except that §2.2's GPA keeps its gate (2026-09-12 seventh,
 * P1-gpa-8: a date entered while the GPA is short goes to the DGS) and a date
 * before the OCE's goes to the DGS. A record whose dissertation milestones
 * are dated but whose admission is not is missing a date — no "apply now",
 * no probation (review of the split, 2026-10-04). */
function candidacyAdmissionRow(ctx: Ctx, merged: { oce: RequirementResult; rcr: RequirementResult; courseworkReady: boolean }): RequirementResult {
  const quote =
    'To qualify for admission to doctoral candidacy, a student must: be in a doctoral program, complete the program coursework and language requirements with a cumulative G.P.A. of 3.0 or better, pass the written and oral parts of the doctoral candidacy examination, and have the dissertation proposal approved (if this is not part of the candidacy exam).';
  const citation = { section: 'Academic Code §6.2.9', quote };
  const base = { id: 'phd.candidacyAdmission', group: CANDIDACY, title: 'Admitted to doctoral candidacy', shortTitle: 'Admission to candidacy' };
  const m = ctx.student.milestones;
  const sem = ADMISSION_DEADLINE_SEMESTER;
  const { effectiveSem, term, date } = eighthSemester(ctx, sem);
  const admitted = m.candidacyAdmitted || undefined;
  if (!admitted && (m.defensePassed || m.dissertationSubmitted)) {
    return {
      ...base,
      status: 'cannot_evaluate',
      ...joinedDetail(['Admission date not entered', { note: 'Your dissertation milestones are dated, so enter the date you were admitted to doctoral candidacy under Milestones' }]),
      citation,
    };
  }
  // The Spring 2020 cohort: the ninth semester and Appendix A.4, read as
  // covering admission too (DGS 2026-10-04, option C).
  const semesterWord = ctx.covidCohort ? 'ninth' : 'eighth';
  const probationCite = ctx.covidCohort ? 'Academic Code §5.7.3, Appendix A.4' : 'Academic Code §5.7.3';
  const r = deadlineStatus({
    doneOn: admitted,
    deadline: { date, approx: true },
    today: ctx.today,
    deadlineLabel: `the end of ${termLabel(term)} — semester ${effectiveSem}`,
    lateWording: `you may have been placed on probation (${probationCite}), and admission after the ${semesterWord} semester risks the loss of Graduate School funding (DGS Handbook §3.22.3); confirm your standing with the DGS`,
  });
  const dates = ctx.rules.parameters.raw.get('candidacy_form_deadlines')?.value.trim();
  const form = `the Grad Admin submits the Graduate School’s Application for Admission to Doctoral Candidacy by the Graduate School calendar’s deadline for the semester${dates ? ` (${dates})` : ''} (Academic Code §6.2.9; DGS Handbook §3.22.3)`;
  const policies = admissionPolicyNotes(ctx, { semesterWord, probationCite, form });
  // Not started while the OCE is (DGS 2026-10-04): admission follows the OCE,
  // which waits for the coursework (DGS 2026-10-05). An Overdue eighth
  // semester still reads so. Every condition is listed under Relevant
  // Policies (DGS 2026-10-05).
  if (!admitted && !m.candidacyPassed && !merged.courseworkReady && r.status !== 'unmet' && merged.oce.status !== 'cannot_evaluate') {
    return {
      ...base,
      status: 'unmet',
      ...joinedDetail([
        'Not started',
        ...policies,
        ...eighthSemesterNotes(ctx, sem, effectiveSem, true, 'admission'),
      ]),
      deadline: r.deadline,
      citation,
    };
  }
  const parts: DetailPart[] = [];
  let status = r.status;
  let completedLate = false;
  const gpaMin = ctx.params.number('gpa_min');
  // Through usableGpa: a figure off the 0.00–4.00 scale is quoted nowhere
  // (R1, 2026-09-18) — the §2.2 row has already said it cannot be checked.
  const gpa = usableGpa(ctx.student.gpa);
  if (admitted) {
    parts.push(`Admitted to doctoral candidacy ${admitted}`);
    if (r.lateNote) parts.push({ note: r.lateNote.charAt(0).toUpperCase() + r.lateNote.slice(1) });
    completedLate = r.status === 'needs_dgs_review';
    if (m.candidacyPassed && m.candidacyPassed > admitted) {
      status = 'needs_dgs_review';
      completedLate = false;
      parts.push({ note: `The admission date is before the Oral Candidacy Exam (OCE) date (${m.candidacyPassed}) — passing the OCE comes first (Academic Code §6.2.9); check both dates, and confirm with the DGS if both are right` });
    }
    // §2.2's gate on a dated candidacy (2026-09-12 seventh; P1-gpa-8's wording).
    if (gpaMin !== undefined && gpa !== undefined && gpa < gpaMin) {
      status = 'needs_dgs_review';
      completedLate = false;
      parts.push({ note: `You show a ${gpaText(gpa)} GPA — §2.2 requires a ${gpaMin.toFixed(1)} for admission to candidacy; confirm your admission with the DGS` });
    }
  } else {
    // The conditions, each with where the record stands (the facts), in the
    // order a student meets them.
    const conditions: { text: string; done: boolean }[] = [];
    // The OCE's own deadline (§4.5, the sheet's semester) beside it when it is
    // not the admission's — the card is the OCE's too since 2026-10-04.
    const oceDue = !m.candidacyPassed && merged.oce.deadline && merged.oce.deadline.date !== date ? ` — ${merged.oce.deadline.label.charAt(0).toLowerCase()}${merged.oce.deadline.label.slice(1)}` : '';
    conditions.push({ text: `Oral Candidacy Exam (OCE): ${m.candidacyPassed ? `passed ${m.candidacyPassed}` : `not yet${oceDue}`}`, done: !!m.candidacyPassed });
    const floor = ctx.params.number('fulltime_credits_min');
    if (floor === undefined) conditions.push({ text: `${ADMISSION_FULL_TIME_SEMESTERS} consecutive full-time semesters: cannot be checked — the rules sheet is missing 'fulltime_credits_min'`, done: false });
    else {
      const records = fullTimeTermRecords(ctx);
      const run = maxConsecutiveFullTime(records);
      const runTerms = longestFullTimeRun(records);
      const span = runTerms.length > 0 ? ` (${termLabel(runTerms[0]!)}${runTerms.length > 1 ? `–${termLabel(runTerms[runTerms.length - 1]!)}` : ''})` : '';
      conditions.push({
        text: `${ADMISSION_FULL_TIME_SEMESTERS} consecutive full-time semesters: ${run >= ADMISSION_FULL_TIME_SEMESTERS ? `done${span}` : `${run} so far${span}`}`,
        done: run >= ADMISSION_FULL_TIME_SEMESTERS,
      });
    }
    const regularMin = ctx.params.number('phd_regular_credits_min');
    if (regularMin === undefined) conditions.push({ text: `Coursework: cannot be checked — the rules sheet is missing 'phd_regular_credits_min'`, done: false });
    else {
      const definite = ctx.alloc.regular.definite;
      const ip = ctx.alloc.regular.in_progress;
      const pending = ctx.alloc.regular.provisional;
      conditions.push({
        // Transferred regular-course credits are in this count (DGS 2026-10-05:
        // "somehow state that … can be satisfied with the transferred
        // regular-course credits").
        text: `Coursework: ${formatCredits(definite)} of ${regularMin} regular-course credits complete${ip > 0 && definite < regularMin ? `, ${formatCredits(ip)} in progress` : ''}${pending > 0 && definite < regularMin ? `, ${formatCredits(pending)} waiting for a DGS decision` : ''} (transferred regular-course credits count)`,
        done: definite >= regularMin,
      });
    }
    if (gpaMin === undefined) conditions.push({ text: `Cumulative GPA: cannot be checked — the rules sheet is missing 'gpa_min'`, done: false });
    else
      conditions.push({
        text: `Cumulative GPA of ${gpaMin.toFixed(1)} or better: ${gpa === undefined ? (ctx.student.gpa === undefined ? 'not entered' : 'cannot be checked — see the GPA row') : gpa >= gpaMin ? gpaText(gpa) : `${gpaText(gpa)} — below it`}`,
        done: gpa !== undefined && gpa >= gpaMin,
      });
    conditions.push({ text: `Responsible Conduct of Research and ethics training: ${m.rcrTrainingCompleted ? `done ${m.rcrTrainingCompleted}` : 'not yet'}`, done: !!m.rcrTrainingCompleted });
    // The application's own fields (DGS Handbook §10.3.1; DGS 2026-10-05: "Check
    // all the policies and include them in this card"): the adviser criteria
    // (the advisor card asks it, CSE §2.3) and "Enrolled and registered".
    const ttt = advisorTttState(ctx);
    const anyAdvisor = !!(m.advisorName || m.advisorName2 || m.advisorIdentified);
    conditions.push({
      text: `Tenured or tenure-track dissertation advisor: ${!anyAdvisor ? 'no advisor entered' : ttt === 'yes' ? 'yes' : ttt === 'no' ? 'no or not sure — the DGS must approve it (see the advisor card)' : 'not answered (Milestones)'}`,
      done: anyAdvisor && ttt === 'yes',
    });
    parts.push(...conditions.map((c) => c.text));
    // Registered this semester — the application's "Enrolled and registered"
    // (DGS Handbook §10.3.1). Said, not counted as a condition: a missing row
    // is not proof (research registrations are often not typed in), and a
    // continuing student need not register in summer (DGS Handbook §3.3), so
    // no line then.
    const now = termOfDate(ctx.today);
    if (now.season !== 'summer') {
      const key = termIndex(now);
      const credits = ctx.classified.filter((c) => c.entry.origin === 'nd' && !c.superseded && !c.audited && termIndex(c.entry.term) === key).reduce((n, c) => n + c.entry.credits, 0);
      const ticked = (ctx.student.fullTimeTermOverrides ?? []).some((t) => termIndex(t) === key);
      parts.push(`Registered this semester (${termLabel(now)}): ${credits > 0 ? `${formatCredits(credits)} credits entered` : ticked ? 'full-time, as you ticked' : 'no Notre Dame course entered'}`);
    }
    // "a student" rather than "you" as an object, so the emails' first person
    // reads right; the page-only instruction is its own note, which the emails
    // drop (2026-10-04).
    if (conditions.every((c) => c.done)) parts.push({ note: `Every condition is met: apply now — ${form}` }, { note: 'Enter the date under Milestones once you are admitted' });
    else parts.push({ note: `The Graduate School admits a student to doctoral candidacy once every condition above is met — the Oral Candidacy Exam (OCE) is one of them; then ${form}` });
    parts.push(...policies);
    // §5.7.3: the Graduate School "may" place a student on probation.
    if (r.status === 'unmet')
      parts.push({
        note: `Overdue — the Graduate School may place a student not admitted to doctoral candidacy by the end of the ${semesterWord} semester on probation (${probationCite}), and the student risks the loss of Graduate School funding (DGS Handbook §3.22.3); talk to the DGS`,
      });
  }
  parts.push(...eighthSemesterNotes(ctx, sem, effectiveSem, r.status !== 'met', 'admission'));
  // The merged card (DGS 2026-10-04): the OCE's and the RCR training's own
  // facts and notes, where they add something. Their status shows here only
  // when the OCE needs attention the admission row would not show: overdue
  // against its own (sheet) deadline, or a missing date or parameter.
  const isNote = (p: DetailPart): p is { note: string } => typeof p === 'object' && 'note' in p;
  const oceParts = merged.oce.detailParts ?? (merged.oce.detail ? [merged.oce.detail] : []);
  const oceNotes = oceParts.filter(isNote).filter((p) => !/^(Passing the Oral Candidacy Exam \(OCE\) is one of the conditions|Semesters are counted from|Semester \d+ is counted as)/.test(p.note));
  const rcrNotes = (merged.rcr.detailParts ?? []).filter(isNote);
  let deadline = r.deadline;
  if (merged.oce.status === 'cannot_evaluate') {
    parts.push(`Oral Candidacy Exam (OCE): ${(oceParts.find((p): p is string => typeof p === 'string') ?? merged.oce.detail).replace(/\.$/, '')}`);
    if (!admitted) status = 'cannot_evaluate';
  } else if (!admitted && merged.oce.status === 'unmet' && merged.oce.deadline?.state === 'overdue' && status !== 'unmet') {
    status = 'unmet';
    deadline = merged.oce.deadline;
  }
  if (!admitted || merged.oce.status !== 'met') parts.push(...oceNotes.map((n) => ({ note: `Oral Candidacy Exam (OCE): ${n.note}` })));
  if (!admitted) parts.push(...rcrNotes);
  return {
    ...base,
    status,
    // Late is the only question: done, for the eight-year row (2026-10-04).
    ...(completedLate ? { completedLate: true as const } : {}),
    ...joinedDetail(parts),
    deadline,
    citation,
  };
}

function dissertationRows(ctx: Ctx): RequirementResult[] {
  const m = ctx.student.milestones;
  const gpaGate = defendGpaNote(ctx);
  // §4.3: "Failure to complete all requirements for the Ph.D. degree within
  // eight (8) years results in forfeiture of degree eligibility." The defense
  // is the last of those requirements, so a defense dated after the limit
  // cannot simply read "met" (red-team 2026-09-13): these two rows were plain
  // booleans with no date logic at all, unlike every other milestone row in
  // this file, so a dissertation defended years past the limit reported "met"
  // — and, because the time-limit row asks only whether the other rows are
  // met, it agreed: "All requirements are complete within the 8-year limit."
  const years = ctx.params.number('phd_time_limit_years');
  const limitDate = years === undefined ? undefined : timeLimitDate(ctx, years);
  const lateDefense = limitDate !== undefined && m.defensePassed !== undefined && m.defensePassed > limitDate;
  const lateSubmission = limitDate !== undefined && m.dissertationSubmitted !== undefined && m.dissertationSubmitted > limitDate;
  // §2.2 for a defense already dated (policy review 2026-10-03, P1-gpa-10):
  // passed while the cumulative GPA was below the minimum is not Met — it goes
  // to the DGS, as the candidacy row does for the same GPA.
  const gpaAtDefense = m.defensePassed ? defendedBelowGpaNote(ctx) : '';
  const submittedRow: RequirementResult = {
    // Academic Code §6.2.12: "To receive the degree at the next graduation, the
    // doctoral candidate who has successfully defended his or her dissertation
    // must submit it to the Graduate School on or before the deadline published
    // in the Graduate School calendar." — and §6.2.6 counts "the official
    // submission" inside the eight years (policy review 2026-10-03).
    id: 'phd.dissertation.submitted',
    group: DISSERTATION,
    title: 'Final dissertation submitted to the Graduate School',
    shortTitle: 'Dissertation submitted',
    status: m.dissertationSubmitted ? (lateSubmission ? 'needs_dgs_review' : 'met') : m.defensePassed ? 'in_progress' : 'unmet',
    ...(m.dissertationSubmitted && lateSubmission ? { statusLabel: 'Eligibility at risk' } : {}),
    // The date is the fact; the rule and the next step are notes (DGS 2026-10-03).
    ...joinedDetail(
      m.dissertationSubmitted
        ? lateSubmission
          ? [
              `Submitted ${m.dissertationSubmitted} — after the ${years}-year limit, which passed at ${deadlineTermLabel(limitDate!)} (approximate)`,
              { note: 'The Academic Code counts the official submission inside the limit (Academic Code §6.2.6), so confirm with the DGS that the Graduate School granted an extension or dissertation completion status' },
            ]
          : [`Submitted ${m.dissertationSubmitted}`]
        : m.defensePassed
          ? [{ note: 'Submit the final, revised dissertation electronically through the Graduate School’s portal by the Graduate School calendar’s deadline for the graduation you want — the degree is conferred at the next graduation after an on-time submission (Academic Code §6.2.12)' }]
          : ['Not started', { note: 'The submission comes after the defense (§4.7)' }],
    ),
    citation: {
      section: 'Academic Code §6.2.12',
      quote: 'To receive the degree at the next graduation, the doctoral candidate who has successfully defended his or her dissertation must submit it to the Graduate School on or before the deadline published in the Graduate School calendar.',
    },
  };
  return [
    // §4.6: "Only a dissertation, which has been unanimously approved for
    // defense by the readers, may be defended." Not a row of its own since
    // 2026-10-04 (DGS: "Practically, the committee approve the dissertation
    // and pass the defense at the same time. Only the 'dissertation defense
    // passed' is needed."): the defense row stands for both, and the readers'
    // approval has no date of its own in the record.
    // §4.7: the dissertation defense. Before the Oral Candidacy Exam the
    // dissertation stage has not begun (DGS 2026-09-22: "Dissertation does
    // not start before OCE is passed"); the leading "Not started" is what the
    // page and the advisor summary read to show the grey pill, so keep it as
    // the first words.
    {
      id: 'phd.dissertation.defense',
      group: DISSERTATION,
      title: 'Dissertation defense passed',
      status: m.defensePassed ? (lateDefense || gpaAtDefense !== '' ? 'needs_dgs_review' : 'met') : 'unmet',
      // The one row that must NOT read "Conditionally met" (W-CS2, DGS
      // 2026-09-18): §4.3 makes a defense past the limit a forfeiture of
      // eligibility unless the Graduate School granted an extension, and the
      // pill is what a student reads first. The status is unchanged, so the row
      // still counts with the conditional ones on the dashboard.
      ...(m.defensePassed && lateDefense ? { statusLabel: 'Eligibility at risk' } : {}),
      ...joinedDetail(
        m.defensePassed
          ? lateDefense
            ? [
                `Defense passed ${m.defensePassed} — after the ${years}-year limit, which passed at ${deadlineTermLabel(limitDate!)} (approximate)`,
                { note: '§4.3 makes that a forfeiture of degree eligibility unless the Graduate School granted an extension, so confirm it with the DGS' },
                ...noteOf(gpaAtDefense),
                ...defenseRegistrationNote(ctx, m.defensePassed),
                { note: 'Then submit the final dissertation electronically by the Graduate School calendar’s deadline (§4.7; Academic Code §6.2.12) — the next row' },
              ]
            : [`Defense passed ${m.defensePassed}`, ...noteOf(gpaAtDefense), ...defenseRegistrationNote(ctx, m.defensePassed), { note: 'Next: submit the final dissertation electronically by the Graduate School calendar’s deadline (§4.7; Academic Code §6.2.12) — the next row' }]
          : m.candidacyPassed === undefined
            ? ['Not started', { note: 'The defense comes after the Oral Candidacy Exam (§4.5)' }, ...noteOf(gpaGate)]
            : ['Not yet passed', { note: 'Three votes of four (or four of five) are required to pass (§4.7)' }, ...noteOf(gpaGate)],
      ),
      citation: {
        section: '§4.7',
        quote: 'In defending the dissertation, the doctoral candidate supports its claims, procedures and results.',
      },
    },
    submittedRow,
  ];
}

/** §4.5: "The Ph.D. candidacy exam can be used by Ph.D. students to satisfy
 * both the M.S. thesis requirement and the Ph.D. candidacy exam simultaneously,
 * thus earning the MSCSE degree on successfully passing the candidacy exam,
 * given that all the credits used to satisfy the requirements were earned at
 * Notre Dame."
 *
 * Who can earn it (DGS 2026-10-03, P1-deadlines-20, reversing the 2026-09-27
 * (b) "does not apply" for a student who already holds a master's from
 * another university): "Let's allow MSCSE along the way IF the student earned
 * enough credits at Notre Dame ... the student who had MS and transferred
 * credits cannot get MSCSE since they will likely not have enough credits
 * earned at ND. If they did so, even after the transfer, they can still earn
 * MSCSE along the way." So the earlier master's decides nothing: the credits
 * earned here do, and transferred credits never count toward them. The card
 * shows those credits in every state; the rule sits in its Details. */
function msAlongTheWayRow(ctx: Ctx): RequirementResult {
  const quote =
    'The Ph.D. candidacy exam can be used by Ph.D. students to satisfy both the M.S. thesis requirement and the Ph.D. candidacy exam simultaneously, thus earning the MSCSE degree on successfully passing the candidacy exam, given that all the credits used to satisfy the requirements were earned at Notre Dame.';
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
  // The credits and the exam are the facts; the conditions, the Grad Admin's
  // step and the Graduate School form are notes (DGS 2026-10-03).
  let parts: DetailPart[];
  // "Earned at Notre Dame: 9 of 24 regular-course credits and 0 of 6 research
  // credits" — a count that has reached its number drops the "of 24".
  const countOf = (done: number, req: number, unit: string): string => (done >= req ? `${done} ${unit}` : `${done} of ${req} ${unit}`);
  const earnedLine =
    reqReg === undefined || reqRes === undefined
      ? ''
      : `Earned at Notre Dame: ${countOf(doneReg, reqReg, 'regular-course credits')} and ${countOf(doneRes, reqRes, 'research credits')}`;
  // The rule behind the count, and — for a student with a master's from
  // another university or credits transferred in — why those do not help.
  const whatCounts: DetailPart = {
    note: `Only credits earned at Notre Dame count toward this award: ${reqReg} regular-course credits and ${reqRes} research credits — research and dissertation, thesis direction or project courses, not independent study (§4.5)`,
  };
  // The 24 may include the 40000-level allowance (DGS 2026-10-03: "the 40xxx
  // allowance can be used to satisfy the 24 regular course credits
  // requirement"). The count is the Ph.D.'s own Notre Dame regular credits,
  // so it is §4.2's allowance — approved CSE courses below the 60000 level,
  // capped by phd_4xxxx_cse_credits_max — and only graded courses are earned.
  const fourkMax = ctx.params.number('phd_4xxxx_cse_credits_max');
  const countNotes: DetailPart[] = [
    ...(fourkMax !== undefined && fourkMax > 0
      ? [{ note: `Up to ${fourkMax} of the ${reqReg} regular-course credits may be approved CSE courses below the 60000 level — the same allowance as the Ph.D.’s (§4.2)` }]
      : []),
    // Said only where it explains a gap: a course in progress at Notre Dame
    // while a count is still short.
    ...(reqReg !== undefined && reqRes !== undefined && (doneReg < reqReg || doneRes < reqRes) && ctx.alloc.ndRegular.in_progress + ctx.alloc.ndResearch.in_progress > 0
      ? [{ note: 'A course in progress joins the count once it is graded' }]
      : []),
  ];
  const transferred = ctx.alloc.transfer.definite + ctx.alloc.transfer.in_progress + ctx.alloc.transfer.provisional;
  const heldMasters = ctx.student.priorMs === 'completed';
  const transferNotes: DetailPart[] =
    heldMasters && transferred > 0
      ? [{ note: 'A master’s degree from another university does not rule this award out, but the credits transferred from it count toward the Ph.D., not toward this award (DGS 2026-10-03)' }]
      : heldMasters
        ? [{ note: 'A master’s degree from another university does not rule this award out (DGS 2026-10-03)' }]
        : transferred > 0
          ? [{ note: 'Credits transferred from another university count toward the Ph.D., not toward this award' }]
          : [];
  let statusLabel: string | undefined;
  // The award is a degree conferral, so it needs what every degree needs
  // (policy review 2026-10-03): the 3.0 cumulative GPA (§2.2; Academic Code
  // §6.1.6 for master's candidacy), and — through the master's candidacy the
  // DGS Handbook (§3.21.1) routes it by — the master's five-year limit may
  // bind an OCE passed late, which the Code leaves to the Graduate School.
  const gpaMin = ctx.params.number('gpa_min');
  const gpa = usableGpa(ctx.student.gpa);
  const gpaShort = gpaMin !== undefined && (gpa === undefined || gpa < gpaMin);
  const msYears = ctx.params.number('ms_time_limit_years');
  const msLimit = msYears === undefined ? undefined : addYearsIso(startOfTerm(ctx.entry).date, msYears);
  const afterMsLimit = passed !== undefined && msLimit !== undefined && passed > msLimit;
  if (reqReg === undefined || reqRes === undefined) {
    status = 'cannot_evaluate';
    parts = [missingParamDetail(reqReg === undefined ? 'ms_regular_credits_min' : 'ms_project_credits_min')];
  } else if (passed && doneReg >= reqReg && doneRes >= reqRes && (gpaShort || afterMsLimit)) {
    status = 'needs_dgs_review';
    const why = [
        ...(gpaShort ? [gpa === undefined ? 'no cumulative GPA is entered, and the award needs at least the 3.0 minimum (§2.2)' : `your cumulative GPA is ${gpaText(gpa)}, below the 3.0 the award needs (§2.2)`] : []),
        ...(afterMsLimit ? [`the exam came more than ${msYears} years after you entered, and the master’s five-year limit may apply to the award (Academic Code §6.1.4; DGS Handbook §3.21.1)`] : []),
      ].join(', and ');
    parts = [
      `Oral Candidacy Exam (OCE) passed ${passed}`,
      earnedLine,
      { note: `${why.charAt(0).toUpperCase()}${why.slice(1)} — confirm with the DGS before the award is requested` },
      whatCounts,
      ...countNotes,
      ...transferNotes,
    ];
  } else if (passed && doneReg >= reqReg && doneRes >= reqRes) {
    status = 'met';
    parts = [
      `Oral Candidacy Exam (OCE) passed ${passed}`,
      earnedLine,
      { note: 'The Grad Admin processes the MSCSE award; it is in the processing request (§4.5)' },
      { note: candidacyFormSentence(ctx, 'master’s') },
      whatCounts,
      ...countNotes,
      ...transferNotes,
    ];
  } else if (passed) {
    status = 'in_progress';
    parts = [`Oral Candidacy Exam (OCE) passed ${passed}`, earnedLine, whatCounts, ...countNotes, ...transferNotes];
  } else {
    // Before the OCE, for every student the row covers — a master's from
    // another university included since 2026-10-03 (above).
    status = 'not_applicable';
    statusLabel = 'Not started';
    parts = [earnedLine, { note: 'Pass the Oral Candidacy Exam (OCE) and you can also receive the MSCSE (§4.5)' }, whatCounts, ...countNotes, ...transferNotes];
  }
  return {
    id: 'phd.msAlongTheWay',
    ...(statusLabel ? { statusLabel } : {}),
    group: CANDIDACY,
    title: 'MSCSE awarded along the way',
    status,
    informational: true,
    ...joinedDetail(parts),
    citation: { section: '§4.5', quote },
  };
}
