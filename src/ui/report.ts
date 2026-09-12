// Renders an AuditReport: score dial, credit meters, requirement groups with
// status pills + deadline chips + § citations. (The "Copy summary for advisor"
// email lives in advisor-summary.ts — string building only, no DOM.)
import type { AuditReport, RequirementResult, Status } from '../engine/types.ts';
import { el } from './dom.ts';

// Plain words in sentence case (usability review 2026-09-05, item 16): no
// abbreviations — "N/A" became "Does not apply" — and the pill CSS no longer
// upper-cases them.
const STATUS_LABEL: Record<Status, string> = {
  met: 'Met',
  in_progress: 'In progress',
  unmet: 'Not yet',
  needs_dgs_review: 'Needs DGS review',
  cannot_evaluate: 'Cannot evaluate',
  not_applicable: 'Does not apply',
};

function dial(report: AuditReport, untouched = false): HTMLElement {
  const { met, scored } = report.summary;
  const pct = scored === 0 ? 0 : met / scored;
  const C = 2 * Math.PI * 32;
  const svgNs = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNs, 'svg');
  svg.setAttribute('viewBox', '0 0 80 80');
  svg.setAttribute('class', 'dial');
  svg.setAttribute('aria-hidden', 'true'); // decorative — the headline text carries the numbers (item 17)
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
  // Red means something is WRONG, not "not finished yet" (2026-09-08). A Ph.D.
  // does not cross half the checks until about year four, so the old
  // pct > 0.5 test painted an on-track second-year student the same red as an
  // overdue deadline — the mistake already corrected in the headline below.
  arc.setAttribute(
    'stroke',
    pct === 1 ? 'var(--ok)' : report.requirements.some((r) => r.deadline?.state === 'overdue') ? 'var(--bad)' : 'var(--navy)',
  );
  const text = document.createElementNS(svgNs, 'text');
  text.setAttribute('x', '40');
  text.setAttribute('y', '45');
  text.setAttribute('text-anchor', 'middle');
  text.setAttribute('class', 'dial-text');
  text.textContent = `${met}/${scored}`;
  svg.append(track, arc, text);

  // The headline counts what is met, in progress and still open instead of
  // "N to go", which read as bad news to a student on track (usability
  // review 2026-09-05, item 17); when everything passes it says what "all"
  // means here — the automatic checks, not the DGS's confirmation.
  const remaining = scored - met;
  const scoredRows = report.requirements.filter((r) => !r.informational && r.status !== 'not_applicable');
  const inProgress = scoredRows.filter((r) => r.status === 'in_progress').length;
  const needsReview = scoredRows.filter((r) => r.status === 'needs_dgs_review').length;
  const open = remaining - inProgress;
  const parts = [`${met} of ${scored} met`];
  if (inProgress > 0) parts.push(`${inProgress} in progress`);
  if (open > 0) parts.push(`${open} not yet${needsReview > 0 ? ` (${needsReview} need${needsReview === 1 ? 's' : ''} a DGS decision)` : ''}`);
  // "0 of 17 met" is a true but useless thing to tell someone who has entered
  // nothing (2026-09-08): every row is open because the page is empty, not
  // because anything is wrong. The old `scored === 0` branch could never fire —
  // an empty Ph.D. record still scores 17 rows.
  const headline =
    untouched
      ? 'Getting started — add your coursework to see where you stand'
      : scored > 0 && remaining === 0
        ? 'All automatically checkable items are currently satisfied'
        : parts.join(' · ');
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
          ? 'All automatic checks pass — the DGS still confirms eligibility, and the Grad Admin processes it: send the processing request before you file.'
          : 'This is a self-check — the DGS decides eligibility by the rules; the Grad Admin processes it and keeps the official record.',
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
          ['phd.credits.nd', 'Credits at ND'],
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
    if (have >= need) fill.classList.add('done');
    bar.append(fill);
    // Past the target the bar is full and the label says so ("12 (9 needed) ✓")
    // instead of the odd-looking "12/9" (item 17).
    box.append(
      el(
        'div',
        { class: 'meter' },
        el('div', { class: 'meter-label' }, `${label} `, el('span', {}, have >= need ? `${have} (${need} needed) ✓` : `${have} of ${need}`)),
        bar,
      ),
    );
  }
  return box;
}

function requirementCard(r: RequirementResult): HTMLElement {
  const pill = el('span', { class: `pill s-${r.status}` }, STATUS_LABEL[r.status]);
  // The rule itself, on the output side (DGS request 2026-09-03): clicking the
  // § chip reveals the handbook sentence this verdict is checked against. A
  // disclosure button (usability review 2026-09-05, item 24): its expanded
  // state is exposed, and its name says what it does — the tooltip alone
  // reached neither keyboard nor touch users.
  const quoteId = `rule-quote-${r.id.replace(/[^a-z0-9]+/gi, '-')}`;
  const quote = el('div', { class: 'rule-quote hidden', id: quoteId }, `Handbook ${r.citation.section}: “${r.citation.quote}”`);
  const cite = el(
    'button',
    {
      class: 'cite',
      'aria-label': `${r.citation.section} — show the handbook rule behind this check`,
      'aria-expanded': 'false',
      'aria-controls': quoteId,
      'data-key': `cite.${r.id}`,
      onclick: () => {
        const open = quote.classList.toggle('hidden') === false;
        cite.setAttribute('aria-expanded', open ? 'true' : 'false');
      },
    },
    r.citation.section,
  );
  const head = el('div', { class: 'req-head' }, el('span', { class: 'req-title' }, r.title), pill);
  const chips = el('div', { class: 'req-chips' }, cite);
  if (r.deadline && r.status !== 'met') {
    // Deadlines in readable body-size type with a lead word, coloured by
    // state (usability review 2026-09-05, item 15).
    chips.append(
      el(
        'span',
        { class: `chip deadline d-${r.deadline.state}` },
        el('span', { class: 'deadline-word' }, r.deadline.state === 'overdue' ? 'Deadline passed: ' : 'Deadline: '),
        r.deadline.label,
      ),
    );
  }
  // A link straight to the matching course list (item 29): the core-knowledge
  // rows, the specialization row and the regular-course rows.
  const courseLink = courseListLink(r);
  if (courseLink) chips.append(courseLink);
  // A long multi-statement detail reads better as bullets (DGS request
  // 2026-09-04); short or single-statement details stay prose. A {lead,
  // items} part renders as a nested two-layer list (one sub-bullet per item,
  // DGS request 2026-09-04). The advisor summary keeps the joined `detail`.
  // Short §4.4.2 group names on the page, full ones in `detailParts` for the
  // copied messages (DGS 2026-09-08).
  const parts = r.shortDetailParts ?? r.detailParts ?? [];
  const structured = parts.some((p) => typeof p !== 'string');
  const detailNode =
    parts.length > 0 && (structured || (parts.length > 1 && r.detail.length > 120))
      ? el(
          'ul',
          { class: 'req-detail detail-list' },
          ...parts.map((p) =>
            typeof p === 'string'
              ? el('li', {}, /[.!?]$/.test(p) ? p : `${p}.`)
              : el(
                  'li',
                  {},
                  `${p.lead}:`,
                  el('ul', { class: 'detail-sublist' }, ...p.items.map((i) => el('li', {}, /[.!?]$/.test(i) ? i : `${i}.`))),
                ),
          ),
        )
      : el('div', { class: 'req-detail' }, r.detail);
  return el(
    'div',
    { class: `req s-${r.status}`, id: `req-${r.id.replace(/[^a-z0-9]+/gi, '-')}` },
    head,
    chips,
    detailNode,
    quote,
  );
}

/** courses.html understands filter query parameters (2026-09-05, item 29),
 * so an unmet row can point at exactly the courses that would satisfy it. */
function courseListLink(r: RequirementResult): HTMLElement | undefined {
  let href: string | undefined;
  let label = 'See the courses that count →';
  const core = /^phd\.qualifier\.core\.(.+)$/.exec(r.id);
  if (core) {
    href = `./courses.html?core=${encodeURIComponent(core[1]!)}&view=qualifier`;
    label = 'See the courses for this area →';
  } else if (r.id === 'phd.qualifier.categories') {
    href = './courses.html?view=qualifier';
    label = 'See the specialization categories →';
  } else if (r.id === 'ms.credits.regular') {
    href = './courses.html?program=mscse&type=regular&view=mscse';
  } else if (r.id === 'phd.credits.regular') {
    href = './courses.html?program=phd&type=regular&view=phd';
  }
  if (!href) return undefined;
  return el('a', { class: 'course-link', href }, label);
}

/** The score dial, headline and credit meters on their own — shown a second
 * time at the TOP of the page on phones and small tablets, where the full
 * report sits below every input card (usability review 2026-09-05, item 2).
 * The links jump between the two halves of the page. */
export function renderSummary(report: AuditReport, untouched = false): HTMLElement {
  return el(
    'section',
    { class: 'summary-mobile', 'aria-label': 'Your result so far' },
    dial(report, untouched),
    meters(report),
    el('a', { class: 'jump-link', href: '#report' }, 'See the full report ↓'),
  );
}

/** One-line score for the sticky bar on narrow screens. */
export function scoreLine(report: AuditReport): string {
  const { met, scored } = report.summary;
  return scored === 0 ? 'No requirements scored yet' : `${met} of ${scored} met`;
}

export function renderReport(report: AuditReport, untouched = false): HTMLElement {
  const panel = el('section', { class: 'audit', 'aria-label': 'Audit report' });
  // On a first visit every row is "Not yet" simply because nothing has been
  // entered — thirteen red rows about a student who has typed nothing read as
  // failure (2026-09-08). The list is still there, folded, and named for what
  // it is: the requirements, not a to-do list.
  const attention = attentionList(report);
  const attentionBlock =
    attention === null
      ? []
      : untouched
        ? [
            el(
              'details',
              { class: 'attention-fold', 'data-key': 'report.attention' },
              el('summary', {}, `What this degree requires — ${report.requirements.filter((r) => !r.informational && r.status !== 'not_applicable').length} checks`),
              attention,
            ),
          ]
        : [attention];
  // §3.5 / §3.6 tracks this audit does not model (2026-09-10, promised
  // 2026-08-31). Above the dial, because the number under the dial means
  // something different once you know a required bridge year counts toward
  // almost nothing. Deliberately NOT a warning: nothing is wrong, and the
  // note changes no verdict — it names what the page cannot decide.
  const trackNotes = report.tracks.map((t) =>
    el(
      'div',
      { class: 'track-note', role: 'note' },
      el('strong', {}, `${t.title} (${t.section})`),
      ' ',
      t.text,
    ),
  );

  panel.append(
    el('a', { class: 'jump-link back-link', href: '#main' }, '↑ Back to your inputs'),
    ...trackNotes,
    dial(report, untouched),
    meters(report),
    ...attentionBlock,
    // The glossary defines words used a screen later, not nine thousand pixels
    // later (2026-09-08); it is a closed <details>, so it costs about 30 px.
    glossary(report.program),
  );

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

/** "Needs your attention": the rows a student must act on, first — not met,
 * needing a DGS decision, or missing an input — each linking to its card with
 * the card's first sentence as the next step (usability review 2026-09-05,
 * item 27). The handbook order of the cards below is kept: students look
 * things up by section. */
function attentionList(report: AuditReport): HTMLElement | null {
  // Most actionable first (2026-09-08): a missing input the student can supply
  // today, then a course waiting on the DGS, then what is simply not done yet.
  // The old order put the one row a new student could act on 13th of 13.
  const ORDER: Status[] = ['cannot_evaluate', 'needs_dgs_review', 'unmet'];
  const rows = report.requirements
    .filter((r) => !r.informational && ORDER.includes(r.status))
    .sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status));
  if (rows.length === 0) return null;
  // Cut at a sentence when there is one inside 110 characters; otherwise at a
  // word, with an ellipsis (2026-09-08 — the qualifier row's only full stops
  // are inside "§4.4.1", so it used to break mid-word with no sign of it).
  const firstSentence = (text: string): string => {
    const m = /^(.{1,110}?[.!?])(\s|$)/.exec(text);
    if (m) return m[1]!.trim();
    if (text.length <= 110) return text.trim();
    const cut = text.slice(0, 110);
    const space = cut.lastIndexOf(' ');
    return `${(space > 40 ? cut.slice(0, space) : cut).trim()}…`;
  };
  return el(
    'section',
    { class: 'attention', 'aria-labelledby': 'attention-title' },
    el('h3', { id: 'attention-title' }, `Needs your attention (${rows.length})`),
    el(
      'ul',
      {},
      ...rows.map((r) =>
        el(
          'li',
          {},
          el('a', { href: `#req-${r.id.replace(/[^a-z0-9]+/gi, '-')}` }, r.title),
          el('span', { class: `pill s-${r.status} small` }, STATUS_LABEL[r.status]),
          r.deadline && r.deadline.state === 'overdue' ? el('span', { class: 'attention-overdue' }, ' — deadline passed') : null,
          el('span', { class: 'attention-next' }, ` ${firstSentence(r.detail)}`),
        ),
      ),
    ),
  );
}

/** Handbook terms the report uses before it explains them (usability review
 * 2026-09-05, item 28). Each entry cites its section; the wording follows the
 * handbook sentences quoted in the engine. */
function glossary(program: 'mscse' | 'phd'): HTMLElement {
  const entries: [string, string, string][] = [
    ['Cumulative GPA', 'The grade-point average over all your graduate coursework at Notre Dame, as the registrar computes it; continuation, candidacy and graduation require at least 3.0.', '§2.2'],
    ['Regular course', 'A lecture-style course. Only regular courses count toward the 24 regular-course credits; seminars, research, independent study and project credits count toward the total only.', program === 'mscse' ? '§3.2' : '§4.2'],
    ['Full-time', 'A semester in which you are registered for the full-time credit load (9 or more credits, or research-heavy terms you mark yourself).', '§2.1.2'],
    program === 'mscse'
      ? ['Residency', 'Registration in full-time status for one semester during the academic year, or for one summer session.', '§3.3']
      : ['Residency', 'Full-time status for four consecutive semesters, not counting summer sessions, counted from the term you entered the program.', '§4.3'],
    ...(program === 'phd'
      ? ([
          ['Qualifying examination (qualifier)', 'Three components — core knowledge, category specialization and the research component — all to be completed within four semesters of starting; the DGS may extend the deadline case by case.', '§4.4'],
          ['Core knowledge', 'An Operating Systems course, an Algorithms course and a Computer Architecture course, passed at Notre Dame or at a previous institution (undergraduate or graduate; a previous-institution course counts once the DGS confirms it).', '§4.4.1'],
          ['Specialization (category specialization)', 'Three courses from three distinct specialization groups, each passed with a B or higher. A course may count for both core knowledge and specialization.', '§4.4.2'],
          ['Research qualifier', 'Within 18 months of entering the program, your research advisor determines whether you have passed the research component and files the form.', '§4.4.3'],
          ['Oral Candidacy Exam (OCE)', 'The candidacy examination of §4.5, sometimes called the dissertation proposal: a written proposal and an oral exam before your committee. It must be taken before the end of your eighth semester in the program.', '§4.5'],
          ['Transfer credit', 'Courses from an M.S. earned at Notre Dame or elsewhere within the five years before admission may count toward the course requirement, with the DGS’s recommendation and the Graduate School’s approval.', '§5.2'],
        ] as [string, string, string][])
      : ([
          ['Project or thesis', 'Six credits of Master’s project (CSE 68902) or Master’s thesis direction (CSE 68901), in addition to the 24 regular-course credits.', '§3.2, §3.4'],
          ['Transfer credit', 'Graduate courses from another program may count toward the course requirement within the handbook’s caps, with the DGS’s recommendation and the Graduate School’s approval.', '§5.2'],
        ] as [string, string, string][])),
    ['DGS', 'The Director of Graduate Studies — the faculty member who determines, by the handbook and the course rules, whether each requirement here is satisfied. Processing is not the DGS’s job (see Grad Admin).', '§1'],
    [
      'Grad Admin',
      program === 'phd'
        ? 'The Graduate Program Administrator: processes what the DGS has decided and keeps the official record — transfer credit (§5.2), the qualifier form (§4.4), exam and defense forms (§4.5–4.7), the MSCSE along the way (§4.5). Requests go by email; this page sends nothing.'
        : 'The Graduate Program Administrator: processes what the DGS has decided and keeps the official record — transfer credit (§5.2), and the exam and defense forms (§3.4). Requests go by email; this page sends nothing.',
      '§5.2',
    ],
  ];
  return el(
    'details',
    { class: 'glossary', 'data-key': 'report.glossary' },
    el('summary', {}, 'Terms used here'),
    el(
      'dl',
      {},
      ...entries.flatMap(([term, text, section]) => [
        el('dt', {}, term, ' ', el('span', { class: 'chip-note' }, section)),
        el('dd', {}, text),
      ]),
    ),
    el('p', { class: 'hint' }, 'Short forms of the handbook’s wording — the section numbers link the full text through each requirement’s § button above.'),
  );
}

