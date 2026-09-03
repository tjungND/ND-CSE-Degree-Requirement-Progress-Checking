// Renders an AuditReport: score dial, credit meters, requirement groups with
// status pills + deadline chips + § citations, and the plain-text summary copy.
import type { AuditReport, RequirementResult, Status } from '../engine/types.ts';
import { termLabel } from '../engine/term.ts';
import { el } from './dom.ts';
import { BETA_NOTICE, BETA_SCOPE_NOTICE, HANDBOOK_EDITION, HANDBOOK_URL, RULES_ACCURACY_NOTICE } from './handbook.ts';

const STATUS_LABEL: Record<Status, string> = {
  met: 'Met',
  in_progress: 'In progress',
  unmet: 'Not yet',
  needs_dgs_review: 'Needs review',
  cannot_evaluate: 'Cannot evaluate',
  not_applicable: 'N/A',
};

function dial(report: AuditReport): HTMLElement {
  const { met, scored } = report.summary;
  const pct = scored === 0 ? 0 : met / scored;
  const C = 2 * Math.PI * 32;
  const svgNs = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNs, 'svg');
  svg.setAttribute('viewBox', '0 0 80 80');
  svg.setAttribute('class', 'dial');
  const track = document.createElementNS(svgNs, 'circle');
  const arc = document.createElementNS(svgNs, 'circle');
  for (const [c, cls] of [
    [track, 'dial-track'],
    [arc, 'dial-arc'],
  ] as const) {
    c.setAttribute('cx', '40');
    c.setAttribute('cy', '40');
    c.setAttribute('r', '32');
    c.setAttribute('class', cls);
  }
  arc.setAttribute('stroke-dasharray', `${C * pct} ${C}`);
  arc.setAttribute(
    'stroke',
    pct === 1 ? 'var(--ok)' : pct > 0.5 ? 'var(--warn)' : 'var(--bad)',
  );
  const text = document.createElementNS(svgNs, 'text');
  text.setAttribute('x', '40');
  text.setAttribute('y', '45');
  text.setAttribute('text-anchor', 'middle');
  text.setAttribute('class', 'dial-text');
  text.textContent = `${met}/${scored}`;
  svg.append(track, arc, text);

  const remaining = scored - met;
  const headline =
    scored > 0 && remaining === 0
      ? 'All requirements met'
      : met === 0
        ? 'Getting started'
        : `${remaining} requirement${remaining === 1 ? '' : 's'} to go`;
  return el(
    'div',
    { class: 'scorehead' },
    svg,
    el(
      'div',
      {},
      el('div', { class: 'headline' }, headline),
      el(
        'div',
        { class: 'subline' },
        remaining === 0 && scored > 0
          ? 'Confirm with the Graduate Program Coordinator before you file.'
          : 'This is a self-check — approvals and official records live with the DGS office.',
      ),
    ),
  );
}

function meters(report: AuditReport): HTMLElement {
  // Pull the "X of N" numbers back out of the threshold rows' details.
  const wanted =
    report.program === 'mscse'
      ? [
          ['ms.credits.regular', 'Regular courses'],
          ['ms.credits.project', 'Project or thesis'],
          ['ms.credits.total', 'Total credits'],
        ]
      : [
          ['phd.credits.regular', 'Regular courses'],
          ['phd.credits.nd', 'Credits at Notre Dame'],
          ['phd.credits.total', 'Total credits'],
        ];
  const box = el('div', { class: 'meters' });
  for (const [id, label] of wanted) {
    const row = report.requirements.find((r) => r.id === id);
    const m = row ? /^(\d+(?:\.\d+)?) of (\d+(?:\.\d+)?)/.exec(row.detail) : null;
    if (!m) continue;
    const have = Number(m[1]);
    const need = Number(m[2]);
    const bar = el('div', { class: 'bar' });
    const fill = el('i', {});
    fill.style.width = `${Math.min(100, (have / need) * 100)}%`;
    bar.append(fill);
    box.append(
      el(
        'div',
        { class: 'meter' },
        el('div', { class: 'meter-label' }, `${label} `, el('span', {}, `${have}/${need}`)),
        bar,
      ),
    );
  }
  return box;
}

function requirementCard(r: RequirementResult): HTMLElement {
  const pill = el('span', { class: `pill s-${r.status}` }, STATUS_LABEL[r.status]);
  // The rule itself, on the output side (DGS request 2026-09-03): clicking the
  // § chip reveals the handbook sentence this verdict is checked against.
  const quote = el('div', { class: 'rule-quote hidden' }, `Handbook ${r.citation.section}: “${r.citation.quote}”`);
  const cite = el(
    'button',
    { class: 'cite', title: 'Show the handbook rule behind this check', onclick: () => quote.classList.toggle('hidden') },
    r.citation.section,
  );
  const head = el('div', { class: 'req-head' }, el('span', { class: 'req-title' }, r.title), pill);
  const chips = el('div', { class: 'req-chips' }, cite);
  if (r.deadline && r.status !== 'met') {
    chips.append(
      el(
        'span',
        { class: `chip d-${r.deadline.state}` },
        r.deadline.label,
      ),
    );
  }
  return el(
    'div',
    { class: `req s-${r.status}` },
    head,
    chips,
    el('div', { class: 'req-detail' }, r.detail),
    quote,
  );
}

export function renderReport(report: AuditReport): HTMLElement {
  const panel = el('section', { class: 'audit', 'aria-label': 'Audit report' });
  panel.append(dial(report), meters(report));

  const groups = new Map<string, RequirementResult[]>();
  for (const r of report.requirements) {
    const list = groups.get(r.group) ?? [];
    list.push(r);
    groups.set(r.group, list);
  }
  for (const [group, rows] of groups) {
    const sub = rows.filter((r) => r.id.split('.').length > 2 && r.id.startsWith('phd.qualifier.'));
    panel.append(el('h3', { class: 'group-head' }, group));
    for (const r of rows) {
      const card = requirementCard(r);
      if (sub.includes(r)) card.classList.add('req-sub');
      panel.append(card);
    }
  }
  return panel;
}

/** The "Copy summary for your advisor" email (2026-09-03): two clipboard
 * flavors (text + HTML — the HTML pastes cleanly into Gmail), a subject and
 * greeting, one standing line, the requirements grouped ATTENTION-FIRST
 * (what still needs work before what is done, details included where they
 * matter), the courses as counted, and the beta/accuracy notices. */
export function advisorSummary(
  report: AuditReport,
  opts: { todayIso: string; entryTerm: string; priorStudy: string; gpa?: number },
): { text: string; html: string } {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const ORDER: Status[] = ['unmet', 'needs_dgs_review', 'cannot_evaluate', 'in_progress', 'met', 'not_applicable'];
  const HEADINGS: Record<Status, string> = {
    unmet: 'Not yet met',
    needs_dgs_review: 'Needs a decision or approval',
    cannot_evaluate: 'Cannot evaluate yet (missing input)',
    in_progress: 'In progress',
    met: 'Met',
    not_applicable: 'Not applicable',
  };
  const withDetail = new Set<Status>(['unmet', 'needs_dgs_review', 'cannot_evaluate', 'in_progress']);
  const groups = ORDER.map((status) => ({
    heading: HEADINGS[status],
    rows: report.requirements.filter((r) => r.status === status),
    detailed: withDetail.has(status),
  })).filter((g) => g.rows.length > 0);
  const programLabel = report.program === 'mscse' ? 'M.S. in CSE (Handbook §3)' : 'Ph.D. (Handbook §4)';
  const intro = 'Here is my current standing from the CSE Graduate Degree Requirement Self-check Tool.';
  const standing =
    `Program: ${programLabel}. Entered ${opts.entryTerm}; prior graduate study: ${opts.priorStudy}; ` +
    `cumulative GPA ${opts.gpa !== undefined ? opts.gpa : 'not entered yet'}. ` +
    `${report.summary.met} of ${report.summary.scored} requirements met as of ${opts.todayIso}.`;
  const line = (r: RequirementResult, detailed: boolean) =>
    `${r.title} (${r.citation.section})${detailed && r.detail ? ` — ${r.detail}` : ''}`;
  // Only the courses that COUNT toward something (DGS request, 2026-09-03) —
  // same pattern the on-page table uses to strike dropped rows.
  const COUNTS_NOTHING_RE = /^(not counted|superseded|failed|credits count once)/;
  const countedLines = report.courseLines.filter((l) => !COUNTS_NOTHING_RE.test(l.text));
  const courses = countedLines.map((l) => `${l.courseId} (${termLabel(l.term)}): ${l.text}`);
  const notices = [
    `Self-check against the CSE Graduate Studies Handbook, ${HANDBOOK_EDITION} (${HANDBOOK_URL}).`,
    `Beta version under testing. ${BETA_NOTICE} Confirm with the DGS office.`,
    `${RULES_ACCURACY_NOTICE} ${BETA_SCOPE_NOTICE}`,
  ];
  const text =
    `Subject: Degree progress summary (CSE degree self-check)\n\nDear Advisor,\n\n${intro}\n\n${standing}\n\n` +
    groups.map((g) => `${g.heading.toUpperCase()}\n${g.rows.map((r) => `- ${line(r, g.detailed)}`).join('\n')}`).join('\n\n') +
    (courses.length > 0 ? `\n\nCOURSES COUNTED TOWARD REQUIREMENTS\n${courses.map((c) => `- ${c}`).join('\n')}` : '') +
    `\n\n${notices.join('\n')}\n\nThank you!\n`;
  // HTML flavor: one TABLE per part (DGS request, 2026-09-03) so the summary
  // reads cleanly in an email client; the text flavor keeps simple lists.
  const table = (headers: string[], rows: string[][]) =>
    `<table border="1" cellspacing="0" cellpadding="4"><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr>` +
    rows.map((r) => `<tr>${r.map((v) => `<td>${esc(v)}</td>`).join('')}</tr>`).join('') +
    `</table>`;
  const html =
    `<p>Subject: Degree progress summary (CSE degree self-check)</p><p>Dear Advisor,</p>` +
    `<p>${esc(intro)}</p><p>${esc(standing)}</p>` +
    groups
      .map(
        (g) =>
          `<p><strong>${esc(g.heading)}</strong></p>` +
          table(
            ['Requirement', '§', 'Status'],
            g.rows.map((r) => [r.title, r.citation.section, g.detailed && r.detail ? r.detail : STATUS_LABEL[r.status]]),
          ),
      )
      .join('') +
    (courses.length > 0
      ? `<p><strong>Courses counted toward requirements</strong></p>` +
        table(
          ['Course', 'Term', 'Counts toward'],
          countedLines.map((l) => [l.courseId, termLabel(l.term), l.text]),
        )
      : '') +
    notices.map((n) => `<p>${esc(n)}</p>`).join('') +
    `<p>Thank you!</p>`;
  return { text, html };
}
