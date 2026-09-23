// The "Copy summary for advisor" email — pure string building over an
// AuditReport (no DOM), in two clipboard flavors: plain text, and HTML that
// pastes cleanly into Gmail/Outlook (tables, inline styles only — email
// clients drop stylesheets).
//
// Shape (DGS request 2026-09-06, replacing the attention-first design of the
// same morning): the requirements in HANDBOOK ORDER — one section per group
// (§2.2–2.3, §4.2, §4.3, §4.4, §4.5, §4.6–4.7; §3.x for the M.S.), each row
// coloured by status — green when met, amber while in progress or awaiting a
// DGS decision, red when not yet met or not evaluable — with its "why" and
// deadline (semesters, DGS 2026-09-05); then three TO-DO lists derived from
// the same rows: what the student, the advisor, the DGS (eligibility) and,
// since 2026-09-06, the Grad Admin (processing) each need to do.
// Kept from the morning's design: the subject line with the headline facts,
// the one standing paragraph, the deadline footnote and the alpha notice; the
// re-voicing of the engine's student-facing details (`whyFor`).
import type { AuditReport, Contribution, DetailPart, RequirementResult, Status } from '../engine/types.ts';
import { formatCredits } from '../engine/credits.ts';
import { deadlineTermLabel, dueTermPhrase } from '../engine/term.ts';
import { shortenAfterFirst } from './first-mention.ts';
import { decisionWording } from '../engine/decider.ts';
import { esc, plural, programLabel, programShort } from './email-html.ts';
import { BETA_NOTICE, HANDBOOK_EDITION, HANDBOOK_URL, formatYmdLong } from './handbook.ts';
import { isNotStarted, scoredRows } from './report.ts';

export interface AdvisorSummaryOptions {
  todayIso: string;
  entryTerm: string;
  /** The "Prior graduate study" choice as the page labels it. */
  priorStudy: string;
  gpa?: number;
  /** Two advisors (DGS 2026-09-22): the salutation and the to-do heading say so. */
  twoAdvisors?: boolean;
}

/** The page's palette, inline because email clients drop stylesheets. */
export const COLORS = { green: '#10693f', amber: '#8e5108', red: '#a81e14', grey: '#5b6472' } as const;
type Color = keyof typeof COLORS;

/** Status word (the page's) and colour per status. */
const STATUS_TAG: Record<Status, { word: string; color: Color }> = {
  met: { word: 'MET', color: 'green' },
  in_progress: { word: 'IN PROGRESS', color: 'amber' },
  // The page's word since W-CS1 (2026-09-18); the email matched it in the trim
  // review (P-59). The Why column still names who must approve.
  needs_dgs_review: { word: 'CONDITIONALLY MET', color: 'amber' },
  // "Not yet" and "In progress" were two words for one thing to the reader
  // (DGS 2026-09-22: "If they are the same, choose 'In progress'"); a passed
  // deadline is the one case that is not the same, and reads OVERDUE (tagFor).
  unmet: { word: 'IN PROGRESS', color: 'amber' },
  cannot_evaluate: { word: 'CANNOT EVALUATE', color: 'red' },
  not_applicable: { word: 'DOES NOT APPLY', color: 'green' },
};

export function advisorSummary(report: AuditReport, opts: AdvisorSummaryOptions): { text: string; html: string; subject: string } {
  const rows = report.requirements;
  // Counts as the page's headline counts them (scoredRows, report.ts).
  const scored = scoredRows(report);
  const count = (status: Status) => scored.filter((r) => r.status === status).length;
  const n = {
    met: report.summary.met,
    scored: report.summary.scored,
    unmet: count('unmet'),
    inProgress: count('in_progress'),
    waiting: count('needs_dgs_review'),
    unchecked: count('cannot_evaluate'),
    overdue: scored.filter((r) => r.status === 'unmet' && r.deadline?.state === 'overdue').length,
  };

  // One number for what is still open (DGS 2026-09-22: "Not yet" and "In
  // progress" merged into "in progress"); a passed deadline is said apart.
  const notStarted = scored.filter(isNotStarted).length;
  const open = n.unmet + n.inProgress - notStarted;
  const headlineFact =
    n.scored > 0 && n.met === n.scored
      ? 'all checked requirements met'
      : open > 0
        ? `${plural(open, 'requirement')} in progress${n.overdue > 0 ? `, ${plural(n.overdue, 'deadline')} passed` : ''}`
        : `${n.met} of ${n.scored} met${n.waiting > 0 ? `, ${n.waiting} conditionally met` : ''}`;
  const subject = `Degree self-check — ${programShort(report.program)}, entered ${opts.entryTerm} — ${headlineFact}`;
  const asOf = formatYmdLong(opts.todayIso.slice(0, 10)) ?? opts.todayIso.slice(0, 10);
  const intro = `Here is my current standing from the CSE degree self-check tool, as of ${asOf}.`;
  const prior = opts.priorStudy.charAt(0).toLowerCase() + opts.priorStudy.slice(1);
  const standing =
    `${programLabel(report.program)}; entered ${opts.entryTerm}; ${prior}; ` +
    `cumulative GPA ${opts.gpa !== undefined ? opts.gpa.toFixed(2) : 'not entered yet'}.`;
  const counts = [
    `${n.met} of ${n.scored} requirements met`,
    ...(open > 0 ? [`${open} in progress`] : []),
    ...(n.overdue > 0 ? [`${plural(n.overdue, 'deadline')} passed`] : []),
    ...(notStarted > 0 ? [`${notStarted} not started`] : []),
    ...(n.waiting > 0 ? [`${n.waiting} conditionally met`] : []),
    ...(n.unchecked > 0 ? [`${n.unchecked} cannot be evaluated`] : []),
  ].join(' · ');

  // ---- sections in handbook order ----
  // The report's groups already follow the handbook (§2 → §3/§4 in order);
  // first-seen order keeps it. Informational rows and "does not apply" rows
  // are left out; the per-course sign-off list ("Approvals") feeds the to-do
  // lists instead of standing as a section.
  const listed = rows.filter((r) => !r.informational && r.status !== 'not_applicable' && r.group !== 'Approvals');
  const sections: { heading: string; rows: RequirementResult[] }[] = [];
  for (const r of listed) {
    let s = sections.find((x) => x.heading === r.group);
    if (!s) {
      s = { heading: r.group, rows: [] };
      sections.push(s);
    }
    s.rows.push(r);
  }

  const todo = actionItems(report);
  const deadlineNote = listed.some((r) => deadlineOf(r) !== undefined)
    ? `Deadlines are counted from ${opts.entryTerm} and given by semester; they are approximate — the registrar's calendar sets the exact dates.`
    : '';
  const statusNote = `Alpha version under testing. ${BETA_NOTICE} Checked against the CSE Graduate Studies Handbook, ${HANDBOOK_EDITION} (${HANDBOOK_URL}).`;

  // The tag: the page's per-row label when the engine set one (W-CS2,
  // "Eligibility at risk" for a defense past §4.3's limit), else the status
  // word — so the advisor never reads "conditionally met" for a row the page
  // shows as at risk (trim review 2026-09-18, P-59).
  const tagFor = (r: RequirementResult): { word: string; color: Color } =>
    r.statusLabel
      ? { word: r.statusLabel.toUpperCase(), color: STATUS_TAG[r.status].color }
      : r.status === 'unmet' && r.deadline?.state === 'overdue'
        ? { word: 'OVERDUE', color: 'red' }
        : isNotStarted(r)
          ? { word: 'NOT STARTED', color: 'grey' }
          : STATUS_TAG[r.status];
  // The courses a credit requirement counts, for the advisor (DGS 2026-09-22:
  // "list all the courses that are used to satisfy the requirements in the
  // Why column") — the same list the page folds under "Courses counted".
  const coursesFor = (r: RequirementResult): string => {
    const counted = (r.contributions ?? []).filter((c) => !c.pending);
    const pending = (r.contributions ?? []).filter((c) => c.pending);
    const fmt = (c: Contribution) => `${c.courseId} (${formatCredits(c.credits)} cr)`;
    const parts = [
      counted.length > 0 ? `Courses counted: ${counted.map(fmt).join(', ')}.` : '',
      pending.length > 0 ? `Will count when passed or approved: ${pending.map(fmt).join(', ')}.` : '',
    ].filter(Boolean);
    return parts.join(' ');
  };
  const whyCell = (r: RequirementResult): string => [r.status === 'met' ? '' : whyFor(r), coursesFor(r)].filter(Boolean).join(' ');
  // The DGS and Grad Admin lists print only when they hold something; two
  // headings announcing that two absent people have nothing to do were filler
  // for the advisor. One sentence keeps all four parties accounted for (trim
  // review 2026-09-18, P-9). The student and advisor lists always print.
  const nothingPending = (): string =>
    todo.dgs.length === 0 && todo.gradAdmin.length === 0
      ? 'Nothing is pending with the DGS or the Grad Admin.'
      : todo.dgs.length === 0
        ? 'Nothing is pending with the DGS.'
        : todo.gradAdmin.length === 0
          ? 'Nothing is pending with the Grad Admin.'
          : '';

  // ---- plain text ----
  const line = (r: RequirementResult): string => {
    const tag = tagFor(r);
    const due = deadlineOf(r);
    const parts = [whyCell(r), due ? `${due.text}.` : ''].filter(Boolean);
    return `[${tag.word}] ${r.title} (${r.citation.section})${parts.length ? ` — ${parts.join(' ')}` : ''}`;
  };
  const todoText = (heading: string, items: string[]) =>
    `${heading}\n${items.length > 0 ? items.map((i) => `- ${i}`).join('\n') : '- Nothing at the moment.'}\n\n`;
  const pendingText = nothingPending();
  // Sign-off before the footnotes: a letter ends with "Thank you!", and the
  // deadline note and the alpha notice read as footnotes below it, as in the
  // Grad Admin request (trim review 2026-09-18, P-73).
  const text =
    `Subject: ${subject}\n\nDear ${opts.twoAdvisors ? 'Advisors' : 'Advisor'},\n\n${intro}\n${standing}\n${counts}.\n\n` +
    sections.map((s) => `${s.heading.toUpperCase()}\n${s.rows.map((r) => `  ${line(r)}`).join('\n')}\n\n`).join('') +
    todoText('WHAT I NEED TO DO', todo.student) +
    todoText(opts.twoAdvisors ? 'WHAT I NEED FROM YOU, MY ADVISORS' : 'WHAT I NEED FROM YOU, MY ADVISOR', todo.advisor) +
    (todo.dgs.length > 0 ? todoText('WHAT THE DGS NEEDS TO DO', todo.dgs) : '') +
    (todo.gradAdmin.length > 0 ? todoText('WHAT THE GRAD ADMIN NEEDS TO DO', todo.gradAdmin) : '') +
    (pendingText ? `${pendingText}\n\n` : '') +
    `Thank you!\n\n${deadlineNote ? `${deadlineNote}\n` : ''}${statusNote}\n`;

  // ---- HTML ----
  const colored = (color: Color, inner: string) => `<span style="color:${COLORS[color]};font-weight:bold">${inner}</span>`;
  const htmlSection = (s: { heading: string; rows: RequirementResult[] }): string => {
    const withDeadline = s.rows.some((r) => deadlineOf(r) !== undefined);
    return (
      `<p><strong>${esc(s.heading)}</strong></p>` +
      `<table border="1" cellspacing="0" cellpadding="4"><tr><th>Status</th><th>Requirement</th><th>§</th><th>Why</th>${withDeadline ? '<th>Deadline</th>' : ''}</tr>` +
      s.rows
        .map((r) => {
          const tag = tagFor(r);
          const due = deadlineOf(r);
          const dueCell = due ? (due.passed ? colored('red', esc(due.text)) : esc(due.text)) : '';
          return (
            `<tr><td>${colored(tag.color, esc(tag.word))}</td><td>${colored(tag.color, esc(r.title))}</td><td>${esc(r.citation.section)}</td>` +
            `<td>${esc(whyCell(r))}</td>${withDeadline ? `<td>${dueCell}</td>` : ''}</tr>`
          );
        })
        .join('') +
      `</table>`
    );
  };
  const todoHtml = (heading: string, items: string[]) =>
    `<p><strong>${esc(heading)}</strong></p><ul>${(items.length > 0 ? items : ['Nothing at the moment.']).map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`;
  const html =
    `<p>Subject: ${esc(subject)}</p><p>Dear ${opts.twoAdvisors ? 'Advisors' : 'Advisor'},</p>` +
    `<p>${esc(intro)}<br>${esc(standing)}<br><strong>${esc(counts)}.</strong></p>` +
    sections.map(htmlSection).join('') +
    todoHtml('What I need to do', todo.student) +
    todoHtml(opts.twoAdvisors ? 'What I need from you, my advisors' : 'What I need from you, my advisor', todo.advisor) +
    (todo.dgs.length > 0 ? todoHtml('What the DGS needs to do', todo.dgs) : '') +
    (todo.gradAdmin.length > 0 ? todoHtml('What the Grad Admin needs to do', todo.gradAdmin) : '') +
    (pendingText ? `<p>${esc(pendingText)}</p>` : '') +
    `<p>Thank you!</p>` +
    (deadlineNote ? `<p>${esc(deadlineNote)}</p>` : '') +
    `<p>${esc(statusNote)}</p>`;
  // "Oral Candidacy Exam (OCE)" once per flavour, then "OCE" (2026-09-06 evening).
  return { text: decisionWording(report.program, shortenAfterFirst(text)), html: decisionWording(report.program, shortenAfterFirst(html)), subject: decisionWording(report.program, subject) };
}

/** "Due by the end of Spring 2028" / "Deadline passed (was due during Spring
 * 2028)": a SEMESTER, never a date (DGS 2026-09-05); the footnote says once
 * that semesters are approximate, so the lines do not repeat it. */
function deadlineOf(r: RequirementResult): { text: string; passed: boolean } | undefined {
  const d = r.deadline;
  if (!d || d.state === 'done' || r.status === 'met') return undefined;
  return d.state === 'overdue'
    ? { text: `Deadline passed (was due ${dueTermPhrase(d.date)})`, passed: true }
    : { text: `Due ${dueTermPhrase(d.date)}`, passed: false };
}

// ---------- the three to-do lists ----------

export interface ActionItems {
  student: string[];
  advisor: string[];
  /** Eligibility decisions only — rulings, extensions, confirmations. */
  dgs: string[];
  /** Processing — what the DGS has already decided (2026-09-06 evening). */
  gradAdmin: string[];
}

/** What each party needs to do, read off the requirement rows (DGS request
 * 2026-09-06). Each rule keys on a stable requirement id (audit.ts
 * REQUIREMENT_IDS) and the numbers in its detail; the per-course sign-off
 * list (shared.approvals) supplies the course-level items — a reason naming
 * the advisor is the advisor's, one naming the DGS (or a review) the DGS's,
 * and the student sends the review request. Dissertation items appear only
 * once candidacy is passed — they are not this semester's work before that. */
export function actionItems(report: AuditReport): ActionItems {
  const out: ActionItems = { student: [], advisor: [], dgs: [], gradAdmin: [] };
  const byId = new Map(report.requirements.map((r) => [r.id, r]));
  /** The detail as prose — the joined parts when the row carries them. */
  const textOf = (r: RequirementResult) => (r.detailParts ? r.detailParts.map(flatten).join('. ') : r.detail);
  const isOpen = (status: Status) => status === 'unmet' || status === 'in_progress';
  // "by the end of Spring 2030" / "before Fall 2034" / "during Spring 2028" —
  // the engine's semester phrases are complete adverbials; a passed deadline
  // is named as "the end of Spring 2030" / "Spring 2028".
  const due = (r: RequirementResult) =>
    r.deadline && r.deadline.state !== 'done'
      ? r.deadline.state === 'overdue'
        ? ` — the deadline (${deadlineTermLabel(r.deadline.date)}) has passed`
        : ` ${dueTermPhrase(r.deadline.date)}`
      : '';
  const overdue = (r: RequirementResult | undefined) => r?.deadline?.state === 'overdue' && r.status !== 'met';
  /** "14 of 60 credits complete" → 46 remaining (in-progress credits included). */
  const remaining = (r: RequirementResult): { left: number; total: number; inProgress: number } | undefined => {
    const d = textOf(r);
    const m = /^(\d+(?:\.\d+)?) of (\d+(?:\.\d+)?) (?:credits|semesters)/.exec(d) ?? /: (\d+(?:\.\d+)?) of (\d+(?:\.\d+)?) semesters/.exec(d);
    if (!m) return undefined;
    const ip = /(\d+(?:\.\d+)?) in progress/.exec(d);
    return { left: Number(m[2]) - Number(m[1]), total: Number(m[2]), inProgress: ip ? Number(ip[1]) : 0 };
  };
  const cr = (k: number) => `${k} more ${k === 1 ? 'credit' : 'credits'}`;
  const ipNote = (x: { inProgress: number }) => (x.inProgress > 0 ? ` (${x.inProgress} of them in progress)` : '');
  const section = (r: RequirementResult) => `(${r.citation.section})`;

  // Basic requirements.
  const gpa = byId.get('shared.gpa');
  if (gpa?.status === 'cannot_evaluate') out.student.push(`Report my cumulative GPA ${section(gpa)}.`);
  else if (gpa?.status === 'unmet') out.student.push(`Raise my cumulative GPA to the minimum ${section(gpa)}.`);
  const advisor = byId.get('shared.advisor');
  if (advisor && isOpen(advisor.status)) out.student.push(`Identify a thesis or project advisor ${section(advisor)}.`);

  // Credits.
  for (const [id, what] of [
    ['ms.credits.total', 'toward the total-credit requirement'],
    ['phd.credits.total', 'toward the total-credit requirement'],
    ['ms.credits.regular', 'of regular courses'],
    ['phd.credits.regular', 'of regular courses'],
    ['ms.credits.project', 'of project or thesis work'],
    ['phd.credits.nd', 'at Notre Dame'],
  ] as const) {
    const r = byId.get(id);
    if (!r || !isOpen(r.status)) continue;
    const x = remaining(r);
    out.student.push(x ? `Complete ${cr(x.left)} ${what}${ipNote(x)} ${section(r)}.` : `Complete the ${r.title.toLowerCase()} ${section(r)}.`);
  }
  const seminar = byId.get('phd.seminar');
  if (seminar && isOpen(seminar.status)) {
    const notYet = [...textOf(seminar).matchAll(/([A-Z]{2,5} \d{5}): not yet/g)].map((m) => m[1]);
    out.student.push(notYet.length > 0 ? `Take ${notYet.join(' and ')} — the research seminar ${section(seminar)}.` : `Complete the research seminar credits ${section(seminar)}.`);
  }

  // Residence and time.
  for (const id of ['ms.residency', 'phd.residency'] as const) {
    const r = byId.get(id);
    if (!r || !isOpen(r.status)) continue;
    const x = remaining(r);
    out.student.push(
      x
        ? `Register full-time for ${x.left} more consecutive semester${x.left === 1 ? '' : 's'} ${section(r)}.`
        : `Register full-time for ${id === 'ms.residency' ? 'one semester (or one summer session)' : 'four consecutive semesters'} ${section(r)}.`,
    );
  }
  for (const id of ['ms.timeLimit', 'phd.timeLimit'] as const) {
    const r = byId.get(id);
    if (!r || r.status === 'met' || r.status === 'not_applicable') continue;
    if (overdue(r)) {
      out.student.push(`Ask the DGS about the time limit${due(r)} ${section(r)}.`);
      out.dgs.push(`Decide how to handle the passed time limit ${section(r)}.`);
    } else if (r.deadline) out.student.push(`Complete all requirements${due(r)} ${section(r)}.`);
  }

  // M.S. project or thesis.
  const thesis = byId.get('ms.thesis.defense');
  if (thesis && isOpen(thesis.status)) out.student.push(`Defend the thesis ${section(thesis)}.`);
  const project = byId.get('ms.project.report');
  if (project && isOpen(project.status)) {
    out.student.push(`Complete the project report and deliverables ${section(project)}.`);
    out.advisor.push(`Accept and approve the project report and deliverables ${section(project)}.`);
  }

  // Ph.D. qualifier.
  const qualifier = byId.get('phd.qualifier');
  if (qualifier && isOpen(qualifier.status)) {
    if (overdue(qualifier)) {
      out.student.push(`Complete the remaining qualifier components${due(qualifier)}; ask the DGS about an extension ${section(qualifier)}.`);
      out.dgs.push(`Decide whether to extend the qualifier deadline ${section(qualifier)}.`);
    } else out.student.push(`Complete all three qualifier components${due(qualifier)} ${section(qualifier)}.`);
  }
  for (const [id, area] of [
    ['phd.qualifier.core.os', 'Operating Systems'],
    ['phd.qualifier.core.algorithms', 'Algorithms'],
    ['phd.qualifier.core.architecture', 'Computer Architecture'],
  ] as const) {
    const r = byId.get(id);
    if (!r) continue;
    if (isOpen(r.status)) out.student.push(`Pass a course that covers ${area} — core knowledge ${section(r)}.`);
    else if (r.status === 'needs_dgs_review') out.dgs.push(`Confirm the ${area} core-knowledge course named in the review request ${section(r)}.`);
  }
  const categories = byId.get('phd.qualifier.categories');
  if (categories && isOpen(categories.status)) {
    const below = /below the [A-Z][+-]? floor: ([^—]+)/.exec(textOf(categories));
    out.student.push(
      below
        ? `Retake or replace ${below[1]!.trim()} — a specialization course below the grade floor ${section(categories)}.`
        : `Complete three specialization courses from three distinct groups, each B or higher ${section(categories)}.`,
    );
  }
  const research = byId.get('phd.qualifier.research');
  if (research && isOpen(research.status)) {
    out.student.push(`Pass the research component of the qualifier${due(research)} ${section(research)}.`);
    out.advisor.push(`Determine whether I have passed the research component and file the Research-Qualifier form ${section(research)}.`);
    if (overdue(research)) out.dgs.push(`Decide whether to extend the research-component deadline ${section(research)}.`);
  } else if (research?.status === 'needs_dgs_review') out.dgs.push(`Confirm the late research-component result ${section(research)}.`);

  // The Oral Candidacy Exam (OCE) and the dissertation.
  const candidacy = byId.get('phd.candidacy');
  if (candidacy && isOpen(candidacy.status)) {
    out.student.push(`Take the Oral Candidacy Exam (OCE)${due(candidacy)} ${section(candidacy)}.`);
    if (overdue(candidacy)) out.dgs.push(`Decide how to handle the passed Oral Candidacy Exam (OCE) deadline ${section(candidacy)}.`);
  } else if (candidacy?.status === 'needs_dgs_review') out.dgs.push(`Confirm the late Oral Candidacy Exam (OCE) ${section(candidacy)}.`);
  if (candidacy?.status === 'met') {
    const approval = byId.get('phd.dissertation.approval');
    if (approval && isOpen(approval.status)) out.student.push(`Get the dissertation approved for defense by all readers ${section(approval)}.`);
    const defense = byId.get('phd.dissertation.defense');
    if (defense && isOpen(defense.status)) out.student.push(`Defend the dissertation ${section(defense)}.`);
  }

  // Processing — the Grad Admin's side (2026-09-06 evening): the MSCSE along
  // the way once its row is met, and the qualifier completion form once every
  // component is done but no form date is entered.
  if (byId.get('phd.msAlongTheWay')?.status === 'met') {
    out.gradAdmin.push('Process the MSCSE awarded along the way (§4.5).');
    out.student.push('Send the Grad Admin the processing request for the MSCSE along the way (§4.5).');
  }
  if (qualifier?.status === 'met' && /qualifier (completion )?form/.test(textOf(qualifier))) {
    out.student.push('File the qualifier completion form with the Grad Admin (§4.4).');
    out.gradAdmin.push('Record the completed qualifier once my form arrives (§4.4).');
  }

  // Course-level approvals — the per-course sign-off list.
  const approvals = byId.get('shared.approvals');
  const pendingCourses: string[] = [];
  const processingCourses: string[] = [];
  for (const part of approvals?.detailParts ?? []) {
    if (typeof part === 'string') {
      if (/plan of study/.test(part)) out.advisor.push(`Approve my plan of study (${report.program === 'mscse' ? '§3.2' : '§4.2'}).`);
      continue;
    }
    if ('warn' in part) continue; // a warning is not a course to chase
    for (const item of part.items) {
      const m = /^(.+?) \((.+)\)$/.exec(item);
      const course = m ? m[1]! : item;
      const reason = m ? m[2]! : '';
      // Decided by the DGS already (ruled transferable in the ExternalCourses
      // tab): processing is the Grad Admin's, not another DGS decision.
      if (/^pre-approved/i.test(reason)) {
        processingCourses.push(course);
        out.gradAdmin.push(`Process the transfer credit for ${course} — pre-approved by the DGS (§5.2).`);
        continue;
      }
      pendingCourses.push(course);
      if (/advisor/i.test(reason)) out.advisor.push(`Approve ${course} — ${reason.replace(/ — needs advisor \+ DGS approval/, '')}.`);
      if (/DGS|review|rules sheet|transfer/i.test(reason)) out.dgs.push(`Decide on ${course} — ${reason}.`);
    }
  }
  // One name per course: the approvals row lists a course under one lead, but
  // a course can reach here from more than one part, and this sentence is the
  // one the student emails (2026-09-07). The attach-transcripts reminder is
  // the student's own dialog's, not the advisor's (trim review 2026-09-18, P-37).
  const once = (list: string[]) => [...new Set(list)].join(', ');
  if (pendingCourses.length > 0) {
    out.student.push(`Send the DGS the review request for ${once(pendingCourses)}.`);
  }
  if (processingCourses.length > 0) {
    out.student.push(`Send the Grad Admin the processing request for ${once(processingCourses)}.`);
  }

  // Missing rules-sheet parameters: the DGS's tool to fix.
  for (const r of report.requirements) {
    const m = /the rules sheet is missing '([^']+)'/.exec(textOf(r));
    if (r.status === 'cannot_evaluate' && m) out.dgs.push(`Add the missing parameter '${m[1]}' to the rules sheet so ${r.title.toLowerCase()} can be checked.`);
  }
  return {
    student: dedupe(out.student),
    advisor: dedupe(out.advisor),
    dgs: dedupe(out.dgs),
    gradAdmin: dedupe(out.gradAdmin),
  };
}

function dedupe(items: string[]): string[] {
  return [...new Set(items)];
}

// ---------- re-voicing the engine's details ----------

/** The engine's detail, re-voiced for an email from the student to the
 * advisor: one "why" string of short sentences (each statement capitalized,
 * period-separated — the engine's own joining style); empty when nothing is
 * left to say (the deadline phrase then stands alone). `firstStatementOnly`
 * keeps just the leading statement. */
export function whyFor(r: RequirementResult, firstStatementOnly = false): string {
  const statements = (r.detailParts ? r.detailParts.map(flatten) : splitStatements(r.detail))
    .map((s) => s.trim().replace(/\.$/, ''))
    .filter((s) => s.length > 0)
    .map(rewrite)
    .filter((s) => !dropsFromEmail(s, r))
    .map(firstPerson);
  const kept = firstStatementOnly ? statements.slice(0, 1) : statements;
  if (kept.length === 0) return '';
  return kept.map((s) => `${s.charAt(0).toUpperCase()}${s.slice(1)}.`).join(' ');
}

function flatten(p: DetailPart): string {
  return typeof p === 'string' ? p : 'warn' in p ? p.warn : `${p.lead}: ${p.items.join('; ')}`;
}

/** Split prose into statements at ". " before a capital or digit, sparing the
 * abbreviations the details use (M.S., Ph.D., e.g., i.e., vs., etc.). */
function splitStatements(detail: string): string[] {
  return detail.split(/(?<!\b(?:M\.S|Ph\.D|e\.g|i\.e|vs|etc|No))\.\s+(?=[A-Z0-9(“"])/);
}

/** Statements written for the student at the page that say nothing to the
 * advisor: how to record an approval, where a list lives on the site, what
 * to do next ("Talk to the DGS"), and an "Overdue —" statement whose fact
 * the deadline phrase already carries. */
function dropsFromEmail(statement: string, r: RequirementResult): boolean {
  if (/\bcheckbox(es)?\b|\battestation\b|\btick\b|course rules page|self-check page/i.test(statement)) return true;
  if (/^(Talk to|Ask the DGS|Ask your advisor)\b/i.test(statement)) return true;
  if (/^Overdue\b/i.test(statement) && r.deadline?.state === 'overdue') return true;
  return false;
}

/** Page instructions that carry a fact worth telling the advisor, restated
 * as the fact. Add a rule here when an engine detail gains a new "do this on
 * the page" sentence (they are listed in docs/CLAUDE-HANDOFF.md). */
const REWRITES: [RegExp, string][] = [
  // "tick the box" since the trim review (P-55, 2026-09-18); "attestation" kept
  // so an older fixture still re-voices.
  [/^Confirm your advisor approved your plan of study \(([^)]*)\) and tick the (attestation|box).*$/i, 'Advisor approval of my plan of study ($1) is not yet recorded'],
  [/^Enter your cumulative GPA\b.*$/i, 'Cumulative GPA not entered yet'],
  // The §4.4.2 retake advice is written for the student; the advisor needs the
  // course, the grade and the §, and the to-do list already says "Retake or
  // replace …" (trim review 2026-09-18, P-22).
  [/^below the ([A-Z][+-]?) floor: (.+?) — you may retake the course to replace the grade or take another course \((§[\d.]+)\)$/i, 'below the $1 floor ($3): $2'],
  // "one card per core area below" is the page describing its own layout; the
  // email has no cards (trim review 2026-09-18, P-40).
  [/ — one card per core area below\)/, ')'],
];
function rewrite(statement: string): string {
  for (const [re, to] of REWRITES) if (re.test(statement)) return statement.replace(re, to);
  return statement;
}

/** The student is writing: "you are registered" → "I am registered"; "by your
 * first semester" → "by my first semester". */
function firstPerson(statement: string): string {
  return statement
    .replace(/\b[Yy]ou are\b/g, 'I am')
    .replace(/\b[Yy]ou\b/g, 'I')
    .replace(/\bYour\b/g, 'My')
    .replace(/\byour\b/g, 'my')
    .replace(/\b[Yy]ours\b/g, 'mine');
}
