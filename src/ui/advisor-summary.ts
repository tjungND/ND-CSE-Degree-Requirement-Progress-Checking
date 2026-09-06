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
// the same rows: what the student, the advisor and the DGS each need to do.
// Kept from the morning's design: the subject line with the headline facts,
// the one standing paragraph, the deadline footnote and the alpha notice; the
// re-voicing of the engine's student-facing details (`whyFor`).
import type { AuditReport, DetailPart, RequirementResult, Status } from '../engine/types.ts';
import { deadlineTermLabel, dueTermPhrase } from '../engine/term.ts';
import { BETA_NOTICE, HANDBOOK_EDITION, HANDBOOK_URL, formatYmdLong } from './handbook.ts';

export interface AdvisorSummaryOptions {
  todayIso: string;
  entryTerm: string;
  /** The "Prior graduate study" choice as the page labels it. */
  priorStudy: string;
  gpa?: number;
}

/** The page's palette, inline because email clients drop stylesheets. */
export const COLORS = { green: '#10693f', amber: '#8e5108', red: '#a81e14' } as const;
type Color = keyof typeof COLORS;

/** Status word (the page's) and colour per status. */
const STATUS_TAG: Record<Status, { word: string; color: Color }> = {
  met: { word: 'MET', color: 'green' },
  in_progress: { word: 'IN PROGRESS', color: 'amber' },
  needs_dgs_review: { word: 'NEEDS DGS REVIEW', color: 'amber' },
  unmet: { word: 'NOT YET', color: 'red' },
  cannot_evaluate: { word: 'CANNOT EVALUATE', color: 'red' },
  not_applicable: { word: 'DOES NOT APPLY', color: 'green' },
};

export function advisorSummary(report: AuditReport, opts: AdvisorSummaryOptions): { text: string; html: string } {
  const rows = report.requirements;
  // Counts as the page's headline counts them: informational rows (the
  // per-course sign-off list, the along-the-way M.S.) and "does not apply"
  // rows are outside the score.
  const scoredRows = rows.filter((r) => !r.informational && r.status !== 'not_applicable');
  const count = (status: Status) => scoredRows.filter((r) => r.status === status).length;
  const n = {
    met: report.summary.met,
    scored: report.summary.scored,
    unmet: count('unmet'),
    inProgress: count('in_progress'),
    waiting: count('needs_dgs_review'),
    unchecked: count('cannot_evaluate'),
    overdue: scoredRows.filter((r) => r.status === 'unmet' && r.deadline?.state === 'overdue').length,
  };
  const plural = (k: number, word: string) => `${k} ${word}${k === 1 ? '' : 's'}`;

  const programLabel = report.program === 'mscse' ? 'M.S. in CSE (Handbook §3)' : 'Ph.D. (Handbook §4)';
  const programShort = report.program === 'mscse' ? 'M.S. in CSE' : 'Ph.D.';
  const headlineFact =
    n.unmet > 0
      ? `${plural(n.unmet, 'requirement')} not yet met${n.overdue > 0 ? `, ${plural(n.overdue, 'deadline')} passed` : ''}`
      : n.scored > 0 && n.met === n.scored
        ? 'all checked requirements met'
        : `nothing not yet met — ${n.inProgress} in progress${n.waiting > 0 ? `, ${n.waiting} need${n.waiting === 1 ? 's' : ''} DGS review` : ''}`;
  const subject = `Degree self-check — ${programShort}, entered ${opts.entryTerm} — ${headlineFact}`;
  const asOf = formatYmdLong(opts.todayIso.slice(0, 10)) ?? opts.todayIso.slice(0, 10);
  const intro = `Here is my current standing from the CSE degree self-check tool, as of ${asOf}.`;
  const prior = opts.priorStudy.charAt(0).toLowerCase() + opts.priorStudy.slice(1);
  const standing =
    `${programLabel}; entered ${opts.entryTerm}; ${prior}; ` +
    `cumulative GPA ${opts.gpa !== undefined ? opts.gpa.toFixed(2) : 'not entered yet'}.`;
  const counts = [
    `${n.met} of ${n.scored} requirements met`,
    ...(n.inProgress > 0 ? [`${n.inProgress} in progress`] : []),
    ...(n.unmet > 0 ? [`${n.unmet} not yet met`] : []),
    ...(n.waiting > 0 ? [`${n.waiting} need${n.waiting === 1 ? 's' : ''} DGS review`] : []),
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

  // ---- plain text ----
  const line = (r: RequirementResult): string => {
    const tag = STATUS_TAG[r.status];
    const due = deadlineOf(r);
    const parts = [r.status === 'met' ? '' : whyFor(r), due ? `${due.text}.` : ''].filter(Boolean);
    return `[${tag.word}] ${r.title} (${r.citation.section})${parts.length ? ` — ${parts.join(' ')}` : ''}`;
  };
  const todoText = (heading: string, items: string[]) =>
    `${heading}\n${items.length > 0 ? items.map((i) => `- ${i}`).join('\n') : '- Nothing at the moment.'}\n\n`;
  const text =
    `Subject: ${subject}\n\nDear Advisor,\n\n${intro}\n${standing}\n${counts}.\n\n` +
    sections.map((s) => `${s.heading.toUpperCase()}\n${s.rows.map((r) => `  ${line(r)}`).join('\n')}\n\n`).join('') +
    todoText('WHAT I NEED TO DO', todo.student) +
    todoText('WHAT I NEED FROM YOU, MY ADVISOR', todo.advisor) +
    todoText('WHAT THE DGS NEEDS TO DO', todo.dgs) +
    `${deadlineNote ? `${deadlineNote}\n` : ''}${statusNote}\n\nThank you!\n`;

  // ---- HTML ----
  const colored = (color: Color, inner: string) => `<span style="color:${COLORS[color]};font-weight:bold">${inner}</span>`;
  const htmlSection = (s: { heading: string; rows: RequirementResult[] }): string => {
    const withDeadline = s.rows.some((r) => deadlineOf(r) !== undefined);
    return (
      `<p><strong>${esc(s.heading)}</strong></p>` +
      `<table border="1" cellspacing="0" cellpadding="4"><tr><th>Status</th><th>Requirement</th><th>§</th><th>Why</th>${withDeadline ? '<th>Deadline</th>' : ''}</tr>` +
      s.rows
        .map((r) => {
          const tag = STATUS_TAG[r.status];
          const due = deadlineOf(r);
          const dueCell = due ? (due.passed ? colored('red', esc(due.text)) : esc(due.text)) : '';
          return (
            `<tr><td>${colored(tag.color, esc(tag.word))}</td><td>${colored(tag.color, esc(r.title))}</td><td>${esc(r.citation.section)}</td>` +
            `<td>${esc(r.status === 'met' ? '' : whyFor(r))}</td>${withDeadline ? `<td>${dueCell}</td>` : ''}</tr>`
          );
        })
        .join('') +
      `</table>`
    );
  };
  const todoHtml = (heading: string, items: string[]) =>
    `<p><strong>${esc(heading)}</strong></p><ul>${(items.length > 0 ? items : ['Nothing at the moment.']).map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`;
  const html =
    `<p>Subject: ${esc(subject)}</p><p>Dear Advisor,</p>` +
    `<p>${esc(intro)}<br>${esc(standing)}<br><strong>${esc(counts)}.</strong></p>` +
    sections.map(htmlSection).join('') +
    todoHtml('What I need to do', todo.student) +
    todoHtml('What I need from you, my advisor', todo.advisor) +
    todoHtml('What the DGS needs to do', todo.dgs) +
    (deadlineNote ? `<p>${esc(deadlineNote)}</p>` : '') +
    `<p>${esc(statusNote)}</p><p>Thank you!</p>`;
  return { text, html };
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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
  dgs: string[];
}

/** What each party needs to do, read off the requirement rows (DGS request
 * 2026-09-06). Each rule keys on a stable requirement id (audit.ts
 * REQUIREMENT_IDS) and the numbers in its detail; the per-course sign-off
 * list (shared.approvals) supplies the course-level items — a reason naming
 * the advisor is the advisor's, one naming the DGS (or a review) the DGS's,
 * and the student sends the review request. Dissertation items appear only
 * once candidacy is passed — they are not this semester's work before that. */
export function actionItems(report: AuditReport): ActionItems {
  const out: ActionItems = { student: [], advisor: [], dgs: [] };
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

  // Candidacy and dissertation.
  const candidacy = byId.get('phd.candidacy');
  if (candidacy && isOpen(candidacy.status)) {
    out.student.push(`Take the candidacy exam${due(candidacy)} ${section(candidacy)}.`);
    if (overdue(candidacy)) out.dgs.push(`Decide how to handle the passed candidacy deadline ${section(candidacy)}.`);
  } else if (candidacy?.status === 'needs_dgs_review') out.dgs.push(`Confirm the late candidacy exam ${section(candidacy)}.`);
  if (candidacy?.status === 'met') {
    const approval = byId.get('phd.dissertation.approval');
    if (approval && isOpen(approval.status)) out.student.push(`Get the dissertation approved for defense by all readers ${section(approval)}.`);
    const defense = byId.get('phd.dissertation.defense');
    if (defense && isOpen(defense.status)) out.student.push(`Defend the dissertation ${section(defense)}.`);
  }

  // Course-level approvals — the per-course sign-off list.
  const approvals = byId.get('shared.approvals');
  const pendingCourses: string[] = [];
  for (const part of approvals?.detailParts ?? []) {
    if (typeof part === 'string') {
      if (/plan of study/.test(part)) out.advisor.push('Approve my plan of study (§3.2/§4.2).');
      continue;
    }
    for (const item of part.items) {
      const m = /^(.+?) \((.+)\)$/.exec(item);
      const course = m ? m[1]! : item;
      const reason = m ? m[2]! : '';
      pendingCourses.push(course);
      if (/advisor/i.test(reason)) out.advisor.push(`Approve ${course} — ${reason.replace(/ — needs advisor \+ DGS approval/, '')}.`);
      if (/DGS|review|rules sheet|transfer/i.test(reason)) out.dgs.push(`Decide on ${course} — ${reason}.`);
    }
  }
  if (pendingCourses.length > 0) {
    out.student.push(`Send the DGS the review request for ${pendingCourses.join(', ')} (with my transcripts attached).`);
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
  return typeof p === 'string' ? p : `${p.lead}: ${p.items.join('; ')}`;
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
  [/^Confirm your advisor approved your plan of study \(([^)]*)\) and tick the attestation.*$/i, 'Advisor approval of my plan of study ($1) is not yet recorded'],
  [/^Enter your cumulative GPA\b.*$/i, 'Cumulative GPA not entered yet'],
];
function rewrite(statement: string): string {
  for (const [re, to] of REWRITES) if (re.test(statement)) return statement.replace(re, to);
  return statement;
}

/** The student is writing: "you may retake the course" → "I may retake the
 * course"; "by your first semester" → "by my first semester". */
function firstPerson(statement: string): string {
  return statement
    .replace(/\b[Yy]ou are\b/g, 'I am')
    .replace(/\b[Yy]ou\b/g, 'I')
    .replace(/\bYour\b/g, 'My')
    .replace(/\byour\b/g, 'my')
    .replace(/\b[Yy]ours\b/g, 'mine');
}
