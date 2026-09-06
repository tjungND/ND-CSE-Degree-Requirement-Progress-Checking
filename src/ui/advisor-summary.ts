// The "Copy summary for advisor" email — pure string building over an
// AuditReport (no DOM), in two clipboard flavors: plain text, and HTML that
// pastes cleanly into Gmail/Outlook (one table per part, inline styles only —
// email clients drop stylesheets).
//
// Redesigned 2026-09-06 at the DGS's request ("they include too much
// information … make them more legible to busy advisors who will just wonder
// what requirements are not met and why, and until when the requirements must
// be met"). The shape is an inverted pyramid — the answer first, context last:
//   • Subject line with the three facts an advisor scans for: degree, entry
//     term, how many requirements are not yet met (and whether a deadline passed).
//   • One standing paragraph: program, entry term, prior study, GPA, the date,
//     and the counts (met · in progress · not yet met · needs DGS review).
//   • NOT YET MET — a numbered line per requirement: name (red bold in HTML,
//     **asterisks** in text — DGS 2026-09-04), §, why, deadline. Deadline
//     passed first, then by deadline, then the rest in handbook order.
//   • NEEDS DGS REVIEW — name, §, what is pending.
//   • CANNOT EVALUATE — name, §, what is missing (only when there is one).
//     (Headings match the page's status words so the two can be read together.)
//   • IN PROGRESS — name, §, the first statement of progress, deadline if any.
//   • Met — names only (no §), one line. "Does not apply" rows are left out.
//   • Two footnotes: deadlines are approximate semesters counted from the
//     entry term (DGS 2026-09-05); alpha status + the handbook edition.
// Gone since the 2026-09-03 design (docs/DECISIONS.md, 2026-09-06): the
// separate DEADLINES block (each line now carries its own deadline), the
// course-by-course list (the printed report has it), the "(approximate)" tag
// on every line (said once), and the PDF-import / coverage caveats, which
// address the student, not the advisor.
//
// The engine writes its details for the student reading the page; `whyFor`
// re-voices them for the email: statements about the page itself (checkboxes,
// the course rules page) are dropped, an "Overdue —" statement gives way to the
// deadline phrase, "Talk to the DGS" goes, and you/your becomes I/my — the
// student is the one writing.
import type { AuditReport, DetailPart, RequirementResult } from '../engine/types.ts';
import { dueTermPhrase } from '../engine/term.ts';
import { BETA_NOTICE, HANDBOOK_EDITION, HANDBOOK_URL, formatYmdLong } from './handbook.ts';

export interface AdvisorSummaryOptions {
  todayIso: string;
  entryTerm: string;
  /** The "Prior graduate study" choice as the page labels it. */
  priorStudy: string;
  gpa?: number;
}

/** The page's --bad red, inline because email clients drop stylesheets. */
const UNMET_STYLE = 'color:#a81e14;font-weight:bold';

export function advisorSummary(report: AuditReport, opts: AdvisorSummaryOptions): { text: string; html: string } {
  const rows = report.requirements;
  const isUnmet = (r: RequirementResult) => r.status === 'unmet';
  const byDeadlineThenHandbook = (a: RequirementResult, b: RequirementResult): number => {
    // Deadline passed first, then the nearest deadline, then rows without one
    // in the order the report shows them (handbook order).
    const rank = (r: RequirementResult) => (r.deadline?.state === 'overdue' ? 0 : r.deadline && r.deadline.state !== 'done' ? 1 : 2);
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
    if (rank(a) === 1 && a.deadline!.date !== b.deadline!.date) return a.deadline!.date < b.deadline!.date ? -1 : 1;
    return rows.indexOf(a) - rows.indexOf(b);
  };
  const unmet = rows.filter(isUnmet).sort(byDeadlineThenHandbook);
  const waiting = rows.filter((r) => r.status === 'needs_dgs_review');
  const unchecked = rows.filter((r) => r.status === 'cannot_evaluate');
  const inProgress = rows.filter((r) => r.status === 'in_progress').sort(byDeadlineThenHandbook);
  const met = rows.filter((r) => r.status === 'met');

  // Counts as the page's headline counts them: informational rows (the
  // per-course sign-off list, the along-the-way M.S.) and "does not apply"
  // rows are outside the score.
  const scoredRows = rows.filter((r) => !r.informational && r.status !== 'not_applicable');
  const count = (status: RequirementResult['status']) => scoredRows.filter((r) => r.status === status).length;
  const n = {
    met: report.summary.met,
    scored: report.summary.scored,
    unmet: count('unmet'),
    inProgress: count('in_progress'),
    waiting: count('needs_dgs_review'),
    unchecked: count('cannot_evaluate'),
    overdue: unmet.filter((r) => r.deadline?.state === 'overdue').length,
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

  // "Due by the end of Spring 2028" / "Deadline passed (was due during Spring
  // 2028)": a SEMESTER, never a date (DGS 2026-09-05); the footnote says once
  // that semesters are approximate, so the lines do not repeat it.
  const deadlineOf = (r: RequirementResult): { text: string; passed: boolean } | undefined => {
    const d = r.deadline;
    if (!d || d.state === 'done' || r.status === 'met') return undefined;
    return d.state === 'overdue'
      ? { text: `Deadline passed (was due ${dueTermPhrase(d.date)})`, passed: true }
      : { text: `Due ${dueTermPhrase(d.date)}`, passed: false };
  };
  const anyDeadline = (list: RequirementResult[]) => list.some((r) => deadlineOf(r) !== undefined);

  // A "not yet" row whose whole detail was page instructions ("Overdue — talk
  // to the DGS") still needs a word in the why column.
  const why = (r: RequirementResult, firstStatementOnly: boolean) => whyFor(r, firstStatementOnly) || (isUnmet(r) ? 'Not yet.' : '');

  // ---- plain text ----
  const line = (r: RequirementResult, firstStatementOnly = false): string => {
    const reason = why(r, firstStatementOnly);
    const due = deadlineOf(r);
    const name = `${isUnmet(r) ? `**${r.title}**` : r.title} (${r.citation.section})`;
    const tail = [reason, due ? `${due.text}.` : ''].filter(Boolean).join(' ');
    return tail ? `${name} — ${tail}` : name;
  };
  const section = (heading: string, list: RequirementResult[], numbered: boolean, firstStatementOnly = false): string =>
    list.length === 0
      ? ''
      : `${heading}\n${list.map((r, i) => `${numbered ? `${i + 1}.` : '-'} ${line(r, firstStatementOnly)}`).join('\n')}\n\n`;
  const metLine = met.length > 0 ? `Met: ${met.map((r) => r.title).join('; ')}.\n\n` : '';
  const deadlineNote = anyDeadline([...unmet, ...inProgress])
    ? `Deadlines are counted from ${opts.entryTerm} and given by semester; they are approximate — the registrar's calendar sets the exact dates.\n`
    : '';
  const statusNote = `Alpha version under testing. ${BETA_NOTICE} Checked against the CSE Graduate Studies Handbook, ${HANDBOOK_EDITION} (${HANDBOOK_URL}).`;
  const text =
    `Subject: ${subject}\n\nDear Advisor,\n\n${intro}\n${standing}\n${counts}.\n\n` +
    section('NOT YET MET — what is missing, and by when', unmet, true) +
    section('NEEDS DGS REVIEW', waiting, false) +
    section('CANNOT EVALUATE — information missing', unchecked, false) +
    section('IN PROGRESS', inProgress, false, true) +
    metLine +
    `${deadlineNote}${statusNote}\n\nThank you!\n`;

  // ---- HTML ----
  // A cell is plain text (escaped here) or `{ html }` — already-safe markup
  // built from escaped text, used for the red bold names and deadlines.
  type Cell = string | { html: string };
  const table = (headers: string[], cells: Cell[][]) =>
    `<table border="1" cellspacing="0" cellpadding="4"><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr>` +
    cells.map((r) => `<tr>${r.map((v) => `<td>${typeof v === 'string' ? esc(v) : v.html}</td>`).join('')}</tr>`).join('') +
    `</table>`;
  const nameCell = (r: RequirementResult): Cell =>
    isUnmet(r) ? { html: `<strong style="${UNMET_STYLE}">${esc(r.title)}</strong>` } : r.title;
  const deadlineCell = (r: RequirementResult): Cell => {
    const due = deadlineOf(r);
    if (!due) return '';
    return due.passed ? { html: `<strong style="${UNMET_STYLE}">${esc(due.text)}</strong>` } : due.text;
  };
  const htmlSection = (heading: string, note: string, whyHeader: string, list: RequirementResult[], firstStatementOnly = false): string => {
    if (list.length === 0) return '';
    const withDeadline = anyDeadline(list);
    return (
      `<p><strong>${esc(heading)}</strong>${note ? ` — ${esc(note)}` : ''}</p>` +
      table(
        ['Requirement', '§', whyHeader, ...(withDeadline ? ['Deadline'] : [])],
        list.map((r) => [nameCell(r), r.citation.section, why(r, firstStatementOnly), ...(withDeadline ? [deadlineCell(r)] : [])]),
      )
    );
  };
  const html =
    `<p>Subject: ${esc(subject)}</p><p>Dear Advisor,</p>` +
    `<p>${esc(intro)}<br>${esc(standing)}<br><strong>${esc(counts)}.</strong></p>` +
    htmlSection('Not yet met', 'what is missing, and by when', 'What is missing', unmet) +
    htmlSection('Needs DGS review', '', 'What is pending', waiting) +
    htmlSection('Cannot evaluate', 'information missing', 'What is missing', unchecked) +
    htmlSection('In progress', '', 'Progress', inProgress, true) +
    (met.length > 0 ? `<p><strong>Met:</strong> ${esc(met.map((r) => r.title).join('; '))}.</p>` : '') +
    (deadlineNote ? `<p>${esc(deadlineNote.trim())}</p>` : '') +
    `<p>${esc(statusNote)}</p><p>Thank you!</p>`;
  return { text, html };
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** The engine's detail, re-voiced for an email from the student to the
 * advisor: one "why" string of short sentences (each statement capitalized,
 * period-separated — the engine's own joining style); empty when nothing is
 * left to say (the deadline phrase then stands alone). `firstStatementOnly`
 * keeps just the leading statement — used for in-progress rows, where the
 * advisor needs the gist, not the plan. */
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
