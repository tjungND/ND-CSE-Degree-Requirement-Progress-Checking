// The student-facing app: standing form, course table with sheet-driven
// autocomplete, milestone dates, attestations, and the live report.
// All rule logic lives in src/engine/ — this file only collects input and renders.
import { resolveRuleRow } from '../data/assemble.ts';
import { findExternalRule, isNotreDameInstitution } from '../data/external.ts';
import { CORE_TITLE_RE } from '../engine/core-title.ts';
import type { Rules } from '../data/types.ts';
import { classify } from '../engine/allocate.ts';
import { audit } from '../engine/audit.ts';
import { GRADES, GRADE_POINTS } from '../engine/grades.ts';
import { termIndex, termLabel, termOfDate } from '../engine/term.ts';
import type { CourseEntry, CourseLine, Season, Student, Term } from '../engine/types.ts';
import { parseTranscript, type DegreeAwarded, type EntryTermInference, type ParsedCourse } from '../transcript/parse.ts';
import { clear, el, option } from './dom.ts';
import { ALPHA_LINE, BETA_NOTICE, BETA_SCOPE_NOTICE, PRIVACY_LINE, RULES_ACCURACY_NOTICE, handbookLink, rulesDateLine } from './handbook.ts';
import { DGS, GRAD_ADMIN, LICENSE_URL, REPO_URL, applyContactOverrides, contactCard, mailto, reportToDgs } from './contacts.ts';
import { DEGREE_SLOTS, copyReviewRequest, importsBusy, priorTranscriptSection } from './external-upload.ts';
import { statusMark } from './marks.ts';
import { isPriorNd, priorNdDegreeLevel, reclassifyNotreDameCourses } from './prior-nd.ts';
import { advisorSummary } from './advisor-summary.ts';
import { renderReport, renderSummary, scoreLine } from './report.ts';
import { sheetSourceLine, sheetSourceNote } from './sheet-source.ts';
import {
  clearLocal,
  emptyStudent,
  exportFile,
  importFile,
  loadLocal,
  saveLocal,
} from './state.ts';

const SEASONS: Season[] = ['fall', 'spring', 'summer'];
// (The §4.4.1 core-title keywords moved to src/engine/core-title.ts on
// 2026-09-04 so the classifier and the import preview share them.)

/** The "Prior graduate study" dropdown labels — reused in the review request. */
const PRIOR_LABELS: Record<Student['priorMs'], string> = {
  none: 'No prior graduate degree',
  unfinished: 'Prior M.S., not completed',
  completed: 'Completed prior M.S. or Ph.D.',
};
const GROUP_CODES = ['alg', 'hcc', 'arch', 'dsai', 'sys'] as const;


export function startApp(root: HTMLElement, rules: Rules): void {
  // Sheet-driven contacts (2026-09-04): must run before ANYTHING renders —
  // the consent notice below already shows the DGS's name and address.
  applyContactOverrides(rules.parameters);
  // Department-approval gate (DGS request, 2026-09-03): shown on EVERY visit
  // until the student clicks Agree — the tool is under testing and not yet
  // approved by the department. Nothing is stored about the click.
  // A native <dialog> shown with showModal() (usability review 2026-09-05,
  // item 3): focus moves into it, Tab stays inside, the page behind is inert,
  // Escape dismisses it like Agree, and focus returns to the page when it
  // closes — the ARIA dialog pattern, which the old overlay div did not follow.
  // "I understand — continue" rather than "Agree" (usability review 2026-09-05,
  // item 9): the notice is informational, not a consent; nothing is stored.
  const agreeButton = el('button', { class: 'btn primary', autofocus: true }, 'I understand — continue');
  const consentDialog = el(
    'dialog',
    { class: 'consent consent-overlay', 'aria-labelledby': 'consent-title' },
    el(
      'div',
      { class: 'consent-box' },
      el('h2', { id: 'consent-title' }, 'Before you continue'),
      el(
        'p',
        {},
        'This tool has not been approved by the department yet. It is for testing and informational purposes only.',
      ),
      // Open invitation for feedback (DGS wording, 2026-09-05). The coverage
      // caveat (COVERAGE_NOTICE) was shown here from 2026-09-05 until the DGS had
      // it removed from this notice later the same day; it still ends the alpha
      // banner, the footer and the copied summary via BETA_SCOPE_NOTICE.
      el(
        'p',
        {},
        `Any error report, suggestion, or feedback is welcome — please contact the DGS (Prof. ${DGS.name}, `,
        mailto(DGS.email),
        ').',
      ),
      agreeButton,
    ),
  );
  const closeConsent = (): void => {
    if (consentDialog.open) consentDialog.close();
    consentDialog.remove();
    root.querySelector<HTMLElement>('.masthead h1')?.focus();
  };
  agreeButton.addEventListener('click', closeConsent);
  consentDialog.addEventListener('close', closeConsent);
  document.body.append(consentDialog);
  if (typeof consentDialog.showModal === 'function') {
    consentDialog.showModal();
    agreeButton.focus();
  } else {
    // A browser without <dialog> (none current) still gets the notice, unblocking.
    consentDialog.setAttribute('open', '');
  }

  let student: Student = loadLocal() ?? emptyStudent();
  // Local date, not UTC — an evening at Notre Dame must not audit as tomorrow.
  const now = new Date();
  const p2 = (n: number) => String(n).padStart(2, '0');
  const todayIso = `${now.getFullYear()}-${p2(now.getMonth() + 1)}-${p2(now.getDate())}`;
  const fullTimeFloor = rules.parameters.number('fulltime_credits_min') ?? 9;
  let toastTimer: number | undefined;
  /** Parsed-transcript preview awaiting the student's confirmation. */
  let transcriptPreview:
    | {
        courses: ParsedCourse[];
        selected: boolean[];
        duplicate: boolean[];
        /** The transcript's graduate-level cumulative GPA (2026-09-05 — never
         * the undergraduate one on a combined transcript). */
        gpa?: number;
        /** The undergraduate-level figure, shown only to say it is NOT used. */
        undergraduateGpa?: number;
        /** This program's courses alone (offered when earlier graduate
         * coursework at Notre Dame is folded into the transcript's figure). */
        programGpa?: number;
        gpaChoice: 'transcript' | 'program' | 'none';
        /** The entry term read from the transcript (2026-09-05) and whether
         * the student keeps the checkbox that applies it. */
        entryTerm?: EntryTermInference;
        useEntryTerm: boolean;
        degreesAwarded: DegreeAwarded[];
        /** Parser warnings, shown inside the preview (not as vanishing toasts). */
        warnings: string[];
      }
    | undefined;

  const update = (mutate: (s: Student) => void): void => {
    mutate(student);
    saveLocal(student);
    render();
  };

  const toast = (msg: string): void => {
    const t = document.querySelector('.toast');
    if (t) {
      t.textContent = msg;
      t.classList.remove('has-action');
      t.classList.add('show');
      window.clearTimeout(toastTimer);
      toastTimer = window.setTimeout(() => t.classList.remove('show'), 4000);
    }
  };
  /** A toast carrying one action (Undo) — stays longer, and is clickable. */
  const toastWithAction = (msg: string, actionLabel: string, action: () => void): void => {
    const t = document.querySelector('.toast');
    if (!t) return;
    t.textContent = msg;
    t.append(
      ' ',
      el(
        'button',
        {
          class: 'toast-action',
          onclick: () => {
            t.classList.remove('show', 'has-action');
            action();
          },
        },
        actionLabel,
      ),
    );
    t.classList.add('show', 'has-action');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => t.classList.remove('show', 'has-action'), 8000);
  };

  // Every change rebuilds the page from the student record (simple, and the
  // engine stays pure) — so the control the student was using is destroyed
  // and re-created. Keyboard and screen-reader users were dropped to the top
  // of the page after every dropdown or checkbox (usability review
  // 2026-09-05, item 23): the rebuild now remembers which control had focus,
  // by its stable `data-key` (or, failing that, its position in the tree),
  // and its text selection and the scroll position, and restores them.
  /** Where to put focus after the NEXT render, when the focused control will
   * not exist any more (a removed course row, the closed preview). */
  let focusAfterRender: string | undefined;
  let lastHeadline = '';
  /** A visually hidden polite live region, created once OUTSIDE the root so
   * the rebuild never re-creates it (a re-created region is not announced):
   * screen-reader users hear the new headline after each change. */
  const srStatus = el('div', { class: 'visually-hidden', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' });
  document.body.append(srStatus);

  function rememberFocus(): { key?: string; path?: number[]; selection?: [number, number]; x: number; y: number } {
    const active = document.activeElement as HTMLElement | null;
    const memo: ReturnType<typeof rememberFocus> = { x: window.scrollX, y: window.scrollY };
    if (!active || active === document.body || !root.contains(active)) return memo;
    memo.key = active.dataset['key'];
    if (!memo.key) {
      const path: number[] = [];
      for (let n: Element | null = active; n && n !== root; n = n.parentElement) {
        path.unshift(Array.prototype.indexOf.call(n.parentElement?.children ?? [], n));
      }
      memo.path = path;
    }
    const input = active as HTMLInputElement;
    if ((active.tagName === 'INPUT' || active.tagName === 'TEXTAREA') && typeof input.selectionStart === 'number' && input.selectionEnd !== null) {
      memo.selection = [input.selectionStart, input.selectionEnd];
    }
    return memo;
  }

  function restoreFocus(memo: ReturnType<typeof rememberFocus>): void {
    const key = focusAfterRender ?? memo.key;
    focusAfterRender = undefined;
    let target: HTMLElement | null = null;
    if (key) target = root.querySelector<HTMLElement>(`[data-key="${CSS.escape(key)}"]`);
    if (!target && memo.path) {
      let n: Element | null = root;
      for (const i of memo.path) n = n?.children[i] ?? null;
      target = n as HTMLElement | null;
    }
    if (target && typeof target.focus === 'function') {
      target.focus({ preventScroll: true });
      const input = target as HTMLInputElement;
      if (memo.selection && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') && /^(text|search|number|email|url|tel|password)$/.test(input.type || 'text')) {
        try {
          if (input.type !== 'number') input.setSelectionRange(memo.selection[0], memo.selection[1]);
        } catch {
          /* selection is not supported on this input type — focus alone is enough */
        }
      }
    }
    window.scrollTo(memo.x, memo.y);
  }

  function render(): void {
    const memo = rememberFocus();
    const report = audit(student, rules, todayIso);
    clear(root);
    root.append(
      ...[
      // Landmarks + a skip link (usability review 2026-09-05, item 7): header
      // → main (notices, inputs, report) → footer; the skip link jumps a
      // keyboard user straight to the report.
      el('a', { class: 'skip-link', href: '#report' }, 'Skip to the report'),
      masthead(),
      el(
        'main',
        { id: 'main' },
        el(
          'p',
          { class: 'print-header' },
          `Self-check printed on ${todayIso} — ${student.program === 'mscse' ? 'M.S. in CSE (§3)' : 'Ph.D. (§4)'}, entered ${termLabel(student.entryTerm)} — not an official audit; confirm with the DGS office.`,
        ),
        noticeStrip(),
        rules.source === 'snapshot' ? snapshotBanner() : null,
        // Phones and small tablets (2026-09-05, review item 2): the result
        // first, then the inputs, then the full report — plus a sticky score
        // bar with jump links (both hidden on wide screens by CSS).
        renderSummary(report),
        el(
          'div',
          { class: 'layout' },
          el(
            'div',
            { class: 'inputs', id: 'inputs' },
            transcriptsCard(),
            standingCard(),
            coursesCard(report.courseLines),
            askDgsCard(),
            milestonesCard(),
            saveCard(report),
            diagnosticsCard(),
          ),
          el(
            'div',
            { class: 'audit-col', id: 'report', tabindex: '-1', 'aria-label': 'Your report' },
            report.warnings.length > 0
              ? el('div', { class: 'warnings', role: 'note' }, ...report.warnings.map((w) => el('div', {}, `⚠ ${w}`)))
              : null,
            renderReport(report),
          ),
        ),
        el(
          'nav',
          { class: 'sticky-score', 'aria-label': 'Your score, and jumps between inputs and report' },
          el('span', { class: 'sticky-text' }, scoreLine(report)),
          el('a', { href: '#inputs' }, 'Inputs ↑'),
          el('a', { href: '#report' }, 'Report ↓'),
        ),
        el('div', { class: 'toast', role: 'status' }),
      ),
      footer(),
      ].filter((n): n is HTMLElement => n !== null),
    );
    restoreFocus(memo);
    // Announce the recomputed result to screen readers — only when it changed,
    // so a keystroke in a title field does not chatter.
    const headline = root.querySelector('.scorehead .headline')?.textContent?.trim() ?? '';
    if (headline && headline !== lastHeadline) {
      if (lastHeadline !== '') srStatus.textContent = `Report updated: ${headline}.`;
      lastHeadline = headline;
    }
  }

  // ---------- masthead ----------

  function masthead(): HTMLElement {
    // The two program buttons expose their pressed state (item 5): a screen
    // reader says "M.S. in CSE §3, toggle button, pressed".
    const tab = (label: string, program: Student['program']) =>
      el(
        'button',
        {
          class: `tab${student.program === program ? ' active' : ''}`,
          'aria-pressed': student.program === program ? 'true' : 'false',
          'data-key': `program.${program}`,
          onclick: () => update((s) => void (s.program = program)),
        },
        label,
      );
    return el(
      'header',
      { class: 'masthead' },
      el(
        'div',
        { class: 'masthead-main' },
        el('div', { class: 'eyebrow' }, 'University of Notre Dame · Computer Science and Engineering'),
        el('h1', { tabindex: '-1' }, 'Graduate Degree Requirement Self-check Tool'),
        el(
          'p',
          { class: 'sub' },
          'Enter your coursework and milestones to see, requirement by requirement, where you stand against the ',
          handbookLink(),
          '. Every check cites the section it comes from. Looking for the list of courses that count? See the ',
          el('a', { href: './courses.html' }, 'course rules page'),
          '.',
        ),
        el(
          'p',
          { class: 'effective' },
          rulesDateLine(rules, termLabel(termOfDate(todayIso)), todayIso),
        ),
        // The rules spreadsheet, linked with its faculty-only note (DGS, 2026-09-04).
        sheetSourceLine(),
      ),
      contactCard(),
      el(
        'div',
        { class: 'masthead-tools' },
        el('div', { class: 'tabs', role: 'group', 'aria-label': 'Degree program' }, tab('M.S. in CSE §3', 'mscse'), tab('Ph.D. §4', 'phd')),
        el(
          'div',
          {},
          el('button', { class: 'btn', 'data-key': 'tools.example', onclick: loadExample }, 'Load example'),
          el('button', { class: 'btn', 'data-key': 'tools.clear', onclick: clearAll }, 'Clear'),
        ),
      ),
    );
  }

  /** One slim strip instead of two stacked banners (usability review
   * 2026-09-05, item 8): the alpha line and the privacy line, each one
   * sentence or two, and a "Details" expander that holds the full DGS-worded
   * paragraphs unchanged (they also stay in the footer and the copied
   * summary). The privacy paragraph keeps its place right under the alpha
   * text (DGS placement, 2026-09-03). */
  function noticeStrip(): HTMLElement {
    const details = el(
      'details',
      { class: 'notice-details' },
      el('summary', {}, 'Details'),
      el(
        'p',
        { class: 'notice-full beta' },
        el('strong', {}, 'Alpha version under testing. '),
        BETA_NOTICE,
        ' ',
        el('strong', {}, RULES_ACCURACY_NOTICE),
        ' (See the ',
        el('a', { href: './courses.html' }, 'course rules page'),
        '.) ',
        BETA_SCOPE_NOTICE,
        ...reportToDgs(' Error reports, suggestions, and feedback are all welcome — please email'),
      ),
      el(
        'p',
        { class: 'notice-full privacy' },
        el('strong', {}, 'Private by design. '),
        'Everything you enter — and any transcript PDF you import — is processed and stored entirely locally, within your own browser; the optional text recognition (OCR) for scanned transcripts is also computed in your browser. Nothing is uploaded, transmitted, or stored anywhere else. The page’s only network request is the read-only fetch of the public course rules.',
      ),
    );
    return el(
      'div',
      { class: 'banner beta notice-strip', role: 'note' },
      el('p', { class: 'notice-line' }, el('strong', {}, 'Alpha — under testing. '), ALPHA_LINE, ' Feedback: ', mailto(DGS.email), '.'),
      el('p', { class: 'notice-line privacy-line' }, el('strong', {}, 'Private by design. '), PRIVACY_LINE),
      details,
    );
  }

  function snapshotBanner(): HTMLElement {
    const date = rules.syncedAt.slice(0, 10);
    return el(
      'div',
      { class: 'banner' },
      `You chose to continue with the copy of the rules saved on ${date} because the live spreadsheet could not be loaded — recent DGS edits may be missing. Reload the page to try the live spreadsheet again.`,
    );
  }

  // ---------- standing ----------

  function standingCard(): HTMLElement {
    // The entry term drives the §4.3 residency count and every deadline. When
    // the student sets it, the "inferred/assumed" flag clears and every Notre
    // Dame course is re-filed as program or prior coursework (2026-09-05).
    const setEntry = (mutate: (s: Student) => void) =>
      update((s) => {
        mutate(s);
        s.entryTermInferred = undefined;
        const moved = reclassifyNotreDameCourses(s);
        if (moved.toPrior + moved.toProgram > 0) {
          window.setTimeout(
            () =>
              toast(
                `${moved.toPrior + moved.toProgram} Notre Dame course${moved.toPrior + moved.toProgram === 1 ? ' was' : 's were'} re-filed for the new entry term` +
                  (moved.toPrior > 0 ? ` — ${moved.toPrior} now prior coursework (before ${termLabel(s.entryTerm)})` : '') +
                  (moved.toProgram > 0 ? ` — ${moved.toProgram} now program coursework` : '') +
                  '.',
              ),
            0,
          );
        }
      });
    const seasonSel = el('select', {
      'aria-label': 'Entered the program — semester',
      'data-key': 'standing.season',
      onchange: (e) => setEntry((s) => void (s.entryTerm.season = (e.target as HTMLSelectElement).value as Season)),
    });
    for (const se of SEASONS) seasonSel.append(option(se, se[0]!.toUpperCase() + se.slice(1), student.entryTerm.season === se));
    const yearInput = el('input', {
      type: 'number',
      min: '2000',
      max: '2040',
      'aria-label': 'Entered the program — year',
      'data-key': 'standing.year',
      value: String(student.entryTerm.year),
      onchange: (e) => setEntry((s) => void (s.entryTerm.year = Number((e.target as HTMLInputElement).value) || s.entryTerm.year)),
    });
    // While the term is a guess (fresh record) or a transcript reading, say so
    // — a wrong entry term silently shifts every deadline (bug report 2026-09-05).
    const inferred = student.entryTermInferred;
    const entryNote = inferred
      ? el(
          'p',
          { class: 'hint warn entry-note' },
          inferred.how === 'assumed'
            ? `${termLabel(student.entryTerm)} is assumed — set the semester you entered the program. `
            : `${termLabel(student.entryTerm)} was read from your transcript (${inferred.how}). Check it. `,
          'The residency count and every deadline — the 8-year limit (§4.3), the 18-month research qualifier (§4.4.3), the qualifier’s four semesters (§4.4), and the eighth-semester candidacy exam (§4.5) — are counted from this term.',
          inferred.alternative ? ` Note: ${inferred.alternative.why}.` : '',
        )
      : null;
    // Radio buttons rather than a dropdown (usability review 2026-09-05,
    // item 12): three choices, all visible, one tap on a phone.
    const priorGroup = radios(
      'standing.prior',
      [
        ['none', 'No prior graduate degree'],
        ['unfinished', 'Prior M.S., not completed'],
        ['completed', 'Completed prior M.S. or Ph.D.'],
      ],
      student.priorMs,
      (value) =>
        update((s) => {
          s.priorMs = value as Student['priorMs'];
          s.priorMsInferred = undefined; // the student chose — no longer inferred
        }),
    );
    // Reconcile the dropdown with the uploaded transcripts (2026-09-03): a
    // graduate transcript sets this automatically on import — "Completed" when
    // a degree-conferral line was found, otherwise "not completed" plus the
    // warning below, since the §5.2 caps depend on which it is (DGS
    // 2026-09-04). If the student somehow still has "none" alongside a
    // graduate transcript (older saved file, manual change), the original
    // contradiction warning shows instead.
    const priorTranscripts = DEGREE_SLOTS.filter(
      (sl) => sl.level !== 'bachelors' && student.courses.some((c) => c.origin === 'transfer' && c.degreeLevel === sl.level),
    );
    let priorNote: HTMLElement | null = null;
    if (student.priorMsInferred === true && student.priorMs === 'unfinished') {
      priorNote = el(
        'p',
        { class: 'hint warn' },
        'Set to “Prior M.S., not completed” because no degree-conferral line was found on your transcript — pick “Completed prior M.S. or Ph.D.” if you earned that degree (the §5.2 transfer caps depend on it).',
      );
    } else if (student.priorMs === 'none' && priorTranscripts.length > 0) {
      priorNote = el(
        'p',
        { class: 'hint warn' },
        `Your Transcripts card has a ${priorTranscripts.map((sl) => sl.label).join(' and a ')}, but this says “No prior graduate degree” — pick “Completed prior M.S. or Ph.D.” if you earned that degree, or “Prior M.S., not completed” if not (the §5.2 transfer caps depend on it).`,
      );
    }
    const card = el(
      'section',
      { class: 'card' },
      el('h2', {}, el('span', { class: 'step-no' }, '2. '), 'Your standing ', el('span', { class: 'chip-note' }, currentSemesterChip())),
      // A fieldset with a legend (item 5): the two controls share one question.
      fieldset('Entered the program', el('div', { class: 'pair' }, seasonSel, yearInput)),
      // What this field drives (item 11) — the longer note takes over while
      // the term is inferred or assumed.
      entryNote ?? el('p', { class: 'hint field-hint' }, 'Every deadline and the residency count are counted from this term.'),
      fieldset('Prior graduate study (§5.2 transfer caps)', priorGroup),
      priorNote,
    );

    if (student.program === 'mscse') {
      const optGroup = radios(
        'standing.msOption',
        [
          ['undecided', 'Undecided'],
          ['project', 'M.S. project (§3.4 i)'],
          ['thesis', 'M.S. thesis (§3.4 ii)'],
        ],
        student.msOption ?? 'undecided',
        (value) => update((s) => void (s.msOption = value as Student['msOption'])),
      );
      card.append(fieldset('Project or thesis option (§3.4)', optGroup));
    }

    card.append(fullTimeTerms());
    return card;
  }

  function currentSemesterChip(): string {
    const t = termOfDate(todayIso);
    return `${termLabel(t)}`;
  }

  function fullTimeTerms(): HTMLElement {
    // Residency (decision Q8): ≥9 entered credits marks a term full-time
    // automatically; these checkboxes cover research-heavy terms that aren't.
    // Only terms from the entry term on: residence is counted in THIS program
    // (2026-09-05 — the engine's residency.ts applies the same guard).
    const entryIndex = termIndex(student.entryTerm);
    const terms = new Map<number, Term>();
    for (const c of student.courses) if (c.origin === 'nd' && termIndex(c.term) >= entryIndex) terms.set(termIndex(c.term), c.term);
    for (const t of student.fullTimeTermOverrides ?? []) if (termIndex(t) >= entryIndex) terms.set(termIndex(t), t);
    if (terms.size === 0) return el('div', {});
    // A fieldset whose legend is the question (item 5); a term counted
    // automatically is stated as text, not as a disabled ticked box (item 11).
    const box = el('fieldset', { class: 'ft-terms' }, el('legend', { class: 'label' }, 'Full-time terms (for residency, §3.3/§4.3)'));
    const byTermCredits = new Map<number, number>();
    for (const c of student.courses) {
      if (c.origin !== 'nd' || termIndex(c.term) < entryIndex) continue;
      byTermCredits.set(termIndex(c.term), (byTermCredits.get(termIndex(c.term)) ?? 0) + c.credits);
    }
    for (const [key, t] of [...terms.entries()].sort((a, b) => a[0] - b[0])) {
      const auto = (byTermCredits.get(key) ?? 0) >= fullTimeFloor;
      const overridden = (student.fullTimeTermOverrides ?? []).some((o) => termIndex(o) === key);
      if (auto) {
        box.append(el('span', { class: 'ft-term ft-auto' }, el('span', { class: 'ft-check', 'aria-hidden': 'true' }, '✓'), ` ${termLabel(t)} — counted automatically (${fullTimeFloor}+ credits entered)`));
        continue;
      }
      const cb = el('input', {
        type: 'checkbox',
        'data-key': `standing.fullTime.${key}`,
        onchange: (e) => {
          const on = (e.target as HTMLInputElement).checked;
          update((s) => {
            const list = (s.fullTimeTermOverrides ?? []).filter((o) => termIndex(o) !== key);
            if (on) list.push(t);
            s.fullTimeTermOverrides = list;
          });
        },
      });
      cb.checked = overridden;
      box.append(el('label', { class: 'ft-term' }, cb, ` ${termLabel(t)}`));
    }
    return box;
  }

  // ---------- coursework ----------

  function coursesCard(courseLines: { courseId: string; term: Term; text: string; mark: CourseLine['mark'] }[]): HTMLElement {
    // The GPA lives here, next to the transcript import that prefills it
    // (moved from the standing card — DGS request, 2026-09-03).
    const gpaInput = el('input', {
      type: 'number',
      min: '0',
      max: '4',
      step: '0.01',
      'data-key': 'courses.gpa',
      value: student.gpa === undefined ? '' : String(student.gpa),
      onchange: (e) => {
        const v = (e.target as HTMLInputElement).value;
        update((s) => {
          s.gpa = v === '' ? undefined : Number(v);
          s.gpaSource = undefined; // typed by hand — no longer the transcript's figure
        });
      },
    });
    // Which figure the GPA is (combined-transcript bug report 2026-09-05): a
    // Notre Dame transcript carries one cumulative GPA per level, and the
    // graduate one can include an earlier graduate program at Notre Dame.
    const gs = student.gpaSource;
    const gpaNote =
      gs === undefined || student.gpa === undefined
        ? null
        : el(
            'p',
            { class: 'hint gpa-note' },
            gs.basis === 'transcript-graduate'
              ? `From your transcript's graduate-level cumulative GPA${gs.programGpa !== undefined ? ` (this program's courses alone average ${gs.programGpa.toFixed(2)})` : ''}${gs.undergraduateGpa !== undefined ? `; the undergraduate GPA (${gs.undergraduateGpa.toFixed(2)}) is not used` : ''}.`
              : `Computed from this program's graded courses only${gs.transcriptGpa !== undefined ? ` — your transcript's graduate-level cumulative GPA is ${gs.transcriptGpa.toFixed(2)}, which includes earlier graduate coursework at Notre Dame; the DGS decides which figure §2.2 uses` : ''}.`,
          );
    // Group the list by university + degree (2026-09-03): Notre Dame first,
    // then one section per (university, transcript) in first-seen order.
    const all = student.courses.map((c, index) => ({ c, index }));
    const nd = all.filter(({ c }) => c.origin === 'nd');
    const groups: { heading: string; bachelors: boolean; entries: { c: CourseEntry; index: number }[]; hidden: number }[] = [];
    for (const e of all.filter(({ c }) => c.origin === 'transfer')) {
      const slot = e.c.degreeLevel
        ? (DEGREE_SLOTS.find((sl) => sl.level === e.c.degreeLevel)?.label ?? e.c.degreeLevel)
        : 'graduate coursework (§5.2)';
      // Prior Notre Dame coursework (2026-09-05): an earlier Notre Dame degree
      // read from the same transcript — named for what it is.
      const priorNd = isNotreDameInstitution(e.c.institution);
      const heading = priorNd
        ? `Notre Dame, before entering the program — ${e.c.degreeLevel === 'bachelors' ? 'undergraduate' : 'graduate'} coursework`
        : `${e.c.institution ?? 'University not set'} — ${slot}`;
      let g = groups.find((x) => x.heading === heading);
      if (!g) {
        g = { heading, bachelors: e.c.degreeLevel === 'bachelors', entries: [], hidden: 0 };
        groups.push(g);
      }
      // Undergraduate courses (DGS request 2026-09-04): only the ones that can
      // matter are listed — a title suggesting a §4.4.1 core area, a course
      // the DGS has already ruled on, or (Notre Dame) a course the Courses tab
      // tags with a core area. The rest stay in the saved data but out of the
      // way (undergraduate credits never transfer, §5.2).
      if (
        g.bachelors &&
        !CORE_TITLE_RE.test(e.c.title ?? '') &&
        !findExternalRule(rules.external, e.c.institution ?? '', e.c.courseId) &&
        !(priorNd && resolveRuleRow(rules, e.c.courseId, e.c.term)?.coreArea)
      ) {
        g.hidden += 1;
        continue;
      }
      g.entries.push(e);
    }
    const card = el(
      'section',
      { class: 'card' },
      el('h2', {}, el('span', { class: 'step-no' }, '3. '), 'Coursework ', el('span', { class: 'chip-note' }, student.program === 'mscse' ? '§3.2' : '§4.2')),
      el(
        'p',
        { class: 'hint' },
        'Everything you have taken or are taking belongs here. Importing your transcripts above fills it in, non-CSE and other-university courses included; you can also add or fix courses by hand. Anything the course rules have not decided yet goes into the review request below.',
      ),
      field('Cumulative GPA (from your transcript, §2.2)', gpaInput),
      gpaNote,
      courseForm(),
      el('h3', { class: 'subhead', id: 'nd-courses' }, 'Notre Dame'),
      nd.length > 0
        ? courseTable(courseLines, nd)
        : el('p', { class: 'empty' }, 'No Notre Dame courses yet. Import your transcript above, or add one here.'),
      ...groups.flatMap((g) => [
        el('h3', { class: 'subhead' }, g.heading),
        g.bachelors
          ? el(
              'p',
              { class: 'hint' },
              `Undergraduate credits do not transfer (§5.2). Only courses relevant to the Algorithms, Operating Systems, and Computer Architecture core-knowledge areas (§4.4.1) are listed here${g.hidden > 0 ? ` — ${g.hidden} other course${g.hidden === 1 ? '' : 's'} from this transcript ${g.hidden === 1 ? 'is' : 'are'} not shown` : ''}.`,
            )
          : null,
        g.entries.length > 0
          ? courseTable(courseLines, g.entries)
          : el('p', { class: 'empty' }, 'No core-area-relevant courses on this transcript.'),
      ]),
    );
    return card;
  }

  // ---------- transcripts (one upload home, 2026-09-03) ----------

  // All four transcript imports in one card, FIRST on the page (2026-09-03):
  // the Notre Dame unofficial transcript (fills the coursework table and GPA
  // below) and the three prior-university slots from external-upload.ts. While
  // a preview is open, every import button is blocked until the student
  // confirms (or cancels) it — one transcript at a time.
  function transcriptsCard(): HTMLElement {
    const busy = transcriptPreview !== undefined || importsBusy();
    return el(
      'div',
      { class: 'card external-card' },
      el('h2', {}, el('span', { class: 'step-no' }, '1. '), 'Transcripts ', el('span', { class: 'chip-note' }, 'start here')),
      // Shorter sentences (usability review 2026-09-05, item 10): the same
      // facts, none over 25 words.
      el(
        'p',
        { class: 'hint' },
        'Start here: import your transcripts, and most of the page below fills itself in. ',
        el('strong', {}, 'System-generated PDFs are read exactly.'),
        ' A scanned or photographed transcript can be read with built-in text recognition (OCR) — English only — after you agree. Everything is read on your own computer and nothing is uploaded, and you check every field before it is added.',
      ),
      // Unofficial transcripts read best (DGS observation 2026-09-05): the web /
      // self-service PDF is single-column and carries no watermark; official
      // ones (two columns, security bands) are read too, less reliably.
      el(
        'p',
        { class: 'hint unofficial-note' },
        el('strong', {}, 'Prefer unofficial transcripts'),
        ' — the web (self-service) PDF from your university’s portal reads best: one column, no watermark. Official transcripts (two columns, security patterns, e-transcript covers) are read too; check their previews more carefully.',
      ),
      busy
        ? el('p', { class: 'hint warn' }, 'One transcript at a time: confirm the open preview below (“Add …”) or cancel it before importing another PDF.')
        : null,
      transcriptUpload(busy),
      transcriptPreview ? transcriptPreviewBlock() : null,
      ...priorTranscriptSection({ student, rules, update, toast, toastWithAction, render, blocked: busy }),
    );
  }

  // ---------- ask the DGS (ONE review request, 2026-09-03) ----------

  // Everything that still needs a DGS decision, in one card with one copy
  // button and one email: Notre Dame courses that are not in the rules sheet
  // (typical for non-CSE), dgs_approval and not yet approved, or blank-verdict
  // — plus external courses the ExternalCourses tab has not ruled on. The
  // student MUST email the request to the DGS and the Graduate Program
  // Administrator; the page itself sends nothing.
  function askDgsCard(): HTMLElement | null {
    const { classified } = classify(student, rules);
    const nd = classified.filter(
      (c) => !c.superseded && c.entry.origin === 'nd' && (c.unknown === true || c.approvalPending !== undefined),
    );
    const external = classified.filter((c) => {
      if (c.superseded || c.entry.origin !== 'transfer') return false;
      if (c.external !== undefined) {
        // Ruled: pending only while transferability is undecided (bachelors
        // never transfers, so nothing is pending there).
        return c.external.transferable === undefined && c.entry.degreeLevel !== 'bachelors' && c.ineligibleReason === undefined;
      }
      // Prior Notre Dame coursework whose Courses-tab row names a core area is
      // decided for §4.4.1 already (2026-09-05) — no ruling to ask for.
      const coreDecided = isNotreDameInstitution(c.entry.institution) && c.rule?.coreArea !== undefined;
      // Unreviewed undergraduate courses earn no transfer credit, but the DGS
      // keywords (2026-09-03) flag the ones whose TITLE suggests a §4.4.1 core
      // area — those are worth a ruling.
      if (c.entry.degreeLevel === 'bachelors') return !coreDecided && CORE_TITLE_RE.test(c.entry.title ?? '');
      // Unreviewed GRADUATE courses (2026-09-04): pending when transfer credit
      // is still possible (no hard §5.2 ineligibility) — and even when it is
      // not (outside the window, below the grade floor), a core-keyword title
      // still belongs in the request, because the course may satisfy §4.4.1
      // core knowledge, which has no such restrictions.
      return c.ineligibleReason === undefined || (!coreDecided && CORE_TITLE_RE.test(c.entry.title ?? ''));
    });
    const n = nd.length + external.length;
    if (n === 0) return null;
    // Prior Notre Dame coursework (2026-09-05) is asked about as NOTRE DAME
    // courses — a row for the Courses tab when it is not listed there (its
    // core_area then decides §4.4.1); the §5.2 transfer part stays a
    // per-student recommendation.
    const priorNd = external.filter((c) => isNotreDameInstitution(c.entry.institution));
    const others = external.filter((c) => !isNotreDameInstitution(c.entry.institution));
    const ndReq = [
      ...nd.map((c) => ({
        courseId: c.entry.courseId,
        title: c.entry.title ?? c.rule?.title,
        credits: c.entry.credits,
        grade: c.entry.grade,
        termText: termLabel(c.entry.term),
        reason: c.unknown === true ? 'not in the course rules yet' : (c.approvalPending ?? 'needs DGS review'),
        unlisted: c.unknown === true,
      })),
      ...priorNd.map((c) => ({
        courseId: c.entry.courseId,
        title: c.entry.title ?? c.rule?.title,
        credits: c.entry.credits,
        grade: c.entry.grade,
        termText: termLabel(c.entry.term),
        reason:
          `taken at Notre Dame before entering the program (${c.entry.degreeLevel === 'bachelors' ? 'undergraduate' : 'graduate'}) — ` +
          (c.rule === undefined
            ? 'not in the course rules yet; does it cover a §4.4.1 core area?'
            : 'transfer credit needs a DGS recommendation (§5.2)'),
        unlisted: c.rule === undefined,
      })),
    ];
    const extReq = others.map((c) => ({
      institution: c.entry.institution,
      courseId: c.entry.courseId,
      title: c.entry.title,
      credits: c.entry.credits,
      grade: c.entry.grade,
      termText: termLabel(c.entry.term),
      slotLabel: c.entry.degreeLevel ? (DEGREE_SLOTS.find((sl) => sl.level === c.entry.degreeLevel)?.label ?? c.entry.degreeLevel) : undefined,
      reason:
        c.external !== undefined
          ? 'transferability not yet decided'
          : c.entry.degreeLevel === 'bachelors'
            ? 'title suggests a §4.4.1 core area — not yet reviewed by the DGS'
            : c.ineligibleReason !== undefined
              ? 'no transfer credit, but the title suggests a §4.4.1 core area — not yet reviewed by the DGS'
              : 'not yet reviewed by the DGS',
      unlisted: c.external === undefined,
    }));
    const line = (courseId: string, where: string | undefined, reason: string) =>
      el('div', { class: 'review-line' }, el('span', { class: 'cid' }, courseId), `${where ? ` (${where})` : ''} — ${reason}`);
    return el(
      'div',
      { class: 'card dgs-review' },
      el('h2', {}, 'Ask the DGS to review ', el('span', { class: 'chip-note' }, `${n} course${n === 1 ? '' : 's'}`)),
      el(
        'p',
        { class: 'hint' },
        el('strong', {}, 'Decisions are made only by email: '),
        'copy the review request and send it to the DGS (',
        mailto(DGS.email),
        '). Attach your transcript PDFs (Bachelor’s / Master’s / Ph.D. — whichever apply) to the same email. It includes rows the DGS can paste straight into the rules sheet; the page itself sends nothing.',
      ),
      ...ndReq.map((r, i) => line(r.courseId, i < nd.length ? 'Notre Dame' : 'Notre Dame, before entry', r.reason)),
      ...others.map((c, i) => line(c.entry.courseId, c.entry.institution ?? 'other university', extReq[i]!.reason)),
      el(
        'div',
        { class: 'save-buttons' },
        el(
          'button',
          {
            class: 'btn',
            'data-key': 'review.copy',
            onclick: () => {
              import('../transcript/external.ts')
                .then(({ buildCombinedReviewRequest }) =>
                  copyReviewRequest(buildCombinedReviewRequest({ priorStudy: PRIOR_LABELS[student.priorMs], nd: ndReq, external: extReq })),
                )
                .then(() => toast('Review request copied — email it to the DGS and attach your transcript PDFs. (Nothing is sent by this page.)'))
                .catch(() => toast('Could not copy automatically — please email the DGS your course ids, credits, grades and terms.'));
            },
          },
          `Copy review request for ${n} course${n === 1 ? '' : 's'}`,
        ),
      ),
    );
  }

  // ---------- transcript upload ----------

  /** An import that failed (usability review 2026-09-05, item 6): shown as a
   * persistent message under the Notre Dame row — a 4-second toast was easy
   * to miss and impossible to re-read. Cleared by the next import or Dismiss. */
  let ndImportError: string | undefined;

  function transcriptUpload(blocked: boolean): HTMLElement {
    const fileInput = el('input', { type: 'file', accept: '.pdf,application/pdf', class: 'hidden', 'aria-label': 'Notre Dame unofficial transcript PDF' });
    const fail = (message: string): void => {
      transcriptPreview = undefined;
      ndImportError = message;
      focusAfterRender = 'import.nd.error';
      render();
    };
    fileInput.addEventListener('change', async () => {
      const file = (fileInput as HTMLInputElement).files?.[0];
      if (!file) return;
      ndImportError = undefined;
      toast('Reading the transcript… (it never leaves this browser)');
      try {
        const { pdfToLines } = await import('../transcript/pdf.ts'); // pdfjs loads lazily
        const lines = await pdfToLines(await file.arrayBuffer());
        // Kellogg's own instructions tell students to SCREENSHOT the page —
        // those PDFs have no text layer, and deserve a specific message,
        // not a false "this isn't ND" rejection.
        if (lines.join('').trim().length < 40) {
          fail('This PDF has no readable text (a screenshot?). Please use your browser’s "Print → Save as PDF" on the transcript page instead, or add courses manually.');
          return;
        }
        const parsed = parseTranscript(lines);
        if (!parsed.isNotreDame) {
          fail("Only Notre Dame's unofficial transcript is accepted here — for courses from other universities, use the Previous-Transcript rows below.");
          return;
        }
        if (parsed.courses.length === 0) {
          fail('This looks like a Notre Dame transcript, but no course lines could be read from it. Add your courses manually, and tell the DGS so the parser can be improved.');
          return;
        }
        const duplicate = parsed.courses.map((c) =>
          student.courses.some(
            (s) => s.courseId === c.courseId && termIndex(s.term) === termIndex(c.term),
          ),
        );
        // The entry term read from the transcript (2026-09-05) is applied
        // unless the student unticks it in the preview. Pre-entry Notre Dame
        // courses become prior coursework; pre-entry UNDERGRADUATE courses
        // that cannot matter (no core-area title, no ruling, no Courses-tab
        // core area) start unticked, like the external undergraduate import.
        const entry = parsed.entryTerm?.term ?? student.entryTerm;
        const irrelevantPrior = parsed.courses.map(
          (c) =>
            c.origin === 'nd' &&
            termIndex(c.term) < termIndex(entry) &&
            priorNdDegreeLevel({ courseId: c.courseId, registeredLevel: c.level }) === 'bachelors' &&
            !CORE_TITLE_RE.test(c.title ?? '') &&
            !resolveRuleRow(rules, c.courseId, c.term)?.coreArea &&
            !findExternalRule(rules.external, 'University of Notre Dame', c.courseId),
        );
        // The GPA (combined-transcript bug report 2026-09-05): the transcript's
        // GRADUATE-level cumulative figure, never the undergraduate one; and
        // when graduate courses from an EARLIER program at Notre Dame precede
        // the entry term, that figure includes them, so the courses of this
        // program alone are averaged too and the student chooses (the
        // transcript's figure is the default — it is what the registrar and
        // the Graduate School compute; docs/DECISIONS.md 2026-09-05).
        const programGpa = gpaOfProgramCourses(parsed.courses, entry);
        const earlierGraduateWork = parsed.courses.some(
          (c) => c.origin === 'nd' && termIndex(c.term) < termIndex(entry) && c.level === 'graduate' && GRADE_POINTS[c.grade] !== undefined,
        );
        transcriptPreview = {
          courses: parsed.courses,
          selected: parsed.courses.map((_, i) => !duplicate[i] && !irrelevantPrior[i]),
          duplicate,
          gpa: parsed.cumulativeGpa,
          undergraduateGpa: parsed.cumulativeGpaByLevel?.undergraduate,
          programGpa: earlierGraduateWork ? programGpa : undefined,
          gpaChoice: parsed.cumulativeGpa !== undefined ? 'transcript' : earlierGraduateWork && programGpa !== undefined ? 'program' : 'none',
          entryTerm: parsed.entryTerm,
          useEntryTerm: parsed.entryTerm !== undefined,
          degreesAwarded: parsed.degreesAwarded,
          warnings: parsed.warnings,
        };
        render();
      } catch {
        fail('That PDF could not be read (a scanned image, or not a PDF?). Add your courses manually.');
      } finally {
        (fileInput as HTMLInputElement).value = '';
      }
    });
    const errorBox = ndImportError
      ? el(
          'div',
          { class: 'import-error', role: 'alert', tabindex: '-1', 'data-key': 'import.nd.error' },
          el('span', {}, ndImportError),
          ' ',
          el(
            'button',
            {
              class: 'btn tiny',
              'aria-label': 'Dismiss this message',
              onclick: () => {
                ndImportError = undefined;
                focusAfterRender = 'import.nd';
                render();
              },
            },
            'Dismiss',
          ),
        )
      : null;
    return el(
      'div',
      { class: 'transcript-upload external-slot' },
      el('span', { class: 'slot-label' }, 'Notre Dame Unofficial Transcript'),
      el('span', { class: 'slot-sep', 'aria-hidden': 'true' }, ' — '),
      el('button', { class: 'btn tiny', disabled: blocked, 'data-key': 'import.nd', onclick: () => (fileInput as HTMLInputElement).click() }, 'Import from PDF (alpha)'),
      el('span', { class: 'hint-inline' }, ' — the system-generated PDF from insideND; fills the coursework table and GPA below. Parsed courses are shown for your confirmation before anything is added.'),
      fileInput,
      errorBox,
    );
  }

  /** Credit-weighted GPA of the graded Notre Dame courses from the entry term
   * on — this program's courses only (letter grades; S/U and in-progress rows
   * carry no points). Undefined when nothing is graded yet. */
  function gpaOfProgramCourses(courses: ParsedCourse[], entry: Term): number | undefined {
    let points = 0;
    let hours = 0;
    for (const c of courses) {
      if (c.origin !== 'nd' || termIndex(c.term) < termIndex(entry) || c.level === 'undergraduate') continue;
      const p = GRADE_POINTS[c.grade];
      if (p === undefined || c.credits <= 0) continue;
      points += p * c.credits;
      hours += c.credits;
    }
    return hours > 0 ? Math.round((points / hours) * 1000) / 1000 : undefined;
  }

  function transcriptPreviewBlock(): HTMLElement {
    const tp = transcriptPreview!;
    const box = el('div', { class: 'transcript-preview' });
    // The entry term the split below is judged against: the transcript's
    // reading while its checkbox is ticked, otherwise the standing card's.
    const entry = tp.useEntryTerm && tp.entryTerm ? tp.entryTerm.term : student.entryTerm;
    const priorCount = tp.courses.filter((c) => c.origin === 'nd' && termIndex(c.term) < termIndex(entry)).length;
    box.append(
      el('h3', {}, `Found ${tp.courses.length} course${tp.courses.length === 1 ? '' : 's'} — untick anything that shouldn't count, then add`),
    );
    if (tp.warnings.length > 0) {
      // What the parser skipped or could not place — persistent, inside the
      // preview (usability review 2026-09-05, item 6).
      box.append(
        el(
          'div',
          { class: 'import-warnings', role: 'note' },
          el('strong', {}, 'Check these: '),
          el('ul', {}, ...tp.warnings.map((w) => el('li', {}, w))),
        ),
      );
    }
    if (tp.entryTerm) {
      // The transcript's reading of the entry term (2026-09-05) — applied by
      // default, because every deadline depends on it; explained, because a
      // combined transcript can support two readings.
      const cb = el('input', {
        type: 'checkbox',
        class: 'use-entry-term',
        'data-key': 'preview.entryTerm',
        onchange: (e) => {
          tp.useEntryTerm = (e.target as HTMLInputElement).checked;
          render();
        },
      });
      cb.checked = tp.useEntryTerm;
      box.append(
        el(
          'label',
          { class: 'attest entry-term-line' },
          cb,
          ` Set “Entered the program” to ${termLabel(tp.entryTerm.term)} — ${tp.entryTerm.how}. The residency count and every deadline are counted from this term; check it.`,
        ),
      );
      if (tp.entryTerm.alternative) box.append(el('p', { class: 'hint warn' }, `Note: ${tp.entryTerm.alternative.why}.`));
    }
    if (priorCount > 0) {
      box.append(
        el(
          'p',
          { class: 'hint prior-note' },
          `${priorCount} course${priorCount === 1 ? '' : 's'} dated before ${termLabel(entry)} will be filed as coursework from before you entered the program: no residency, credit or specialization counts, but a core-knowledge course still counts (§4.4.1), and graduate courses may transfer under §5.2. Undergraduate courses that cannot matter start unticked.`,
        ),
      );
    }
    const table = el('table', { class: 'courses stack' });
    table.append(
      el(
        'tr',
        {},
        el('th', { scope: 'col' }, el('span', { class: 'visually-hidden' }, 'Add')),
        el('th', { scope: 'col' }, 'Course'),
        el('th', { scope: 'col' }, 'Term'),
        el('th', { scope: 'col', abbr: 'Credits' }, 'Cr'),
        el('th', { scope: 'col' }, 'Grade'),
        el('th', { scope: 'col' }, el('span', { class: 'visually-hidden' }, 'Note')),
      ),
    );
    tp.courses.forEach((c, i) => {
      const cb = el('input', {
        type: 'checkbox',
        'aria-label': `Add ${c.courseId} (${termLabel(c.term)})`,
        'data-key': `preview.row.${i}`,
        onchange: (e) => {
          tp.selected[i] = (e.target as HTMLInputElement).checked;
          render(); // the Add button's count follows (item 13)
        },
      });
      cb.checked = tp.selected[i]!;
      const prior = c.origin === 'nd' && termIndex(c.term) < termIndex(entry);
      const note = tp.duplicate[i]
        ? 'already entered'
        : c.origin === 'transfer'
          ? 'transfer'
          : prior
            ? `before entry — prior ${priorNdDegreeLevel({ courseId: c.courseId, registeredLevel: c.level }) === 'bachelors' ? 'undergraduate' : 'graduate'} coursework`
            : '';
      table.append(
        el(
          'tr',
          { class: prior ? 'prior-row' : '' },
          el('td', { class: 'cell-check' }, cb),
          el('td', { class: 'cell-course' }, el('div', { class: 'cid' }, c.courseId), el('div', { class: 'ctitle' }, c.title ?? '')),
          el('td', { class: 'cell-meta', 'data-label': 'Term' }, termLabel(c.term)),
          el('td', { class: 'cell-meta', 'data-label': 'Credits' }, String(c.credits)),
          el('td', { class: 'cell-meta', 'data-label': 'Grade' }, c.grade === 'IP' ? 'In progress' : c.grade),
          el('td', { class: 'ctitle cell-note' }, note),
        ),
      );
    });
    // Select all / none (item 13) — the duplicates stay unticked either way.
    const selectAll = (on: boolean) => {
      tp.courses.forEach((_, i) => (tp.selected[i] = on && !tp.duplicate[i]));
      render();
    };
    box.append(
      el(
        'p',
        { class: 'select-links' },
        el('button', { class: 'btn tiny', 'data-key': 'preview.all', onclick: () => selectAll(true) }, 'Select all'),
        ' ',
        el('button', { class: 'btn tiny', 'data-key': 'preview.none', onclick: () => selectAll(false) }, 'Select none'),
      ),
      table,
    );
    // The GPA for the §2.2 check (combined-transcript bug report 2026-09-05).
    if (tp.gpa !== undefined && tp.programGpa !== undefined) {
      // Two defensible figures: the registrar's graduate cumulative GPA (which
      // folds in an earlier graduate program at Notre Dame) or this program's
      // courses alone — the student picks, the transcript's figure by default.
      const radio = (value: typeof tp.gpaChoice, label: string, note: string) => {
        const r = el('input', { type: 'radio', name: 'gpa-choice', value, 'data-key': `preview.gpa.${value}`, onchange: () => (tp.gpaChoice = value) });
        r.checked = tp.gpaChoice === value;
        return el('label', { class: 'attest gpa-option' }, r, ` ${label} `, el('span', { class: 'hint-inline' }, note));
      };
      box.append(
        el(
          'fieldset',
          { class: 'gpa-choice group' },
          el('legend', { class: 'label' }, 'Cumulative GPA for the §2.2 check'),
          el(
            'p',
            { class: 'hint' },
            `Your transcript's graduate-level cumulative GPA includes graduate courses taken at Notre Dame before ${termLabel(entry)} (an earlier program). The handbook's "cumulative GPA" is the registrar's figure; if the two straddle 3.0, ask the DGS which applies.${tp.undergraduateGpa !== undefined ? ` The undergraduate GPA (${tp.undergraduateGpa.toFixed(2)}) is not used.` : ''}`,
          ),
          radio('transcript', `Use the transcript's graduate cumulative GPA (${tp.gpa.toFixed(2)})`, '— as the registrar computes it, all graduate coursework at Notre Dame'),
          radio('program', `Use this program's courses only (${tp.programGpa.toFixed(2)})`, `— computed from the graded rows from ${termLabel(entry)} on`),
          radio('none', 'Leave the GPA field as it is', ''),
        ),
      );
    } else if (tp.gpa !== undefined) {
      const cb = el('input', { type: 'checkbox', 'data-key': 'preview.gpa', onchange: (e) => (tp.gpaChoice = (e.target as HTMLInputElement).checked ? 'transcript' : 'none') });
      cb.checked = tp.gpaChoice === 'transcript';
      box.append(
        el(
          'label',
          { class: 'attest' },
          cb,
          ` Use the transcript's ${tp.undergraduateGpa !== undefined ? 'graduate-level ' : ''}cumulative GPA (${tp.gpa.toFixed(2)}) for the §2.2 check${tp.undergraduateGpa !== undefined ? ` — the undergraduate GPA (${tp.undergraduateGpa.toFixed(2)}) is not used` : ''}`,
        ),
      );
    } else if (tp.undergraduateGpa !== undefined) {
      box.append(
        el(
          'p',
          { class: 'hint warn' },
          `No graduate-level cumulative GPA was found on this transcript yet — the undergraduate GPA (${tp.undergraduateGpa.toFixed(2)}) does not apply to §2.2. Enter your graduate GPA under Coursework once your first grades post.`,
        ),
      );
    }
    box.append(
      el(
        'div',
        { class: 'save-buttons' },
        el(
          'button',
          {
            class: 'btn primary',
            'data-key': 'preview.add',
            onclick: () => {
              const picked = tp.courses.filter((_, i) => tp.selected[i]);
              let priorAdded = 0;
              let priorSet: Student['priorMs'] | undefined;
              update((s) => {
                if (tp.useEntryTerm && tp.entryTerm) {
                  s.entryTerm = { ...tp.entryTerm.term };
                  s.entryTermInferred = { how: tp.entryTerm.how, alternative: tp.entryTerm.alternative };
                }
                for (const c of picked) {
                  const entryCourse: CourseEntry = {
                    courseId: c.courseId,
                    title: c.title,
                    credits: c.credits,
                    term: c.term,
                    grade: c.grade,
                    origin: c.origin,
                    institution: c.institution,
                    registeredLevel: c.origin === 'nd' ? c.level : undefined,
                  };
                  s.courses.push(entryCourse);
                }
                // Pre-entry Notre Dame courses → prior coursework (2026-09-05).
                priorAdded = reclassifyNotreDameCourses(s).toPrior;
                // Prior GRADUATE coursework at Notre Dame sets "Prior graduate
                // study" the way an uploaded Master's transcript does
                // (2026-09-03 rule): completed when the transcript shows a
                // graduate degree awarded, else "not completed" + the warning.
                if (
                  s.priorMs === 'none' &&
                  s.courses.some((c) => isPriorNd(c, s.entryTerm) && c.degreeLevel === 'masters')
                ) {
                  const conferred = tp.degreesAwarded.some((d) => d.level === 'masters' || d.level === 'phd');
                  s.priorMs = conferred ? 'completed' : 'unfinished';
                  s.priorMsInferred = true;
                  priorSet = s.priorMs;
                }
                if (tp.gpaChoice === 'transcript' && tp.gpa !== undefined) {
                  s.gpa = tp.gpa;
                  s.gpaSource = { basis: 'transcript-graduate', programGpa: tp.programGpa, undergraduateGpa: tp.undergraduateGpa };
                } else if (tp.gpaChoice === 'program' && tp.programGpa !== undefined) {
                  s.gpa = tp.programGpa;
                  s.gpaSource = { basis: 'program-only', transcriptGpa: tp.gpa, undergraduateGpa: tp.undergraduateGpa };
                }
              });
              const appliedEntry = tp.useEntryTerm && tp.entryTerm ? tp.entryTerm.term : undefined;
              transcriptPreview = undefined;
              focusAfterRender = 'import.nd';
              render();
              toast(
                `Added ${picked.length} course${picked.length === 1 ? '' : 's'} from the transcript` +
                  (appliedEntry ? `; “Entered the program” set to ${termLabel(appliedEntry)} — check it under Your standing` : '') +
                  (priorAdded > 0 ? `; ${priorAdded} filed as coursework from before you entered the program` : '') +
                  (priorSet === 'completed'
                    ? '; Prior graduate study set to “Completed prior M.S. or Ph.D.” from the degree awarded on your transcript'
                    : priorSet === 'unfinished'
                      ? '; Prior graduate study set to “Prior M.S., not completed” — no graduate degree award was found on your transcript; change it under Your standing if you did earn it'
                      : '') +
                  '.',
              );
            },
          },
          `Add ${tp.selected.filter(Boolean).length} selected course${tp.selected.filter(Boolean).length === 1 ? '' : 's'}`,
        ),
        el('button', { class: 'btn', 'data-key': 'preview.cancel', onclick: () => { transcriptPreview = undefined; focusAfterRender = 'import.nd'; render(); } }, 'Cancel'),
      ),
    );
    return box;
  }

  function courseForm(): HTMLElement {
    const datalist = el('datalist', { id: 'known-courses' });
    for (const [id, rows] of rules.courses) {
      const row = rows[rows.length - 1]!;
      if (!row.active) continue;
      const opt = el('option', { value: id });
      opt.label = `${id} — ${row.title}`;
      datalist.append(opt);
    }

    // Visible labels instead of placeholders (usability review 2026-09-05,
    // item 5): a placeholder vanishes as soon as the student types.
    const idInput = el('input', { list: 'known-courses', class: 'course-id', id: 'new-course-id', 'data-key': 'course.new.id', 'aria-describedby': 'new-course-id-hint' });
    const idError = el('p', { class: 'field-error hidden', id: 'new-course-id-error', role: 'alert' });
    const titleInput = el('input', { class: 'course-title', 'data-key': 'course.new.title' });
    const creditsInput = el('input', { type: 'number', min: '0', max: '15', step: '0.5', value: '3', 'data-key': 'course.new.credits' });
    const seasonSel = el('select', { 'aria-label': 'Term — semester', 'data-key': 'course.new.season' });
    for (const se of SEASONS) seasonSel.append(option(se, se[0]!.toUpperCase() + se.slice(1)));
    const yearInput = el('input', { type: 'number', min: '2000', max: '2040', 'aria-label': 'Term — year', 'data-key': 'course.new.year', value: String(new Date().getFullYear()) });
    const gradeSel = el('select', { 'data-key': 'course.new.grade' });
    for (const g of GRADES) gradeSel.append(option(g, g === 'IP' ? 'In progress' : g, g === 'IP'));
    const originSel = el('select', { 'data-key': 'course.new.origin' });
    originSel.append(option('nd', 'Taken at Notre Dame', true), option('transfer', 'From another university'));
    const institutionInput = el('input', { 'data-key': 'course.new.institution' });
    // (The per-course core-area claim dropdown was retired 2026-09-03 —
    // the DGS's ExternalCourses rulings are the only §4.4.1 external path.)
    // Degree level for a course from another university (2026-09-03): an
    // UNDERGRADUATE course is still worth adding — it earns no transfer
    // credit (§5.2) but can satisfy §4.4.1 core knowledge once the DGS
    // confirms it in the external-course rules.
    const levelSel = el('select', { 'data-key': 'course.new.level' });
    levelSel.append(option('', 'Graduate coursework (§5.2 transfer)', true));
    levelSel.append(option('bachelors', 'Undergraduate — core knowledge only, no transfer credit'));
    levelSel.append(option('masters', 'From a previous Master’s'));
    levelSel.append(option('phd', 'From a previous Ph.D.'));
    const groupSel = el('select', { 'data-key': 'course.new.group' });
    groupSel.append(option('', 'Assign a specialization group…'));
    for (const g of rules.categoryGroups) groupSel.append(option(g.code, `Count as: ${g.name}`));
    // The optional controls are shown/hidden with their labels.
    const institutionField = labelWrap('University', institutionInput);
    const levelField = labelWrap('Level', levelSel);
    const groupField = labelWrap('Specialization group (§4.4.2)', groupSel);
    institutionField.classList.add('hidden');
    levelField.classList.add('hidden');
    groupField.classList.add('hidden');

    originSel.addEventListener('change', () => {
      const transfer = (originSel as HTMLSelectElement).value === 'transfer';
      institutionField.classList.toggle('hidden', !transfer);
      levelField.classList.toggle('hidden', !transfer);
    });

    const clearIdError = () => {
      idError.classList.add('hidden');
      idError.textContent = '';
      idInput.removeAttribute('aria-invalid');
      idInput.setAttribute('aria-describedby', 'new-course-id-hint');
    };
    idInput.addEventListener('input', clearIdError);
    idInput.addEventListener('change', () => {
      const id = idInput.value.toUpperCase().replace(/\s+/g, ' ').trim();
      idInput.value = id;
      const term: Term = { season: (seasonSel as HTMLSelectElement).value as Season, year: Number(yearInput.value) };
      const rule = resolveRuleRow(rules, id, term);
      if (rule) {
        titleInput.value = rule.title;
        creditsInput.value = String(rule.creditsDefault ?? rule.creditMin ?? 3);
        const isAny = rule.categoryGroup === 'any';
        groupField.classList.toggle('hidden', !(isAny && student.program === 'phd'));
        if (isAny && student.program === 'phd') {
          toast(`${id} is listed under every specialization group (§4.4.2) — pick whichever group you still need.`);
        }
      } else {
        groupField.classList.add('hidden');
      }
    });

    const add = () => {
      const id = idInput.value.toUpperCase().replace(/\s+/g, ' ').trim();
      if (!id) {
        // A persistent error next to the field, not a vanishing toast (item 6).
        idError.textContent = 'Enter a course number, such as CSE 60641.';
        idError.classList.remove('hidden');
        idInput.setAttribute('aria-invalid', 'true');
        idInput.setAttribute('aria-describedby', 'new-course-id-error new-course-id-hint');
        idInput.focus();
        return;
      }
      const entry: CourseEntry = {
        courseId: id,
        title: titleInput.value || undefined,
        credits: Number(creditsInput.value) || 0,
        term: { season: (seasonSel as HTMLSelectElement).value as Season, year: Number(yearInput.value) || 2026 },
        grade: (gradeSel as HTMLSelectElement).value as CourseEntry['grade'],
        origin: (originSel as HTMLSelectElement).value as CourseEntry['origin'],
      };
      if (entry.origin === 'transfer') {
        if (institutionInput.value) entry.institution = institutionInput.value;
        const level = (levelSel as HTMLSelectElement).value;
        if (level) entry.degreeLevel = level as CourseEntry['degreeLevel'];
      }
      const group = (groupSel as HTMLSelectElement).value;
      if (group && !groupField.classList.contains('hidden')) entry.assignedGroup = group as CourseEntry['assignedGroup'];
      focusAfterRender = 'course.new.id'; // ready for the next course
      update((s) => void s.courses.push(entry));
    };

    return el(
      'div',
      { class: 'course-form' },
      datalist,
      el(
        'div',
        { class: 'row1' },
        el(
          'div',
          { class: 'field inline' },
          el('label', { class: 'label', for: 'new-course-id' }, 'Course number ', el('span', { class: 'label-hint', id: 'new-course-id-hint' }, '(e.g. CSE 60641)')),
          idInput,
          idError,
        ),
        labelWrap('Title', titleInput, '(filled automatically for listed courses)'),
      ),
      el(
        'div',
        { class: 'row2' },
        labelWrap('Credits', creditsInput),
        fieldset('Term', el('div', { class: 'pair' }, seasonSel, yearInput), 'inline'),
        labelWrap('Grade', gradeSel),
        labelWrap('Where', originSel),
      ),
      el('div', { class: 'row3' }, institutionField, levelField, groupField, el('button', { class: 'btn primary', 'data-key': 'course.new.add', onclick: add }, 'Add course')),
    );
  }

  // One table per (university, degree) group (2026-09-03) — the group heading
  // above each table carries the university and transcript, so the rows stay
  // uniform. The original index is kept so the delete/assign controls edit
  // the right entry.
  function courseTable(courseLines: { courseId: string; term: Term; text: string; mark: CourseLine['mark'] }[], entries: { c: CourseEntry; index: number }[]): HTMLElement {
    const table = el('table', { class: 'courses stack' });
    table.append(
      el(
        'tr',
        {},
        el('th', { scope: 'col' }, 'Course'),
        el('th', { scope: 'col' }, 'Term'),
        el('th', { scope: 'col', abbr: 'Credits' }, 'Cr'),
        el('th', { scope: 'col' }, 'Grade'),
        el('th', { scope: 'col' }, 'Counts toward'),
        el('th', { scope: 'col' }, el('span', { class: 'visually-hidden' }, 'Remove')),
      ),
    );
    // Consume lines as they are matched so two entries of the same course in
    // the same term each get their own line (e.g. a duplicate-entry pair).
    const linePool = [...courseLines];
    entries.forEach(({ c, index }) => {
      const li = linePool.findIndex((l) => l.courseId === c.courseId && termIndex(l.term) === termIndex(c.term));
      const line = li >= 0 ? linePool.splice(li, 1)[0] : undefined;
      const rule = resolveRuleRow(rules, c.courseId, c.term);
      const nameCell = el(
        'td',
        { class: 'cell-course' },
        el('div', { class: 'cid' }, c.courseId),
        el('div', { class: 'ctitle' }, c.title ?? rule?.title ?? ''),
      );
      if (rule?.notes) nameCell.title = rule.notes;
      // The line's colour (DGS request 2026-09-06): green = earns credit or a
      // core area now, amber = in progress or counted only until an approval,
      // red = earns nothing. A shape per colour, and a spoken word, so the
      // meaning does not rest on colour alone (WCAG 1.4.1).
      const countsCell = el('td', { class: 'counts cell-note' }, ...(line ? [statusMark(line.mark), line.text] : []));
      if (rule?.categoryGroup === 'any' && student.program === 'phd') {
        const sel = el('select', {
          'aria-label': `Specialization group for ${c.courseId}`,
          'data-key': `course.${index}.group`,
          onchange: (e) =>
            update((s) => {
              const v = (e.target as HTMLSelectElement).value;
              s.courses[index]!.assignedGroup = (v || undefined) as CourseEntry['assignedGroup'];
            }),
        });
        sel.append(option('', 'Assign group…', !c.assignedGroup));
        for (const g of GROUP_CODES) {
          sel.append(option(g, rules.categoryGroups.find((x) => x.code === g)?.name ?? g, c.assignedGroup === g));
        }
        countsCell.append(el('div', {}, sel));
      }
      // Strike through only courses that count NOTHING — a course partly over
      // a cap still counts its allowed credits.
      const countsNothing = line?.mark === 'excluded';
      // Remove: a named button, and an Undo instead of a confirm dialog
      // (usability review 2026-09-05, item 25) — the row comes back in place.
      const removeButton = el(
        'button',
        {
          class: 'btn tiny remove',
          'aria-label': `Remove ${c.courseId} (${termLabel(c.term)})`,
          title: `Remove ${c.courseId}`,
          'data-key': `course.${index}.remove`,
          onclick: () => {
            const removed = c;
            // Focus moves to the row that takes this one's place (the next
            // course slides into this index), else the previous row, else the form.
            const last = index === student.courses.length - 1;
            focusAfterRender = last ? (index > 0 ? `course.${index - 1}.remove` : 'course.new.id') : `course.${index}.remove`;
            update((s) => void s.courses.splice(index, 1));
            toastWithAction(`${removed.courseId} removed.`, 'Undo', () => {
              focusAfterRender = `course.${index}.remove`;
              update((s) => void s.courses.splice(Math.min(index, s.courses.length), 0, removed));
            });
          },
        },
        '✕',
      );
      const row = el(
        'tr',
        { class: countsNothing ? 'dropped' : '' },
        nameCell,
        el('td', { class: 'cell-meta', 'data-label': 'Term' }, termLabel(c.term)),
        el('td', { class: 'cell-meta', 'data-label': 'Credits' }, String(c.credits)),
        el('td', { class: 'cell-meta', 'data-label': 'Grade' }, c.grade === 'IP' ? 'In progress' : c.grade),
        countsCell,
        el('td', { class: 'cell-remove' }, removeButton),
      );
      table.append(row);
    });
    // The table scrolls inside its card on narrow screens instead of widening
    // the whole column (usability review 2026-09-05, item 1); the wrapper is
    // focusable so a keyboard user can scroll it (WCAG 2.1.1).
    return el('div', { class: 'table-scroll plain', tabindex: '0', role: 'region', 'aria-label': `${entries[0]?.c.institution ?? 'Notre Dame'} course table (scrolls sideways on narrow screens)` }, table);
  }

  // ---------- milestones + attestations ----------

  function milestonesCard(): HTMLElement {
    const m = student.milestones;
    const a = student.attestations;
    const card = el(
      'section',
      { class: 'card' },
      el('h2', {}, el('span', { class: 'step-no' }, '4. '), 'Milestones ', el('span', { class: 'chip-note' }, student.program === 'mscse' ? '§2.3, §3.4' : '§2.3, §4.4–4.7')),
      el('p', { class: 'hint' }, 'Enter each date once it has happened; leave the rest blank — every date here is optional.'),
    );

    card.append(
      field(
        'Advisor name (§2.3)',
        el('input', {
          value: m.advisorName ?? '',
          'data-key': 'milestone.advisorName',
          onchange: (e) => update((s) => void (s.milestones.advisorName = (e.target as HTMLInputElement).value || undefined)),
        }),
      ),
      dateField('Advisor identified on (§2.3)', 'advisorIdentified'),
    );

    if (student.program === 'mscse') {
      const opt = student.msOption ?? 'undecided';
      if (opt !== 'project') {
        card.append(
          dateField('Thesis approved by both readers (§3.4)', 'thesisApprovedByReaders'),
          dateField('Thesis defense passed (§3.4)', 'thesisDefensePassed'),
        );
      }
      if (opt !== 'thesis') {
        card.append(dateField('Project report accepted by advisor (§3.4)', 'projectReportAccepted'));
      }
    } else {
      card.append(
        dateField('Research qualifier passed — advisor filed the form (§4.4.3)', 'researchQualifierPassed'),
        dateField('Qualifier completion form filed with the DGS office (§4.4)', 'qualifierFormFiled'),
        dateField('Candidacy exam passed (§4.5)', 'candidacyPassed'),
        dateField('Dissertation approved for defense by all readers (§4.6)', 'dissertationApprovedForDefense'),
        dateField('Dissertation defense passed (§4.7)', 'defensePassed'),
      );
    }

    card.append(el('h2', { class: 'mt' }, 'Approvals you already have'));
    card.append(
      el('p', { class: 'hint' }, 'Tick only what has actually been approved — this is a self-check, and the DGS office holds the real record.'),
      attestation('My advisor approved my plan of study (§3.2/§4.2)', a.advisorApprovedPlan, (v, s) => (s.attestations.advisorApprovedPlan = v)),
      attestation('The DGS approved my 40000-level course(s) (§3.2/§4.2)', a.dgsApproved4xxxx, (v, s) => (s.attestations.dgsApproved4xxxx = v)),
      attestation('The DGS approved my non-CSE course(s) (§3.2/§4.2)', a.dgsApprovedNonCse, (v, s) => (s.attestations.dgsApprovedNonCse = v)),
      attestation('My transfer credit was approved by the DGS and the Graduate School (§5.2)', a.transferApproved, (v, s) => (s.attestations.transferApproved = v)),
    );
    if (student.program === 'phd') {
      card.append(
        attestation('The DGS extended my qualifier deadline (§4.4)', a.qualifierExtensionGranted, (v, s) => (s.attestations.qualifierExtensionGranted = v)),
      );
      // (The per-area "previously passed elsewhere" checkboxes were retired
      // 2026-09-03 — a core area from a previous institution now counts only
      // via the DGS's ExternalCourses ruling, fed by the Transcripts card.
      // Old saved files with the attestation still load; it is ignored.)
    }
    return card;
  }

  function attestation(label: string, checked: boolean | undefined, set: (v: boolean, s: Student) => void): HTMLElement {
    const cb = el('input', {
      type: 'checkbox',
      'data-key': `attest.${label.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`,
      onchange: (e) => update((s) => set((e.target as HTMLInputElement).checked, s)),
    });
    cb.checked = checked === true;
    return el('label', { class: 'attest' }, cb, ` ${label}`);
  }

  function dateField(label: string, key: keyof Student['milestones']): HTMLElement {
    const value = (student.milestones[key] as string | undefined) ?? '';
    return field(
      label,
      el('input', {
        type: 'date',
        value,
        'data-key': `milestone.${key}`,
        onchange: (e) =>
          update((s) => void ((s.milestones as Record<string, string | undefined>)[key] = (e.target as HTMLInputElement).value || undefined)),
      }),
    );
  }

  // ---------- save / load ----------

  function saveCard(report: ReturnType<typeof audit>): HTMLElement {
    const fileInput = el('input', { type: 'file', accept: '.json,application/json', class: 'hidden', 'aria-label': 'Saved progress file' });
    fileInput.addEventListener('change', async () => {
      const file = (fileInput as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const imported = await importFile(file);
        const previous = student;
        student = imported;
        try {
          render(); // render BEFORE persisting, so a file that crashes rendering is never saved
        } catch (renderErr) {
          student = previous;
          render();
          throw renderErr;
        }
        saveLocal(student);
        toast('Progress loaded.');
      } catch (err) {
        toast(err instanceof Error ? err.message : 'That file could not be read.');
      }
    });
    return el(
      'section',
      { class: 'card save-card' },
      el('h2', {}, 'Your data stays in this browser'),
      el(
        'p',
        { class: 'hint' },
        'Everything you enter — including any transcript PDF you upload — is processed and saved in this browser only, and never sent anywhere. To keep a copy or move to another device, save it as a file.',
      ),
      el(
        'div',
        { class: 'save-buttons' },
        el('button', { class: 'btn primary', 'data-key': 'save.file', onclick: () => exportFile(student) }, 'Save to a file'),
        el('button', { class: 'btn', 'data-key': 'save.load', onclick: () => (fileInput as HTMLInputElement).click() }, 'Load a file'),
        el(
          'button',
          {
            class: 'btn',
            'data-key': 'save.copy',
            onclick: () => {
              copyReviewRequest(
                advisorSummary(report, {
                  todayIso,
                  entryTerm: termLabel(student.entryTerm),
                  priorStudy: PRIOR_LABELS[student.priorMs],
                  gpa: student.gpa,
                }),
              )
                .then(() => toast('Summary copied — paste it into an email to your advisor.'))
                .catch(() => toast('Could not copy — your browser blocked clipboard access.'));
            },
          },
          'Copy summary for advisor',
        ),
        el('button', { class: 'btn', 'data-key': 'save.print', onclick: () => window.print() }, 'Print'),
      ),
      fileInput,
    );
  }

  // ---------- diagnostics ----------

  function diagnosticsCard(): HTMLElement {
    const issues = rules.issues;
    // Students see this only when the sheet has ERRORS (usability review
    // 2026-09-05, item 19); warnings alone are the DGS's business and are
    // printed by `npm run sync-sheet`.
    if (!issues.some((i) => i.severity === 'error')) return el('div', {});
    const details = el('details', { class: 'card diagnostics' });
    details.append(
      el(
        'summary',
        {},
        `Rules-sheet diagnostics (${issues.filter((i) => i.severity === 'error').length} errors, ${issues.filter((i) => i.severity === 'warning').length} warnings) — for the DGS`,
      ),
    );
    for (const i of issues) {
      details.append(el('div', { class: `issue ${i.severity}` }, `[${i.severity}] ${i.message}`));
    }
    return details;
  }

  // ---------- footer ----------

  function footer(): HTMLElement {
    return el(
      'footer',
      { class: 'legal' },
      el(
        'div',
        {},
        el('strong', {}, 'This is a self-check, not an official audit. '),
        'It applies Sections 3 and 4 of the ',
        handbookLink(),
        '. Some requirements depend on approvals this page cannot see: advisor and DGS sign-off, transfer-credit recommendations, and Graduate School deadlines. Deadlines are shown by semester and are approximate; the registrar’s calendar sets the exact dates. Confirm your standing with the Grad Admin and the DGS before you rely on it.',
      ),
      el(
        'div',
        { class: 'legal-beta' },
        el('strong', {}, 'Alpha version under testing. '),
        BETA_NOTICE,
        ' ',
        el('strong', {}, RULES_ACCURACY_NOTICE),
        ' ',
        BETA_SCOPE_NOTICE,
        ' (See the ',
        el('a', { href: './courses.html' }, 'course rules page'),
        '.)',
        ...reportToDgs(' Error reports, suggestions, and feedback are all welcome — please email'),
      ),
      // What the rules spreadsheet is and who can open it (DGS, 2026-09-04).
      el(
        'div',
        { class: 'legal-source' },
        el('strong', {}, 'Where the rules come from. '),
        ...sheetSourceNote('app'),
      ),
      el(
        'div',
        { class: 'legal-privacy' },
        el('strong', {}, 'Your data never leaves your device. '),
        'Everything you enter — and any transcript PDF you upload — is processed locally in this browser and saved only on this computer. Nothing is transmitted to the University or to any third party (the page only reads the public course-rules sheet), so your FERPA-protected education records remain under your control.',
      ),
      el(
        'div',
        { class: 'legal-license' },
        el('strong', {}, 'License. '),
        '© 2026 University of Notre Dame du Lac. Free for non-commercial (academic and research) use; commercial use requires a license from Notre Dame\'s IDEA Center (',
        mailto('softwarelicensing@nd.edu'),
        '). Full terms: ',
        el('a', { href: LICENSE_URL, target: '_blank', rel: 'noopener noreferrer' }, 'LICENSE.md'),
        ' · source: ',
        el('a', { href: REPO_URL, target: '_blank', rel: 'noopener noreferrer' }, 'GitHub'),
        '.',
      ),
    );
  }


  // ---------- example / clear ----------

  function loadExample(): void {
    if (student.courses.length > 0 && !window.confirm('Replace what you have entered with the example student?')) return;
    student = {
      schemaVersion: 1,
      program: 'phd',
      entryTerm: { season: 'fall', year: 2026 },
      priorMs: 'none',
      gpa: 3.5,
      courses: [
        { courseId: 'CSE 60641', title: 'Graduate Operating Systems', credits: 3, term: { season: 'fall', year: 2026 }, grade: 'A', origin: 'nd' },
        { courseId: 'CSE 63801', title: 'Research Seminar I', credits: 1, term: { season: 'fall', year: 2026 }, grade: 'S', origin: 'nd' },
        { courseId: 'CSE 60111', title: 'Complexity and Algorithms', credits: 3, term: { season: 'spring', year: 2027 }, grade: 'B-', origin: 'nd' },
        { courseId: 'CSE 60321', title: 'Advanced Computer Architecture', credits: 3, term: { season: 'spring', year: 2027 }, grade: 'B+', origin: 'nd' },
        { courseId: 'CSE 63802', title: 'Research Seminar II', credits: 1, term: { season: 'spring', year: 2027 }, grade: 'S', origin: 'nd' },
        { courseId: 'CSE 60770', title: 'Secure Software Engineering', credits: 3, term: { season: 'fall', year: 2027 }, grade: 'A', origin: 'nd' },
        { courseId: 'CSE 60876', title: 'Research Methods', credits: 3, term: { season: 'spring', year: 2028 }, grade: 'IP', origin: 'nd', assignedGroup: 'dsai' },
        { courseId: 'CSE 98900', title: 'Research and Dissertation', credits: 6, term: { season: 'spring', year: 2028 }, grade: 'IP', origin: 'nd' },
      ],
      milestones: { advisorIdentified: '2026-09-10', advisorName: 'Prof. Example' },
      attestations: { advisorApprovedPlan: true },
    };
    saveLocal(student);
    render();
    toast('Example student loaded — clear it before entering your own record.');
  }

  function clearAll(): void {
    if (!window.confirm('Clear everything you have entered on this device?')) return;
    student = emptyStudent();
    clearLocal();
    render();
  }

  // ---------- small helpers ----------

  function field(label: string, control: HTMLElement): HTMLElement {
    return el('label', { class: 'field' }, el('span', { class: 'label' }, label), control);
  }
  function labelWrap(label: string, control: HTMLElement, hint?: string): HTMLElement {
    return el(
      'label',
      { class: 'field inline' },
      el('span', { class: 'label' }, label, hint ? ' ' : '', hint ? el('span', { class: 'label-hint' }, hint) : null),
      control,
    );
  }
  /** A radio group: every option visible, one tap each (item 12). The
   * `data-key`s are per option, so focus lands back on the chosen radio after
   * the page rebuilds. */
  function radios(keyPrefix: string, options: [string, string][], current: string, onPick: (value: string) => void): HTMLElement {
    const name = keyPrefix.replace(/\W+/g, '-');
    return el(
      'div',
      { class: 'radios' },
      ...options.map(([value, label]) => {
        const r = el('input', { type: 'radio', name, value, 'data-key': `${keyPrefix}.${value}`, onchange: () => onPick(value) });
        r.checked = value === current;
        return el('label', { class: 'radio' }, r, ` ${label}`);
      }),
    );
  }
  /** Several controls answering ONE question (entry term = semester + year):
   * a fieldset whose legend is the question, so each control keeps its own
   * accessible name and the group its meaning (WCAG 1.3.1). */
  function fieldset(legend: string, controls: HTMLElement, variant: 'block' | 'inline' = 'block'): HTMLElement {
    return el('fieldset', { class: `field${variant === 'inline' ? ' inline' : ''} group` }, el('legend', { class: 'label' }, legend), controls);
  }

  render();
}
