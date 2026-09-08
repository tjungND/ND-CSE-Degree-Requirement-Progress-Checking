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
// — with the DGS in cc. Like the review request, the student's own words stay
// above a marker line and the tables below it are not to be modified. Never
// the word "audit" (the page is a self-check).
import { formatCredits } from '../engine/credits.ts';
import type { Rules } from '../data/types.ts';
import { classify } from '../engine/allocate.ts';
import { termLabel } from '../engine/term.ts';
import type { AuditReport, CourseEntry, Milestones, RequirementResult, Student } from '../engine/types.ts';
import { DO_NOT_MODIFY_MARKER, EDITABLE_MARKER, MARKER_DIVIDER } from '../transcript/external.ts';
import { shortenAfterFirst } from './first-mention.ts';
import { formatYmdLong } from './handbook.ts';

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

export interface ProcessingItems {
  transfers: ProcessingTransfer[];
  milestones: { label: string; date: string; section: string }[];
  advisorName?: string;
  msAlongTheWay: boolean;
  qualifierFormDue: boolean;
  /** Every met requirement (scored rows only), each with the courses,
   * semesters or date that satisfy it. */
  met: MetTable[];
  /** The card's item lines, one per processable thing. */
  lines: string[];
  /** transfers + milestones + the MSCSE + the qualifier form + every met
   * requirement (DGS 2026-09-06, late evening: anything met is worth sending
   * to the Grad Admin for the record, credits to transfer or not). */
  count: number;
}

const COURSE_COLUMNS = ['Course', 'Title', 'Credits', 'Grade', 'Term', 'Where'];

/** The table for one met requirement (DGS 2026-09-06 evening): the courses
 * the engine says satisfy it; the semesters for residency; the date for a
 * milestone; the figure for the GPA; otherwise the row's own detail. */
function metTable(r: RequirementResult, student: Student): MetTable {
  const heading = `${r.title} (${r.citation.section})`;
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
    if (r.id === 'shared.advisor') rows.unshift(['Advisor', student.milestones.advisorName ?? 'name not entered']);
    return { heading, columns: ['What', 'Evidence'], rows };
  }
  if (r.id === 'shared.gpa') return { heading, columns: ['What', 'Evidence'], rows: [['Cumulative GPA', student.gpa !== undefined ? student.gpa.toFixed(2) : 'not entered']] };
  return { heading, columns: ['Evidence'], rows: [[r.detail || 'met']] };
}

export function processingItems(report: AuditReport, student: Student, rules: Rules): ProcessingItems {
  const { classified } = classify(student, rules);
  const attested = student.attestations.transferApproved === true;
  const transfers: ProcessingTransfer[] = classified
    .filter(
      (c) =>
        c.entry.origin === 'transfer' &&
        c.entry.degreeLevel !== 'bachelors' &&
        !c.superseded &&
        c.pool !== 'none' && // the §5.2 floors the engine applies (grade, window, the bachelor's award term) are final
        (c.external?.transferable === true || attested),
    )
    .map((c) => ({
      courseId: c.entry.courseId,
      institution: c.entry.institution,
      title: c.entry.title ?? c.external?.title,
      credits: c.entry.credits,
      ndCredits: c.effectiveCredits,
      grade: c.entry.grade,
      termText: termLabel(c.entry.term),
      state: attested ? 'approved' : 'pre-approved',
    }));
  const milestones = MILESTONE_FIELDS.filter((f) => f.program === 'both' || f.program === student.program).flatMap((f) => {
    const date = student.milestones[f.key];
    return typeof date === 'string' && date !== '' ? [{ label: f.label, date, section: f.section }] : [];
  });
  const byId = new Map(report.requirements.map((r) => [r.id, r]));
  const msAlongTheWay = byId.get('phd.msAlongTheWay')?.status === 'met';
  const qualifierFormDue = byId.get('phd.qualifier')?.status === 'met' && !student.milestones.qualifierFormFiled;
  const met = report.requirements
    .filter((r) => r.status === 'met' && !r.informational && r.group !== 'Approvals')
    .map((r) => metTable(r, student));
  const lines = [
    ...transfers.map(
      (t) =>
        `${t.courseId}${t.institution ? ` (${t.institution})` : ''} — transfer credit ${t.state === 'approved' ? 'approved by the DGS and the Graduate School (§5.2), please check it is recorded' : 'pre-approved by the DGS, to be processed (§5.2)'}`,
    ),
    ...milestones.map((m) => `${m.label} ${m.date} (${m.section})`),
    ...(qualifierFormDue ? ['Qualifier completion form — not filed yet (§4.4)'] : []),
    ...(msAlongTheWay ? ['MSCSE along the way — the self-check shows its requirements met (§4.5)'] : []),
    ...(met.length > 0
      ? [`${met.length} requirement${met.length === 1 ? '' : 's'} met so far — the request lists each with the courses, semesters or dates that meet it, for the record`]
      : []),
  ];
  return {
    transfers,
    milestones,
    advisorName: student.milestones.advisorName,
    msAlongTheWay,
    qualifierFormDue,
    met,
    lines,
    count: transfers.length + milestones.length + (qualifierFormDue ? 1 : 0) + (msAlongTheWay ? 1 : 0) + met.length,
  };
}

export interface GradAdminRequestOptions {
  todayIso: string;
  entryTerm: string;
  /** The "Prior graduate study" choice as the page labels it. */
  priorStudy: string;
  gpa?: number;
}

/** The name of the file "Save to a file" writes (state.ts exportFile). */
export function selfCheckFileName(program: Student['program']): string {
  return `cse-degree-audit-${program}.json`;
}

export function gradAdminRequest(
  report: AuditReport,
  student: Student,
  rules: Rules,
  opts: GradAdminRequestOptions,
): { subject: string; text: string; html: string; items: ProcessingItems } {
  const items = processingItems(report, student, rules);
  const programShort = report.program === 'mscse' ? 'M.S. in CSE' : 'Ph.D.';
  const programLabel = report.program === 'mscse' ? 'M.S. in CSE (Handbook §3)' : 'Ph.D. (Handbook §4)';
  const subject = `Processing request (degree self-check) — ${programShort}, entered ${opts.entryTerm}`;
  const asOf = formatYmdLong(opts.todayIso.slice(0, 10)) ?? opts.todayIso.slice(0, 10);
  const prior = opts.priorStudy.charAt(0).toLowerCase() + opts.priorStudy.slice(1);
  const intro =
    'Could you process the items below for my degree record? The DGS decides eligibility by the course rules; this request is only for the processing of what has already been decided.';
  const standing =
    `My standing from the CSE degree self-check tool, as of ${asOf}: ${programLabel}; entered ${opts.entryTerm}; ${prior}; ` +
    `cumulative GPA ${opts.gpa !== undefined ? opts.gpa.toFixed(2) : 'not entered yet'}.`;
  const attached = `Attached: my original transcripts as PDFs (Bachelor’s / Master’s / Ph.D., whichever apply) and my self-check file (${selfCheckFileName(student.program)}).`;
  const closing =
    'The DGS is in cc. Generated by the CSE degree self-check tool (alpha version under testing; informational only — every decision rests with the DGS).';

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
  type Section = { heading: string; columns?: string[]; table?: string[][]; lines?: string[] };
  const sections: Section[] = [];
  const pre = items.transfers.filter((t) => t.state === 'pre-approved');
  const approved = items.transfers.filter((t) => t.state === 'approved');
  if (pre.length > 0) {
    sections.push({
      heading: 'Transfer credit to process (§5.2) — ruled transferable by the DGS in the external-course rules; my original transcripts are attached',
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
  // Every met requirement, with what satisfies it (2026-09-06 evening).
  for (const t of items.met) sections.push({ heading: `Met — ${t.heading}`, columns: t.columns, table: t.rows });

  // ---- plain text ----
  const textSection = (s: Section): string =>
    `${s.heading.toUpperCase()}\n` +
    (s.table && s.columns ? `${s.columns.join('\t')}\n${s.table.map((r) => r.join('\t')).join('\n')}\n` : '') +
    (s.lines ? s.lines.map((l) => `- ${l}`).join('\n') + '\n' : '') +
    '\n';
  const text =
    `Subject: ${subject}\n\nDear Grad Admin,\n\n${intro}\n${standing}\n${attached}\n\nThank you!\n\n` +
    `${EDITABLE_MARKER}\n${MARKER_DIVIDER}\n${DO_NOT_MODIFY_MARKER}\n\n` +
    (sections.length > 0 ? sections.map(textSection).join('') : 'Nothing to process yet.\n\n') +
    `${closing}\n`;

  // ---- HTML ----
  const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const htmlTable = (columns: string[], rows: string[][]): string =>
    `<table border="1" cellspacing="0" cellpadding="4"><tr>${columns.map((h) => `<th>${esc(h)}</th>`).join('')}</tr>` +
    rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('') +
    '</table>';
  const htmlSection = (s: Section): string =>
    `<p><strong>${esc(s.heading)}</strong></p>` +
    (s.table && s.columns ? htmlTable(s.columns, s.table) : '') +
    (s.lines ? `<ul>${s.lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>` : '');
  const html =
    `<p>Subject: ${esc(subject)}</p><p>Dear Grad Admin,</p><p>${esc(intro)}<br>${esc(standing)}<br><strong>${esc(attached)}</strong></p><p>Thank you!</p>` +
    `<p><strong>${esc(EDITABLE_MARKER)}</strong></p><hr><p><strong>${esc(DO_NOT_MODIFY_MARKER)}</strong></p>` +
    (sections.length > 0 ? sections.map(htmlSection).join('') : '<p>Nothing to process yet.</p>') +
    `<p>${esc(closing)}</p>`;

  // "Oral Candidacy Exam (OCE)" once per flavour, then "OCE" (2026-09-06 evening).
  return { subject, text: shortenAfterFirst(text), html: shortenAfterFirst(html), items };
}
