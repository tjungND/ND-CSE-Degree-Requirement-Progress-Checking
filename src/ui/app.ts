// The student-facing app: standing form, course table with sheet-driven
// autocomplete, milestone dates, attestations, and the live report.
// All rule logic lives in src/engine/ — this file only collects input and renders.
import type { NotreDameNow } from '../data/clock.ts';
import { canonicalCourseId, resolveRuleRow } from '../data/assemble.ts';
import { findExternalRule, isNotreDameInstitution } from '../data/external.ts';
import { CORE_TITLE_RE } from '../engine/core-title.ts';
import { classify, priorNdUndergraduateCanCount } from '../engine/allocate.ts';
import type { Rules } from '../data/types.ts';
import { coursesNeedingDgsReview, reviewRequestSummary, undergraduateGraduateCourseworkFlag, type PendingDgsReview } from '../engine/review.ts';
import { shortName } from '../engine/short-names.ts';
import { audit } from '../engine/audit.ts';
import { GRADES, GRADE_POINTS } from '../engine/grades.ts';
import { termIndex, termLabel, termOfDate, termShort } from '../engine/term.ts';
import type { CourseEntry, CourseLine, Program, Season, Student, Term } from '../engine/types.ts';
import { parseTranscript, type DegreeAwarded, type EntryTermInference, type ParsedCourse } from '../transcript/parse.ts';
import { clear, el, inactiveButton, option, PREVIEW_OPEN_NOTE } from './dom.ts';
import { siblingAnchorAttrs } from './sibling-links.ts';
import { ALPHA_LINE, BETA_NOTICE, BETA_SCOPE_NOTICE, PRIVACY_LINE, RULES_ACCURACY_NOTICE, handbookLink, rulesDateLine } from './handbook.ts';
import { DGS, GRAD_ADMIN, LICENSE_URL, REPO_URL, applyContactOverrides, contactCard, mailto, reportToDgs, deciderContact } from './contacts.ts';
import { embedTargetAttrs, isEmbedded, lastInteractionTop, openFullPageLink, placeInFrame } from './embed.ts';
import { deciderTitle } from '../engine/decider.ts';
import {
  BACHELORS_YEAR_RANGE,
  COURSE_CREDITS_RANGE,
  GPA_RANGE,
  TERM_YEAR_RANGE,
  type NumberRange,
  formatValue,
  inRange,
  inputRefusal,
  rangeSpan,
} from '../engine/ranges.ts';
import { inferMsOption } from '../engine/requirements/mscse.ts';
import { DEGREE_SLOTS, importsBusy, priorTranscriptSection, ndRowLabel } from './external-upload.ts';
import { statusMark } from './marks.ts';
import { deriveNdMasters, derivePriorMs, hasPriorGraduateStudy, isNotreDameCourse, isPriorNd, priorNdDegreeLevel, reclassifyNotreDameCourses } from './prior-nd.ts';
import { applyDeciderRule, applyFirstMentionRule } from './first-mention.ts';
import { canonicalUniversityName, knownUniversities } from './university-name.ts';
import { confirmDialog, copyDialog } from './copy-dialog.ts';
import { gradAdminRequest } from './grad-admin-request.ts';
import { advisorSummary } from './advisor-summary.ts';
import { renderReport, renderSummary, scoreLine } from './report.ts';
import { sheetSourceLine, sheetSourceNote } from './sheet-source.ts';
import {
  type Refusal,
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

/** What "Load example" fills in BESIDE the courses. Kept here so removing the
 * example rows can take these back too — but only where the student has not
 * since changed them, since a value they edited is theirs (R5, 2026-09-18). */
const EXAMPLE_MILESTONES: Student['milestones'] = { advisorIdentified: '2026-09-10', advisorName: 'Prof. Example' };
const EXAMPLE_ATTESTATIONS: Student['attestations'] = { advisorApprovedPlan: true };

/** The §4.4.2 groups a course may satisfy, in the Categories tab's own order
 * (DGS 2026-09-08 — a sheet cell may name one group, several, or `any`).
 * Empty when the course is ineligible or the DGS has not said. */
function groupsOf(rule: { categoryGroups?: string[] }, rules: Rules): string[] {
  const listed = rule.categoryGroups;
  if (!listed || listed.length === 0) return [];
  // In the Categories tab's own order, and only groups it actually defines —
  // a course listed everywhere names all five (the `any` keyword was retired
  // on 2026-09-18).
  const all = rules.categoryGroups.map((g) => g.code);
  return all.filter((g) => listed.includes(g));
}


export function startApp(root: HTMLElement, rules: Rules, today: NotreDameNow): void {
  // Sheet-driven contacts (2026-09-04): must run before ANYTHING renders —
  // the consent notice below already shows the DGS's name and address.
  applyContactOverrides(rules.parameters);
  /** What a saved record on this device carried that the app will not keep
   * (R1, 2026-09-18) — shown once the page is up, and put back in the field
   * it came from, so a figure that vanished is never unexplained. */
  const loadRefusals: Refusal[] = [];
  const saved = loadLocal(loadRefusals);
  let student: Student = saved ?? emptyStudent();
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
  // The program choice lives here (blue-team B2, 2026-09-18). It used to be a
  // SILENT default — emptyStudent() says `program: 'phd'` and nothing asked —
  // so an MSCSE student who missed the segmented control at the top read
  // seventeen Ph.D. checks (dissertation readers, the OCE, the eight-year
  // limit) and a footer saying 0 of 17 met. This dialog is already a forced
  // interaction on every visit; asking here removes the whole failure class.
  // A returning student's answer is pre-selected, so it stays one click.
  const programRadios = el('div', { class: 'radios consent-program' });
  let chosenProgram: Program | undefined = saved?.program;
  for (const [value, label] of [
    ['phd', 'Ph.D. in Computer Science and Engineering (Handbook §4)'],
    ['mscse', 'M.S. in Computer Science and Engineering — MSCSE (Handbook §3)'],
  ] as [Program, string][]) {
    const radio = el('input', {
      type: 'radio',
      name: 'consent-program',
      value,
      'data-key': `consent.program.${value}`,
      onchange: () => {
        chosenProgram = value;
        agreeButton.removeAttribute('disabled');
      },
    }) as HTMLInputElement;
    radio.checked = saved?.program === value;
    programRadios.append(el('label', { class: 'radio' }, radio, ` ${label}`));
  }
  // Nothing is pre-selected for a student with no record on this device, and
  // the button stays inactive until they answer — the report must not render
  // against a program nobody chose.
  if (!saved) agreeButton.setAttribute('disabled', 'disabled');
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
      el('fieldset', { class: 'field group consent-program-group' }, el('legend', { class: 'label' }, 'Which degree are you working toward?'), programRadios),
      agreeButton,
    ),
  );
  const closeConsent = (): void => {
    // The answer takes effect BEFORE the dialog goes, so that by the time
    // anything can observe the notice gone, the page behind it already shows
    // the chosen program — otherwise a script (or a fast reader) can act on a
    // page that is about to re-render underneath them. Escape closes the notice
    // — it always has, and drive-a11y.mjs checks it — and leaves the program as
    // it was, which the segmented control at the top still shows and can still
    // change (B2, 2026-09-18).
    if (chosenProgram && chosenProgram !== student.program) {
      update((s) => void (s.program = chosenProgram!));
    }
    if (consentDialog.open) consentDialog.close();
    consentDialog.remove();
    root.querySelector<HTMLElement>('.masthead h1')?.focus();
  };
  agreeButton.addEventListener('click', closeConsent);
  consentDialog.addEventListener('close', closeConsent);
  document.body.append(consentDialog);
  placeInFrame(consentDialog); // embed mode: at the top of the frame, not the middle of a tall page (DGS 2026-09-16)
  if (typeof consentDialog.showModal === 'function') {
    consentDialog.showModal();
    agreeButton.focus();
  } else {
    // A browser without <dialog> (none current) still gets the notice, unblocking.
    consentDialog.setAttribute('open', '');
  }

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

  // ---------- numbers the form refuses (interface review R1, 2026-09-18) ----------
  //
  // The `min`/`max` on every number box used to be decorative: nothing read
  // `validity`, nothing clamped, and a GPA of 35 went to localStorage and came
  // back as "Cumulative GPA 35.00 meets the 3.0 minimum" under a green Met
  // pill. An impossible value is now refused ON COMMIT — the typed text stays
  // in its field to be corrected, and `student` never sees it.
  //
  // render() rebuilds the page from the record on every change, so the refusal
  // lives out here, by `data-key`, or the rebuild would quietly put the last
  // good value back and drop the message.
  const refusedValues = new Map<string, { text: string; message: string }>();
  /** The `data-key`s a refusal can be shown back in — every box `rangedNumber`
   * builds. A refusal for anything else is reported but has no field to sit in. */
  const FORM_REFUSAL_KEYS = new Set(['courses.gpa', 'standing.year', 'standing.bachelors.year']);

  /** A number a saved record or a transcript carried that the app will not
   * keep lands in the SAME refused state as one typed into the box: shown back
   * in its own field, marked invalid, with the sentence beside it. */
  const applyRefusals = (refusals: Refusal[]): void => {
    // Only the refusals that belong to a box on this page go back into one;
    // the rest (a course's credits, which the coursework table shows as text)
    // are told in their own toast and live on the course's own line.
    for (const r of refusals) {
      if (FORM_REFUSAL_KEYS.has(r.key)) refusedValues.set(r.key, { text: r.text, message: r.message });
    }
  };

  /** A number input whose range is enforced, with its own persistent message
   * (the `.field-error` pattern the course-number box has used since the
   * 2026-09-05 usability review — item 6: a problem stays beside its field,
   * it does not flash past in a toast).
   *
   * `commit` is called only with a value inside the range; an empty box
   * commits `undefined` when `allowEmpty`, and is refused when it is not. */
  function rangedNumber(opts: {
    key: string;
    range: NumberRange;
    value: string;
    allowEmpty: boolean;
    attrs?: Record<string, string>;
    commit: (value: number | undefined) => void;
  }): { input: HTMLInputElement; error: HTMLElement } {
    const errorId = `${opts.key.replace(/[^\w-]+/g, '-')}-error`;
    const refused = refusedValues.get(opts.key);
    const error = el('p', { class: 'field-error hidden', id: errorId, role: 'alert' });
    const input = el('input', {
      type: 'number',
      min: String(opts.range.min),
      // No `max` attribute where the range has no ceiling (years, DGS 2026-09-18).
      ...(opts.range.max === undefined ? {} : { max: String(opts.range.max) }),
      'data-key': opts.key,
      ...(opts.attrs ?? {}),
      value: refused ? refused.text : opts.value,
    }) as HTMLInputElement;
    const describedBy = opts.attrs?.['aria-describedby'];
    const show = (message: string): void => {
      error.textContent = message;
      error.classList.remove('hidden');
      input.setAttribute('aria-invalid', 'true');
      input.setAttribute('aria-describedby', describedBy ? `${errorId} ${describedBy}` : errorId);
    };
    const clear = (): void => {
      error.textContent = '';
      error.classList.add('hidden');
      input.removeAttribute('aria-invalid');
      if (describedBy) input.setAttribute('aria-describedby', describedBy);
      else input.removeAttribute('aria-describedby');
    };
    if (refused) show(refused.message);
    // Typing is not committing: the message stays until the student leaves the
    // box with a value the app can keep, so it is still there to read.
    input.addEventListener('change', () => {
      const text = input.value.trim();
      if (text === '' && opts.allowEmpty) {
        refusedValues.delete(opts.key);
        clear();
        opts.commit(undefined);
        return;
      }
      const n = Number(text);
      if (text === '' || !inRange(n, opts.range)) {
        const message = inputRefusal(input.value, opts.range);
        refusedValues.set(opts.key, { text: input.value, message });
        show(message);
        toast(message); // the polite live region, so it is heard as well as seen
        return; // NOT written to the record, and NOT saved
      }
      refusedValues.delete(opts.key);
      clear();
      opts.commit(n);
    });
    return { input, error };
  }

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
  // Embedded, a fixed bottom stack would sit at the end of a tall frame: the
  // stack goes just below where the student last acted instead (2026-09-16).
  const placeToasts = (): void => {
    if (!isEmbedded()) return;
    toastStack.style.top = `${lastInteractionTop() + 48}px`;
  };
  let plainToast: HTMLElement | undefined;
  let plainToastTimer: number | undefined;
  const toast = (msg: string): void => {
    plainToast?.remove();
    const t = el('div', { class: 'toast show' }, msg);
    plainToast = t;
    placeToasts();
    toastStack.prepend(t);
    window.clearTimeout(plainToastTimer);
    plainToastTimer = window.setTimeout(() => {
      t.remove();
      if (plainToast === t) plainToast = undefined;
    }, 4000);
  };
  /** A notice that a choice was made for the student (2026-09-12): its own
   * slot, so the plain toast that follows the same action ("… added to your
   * coursework") does not replace it. Stays 12 s. */
  let noticeToast: HTMLElement | undefined;
  const notice = (msg: string): void => {
    noticeToast?.remove();
    const t = el('div', { class: 'toast show auto-notice' }, msg);
    noticeToast = t;
    placeToasts();
    toastStack.prepend(t);
    window.setTimeout(() => {
      t.remove();
      if (noticeToast === t) noticeToast = undefined;
    }, 12000);
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
    placeToasts();
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
  /** Watches the two score headlines for the sticky bar (P-66); one per render. */
  let scoreObserver: IntersectionObserver | undefined;
  /** A visually hidden polite live region, created once OUTSIDE the root so
   * the rebuild never re-creates it (a re-created region is not announced):
   * screen-reader users hear the new headline after each change. */
  const srStatus = el('div', { class: 'visually-hidden', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' });
  document.body.append(srStatus);

  /** The footer's disclosure ("Where the rules come from"; "What is still
   * being tested" went with P-3, 2026-09-19) prints OPEN and return to what the student had (trim
   * review 2026-09-18, P-71): closed, they printed as two bare headings.
   * Only the ones this handler opened are closed again; restoreFocus reads
   * the open state from the DOM, so a later re-render keeps the screen state. */
  window.addEventListener('beforeprint', () => {
    document.querySelectorAll<HTMLDetailsElement>('footer.legal details:not([open])').forEach((d) => {
      d.dataset.printOpened = '';
      d.open = true;
    });
  });
  window.addEventListener('afterprint', () => {
    document.querySelectorAll<HTMLDetailsElement>('footer.legal details[data-print-opened]').forEach((d) => {
      d.open = false;
      delete d.dataset.printOpened;
    });
  });

  /** The sticky score bar (phones, ≤900 px) says what the score headline
   * says; while either headline — the phone summary's at the top or the
   * report's — is on screen, the bar is hidden (`.score-on-screen`,
   * style.css) and it returns as soon as the score scrolls off (trim review
   * 2026-09-18, P-66). The HEADLINES are watched, not the blocks: the summary
   * block's meters and jump link are often on screen after its score line
   * has gone. The previous render's observer is dropped with its nodes. */
  function watchScoreHeadlines(): void {
    scoreObserver?.disconnect();
    scoreObserver = undefined;
    const bar = root.querySelector<HTMLElement>('.sticky-score');
    const headlines = [...root.querySelectorAll<HTMLElement>('.summary-mobile .headline, .audit .scorehead .headline')];
    if (!bar || headlines.length === 0 || typeof IntersectionObserver === 'undefined') return;
    const onScreen = new Set<Element>();
    scoreObserver = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) onScreen.add(e.target);
        else onScreen.delete(e.target);
      }
      bar.classList.toggle('score-on-screen', onScreen.size > 0);
    });
    for (const h of headlines) scoreObserver.observe(h);
  }

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

  /** Choices the page makes for the student (DGS 2026-09-12): whenever the
   * record itself shows the best answer, fill it in, say so in a toast, and
   * leave the control for the student to change. Only an UNSET choice is
   * filled, so a student's own pick is never overwritten. Returns the notices
   * to show — a non-empty list means the record changed and must be re-audited. */
  function autoSelect(report: ReturnType<typeof audit>): string[] {
    const notices: string[] = [];
    if (student.program === 'mscse' && (student.msOption ?? 'undecided') === 'undecided') {
      const inferred = inferMsOption(student);
      if (inferred) {
        student.msOption = inferred;
        notices.push(
          inferred === 'project'
            ? 'Project or thesis option set to “M.S. project” from your record (a Master’s project course or an accepted project report). Change it under Your standing if that is wrong.'
            : 'Project or thesis option set to “M.S. thesis” from your record (thesis direction, readers’ approval or a defense). Change it under Your standing if that is wrong.',
        );
      }
    }
    // 4+1 read off the transcript (F7, 2026-09-12): Notre Dame coursework
    // registered at the GRADUATE level yet dated inside the bachelor's degree
    // is the Integrated program's signature — a regular bachelor's registers
    // its 60000-level electives as undergraduate rows.
    if (student.integratedBsMs === undefined && student.bachelorsAwarded !== undefined) {
      const signature = student.courses.find(
        (c) => isNotreDameCourse(c) && c.registeredLevel === 'graduate' && termIndex(c.term) <= termIndex(student.bachelorsAwarded!),
      );
      if (signature) {
        student.integratedBsMs = true;
        student.integratedBsMsInferred = { how: `your Notre Dame transcript, which registers ${signature.courseId} at the graduate level inside your bachelor’s degree` };
        notices.push('Integrated B.S. + M.S. (4+1) set to “Yes” — your Notre Dame transcript registers graduate-level coursework inside your bachelor’s degree. Change it under Your standing if that is wrong.');
      }
    }
    if (student.program === 'phd') {
      const best = report.requirements.find((r) => r.id === 'phd.qualifier.categories')?.groupAssignments ?? {};
      const filled: string[] = [];
      for (const c of student.courses) {
        const group = best[c.courseId];
        if (!group || c.assignedGroup) continue;
        c.assignedGroup = group as CourseEntry['assignedGroup'];
        filled.push(`${c.courseId} → ${shortName(rules.categoryGroups.find((x) => x.code === group)?.name ?? group)}`);
      }
      if (filled.length > 0) {
        notices.push(
          `Specialization group chosen automatically to cover the most distinct groups (§4.4.2): ${filled.join('; ')}. You can change it next to the course.`,
        );
      }
    }
    return notices;
  }

  function render(): void {
    const memo = rememberFocus();
    let report = audit(student, rules, todayIso);
    const autoNotices = autoSelect(report);
    if (autoNotices.length > 0) {
      saveLocal(student);
      report = audit(student, rules, todayIso);
      notice(autoNotices.join(' '));
    }
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
      // → main (notices, inputs, report, footer); the skip link jumps a
      // keyboard user straight to the report.
      el('a', { class: 'skip-link', href: '#report' }, 'Skip to the report'),
      masthead(),
      el(
        'main',
        { id: 'main' },
        el(
          'p',
          { class: 'print-header' },
          `Self-check printed on ${todayIso} — ${student.program === 'mscse' ? 'M.S. in CSE (§3)' : 'Ph.D. (§4)'}, entered ${termLabel(student.entryTerm)} — not an official audit; the DGS decides eligibility, the Grad Admin processes it.`, // "decides", as everywhere else (trim review 2026-09-18, P-60)
        ),
        // The example is saved like any other record, so say whose it is until
        // the student takes it back (2026-09-08). What it says is counted from
        // the rows themselves (R5, 2026-09-18): "Nothing here came from you"
        // was sticky, so a student who loaded the example and then added one
        // real course was told none of it was theirs — and offered a button
        // that would have cleared their course along with the demo.
        exampleBanner(),
        noticeStrip(),
        // The universities the ExternalCourses tab knows, for both University
        // boxes (manual course form, previous-transcript preview) — one
        // datalist per page (2026-09-06 evening).
        el('datalist', { id: 'known-universities' }, ...knownUniversities(rules.external).map((u) => el('option', { value: u }))),
        rules.source === 'snapshot' ? snapshotBanner() : null,
        // Phones and small tablets (2026-09-05, review item 2): the result
        // first, then the inputs, then the full report — plus a sticky score
        // bar with jump links (both hidden on wide screens by CSS).
        // On a narrow screen the report's summary sits ABOVE the inputs, which
        // is right once there is something to summarise — and 252 px of
        // "Getting started" between the student and the first control when
        // there is not (blue-team B1, 2026-09-18). An untouched record shows it
        // at the bottom with the rest of the report instead.
        untouched ? null : renderSummary(report, untouched),
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
            saveCard(),
            diagnosticsCard(),
          ),
          el(
            'div',
            { class: 'audit-col', id: 'report', tabindex: '-1', 'aria-label': 'Your report' },
            report.warnings.length > 0
              ? el('div', { class: 'warnings', role: 'note', 'data-keep-dgs': '' }, ...report.warnings.map((w) => el('div', {}, `⚠ ${w}`)))
              : null,
            renderReport(report, untouched),
            // Clear is at the top of the page, which is the wrong end for
            // someone who has just finished reading their report on a shared
            // machine (R7, 2026-09-18).
            untouched
              ? null
              : el(
                  'div',
                  { class: 'card finish-card', role: 'note' },
                  el('strong', {}, 'Finished on a shared computer? '),
                  'Your record stays in this browser until you clear it — save it to a file first if you want to keep it.',
                  el(
                    'div',
                    { class: 'save-buttons' },
                    el('button', { class: 'btn', 'data-key': 'report.save', onclick: () => exportFile(student) }, 'Save to a file'),
                    // The summary is a view of the report, so its button sits
                    // where the report ends, not in the storage card (trim
                    // review 2026-09-18, P-72); same key, dialog and wording.
                    advisorSummaryButton(report),
                    el('button', { class: 'btn', 'data-key': 'report.clear', onclick: clearAll }, 'Clear'), // same label as the button at the top: one action, one name (DGS 2026-09-19, P-63)
                  ),
                ),
          ),
          // The footer is the layout grid's third child (DGS 2026-09-19): on a
          // wide screen it sits under the inputs column, in the space the
          // longer report column used to leave empty; on a phone the single
          // column keeps it last. Inside <main> it is no longer a contentinfo
          // landmark — a deliberate trade for the placement.
          footer(),
        ),
        el(
          'nav',
          { class: 'sticky-score', 'aria-label': 'Your score, and jumps between inputs and report' },
          el('span', { class: 'sticky-text' }, scoreLine(report)),
          el('a', { href: '#inputs' }, 'Inputs ↑'),
          el('a', { href: '#report' }, 'Report ↓'),
        ),
      ),
      ].filter((n): n is HTMLElement => n !== null),
    );
    // "Oral Candidacy Exam (OCE)" in full once, then "OCE" (DGS 2026-09-06
    // evening) — text nodes only, in document order, before focus is restored.
    applyFirstMentionRule(root);
    applyDeciderRule(root, student.program); // DGS → ADGS for an MSCSE student (2026-09-11)
    watchScoreHeadlines();
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
    // Embedded (?embed=1), the host page already carries the ND masthead and
    // its own heading: the gold eyebrow goes and the <h1> stays only for screen
    // readers and the document outline (DGS 2026-09-16, same treatment as the
    // course-rules page). Everything else — the tabs, the tools, the notices,
    // the whole FERPA footer — stays exactly as it is.
    const embed = isEmbedded();
    return el(
      'header',
      { class: 'masthead' },
      el(
        'div',
        { class: 'masthead-main' },
        embed ? null : el('div', { class: 'eyebrow' }, 'University of Notre Dame · Computer Science and Engineering'),
        el('h1', embed ? { tabindex: '-1', class: 'visually-hidden' } : { tabindex: '-1' }, 'Graduate Degree Requirement Self-check Tool'),
        // Embedded, the WordPress page carries its own introduction: none of
        // the masthead text is shown (DGS 2026-09-16, "get rid of the texts at
        // the top"). The storage warning below stays — it is a safety note.
        ...(embed
          ? []
          : [
              el(
                'p',
                { class: 'sub' },
                // No "enter your coursework" above the card that imports it;
                // four lines instead of six at 390 px (trim review 2026-09-18, P-25).
                'See where you stand, requirement by requirement, against the ',
                handbookLink(),
                '; every check cites its section. The courses that count are on the ',
                el('a', siblingAnchorAttrs('course-rules', window.location.search, embedTargetAttrs()), 'course rules page'),
                '.',
              ),
              el('p', { class: 'effective' }, rulesDateLine(rules, termLabel(termOfDate(todayIso)), todayIso)),
              // The rules spreadsheet, linked with its faculty-only note (DGS, 2026-09-04).
              sheetSourceLine(),
            ]),
        // Framed, this tool is saving into the FRAME's storage, which is not the
        // same store as the tool opened on its own — and Safari blocks it for an
        // embedded page outright. The work is never lost (the file save always
        // works), but the student has to be told where it is going before they
        // spend an hour on it (DGS 2026-09-16).
        embed
          ? el(
              'p',
              { class: 'banner embed-storage', role: 'note' },
              // 55 words → 30 (embed review 2026-09-19): the fact, the risk,
              // the two ways out — the first thing on the page has to be short.
              el('strong', {}, 'This is the tool inside another page. '),
              'Your entries may not be here when you come back (Safari saves nothing for an embedded page). Use ',
              el('strong', {}, '“Save to a file”'), // the button's label since 2026-09-03 (trim review 2026-09-18, P-62)
              ', or ',
              openFullPageLink('open the full page'),
              '.',
            )
          : null,
      ),
      // The Who-to-contact card is at the END of the page (B1, 2026-09-18).
      // It was three reference links and three mailto links above the first
      // control a student could type into, and the report already names people
      // by role where they matter. Embedded mode has put it in the footer
      // since 2026-09-16; now every mode does.
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
  // Two strips, not one (DGS 2026-09-19): red for the alpha status, green for
  // privacy. Each is ONE line above the fold (blue-team B1, 2026-09-18 — the
  // first control must stay on the first screen) with its full paragraph in
  // a Details disclosure; both paragraphs are also in the footer and the
  // copied summary.
  function noticeStrip(): HTMLElement {
    const alphaDetails = el(
      'details',
      { class: 'notice-details', 'data-key': 'notice.details' },
      el('summary', {}, 'Details'),
      el(
        'p',
        { class: 'notice-full beta' },
        el('strong', {}, 'Alpha version under testing. '),
        BETA_NOTICE,
        ' ',
        // The link parenthetical folds into the bold sentence here (trim
        // review 2026-09-18, P-39); the constant keeps its period for the
        // footer and the copied summary, which render in their own order.
        el('strong', {}, RULES_ACCURACY_NOTICE.replace(/\.$/, '')),
        ' (see the ',
        el('a', siblingAnchorAttrs('course-rules', window.location.search, embedTargetAttrs()), 'course rules page'),
        '). ',
        BETA_SCOPE_NOTICE,
        ...reportToDgs(' Error reports, suggestions, and feedback are all welcome — please email'),
      ),
    );
    const privacyDetails = el(
      'details',
      { class: 'notice-details', 'data-key': 'privacy.details' },
      el('summary', {}, 'Details'),
      el(
        'p',
        { class: 'notice-full privacy' },
        el('strong', {}, 'Private by design. '),
        // The DGS's 2026-09-03 sentences plus the OCR clause, closing with the
        // approved W-P1 sentence (2026-09-18) that the save card and footer
        // also use. The five-request tally that used to follow was the
        // measurement behind W-P1 (see PRIVACY_LINE in handbook.ts), not the
        // claim (trim review 2026-09-18, P-7).
        'Everything you enter — and any transcript PDF you import, including the optional text recognition (OCR) of a scanned one — is processed and stored in this browser only. Nothing you enter is uploaded, transmitted, or stored anywhere else. The page itself loads from GitHub and reads the course rules from Google Sheets, so those two services see that someone opened the page; they never see what you enter.',
      ),
    );
    return el(
      'div',
      { class: 'notice-strips' },
      // The notice names the decider for THIS tab (ADGS on the MSCSE tab, DGS
      // on the Ph.D. tab — DGS 2026-09-15) by the same rewrite as the rest of
      // the page; the feedback address is the DGS's own and is kept as is.
      el(
        'div',
        { class: 'banner beta notice-strip', role: 'note' },
        el('p', { class: 'notice-line' }, el('strong', {}, 'Alpha — under testing. '), 'Informational only; the DGS decides.'),
        alphaDetails,
      ),
      el(
        'div',
        { class: 'banner privacy notice-strip', role: 'note' },
        el('p', { class: 'notice-line' }, el('strong', {}, 'Private by design — FERPA. '), 'Your coursework never leaves this browser.'),
        privacyDetails,
      ),
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
    // The entry term is the hinge of every deadline in §4 (and §3.3's five
    // years), so a year outside 2000–2040 is refused rather than ignored: the
    // old handler fell back to the stored year and said nothing (R1).
    const { input: yearInput, error: yearError } = rangedNumber({
      key: 'standing.year',
      range: TERM_YEAR_RANGE,
      value: String(student.entryTerm.year),
      allowEmpty: false, // a record always has an entry term
      attrs: { 'aria-label': 'Entered the program — year' },
      commit: (value) => setEntry((s) => void (s.entryTerm.year = value!)),
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
          student.program === 'phd'
            // The four deadlines are each a report row with a Deadline chip;
            // the §s stay (trim review 2026-09-18, P-11).
            ? 'The residency count (§4.3) and every deadline (§4.3, §4.4, §4.4.3, §4.5) are counted from this term.'
            : 'The residency count and the five-year limit on completing the degree (§3.3) are counted from this term.',
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
    const bsSeason = el('select', { 'aria-label': 'Bachelor’s degree awarded — semester', 'data-key': 'standing.bachelors.season' });
    for (const se of SEASONS) bsSeason.append(option(se, se[0]!.toUpperCase() + se.slice(1), (awarded?.season ?? 'spring') === se));
    const setBachelors = (year: number | undefined): void =>
      update((s) => {
        s.bachelorsAwarded = year === undefined ? undefined : { season: (bsSeason as HTMLSelectElement).value as Season, year };
        s.bachelorsAwardedInferred = undefined; // the student decided
        reclassifyNotreDameCourses(s); // prior Notre Dame rows without a registered level follow the award term
        derivePriorMs(s); // a senior-year graduate course is not a prior master's (2026-09-09)
      });
    // Empty still means "unknown" (2026-09-07); a year outside 1970–2040 no
    // longer quietly means the same thing, since the old guard (`>= 1970`,
    // no upper bound) accepted 9999 and dropped 1899 without a word (R1).
    const { input: bsYear, error: bsYearError } = rangedNumber({
      key: 'standing.bachelors.year',
      range: BACHELORS_YEAR_RANGE,
      value: awarded ? String(awarded.year) : '',
      allowEmpty: true,
      attrs: {
        'aria-label': 'Bachelor’s degree awarded — year',
        ...(awarded === undefined ? { required: 'required', 'aria-required': 'true' } : {}),
      },
      commit: setBachelors,
    });
    bsSeason.addEventListener('change', () => {
      const text = (bsYear as HTMLInputElement).value;
      const year = Number(text);
      if (text === '') return; // no year yet: the award term stays unknown, as it always has
      if (inRange(year, BACHELORS_YEAR_RANGE)) {
        setBachelors(year);
        return;
      }
      // The semester cannot be recorded without a year the app will keep, and
      // a silent no-op would leave the select showing a term the record does
      // not hold (R1, 2026-09-18): say which box is in the way.
      const refused = refusedValues.get('standing.bachelors.year');
      toast(refused ? refused.message : inputRefusal(text, BACHELORS_YEAR_RANGE));
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
            // The legend above already names the field (trim review 2026-09-18, P-23).
            : 'Required for every student, with or without a graduate degree: §5.2 counts a course as transfer credit only when it was taken after the bachelor’s degree.',
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
          // Says what the box changes, quoting the report row's title
          // (trim review 2026-09-18, P-18).
          : 'If you earned the MSCSE at Notre Dame before the Ph.D., the §4.5 “MSCSE awarded along the way” row is left out.',
      ),
    );

    // The prior-degree controls behind one line on a fresh record (trim
    // review 2026-09-18, P-65): of this card's controls a new student must set
    // two, and the prior-study answer changes nothing until a transfer course
    // exists — a previous-transcript import sets it for them. The fold is
    // OPEN, not merely openable, whenever anything could draw on §5.2:
    // graduate-level transfer coursework on the record (imported or typed —
    // the same test that drives the warning above), an answer other than
    // "none", the MSCSE box ticked, or a warning to show. Item 12 of
    // 2026-09-05 (three radios, all visible) holds inside the fold. The
    // data-key lets rememberFocus keep it open across re-renders.
    const priorOpen = priorTranscripts.length > 0 || student.priorMs !== 'none' || student.ndMasters !== undefined || priorNote !== null;
    const priorFold = el(
      'details',
      { class: 'prior-fold', 'data-key': 'standing.prior.fold' },
      el('summary', {}, 'Prior degrees (§5.2 transfer caps) — open if you hold or started a graduate degree before this program.'),
      fieldset('Prior graduate study (§5.2 transfer caps)', priorGroup),
      priorNote,
    );
    if (priorOpen) (priorFold as HTMLDetailsElement).open = true;

    const card = el(
      'section',
      { class: 'card' },
      el('h2', {}, el('span', { class: 'step-no' }, '2. '), 'Your standing ', el('span', { class: 'chip-note' }, currentSemesterChip())),
      // A fieldset with a legend (item 5): the two controls share one question.
      fieldset(enteredProgramLabel(), el('div', { class: 'pair' }, seasonSel, yearInput)),
      yearError,
      // What this field drives (item 11) — the longer note takes over while
      // the term is inferred or assumed.
      entryNote ?? el('p', { class: 'hint field-hint' }, 'Every deadline and the residency count are counted from this term.'),
      fieldset('Bachelor’s degree awarded (required)', el('div', { class: 'pair' }, bsSeason, bsYear)),
      bsYearError,
      bsNote,
      priorFold,
    );
    // Not shown once a master's transcript from ANOTHER university is on the
    // record and nothing says the student holds Notre Dame's MSCSE (DGS
    // 2026-09-13): their master's is that one, and the question would only
    // confuse. A ticked or transcript-read answer keeps the box.
    const otherMasters = student.courses.some((c) => c.origin === 'transfer' && c.degreeLevel === 'masters' && !isNotreDameCourse(c));
    if (student.program === 'phd' && (ndMs !== undefined || !otherMasters)) priorFold.append(ndMsField); // inside the fold (P-65)
    // Integrated B.S. + M.S. (4+1)? Asked only when the record has Notre Dame
    // coursework from before the entry term (DGS 2026-09-12, red-team F7):
    // a 60000-level course taken as an undergraduate earns credit only then.
    if (student.courses.some((c) => isNotreDameCourse(c) && isPriorNd(c, student.entryTerm))) {
      const fourPlusOne = radios(
        'standing.integratedBsMs',
        [
          ['yes', 'Yes — Integrated B.S. + M.S. (4+1)'],
          ['no', 'No — a regular bachelor’s'],
        ],
        student.integratedBsMs === true ? 'yes' : student.integratedBsMs === false ? 'no' : '',
        (value) =>
          update((s) => {
            s.integratedBsMs = value === 'yes';
            s.integratedBsMsInferred = undefined; // the student decided
          }),
      );
      card.append(
        fieldset('Were you in Notre Dame’s Integrated B.S. + M.S. (4+1) program? (§3.5)', fourPlusOne),
        el(
          'p',
          { class: `hint ${student.integratedBsMs === undefined ? 'warn' : ''} fourplusone-note` },
          student.integratedBsMsInferred
            ? `Set to “Yes” from ${student.integratedBsMsInferred.how}. Change it if that is wrong.`
            : student.integratedBsMs === undefined
              ? 'Not answered: your 60000-level courses from before the entry term earn no credit until you answer. A 4+1’s graduate coursework counts (§3.5); a regular bachelor’s does not, though it can still satisfy §4.4.1 core knowledge and a §4.4.2 group for the Ph.D.'
              : 'Decides whether 60000-level courses taken as an undergraduate earn MSCSE/Ph.D. credit (§3.5).',
        ),
      );
    }

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
    const box = el('fieldset', { class: 'ft-terms' }, el('legend', { class: 'label' }, `Full-time terms (for residency, ${student.program === 'mscse' ? '§3.3' : '§4.3'})`));
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
    const { input: gpaInput, error: gpaError } = rangedNumber({
      key: 'courses.gpa',
      range: GPA_RANGE,
      value: student.gpa === undefined ? '' : String(student.gpa),
      allowEmpty: true, // the GPA is optional until it is entered; §2.2 then says so
      attrs: { step: '0.01' },
      commit: (value) =>
        update((s) => {
          s.gpa = value;
          s.gpaSource = undefined; // typed by hand — no longer the transcript's figure
        }),
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
    const groups: { heading: string; bachelors: boolean; nd: boolean; entries: { c: CourseEntry; index: number }[]; hidden: number }[] = [];
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
        g = { heading, bachelors: e.c.degreeLevel === 'bachelors', nd: priorNd, entries: [], hidden: 0 };
        groups.push(g);
      }
      // Undergraduate courses (DGS request 2026-09-04): only the ones that can
      // matter are listed — a title suggesting a §4.4.1 core area, a course
      // the DGS has already ruled on, or (Notre Dame) a course the Courses tab
      // tags with a core area. The rest stay in the saved data but out of the
      // way (undergraduate credits never transfer, §5.2).
      //
      // Notre Dame's own undergraduate coursework can do more than demonstrate
      // a core area (2026-09-11): 60000-level courses count in full and CSE
      // courses below that may count inside the degree's allowance, so those
      // rows are listed too — hiding one hid a course the report was counting.
      // §4.4.1 is the Ph.D. qualifier's; an MSCSE student has no core-knowledge
      // requirement, so a core-sounding title is not a reason to list an
      // undergraduate course for them (DGS 2026-09-11).
      const qualifierApplies = student.program === 'phd';
      if (
        g.bachelors &&
        !(qualifierApplies && CORE_TITLE_RE.test(e.c.title ?? '')) &&
        !(qualifierApplies && findExternalRule(rules.external, e.c.institution ?? '', e.c.courseId)) &&
        !(qualifierApplies && priorNd && resolveRuleRow(rules, e.c.courseId, e.c.term)?.coreArea) &&
        !(priorNd && priorNdUndergraduateCanCount(e.c, resolveRuleRow(rules, e.c.courseId, e.c.term), student.program))
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
      // (The coursework card's intro sentence was removed on 2026-09-15 at the DGS's request.)
      field('Cumulative GPA (from your transcript, §2.2)', gpaInput),
      gpaError,
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
              (g.nd
                ? student.program === 'phd'
                  ? `Notre Dame coursework you took as an undergraduate is listed here when it can count toward this degree — 60000-level courses, CSE courses below that inside the allowance your degree allows, and anything relevant to the Algorithms, Operating Systems, and Computer Architecture core-knowledge areas (§4.4.1). Say next to each course which degrees it has already counted toward; the report then says what each one does.`
                  : `Notre Dame coursework you took as an undergraduate is listed here when it can count toward the MSCSE — 60000-level courses in full, CSE courses below that inside §3.2’s allowance. Up to 6 credits may apply to both your bachelor’s degree and your MSCSE (§3.5): this page chose them for you — your 40000-level CSE courses first, best grade first, saving 60000-level coursework for the graduate degree — and each line says whether the course will apply to both degrees or to your MSCSE only.`
                : student.program === 'phd'
                  ? `Courses taken as an undergraduate student do not transfer, whether or not the course itself is a graduate course (§5.2). Only courses relevant to the Algorithms, Operating Systems, and Computer Architecture core-knowledge areas (§4.4.1) are listed here`
                  : `Courses taken as an undergraduate student do not transfer, whether or not the course itself is a graduate course (§5.2), and they satisfy nothing else in the MSCSE — so none of them is listed here`) +
              `${g.hidden > 0 ? ` ${g.hidden} other course${g.hidden === 1 ? '' : 's'} from this transcript ${g.hidden === 1 ? 'is' : 'are'} not shown.` : ''}`,
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
                // Trimmed 2026-09-18 (P-87): same facts, the DGS named less often.
                `Transfer credit (§5.2) is decided by the DGS course by course — normally only CSE-related courses transfer, at most ${transferCapLimit()} credits in total, and the Graduate School confirms the DGS’s recommendation. Until the DGS has ruled, every graduate course here is a candidate: the review request below asks for the rulings; the processing request below the milestones then has the Grad Admin transfer the credit.`,
              )
            : null,
        g.entries.length > 0
          ? courseTable(courseLines, g.entries)
          : el('p', { class: 'empty' }, student.program === 'phd' ? 'No core-area-relevant courses on this transcript.' : 'No courses from this transcript can count toward the MSCSE.'),
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
      // "Start here" made prominent (DGS 2026-09-15): a filled badge in the
      // heading and a bold callout line above the hint.
      el('h2', {}, el('span', { class: 'step-no' }, '1. '), 'Transcripts ', el('span', { class: 'chip-start' }, 'Start here')),
      el('p', { class: 'start-callout' }, 'Import your transcripts, and most of the page below fills itself in.'), // the badge beside the title already says START HERE (DGS 2026-09-19, P-52)
      // Shorter sentences (usability review 2026-09-05, item 10): the same
      // facts, none over 25 words. "Nothing is uploaded" is the strip line
      // above, the toast during the read and the OCR opt-in; the card keeps
      // what is specific to it (trim review 2026-09-18, P-20).
      el(
        'p',
        { class: 'hint' },
        el('strong', {}, 'System-generated PDFs are read exactly;'),
        ' a scanned or photographed transcript is read with built-in text recognition (OCR, English only) after you agree. You check every field before it is added.',
      ),
      // Unofficial transcripts read best (DGS observation 2026-09-05): the web /
      // self-service PDF is single-column and carries no watermark; official
      // ones (two columns, security bands) are read too, less reliably.
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
    // Notes that are not about one course (2026-09-12): a 4+1 with many
    // undergraduate graduate-level courses counted.
    const flags = undergraduateGraduateCourseworkFlag(student, rules);
    const notes = flags ? [flags] : [];
    if (n === 0 && notes.length === 0) return null;
    const what = reviewRequestSummary(n, notes.length > 0);
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
      el('div', { class: 'review-line', 'data-keep-dgs': '' }, el('span', { class: 'cid' }, courseId), `${where ? ` (${where})` : ''} — ${reason}`);
    return el(
      'div',
      { class: 'card dgs-review' },
      el('h2', {}, `Ask the ${deciderTitle(student.program)} to review `, el('span', { class: 'chip-note' }, what)),
      el(
        'p',
        { class: 'hint' },
        el('strong', {}, 'Decisions are made only by email: '),
        `initiate the review request by clicking the button below — it opens the request for you to check and send from your own email app to the ${deciderTitle(student.program)} (`,
        mailto(deciderContact(student.program).email),
        // The DGS's own sentence (2026-09-15) and the attach reminder
        // (2026-09-03); the email's format and the two-roles statement are
        // said by the dialog and the Grad Admin card (trim review 2026-09-18, P-5).
        '). Attach your transcript PDFs (Bachelor’s / Master’s / Ph.D. — whichever apply) to the same email.',
      ),
      ...pending.map((p) => line(p.course.entry.courseId, where(p), p.reason)),
      ...notes.map((t) => el('div', { class: 'review-line review-note', 'data-keep-dgs': '' }, el('span', { class: 'cid' }, 'Note'), ` — ${t}`)),
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
                const built = buildCombinedReviewRequest({ priorStudy: PRIOR_LABELS[student.priorMs], nd: ndReq, external: extReq, notes });
                return copyDialog({
                  what: 'Review request',
                  recipient: { role: deciderContact(student.program).role, name: deciderContact(student.program).name, email: deciderContact(student.program).email },
                  subject: built.subject,
                  text: built.text,
                  html: built.html,
                  steps: [{ text: 'Attach your ORIGINAL transcripts as PDFs (Bachelor’s / Master’s / Ph.D. — whichever apply). The DGS cannot review the courses without them.', emphasis: true }],
                  returnFocusKey: 'review.copy',
                });
              });
            },
          },
          `Initiate the review request for ${what}`,
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
        // that cannot matter start unticked, like the external undergraduate
        // import. "Cannot matter" is the engine's answer since 2026-09-11 —
        // undergraduate Notre Dame coursework can COUNT now, not only
        // demonstrate a §4.4.1 core area — and §4.4.1 itself is the Ph.D.
        // qualifier's, so it is no reason to tick anything for an MSCSE
        // student.
        const entry = parsed.entryTerm?.term ?? student.entryTerm;
        const bsTerm = bachelorsTermFor(parsed.degreesAwarded);
        const qualifierApplies = student.program === 'phd';
        const irrelevantPrior = parsed.courses.map(
          (c) =>
            c.origin === 'nd' &&
            termIndex(c.term) < termIndex(entry) &&
            priorNdDegreeLevel({ courseId: c.courseId, registeredLevel: c.level, term: c.term }, bsTerm) === 'bachelors' &&
            !priorNdUndergraduateCanCount(
              { courseId: c.courseId, credits: c.credits, term: c.term, grade: c.grade, origin: 'transfer' },
              resolveRuleRow(rules, c.courseId, c.term),
              student.program,
            ) &&
            !(qualifierApplies && CORE_TITLE_RE.test(c.title ?? '')) &&
            !(qualifierApplies && resolveRuleRow(rules, c.courseId, c.term)?.coreArea) &&
            !(qualifierApplies && findExternalRule(rules.external, 'University of Notre Dame', c.courseId)),
        );
        // The GPA (combined-transcript bug report 2026-09-05): the transcript's
        // GRADUATE-level cumulative figure, never the undergraduate one; and
        // when graduate courses from an EARLIER program at Notre Dame precede
        // the entry term, that figure includes them, so the courses of this
        // program alone are averaged too and the student chooses (the
        // transcript's figure is the default — it is what the registrar and
        // the Graduate School compute; docs/DECISIONS.md 2026-09-05).
        const programGpa = gpaOfProgramCourses(parsed.courses, entry);
        // A figure misread off the page is not offered at all (R1,
        // 2026-09-18): the preview's GPA control is the one place a number
        // the student never typed can reach §2.2, so a reading off the 4.00
        // scale is dropped here and said in the preview's own warnings, where
        // the rest of what the parser could not place is already listed.
        const transcriptGpa = inRange(parsed.cumulativeGpa, GPA_RANGE) ? parsed.cumulativeGpa : undefined;
        const gpaWarning =
          parsed.cumulativeGpa !== undefined && transcriptGpa === undefined
            ? [
                `The cumulative GPA read from this transcript (${formatValue(parsed.cumulativeGpa, GPA_RANGE)}) is outside the ${rangeSpan(GPA_RANGE)} range, so it was not used — enter your GPA under Coursework.`,
              ]
            : [];
        const earlierGraduateWork = parsed.courses.some(
          (c) => c.origin === 'nd' && termIndex(c.term) < termIndex(entry) && c.level === 'graduate' && GRADE_POINTS[c.grade] !== undefined,
        );
        transcriptPreview = {
          courses: parsed.courses,
          selected: parsed.courses.map((_, i) => !duplicate[i] && !irrelevantPrior[i]),
          duplicate,
          gpa: transcriptGpa,
          undergraduateGpa: inRange(parsed.cumulativeGpaByLevel?.undergraduate, GPA_RANGE) ? parsed.cumulativeGpaByLevel?.undergraduate : undefined,
          programGpa: earlierGraduateWork && inRange(programGpa, GPA_RANGE) ? programGpa : undefined,
          gpaChoice: transcriptGpa !== undefined ? 'transcript' : earlierGraduateWork && inRange(programGpa, GPA_RANGE) ? 'program' : 'none',
          entryTerm: parsed.entryTerm,
          useEntryTerm: parsed.entryTerm !== undefined,
          degreesAwarded: parsed.degreesAwarded,
          warnings: [...parsed.warnings, ...gpaWarning],
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
      {
        class: 'btn',
        'data-key': 'import.nd',
        // B7 (2026-09-18): four buttons on this card read "Import from PDF".
        // The visible label stays short; the accessible name says which row.
        'aria-label': `${imported.length > 0 ? 'Import again' : 'Import'} — ${ndRowLabel(student)}`,
        onclick: () => (fileInput as HTMLInputElement).click(),
      },
      imported.length > 0 ? 'Import again' : 'Import from PDF',
    );
    const parts: (Node | string)[] = [
      // Named for the program the student picked at the top (DGS 2026-09-11):
      // an ND 4+1 student has several Notre Dame transcripts, and "ND
      // Unofficial Transcript" did not say which one this row wants.
      el('span', { class: 'slot-label' }, ndRowLabel(student)),
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
        // The card hint above already says every field is checked before it
        // is added, and the preview is that check (trim review 2026-09-18, P-29).
        el('span', { class: 'hint-inline' }, ' — the system-generated PDF from insideND; fills the coursework table and GPA below.'),
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
          // The consequence is under the field in Your standing, in both
          // states (trim review 2026-09-18, P-30).
          ` Set your entry term to ${termLabel(tp.entryTerm.term)} — ${tp.entryTerm.how}. Check it.`,
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
          // The §5.2 rule is under the field it governs, one card down
          // (trim review 2026-09-18, P-13).
          `Your transcript shows a ${bs.degree.name} awarded ${bs.degree.date} — “Bachelor’s degree awarded” under Your standing will be set to ${termLabel(bs.term)}.`,
        ),
      );
    }
    if (priorCount > 0) {
      box.append(
        el(
          'p',
          { class: 'hint prior-note' },
          // Three parallel clauses as one list, every § kept (trim review 2026-09-18, P-31).
          student.program === 'phd'
            ? `${priorCount} course${priorCount === 1 ? '' : 's'} dated before ${termLabel(entry)} are filed as coursework from before you entered: no residency counts, but they can still satisfy core knowledge (§4.4.1), count toward the credits if taken at Notre Dame as an undergraduate (§4.2), or transfer as graduate courses from elsewhere under §5.2. Undergraduate courses that cannot matter start unticked.`
            : `${priorCount} course${priorCount === 1 ? '' : 's'} dated before ${termLabel(entry)} are filed as coursework from before you entered: no residency counts, but they can still count toward the credits if taken at Notre Dame as an undergraduate (§3.2) or transfer as graduate courses from elsewhere under §5.2. Undergraduate courses that cannot matter start unticked.`,
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
                  refusedValues.delete('standing.year'); // the transcript answered this box
                }
                // Likewise for the two boxes the import fills in below: a
                // refusal left over from something typed earlier would show a
                // rejected figure beside a row now reading the transcript's
                // (R1, 2026-09-18).
                if (tp.gpaChoice !== 'none') refusedValues.delete('courses.gpa');
                // The bachelor's award term (2026-09-06), before the prior
                // rows are filed — they follow it when unlabelled.
                const bs = bachelorsAwardFrom(tp.degreesAwarded);
                if (bs && bachelorsMayBeSet(s)) {
                  refusedValues.delete('standing.bachelors.year');
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
              // "Check it under Your standing" once, at the end, for the entry
              // term and the bachelor's term together — it used to follow each
              // (trim review 2026-09-18, P-90). The unfinished-M.S. clause keeps
              // its own, different instruction.
              const toCheck = (appliedEntry ? 1 : 0) + (bachelorsSet ? 1 : 0);
              toast(
                `Added ${picked.length} course${picked.length === 1 ? '' : 's'} from the transcript` +
                  (appliedEntry ? `; entry term set to ${termLabel(appliedEntry)}` : '') +
                  (priorAdded > 0 ? `; ${priorAdded} filed as coursework from before you entered the program` : '') +
                  (priorSet === 'completed'
                    ? '; Prior graduate study set to “Completed prior M.S. or Ph.D.” from the degree awarded on your transcript'
                    : priorSet === 'unfinished'
                      ? '; Prior graduate study set to “Prior M.S., not completed” — no graduate degree award was found on your transcript; change it under Your standing if you did earn it'
                      : '') +
                  (bachelorsSet ? `; “Bachelor’s degree awarded” set to ${termLabel(bachelorsSet)} from your transcript` : '') +
                  (ndMastersSet ? '; ticked “I already hold the MSCSE from Notre Dame” from the degree on your transcript — the §4.5 along-the-way row is left out for you' : '') +
                  (toCheck === 2 ? ' — check both under Your standing' : toCheck === 1 ? ' — check it under Your standing' : '') +
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
    const creditsInput = el('input', {
      type: 'number',
      min: String(COURSE_CREDITS_RANGE.min),
      max: String(COURSE_CREDITS_RANGE.max),
      step: '0.5',
      value: '3',
      'data-key': 'course.new.credits',
      id: 'new-course-credits',
    });
    const creditsError = el('p', { class: 'field-error hidden', id: 'new-course-credits-error', role: 'alert' });
    const seasonSel = el('select', { 'aria-label': 'Term — semester', 'data-key': 'course.new.season' });
    for (const se of SEASONS) seasonSel.append(option(se, se[0]!.toUpperCase() + se.slice(1)));
    const yearInput = el('input', {
      type: 'number',
      min: String(TERM_YEAR_RANGE.min),
      'aria-label': 'Term — year',
      'data-key': 'course.new.year',
      value: String(new Date().getFullYear()),
    });
    const termYearError = el('p', { class: 'field-error hidden', id: 'new-course-year-error', role: 'alert' });
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
    levelSel.append(
      option(
        'bachelors',
        student.program === 'phd'
          ? 'UG student — before your bachelor’s degree was awarded (core knowledge only, no transfer credit)'
          : 'UG student — before your bachelor’s degree was awarded (no transfer credit)',
      ),
    );
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
      const id = canonicalCourseId(idInput.value);
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

    /** Refuse one out-of-range box in this form, the same way the course
     * number is refused: the message stays beside the field, the course is not
     * added, and nothing typed is lost (R1, 2026-09-18 — a course entered at
     * 999 credits, in a box whose `max` is 15, used to be accepted and to put
     * "1005 pending review/approval" on the 60-credit row). */
    const refuseEntry = (input: HTMLElement, error: HTMLElement, message: string): void => {
      error.textContent = message;
      error.classList.remove('hidden');
      input.setAttribute('aria-invalid', 'true');
      input.setAttribute('aria-describedby', error.id);
      toast(message); // heard as well as seen (the polite live region)
      input.focus();
    };
    const clearEntryError = (input: HTMLElement, error: HTMLElement): void => {
      error.classList.add('hidden');
      error.textContent = '';
      input.removeAttribute('aria-invalid');
      input.removeAttribute('aria-describedby');
    };
    creditsInput.addEventListener('input', () => clearEntryError(creditsInput, creditsError));
    yearInput.addEventListener('input', () => clearEntryError(yearInput, termYearError));

    const add = async () => {
      const id = canonicalCourseId(idInput.value);
      if (!id) {
        // A persistent error next to the field, not a vanishing toast (item 6).
        idError.textContent = 'Enter a course number, such as CSE 60641.';
        idError.classList.remove('hidden');
        idInput.setAttribute('aria-invalid', 'true');
        idInput.setAttribute('aria-describedby', 'new-course-id-error new-course-id-hint');
        idInput.focus();
        return;
      }
      const credits = Number((creditsInput as HTMLInputElement).value);
      if (!inRange(credits, COURSE_CREDITS_RANGE)) {
        refuseEntry(creditsInput, creditsError, inputRefusal((creditsInput as HTMLInputElement).value, COURSE_CREDITS_RANGE, 'added'));
        return;
      }
      const termYear = Number((yearInput as HTMLInputElement).value);
      if (!inRange(termYear, TERM_YEAR_RANGE)) {
        refuseEntry(yearInput, termYearError, inputRefusal((yearInput as HTMLInputElement).value, TERM_YEAR_RANGE, 'added'));
        return;
      }
      const entry: CourseEntry = {
        courseId: id,
        title: titleInput.value || undefined,
        credits,
        term: { season: (seasonSel as HTMLSelectElement).value as Season, year: termYear },
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
      // A course worth no credits counts toward nothing, and a 0 in this box is
      // nearly always a slip or a blank credit-hours column on a transcript. It
      // is allowed — losing the course would be worse — but not without being
      // asked (DGS 2026-09-11).
      if (entry.credits === 0) {
        const yes = await confirmDialog({
          title: `${id} is entered with 0 credits`,
          body: [
            // No number: 30 is the MSCSE total, and this dialog opens on both
            // tabs (trim review 2026-09-18, P-86).
            'A course with no credits counts toward nothing — not the total credits, not the regular-course credits, not any cap. It will appear in your coursework with a line saying so.',
            'Your transcript prints the credit hours beside each course. If this one has a value, cancel and type it in the Credits box.',
          ],
          confirmLabel: 'Add it with 0 credits',
          cancelLabel: 'Go back and fix the credits',
          returnFocusKey: 'course.new.credits',
        });
        if (!yes) return;
      }
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
        labelWrap('Title', titleInput), // the box fills itself for a listed course — the student sees it (trim review 2026-09-18, P-44)
      ),
      el(
        'div',
        { class: 'row2' },
        labelWrap('Credits', creditsInput),
        fieldset('Term', el('div', { class: 'pair' }, seasonSel, yearInput), 'inline'),
        labelWrap('Grade', gradeSel),
        labelWrap('Where', originSel),
      ),
      // Full width, under the row they belong to: the boxes in row2 are 72 px
      // wide and a refusal sentence is not (R1, 2026-09-18).
      creditsError,
      termYearError,
      // The §4.4.2 group picker exists only for the Ph.D. (2026-09-11: the
      // hidden field still put "§4.4.2" on the MSCSE page).
      el('div', { class: 'row3' }, institutionField, levelField, student.program === 'phd' ? groupField : null, el('button', { class: 'btn primary', 'data-key': 'course.new.add', onclick: add }, 'Add course')),
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
      const countsCell = el('td', { class: 'counts cell-note', 'data-keep-dgs': '' }, ...(line ? [statusMark(line.mark), line.text] : []));
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
      // Which degrees this course has already been counted toward (Graduate
      // School via the DGS, 2026-09-10 evening). Asked only where the answer
      // can change anything: Notre Dame coursework the student took as an
      // undergraduate, and only when they could already have spent it on two
      // degrees — a Ph.D. student with no Notre Dame master's is never asked,
      // because with two degrees in play nothing can have counted toward two.
      const awardTerm = student.bachelorsAwarded;
      const asUndergraduate =
        isNotreDameInstitution(c.institution) &&
        (c.degreeLevel === 'bachelors' || (awardTerm !== undefined && termIndex(c.term) <= termIndex(awardTerm)));
      // The MSCSE is never asked (DGS 2026-09-11): the app chooses which courses
      // apply to both degrees and each line says so.
      const couldHaveCountedTwice = student.program === 'phd' && student.ndMasters !== undefined;
      if (asUndergraduate && couldHaveCountedTwice) {
        const sel = el('select', {
          'aria-label': `Which degrees ${c.courseId} has already counted toward`,
          'data-key': `course.${index}.countedToward`,
          onchange: (e) =>
            update((s) => {
              const v = (e.target as HTMLSelectElement).value;
              s.courses[index]!.countedToward = (v || undefined) as CourseEntry['countedToward'];
            }),
        });
        // "Both" is the only answer that stops the course counting here: no
        // course may count toward three degrees. The others differ for the
        // MSCSE audit, which caps coursework shared with the bachelor's.
        //
        // A student still working on the MSCSE has only two degrees in play —
        // nothing can have counted toward the degree they are doing now — so
        // they are offered only the two answers that can be true (2026-09-11).
        const choices =
          student.program === 'mscse'
            ? ([
                // Two answers only (DGS 2026-09-11): the course counts toward the
                // MSCSE alone, or toward both degrees inside §3.5's six credits.
                // Nothing counts until one is chosen.
                ['', 'Choose…'],
                ['mscse', 'Only my MSCSE'],
                ['both', 'Both my bachelor’s degree and my MSCSE'],
              ] as const)
            : ([
                ['', 'Already counted toward…'],
                ['neither', 'Neither — it was extra'],
                ['bs', 'My bachelor’s degree'],
                ['mscse', 'My MSCSE'],
                ['both', 'Both my bachelor’s and my MSCSE'],
              ] as const);
        for (const [value, label] of choices) {
          sel.append(option(value, label, (c.countedToward ?? '') === value));
        }
        countsCell.append(el('div', {}, sel));
        if (c.countedToward === undefined) {
          countsCell.append(
            el(
              'div',
              { class: 'group-hint' },
              student.program === 'mscse'
                ? 'Choose one: this course counts only toward your MSCSE, or toward both your bachelor’s degree and your MSCSE. At most 6 credits may count toward both (§3.5) — once two 3-credit courses are shared, the rest can only count toward the MSCSE. Nothing counts until you choose. Most 40000-level courses also need your advisor’s and the DGS’s approval, so they are listed in the review request.'
                : 'Notre Dame coursework you took as an undergraduate can count here — 60000-level in full, and up to 6 credits below it — unless it has already counted toward both your bachelor’s and your MSCSE. No course may count toward three degrees, so this answer decides it.',
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
    // The Grad Admin needs the original transcripts only to process §5.2
    // transfer credit; nothing else in the request is decided from a PDF, so
    // the attach step, the email's "Attached:" line and the card's clause
    // appear only when a transfer is in it (trim review 2026-09-18, P-45).
    const needsTranscripts = built.items.transfers.length > 0;
    const label = 'Initiate the request';
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
                // (The self-check file used to be saved and attached here,
                // 2026-09-06 — dropped, DGS 2026-09-15: the request is the message.)
                void copyDialog({
                  what: 'Processing request',
                  recipient: { role: GRAD_ADMIN.role, name: GRAD_ADMIN.name, email: GRAD_ADMIN.email, cc: { role: deciderContact(student.program).role, name: deciderContact(student.program).name, email: deciderContact(student.program).email } },
                  subject: built.subject,
                  text: built.text,
                  html: built.html,
                  steps: needsTranscripts ? [{ text: 'Attach your ORIGINAL transcripts as PDFs (Bachelor’s / Master’s / Ph.D. — whichever apply).', emphasis: true }] : [],
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
      // Two people, two jobs (DGS 2026-09-06; the button sentence DGS
      // 2026-09-15). While there is nothing to send, the paragraph told the
      // student to click a button that does nothing, so the n = 0 state is
      // one line and the full paragraph returns with the first item (trim
      // review 2026-09-18, P-4). The full paragraph no longer points at "the
      // review request above" (a card most students never see) or repeats
      // "the page itself sends nothing" (step 3 of the dialog) — P-19.
      n === 0
        ? el(
            'p',
            { class: 'hint' },
            'Nothing to process yet — this card fills in as requirements are met and milestone dates are entered. The Grad Admin (',
            `${GRAD_ADMIN.name}, `,
            mailto(GRAD_ADMIN.email),
            ') processes what the DGS has decided and keeps the official record.',
          )
        : el(
            'p',
            { class: 'hint' },
            el('strong', {}, 'Two people, two jobs. '),
            'The DGS decides eligibility by the course rules; the Grad Admin (',
            `${GRAD_ADMIN.name}, `,
            mailto(GRAD_ADMIN.email),
            student.program === 'phd'
              ? ') processes what has been decided and keeps the official record: transfer credit (§5.2), the qualifier form (§4.4), exam and defense forms (§4.5–4.7), the MSCSE along the way (§4.5) — and the requirements you have met so far. '
              : ') processes what has been decided and keeps the official record: transfer credit (§5.2), the project or thesis forms (§3.4) — and the requirements you have met so far. ',
            `Initiate the processing by clicking the following button: it opens the request for you to check and send from your own email app, to the Grad Admin with the DGS in cc${needsTranscripts ? ' — attach your original transcripts' : ''}.`,
          ),
      ...built.items.lines.map((text) => el('div', { class: 'review-line', 'data-keep-dgs': '' }, text)),
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
      // "Optional" once, leading (2026-09-05 item 11; trim review 2026-09-18, P-41).
      el('p', { class: 'hint' }, 'Every date here is optional — enter a date once it has happened.'),
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
        // "(DGS office)" dropped (trim review 2026-09-18, P-51): the handbook's
        // phrase for the desk the page calls the Grad Admin, one card above
        // "two people, two jobs"; phd.ts and the advisor summary already read this way.
        dateField('Qualifier completion form filed with the Grad Admin (§4.4)', 'qualifierFormFiled'),
        dateField('Oral Candidacy Exam (OCE) passed (§4.5)', 'candidacyPassed'),
      );
      // §4.6 opens "After satisfying the above requirements": nobody has a
      // dissertation date without an OCE date, so the two dissertation fields
      // appear once the OCE is dated — or when a loaded record already
      // carries either date, so nothing on file is ever hidden (trim review
      // 2026-09-18, P-64). The §4.6/§4.7 report rows are unchanged.
      if (m.candidacyPassed || m.dissertationApprovedForDefense || m.defensePassed) {
        card.append(
          dateField('Dissertation approved for defense by all readers (§4.6)', 'dissertationApprovedForDefense'),
          dateField('Dissertation defense passed (§4.7)', 'defensePassed'),
        );
      }
    }

    card.append(el('h2', { class: 'mt' }, 'Approvals you already have'));
    card.append(
      // The two-roles sentence is the next card's opening (trim review 2026-09-18, P-16).
      el('p', { class: 'hint' }, 'Tick only what has actually been approved.'),
      attestation('My advisor approved my plan of study (' + (student.program === 'mscse' ? '§3.2' : '§4.2') + ')', a.advisorApprovedPlan, (v, s) => (s.attestations.advisorApprovedPlan = v)),
      attestation('The DGS approved my course(s) below the 60000 level (' + (student.program === 'mscse' ? '§3.2' : '§4.2') + ')', a.dgsApproved4xxxx, (v, s) => (s.attestations.dgsApproved4xxxx = v)),
      attestation('The DGS approved my non-CSE course(s) (' + (student.program === 'mscse' ? '§3.2' : '§4.2') + ')', a.dgsApprovedNonCse, (v, s) => (s.attestations.dgsApprovedNonCse = v)),
    );
    // §5.2 (DGS 2026-09-12, red-team F5): an external course counts only once
    // the DGS has EXPLICITLY approved it. The checkbox records that approval
    // (and the Graduate School's processing) for courses the DGS has
    // reviewed — a `yes` or a "needs approval" verdict in the rules sheet.
    // It is shown only when it can settle something: with no reviewed
    // transfer course it is a dead control, so the explanation stands alone.
    {
      const transfers = classify(student, rules).classified.filter(
        (c) => c.entry.origin === 'transfer' && c.entry.degreeLevel !== 'bachelors' && !c.superseded && c.caps.includes('transfer'),
      );
      const reviewed = transfers.filter((c) => c.reviewed === true);
      const unreviewed = transfers.filter((c) => c.reviewed !== true).map((c) => c.entry.courseId);
      if (reviewed.length > 0) {
        card.append(attestation('The DGS explicitly approved my transfer credit (§5.2)', a.transferApproved, (v, s) => (s.attestations.transferApproved = v)));
      }
      // Only what the box cannot do (DGS 2026-09-13: the rule itself is
      // obvious from the "Ask the DGS to review" card, so it is not repeated).
      if (reviewed.length > 0 && unreviewed.length > 0) {
        card.append(
          el(
            'p',
            { class: 'hint attest-note', 'data-key': 'attest.transfer.note' },
            `This box cannot settle ${unreviewed.join(', ')} — not reviewed yet; send the review request from the “Ask the DGS to review” card.`,
          ),
        );
      }
    }
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

  /** "Send summary to advisor" (DGS 2026-09-15): the dialog with the
   * advisor summary. Rendered at the end of the report since the trim review
   * (2026-09-18, P-72); it was the third button of the storage card. */
  function advisorSummaryButton(report: ReturnType<typeof audit>): HTMLElement {
    return el(
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
      'Send summary to advisor',
    );
  }

  function saveCard(): HTMLElement {
    const fileInput = el('input', { type: 'file', accept: '.json,application/json', class: 'hidden', 'aria-label': 'Saved file' }); // (P-62)
    fileInput.addEventListener('change', async () => {
      const file = (fileInput as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const refusals: Refusal[] = [];
        const imported = await importFile(file, refusals);
        cancelUndo();
        refusedValues.clear(); // this file's own refusals replace the page's
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
        // A number the file carried that the app would not keep goes back into
        // its own field, refused, rather than disappearing (R1, 2026-09-18).
        if (refusals.length > 0) {
          applyRefusals(refusals);
          render();
        }
        // "File", as the buttons say (trim review 2026-09-18, P-62).
        toast(refusals.length > 0 ? `File loaded. ${refusals.map((r) => r.message).join(' ')}` : 'File loaded.');
      } catch (err) {
        toast(err instanceof Error ? err.message : 'That file could not be read.');
      }
    });
    return el(
      'section',
      { class: 'card save-card' },
      el('h2', {}, 'Your record stays in this browser'), // "record", the page's word for what localStorage holds (R7; trim review 2026-09-18, P-56)
      el(
        'p',
        { class: 'hint' },
        // The privacy statement belongs where the file controls are, not only
        // in the footer (B9, 2026-09-18). The GitHub/Google Sheets sentence
        // (W-P1) stays in the footer and the notice Details; here only the
        // claim and the instruction (trim review 2026-09-18, P-8; "import"
        // for what the student does, P-53).
        'Everything you enter — including any transcript PDF you import — is processed and saved in this browser only. To keep a copy or move to another device, save it as a file.',
      ),
      // The other side of "it stays in this browser" (interface review R7,
      // 2026-09-18): on a lab or library machine the record has no expiry, so
      // the next person to open this page sees it. The page framed browser
      // storage purely as a benefit.
      el(
        'p',
        { class: 'hint warn' },
        // Both R7 facts in fewer words (trim review 2026-09-18, P-36).
        'On a shared or public computer, clear your record before you walk away: it never expires, and the next person to open this page on this machine would see it.',
      ),
      el(
        'div',
        { class: 'save-buttons' },
        el('button', { class: 'btn primary', 'data-key': 'save.file', onclick: () => exportFile(student) }, 'Save to a file'),
        el('button', { class: 'btn', 'data-key': 'save.load', onclick: () => (fileInput as HTMLInputElement).click() }, 'Load a file'),
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
      // Five distinct things in one grey block of ~1,900 characters
      // (blue-team B9, 2026-09-18): scope, the alpha warning, where the rules
      // come from, privacy, and the licence. Each now has a heading, and the
      // two longest are disclosures — closed, the footer is five short lines.
      el(
        'div',
        { class: 'legal-scope' },
        el('h2', { class: 'legal-head' }, 'This is a self-check, not an official audit'),
        student.program === 'mscse' ? 'It applies Section 3 of the ' : 'It applies Section 4 of the ',
        handbookLink(),
        // Who decides and who processes is on the Grad Admin card, in the
        // glossary and in the contact card right below; the footer keeps its
        // one imperative (trim review 2026-09-18, P-21).
        '. Some requirements depend on approvals this page cannot see: advisor and DGS sign-off, transfer-credit recommendations, and Graduate School deadlines. Deadlines are shown by semester and are approximate; the registrar’s calendar sets the exact dates. Confirm with the DGS before you rely on this self-check.',
      ),
      // No alpha paragraph in the footer (DGS 2026-09-19, trim proposal P-3):
      // it was word for word the red strip's Details at the top of the page.
      // What the rules spreadsheet is and who can open it (DGS, 2026-09-04).
      el(
        'details',
        { class: 'legal-source', 'data-key': 'legal.source' },
        el('summary', {}, el('h2', { class: 'legal-head' }, 'Where the rules come from')),
        ...sheetSourceNote('app'),
      ),
      el(
        'div',
        { class: 'legal-privacy' },
        // One word (trim review 2026-09-18, P-56): the heading is inline and
        // ran straight into the sentence below, which says the claim itself.
        el('h2', { class: 'legal-head' }, 'Privacy'),
        // W-P1 (DGS 2026-09-18). The middle two sentences are his approved
        // wording verbatim; the FERPA sentence stays, as he asked.
        'Your coursework never leaves this browser: everything you enter — and any transcript PDF you import — is processed here and saved only on this computer. The page itself loads from GitHub and reads the course rules from Google Sheets, so those two services see that someone opened the page; they never see what you enter. Your FERPA-protected education records remain under your control.',
      ),
      el(
        'div',
        { class: 'legal-license' },
        el('h2', { class: 'legal-head' }, 'License'),
        '© 2026 University of Notre Dame du Lac. Free for non-commercial (academic and research) use; commercial use requires a license from Notre Dame\'s IDEA Center (',
        mailto('softwarelicensing@nd.edu'),
        '). Full terms: ',
        el('a', { href: LICENSE_URL, target: '_blank', rel: 'noopener noreferrer' }, 'LICENSE.md'),
        ' · source: ',
        el('a', { href: REPO_URL, target: '_blank', rel: 'noopener noreferrer' }, 'GitHub'),
        '.',
      ),
      // Embedded, the way out of the frame — and, with the contact card moved
      // off the top, the place the contacts now live (DGS 2026-09-16).
      isEmbedded() ? el('div', { class: 'embed-exit-line' }, openFullPageLink('Open the full self-check page'), ' — the same tool in its own window.') : null,
      contactCard(),
    );
  }


  // ---------- example / clear ----------

  /** The example for the program the student is actually looking at (DGS
   * 2026-09-18). One example for both was a Ph.D. record: an MSCSE student who
   * pressed "Load example" to see what the tool does was shown a dissertation,
   * two research seminars and a qualifying examination, and the report switched
   * to §4 under them. Each example is a real mid-degree record for its own
   * degree, built from courses the sheet actually carries. */
  function exampleFor(program: Program): Student {
    // "Last year" and "this year" against Notre Dame's own date, which the
    // loading card settled.
    const thisYear = termOfDate(today.iso).year;
    const lastYear = thisYear - 1;
    const common = {
      schemaVersion: 1 as const,
      isExample: true as const,
      // A student a year into the degree, so the finished courses sit in terms
      // that have finished. Dated from this year rather than hard-coded, so the
      // example does not drift into the past as the years pass — and so a
      // final grade never lands in a semester that has not happened, which the
      // report warns about, in an example meant to show the tool working.
      entryTerm: { season: 'fall' as const, year: lastYear },
      // The example is a complete record: the bachelor's term is required
      // (2026-09-07), so leaving it out made the demo warn about itself.
      bachelorsAwarded: { season: 'spring' as const, year: lastYear },
      priorMs: 'none' as const,
      milestones: { ...EXAMPLE_MILESTONES },
      attestations: { ...EXAMPLE_ATTESTATIONS },
    };
    // Every seeded row is tagged (R5, 2026-09-18), so the banner can count
    // what is the example's and "Remove the example rows" can take back
    // exactly those, leaving anything the student added.
    if (program === 'mscse') {
      return {
        ...common,
        program: 'mscse',
        // §3.4's two routes: the project, which the tool also infers from
        // CSE 68902 being on the record.
        msOption: 'project',
        gpa: 3.6,
        // The 40000-level pair is deliberate: §3.2 allows six credits and this
        // record uses exactly six, so the cap reads as met rather than unused.
        attestations: { ...EXAMPLE_ATTESTATIONS, dgsApproved4xxxx: true },
        courses: [
          { courseId: 'CSE 60641', title: 'Graduate Operating Systems', credits: 3, term: { season: 'fall', year: lastYear }, grade: 'A', origin: 'nd', fromExample: true },
          { courseId: 'CSE 60535', title: 'Computer Vision', credits: 3, term: { season: 'fall', year: lastYear }, grade: 'A-', origin: 'nd', fromExample: true },
          { courseId: 'CSE 40113', title: 'Design/Analysis of Algorithms', credits: 3, term: { season: 'fall', year: lastYear }, grade: 'B+', origin: 'nd', fromExample: true },
          { courseId: 'CSE 60770', title: 'Secure Software Engineering', credits: 3, term: { season: 'spring', year: thisYear }, grade: 'A', origin: 'nd', fromExample: true },
          { courseId: 'CSE 60424', title: 'Graduate Human Computer Interaction', credits: 3, term: { season: 'spring', year: thisYear }, grade: 'B+', origin: 'nd', fromExample: true },
          { courseId: 'CSE 40166', title: 'Computer Graphics', credits: 3, term: { season: 'spring', year: thisYear }, grade: 'B', origin: 'nd', fromExample: true },
          { courseId: 'CSE 60625', title: 'Advanced Topics in Machine Learning', credits: 3, term: { season: 'fall', year: thisYear }, grade: 'IP', origin: 'nd', fromExample: true },
          { courseId: 'CSE 68902', title: 'Thesis Project', credits: 6, term: { season: 'fall', year: thisYear }, grade: 'IP', origin: 'nd', fromExample: true },
        ],
      };
    }
    return {
      ...common,
      program: 'phd',
      gpa: 3.5,
      courses: [
        { courseId: 'CSE 60641', title: 'Graduate Operating Systems', credits: 3, term: { season: 'fall', year: lastYear }, grade: 'A', origin: 'nd', fromExample: true },
        { courseId: 'CSE 63801', title: 'Research Seminar I', credits: 1, term: { season: 'fall', year: lastYear }, grade: 'S', origin: 'nd', fromExample: true },
        { courseId: 'CSE 60111', title: 'Complexity and Algorithms', credits: 3, term: { season: 'spring', year: thisYear }, grade: 'B-', origin: 'nd', fromExample: true },
        { courseId: 'CSE 60321', title: 'Advanced Computer Architecture', credits: 3, term: { season: 'spring', year: thisYear }, grade: 'B+', origin: 'nd', fromExample: true },
        { courseId: 'CSE 63802', title: 'Research Seminar II', credits: 1, term: { season: 'spring', year: thisYear }, grade: 'S', origin: 'nd', fromExample: true },
        { courseId: 'CSE 60770', title: 'Secure Software Engineering', credits: 3, term: { season: 'fall', year: thisYear }, grade: 'IP', origin: 'nd', fromExample: true },
        { courseId: 'CSE 60876', title: 'Research Methods', credits: 3, term: { season: 'spring', year: thisYear + 1 }, grade: 'IP', origin: 'nd', assignedGroup: 'dsai', fromExample: true },
        { courseId: 'CSE 98900', title: 'Research and Dissertation', credits: 6, term: { season: 'spring', year: thisYear + 1 }, grade: 'IP', origin: 'nd', fromExample: true },
      ],
    };
  }

  function loadExample(): void {
    // The example matches the tab the student is on, so pressing it never
    // changes which degree the report is about (DGS 2026-09-18).
    const program = student.program;
    const name = program === 'mscse' ? 'MSCSE' : 'Ph.D.';
    if (student.courses.length > 0 && !window.confirm(`Load the example ${name} student? This replaces what is on the page.`)) {
      return;
    }
    cancelUndo(); // a stale Undo would splice old rows into the replaced record
    refusedValues.clear(); // …and a stale refusal would mark a box the record no longer has
    student = exampleFor(program);
    saveLocal(student);
    render();
    // No visible toast: the banner at the top of the inputs says the same
    // and names the right button, and the toast covered the page on a phone.
    // Screen readers still hear what happened — the banner is a role=note,
    // which is not announced (trim review 2026-09-18, P-27).
    srStatus.textContent = `Example ${name} student loaded.`;
  }

  /** The rows "Load example" seeded that are still on the record. */
  function exampleRows(): CourseEntry[] {
    return student.courses.filter((c) => c.fromExample);
  }

  /** Does the record still carry anything the example put there? An older saved
   * record has `isExample` but no per-row flags — it is the example whole. */
  function hasExample(): boolean {
    return exampleRows().length > 0 || (student.isExample === true && student.courses.length === 0);
  }

  function exampleBanner(): HTMLElement | null {
    if (!hasExample()) return null;
    const mine = exampleRows().length;
    const all = student.courses.length;
    const some = mine > 0 && mine < all;
    return el(
      'div',
      { class: 'card example-banner', role: 'note' },
      some
        ? el('strong', {}, `${mine} of these ${all} courses are the example student’s. `)
        : el('strong', {}, 'This is the example student, not your record. '),
      some
        ? 'Removing them leaves everything you entered yourself untouched.'
        : 'Nothing here came from you. Remove it before entering your own record.', // "record", as in the first sentence (trim review 2026-09-18, P-57)
      el(
        'div',
        { class: 'save-buttons' },
        el('button', { class: 'btn', 'data-key': 'example.clear', onclick: removeExample }, 'Remove the example rows'),
      ),
    );
  }

  /** Take back exactly what "Load example" put in — the flagged rows, and the
   * milestones and attestations it filled in WHERE THE STUDENT HAS NOT SINCE
   * CHANGED THEM, since a value they edited is their own (R5, 2026-09-18). */
  function removeExample(): void {
    const before = JSON.parse(JSON.stringify(student)) as Student;
    const removed = exampleRows().length;
    cancelUndo();
    update((s) => {
      s.courses = s.courses.filter((c) => !c.fromExample);
      for (const [k, v] of Object.entries(EXAMPLE_MILESTONES)) {
        if ((s.milestones as Record<string, unknown>)[k] === v) delete (s.milestones as Record<string, unknown>)[k];
      }
      for (const [k, v] of Object.entries(EXAMPLE_ATTESTATIONS)) {
        if ((s.attestations as Record<string, unknown>)[k] === v) delete (s.attestations as Record<string, unknown>)[k];
      }
      s.isExample = undefined; // nothing of the example is left to announce
    });
    toastWithAction(
      `${removed} example row${removed === 1 ? '' : 's'} removed${student.courses.length > 0 ? ` — your own ${student.courses.length} stay${student.courses.length === 1 ? 's' : ''}` : ''}.`,
      'Undo',
      () => {
        student = before;
        saveLocal(student);
        render();
      },
      { ttlMs: 20000 },
    );
  }

  function clearAll(): void {
    if (!window.confirm('Clear everything you have entered on this device?')) return;
    cancelUndo();
    refusedValues.clear();
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

  // A record already on this device may carry a number an older build let
  // through (R1, 2026-09-18): it is refused now, shown back in its field, and
  // said out loud once the page is up — never dropped in silence.
  if (loadRefusals.length > 0) applyRefusals(loadRefusals);
  render();
  for (const r of loadRefusals) toast(r.message);
}
