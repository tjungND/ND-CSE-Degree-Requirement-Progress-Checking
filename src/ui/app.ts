// The student-facing app: standing form, course table with sheet-driven
// autocomplete, milestone dates, attestations, and the live report.
// All rule logic lives in src/engine/ — this file only collects input and renders.
import type { NotreDameNow } from '../data/clock.ts';
import { resolveRuleRow } from '../data/assemble.ts';
import { findExternalRule, isNotreDameInstitution } from '../data/external.ts';
import { CORE_TITLE_RE } from '../engine/core-title.ts';
import type { Rules } from '../data/types.ts';
import { coursesNeedingDgsReview, type PendingDgsReview } from '../engine/review.ts';
import { shortName } from '../engine/short-names.ts';
import { audit } from '../engine/audit.ts';
import { GRADES, GRADE_POINTS } from '../engine/grades.ts';
import { termIndex, termLabel, termOfDate, termShort } from '../engine/term.ts';
import type { CourseEntry, CourseLine, Season, Student, Term } from '../engine/types.ts';
import { parseTranscript, type DegreeAwarded, type EntryTermInference, type ParsedCourse } from '../transcript/parse.ts';
import { clear, el, inactiveButton, option, PREVIEW_OPEN_NOTE } from './dom.ts';
import { ALPHA_LINE, BETA_NOTICE, BETA_SCOPE_NOTICE, PRIVACY_LINE, RULES_ACCURACY_NOTICE, handbookLink, rulesDateLine } from './handbook.ts';
import { DGS, GRAD_ADMIN, LICENSE_URL, REPO_URL, applyContactOverrides, contactCard, mailto, reportToDgs } from './contacts.ts';
import { DEGREE_SLOTS, importsBusy, priorTranscriptSection } from './external-upload.ts';
import { statusMark } from './marks.ts';
import { deriveNdMasters, derivePriorMs, hasPriorGraduateStudy, isPriorNd, priorNdDegreeLevel, reclassifyNotreDameCourses } from './prior-nd.ts';
import { applyFirstMentionRule } from './first-mention.ts';
import { canonicalUniversityName, knownUniversities } from './university-name.ts';
import { copyDialog } from './copy-dialog.ts';
import { gradAdminRequest, selfCheckFileName } from './grad-admin-request.ts';
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

/** The §4.4.2 groups a course may satisfy, in the Categories tab's own order
 * (DGS 2026-09-08 — a sheet cell may name one group, several, or `any`).
 * Empty when the course is ineligible or the DGS has not said. */
function groupsOf(rule: { categoryGroups?: string[] }, rules: Rules): string[] {
  const listed = rule.categoryGroups;
  if (!listed || listed.length === 0) return [];
  const all = rules.categoryGroups.map((g) => g.code);
  return listed.includes('any') ? all : all.filter((g) => listed.includes(g));
}


export function startApp(root: HTMLElement, rules: Rules, today: NotreDameNow): void {
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
  // Established on the loading card (DGS 2026-09-07): the date at Notre Dame,
  // from the server this page came from when it answers, and read in Notre
  // Dame's own zone either way — never the device's idea of the calendar.
  const todayIso = today.iso;
  const fullTimeFloor = rules.parameters.number('fulltime_credits_min') ?? 9;
  let toastTimer: number | undefined;
  /** §4.4.2 group suggestions for this render (2026-09-08): course id → the
   * groups the student's other courses do not cover. Set in render(), read by
   * the coursework table, which is built later in the same pass. */
  let groupChoices: Record<string, string[]> = {};
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

  // Toasts live in a stack created once OUTSIDE the root (2026-09-06
  // evening). render() rebuilds the page on every change, and an Undo that
  // lived inside it died with the first keystroke, checkbox or "Reading…"
  // toast after a Remove — the DGS's "the review card never comes back". Now
  // a plain toast has one slot (4 s), and each Undo is its own element (12 s
  // for a row, 20 s for a transcript-wide removal) that no plain toast
  // replaces; Load example / Clear / Load a file cancel every Undo, since a
  // stale one would splice old rows into a replaced record. The stack is one
  // polite live region, so screen readers hear each message (a region created
  // per toast would not be announced).
  const toastStack = el('div', { class: 'toast-stack', role: 'status', 'aria-live': 'polite' });
  document.body.append(toastStack);
  let plainToast: HTMLElement | undefined;
  let plainToastTimer: number | undefined;
  const toast = (msg: string): void => {
    plainToast?.remove();
    const t = el('div', { class: 'toast show' }, msg);
    plainToast = t;
    toastStack.prepend(t);
    window.clearTimeout(plainToastTimer);
    plainToastTimer = window.setTimeout(() => {
      t.remove();
      if (plainToast === t) plainToast = undefined;
    }, 4000);
  };
  const undoToasts = new Map<HTMLElement, number>();
  const cancelUndo = (): void => {
    for (const [t, timer] of undoToasts) {
      window.clearTimeout(timer);
      t.remove();
    }
    undoToasts.clear();
  };
  /** A toast carrying one action (Undo) — stays longer, is clickable, and
   * survives re-renders. `focusKey` names the control to focus after the
   * action's render (the button lives outside the root, so the rebuild has
   * nothing to remember). */
  const toastWithAction = (msg: string, actionLabel: string, action: () => void, opts: { ttlMs?: number; focusKey?: string } = {}): void => {
    for (const [t, timer] of undoToasts) {
      if (undoToasts.size < 3) break; // at most three live Undos — the oldest goes
      window.clearTimeout(timer);
      t.remove();
      undoToasts.delete(t);
    }
    const t = el('div', { class: 'toast show has-action' }, msg, ' ');
    const dismiss = (): void => {
      const timer = undoToasts.get(t);
      if (timer !== undefined) window.clearTimeout(timer);
      undoToasts.delete(t);
      t.remove();
    };
    t.append(
      el(
        'button',
        {
          class: 'toast-action',
          onclick: () => {
            dismiss();
            if (opts.focusKey !== undefined) focusAfterRender = opts.focusKey;
            action();
          },
        },
        actionLabel,
      ),
    );
    toastStack.prepend(t);
    undoToasts.set(t, window.setTimeout(dismiss, opts.ttlMs ?? 12000));
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

  function rememberFocus(): { key?: string; path?: number[]; selection?: [number, number]; x: number; y: number; open: string[]; expanded: string[] } {
    const active = document.activeElement as HTMLElement | null;
    // What the student had opened, so a keystroke elsewhere does not close it
    // (2026-09-08): render() rebuilds the whole root, and used to restore focus
    // to a § button whose quote had silently collapsed underneath it.
    const memo: ReturnType<typeof rememberFocus> = {
      x: window.scrollX,
      y: window.scrollY,
      open: [...root.querySelectorAll<HTMLDetailsElement>('details[data-key]')].filter((d) => d.open).map((d) => d.dataset['key'] ?? ''),
      expanded: [...root.querySelectorAll<HTMLElement>('[aria-expanded="true"][data-key]')].map((b) => b.dataset['key'] ?? ''),
    };
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
    // Re-open first, so focus lands inside something that is actually visible.
    for (const k of memo.open) {
      const d = root.querySelector<HTMLDetailsElement>(`details[data-key="${CSS.escape(k)}"]`);
      if (d) d.open = true;
    }
    for (const k of memo.expanded) {
      const b = root.querySelector<HTMLElement>(`[data-key="${CSS.escape(k)}"][aria-expanded]`);
      if (!b) continue;
      b.setAttribute('aria-expanded', 'true');
      const controls = b.getAttribute('aria-controls');
      if (controls) document.getElementById(controls)?.classList.remove('hidden');
    }
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
    // Nothing entered yet: the report describes the degree, not the student
    // (2026-09-08). Every row would otherwise read "Not yet" as if the student
    // had failed thirteen checks they have not been asked about.
    const untouched =
      student.courses.length === 0 && Object.keys(student.milestones).length === 0 && student.gpa === undefined;
    groupChoices = report.requirements.find((r) => r.id === 'phd.qualifier.categories')?.groupChoices ?? {};
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
          `Self-check printed on ${todayIso} — ${student.program === 'mscse' ? 'M.S. in CSE (§3)' : 'Ph.D. (§4)'}, entered ${termLabel(student.entryTerm)} — not an official audit; the DGS determines eligibility, the Grad Admin processes it.`,
        ),
        // The example is saved like any other record, so say whose it is until
        // the student clears it (2026-09-08).
        student.isExample
          ? el(
              'div',
              { class: 'card example-banner', role: 'note' },
              el('strong', {}, 'This is the example student, not your record. '),
              'Nothing here came from you. Clear it before entering your own coursework.',
              el('div', { class: 'save-buttons' }, el('button', { class: 'btn', 'data-key': 'example.clear', onclick: clearAll }, 'Clear the example')),
            )
          : null,
        noticeStrip(),
        // The universities the ExternalCourses tab knows, for both University
        // boxes (manual course form, previous-transcript preview) — one
        // datalist per page (2026-09-06 evening).
        el('datalist', { id: 'known-universities' }, ...knownUniversities(rules.external).map((u) => el('option', { value: u }))),
        rules.source === 'snapshot' ? snapshotBanner() : null,
        // Phones and small tablets (2026-09-05, review item 2): the result
        // first, then the inputs, then the full report — plus a sticky score
        // bar with jump links (both hidden on wide screens by CSS).
        renderSummary(report, untouched),
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
            askGradAdminCard(report),
            saveCard(report),
            diagnosticsCard(),
          ),
          el(
            'div',
            { class: 'audit-col', id: 'report', tabindex: '-1', 'aria-label': 'Your report' },
            report.warnings.length > 0
              ? el('div', { class: 'warnings', role: 'note' }, ...report.warnings.map((w) => el('div', {}, `⚠ ${w}`)))
              : null,
            renderReport(report, untouched),
          ),
        ),
        el(
          'nav',
          { class: 'sticky-score', 'aria-label': 'Your score, and jumps between inputs and report' },
          el('span', { class: 'sticky-text' }, scoreLine(report)),
          el('a', { href: '#inputs' }, 'Inputs ↑'),
          el('a', { href: '#report' }, 'Report ↓'),
        ),
      ),
      footer(),
      ].filter((n): n is HTMLElement => n !== null),
    );
    // "Oral Candidacy Exam (OCE)" in full once, then "OCE" (DGS 2026-09-06
    // evening) — text nodes only, in document order, before focus is restored.
    applyFirstMentionRule(root);
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
      { class: 'notice-details', 'data-key': 'notice.details' },
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
        'Everything you enter — and any transcript PDF you import — is processed and stored entirely locally, within your own browser; the optional text recognition (OCR) for scanned transcripts is also computed in your browser. Nothing is uploaded, transmitted, or stored anywhere else. The page makes two network requests, neither of which carries anything about you: the read-only fetch of the public course rules, and one request to this site’s own server to ask what time it is at Notre Dame.',
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
        // Re-filing can turn program coursework into an earlier degree's
        // coursework, which changes the §5.2 cap: a student who corrects the
        // entry term to their Ph.D. start has just told the app about a prior
        // graduate program (2026-09-09 — the cap was staying at 6).
        // Whether their Notre Dame master's was earned BEFORE this program or
        // along the way turns on the same term, so it is re-read first and the
        // cap follows it (2026-09-10 — a 4+1 correcting the term got 6).
        deriveNdMasters(s);
        derivePriorMs(s);
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
          'The residency count and every deadline — the 8-year limit (§4.3), the 18-month research qualifier (§4.4.3), the qualifier’s four semesters (§4.4), and the Oral Candidacy Exam (OCE) by the eighth semester (§4.5) — are counted from this term.',
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
    // Bachelor's degree awarded (DGS 2026-09-06): graduate-level courses dated
    // in or before this term earn no transfer credit — §5.2 needs graduate
    // student status (allocate.ts). Required since 2026-09-07 (DGS), though
    // the year is still the switch for the stored value (empty = unknown) and
    // the semester defaults to spring (May commencement). A
    // transcript import fills it in when it finds a dated bachelor's award;
    // the note says so until the student touches either control.
    const awarded = student.bachelorsAwarded;
    const bsYear = el('input', {
      type: 'number',
      min: '1970',
      max: '2040',
      'aria-label': 'Bachelor’s degree awarded — year',
      'data-key': 'standing.bachelors.year',
      ...(awarded === undefined ? { required: 'required', 'aria-required': 'true' } : {}),
      value: awarded ? String(awarded.year) : '',
    });
    const bsSeason = el('select', { 'aria-label': 'Bachelor’s degree awarded — semester', 'data-key': 'standing.bachelors.season' });
    for (const se of SEASONS) bsSeason.append(option(se, se[0]!.toUpperCase() + se.slice(1), (awarded?.season ?? 'spring') === se));
    const setBachelors = (): void =>
      update((s) => {
        const year = Number((bsYear as HTMLInputElement).value);
        s.bachelorsAwarded = (bsYear as HTMLInputElement).value !== '' && Number.isFinite(year) && year >= 1970 ? { season: (bsSeason as HTMLSelectElement).value as Season, year } : undefined;
        s.bachelorsAwardedInferred = undefined; // the student decided
        reclassifyNotreDameCourses(s); // prior Notre Dame rows without a registered level follow the award term
        derivePriorMs(s); // a senior-year graduate course is not a prior master's (2026-09-09)
      });
    bsYear.addEventListener('change', setBachelors);
    bsSeason.addEventListener('change', () => {
      if ((bsYear as HTMLInputElement).value !== '') setBachelors();
    });
    const hasGraduateTransfers = student.courses.some((c) => c.origin === 'transfer' && c.degreeLevel !== 'bachelors');
    const bsInferred = student.bachelorsAwardedInferred;
    const bsNote = el(
      'p',
      // Required since 2026-09-07 (DGS): every student has a bachelor's
      // degree, and §5.2 counts a course as transfer credit only if it was
      // taken after that degree — so the term is needed whether or not the
      // student also holds a graduate degree. An unset field always warns.
      { class: `hint${bsInferred || awarded === undefined ? ' warn' : ''} field-hint bachelors-note` },
      awarded && bsInferred
        ? `${termLabel(awarded)} was read from your transcript (${bsInferred.how}). Check it — courses taken in or before this term, even graduate-level ones, are not counted as transfer credit (§5.2: graduate student status).`
        : awarded
          ? 'Courses taken in or before this term, even graduate-level ones, are not counted as transfer credit (§5.2: graduate student status).'
          : hasGraduateTransfers
            ? 'Required, and you already have coursework from before Notre Dame: enter the semester your bachelor’s degree was awarded. Courses taken in or before it, even graduate-level ones, cannot transfer (§5.2); until it is set, every graduate-level course from before Notre Dame is taken as graduate coursework.'
            : 'Required — the semester your bachelor’s degree was awarded. Every student has one, whether or not they also hold a graduate degree, and §5.2 counts a course as transfer credit only when it was taken after it.',
    );
    // Already holds Notre Dame's own master's degree (DGS 2026-09-09). §4.5
    // lets a Ph.D. student earn the MSCSE along the way; a student who earned
    // it BEFORE this program cannot earn it again, so that row is left out of
    // their report entirely (phd.ts). The Notre Dame transcript sets this from
    // its degree-conferral lines; this box is how the student corrects it.
    // Ph.D. only — the MSCSE audit has no along-the-way row to suppress.
    const ndMs = student.ndMasters;
    const ndMsBox = el('input', {
      type: 'checkbox',
      'data-key': 'standing.ndMasters',
      onchange: (e) =>
        update((s) => {
          // The student decided: keep any term already read from the
          // transcript for the wording, but drop the "inferred" flag.
          s.ndMasters = (e.target as HTMLInputElement).checked ? { ...(s.ndMasters?.term ? { term: s.ndMasters.term } : {}) } : undefined;
          // The §5.2 cap depends on this answer — 24 credits for a completed
          // prior degree, 6 for an unfinished one. Ticking the box used to
          // take the §4.5 row away and leave the cap at 6 (2026-09-10).
          derivePriorMs(s);
        }),
    });
    (ndMsBox as HTMLInputElement).checked = ndMs !== undefined;
    const ndMsField = el(
      'div',
      { class: 'field' },
      el('label', { class: 'check' }, ndMsBox, ' I already hold the MSCSE from Notre Dame'),
      el(
        'p',
        { class: `hint field-hint${ndMs?.inferred ? ' warn' : ''}` },
        ndMs?.inferred
          ? `Ticked because ${ndMs.inferred.how}. Untick it if that is not right. The Ph.D. can award the MSCSE along the way (§4.5); a degree you already hold is not shown as something to earn. Your master's coursework is still transfer credit (§5.2) — that is the row above.`
          : 'Tick this if you earned the MSCSE at Notre Dame before starting the Ph.D. The Ph.D. can award the MSCSE along the way (§4.5), and a degree you already hold is not shown as something to earn.',
      ),
    );

    const card = el(
      'section',
      { class: 'card' },
      el('h2', {}, el('span', { class: 'step-no' }, '2. '), 'Your standing ', el('span', { class: 'chip-note' }, currentSemesterChip())),
      // A fieldset with a legend (item 5): the two controls share one question.
      fieldset(enteredProgramLabel(), el('div', { class: 'pair' }, seasonSel, yearInput)),
      // What this field drives (item 11) — the longer note takes over while
      // the term is inferred or assumed.
      entryNote ?? el('p', { class: 'hint field-hint' }, 'Every deadline and the residency count are counted from this term.'),
      fieldset('Bachelor’s degree awarded (required)', el('div', { class: 'pair' }, bsSeason, bsYear)),
      bsNote,
      fieldset('Prior graduate study (§5.2 transfer caps)', priorGroup),
      priorNote,
    );
    if (student.program === 'phd') card.append(ndMsField);

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

  // The chip beside "2. Your standing" is the semester we are in TODAY, not
  // anything the student entered — it was a bare "Fall 2026" and read like the
  // entry term (DGS 2026-09-07), so it now says what it is.
  function currentSemesterChip(): string {
    return `current semester: ${termLabel(termOfDate(todayIso))}`;
  }

  /** The entry-term question names the actual program and where it is (DGS
   * 2026-09-07: "Entered the program" said neither). */
  function enteredProgramLabel(): string {
    return student.program === 'mscse'
      ? 'Entered the M.S. in CSE program at Notre Dame in'
      : 'Entered the Ph.D. program at Notre Dame CSE in';
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

  /** The §5.2 transfer cap that applies to this student, as the engine reads
   * it (audit.ts capSpecs) — for the coursework card's explanation. */
  function transferCapLimit(): string {
    const key =
      student.program === 'mscse'
        ? student.priorMs === 'completed' ? 'ms_transfer_completed_ms_credits_max' : 'transfer_unfinished_ms_credits_max'
        : student.priorMs === 'completed' ? 'phd_transfer_completed_ms_credits_max' : 'transfer_unfinished_ms_credits_max';
    const n = rules.parameters.number(key);
    return n === undefined ? 'a capped number of' : String(n);
  }

  function coursesCard(courseLines: CourseLine[]): HTMLElement {
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
        ? `ND, before entering the program — ${e.c.degreeLevel === 'bachelors' ? 'undergraduate' : 'graduate'} coursework`
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
    /** Does at least one course of this group carry the engine's "candidate
     * for transfer credit" line (an unreviewed graduate course the handbook
     * does not rule out)? */
    const hasTransferCandidate = (entries: { c: CourseEntry }[]): boolean =>
      entries.some(({ c }) =>
        courseLines.some((l) => l.courseId === c.courseId && termIndex(l.term) === termIndex(c.term) && l.text.includes('candidate for transfer credit')),
      );
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
      el('h3', { class: 'subhead', id: 'nd-courses' }, 'ND'),
      nd.length > 0
        ? courseTable(courseLines, nd)
        : el('p', { class: 'empty' }, 'No ND courses yet. Import your transcript above, or add one here.'),
      ...groups.flatMap((g) => [
        el('h3', { class: 'subhead' }, g.heading),
        g.bachelors
          ? el(
              'p',
              { class: 'hint' },
              `Courses taken as an undergraduate student do not transfer, whether or not the course itself is a graduate course (§5.2). Only courses relevant to the Algorithms, Operating Systems, and Computer Architecture core-knowledge areas (§4.4.1) are listed here${g.hidden > 0 ? ` — ${g.hidden} other course${g.hidden === 1 ? '' : 's'} from this transcript ${g.hidden === 1 ? 'is' : 'are'} not shown` : ''}.`,
            )
          : hasTransferCandidate(g.entries)
            ? el(
                'p',
                { class: 'hint' },
                // DGS 2026-09-06: every unreviewed graduate course is a candidate;
                // the DGS decides which ones transfer, CSE-related only, within
                // the cap — the lines below never rank the candidates. Said only
                // above a group that still holds a candidate (a group whose only
                // course the handbook rules out — grade, five-year window — would
                // contradict it). Coursework from an EARLIER NOTRE DAME degree
                // gets the same paragraph (2026-09-09): §5.2's last sentence
                // covers it — "These five requirements also apply to the
                // transfer of credits earned in another program at Notre Dame"
                // — and a student who never left Notre Dame is the one most
                // likely to assume their own courses simply carry over.
                `Transfer credit (§5.2) is decided by the DGS course by course — normally only CSE-related courses transfer, at most ${transferCapLimit()} credits in total, and the Graduate School confirms the DGS’s recommendation. Until the DGS has ruled, every graduate course here is a candidate; the review request below asks for those rulings. Once the DGS has ruled a course transferable, the Grad Admin processes the credit transfer — the processing request below the milestones covers it.`,
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
    // Which courses need a DGS decision, and why, is the engine's call
    // (src/engine/review.ts, 2026-09-06 evening — with the test matrix that
    // pins it); this card only lists them and builds the copy-ready request.
    const pending = coursesNeedingDgsReview(student, rules);
    const n = pending.length;
    if (n === 0) return null;
    const request = (p: PendingDgsReview) => ({
      courseId: p.course.entry.courseId,
      title: p.course.entry.title ?? p.course.rule?.title,
      credits: p.course.entry.credits,
      grade: p.course.entry.grade,
      termText: termLabel(p.course.entry.term),
      reason: p.reason,
      unlisted: p.unlisted,
    });
    // Notre Dame courses (program coursework and prior coursework) feed the
    // Courses-tab rows; other universities the ExternalCourses rows.
    const ndReq = pending.filter((p) => p.kind !== 'external').map(request);
    const extReq = pending
      .filter((p) => p.kind === 'external')
      .map((p) => ({
        ...request(p),
        institution: p.course.entry.institution,
        slotLabel: p.course.entry.degreeLevel
          ? (DEGREE_SLOTS.find((sl) => sl.level === p.course.entry.degreeLevel)?.label ?? p.course.entry.degreeLevel)
          : undefined,
      }));
    const where = (p: PendingDgsReview): string =>
      p.kind === 'nd' ? 'Notre Dame' : p.kind === 'priorNd' ? 'Notre Dame, before entry' : (p.course.entry.institution ?? 'other university');
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
        '). Attach your transcript PDFs (Bachelor’s / Master’s / Ph.D. — whichever apply) to the same email. It includes rows the DGS can paste straight into the rules sheet; the page itself sends nothing. The DGS decides eligibility only; once a course is decided, having it processed is a separate request — see the processing card below the milestones.',
      ),
      ...pending.map((p) => line(p.course.entry.courseId, where(p), p.reason)),
      el(
        'div',
        { class: 'save-buttons' },
        el(
          'button',
          {
            class: 'btn',
            'data-key': 'review.copy',
            onclick: () => {
              // Copy, then the check-before-you-send dialog (DGS request 2026-09-06 evening).
              void import('../transcript/external.ts').then(({ buildCombinedReviewRequest }) => {
                const built = buildCombinedReviewRequest({ priorStudy: PRIOR_LABELS[student.priorMs], nd: ndReq, external: extReq });
                return copyDialog({
                  what: 'Review request',
                  recipient: { role: DGS.role, name: DGS.name, email: DGS.email },
                  subject: built.subject,
                  text: built.text,
                  html: built.html,
                  steps: [{ text: 'Attach your ORIGINAL transcripts as PDFs (Bachelor’s / Master’s / Ph.D. — whichever apply). The DGS cannot review the courses without them.', emphasis: true }],
                  returnFocusKey: 'review.copy',
                });
              });
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
    const fileInput = el('input', { type: 'file', accept: '.pdf,application/pdf', class: 'hidden', 'aria-label': 'ND unofficial transcript PDF' });
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
          fail("Only ND's unofficial transcript is accepted here — for courses from other universities, use the Previous-Transcript rows below.");
          return;
        }
        if (parsed.courses.length === 0) {
          fail('This looks like an ND transcript, but no course lines could be read from it. Add your courses manually, and tell the DGS so the parser can be improved.');
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
        const bsTerm = bachelorsTermFor(parsed.degreesAwarded);
        const irrelevantPrior = parsed.courses.map(
          (c) =>
            c.origin === 'nd' &&
            termIndex(c.term) < termIndex(entry) &&
            priorNdDegreeLevel({ courseId: c.courseId, registeredLevel: c.level, term: c.term }, bsTerm) === 'bachelors' &&
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
    // Everything the transcript import added can be taken back in one click,
    // like a previous-university transcript (DGS request 2026-09-06): the
    // rows it added (program courses, pre-entry prior coursework and the
    // transcript's transfer-credit block — all flagged `fromNdTranscript`),
    // the GPA it filled in, and a "Prior graduate study" it inferred. Rows
    // typed by hand stay; so does the entry term, which the student can
    // still change under Your standing. Undo instead of a confirm dialog.
    const imported = student.courses.filter((c) => c.fromNdTranscript === true);
    // While a preview is open (this row's or a previous-university one), the
    // Import and Remove buttons are inactive and say why on hover / click
    // (DGS request 2026-09-06) — `inactiveButton`, not `disabled`, so the
    // reason can be shown.
    const button = (attrs: Record<string, string | boolean | ((ev: Event) => void)>, label: string): HTMLButtonElement =>
      blocked ? inactiveButton(attrs, PREVIEW_OPEN_NOTE, toast, label) : el('button', attrs, label);
    const importButton = button(
      { class: 'btn', 'data-key': 'import.nd', onclick: () => (fileInput as HTMLInputElement).click() },
      imported.length > 0 ? 'Import again' : 'Import from PDF (alpha)',
    );
    const parts: (Node | string)[] = [
      el('span', { class: 'slot-label' }, 'ND Unofficial Transcript'),
      el('span', { class: 'slot-sep', 'aria-hidden': 'true' }, ' — '),
    ];
    if (imported.length > 0) {
      const n = imported.length;
      parts.push(
        el('span', {}, `${n} course${n === 1 ? '' : 's'} from your transcript `),
        button(
          {
            class: 'btn tiny',
            'aria-label': `Remove the ${n} course${n === 1 ? '' : 's'} imported from your ND transcript`,
            'data-key': 'import.nd.remove',
            onclick: () => {
              // Index-preserving (2026-09-06 evening): Undo puts every row
              // back where it was, so the table order and the course.N.remove
              // keys are exactly as before the Remove.
              const removed = student.courses.map((c, i) => ({ c, i })).filter(({ c }) => c.fromNdTranscript === true);
              const before = { gpa: student.gpa, gpaSource: student.gpaSource, priorMs: student.priorMs, inferred: student.priorMsInferred };
              focusAfterRender = 'import.nd';
              update((s) => {
                s.courses = s.courses.filter((c) => c.fromNdTranscript !== true);
                if (s.gpaSource !== undefined) {
                  s.gpa = undefined; // the transcript's figure — a hand-typed GPA has no gpaSource and stays
                  s.gpaSource = undefined;
                }
                if (
                  s.priorMsInferred === true &&
                  !s.courses.some((c) => c.origin === 'transfer' && (c.degreeLevel === 'masters' || c.degreeLevel === 'phd'))
                ) {
                  s.priorMs = 'none';
                  s.priorMsInferred = undefined;
                }
              });
              toastWithAction(
                `${removed.length} course${removed.length === 1 ? '' : 's'} from your ND transcript removed${before.gpaSource !== undefined ? ', and the GPA it filled in' : ''}.`,
                'Undo',
                () =>
                  update((s) => {
                    for (const { c, i } of removed) s.courses.splice(Math.min(i, s.courses.length), 0, c);
                    s.gpa = before.gpa;
                    s.gpaSource = before.gpaSource;
                    s.priorMs = before.priorMs;
                    s.priorMsInferred = before.inferred;
                  }),
                { ttlMs: 20000, focusKey: 'import.nd.remove' },
              );
            },
          },
          'Remove',
        ),
        ' · ',
        importButton,
        el('span', { class: 'hint-inline' }, ' — after new grades post, remove these and import the updated PDF; courses you typed in by hand are kept.'),
      );
    } else {
      parts.push(
        importButton,
        el('span', { class: 'hint-inline' }, ' — the system-generated PDF from insideND; fills the coursework table and GPA below. Parsed courses are shown for your confirmation before anything is added.'),
      );
    }
    return el('div', { class: 'transcript-upload external-slot' }, ...parts, fileInput, errorBox);
  }

  /** Credit-weighted GPA of the graded Notre Dame courses from the entry term
   * on — this program's courses only (letter grades; S/U and in-progress rows
   * carry no points). Undefined when nothing is graded yet. */
  /** The dated bachelor's award on a parsed Notre Dame transcript, as the
   * term to file pre-entry courses by and to fill "Bachelor's degree awarded"
   * with (DGS 2026-09-06). */
  function bachelorsAwardFrom(degrees: DegreeAwarded[]): { term: Term; degree: DegreeAwarded } | undefined {
    const d = degrees.find((x) => x.level === 'bachelors' && x.date !== undefined);
    return d ? { term: termOfDate(d.date!), degree: d } : undefined;
  }
  /** An import fills the field only while it is empty or still an import's own reading. */
  const bachelorsMayBeSet = (s: Student): boolean => s.bachelorsAwarded === undefined || s.bachelorsAwardedInferred !== undefined;
  /** The award term a Notre Dame import would use: the transcript's, when it
   * may still set the field; else whatever the student has. */
  const bachelorsTermFor = (degrees: DegreeAwarded[]): Term | undefined => {
    const bs = bachelorsAwardFrom(degrees);
    return bs && bachelorsMayBeSet(student) ? bs.term : student.bachelorsAwarded;
  };

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
          ` Set your entry term to ${termLabel(tp.entryTerm.term)} — ${tp.entryTerm.how}. The residency count and every deadline are counted from this term; check it.`,
        ),
      );
      if (tp.entryTerm.alternative) box.append(el('p', { class: 'hint warn' }, `Note: ${tp.entryTerm.alternative.why}.`));
    }
    // The dated bachelor's award (2026-09-06) fills "Bachelor's degree awarded"
    // under Your standing, unless the student already set it by hand.
    const bs = bachelorsAwardFrom(tp.degreesAwarded);
    if (bs && bachelorsMayBeSet(student)) {
      box.append(
        el(
          'p',
          { class: 'hint bachelors-line' },
          `Your transcript shows a ${bs.degree.name} awarded ${bs.degree.date} — “Bachelor’s degree awarded” under Your standing will be set to ${termLabel(bs.term)}. Courses taken in or before that term, even graduate-level ones, are not counted as transfer credit (§5.2).`,
        ),
      );
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
            ? `before entry — prior ${priorNdDegreeLevel({ courseId: c.courseId, registeredLevel: c.level, term: c.term }, bachelorsTermFor(tp.degreesAwarded)) === 'bachelors' ? 'undergraduate' : 'graduate'} coursework`
            : '';
      table.append(
        el(
          'tr',
          { class: prior ? 'prior-row' : '' },
          el('td', { class: 'cell-check' }, cb),
          el('td', { class: 'cell-course' }, el('div', { class: 'cid' }, c.courseId), el('div', { class: 'ctitle' }, c.title ?? '')),
          el('td', { class: 'cell-meta', 'data-label': 'Term' }, el('abbr', { class: 'term', title: termLabel(c.term) }, termShort(c.term))),
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
              let bachelorsSet: Term | undefined;
              let ndMastersSet = false;
              update((s) => {
                if (tp.useEntryTerm && tp.entryTerm) {
                  s.entryTerm = { ...tp.entryTerm.term };
                  s.entryTermInferred = { how: tp.entryTerm.how, alternative: tp.entryTerm.alternative };
                }
                // The bachelor's award term (2026-09-06), before the prior
                // rows are filed — they follow it when unlabelled.
                const bs = bachelorsAwardFrom(tp.degreesAwarded);
                if (bs && bachelorsMayBeSet(s)) {
                  s.bachelorsAwarded = bs.term;
                  s.bachelorsAwardedInferred = { how: `the ${bs.degree.name} awarded ${bs.degree.date} on your Notre Dame transcript` };
                  bachelorsSet = bs.term;
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
                    fromNdTranscript: true, // so "Remove" can take back exactly these rows
                  };
                  s.courses.push(entryCourse);
                }
                // Pre-entry Notre Dame courses → prior coursework (2026-09-05).
                priorAdded = reclassifyNotreDameCourses(s).toPrior;
                // A Notre Dame master's degree awarded BEFORE this program is
                // one the student already holds (DGS 2026-09-09) — §4.5's
                // along-the-way MSCSE is then not something to earn, and the
                // report leaves that row out. A master's dated after the entry
                // term is the along-the-way award itself, so the date decides;
                // an undated conferral line leaves the checkbox to the student.
                // Kept on the record so the reading can be made again when the
                // entry term changes — which for a 4+1 it usually does.
                s.ndDegrees = tp.degreesAwarded
                  .filter((d) => d.date !== undefined && d.level !== 'other')
                  .map((d) => ({ level: d.level as 'bachelors' | 'masters' | 'phd', date: d.date! }));
                deriveNdMasters(s);
                ndMastersSet = s.ndMasters !== undefined;
                // Prior GRADUATE coursework at Notre Dame sets "Prior graduate
                // study" the way an uploaded Master's transcript does
                // (2026-09-03 rule): completed when the transcript shows a
                // graduate degree awarded, else "not completed" + the warning.
                // derivePriorMs carries the Notre Dame master's; an UNDATED
                // conferral line still counts as "completed" here, since it
                // says the degree exists even where it cannot be placed.
                const before = s.priorMs;
                if (s.priorMs === 'none' && s.ndMasters === undefined && hasPriorGraduateStudy(s) && tp.degreesAwarded.some((d) => d.level === 'masters' || d.level === 'phd')) {
                  s.priorMs = 'completed';
                  s.priorMsInferred = true;
                }
                derivePriorMs(s);
                if (s.priorMs !== before) priorSet = s.priorMs;
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
                  (appliedEntry ? `; your entry term set to ${termLabel(appliedEntry)} — check it under Your standing` : '') +
                  (priorAdded > 0 ? `; ${priorAdded} filed as coursework from before you entered the program` : '') +
                  (priorSet === 'completed'
                    ? '; Prior graduate study set to “Completed prior M.S. or Ph.D.” from the degree awarded on your transcript'
                    : priorSet === 'unfinished'
                      ? '; Prior graduate study set to “Prior M.S., not completed” — no graduate degree award was found on your transcript; change it under Your standing if you did earn it'
                      : '') +
                  (bachelorsSet ? `; “Bachelor’s degree awarded” set to ${termLabel(bachelorsSet)} from the degree on your transcript — check it under Your standing` : '') +
                  (ndMastersSet ? '; ticked “I already hold the MSCSE from Notre Dame” from the degree on your transcript — the §4.5 along-the-way row is left out for you' : '') +
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
    // University: offered from the ExternalCourses tab, Title-Cased on leaving
    // the box (DGS 2026-09-06 evening); matching ignores case anyway.
    const institutionInput = el('input', { list: 'known-universities', 'data-key': 'course.new.institution' });
    institutionInput.addEventListener('change', () => {
      (institutionInput as HTMLInputElement).value = canonicalUniversityName((institutionInput as HTMLInputElement).value);
    });
    // (The per-course core-area claim dropdown was retired 2026-09-03 —
    // the DGS's ExternalCourses rulings are the only §4.4.1 external path.)
    // Level for a course from another university — two choices since
    // 2026-09-06 (DGS: the generic "graduate coursework" overlapped with
    // "from a previous Master's / Ph.D."): Graduate (after the bachelor's; a
    // §5.2 transfer candidate; saved with NO degree level, so the row belongs
    // to no transcript slot and groups under "graduate coursework (§5.2)") or
    // Undergraduate (before it; earns no transfer credit but can satisfy
    // §4.4.1 core knowledge once the DGS confirms it). The Master's/Ph.D.
    // distinction stays with the transcript slots and "Prior graduate study".
    const levelSel = el('select', { 'data-key': 'course.new.level' });
    // "… student" (DGS 2026-09-06, late evening): the choice is the student's
    // status at the time, never the course's level.
    levelSel.append(option('', 'Grad student — after your bachelor’s degree was awarded (§5.2 transfer candidate)', true));
    levelSel.append(option('bachelors', 'UG student — before your bachelor’s degree was awarded (core knowledge only, no transfer credit)'));
    const groupSel = el('select', { 'data-key': 'course.new.group' });
    groupSel.append(option('', 'Assign a specialization group…'));
    for (const g of rules.categoryGroups) groupSel.append(option(g.code, `Count as: ${g.name}`));
    // The optional controls are shown/hidden with their labels.
    const institutionField = labelWrap('University', institutionInput, '(as your transcript prints it — pick it from the list if it is there)');
    const levelField = labelWrap('Taken as', levelSel, '(your status when you took it — not the course’s level)');
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
        // A course may be listed under one group, several, or every group
        // (DGS 2026-09-08): the picker appears whenever there is a choice.
        const choices = groupsOf(rule, rules);
        const choosable = choices.length > 1 && student.program === 'phd';
        groupField.classList.toggle('hidden', !choosable);
        if (choosable) {
          toast(
            choices.length === rules.categoryGroups.length
              ? `${id} is listed under every specialization group (§4.4.2) — pick whichever group you still need.`
              : `${id} is listed under ${choices.length} specialization groups (§4.4.2) — pick whichever you still need.`,
          );
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
        const institution = canonicalUniversityName((institutionInput as HTMLInputElement).value);
      if (institution) entry.institution = institution;
        const level = (levelSel as HTMLSelectElement).value;
        if (level) entry.degreeLevel = level as CourseEntry['degreeLevel'];
      }
      const group = (groupSel as HTMLSelectElement).value;
      if (group && !groupField.classList.contains('hidden')) entry.assignedGroup = group as CourseEntry['assignedGroup'];
      focusAfterRender = 'course.new.id'; // ready for the next course
      // A Notre Dame course dated before the entry term is coursework from an
      // earlier Notre Dame degree, whoever typed it (2026-09-09). The import
      // path has always re-filed those; a hand-typed one used to stay program
      // coursework for good, earning §4.2 credits, §4.3 residence and §4.4.2
      // specialization it cannot earn.
      let refiled = false;
      update((s) => {
        s.courses.push(entry);
        refiled = reclassifyNotreDameCourses(s).toPrior > 0;
        if (refiled) derivePriorMs(s);
      });
      // The form empties itself and the report headline often does not change,
      // so without this the click had no visible effect at all (2026-09-08).
      toast(
        `${id} added to your coursework` +
          (refiled ? ` — dated before ${termLabel(student.entryTerm)}, so it is filed as coursework from before you entered the program` : '') +
          '.',
      );
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
  function courseTable(courseLines: CourseLine[], entries: { c: CourseEntry; index: number }[]): HTMLElement {
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
      // The sheet's `notes` are the DGS's working notes and students do not
      // see them (DGS 2026-09-09) — the course-rules page dropped them that
      // day, and this tooltip was missed. It was the more misleading of the
      // two: a Ph.D. student hovering a bridge course was shown a note about
      // the MSCSE ("§3.6 — transition (bridge) courses do not count toward the
      // MSCSE"), which is true and about someone else's degree (2026-09-10).
      // The line's colour (DGS request 2026-09-06): green = earns credit or a
      // core area now, amber = in progress or counted only until an approval,
      // red = earns nothing. A shape per colour, and a spoken word, so the
      // meaning does not rest on colour alone (WCAG 1.4.1).
      const countsCell = el('td', { class: 'counts cell-note' }, ...(line ? [statusMark(line.mark), line.text] : []));
      // One course routinely serves several requirements, and the sentence
      // above names only the credit pool (DGS request 2026-09-08). List the
      // rest, each linking to its card, and say which are still conditional.
      for (const when of ['now', 'later'] as const) {
        const rows = (line?.counts ?? []).filter((x) => x.when === when);
        if (rows.length === 0) continue;
        const list = el('div', { class: `counts-toward ${when}` }, el('span', { class: 'counts-toward-label' }, when === 'now' ? 'Counts toward: ' : 'Will count toward: '));
        rows.forEach((r, i) => {
          if (i > 0) list.append(el('span', { class: 'sep', 'aria-hidden': 'true' }, ' · '));
          // The short name in the list, the full requirement title on hover.
          list.append(el('a', { class: 'req-link', href: `#req-${r.id.replace(/[^a-z0-9]+/gi, '-')}`, title: r.long }, r.title));
        });
        countsCell.append(list);
      }
      const rowChoices = rule ? groupsOf(rule, rules) : [];
      if (rowChoices.length > 1 && student.program === 'phd') {
        const sel = el('select', {
          'aria-label': `Specialization group for ${c.courseId}`,
          'data-key': `course.${index}.group`,
          onchange: (e) =>
            update((s) => {
              const v = (e.target as HTMLSelectElement).value;
              s.courses[index]!.assignedGroup = (v || undefined) as CourseEntry['assignedGroup'];
            }),
        });
        // Which group is worth picking depends on what the student's OTHER
        // courses already cover (DGS request 2026-09-08): the engine works
        // that out, and the options say so rather than leaving a bare list.
        // Only the groups this course is listed under (2026-09-08) — a course
        // named for two groups must not offer the other three.
        const helpful = new Set((groupChoices[c.courseId] ?? []).filter((g) => rowChoices.includes(g)));
        // Short forms in this column (DGS 2026-09-08): the full names do not
        // fit a dropdown beside a course, and the glossary keeps them in full.
        const groupName = (g: string) => shortName(rules.categoryGroups.find((x) => x.code === g)?.name ?? g);
        sel.append(option('', 'Assign group…', !c.assignedGroup));
        // Two headings rather than a note on each option: the closed dropdown
        // then shows the plain group name, and opening it shows which choices
        // would actually help (2026-09-08).
        const needed = rowChoices.filter((g) => helpful.has(g));
        const covered = rowChoices.filter((g) => !helpful.has(g));
        if (needed.length > 0 && covered.length > 0) {
          const box = (label: string, codes: readonly string[]): HTMLElement => {
            const grp = el('optgroup', { label });
            for (const g of codes) grp.append(option(g, groupName(g), c.assignedGroup === g));
            return grp;
          };
          sel.append(box('Groups you still need', needed), box('Already covered by another course', covered));
        } else {
          for (const g of rowChoices) sel.append(option(g, groupName(g), c.assignedGroup === g));
        }
        countsCell.append(el('div', {}, sel));
        const names = [...helpful].map(groupName);
        if (names.length > 0 && !(c.assignedGroup && helpful.has(c.assignedGroup))) {
          countsCell.append(
            el(
              'div',
              { class: 'group-hint' },
              `This course can count for any group (§4.4.2). ${
                names.length === 1
                  ? `Choose ${names[0]} — it is the group your other courses do not cover.`
                  : `Choose one your other courses do not cover: ${names.join(', ')}.`
              }`,
            ),
          );
        }
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
            toastWithAction(
              `${removed.courseId} removed.`,
              'Undo',
              () => update((s) => void s.courses.splice(Math.min(index, s.courses.length), 0, removed)),
              { focusKey: `course.${index}.remove` },
            );
          },
        },
        '✕',
      );
      const row = el(
        'tr',
        { class: countsNothing ? 'dropped' : '' },
        nameCell,
        // Short form in the cell, full name as the tooltip (DGS 2026-09-07).
        el('td', { class: 'cell-meta', 'data-label': 'Term' }, el('abbr', { class: 'term', title: termLabel(c.term) }, termShort(c.term))),
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
    return el('div', { class: 'table-scroll plain', tabindex: '0', role: 'region', 'aria-label': `${entries[0]?.c.institution ?? 'ND'} course table (scrolls sideways on narrow screens)` }, table);
  }

  // ---------- milestones + attestations ----------

  // "Ask the Grad Admin to process" (DGS request 2026-09-06 evening): the
  // other half of the two roles. The DGS decides eligibility (the review
  // request above); the Grad Admin processes what has been decided and keeps
  // the official record. Placed after the milestones, whose dates it reports.
  function askGradAdminCard(report: ReturnType<typeof audit>): HTMLElement {
    const built = gradAdminRequest(report, student, rules, { todayIso, entryTerm: termLabel(student.entryTerm), priorStudy: PRIOR_LABELS[student.priorMs], gpa: student.gpa });
    const n = built.items.count;
    const label = 'Copy processing request for the Grad Admin';
    const attrs = { class: 'btn', 'data-key': 'gradadmin.copy' };
    const button =
      n === 0
        ? inactiveButton(
            attrs,
            'Nothing to process yet — this button becomes active as soon as any requirement is met, or a transfer credit the DGS has ruled transferable, a milestone date, or the MSCSE along the way appears in your record.',
            toast,
            label,
          )
        : el(
            'button',
            {
              ...attrs,
              onclick: () => {
                // The self-check file goes with the request (DGS 2026-09-06
                // evening): save it now, and the steps say to attach it.
                exportFile(student);
                void copyDialog({
                  what: 'Processing request',
                  recipient: { role: GRAD_ADMIN.role, name: GRAD_ADMIN.name, email: GRAD_ADMIN.email, cc: { role: DGS.role, name: DGS.name, email: DGS.email } },
                  subject: built.subject,
                  text: built.text,
                  html: built.html,
                  steps: [
                    { text: 'Attach your ORIGINAL transcripts as PDFs (Bachelor’s / Master’s / Ph.D. — whichever apply).', emphasis: true },
                    { text: `Attach the self-check file that was just saved to your downloads: ${selfCheckFileName(student.program)}. (If no download started, use “Save to a file” in the card “Your data stays in this browser”.)`, emphasis: true },
                  ],
                  returnFocusKey: 'gradadmin.copy',
                });
              },
            },
            label,
          );
    return el(
      'section',
      { class: 'card grad-admin-request' },
      el('h2', {}, 'Ask the Grad Admin to process ', el('span', { class: 'chip-note' }, `${n} item${n === 1 ? '' : 's'}`)),
      el(
        'p',
        { class: 'hint' },
        el('strong', {}, 'Two people, two jobs. '),
        'The DGS decides eligibility by the course rules — that is what the review request above asks for. The Grad Admin (',
        `${GRAD_ADMIN.name}, `,
        mailto(GRAD_ADMIN.email),
        ') processes what has been decided and keeps the official record: transfer credit (§5.2), the qualifier form (§4.4), exam and defense forms (§3.4, §4.5–4.7), the MSCSE along the way (§4.5) — and the requirements you have met so far. Processing happens only by email: the button copies this request and saves your self-check file; email both to the Grad Admin with the DGS in cc, and attach your original transcripts. The page itself sends nothing.',
      ),
      ...built.items.lines.map((text) => el('div', { class: 'review-line' }, text)),
      n === 0 ? el('p', { class: 'hint' }, 'Nothing to process yet.') : null,
      el('div', { class: 'save-buttons' }, button),
    );
  }

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
        dateField('Qualifier completion form filed with the Grad Admin (DGS office, §4.4)', 'qualifierFormFiled'),
        dateField('Oral Candidacy Exam (OCE) passed (§4.5)', 'candidacyPassed'),
        dateField('Dissertation approved for defense by all readers (§4.6)', 'dissertationApprovedForDefense'),
        dateField('Dissertation defense passed (§4.7)', 'defensePassed'),
      );
    }

    card.append(el('h2', { class: 'mt' }, 'Approvals you already have'));
    card.append(
      el('p', { class: 'hint' }, 'Tick only what has actually been approved — this is a self-check; the DGS decides, and the Grad Admin holds the real record.'),
      attestation('My advisor approved my plan of study (§3.2/§4.2)', a.advisorApprovedPlan, (v, s) => (s.attestations.advisorApprovedPlan = v)),
      attestation('The DGS approved my course(s) below the 60000 level (§3.2/§4.2)', a.dgsApproved4xxxx, (v, s) => (s.attestations.dgsApproved4xxxx = v)),
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
        cancelUndo();
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
              const built = advisorSummary(report, { todayIso, entryTerm: termLabel(student.entryTerm), priorStudy: PRIOR_LABELS[student.priorMs], gpa: student.gpa });
              void copyDialog({
                what: 'Summary for your advisor',
                recipient: { role: 'Your advisor', name: student.milestones.advisorName ?? 'name not entered under Milestones' },
                subject: built.subject,
                text: built.text,
                html: built.html,
                returnFocusKey: 'save.copy',
              });
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
    const details = el('details', { class: 'card diagnostics', 'data-key': 'diagnostics' });
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
        '. Some requirements depend on approvals this page cannot see: advisor and DGS sign-off, transfer-credit recommendations, and Graduate School deadlines. Deadlines are shown by semester and are approximate; the registrar’s calendar sets the exact dates. Eligibility is determined by the DGS; processing and the official record are the Grad Admin’s — confirm with them before you rely on it.',
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
        'Everything you enter — and any transcript PDF you upload — is processed locally in this browser and saved only on this computer. Nothing is transmitted to the University or to any third party (the page only reads the public course-rules sheet, and asks this site’s own server for the current date at Notre Dame), so your FERPA-protected education records remain under your control.',
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
    // Loading the example also switches the report to Ph.D. §4, which is a
    // surprise for an M.S. student who pressed it to see what the tool does.
    if (
      (student.courses.length > 0 || student.program !== 'phd') &&
      !window.confirm('Load the example Ph.D. student? This replaces what is on the page and switches the report to Ph.D. §4.')
    ) {
      return;
    }
    cancelUndo(); // a stale Undo would splice old rows into the replaced record
    student = {
      schemaVersion: 1,
      isExample: true,
      program: 'phd',
      entryTerm: { season: 'fall', year: 2026 },
      // The example is a complete record: the bachelor's term is required
      // (2026-09-07), so leaving it out made the demo warn about itself.
      bachelorsAwarded: { season: 'spring', year: 2026 },
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
    cancelUndo();
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
