// Renders an AuditReport: score dial, credit meters, requirement groups with
// status pills + deadline chips + § citations. (The "Copy summary for advisor"
// email lives in advisor-summary.ts — string building only, no DOM.)
import { formatCredits } from '../engine/credits.ts';
import type { AuditReport, Contribution, RequirementResult, Status } from '../engine/types.ts';
import { el } from './dom.ts';

// Plain words in sentence case (usability review 2026-09-05, item 16): no
// abbreviations — "N/A" became "Does not apply" — and the pill CSS no longer
// upper-cases them.
const STATUS_LABEL: Record<Status, string> = {
  met: 'Met',
  in_progress: 'In progress',
  unmet: 'Not yet',
  // "Conditionally met", not "Needs DGS review" (W-CS1, DGS 2026-09-18): the
  // student's POSITION, not the errand. The sub-line still names who must
  // approve, so nothing is lost by dropping the actor — and the pill no longer
  // needs first-mention.ts's DGS→ADGS rewrite for an MSCSE student.
  needs_dgs_review: 'Conditionally met',
  cannot_evaluate: 'Cannot evaluate',
  not_applicable: 'Does not apply',
};

/** The rows the headline counts: informational rows (the per-course sign-off
 * list, the along-the-way M.S.) and "does not apply" rows are outside the score. */
export function scoredRows(report: AuditReport): RequirementResult[] {
  return report.requirements.filter((r) => !r.informational && r.status !== 'not_applicable');
}

/** A requirement id as an element-id fragment: `phd.qualifier.core.os` → `phd-qualifier-core-os`. */
function idSlug(id: string): string {
  return id.replace(/[^a-z0-9]+/gi, '-');
}
/** The `id` of a requirement's card on the page — what every link to it targets. */
export function reqAnchorId(id: string): string {
  return `req-${idSlug(id)}`;
}

function dial(report: AuditReport, untouched = false): HTMLElement {
  const { met, conditional, scored } = report.summary;
  const pct = scored === 0 ? 0 : met / scored;
  // Conditional satisfaction is its own band on the arc (R2, 2026-09-18), drawn
  // from where the met band ends: a student can see at a glance how much of the
  // ring is theirs outright and how much waits on a signature.
  const condPct = scored === 0 ? 0 : conditional / scored;
  const C = 2 * Math.PI * 32;
  const svgNs = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNs, 'svg');
  svg.setAttribute('viewBox', '0 0 80 80');
  svg.setAttribute('class', 'dial');
  svg.setAttribute('aria-hidden', 'true'); // decorative — the headline text carries the numbers (item 17)
  const track = document.createElementNS(svgNs, 'circle');
  const condArc = document.createElementNS(svgNs, 'circle');
  const arc = document.createElementNS(svgNs, 'circle');
  for (const [c, cls] of [
    [track, 'dial-track'],
    [condArc, 'dial-arc dial-arc-conditional'],
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
  condArc.setAttribute('stroke-dasharray', `${C * condPct} ${C}`);
  condArc.setAttribute('stroke-dashoffset', `${-C * pct}`);
  condArc.setAttribute('stroke', 'var(--info)');
  const text = document.createElementNS(svgNs, 'text');
  text.setAttribute('x', '40');
  text.setAttribute('y', '45');
  text.setAttribute('text-anchor', 'middle');
  text.setAttribute('class', 'dial-text');
  text.textContent = `${met}/${scored}`;
  svg.append(track, condArc, arc, text);

  // The headline counts what is met, in progress and still open instead of
  // "N to go", which read as bad news to a student on track (usability
  // review 2026-09-05, item 17); when everything passes it says what "all"
  // means here — the automatic checks, not the DGS's confirmation.
  const remaining = scored - met;
  const inProgress = scoredRows(report).filter((r) => r.status === 'in_progress').length;
  // Conditional satisfaction stands in the headline as its own count. It was a
  // parenthetical on the "not yet" number — "6 not yet (2 need a DGS
  // decision)" — which filed two conditionally satisfied requirements under
  // things the student had not done (R2, 2026-09-18).
  const open = remaining - inProgress - conditional;
  // The headline IS the status key (trim review 2026-09-18, P-49; R2's separate
  // key under the meters is gone): each count carries a dot in the colour of
  // the dial band it stands for, so the ring is readable without hovering
  // anything, and the same three numbers are no longer printed twice 180 px
  // apart. The dots are empty elements — the words carry the counts.
  const parts: [string, string][] = [['s-met', `${met} of ${scored} met`]];
  if (conditional > 0) parts.push(['s-needs_dgs_review', `${conditional} conditionally met`]);
  if (inProgress > 0) parts.push(['s-in_progress', `${inProgress} in progress`]);
  if (open > 0) parts.push(['s-unmet', `${open} not yet`]);
  // "0 of 17 met" is a true but useless thing to tell someone who has entered
  // nothing (2026-09-08): every row is open because the page is empty, not
  // because anything is wrong. The old `scored === 0` branch could never fire —
  // an empty Ph.D. record still scores 17 rows. Neither of the two plain-text
  // states carries key dots: a lone "17 not yet" / "17 met" said nothing the
  // sentence does not.
  const headline =
    untouched
      ? el('div', { class: 'headline' }, 'Getting started — add your coursework to see where you stand')
      : scored > 0 && remaining === 0
        ? el('div', { class: 'headline' }, 'All automatically checkable items are currently satisfied')
        : el(
            'div',
            { class: 'headline' },
            ...parts.flatMap(([cls, label], i) => [
              i > 0 ? ' · ' : null,
              el('span', { class: `key-item ${cls}` }, el('i', { class: 'key-dot' }), label),
            ]),
          );
  // The subline under the headline survives only where it carries an
  // instruction — "send the processing request before you file". The
  // self-check reminder it used to give in every other state is on the
  // notice line above the report, in the footer and in the print header
  // (trim review 2026-09-18, P-10).
  const subline =
    remaining === 0 && scored > 0
      ? el(
          'div',
          { class: 'subline' },
          'All automatic checks pass — the DGS still confirms eligibility, and the Grad Admin processes it: send the processing request before you file.',
        )
      : null;
  return el('div', { class: 'scorehead' }, svg, el('div', {}, headline, subline));
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
    // From the row's own numbers, not re-parsed out of its prose: B3 reworded
    // the sentence once a minimum is passed, and the old /^(\d+) of (\d+)/
    // would have quietly dropped the bar for exactly the students who had
    // earned it.
    if (!row?.progress) continue;
    const { have, need } = row.progress;
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
  // A row may override the WORDING without changing its status or its place in
  // the counts (W-CS2): the §4.7 defense past §4.3's limit reads "Eligibility
  // at risk", since "Conditionally met" would promise a degree that may be
  // forfeit.
  const pill = el('span', { class: `pill s-${r.status}${r.statusLabel ? ' s-alarm' : ''}` }, r.statusLabel ?? STATUS_LABEL[r.status]);
  // The rule itself, on the output side (DGS request 2026-09-03): clicking the
  // § chip reveals the handbook sentence this verdict is checked against. A
  // disclosure button (usability review 2026-09-05, item 24): its expanded
  // state is exposed, and its name says what it does — the tooltip alone
  // reached neither keyboard nor touch users.
  const quoteId = `rule-quote-${idSlug(r.id)}`;
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
  // The § chip flows inline after the title's last word, so it reads as part
  // of the requirement's name and a row with no deadline and no course link
  // has no second line at all (trim review 2026-09-18, P-70). The chip keeps
  // its target size, dashed underline, caret and aria wiring.
  const head = el('div', { class: 'req-head' }, el('span', { class: 'req-title' }, r.title, ' ', cite), pill);
  // Built only when something goes into it (P-70): a deadline chip, a course
  // link, or both.
  const chips = el('div', { class: 'req-chips' });
  if (r.deadline && r.status !== 'met') {
    // Deadlines in readable body-size type, coloured by state (usability
    // review 2026-09-05, item 15). Item 15's "Deadline:" / "Deadline passed:"
    // lead word is gone (trim review 2026-09-18, P-50): every label the engine
    // writes already opens with "Due by" / "Due before" / "Overdue —", and the
    // whole chip carries the state colour.
    chips.append(el('span', { class: `chip deadline d-${r.deadline.state}` }, r.deadline.label));
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
              : 'warn' in p
                // Something the student is LOSING gets its own treatment, not
                // the grey prose every other line is in (R2, 2026-09-18).
                ? el('li', { class: 'detail-warn' }, /[.!?]$/.test(p.warn) ? p.warn : `${p.warn}.`)
                : el(
                    'li',
                    {},
                    `${p.lead}:`,
                    el('ul', { class: 'detail-sublist' }, ...p.items.map((i) => el('li', {}, /[.!?]$/.test(i) ? i : `${i}.`))),
                  ),
          ),
        )
      : el('div', { class: 'req-detail', 'data-keep-dgs': '' }, r.detail);
  // Which courses and credits a credit row is built from (DGS 2026-09-22),
  // folded so the card stays short: "Courses counted (4 · 12 credits)".
  // The data-key keeps a fold the student opened open across re-renders.
  const contrib = r.contributions ?? [];
  const contribNode =
    contrib.length > 0
      ? el(
          'details',
          { class: 'contrib', 'data-key': `contrib.${r.id}` },
          el('summary', {}, contribSummary(contrib)),
          el(
            'ul',
            { class: 'contrib-list' },
            ...contrib.map((c) =>
              el('li', { class: c.pending ? 'pending' : '' }, el('span', { class: 'cid' }, c.courseId), ` · ${formatCredits(c.credits)} ${c.credits === 1 ? 'credit' : 'credits'}`, c.pending ? ' — will count once passed or approved' : ''),
            ),
          ),
        )
      : null;
  return el(
    'div',
    { class: `req s-${r.status}`, id: reqAnchorId(r.id) },
    head,
    chips.childElementCount > 0 ? chips : null,
    detailNode,
    contribNode,
    quote,
  );
}

/** "Courses counted (4 · 12 credits)", plus the pending ones when there are any. */
function contribSummary(contrib: readonly Contribution[]): string {
  const counted = contrib.filter((c) => !c.pending);
  const pending = contrib.filter((c) => c.pending);
  const credits = (list: readonly Contribution[]) => formatCredits(list.reduce((n, c) => n + c.credits, 0));
  const head = counted.length > 0 ? `Courses counted (${counted.length} · ${credits(counted)} credits)` : 'Courses counted (none yet)';
  return pending.length > 0 ? `${head} · ${pending.length} pending (${credits(pending)} credits)` : head;
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
export function renderSummary(report: AuditReport): HTMLElement {
  return el(
    'section',
    { class: 'summary-mobile', 'aria-label': 'Your result so far' },
    dial(report),
    meters(report),
    el('a', { class: 'jump-link', href: '#report' }, 'See the full report ↓'),
  );
}

/** One-line score for the sticky bar on narrow screens. */
export function scoreLine(report: AuditReport): string {
  const { met, conditional, scored } = report.summary;
  if (scored === 0) return 'No requirements scored yet';
  // The sticky bar used to read "7 of 17 met" and hide the distinction
  // entirely (R2, 2026-09-18).
  return `${met} of ${scored} met${conditional > 0 ? ` · ${conditional} conditionally met` : ''}`;
}

export function renderReport(report: AuditReport, untouched = false): HTMLElement {
  // "Your report", matching the column's own label in app.ts and the page's
  // second-person voice — not "Audit report", the one place a screen reader
  // was told this is the audit the page says three times it is not (trim
  // review 2026-09-18, P-61).
  const panel = el('section', { class: 'audit', 'aria-label': 'Your report' });
  // On a first visit every row is "Not yet" simply because nothing has been
  // entered — thirteen red rows about a student who has typed nothing read as
  // failure (2026-09-08). The list is still there, folded, and named for what
  // it is: the requirements, not a to-do list.
  const attention = attentionList(report, untouched);
  const attentionBlock =
    attention === null
      ? []
      : untouched
        ? [
            el(
              'details',
              { class: 'attention-fold', 'data-key': 'report.attention' },
              el('summary', {}, `What this degree requires — ${scoredRows(report).length} checks`),
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
      { class: 'track-note', role: 'note', 'data-keep-dgs': '' },
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
 * things up by section.
 *
 * On an UNTOUCHED record (trim review 2026-09-18, P-2) the list is something
 * else: the fold above it is named "What this degree requires", so its body is
 * one title per requirement the summary counts — the same 17, in handbook
 * order, each still a link to its row — with no pill, no detail sentence and
 * no "Needs your attention" heading. Eleven "Not yet · 0 of 60" lines about an
 * empty page were the to-do list the 2026-09-08 fold was meant to put away,
 * and each was the first sentence of the row 300 px below, word for word. The
 * full ranked list returns the moment anything is entered. */
function attentionList(report: AuditReport, untouched = false): HTMLElement | null {
  if (untouched) {
    const counted = scoredRows(report);
    if (counted.length === 0) return null;
    return el(
      'section',
      { class: 'attention', 'aria-label': 'What this degree requires' },
      el('ul', {}, ...counted.map((r) => el('li', {}, el('a', { href: `#${reqAnchorId(r.id)}` }, r.title)))),
    );
  }
  // Ranked by URGENCY, not by status (blue-team B5, 2026-09-18). Filtering on
  // status alone put "Dissertation defense passed" — years away — above the
  // research qualifier due in eighteen months, and left the qualifying
  // examination out altogether because it classifies as in_progress.
  const ORDER: Status[] = ['cannot_evaluate', 'needs_dgs_review', 'unmet'];
  /** Rows nothing can be done about yet. Most say so in their own detail — the
   * engine writes "Not yet available: …" wherever a requirement names its own
   * precondition. The dissertation pair does not, so they are named here: a
   * student cannot have readers approve a dissertation, or defend it, before
   * the §4.5 candidacy exam they come after. This is a PRESENTATION judgement
   * about what belongs on a to-do list, not a rule — both rows stay in the
   * report, with their verdicts unchanged. */
  const AFTER_CANDIDACY = ['phd.dissertation.approval', 'phd.dissertation.defense'];
  const candidacyPassed = report.requirements.some((r) => r.id === 'phd.candidacy' && r.status === 'met');
  const unreachable = (r: RequirementResult): boolean =>
    /^Not yet available:/.test(r.detail) || (AFTER_CANDIDACY.includes(r.id) && !candidacyPassed);
  const DEADLINE_RANK: Record<string, number> = { overdue: 0, due_soon: 1, upcoming: 3, done: 4 };
  const rank = (r: RequirementResult): number => {
    const byDeadline = r.deadline ? DEADLINE_RANK[r.deadline.state] ?? 3 : undefined;
    // A missing input the student can supply today still comes first: it is the
    // one thing on the page that is entirely theirs to fix.
    if (r.status === 'cannot_evaluate') return -1;
    return byDeadline ?? 2 + ORDER.indexOf(r.status) / 10;
  };
  const rows = report.requirements
    .filter((r) => {
      if (r.informational || unreachable(r)) return false;
      if (ORDER.includes(r.status)) return true;
      // …and an in_progress row whose deadline is close is exactly what the
      // student needs to see, whatever its status says (B5).
      return r.status === 'in_progress' && (r.deadline?.state === 'due_soon' || r.deadline?.state === 'overdue');
    })
    .sort((a, b) => {
      const d = rank(a) - rank(b);
      if (d !== 0) return d;
      // Same urgency: the nearer date first, then the report's own order.
      const da = a.deadline?.date ?? '';
      const db = b.deadline?.date ?? '';
      if (da && db && da !== db) return da < db ? -1 : 1;
      return ORDER.indexOf(a.status) - ORDER.indexOf(b.status);
    });
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
          el('a', { href: `#${reqAnchorId(r.id)}` }, r.title),
          el('span', { class: `pill s-${r.status} small` }, STATUS_LABEL[r.status]),
          r.deadline && r.deadline.state === 'overdue' ? el('span', { class: 'attention-overdue' }, ' — deadline passed') : null,
          el('span', { class: 'attention-next', 'data-keep-dgs': '' }, ` ${firstSentence(r.detail)}`),
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
    // One sentence each and a pointer at the next entry (trim review
    // 2026-09-18, P-17): the example list was the contact card's line again
    // and still said "on this page", which R-16 had already retired there.
    ...(program === 'mscse'
      ? ([['ADGS', 'The Assistant Director of Graduate Studies — the faculty member who decides, by the handbook and the course rules, every requirement for MSCSE students. Processing is the Grad Admin’s job.', '§1']] as [string, string, string][])
      : ([['DGS', 'The Director of Graduate Studies — the faculty member who decides, by the handbook and the course rules, whether each requirement here is satisfied. Processing is the Grad Admin’s job.', '§1']] as [string, string, string][])),
    // A definition only: "Requests go by email; this page sends nothing" is on
    // the request cards and in every dialog's last step (trim review
    // 2026-09-18, P-35). On the M.S. tab the decider is the ADGS, as the entry
    // one line above says (P-60; DGS 2026-09-11) — the glossary is exempt from
    // first-mention.ts's DGS→ADGS rewrite, so it must say so itself.
    [
      'Grad Admin',
      program === 'phd'
        ? 'The Graduate Program Administrator: processes what the DGS has decided and keeps the official record — transfer credit (§5.2), the qualifier form (§4.4), exam and defense forms (§4.5–4.7), the MSCSE along the way (§4.5).'
        : 'The Graduate Program Administrator: processes what the ADGS has decided and keeps the official record — transfer credit (§5.2), and the exam and defense forms (§3.4).',
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
    // The glossary's § chips are plain spans, not links; only the rows' §
    // buttons open the handbook text (trim review 2026-09-18, P-32).
    el('p', { class: 'hint' }, 'Paraphrased; each requirement’s § button above opens the handbook’s own words.'),
  );
}

