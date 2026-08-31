// Renders an AuditReport: score dial, credit meters, requirement groups with
// status pills + deadline chips + § citations, and the plain-text summary copy.
import type { AuditReport, RequirementResult, Status } from '../engine/types.ts';
import { termLabel } from '../engine/term.ts';
import { el } from './dom.ts';

const STATUS_LABEL: Record<Status, string> = {
  met: 'Met',
  in_progress: 'In progress',
  unmet: 'Not yet',
  needs_dgs_review: 'Needs review',
  cannot_evaluate: 'Cannot evaluate',
  not_applicable: 'N/A',
};

const STATUS_MARK: Record<Status, string> = {
  met: '[x]',
  in_progress: '[~]',
  unmet: '[ ]',
  needs_dgs_review: '[?]',
  cannot_evaluate: '[!]',
  not_applicable: '[-]',
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
  const cite = el('span', { class: 'cite', title: r.citation.quote }, r.citation.section);
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

/** Plain-text summary for "Copy summary" — paste into an email to an advisor. */
export function summaryText(report: AuditReport, todayIso: string): string {
  const lines: string[] = [
    `CSE Graduate Degree Audit self-check (${report.program === 'mscse' ? 'MSCSE, §3' : 'Ph.D., §4'}) — ${todayIso}`,
    `${report.summary.met} of ${report.summary.scored} requirements met. Legend: [x] met  [~] in progress  [ ] not yet  [?] needs a decision or approval  [!] cannot evaluate  [-] n/a`,
    '',
  ];
  let group = '';
  for (const r of report.requirements) {
    if (r.group !== group) {
      group = r.group;
      lines.push(group.toUpperCase());
    }
    lines.push(`  ${STATUS_MARK[r.status]} ${r.title} (${r.citation.section})`);
  }
  for (const line of report.courseLines) {
    lines.push(`  · ${line.courseId} (${termLabel(line.term)}): ${line.text}`);
  }
  lines.push('', 'Self-check against the CSE Graduate Studies Handbook, July 2026. Confirm with the DGS office.');
  return lines.join('\n');
}
