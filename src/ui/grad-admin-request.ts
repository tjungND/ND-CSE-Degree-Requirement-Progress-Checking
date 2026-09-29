// The "Ask the Grad Admin to process" request — pure string building over an
// AuditReport and the student record (no DOM), in the two clipboard flavours
// the advisor summary uses (plain text; HTML with real tables).
//
// Two people, two jobs (DGS 2026-09-06 evening): the DGS determines
// eligibility by the handbook and the course rules — that is what the review
// request asks for; the Graduate Program Administrator (Grad Admin) processes
// what has been decided and keeps the official record. §5.2: "A student
// should send the credit transfer request to the Graduate Program Coordinator
// and the DGS will approve and make a recommendation to the Graduate School."
// So this request carries everything processable (the DGS's answer): transfer
// credits ruled transferable in the ExternalCourses tab or already approved
// (the student's §5.2 attestation), the qualifier completion form once the
// components are done, the MSCSE along the way once its row is met, and EVERY
// requirement the self-check shows as met, each as a table of what satisfies
// it — the courses, the semesters, the date (DGS request, later that evening)
// — with the DGS in cc. Since 2026-09-28 (DGS) the request also carries the
// requirements still open — in progress and not started, each in the page's
// own colour (green / amber / grey; red for overdue, blue for conditionally
// met) — and highlights any deadline that falls in this semester or the next,
// so the Grad Admin sees what is coming. Like the review request, the student's own words stay
// above a marker line and the tables below it are not to be modified. Never
// the word "audit" (the page is a self-check).
import { formatCredits } from '../engine/credits.ts';
import type { Rules } from '../data/types.ts';
import { classify, decidedCaseByCase, type ClassifiedCourse } from '../engine/allocate.ts';
import { termLabel } from '../engine/term.ts';
import type { AuditReport, CourseEntry, Milestones, RequirementResult, Student } from '../engine/types.ts';
import { DO_NOT_MODIFY_MARKER, EDITABLE_MARKER, MARKER_DIVIDER } from '../transcript/external.ts';
import { shortenAfterFirst } from './first-mention.ts';
import { decisionWording } from '../engine/decider.ts';
import { esc, htmlBadge, htmlDeadline, plural, programLabel, programShort, textDeadline, type StandingColor } from './email-html.ts';
import { formatYmdLong } from './handbook.ts';
import { deadlineAlert, isNotStarted, standingColor, scoredRows, statusWord } from './report.ts';

export { selfCheckFileName } from './state.ts';

export interface MilestoneField {
  key: keyof Milestones;
  label: string;
  section: string;
  program: 'phd' | 'mscse' | 'both';
}

/** The dated milestones, as the milestones card labels them (keep in step
 * with `milestonesCard` in app.ts). */
export const MILESTONE_FIELDS: readonly MilestoneField[] = [
  { key: 'advisorIdentified', label: 'Advisor identified', section: '§2.3', program: 'both' },
  { key: 'researchQualifierPassed', label: 'Research qualifier passed — advisor filed the form', section: '§4.4.3', program: 'phd' },
  { key: 'qualifierFormFiled', label: 'Qualifier completion form filed with the Grad Admin', section: '§4.4', program: 'phd' },
  { key: 'candidacyPassed', label: 'Oral Candidacy Exam (OCE) passed', section: '§4.5', program: 'phd' },
  { key: 'dissertationApprovedForDefense', label: 'Dissertation approved for defense by all readers', section: '§4.6', program: 'phd' },
  { key: 'defensePassed', label: 'Dissertation defense passed', section: '§4.7', program: 'phd' },
  { key: 'thesisApprovedByReaders', label: 'Thesis approved by both readers', section: '§3.4', program: 'mscse' },
  { key: 'thesisDefensePassed', label: 'Thesis defense passed', section: '§3.4', program: 'mscse' },
  { key: 'projectReportAccepted', label: 'Project report accepted by advisor', section: '§3.4', program: 'mscse' },
];

/** Which milestone date a dated requirement row rests on. */
const ROW_MILESTONE: Record<string, keyof Milestones> = {
  'shared.advisor': 'advisorIdentified',
  'phd.qualifier.research': 'researchQualifierPassed',
  'phd.candidacy': 'candidacyPassed',
  'phd.dissertation.approval': 'dissertationApprovedForDefense',
  'phd.dissertation.defense': 'defensePassed',
  'ms.thesis.defense': 'thesisDefensePassed',
  'ms.project.report': 'projectReportAccepted',
};

export interface ProcessingTransfer {
  courseId: string;
  institution?: string;
  title?: string;
  credits: number;
  ndCredits?: number;
  grade: string;
  termText: string;
  /** `pre-approved`: ruled transferable in the ExternalCourses tab — to be
   * processed; `approved`: the student attests the DGS + Graduate School
   * approval — to be checked against the record. */
  state: 'pre-approved' | 'approved';
}

/** One met requirement as a table: what satisfies it. */
export interface MetTable {
  heading: string;
  columns: string[];
  rows: string[][];
}

/** One requirement, met or not, as the Grad Admin request prints it: the
 * page's status word, its colour, what meets it so far, and its deadline —
 * flagged when it falls in this semester or the next, or has passed. */
export interface StandingTable extends MetTable {
  word: string;
  color: StandingColor;
  deadline?: { text: string; alert?: 'this' | 'next' | 'passed' };
}

export interface ProcessingItems {
  transfers: ProcessingTransfer[];
  milestones: { label: string; date: string; section: string }[];
  advisorName?: string;
  msAlongTheWay: boolean;
  qualifierFormDue: boolean;
  /** Every met requirement (scored rows only), each with the courses,
   * semesters or date that satisfy it. */
  met: MetTable[];
  /** Every scored requirement, met or not (DGS 2026-09-28), in the order the
   * request prints them: overdue first, then met, conditionally met, in
   * progress, not started, cannot evaluate. */
  standing: StandingTable[];
  /** The counts behind the standing list, and the sentence that states them. */
  tally: { met: number; conditional: number; inProgress: number; notStarted: number; cannot: number; overdue: number; dueSoon: number; text: string };
  /** The card's item lines, one per processable thing. */
  lines: string[];
  /** transfers + milestones + the MSCSE + the qualifier form + every met
   * requirement (DGS 2026-09-06, late evening: anything met is worth sending
   * to the Grad Admin for the record, credits to transfer or not). */
  count: number;
}

const COURSE_COLUMNS = ['Course', 'Title', 'Credits', 'Grade', 'Term', 'Where'];

/** The table for one requirement (DGS 2026-09-06 evening): the courses the
 * engine says satisfy it — or, for an open row, the ones counted so far; the
 * semesters for residency; the date for a milestone; the figure for the GPA;
 * otherwise the row's own detail (which, for an open row, says what is still
 * missing). */
function metTable(r: RequirementResult, student: Student): MetTable {
  const heading = `${r.title} (${r.citation.section})`;
  const evidence = r.status === 'met' ? 'Evidence' : 'Progress';
  const byId = new Map<string, CourseEntry>();
  for (const c of student.courses) byId.set(c.courseId, c);
  const ids = r.satisfiedBy ?? [];
  if (ids.length > 0 && ids.every((id) => byId.has(id))) {
    return {
      heading,
      columns: COURSE_COLUMNS,
      rows: ids.map((id) => {
        const c = byId.get(id)!;
        return [c.courseId, c.title ?? '', formatCredits(c.credits), c.grade, termLabel(c.term), c.origin === 'nd' ? 'Notre Dame' : (c.institution ?? 'another university')];
      }),
    };
  }
  if (ids.length > 0) return { heading, columns: ['Semester'], rows: ids.map((s) => [s]) };
  const milestoneKey = ROW_MILESTONE[r.id];
  if (milestoneKey) {
    const date = student.milestones[milestoneKey];
    const rows: string[][] = [['Date', typeof date === 'string' && date !== '' ? date : 'not entered']];
    if (r.id === 'shared.advisor') {
      const names = [student.milestones.advisorName, student.milestones.advisorName2].filter((n): n is string => !!n);
      rows.unshift([names.length > 1 ? 'Advisors' : 'Advisor', names.length > 0 ? names.join(' and ') : 'name not entered']);
    }
    return { heading, columns: ['What', evidence], rows };
  }
  if (r.id === 'shared.gpa') return { heading, columns: ['What', evidence], rows: [['Cumulative GPA', student.gpa !== undefined ? student.gpa.toFixed(2) : 'not entered']] };
  return { heading, columns: [evidence], rows: [[r.detail || statusWord(r).toLowerCase()]] };
}

const STANDING_ORDER: Record<StandingColor, number> = { red: 0, green: 1, blue: 2, amber: 3, grey: 4 };

/** Every scored requirement as the request prints it (DGS 2026-09-28). */
function standingTable(r: RequirementResult, student: Student): StandingTable {
  // A done deadline is the milestone's own date, already in the table.
  const alert = deadlineAlert(r);
  const deadline = alert === null ? undefined : { text: r.deadline!.label, ...(alert ? { alert } : {}) };
  const table = metTable(r, student);
  // A row whose only "progress" would be its own status word (the years limit,
  // whose deadline chip says everything) prints no table.
  const rows = table.rows.length === 1 && table.rows[0]!.length === 1 && table.rows[0]![0] === statusWord(r).toLowerCase() ? [] : table.rows;
  return { ...table, rows, word: statusWord(r), color: standingColor(r), ...(deadline ? { deadline } : {}) };
}

/** `classified` — the engine's classification of the student's courses, when
 * the caller already has it for this record (app.ts classifies once per
 * render); otherwise it is computed here. */
export function processingItems(report: AuditReport, student: Student, rules: Rules, classified?: readonly ClassifiedCourse[]): ProcessingItems {
  classified ??= classify(student, rules).classified;
  // The DGS's approval for this student is on the course (2026-09-27).
  const approvedForMe = (c: ClassifiedCourse): boolean => c.entry.dgsApproved === true && decidedCaseByCase(c, student.program);
  const transfers: ProcessingTransfer[] = classified
    .filter(
      (c) =>
        c.entry.origin === 'transfer' &&
        c.entry.degreeLevel !== 'bachelors' &&
        !c.superseded &&
        c.pool !== 'none' && // the §5.2 floors the engine applies (grade, window, the bachelor's award term) are final
        // A course that still needs an approval is NOT processable
        // (2026-09-08). Only `yes` for this student's program, or their
        // attestation that the approval came through, reaches the Grad Admin.
        (c.transferable === 'yes' || approvedForMe(c)),
    )
    .map((c) => ({
      courseId: c.entry.courseId,
      institution: c.entry.institution,
      title: c.entry.title ?? c.external?.title,
      credits: c.entry.credits,
      ndCredits: c.effectiveCredits,
      grade: c.entry.grade,
      termText: termLabel(c.entry.term),
      state: approvedForMe(c) ? 'approved' : 'pre-approved',
    }));
  const milestones = MILESTONE_FIELDS.filter((f) => f.program === 'both' || f.program === student.program).flatMap((f) => {
    const date = student.milestones[f.key];
    return typeof date === 'string' && date !== '' ? [{ label: f.label, date, section: f.section }] : [];
  });
  const byId = new Map(report.requirements.map((r) => [r.id, r]));
  const msAlongTheWay = byId.get('phd.msAlongTheWay')?.status === 'met';
  // A pass attested under the earlier rules (2026-09-21) was recorded back then; no form to chase.
  const qualifierFormDue = byId.get('phd.qualifier')?.status === 'met' && !student.milestones.qualifierFormFiled && student.attestations.qualifierPassedUnderPriorRules !== true;
  // Every scored row, met or not (DGS 2026-09-28); the Approvals row is the
  // DGS's errand list, not a standing. Overdue rows lead, then the page's
  // order of colours; within a colour, the report's own order.
  // The transfer row is left out too: the transfer sections above carry what
  // the Grad Admin may process, and a course still waiting for the DGS must
  // not reach them by another door (2026-09-08).
  const standing = scoredRows(report)
    .filter((r) => r.group !== 'Approvals' && !r.id.endsWith('.transfer'))
    .map((r) => standingTable(r, student))
    .sort((a, b) => STANDING_ORDER[a.color] - STANDING_ORDER[b.color] || (a.word === 'Not started' ? 0 : 1) - (b.word === 'Not started' ? 0 : 1));
  const met = report.requirements
    .filter((r) => r.status === 'met' && !r.informational && r.group !== 'Approvals')
    .map((r) => metTable(r, student));
  const tally = {
    met: standing.filter((s) => s.color === 'green').length,
    conditional: standing.filter((s) => s.color === 'blue').length,
    inProgress: standing.filter((s) => s.color === 'amber').length,
    notStarted: standing.filter((s) => s.color === 'grey' && s.word === 'Not started').length,
    cannot: standing.filter((s) => s.color === 'grey' && s.word !== 'Not started').length,
    overdue: standing.filter((s) => s.color === 'red').length,
    dueSoon: standing.filter((s) => s.deadline?.alert === 'this' || s.deadline?.alert === 'next').length,
  };
  const tallyText = [
    `${plural(tally.met, 'requirement')} met`,
    ...(tally.overdue > 0 ? [`${tally.overdue} overdue`] : []),
    ...(tally.conditional > 0 ? [`${tally.conditional} conditionally met`] : []),
    `${tally.inProgress} in progress`,
    `${tally.notStarted} not started`,
    ...(tally.cannot > 0 ? [`${tally.cannot} cannot be evaluated`] : []),
  ].join(', ');
  const lines = [
    ...transfers.map(
      (t) =>
        `${t.courseId}${t.institution ? ` (${t.institution})` : ''} — transfer credit ${t.state === 'approved' ? 'approved by the DGS for my case (§5.2), to be processed' : 'approved by the DGS in the course rules, to be processed (§5.2)'}`,
    ),
    ...milestones.map((m) => `${m.label} ${m.date} (${m.section})`),
    ...(qualifierFormDue ? ['Qualifier completion form — not filed yet (§4.4)'] : []),
    ...(msAlongTheWay ? ['MSCSE along the way — the self-check shows its requirements met (§4.5)'] : []),
    ...(met.length > 0
      ? [`${tallyText} — the request lists every requirement with its standing, what meets it so far and its deadline${tally.dueSoon > 0 ? ` (${plural(tally.dueSoon, 'deadline')} in this semester or the next, highlighted)` : ''}, for the record`]
      : []),
  ];
  return {
    transfers,
    milestones,
    advisorName: [student.milestones.advisorName, student.milestones.advisorName2].filter((n): n is string => !!n).join(' and ') || undefined,
    msAlongTheWay,
    qualifierFormDue,
    met,
    standing,
    tally: { ...tally, text: tallyText },
    lines,
    // The met requirements are ONE line on the card, so they are one item in
    // the chip (2026-09-08): "8 items" above two lines was never explainable.
    count: transfers.length + milestones.length + (qualifierFormDue ? 1 : 0) + (msAlongTheWay ? 1 : 0) + (met.length > 0 ? 1 : 0),
  };
}

export interface GradAdminRequestOptions {
  todayIso: string;
  entryTerm: string;
  /** The "Prior graduate study" choice as the page labels it. */
  priorStudy: string;
  gpa?: number;
}

export function gradAdminRequest(
  report: AuditReport,
  student: Student,
  rules: Rules,
  opts: GradAdminRequestOptions,
  classified?: readonly ClassifiedCourse[],
): { subject: string; text: string; html: string; items: ProcessingItems } {
  const items = processingItems(report, student, rules, classified);
  const subject = `Processing request (degree self-check) — ${programShort(report.program)}, entered ${opts.entryTerm}`;
  const asOf = formatYmdLong(opts.todayIso.slice(0, 10)) ?? opts.todayIso.slice(0, 10);
  const prior = opts.priorStudy.charAt(0).toLowerCase() + opts.priorStudy.slice(1);
  // "in cc" said once, in the intro; the closing's "The DGS is in cc." repeated
  // the Cc line the mail client shows (trim review 2026-09-18, P-12).
  const intro =
    'Could you process the items below for my degree record? The DGS, in cc, decides eligibility; this request is only for processing what has already been decided.';
  const standing =
    `My standing from the CSE degree self-check tool, as of ${asOf}: ${programLabel(report.program)}; entered ${opts.entryTerm}; ${prior}; ` +
    `cumulative GPA ${opts.gpa !== undefined ? opts.gpa.toFixed(2) : 'not entered yet'}.`;
  // (The self-check file is no longer attached — DGS 2026-09-15.) The
  // "whichever apply" hedge instructs the student and lives in the dialog step
  // (trim review 2026-09-18, P-14). Asked for only when there is transfer
  // credit to process — nothing else in this request is decided from a
  // transcript (P-45); the dialog step and the card hint follow the same
  // condition (app.ts, items.transfers.length > 0).
  const attached = items.transfers.length > 0 ? 'Attached: my original transcripts as PDFs.' : '';
  const closing =
    'Generated by the CSE degree self-check tool (alpha version under testing; informational only — every decision rests with the DGS).';

  const TRANSFER_COLUMNS = ['University', 'Course', 'Title', 'Credits', 'ND credits', 'Grade', 'Term'];
  const transferRow = (t: ProcessingTransfer): string[] => [
    t.institution ?? '',
    t.courseId,
    t.title ?? '',
    String(t.credits),
    t.ndCredits !== undefined ? formatCredits(t.ndCredits) : '',
    t.grade,
    t.termText,
  ];
  type Section = { heading: string; badge?: { word: string; color: StandingColor }; deadline?: StandingTable['deadline']; columns?: string[]; table?: string[][]; lines?: string[] };
  const sections: Section[] = [];
  const pre = items.transfers.filter((t) => t.state === 'pre-approved');
  const approved = items.transfers.filter((t) => t.state === 'approved');
  if (pre.length > 0) {
    sections.push({
      // The "Attached:" line above already says the transcripts are attached
      // (trim review 2026-09-18, P-43).
      heading: 'Transfer credit to process (§5.2) — approved by the DGS in the course rules',
      columns: TRANSFER_COLUMNS,
      table: pre.map(transferRow),
    });
  }
  if (approved.length > 0) {
    sections.push({ heading: 'Transfer credit already approved (§5.2) — please check it is on my record', columns: TRANSFER_COLUMNS, table: approved.map(transferRow) });
  }
  if (items.qualifierFormDue) {
    sections.push({
      heading: 'Qualifier completion form (§4.4)',
      lines: ['The self-check shows every qualifier component complete, and the completion form is not filed yet — please tell me what you need from me.'],
    });
  }
  if (items.msAlongTheWay) {
    sections.push({
      heading: 'MSCSE along the way (§4.5)',
      lines: ['The self-check shows the requirements for the MSCSE along the way met (the Oral Candidacy Exam (OCE) passed, the M.S. coursework completed at Notre Dame) — please process the award.'],
    });
  }
  // Every requirement, met or not, with what satisfies it so far (2026-09-06
  // evening; the open rows since 2026-09-28): the page's status word as a
  // coloured badge, and the deadline highlighted when it is this semester,
  // next semester, or already past.
  sections.push({
    heading: 'My standing, requirement by requirement',
    lines: [`${items.tally.text}.`, ...(items.tally.dueSoon > 0 ? [`${plural(items.tally.dueSoon, 'deadline')} in this semester or the next — highlighted below.`] : [])],
  });
  for (const t of items.standing) sections.push({ heading: t.heading, badge: { word: t.word, color: t.color }, deadline: t.deadline, ...(t.rows.length > 0 ? { columns: t.columns, table: t.rows } : {}) });

  // ---- plain text ----
  // Plain text has no colour: the badge is a [WORD] tag before the heading,
  // and a near or passed deadline a "!!" line under it (email-html.ts — the
  // advisor summary prints the same).
  const textSection = (s: Section): string =>
    `${s.badge ? `[${s.badge.word.toUpperCase()}] ${s.heading}` : s.heading.toUpperCase()}\n` +
    (s.deadline ? `${textDeadline(s.deadline.text, s.deadline.alert)}\n` : '') +
    (s.table && s.columns ? `${s.columns.join('\t')}\n${s.table.map((r) => r.join('\t')).join('\n')}\n` : '') +
    (s.lines && s.lines.length > 0 ? s.lines.map((l) => `- ${l}`).join('\n') + '\n' : '') +
    '\n';
  const text =
    `Subject: ${subject}\n\nDear Grad Admin,\n\n${intro}\n${standing}\n${attached ? `${attached}\n` : ''}\nThank you!\n\n` +
    `${EDITABLE_MARKER}\n${MARKER_DIVIDER}\n${DO_NOT_MODIFY_MARKER}\n\n` +
    (sections.length > 0 ? sections.map(textSection).join('') : 'Nothing to process yet.\n\n') +
    `${closing}\n`;

  // ---- HTML ----
  const htmlTable = (columns: string[], rows: string[][]): string =>
    `<table border="1" cellspacing="0" cellpadding="4"><tr>${columns.map((h) => `<th>${esc(h)}</th>`).join('')}</tr>` +
    rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('') +
    '</table>';
  // The badge and the deadline box are the shared style (email-html.ts).
  const htmlSection = (s: Section): string =>
    `<p>${s.badge ? `${htmlBadge(s.badge.word, s.badge.color)} ` : ''}<strong>${esc(s.heading)}</strong></p>` +
    (s.deadline ? htmlDeadline(s.deadline.text, s.deadline.alert) : '') +
    (s.table && s.columns ? htmlTable(s.columns, s.table) : '') +
    (s.lines ? `<ul>${s.lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>` : '');
  const html =
    `<p>Subject: ${esc(subject)}</p><p>Dear Grad Admin,</p><p>${esc(intro)}<br>${esc(standing)}${attached ? `<br><strong>${esc(attached)}</strong>` : ''}</p><p>Thank you!</p>` +
    `<p><strong>${esc(EDITABLE_MARKER)}</strong></p><hr><p><strong>${esc(DO_NOT_MODIFY_MARKER)}</strong></p>` +
    (sections.length > 0 ? sections.map(htmlSection).join('') : '<p>Nothing to process yet.</p>') +
    `<p>${esc(closing)}</p>`;

  // "Oral Candidacy Exam (OCE)" once per flavour, then "OCE" (2026-09-06 evening).
  const p = student.program;
  return { subject: decisionWording(p, subject), text: decisionWording(p, shortenAfterFirst(text)), html: decisionWording(p, shortenAfterFirst(html)), items: { ...items, lines: items.lines.map((l) => decisionWording(p, l)) } };
}
