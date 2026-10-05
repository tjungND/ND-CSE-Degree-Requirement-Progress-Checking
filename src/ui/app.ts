// The student-facing app: standing form, course table with sheet-driven
// autocomplete, milestone dates, attestations, and the live report.
// All rule logic lives in src/engine/ — this file only collects input and renders.
import type { NotreDameNow } from '../data/clock.ts';
import { canonicalCourseId, resolveRuleRow } from '../data/assemble.ts';
import { findExternalRule, isNotreDameInstitution } from '../data/external.ts';
import { CORE_TITLE_RE } from '../engine/core-title.ts';
import { classify, overMaxTerms, priorNdUndergraduateCanCount, type ClassifiedCourse } from '../engine/allocate.ts';
import { fullTimeRecordsFrom, summerFullTimeFloor } from '../engine/requirements/residency.ts';
import { normalizeEntryTerm, semesterSeq } from '../engine/term.ts';
import type { Rules } from '../data/types.ts';
import { coursesNeedingDgsReviewFor, reviewRequestSummary, type PendingDgsReview } from '../engine/review.ts';
import { shortName } from '../engine/short-names.ts';
import { audit } from '../engine/audit.ts';
import { GRADES } from '../engine/grades.ts';
import { termIndex, termLabel, termOfDate, termShort } from '../engine/term.ts';
import type { AuditReport, CourseEntry, CourseLine, MilestoneDateKey, MilestoneDeadline, Program, Season, Student, Term } from '../engine/types.ts';
import { deadlineText } from './milestone-deadline.ts';
import { clear, el, inactiveButton, option } from './dom.ts';
import { siblingAnchorAttrs } from './sibling-links.ts';
import { BETA_NOTICE, BETA_SCOPE_NOTICE, RULES_ACCURACY_NOTICE, handbookLink, rulesDateLine } from './handbook.ts';
import { DGS, GRAD_ADMIN, LICENSE_URL, REPO_URL, applyContactOverrides, contactCard, mailto, reportToDgs, deciderContact } from './contacts.ts';
import { isEmbedded, openFullPageLink, placeInFrame } from './embed.ts';
import { themeToggle } from './theme.ts';
import { deciderTitle } from '../engine/decider.ts';
import {
  BACHELORS_YEAR_RANGE,
  COURSE_CREDITS_RANGE,
  GPA_RANGE,
  TERM_YEAR_RANGE,
  inRange,
  inputRefusal,
} from '../engine/ranges.ts';
import { inferMsOption } from '../engine/requirements/mscse.ts';
import { qualifierPriorRulesEligible } from '../engine/requirements/phd.ts';
import { applyBackground, backgroundQuestions, choiceRow, completeBackground, describeBackground, openBackgroundDialog, type Background } from './background.ts';
import { DEGREE_SLOTS, importsBusy, priorTranscriptSection } from './external-upload.ts';
import { statusMark } from './marks.ts';
import { type NdUploadArgs, ndPreviewOpen, ndTranscriptPreviewBlock, ndTranscriptUpload } from './nd-upload.ts';
import { deriveNdMasters, derivePriorMs, isNotreDameCourse, reclassifyNotreDameCourses } from './prior-nd.ts';
import { applyDeciderRule, applyFirstMentionRule } from './first-mention.ts';
import { labelCitationsIn } from './citations.ts';
import { canonicalUniversityName, knownUniversities } from './university-name.ts';
import { confirmDialog, copyDialog, openModal, returnFocusTo } from './copy-dialog.ts';
import { plural } from './email-html.ts';
import { EXAMPLE_ATTESTATIONS, EXAMPLE_MILESTONES, exampleFor } from './example.ts';
import { policyFold, rareFold, clearInvalid, errorLine, field, fieldset, labelWrap, markInvalid, radios } from './form-helpers.ts';
import { createFocusKeeper } from './focus-keeper.ts';
import { type RefusedValues, applyRefusals, rangedNumber } from './refusals.ts';
import { createToasts } from './toasts.ts';
import { gradAdminRequest } from './grad-admin-request.ts';
import { programHistory } from './program-history.ts';
import { FILL_IN_STEP, unofficialTranscriptNote } from './email-html.ts';
import { advisorSummary } from './advisor-summary.ts';
import { renderReport, renderSummary, reqAnchorId, scoreLine } from './report.ts';
import { courseworkSentence, nearestDeadline, nextSteps } from './next-steps.ts';
import { sheetSourceLine, sheetSourceNote } from './sheet-source.ts';
import {
  type Refusal,
  SEASONS,
  clearLocal,
  emptyStudent,
  exportFile,
  importFile,
  loadLocal,
  saveLocal,
} from './state.ts';

// (The §4.4.1 core-title keywords moved to src/engine/core-title.ts on
// 2026-09-04 so the classifier and the import preview share them.)

/** The "Prior graduate study" dropdown labels — reused in the review request. */
const PRIOR_LABELS: Record<Student['priorMs'], string> = {
  none: 'No prior graduate degree',
  unfinished: 'Prior M.S., not completed',
  completed: 'Completed prior M.S. or Ph.D.',
};

/** The three semesters as <option>s for a season dropdown, `selected` marked. */
function seasonOptions(selected?: Season): HTMLOptionElement[] {
  return SEASONS.map((se) => option(se, se[0]!.toUpperCase() + se.slice(1), selected === se));
}
/** The ENTRY term's seasons: fall and spring only (DGS 2026-10-03 — "Admissions
 * happen in Spring and Fall only"); a summer start is an early start whose
 * official matriculation is that fall, and state.ts reads a stored summer as
 * the fall. */
function entrySeasonOptions(selected?: Season): HTMLOptionElement[] {
  return (['fall', 'spring'] as const).map((se) => option(se, se[0]!.toUpperCase() + se.slice(1), (selected === 'summer' ? 'fall' : selected) === se));
}
/** How a grade reads in the dropdown and the table (I and W since 2026-10-03). */
function gradeLabel(g: string): string {
  return g === 'IP' ? 'In progress' : g === 'I' ? 'I (incomplete)' : g === 'W' ? 'W (withdrawn)' : g === 'V' ? 'V (audit)' : g;
}

/** A §4.4.2 group's short name (short-names.ts) from its code, or the code
 * itself when the Categories tab does not define it. */
function groupShortName(rules: Rules, code: string): string {
  return shortName(rules.categoryGroups.find((x) => x.code === code)?.name ?? code);
}


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


/** Whether every course shows its "Counts toward" links (session-only, 2026-09-27). */
let showFeeds = false;

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
  // The dialog is built by a function (2026-09-22) so that Reset can show it
  // again for the emptied record: program and earlier degrees are chosen
  // there and nowhere else.
  const openOpeningDialog = (prefill: Student | undefined): void => {
  // "Continue" (DGS 2026-09-29): the acknowledgement is a tick box INSIDE the
  // notice it acknowledges — "I understand — continue" at the foot of the
  // dialog read as the answer to the questions, not to the warning above them.
  const agreeButton = el('button', { class: 'btn primary', autofocus: true }, 'Continue');
  const ack = el('input', { type: 'checkbox', 'data-key': 'consent.ack', onchange: () => gate() }) as HTMLInputElement;
  // The program choice lives here (blue-team B2, 2026-09-18). It used to be a
  // SILENT default — emptyStudent() says `program: 'phd'` and nothing asked —
  // so an MSCSE student who missed the segmented control at the top read
  // seventeen Ph.D. checks (dissertation readers, the OCE, the eight-year
  // limit) and a footer saying 0 of 17 met. This dialog is already a forced
  // interaction on every visit; asking here removes the whole failure class.
  // A returning student's answer is pre-selected, so it stays one click.
  // Option rows like the questions below them (DGS 2026-09-29): a bold head
  // and the handbook chapter as the lighter line.
  const programRadios = el('div', { class: 'choices consent-program' });
  let chosenProgram: Program | undefined = prefill?.program;
  for (const [value, head, sub] of [
    ['phd', 'Ph.D. in Computer Science and Engineering', 'Handbook §4'],
    ['mscse', 'M.S. in Computer Science and Engineering (MSCSE)', 'Handbook §3'],
  ] as [Program, string, string][]) {
    programRadios.append(
      choiceRow({
        name: 'consent-program',
        value,
        head,
        sub,
        dataKey: `consent.program.${value}`,
        checked: prefill?.program === value,
        onChange: () => {
          chosenProgram = value;
          renderQuestions();
          gate();
        },
      }),
    );
  }
  // Nothing is pre-selected for a student with no record on this device, and
  // the button stays inactive until they answer — the report must not render
  // against a program nobody chose.
  // The earlier-degrees questions (DGS 2026-09-22) sit under the program
  // choice, and every family must be answered before the button works and
  // before Escape closes the dialog (DGS 2026-09-23: "force the selections in
  // each family") — a record saved before the questions existed is asked
  // them on its next visit, like a new one.
  let chosenBackground: Partial<Background> | undefined = prefill?.background;
  const answered = (): boolean => chosenProgram !== undefined && completeBackground(chosenBackground, chosenProgram) !== undefined;
  const isReady = (): boolean => ack.checked && answered();
  // Why the button waits, said beside it (DGS 2026-09-29: a grey button with
  // no reason was the dialog's last line) — the tick, the questions, or both.
  const hint = el('span', { class: 'consent-hint' });
  const gate = (): void => {
    if (isReady()) agreeButton.removeAttribute('disabled');
    else agreeButton.setAttribute('disabled', 'disabled');
    // DGS 2026-09-30: say that the notice at the top must be acknowledged.
    hint.textContent =
      !ack.checked && !answered()
        ? 'To continue, acknowledge the notice at the top by checking its box, and answer the questions.'
        : !ack.checked
          ? 'To continue, acknowledge the notice at the top by checking its box.'
          : 'Answer the questions above to continue.';
    hint.hidden = isReady();
  };
  // The questions depend on the program (an MSCSE student cannot already hold
  // the MSCSE; a Notre Dame CSE bachelor's asks about the 4+1 only for the
  // MSCSE), so they are rebuilt whenever the program radio changes.
  const backgroundBlock = el('div', {});
  // One family at a time (DGS 2026-09-23): nothing below the program choice
  // until it is made, then each question once the one before it is answered.
  const renderQuestions = (): void => {
    if (chosenProgram === undefined) {
      backgroundBlock.replaceChildren();
      return;
    }
    backgroundBlock.replaceChildren(
      backgroundQuestions(
        chosenBackground,
        'consent',
        chosenProgram,
        (b) => {
          chosenBackground = b;
          gate();
        },
        true,
      ),
    );
  };
  renderQuestions();
  gate();
  const consentDialog = el(
    'dialog',
    { class: 'consent consent-overlay', 'aria-labelledby': 'consent-title' },
    el(
      'div',
      { class: 'consent-box' },
      el('h2', { id: 'consent-title' }, 'Before you continue'),
      // In red (DGS 2026-09-22): the one sentence a tester must not miss —
      // with the acknowledgement it asks for right under it (DGS 2026-09-29).
      el(
        'div',
        { class: 'consent-warning' },
        el('p', {}, 'This tool has not been approved by the department yet. It is for testing and informational purposes only.'),
        el('label', { class: 'consent-ack' }, ack, el('span', {}, 'I understand — this tool is under testing and not yet approved by the department.')),
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
      el('fieldset', { class: 'field group step consent-program-group' }, el('legend', { class: 'step-title' }, 'Which degree are you working toward?'), programRadios),
      backgroundBlock,
      el('div', { class: 'consent-actions' }, agreeButton, hint),
    ),
  );
  // The page behind the opening dialog is hidden until it closes (DGS
  // 2026-09-23): a half-read report under a modal invited reading the wrong
  // program's results. The class goes on <html> so the backdrop still covers
  // the viewport.
  document.documentElement.classList.add('opening-dialog');
  // Only the button closes the notice (DGS 2026-09-23: Escape must not). Set
  // once the button has done its work, so the `close` event that follows is
  // not mistaken for an attempt to dismiss it.
  let finished = false;
  const closeConsent = (): void => {
    if (finished) return;
    finished = true;
    document.documentElement.classList.remove('opening-dialog');
    // The answer takes effect BEFORE the dialog goes, so that by the time
    // anything can observe the notice gone, the page behind it already shows
    // the chosen program — otherwise a script (or a fast reader) can act on a
    // page that is about to re-render underneath them.
    const answered = completeBackground(chosenBackground, chosenProgram ?? student.program);
    const backgroundChanged = answered !== undefined && JSON.stringify(answered) !== JSON.stringify(student.background);
    if ((chosenProgram && chosenProgram !== student.program) || backgroundChanged) {
      update((s) => {
        if (chosenProgram) s.program = chosenProgram;
        if (answered) applyBackground(s, answered);
      });
    }
    if (consentDialog.open) consentDialog.close();
    consentDialog.remove();
    returnFocusTo();
  };
  agreeButton.addEventListener('click', closeConsent);
  // Escape never closes it (DGS 2026-09-23; until then it closed the notice
  // once every family was answered). Three layers, because browsers differ:
  // the keydown is cancelled, which stops the close request where the HTML
  // spec's close-watcher rules apply; the `cancel` event is cancelled; and
  // Chrome, which lets a second Escape close a dialog whose `cancel` was
  // refused, finds the notice opened again straight away.
  consentDialog.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') e.preventDefault();
    // Enter continues once the button is live (DGS 2026-10-04: "let an Enter
    // key pressed by the user click the Continue button"), wherever the focus
    // is in the notice — the tick box just ticked, a choice — except where
    // Enter already does something of its own: a link (the DGS's address), a
    // button (Continue itself clicks natively), a drop-down or a text area.
    // Not while an input method is composing, nor with a modifier held.
    if (e.key !== 'Enter' || e.isComposing || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
    const target = e.target as HTMLElement;
    if (target.closest('a, button, select, textarea, summary')) return;
    // A typed value (the year of a transfer) is taken first: leaving the box
    // fires its change, which records the answer — so Continue never goes
    // on with the value from before the edit, and goes on only if every
    // answer is still complete.
    if (target instanceof HTMLInputElement && target.type !== 'checkbox' && target.type !== 'radio') {
      target.blur();
      if (!isReady()) {
        target.focus();
        return;
      }
    }
    if (!isReady()) return;
    e.preventDefault();
    agreeButton.click();
  });
  consentDialog.addEventListener('cancel', (e) => e.preventDefault());
  consentDialog.addEventListener('close', () => {
    if (finished || !consentDialog.isConnected) return;
    if (openModal(consentDialog)) (consentDialog.querySelector<HTMLElement>('input:checked') ?? agreeButton).focus();
  });
  labelCitationsIn(consentDialog); // outside the root: "CSE Handbook §4" on the program choices (DGS 2026-10-03)
  document.body.append(consentDialog);
  placeInFrame(consentDialog); // embed mode: at the top of the frame, not the middle of a tall page (DGS 2026-09-16)
  // Focus the first thing to answer while the button is inactive (it used to
  // fall through to the DGS's email link).
  if (openModal(consentDialog)) (agreeButton.hasAttribute('disabled') ? consentDialog.querySelector<HTMLElement>('input[type=radio]') ?? agreeButton : agreeButton).focus();
  };
  openOpeningDialog(saved);

  // Established on the loading card (DGS 2026-09-07): the date at Notre Dame,
  // from the server this page came from when it answers, and read in Notre
  // Dame's own zone either way — never the device's idea of the calendar.
  const todayIso = today.iso;
  // No default (policy review 2026-10-03, P1-residency-enrollment-c7): with
  // the Parameters row missing the residency rows cannot be evaluated, and
  // the Full-time terms list says so instead of counting from a built-in 9.
  const fullTimeFloor = rules.parameters.number('fulltime_credits_min');
  // The universities the ExternalCourses tab knows, for both University
  // boxes (manual course form, previous-transcript preview) — one
  // datalist per page (2026-09-06 evening). Built once, like the course list
  // below: both depend on the rules alone, and render() re-attaches the same
  // nodes on every rebuild.
  const knownUniversitiesList = el('datalist', { id: 'known-universities' }, ...knownUniversities(rules.external).map((u) => el('option', { value: u })));
  const knownCoursesList = el('datalist', { id: 'known-courses' });
  for (const [id, rows] of rules.courses) {
    const row = rows[rows.length - 1]!;
    if (!row.active) continue;
    const opt = el('option', { value: id });
    opt.label = `${id} — ${row.title}`;
    knownCoursesList.append(opt);
  }
  /** §4.4.2 group suggestions for this render (2026-09-08): course id → the
   * groups the student's other courses do not cover. Set in render(), read by
   * the coursework table, which is built later in the same pass. */
  let groupChoices: Record<string, string[]> = {};

  const update = (mutate: (s: Student) => void): void => {
    mutate(student);
    saveLocal(student);
    render();
  };

  // Numbers the form refuses (interface review R1, 2026-09-18) — refusals.ts.
  // The map lives here because render() rebuilds the page from the record on
  // every change: the refused text and its sentence are put back by `data-key`.
  const refusedValues: RefusedValues = new Map();

  // The focus keeper (focus-keeper.ts): render() rebuilds the whole root, so
  // it remembers which control had focus before and restores it after.
  const { remember: rememberFocus, restore: restoreFocus, setFocusAfterRender } = createFocusKeeper(root);
  // The toast stack (toasts.ts), created once outside the root.
  const { toast, notice, cancelUndo, toastWithAction } = createToasts(setFocusAfterRender);
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
            : 'Project or thesis option set to “M.S. thesis” from your record (thesis direction or a defense). Change it under Your standing if that is wrong.',
        );
      }
    }
    // 4+1 read off the transcript (F7, 2026-09-12): Notre Dame coursework
    // registered at the GRADUATE level yet dated inside the bachelor's degree
    // is the Integrated program's signature — a regular bachelor's registers
    // its 60000-level electives as undergraduate rows.
    if (student.background === undefined && student.integratedBsMs === undefined && student.bachelorsAwarded !== undefined) {
      const signature = student.courses.find(
        (c) => isNotreDameCourse(c) && c.registeredLevel === 'graduate' && termIndex(c.term) <= termIndex(student.bachelorsAwarded!),
      );
      if (signature) {
        student.integratedBsMs = true;
        student.integratedBsMsInferred = { how: `your Notre Dame transcript, which registers ${signature.courseId} at the graduate level inside your bachelor’s degree` };
        notices.push('Integrated B.S. + M.S. (4+1) set to “Yes” — your Notre Dame transcript registers graduate-level coursework inside your bachelor’s degree. Change it in the earlier-degrees questions (Your standing → Change) if that is wrong.');
      }
    }
    if (student.program === 'phd') {
      const best = report.requirements.find((r) => r.id === 'phd.qualifier.categories')?.groupAssignments ?? {};
      const filled: string[] = [];
      for (const c of student.courses) {
        const group = best[c.courseId];
        if (!group || c.assignedGroup) continue;
        c.assignedGroup = group as CourseEntry['assignedGroup'];
        filled.push(`${c.courseId} → ${groupShortName(rules, group)}`);
      }
      if (filled.length > 0) {
        notices.push(
          `Specialization group chosen automatically to cover the most distinct groups (§4.4.2): ${filled.join('; ')}. You can change it next to the course.`,
        );
      }
    }
    return notices;
  }

  // The Who-to-contact card lives in one of two places by width, as on the
  // course rules page (DGS 2026-09-30: "move the contacts to the top right
  // corner, just like in the course rule page"): the masthead's right-hand
  // column from 900 px up, the end of the page below that and in the frame.
  // Two empty hosts, one node moved between them — one card in the document,
  // no duplicate heading. (B1 of 2026-09-18 had put it at the end in every
  // mode; the DGS wants it back at the top on a desk.)
  const contactHost = el('div', { class: 'contact-host' });
  const mainContactHost = el('div', { class: 'contact-host' });
  const contactNode = contactCard();
  const placeContact = (wide: boolean): void => {
    (wide && !isEmbedded() ? contactHost : mainContactHost).append(contactNode);
  };
  const wideEnough = typeof window.matchMedia === 'function' ? window.matchMedia('(min-width: 900px)') : undefined;
  placeContact(wideEnough ? wideEnough.matches : true);
  wideEnough?.addEventListener?.('change', (ev) => placeContact((ev as MediaQueryListEvent).matches));

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
    // The engine's classification of the record, once per render: the review
    // card, the milestones card and the Grad Admin request all read it.
    const { classified } = classify(student, rules);
    // What the record calls for next (DGS 2026-09-27): read once here, drawn
    // under the dial, in the phone summary and as the numbered list.
    const next = {
      sentence: courseworkSentence(report),
      steps: nextSteps({
        report,
        student,
        review: (() => {
          const pending = coursesNeedingDgsReviewFor(classified, student);
          return { unlisted: pending.filter((p) => p.unlisted).length, caseByCase: pending.filter((p) => !p.unlisted).length };
        })(),
        processingCount: gradAdminRequest(report, student, rules, { todayIso, entryTerm: termLabel(student.entryTerm), priorStudy: PRIOR_LABELS[student.priorMs], gpa: student.gpa }, classified).items.count,
      }),
      nearest: nearestDeadline(report),
    };
    clear(root);
    root.append(
      // Landmarks + a skip link (usability review 2026-09-05, item 7): header
      // → main (notices, inputs, report, footer); the skip link jumps a
      // keyboard user straight to the report.
      el('a', { class: 'skip-link', href: '#report' }, 'Skip to the report'),
      masthead(report),
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
        knownUniversitiesList,
        rules.source === 'snapshot' ? snapshotBanner() : null,
        // Phones and small tablets (2026-09-05, review item 2): the result
        // first, then the inputs, then the full report — plus a sticky score
        // bar with jump links (both hidden on wide screens by CSS).
        // On a narrow screen the report's summary sits ABOVE the inputs, which
        // is right once there is something to summarise — and 252 px of
        // "Getting started" between the student and the first control when
        // there is not (blue-team B1, 2026-09-18). An untouched record shows it
        // at the bottom with the rest of the report instead.
        untouched ? null : renderSummary(report, next),
        el(
          'div',
          { class: 'layout' },
          el(
            'div',
            { class: 'inputs', id: 'inputs' },
            transcriptsCard(),
            standingCard(classified),
            coursesCard(report.courseLines),
            askDgsCard(classified, report),
            milestonesCard(classified, report),
            askGradAdminCard(report, classified),
            saveCard(report),
            diagnosticsCard(),
          ),
          el(
            'div',
            { class: 'audit-col', id: 'report', tabindex: '-1', 'aria-label': 'Your report' },
            // The warnings live inside the report since 2026-09-27, folded
            // under the meters (report.ts).
            renderReport(report, untouched, next),
            // The finish card that stood here (R7, 2026-09-18: Reset at the
            // end for a shared machine) repeated the storage card's sentence
            // and its Save button; the DGS removed it on 2026-09-22 — Reset
            // sits in the storage card next to Print, and the advisor summary
            // button in the tools row at the top.
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
    );
    // "Oral Candidacy Exam (OCE)" in full once, then "OCE" (DGS 2026-09-06
    // evening) — text nodes only, in document order, before focus is restored.
    applyFirstMentionRule(root);
    applyDeciderRule(root, student.program); // DGS → ADGS for an MSCSE student (2026-09-11)
    labelCitationsIn(root); // "CSE §4.2" — which document a section is from (DGS 2026-10-03)
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

  function masthead(report: ReturnType<typeof audit>): HTMLElement {
    // The two program buttons expose their pressed state (item 5): a screen
    // reader says "M.S. in CSE §3, toggle button, pressed".
    // The program tabs are gone (DGS 2026-09-22): the degree is chosen in the
    // opening dialog, and Reset brings that dialog back.
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
        // The eyebrow shares its line with the Auto · Light · Dark switch
        // (night mode, DGS 2026-10-04 — src/ui/theme.ts); embedded, the
        // switch is alone on it.
        el(
          'div',
          { class: 'masthead-top' },
          embed ? null : el('div', { class: 'eyebrow' }, 'University of Notre Dame · Computer Science and Engineering'),
          themeToggle(),
        ),
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
                // Which document a section is from, once (DGS 2026-10-03); the
                // embedded page carries the same key in the report's glossary.
                '; every check cites its section (CSE § is that handbook; Academic Code § and DGS Handbook § are the Graduate School’s). The courses that count are on the ',
                el('a', siblingAnchorAttrs('course-rules', window.location.search, isEmbedded()), 'course rules page'),
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
      // The Who-to-contact card's desk-width host (DGS 2026-09-30) — the
      // masthead's right-hand column, as on the course rules page. Below
      // 900 px and in the frame the card is at the end of the page instead
      // (B1 of 2026-09-18 kept for those).
      embed ? null : contactHost,
      el(
        'div',
        { class: 'masthead-tools' },
        el('span', { class: 'program-name' }, student.program === 'mscse' ? 'M.S. in CSE (Handbook §3)' : 'Ph.D. (Handbook §4)'),
        el(
          'div',
          {},
          el('button', { class: 'btn', 'data-key': 'tools.example', onclick: loadExample }, 'Load example'),
          // The storage card's three buttons, here too (DGS 2026-09-24), between
          // Load example and the advisor summary. "Load a file" opens the storage
          // card's own file input, so there is one import path.
          el('button', { class: 'btn', 'data-key': 'tools.save', onclick: () => exportFile(student) }, 'Save to a file'),
          el('button', { class: 'btn', 'data-key': 'tools.load', onclick: () => document.querySelector<HTMLInputElement>('[data-key="save.fileinput"]')?.click() }, 'Load a file'),
          el('button', { class: 'btn', 'data-key': 'tools.print', onclick: () => window.print() }, 'Print'),
          // Between Load example and Reset (DGS 2026-09-22); it was at the end
          // of the report from the trim review (P-72) until then.
          advisorSummaryButton(report),
          el('button', { class: 'btn', 'data-key': 'tools.reset', onclick: resetAll }, 'Reset'),
        ),
      ),
    );
  }

  /** Two slim strips (DGS 2026-09-19): red for the alpha status, green for
   * privacy — the alpha line and the privacy line, each ONE sentence above
   * the fold (blue-team B1, 2026-09-18 — the first control must stay on the
   * first screen), each with a "Details" expander that holds the full
   * DGS-worded paragraph unchanged; both paragraphs are also in the footer
   * and the copied summary. The privacy strip keeps its place right under
   * the alpha text (DGS placement, 2026-09-03). They were one strip from the
   * usability review (2026-09-05, item 8 — two stacked banners folded into
   * one) until the split. */
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
        el('a', siblingAnchorAttrs('course-rules', window.location.search, isEmbedded()), 'course rules page'),
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

  /** What the earlier-degrees answer means for THIS student, one sentence
   * with the numbers from the Parameters tab (clarity review 2026-09-26) —
   * in place of "(§5.2 transfer caps, the MSCSE already held and the
   * Integrated 4+1 follow from this.)", which named the rules and not the
   * consequence. */
  function backgroundConsequence(): string {
    const b = student.background;
    if (!b) return ' (§5.2 transfer allowances, the MSCSE already held and the Integrated 4+1 follow from this.)';
    const n = (key: string): string => {
      const v = rules.parameters.number(key);
      return v === undefined ? 'a number of' : String(v);
    };
    const finished = n(student.program === 'mscse' ? 'ms_transfer_completed_ms_credits_max' : 'phd_transfer_completed_ms_credits_max');
    const unfinished = n('transfer_unfinished_ms_credits_max');
    if (b.graduate === 'elsewhere') {
      return b.finished
        ? ` You finished a graduate degree elsewhere, so up to ${finished} credits from it may transfer (§5.2); it would be ${unfinished} if that program were unfinished.`
        : ` Your earlier graduate program was not finished, so up to ${unfinished} credits from it may transfer (§5.2); it would be ${finished} after a finished degree.`;
    }
    if (b.graduate === 'nd-mscse' || b.graduate === 'nd-4plus1') {
      // DGS 2026-10-03: "Within CSE, the graduate school treats MS and PhD the
      // same graduate program" — so the MSCSE's coursework is Ph.D. coursework.
      return ` Your Notre Dame MSCSE coursework is not transfer credit: the Graduate School treats the CSE MSCSE and Ph.D. as one graduate program, so each MSCSE course not applied to your bachelor’s degree counts as Ph.D. coursework — its own line says how${b.graduate === 'nd-4plus1' ? ', and courses shared with your bachelor’s degree follow §3.5' : ''}.`;
    }
    if (b.graduate === 'nd-mscse-transfer') return ` No earlier degree, so up to ${unfinished} credits from another university may transfer (§5.2); your MSCSE coursework counts as Ph.D. coursework (one graduate program). The §4.3 eight years and the eighth semester for the OCE and for admission to candidacy count from the semester you started the MSCSE; the §4.4 qualifier clocks and the first-year seminars (§4.2) from your transfer.`;
    if (b.graduate === 'nd-other') {
      // Another Notre Dame department is "another graduate program at Notre
      // Dame" (Academic Code §4.6; DGS 2026-10-03) — the §5.2 caps apply.
      return b.finished
        ? ` You finished a graduate degree at Notre Dame in another department — another graduate program under §5.2, so up to ${finished} credits from it may transfer; it would be ${unfinished} if that program were unfinished.`
        : ` Your earlier Notre Dame program in another department was not finished — another graduate program under §5.2, so up to ${unfinished} credits from it may transfer; it would be ${finished} after a finished degree.`;
    }
    return ` No graduate degree before this program, so up to ${unfinished} credits from another university may transfer (§5.2).`;
  }
  /** The whose-semester sentence, only for a student who came through the
   * Notre Dame MSCSE (DGS 2026-09-27, clarity proposal 5); it stood on every
   * Ph.D. record before. */
  function mscseClockSentence(): string {
    const cameThroughMscse = student.program === 'phd' && (student.background?.graduate === 'nd-mscse-transfer' || student.ndMasters !== undefined);
    return cameThroughMscse ? ' Came into the Ph.D. from an unfinished Notre Dame MSCSE? Then this is the semester you started the MSCSE (§4.3, §4.5 and admission to candidacy count from it; the §4.4 qualifier clocks and the first-year seminars from your transfer). Finished the MSCSE first? Then it is the semester you started the Ph.D. (§4.5).' : '';
  }
  function standingCard(classified: readonly ClassifiedCourse[]): HTMLElement {
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
        // …unless the earlier-degrees questions are answered: the answer
        // settles both facts, and re-deriving them from ANY Notre Dame
        // conferral let a master's from another department flip a Ph.D. record
        // into the own-MSCSE path (policy review 2026-10-03; the import path
        // has had this guard since 2026-09-22).
        if (s.background === undefined) {
          deriveNdMasters(s);
          derivePriorMs(s);
        }
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
    seasonSel.append(...entrySeasonOptions(student.entryTerm.season));
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
    }, refusedValues, toast);
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
            ? `The residency count (§4.3) and every deadline (§4.2’s first-year seminars, §4.3, §4.4, §4.4.3, §4.5 and admission to candidacy) are counted from this term — your matriculation at the Graduate School, which a transfer from another Notre Dame program does not reset.${mscseClockSentence()}`
            : 'The residency count and the five-year limit on completing the degree (§3.3) are counted from this term.',
          inferred.alternative ? ` Note: ${inferred.alternative.why}.` : '',
        )
      : null;
    // The prior-degree controls — "Prior graduate study", "I already hold the
    // MSCSE", the Integrated 4+1 question — left this card on 2026-09-22 (DGS):
    // the opening dialog's earlier-degrees questions settle all three
    // (applyBackground), and this line says what they settled, with the way
    // to change it. A record from before the questions shows the way to answer.
    const changeKey = 'standing.background.change';
    const earlierDegreesLine = el(
      'p',
      { class: 'hint background-line', 'data-key': 'standing.background' },
      el('strong', {}, 'Earlier degrees: '),
      student.background ? describeBackground(student.background) + ' — ' : 'not answered yet — ',
      el('button', { class: 'btn tiny link', 'data-key': changeKey, onclick: () => openBackgroundDialog(student, update, changeKey) }, student.background ? 'Change' : 'Answer two questions'),
      '.',
      backgroundConsequence(),
    );
    // Bachelor's degree awarded (DGS 2026-09-06): graduate-level courses dated
    // in or before this term earn no transfer credit — §5.2 needs graduate
    // student status (allocate.ts). Required since 2026-09-07 (DGS), though
    // the year is still the switch for the stored value (empty = unknown) and
    // the semester defaults to spring (May commencement). A
    // transcript import fills it in when it finds a dated bachelor's award;
    // the note says so until the student touches either control.
    const awarded = student.bachelorsAwarded;
    const bsSeason = el('select', { 'aria-label': 'Bachelor’s degree awarded — semester', 'data-key': 'standing.bachelors.season' });
    bsSeason.append(...seasonOptions(awarded?.season ?? 'spring'));
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
    }, refusedValues, toast);
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
    // A standalone master's transcript (DGS 2026-09-20): the award is only
    // known to be BEFORE the master's first semester, and that is what the
    // field says — no season, no year, nothing required — until the student
    // chooses to set the exact term.
    const bsBefore = bsInferred?.before;
    const bsBeforeLine = bsBefore
      ? el(
          'div',
          { class: 'pair bachelors-before' },
          el('span', { class: 'bachelors-before-text', 'data-key': 'standing.bachelors.before' }, `Before ${termLabel(bsBefore)}`),
          el(
            'button',
            {
              class: 'btn tiny',
              'data-key': 'standing.bachelors.exact',
              onclick: () =>
                update((s) => {
                  // Keep the value; drop the "before" reading so the season and year show, pre-filled.
                  if (s.bachelorsAwardedInferred) s.bachelorsAwardedInferred = { how: s.bachelorsAwardedInferred.how };
                }),
            },
            'Set the exact semester',
          ),
        )
      : undefined;
    const bsNote = el(
      'p',
      // Required since 2026-09-07 (DGS): every student has a bachelor's
      // degree, and §5.2 counts a course as transfer credit only if it was
      // taken after that degree — so the term is needed whether or not the
      // student also holds a graduate degree. An unset field always warns.
      { class: `hint${(bsInferred && !bsBefore) || awarded === undefined ? ' warn' : ''} field-hint bachelors-note` },
      awarded && bsBefore
        ? `Your master’s transcript starts in ${termLabel(bsBefore)}, so your bachelor’s degree counts as awarded before then — which is all §5.2 needs for the courses on it. Set the exact semester only if you also have coursework from before your master’s.`
        : awarded && bsInferred
        ? `${termLabel(awarded)} was read from your transcript (${bsInferred.how}). Check it — courses taken in or before this term, even graduate-level ones, are not counted as transfer credit (§5.2: graduate student status).`
        : awarded
          ? 'Courses taken in or before this term, even graduate-level ones, are not counted as transfer credit (§5.2: graduate student status).'
          : hasGraduateTransfers
            ? 'Required, and you already have coursework from before Notre Dame: enter the semester your bachelor’s degree was awarded. Courses taken in or before it, even graduate-level ones, cannot transfer (§5.2); until it is set, every graduate-level course from before Notre Dame is taken as graduate coursework.'
            // The legend above already names the field (trim review 2026-09-18, P-23).
            : 'Required for every student, with or without a graduate degree: §5.2 counts a course as transfer credit only when it was taken after the bachelor’s degree.',
    );
    const card = el(
      'section',
      { class: 'card', id: 'standing' },
      el('h2', {}, el('span', { class: 'step-no' }, '2. '), 'Your standing ', el('span', { class: 'chip-note' }, currentSemesterChip())),
      // A fieldset with a legend (item 5): the two controls share one question.
      fieldset(enteredProgramLabel(), el('div', { class: 'pair' }, seasonSel, yearInput)),
      yearError,
      // What this field drives (item 11) — the longer note takes over while
      // the term is inferred or assumed.
      entryNote ??
        el(
          'p',
          { class: 'hint field-hint' },
          'Every deadline and the residency count are counted from this term.' +
            // Whose semester 1 (DGS 2026-09-26): the MSCSE start for a transfer
            // into the Ph.D., the Ph.D. start after a finished MSCSE.
            (student.program === 'phd'
              ? mscseClockSentence()
              : ''),
        ),
      bsBeforeLine ? fieldset('Bachelor’s degree awarded', bsBeforeLine) : fieldset('Bachelor’s degree awarded (required)', el('div', { class: 'pair' }, bsSeason, bsYear)),
      bsBeforeLine ? null : bsYearError,
      bsNote,
      earlierDegreesLine,
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

    const ftTerms = fullTimeTerms(classified);
    if (ftTerms) card.append(ftTerms);
    card.append(clockFields());
    card.append(probationField());
    card.append(dualDegreeField());
    const nonDegree = nonDegreeQuestion(classified);
    if (nonDegree) card.append(nonDegree);
    return card;
  }

  /** The facts that move a clock, or send a record to the DGS (policy review
   * 2026-10-03): semesters on an approved leave of absence and childbirth/
   * adoption accommodations (each pushes the §4.3 limit and §4.5's eighth
   * semester out by a semester — Academic Code §6.2.6, §5.4; DGS Handbook §3.4,
   * §3.7.2), and a readmission after a withdrawal or a missed semester
   * (Academic Code §5.5; DGS Handbook §3.1, §3.3). */
  /** On probation, with a deadline in the letter (Academic Code §5.7.2) — a
   * rare case (DGS 2026-10-04, policy review P2-ac-5b-6.1-3), behind a
   * selector that is open once a date is on file. The report says at the top
   * that the letter's date governs; nothing is recomputed. */
  function probationField(): HTMLElement {
    const input = el('input', {
      type: 'date',
      value: student.probationLetterDeadline ?? '',
      'data-key': 'standing.probation',
      'aria-label': 'Deadline in your probation letter',
      onchange: (e) => {
        const v = (e.target as HTMLInputElement).value;
        update((s) => void (s.probationLetterDeadline = /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined));
      },
    });
    return rareFold(
      'probation',
      // Closed by default (DGS 2026-10-04); a date on file is in the summary.
      student.probationLetterDeadline !== undefined ? `On probation, with a deadline in the letter? — on file: ${student.probationLetterDeadline}` : 'On probation, with a deadline in the letter?',
      false,
      el(
        'div',
        { class: 'field' },
        el('label', { class: 'label' }, 'Deadline in your probation letter (Academic Code §5.7.2)', input),
        policyFold(
          'probation',
          el(
          'p',
          { class: 'hint field-hint' },
          'Only if you are on probation. The letter’s stipulations and its deadline govern — they can come before the deadlines on this page (the candidacy exam by the end of next semester, say), and missing them can lead to dismissal (Academic Code §5.8). Leave blank otherwise.',
          ),
        ),
      ),
    );
  }

  /** Enrolled in a second Notre Dame degree program at the same time (Academic
   * Code §2.2; DGS Handbook §2.9 — policy review 2026-10-04, P2-ac-1-3-2): a
   * rare case, behind a selector open once answered. A yes offers each Notre
   * Dame course the "Also counts toward my other degree" tick. */
  function dualDegreeField(): HTMLElement {
    // Its own key, not an `attest.` one: a fact about the student, not an
    // approval (and the a11y driver's focus check takes the first `attest.`).
    const cb = el('input', {
      type: 'checkbox',
      'data-key': 'standing.concurrentDegree',
      onchange: (e) => update((s) => void (s.concurrentDegree = (e.target as HTMLInputElement).checked ? true : undefined)),
    }) as HTMLInputElement;
    cb.checked = student.concurrentDegree === true;
    return rareFold(
      'dual-degree',
      // Closed by default (DGS 2026-10-04); a yes on file is in the summary.
      student.concurrentDegree === true ? 'Enrolled in a second Notre Dame degree program at the same time? — on file: yes' : 'Enrolled in a second Notre Dame degree program at the same time?',
      false,
      el('label', { class: 'attest' }, cb, ' I am enrolled in a second Notre Dame degree program at the same time — a dual degree (Academic Code §2.2)'),
      policyFold(
        'dual-degree',
        el(
          'p',
          { class: 'hint field-hint' },
          'Then tick “Also counts toward my other degree” on each course in Your coursework that the other program counts too. At most nine credits of those courses count toward this degree (Academic Code §2.2), once the Graduate School has approved your dual-degree plan of study (DGS Handbook §2.9).',
        ),
      ),
    );
  }

  /** The falls and springs a Notre Dame transcript shows no registration in —
   * strictly between the first and the last semester with a Notre Dame course
   * from the entry term on. Undefined when no Notre Dame transcript was
   * imported: a hand-entered record may leave a research-only semester empty,
   * so nothing is read into an empty semester there (2026-10-04). */
  function transcriptGaps(): Term[] | undefined {
    if (!student.courses.some((c) => c.fromNdTranscript)) return undefined;
    const entry = normalizeEntryTerm(student.entryTerm).term;
    const seqs = new Set(student.courses.filter((c) => c.origin === 'nd' && c.term.season !== 'summer' && termIndex(c.term) >= termIndex(entry)).map((c) => semesterSeq(c.term)));
    if (seqs.size === 0) return [];
    const first = Math.min(...seqs);
    const last = Math.max(...seqs);
    const out: Term[] = [];
    for (let seq = first + 1; seq < last; seq++) if (!seqs.has(seq)) out.push({ season: seq % 2 === 1 ? 'fall' : 'spring', year: Math.floor(seq / 2) });
    return out;
  }

  function clockFields(): HTMLElement {
    const phd = student.program === 'phd';
    const count = (key: 'leaveSemesters' | 'accommodationSemesters', label: string, hint: string): HTMLElement => {
      const input = el('input', {
        type: 'number',
        min: '0',
        max: '20',
        step: '1',
        value: student[key] === undefined ? '' : String(student[key]),
        'data-key': `standing.${key}`,
        'aria-label': label,
        onchange: (e) => {
          const raw = (e.target as HTMLInputElement).value.trim();
          const n = Number(raw);
          update((s) => void (s[key] = raw === '' || !Number.isInteger(n) || n < 0 ? undefined : Math.min(20, n)));
        },
      });
      return el('div', { class: 'field' }, el('label', { class: 'label' }, label, input), policyFold(`clocks.${key}`, el('p', { class: 'hint field-hint' }, hint)));
    };
    const readmitted = student.readmittedTerm;
    const reSeason = el('select', { 'aria-label': 'Readmitted — semester', 'data-key': 'standing.readmitted.season' });
    reSeason.append(...entrySeasonOptions(readmitted?.season ?? 'fall'));
    const setReadmitted = (year: number | undefined): void =>
      update((s) => void (s.readmittedTerm = year === undefined ? undefined : { season: (reSeason as HTMLSelectElement).value as Season, year }));
    const { input: reYear, error: reYearError } = rangedNumber({
      key: 'standing.readmitted.year',
      range: TERM_YEAR_RANGE,
      value: readmitted ? String(readmitted.year) : '',
      allowEmpty: true,
      attrs: { 'aria-label': 'Readmitted — year', placeholder: 'year' },
      commit: setReadmitted,
    }, refusedValues, toast);
    reSeason.addEventListener('change', () => {
      const text = (reYear as HTMLInputElement).value;
      if (text !== '' && inRange(Number(text), TERM_YEAR_RANGE)) setReadmitted(Number(text));
    });
    // Uncommon: behind a selector (DGS 2026-10-03), closed unless a transcript
    // gap needs an answer (DGS 2026-10-04, below).
    // Read from the Notre Dame transcript (DGS 2026-10-04: shown "only when
    // they are applicable according to the transcript"): a leave, a
    // withdrawal or a missed semester leaves a fall or spring with no
    // registration between the first and the last semester on it. None, and
    // only the childbirth or adoption accommodation is asked — a transcript
    // does not show that. Without a transcript, or with an answer on file,
    // everything is asked as before.
    const gaps = transcriptGaps();
    const leaveAsked = gaps === undefined || gaps.length > 0 || (student.leaveSemesters ?? 0) > 0 || student.readmittedTerm !== undefined;
    const summary =
      gaps !== undefined && gaps.length > 0
        ? `Your transcript shows no registration in ${gaps.map(termLabel).join(', ')} — a leave of absence, a withdrawal or a missed semester?`
        : leaveAsked
          ? 'A leave of absence, a childbirth or adoption accommodation, or a readmission?'
          : 'A childbirth or adoption accommodation?';
    // Closed by default; open only when a transcript gap is waiting for an
    // answer (DGS 2026-10-04: "Open one if an attention is needed there (e.g.,
    // found a gap semester)"). What is on file is said in the summary line.
    const onFile = [
      ...((student.leaveSemesters ?? 0) > 0 ? [`${student.leaveSemesters} leave ${student.leaveSemesters === 1 ? 'semester' : 'semesters'}`] : []),
      ...((student.accommodationSemesters ?? 0) > 0 ? [`${student.accommodationSemesters} accommodation ${student.accommodationSemesters === 1 ? 'semester' : 'semesters'}`] : []),
      ...(student.readmittedTerm ? [`readmitted ${termLabel(student.readmittedTerm)}`] : []),
    ];
    const gapUnanswered = gaps !== undefined && gaps.length > 0 && (student.leaveSemesters ?? 0) === 0 && student.readmittedTerm === undefined;
    return rareFold(
      'clocks',
      onFile.length > 0 ? `${summary} — on file: ${onFile.join(', ')}` : summary,
      gapUnanswered,
      el(
      'fieldset',
      { class: 'ft-terms clock-fields' },
      el('legend', { class: 'label' }, `${leaveAsked ? 'Leaves, accommodations and readmission' : 'Childbirth or adoption accommodation'} (${phd ? '§4.3, §4.5' : '§3.3'}; Graduate School)`),
      !leaveAsked ? null : count(
        'leaveSemesters',
        'Semesters on an approved leave of absence',
        `Fall or spring semesters the Graduate School approved as a leave of absence (at most two in a row, Academic Code §5.1). A leave stops the clock: each semester here moves ${phd ? 'the eight-year limit (§4.3) and the eighth-semester deadlines for the Oral Candidacy Exam (OCE) (§4.5) and for admission to doctoral candidacy (DGS Handbook §3.22.3)' : 'the five-year limit (§3.3)'} out by a semester (DGS Handbook §3.4, §3.7.2). A six-week medical or crisis separation is not a leave and does not count (DGS Handbook §3.5, §3.6).`,
      ),
      count(
        'accommodationSemesters',
        'Childbirth or adoption accommodation semesters',
        `Semesters of the Graduate School’s childbirth and adoption accommodation (Academic Code §5.4): each extends ${phd ? 'the eight-year limit and the eighth-semester deadlines for the OCE and for admission to candidacy' : 'the five-year limit'} by a semester (DGS Handbook §3.7.2).`,
      ),
      !leaveAsked ? null : el(
        'div',
        { class: 'field' },
        el('span', { class: 'label' }, 'Readmitted after a withdrawal or a missed semester — semester (leave blank if it does not apply)'),
        el('div', { class: 'pair' }, reSeason, reYear),
        reYearError,
        policyFold(
          'clocks.readmitted',
          el(
          'p',
          { class: 'hint field-hint' },
          // A missed fall or spring semester needs readmission too (policy
          // review 2026-10-04, P2-dh-3.1-3.13-3; DGS Handbook §3.1). An empty
          // semester is never read as one: research-only semesters are empty.
          'If you withdrew from the University, or missed a fall or spring semester (no Roll Call and registration) without an approved leave, you had to be readmitted (DGS Handbook §3.1, §3.3): enter the readmission semester. Every clock still counts from your original entry term (Academic Code §6.2.6: “from the time of matriculation”). Your courses from before it wait for the DGS — the program may reject some or all past credits (DGS Handbook §3.3), and after an interruption of five years or more the Code forfeits them (Academic Code §5.5).',
          ),
        ),
      ),
      ),
    );
  }

  /** Academic Code §2.3's non-degree coursework: asked only when the record
   * holds Notre Dame graduate courses from before the entry term with no
   * earlier graduate program to explain them (DGS 2026-10-03: "Ask the
   * question only when such courses are detected based on the admission term"). */
  function nonDegreeQuestion(classified: readonly ClassifiedCourse[]): HTMLElement | null {
    const detected = classified.filter(
      (c) =>
        c.entry.origin === 'transfer' &&
        isNotreDameInstitution(c.entry.institution) &&
        c.entry.degreeLevel !== 'bachelors' &&
        termIndex(c.entry.term) < termIndex(student.entryTerm) &&
        student.priorMs === 'none' &&
        student.ndMasters === undefined &&
        student.background?.graduate !== 'nd-mscse-transfer',
    );
    if (detected.length === 0 && student.ndNonDegree === undefined) return null;
    const radiosEl = radios(
      'standing.ndNonDegree',
      [
        ['', 'Not answered'],
        ['yes', 'Yes — I was a non-degree (unclassified) student then'],
        ['no', 'No'],
      ],
      student.ndNonDegree === undefined ? '' : student.ndNonDegree ? 'yes' : 'no',
      (value) => update((s) => void (s.ndNonDegree = value === '' ? undefined : value === 'yes')),
    );
    return el(
      'fieldset',
      { class: 'ft-terms nondegree' },
      el('legend', { class: 'label' }, 'Notre Dame graduate courses before you were admitted (Academic Code §2.3)'),
      el(
        'p',
        { class: 'hint' },
        `${plural(detected.length, 'course')} on your record ${detected.length === 1 ? 'is' : 'are'} dated before your entry term with no earlier graduate program to explain ${detected.length === 1 ? 'it' : 'them'} (${detected.map((c) => c.entry.courseId).join(', ')}). Were you a non-degree (unclassified) student at Notre Dame when you took ${detected.length === 1 ? 'it' : 'them'}? If so, up to 12 such credits may count toward the degree (Academic Code §2.3) — the DGS decides, and the review request asks.`,
      ),
      radiosEl,
    );
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

  /** The full-time-terms fieldset, or null while the record has no term to list. */
  function fullTimeTerms(classified: readonly ClassifiedCourse[]): HTMLElement | null {
    // The MSCSE's summer floor (DGS Handbook §10.3.2; DGS 2026-10-04), the same
    // one the residency row reads; undefined on the Ph.D. tab. Read here, not
    // once at start: the program can change under Reset.
    const summerFloor = summerFullTimeFloor(student.program, (k) => rules.parameters.number(k));
    // Residency (decision Q8): ≥9 entered credits marks a term full-time
    // automatically; these checkboxes cover research-heavy terms that aren't.
    // Only terms from the entry term on: residence is counted in THIS program
    // (2026-09-05 — the engine's residency.ts applies the same guard).
    // EVERY fall and spring from the entry term to the current semester is
    // listed (policy review 2026-10-03; DGS: "List every fall/spring … so a
    // research-only term can be ticked") — a semester with no course row was
    // never shown, so a research-only semester could not be ticked and the
    // Ph.D. run broke there. Summers appear on the MSCSE tab only (§3.3's "one
    // summer session"); on the Ph.D. tab a summer tick changes nothing (§4.3).
    const entry = normalizeEntryTerm(student.entryTerm).term;
    const now = termOfDate(todayIso);
    const terms = new Map<number, Term>();
    for (let seq = semesterSeq(entry); seq <= semesterSeq(now); seq++) {
      const t: Term = { season: seq % 2 === 1 ? 'fall' : 'spring', year: Math.floor(seq / 2) };
      terms.set(termIndex(t), t);
    }
    const withSummers = student.program === 'mscse';
    for (const c of student.courses) if (c.origin === 'nd' && termIndex(c.term) >= termIndex(entry) && (withSummers || c.term.season !== 'summer')) terms.set(termIndex(c.term), c.term);
    for (const t of student.fullTimeTermOverrides ?? []) if (termIndex(t) >= termIndex(entry) && (withSummers || t.season !== 'summer')) terms.set(termIndex(t), t);
    if (withSummers) {
      for (const t of [...terms.values()]) if (t.season === 'spring' && termIndex({ season: 'summer', year: t.year }) <= termIndex(now)) terms.set(termIndex({ season: 'summer', year: t.year }), { season: 'summer', year: t.year });
    }
    if (terms.size === 0) return null;
    // A fieldset whose legend is the question (item 5); a term counted
    // automatically is stated as text, not as a disabled ticked box (item 11).
    const box = el(
      'fieldset',
      { class: 'ft-terms' },
      el('legend', { class: 'label' }, `Full-time terms (for residency, ${student.program === 'mscse' ? '§3.3' : '§4.3'})`),
      // The rule behind a selector (DGS 2026-10-04); the semesters stay in view.
      policyFold(
        'fulltime',
        el(
        'p',
        { class: 'hint' },
        fullTimeFloor === undefined
          ? 'The course rules do not give the full-time credit floor (fulltime_credits_min), so no semester is counted from your courses until the DGS adds it. Tick each semester you were registered full-time.'
          : `A semester counts automatically once the courses entered for it add up to ${fullTimeFloor} registered credits (§2.1.2; withdrawn and incomplete courses are registrations too)${summerFloor !== undefined ? `; a summer session at ${summerFloor} (DGS Handbook §10.3.2)` : ''}. Tick a semester you were registered full-time on research or in courses not entered here.`,
        ),
      ),
    );
    // What the ENGINE counts, so the card and the report agree (2026-10-03):
    // superseded same-term duplicates and unrecognised grades are out, a W
    // or an I is in.
    const records = new Map(fullTimeRecordsFrom(classified, student, fullTimeFloor, summerFloor).map((r) => [termIndex(r.term), r] as const));
    let autoCount = 0;
    let tickedCount = 0;
    // Semesters with courses that did not reach full-time (DGS 2026-10-04:
    // "do not hide them. Show those semesters with warning highlights") —
    // they break a residency run, so they are shown, highlighted, and open the
    // selector by themselves.
    let partTimeCount = 0;
    // With a Notre Dame transcript imported (DGS 2026-10-04: "If any of these
    // can be inferred from the transcripts, can they be shown only when they
    // are applicable according to the transcript?"), a semester the record has
    // no Notre Dame course for was not registered — research shows on the
    // transcript as a course — so it is not offered for a full-time tick; the
    // leave and readmission question names it instead (clockFields).
    const ndImported = student.courses.some((c) => c.fromNdTranscript);
    let listed = 0;
    let emptyUnticked = 0;
    for (const [key, t] of [...terms.entries()].sort((a, b) => a[0] - b[0])) {
      const rec = records.get(key);
      const overridden = (student.fullTimeTermOverrides ?? []).some((o) => termIndex(o) === key);
      if (ndImported && rec === undefined && !overridden) continue;
      listed += 1;
      if (rec === undefined && !overridden) emptyUnticked += 1;
      const auto = rec !== undefined && rec.fullTime && !overridden;
      if (overridden) tickedCount += 1;
      if (auto) {
        autoCount += 1;
        // Why it counted, in the engine's order (residency.ts): the semester
        // floor, a summer's own floor (DGS Handbook §10.3.2, MSCSE), or a
        // summer beside a full-time spring or fall (Academic Code §3.6).
        const why =
          rec.term.season !== 'summer' || (fullTimeFloor !== undefined && rec.credits >= fullTimeFloor)
            ? `${fullTimeFloor}+ registered credits entered`
            : summerFloor !== undefined && rec.credits >= summerFloor
              ? `${summerFloor}+ registered credits in a summer session, DGS Handbook §10.3.2`
              : 'a summer session beside a full-time semester, Academic Code §3.6';
        box.append(el('span', { class: 'ft-term ft-auto' }, el('span', { class: 'ft-check', 'aria-hidden': 'true' }, '✓'), ` ${termLabel(t)} — counted automatically (${why})`));
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
      const partTime = !overridden && fullTimeFloor !== undefined && rec !== undefined && rec.credits > 0;
      if (partTime) partTimeCount += 1;
      const partTimeText = !partTime
        ? ''
        : rec!.withdrawnOnly
          ? ' — every course withdrawn; tick only if you were registered full-time at census'
          : t.season === 'summer'
            ? ` — not full-time: ${summerFloor !== undefined ? `${rec!.credits} of ${summerFloor}` : rec!.credits} registered credits entered, and neither that spring nor that fall was full-time`
            : ` — not full-time: ${rec!.credits} of ${fullTimeFloor} registered credits entered`;
      box.append(
        el(
          'label',
          { class: partTime ? 'ft-term ft-warn' : 'ft-term' },
          cb,
          partTime
            ? ` ⚠ ${termLabel(t)}${partTimeText}`
            : ` ${termLabel(t)}${rec?.withdrawnOnly ? ' — every course withdrawn; tick only if you were registered full-time at census' : rec !== undefined && rec.credits > 0 && !overridden ? ` (${rec.credits} registered credits entered)` : ''}`,
        ),
      );
    }
    // The common case is every semester counted from the courses entered; the
    // list, and its ticks for a research-only semester, sit behind a selector
    // that says how many counted (DGS 2026-10-03). Open once a tick is on file.
    // Shown only when there is something to act on (DGS 2026-10-04): a
    // semester not full-time, a tick on file, or an empty semester that may
    // have been research only. Every semester counted from the courses needs
    // nothing here — the residency row says so.
    if (listed === 0 || (partTimeCount === 0 && tickedCount === 0 && emptyUnticked === 0)) return null;
    return rareFold(
      'fulltime',
      `Full-time semesters for residency: ${autoCount} of ${listed} counted from your courses${tickedCount > 0 ? `, ${tickedCount} ticked by you` : ''}${partTimeCount > 0 ? `, ${partTimeCount} not full-time` : ''}`,
      // Closed by default; open only while a semester shows a warning (DGS
      // 2026-10-04: "Keep … hidden by default … Open it if a warning is shown
      // there"). A tick on file is in the summary line.
      partTimeCount > 0,
      box,
    );
  }

  // ---------- coursework ----------

  /** The §5.2 transfer cap that applies to this student, as the engine reads
   * it (audit.ts capSpecs) — for the coursework card's explanation. */
  function totalCreditsWord(): string {
    const v = rules.parameters.number(student.program === 'mscse' ? 'ms_total_credits_min' : 'phd_total_credits_min');
    return v === undefined ? 'required' : String(v);
  }
  function regularCreditsWord(): string {
    const v = rules.parameters.number(student.program === 'mscse' ? 'ms_regular_credits_min' : 'phd_regular_credits_min');
    return v === undefined ? 'required' : String(v);
  }
  function fourkCreditsWord(): string {
    const v = rules.parameters.number(student.program === 'mscse' ? 'ms_4xxxx_credits_max' : 'phd_4xxxx_cse_credits_max');
    return v === undefined ? 'a limited number of' : String(v);
  }
  function sharedCreditsWord(): string {
    const v = rules.parameters.number('ms_bs_double_count_credits_max');
    return v === undefined ? 'a limited number of' : String(v);
  }
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
    }, refusedValues, toast);
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
            // §2.2 reads the registrar's cumulative GPA (Academic Code §4.5);
            // this program's own average is information, and the §2.2 row
            // asks the DGS when the two straddle the minimum (policy review 2026-10-03).
            gs.basis === 'transcript-graduate'
              ? `From your transcript's graduate-level cumulative GPA — the registrar's figure, which §2.2 reads (Academic Code §4.5)${gs.programGpa !== undefined ? `; for information, this program's courses alone average ${gs.programGpa.toFixed(2)}` : ''}${gs.undergraduateGpa !== undefined ? `; the undergraduate GPA (${gs.undergraduateGpa.toFixed(2)}) is not used` : ''}.`
              : `Computed from this program's graded courses only — a figure from an older import${gs.transcriptGpa !== undefined ? `; §2.2 reads the registrar's cumulative GPA, ${gs.transcriptGpa.toFixed(2)} on your transcript (Academic Code §4.5), so re-import the transcript or type that figure` : ''}.`,
          );
    const priorNdCourseworkWord = (c: CourseEntry): string =>
      c.degreeLevel === 'bachelors'
        ? 'undergraduate'
        : c.degreeLevel === 'phd'
          ? 'Ph.D.'
          : student.ndMasters !== undefined
            ? 'MSCSE'
            : c.degreeLevel === 'masters'
              ? 'master’s'
              : 'graduate';
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
      // Which earlier Notre Dame degree (DGS 2026-09-22: "clarify whether that
      // is MS or PhD"): the MSCSE when the student holds one, else the row's
      // own level; "graduate" only when neither says.
      const heading = priorNd
        ? `ND, before entering the program — ${priorNdCourseworkWord(e.c)} coursework`
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
      const rule = resolveRuleRow(rules, e.c.courseId, e.c.term);
      if (
        g.bachelors &&
        !(qualifierApplies && CORE_TITLE_RE.test(e.c.title ?? '')) &&
        !(qualifierApplies && findExternalRule(rules.external, e.c.institution ?? '', e.c.courseId)) &&
        !(qualifierApplies && priorNd && rule?.coreArea) &&
        !(priorNd && priorNdUndergraduateCanCount(e.c, rule, student.program))
      ) {
        g.hidden += 1;
        continue;
      }
      g.entries.push(e);
    }
    /** §5.2 said once, above every prior-graduate group (clarity review
     * 2026-09-26; until then it appeared only while a group still held a
     * candidate, so a student whose every course was refused saw three
     * struck-through rows and no rule). The three conditions the page checks
     * are named with their numbers from the Parameters tab; the cap, the CSE
     * norm and the two approvals stay as the DGS worded them (2026-09-06,
     * trimmed 2026-09-18). "Candidate" is the DGS's word. */
    const transferRule = (fromNotreDame: boolean): string => {
      const windowYears = rules.parameters.number(student.program === 'mscse' ? 'ms_transfer_window_years' : 'phd_transfer_window_years');
      const floor = rules.parameters.gradeLetter('transfer_min_grade');
      // The same term the engine measures from (allocate.ts normalises the
      // entry term), so the two can never drift (policy review 2026-10-03).
      const entry = normalizeEntryTerm(student.entryTerm).term;
      const cutoff = windowYears === undefined ? undefined : termLabel({ season: entry.season, year: entry.year - windowYears });
      const window = windowYears === undefined ? 'within the years §5.2 allows (the number is missing from the rules sheet)' : `within ${windowYears} years before you entered (${cutoff} or later)`;
      const grade = floor === undefined ? 'with the grade §5.2 requires (missing from the rules sheet)' : `with a grade of ${floor} or better (a pass/fail grade cannot show it, so the DGS decides those)`;
      return (
        `Transfer credit (§5.2): a graduate course from ${fromNotreDame ? 'your earlier Notre Dame program' : 'another university'} can count toward this degree if you took it after your bachelor’s degree, ${window}, and ${grade} — this page checks those three. ` +
        `Which courses transfer (normally CSE-related ones, up to ${transferCapLimit()} credits) is the DGS’s recommendation; the Graduate School approves it, and the Grad Admin records the credit once your university’s official transcript has reached the Graduate School. ` +
        `Until the DGS decides, every graduate course here is a candidate: the review request in the Transcripts card asks for the decisions at any time; the processing request below the milestones goes to the Grad Admin after your first semester — the Graduate School considers transfer requests only then, and before the semester your degree is conferred.`
      );
    };
    const card = el(
      'section',
      { class: 'card' },
      el('h2', {}, el('span', { class: 'step-no' }, '3. '), 'Coursework ', el('span', { class: 'chip-note' }, student.program === 'mscse' ? '§3.2' : '§4.2')),
      // "Graduate-level" (P1-gpa-c4, DGS 2026-10-03): a 4+1 or combined-transcript student
      // typing by hand must not enter the undergraduate or all-levels figure.
      field('Graduate-level cumulative GPA (from your transcript, §2.2)', gpaInput),
      gpaError,
      gpaNote,
      courseForm(),
      el('h3', { class: 'subhead', id: 'nd-courses' }, 'ND'),
      // The marks defined once, above the first table, and the one handbook
      // term that decides most of the credits (clarity review 2026-09-26).
      // One toggle for the "Counts toward" link rows (DGS 2026-09-27, "3 is
      // fine"): a plain ✓ course hides its list until asked — 35 links stood
      // on the first screen — while a conditional line ("Will count toward")
      // always shows its own. Session-only, never saved; print shows them all.
      el(
        'label',
        { class: 'check feeds-toggle' },
        (() => {
          const cb = el('input', { type: 'checkbox', 'data-key': 'courses.feeds', onchange: (e) => { showFeeds = (e.target as HTMLInputElement).checked; update(() => {}); } }) as HTMLInputElement;
          cb.checked = showFeeds;
          return cb;
        })(),
        ' Show which requirements each course feeds',
      ),
      el(
        'p',
        { class: 'hint course-key' },
        `Key: ✓ counts · ◐ in progress · ● pending approval · ✕ does not count. A regular course is a lecture course — one the course rules list as regular; seminars, research and project credits count toward the ${totalCreditsWord()} total but not toward the ${regularCreditsWord()} regular-course credits (${student.program === 'mscse' ? '§3.2' : '§4.2'}).`,
      ),
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
                  ? `Notre Dame courses you took as an undergraduate appear here when they can do something for the Ph.D.: earn credit (60000-level courses in full; up to ${fourkCreditsWord()} credits of CSE courses below that, §4.2), or show you already know a core area — Algorithms, Operating Systems, Computer Architecture (§4.4.1). Where a course could earn credit, say next to it whether your bachelor’s degree already used it — no course may count toward three degrees.`
                  : `Notre Dame courses you took as an undergraduate appear here when they can count toward the MSCSE: 60000-level courses in full, and CSE courses below that inside §3.2’s allowance. Up to ${sharedCreditsWord()} credits may apply to both your bachelor’s degree and your MSCSE (§3.5). This page chose them for you — your 40000-level CSE courses first, best grade first, keeping 60000-level coursework for the graduate degree — and each course’s line says whether it will apply to both degrees or to your MSCSE only.`
                : student.program === 'phd'
                  ? `Courses taken as an undergraduate student do not transfer, whether or not the course itself is a graduate course (§5.2). Only courses relevant to the Algorithms, Operating Systems, and Computer Architecture core-knowledge areas (§4.4.1) are listed here`
                  : `Courses taken as an undergraduate student do not transfer, whether or not the course itself is a graduate course (§5.2), and they satisfy nothing else in the MSCSE — so none of them is listed here`) +
              `${g.hidden > 0 ? ` ${plural(g.hidden, 'other course')} from this transcript ${g.hidden === 1 ? 'is' : 'are'} not shown.` : ''}`,
            )
          : el('p', { class: 'hint' }, transferRule(g.nd)),
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
    const busy = ndPreviewOpen() || importsBusy();
    const ndArgs: NdUploadArgs = { student, rules, update, toast, toastWithAction, render, blocked: busy, setFocusAfterRender, refusedValues };
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
      ndTranscriptUpload(ndArgs),
      ndPreviewOpen() ? ndTranscriptPreviewBlock(ndArgs) : null,
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
  function askDgsCard(classified: readonly ClassifiedCourse[], report: AuditReport): HTMLElement | null {
    // Which courses need a DGS decision, and why, is the engine's call
    // (src/engine/review.ts, 2026-09-06 evening — with the test matrix that
    // pins it); this card only lists them and builds the copy-ready request.
    const pending = coursesNeedingDgsReviewFor(classified, student);
    const n = pending.length;
    // Notes that are not about one course: the audit's review flags (a 4+1
    // with many undergraduate graduate-level courses counted, 2026-09-12; a
    // full-time semester without three graduate-level credits, Academic Code
    // §4.1, 2026-10-03 — whose warning says it is in this request) and the
    // checks on a `yes` the DGS may not have meant (2026-10-04, P1-sheet-48 /
    // -c2). Read from the report, so the page and the request say the same.
    const notes = [...(report.reviewFlags ?? []), ...(report.staffChecks ?? [])];
    if (n === 0 && notes.length === 0) return null;
    const what = reviewRequestSummary(n, notes.length > 0);
    const decider = deciderContact(student.program);
    const request = (p: PendingDgsReview) => ({
      courseId: p.course.entry.courseId,
      title: p.course.entry.title ?? p.course.rule?.title,
      credits: p.course.entry.credits,
      grade: p.course.entry.grade,
      termText: termLabel(p.course.entry.term),
      reason: p.reason,
      unlisted: p.unlisted,
      ask: p.ask,
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
      { class: 'card dgs-review', id: 'dgs-review' },
      el('h2', {}, `Ask the ${deciderTitle(student.program)} to review `, el('span', { class: 'chip-note' }, what)),
      el(
        'p',
        { class: 'hint' },
        el('strong', {}, 'Decisions are made only by email: '),
        `initiate the review request by clicking the button below — it opens the request for you to check and send from your own email app to the ${deciderTitle(student.program)} (`,
        mailto(decider.email),
        // The DGS's own sentence (2026-09-15) and the attach reminder
        // (2026-09-03); the email's format and the two-roles statement are
        // said by the dialog and the Grad Admin card (trim review 2026-09-18, P-5).
        '). Attach your transcript PDFs (Bachelor’s / Master’s / Ph.D. — whichever apply) to the same email.',
      ),
      // The process (DGS 2026-09-27): a course not in the course rules is
      // entered by the DGS after this request — yes, no, or case by case —
      // and the page reads the updated rules on its next visit; a
      // case-by-case course needs the DGS's answer for this student,
      // recorded by the tick on the course.
      el(
        'p',
        { class: 'hint process-note' },
        `A course that is not in the course rules yet goes to the ${deciderTitle(student.program)} through this request; the ${deciderTitle(student.program)} enters it — yes, no, or case by case — and this page reads the updated rules the next time you open it. A course marked case by case needs the ${deciderTitle(student.program)}’s answer for you: send this request, then tick the box next to the course once it is approved.`,
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
                const built = buildCombinedReviewRequest({ priorStudy: PRIOR_LABELS[student.priorMs], nd: ndReq, external: extReq, notes, history: programHistory(student), unofficial: unofficialTranscriptNote(student.courses) });
                return copyDialog({
                  what: 'Review request',
                  recipient: { role: decider.role, name: decider.name, email: decider.email },
                  subject: built.subject,
                  text: built.text,
                  html: built.html,
                  steps: [
                    { text: FILL_IN_STEP },
                    { text: 'Attach copies of your transcripts as PDFs (Bachelor’s / Master’s / Ph.D. — whichever apply) — the DGS cannot review the courses without them. The official transcript must be sent directly to the Graduate School by each university’s registrar.', emphasis: true },
                  ],
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

  function courseForm(): HTMLElement {
    // Visible labels instead of placeholders (usability review 2026-09-05,
    // item 5): a placeholder vanishes as soon as the student types.
    const idInput = el('input', { list: 'known-courses', class: 'course-id', id: 'new-course-id', 'data-key': 'course.new.id', 'aria-describedby': 'new-course-id-hint' });
    const idError = errorLine('new-course-id-error');
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
    const creditsError = errorLine('new-course-credits-error');
    const seasonSel = el('select', { 'aria-label': 'Term — semester', 'data-key': 'course.new.season' });
    seasonSel.append(...seasonOptions());
    const yearInput = el('input', {
      type: 'number',
      min: String(TERM_YEAR_RANGE.min),
      'aria-label': 'Term — year',
      'data-key': 'course.new.year',
      value: String(termOfDate(todayIso).year), // the year at Notre Dame, like every other date on the page — not the device clock
    });
    const termYearError = errorLine('new-course-year-error');
    const gradeSel = el('select', { 'data-key': 'course.new.grade' });
    for (const g of GRADES) gradeSel.append(option(g, gradeLabel(g), g === 'IP'));
    const originSel = el('select', { 'data-key': 'course.new.origin' });
    originSel.append(option('nd', 'Taken at Notre Dame', true), option('transfer', 'From another university'));
    // University: offered from the ExternalCourses tab, Title-Cased on leaving
    // the box (DGS 2026-09-06 evening); matching ignores case anyway.
    const institutionInput = el('input', { list: 'known-universities', 'data-key': 'course.new.institution' });
    institutionInput.addEventListener('change', () => {
      (institutionInput as HTMLInputElement).value = canonicalUniversityName((institutionInput as HTMLInputElement).value);
    });
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
    levelSel.append(option('', 'Grad student — after your bachelor’s degree was awarded (can transfer, §5.2)', true));
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

    idInput.addEventListener('input', () => clearInvalid(idInput, idError, 'new-course-id-hint'));
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
      markInvalid(input, error, message);
      toast(message); // heard as well as seen (the polite live region)
      input.focus();
    };
    creditsInput.addEventListener('input', () => clearInvalid(creditsInput, creditsError));
    yearInput.addEventListener('input', () => clearInvalid(yearInput, termYearError));

    const add = async () => {
      const id = canonicalCourseId(idInput.value);
      if (!id) {
        // A persistent error next to the field, not a vanishing toast (item 6).
        markInvalid(idInput, idError, 'Enter a course number, such as CSE 60641.', 'new-course-id-hint');
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
      setFocusAfterRender('course.new.id'); // ready for the next course
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
      knownCoursesList,
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
      const countsCell = el('td', { class: `counts cell-note${line?.mark === 'counts' && !showFeeds ? ' feeds-hidden' : ''}`, 'data-keep-dgs': '' });
      if (line?.qualifier) {
        // Credit and qualifier on two labelled lines, each with its own mark
        // (DGS 2026-09-27): the handbook keeps the two apart, so one course
        // is routinely ✕ for credit and ✓ or ● for §4.4.1.
        countsCell.append(
          el('div', { class: 'credit-line' }, statusMark(line.mark), el('span', { class: 'line-label' }, 'Credit: '), line.text),
          el('div', { class: 'qualifier-line' }, statusMark(line.qualifier.mark), el('span', { class: 'line-label' }, 'Qualifier: '), line.qualifier.text),
        );
      } else if (line) countsCell.append(statusMark(line.mark), line.text);
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
          list.append(el('a', { class: 'req-link', href: `#${reqAnchorId(r.id)}`, title: r.long }, r.title));
        });
        countsCell.append(list);
      }
      // The DGS's case-by-case approval, recorded on the course it concerns
      // (DGS 2026-09-27): only a course the sheet marks dgs_approval /
      // adgs_approval carries the box; a course not in the sheet goes to the
      // DGS through the review request first, and a `yes` needs no tick.
      if (line?.approvable) {
        const cb = el('input', {
          type: 'checkbox',
          'data-key': `course.${index}.approved`,
          onchange: (e) =>
            update((s) => {
              const entry = s.courses[index];
              if (!entry) return;
              if ((e.target as HTMLInputElement).checked) entry.dgsApproved = true;
              else delete entry.dgsApproved;
            }),
        }) as HTMLInputElement;
        cb.checked = line.approved === true;
        // The cell keeps "DGS" verbatim (its lines are already worded by
        // the engine), so the label names the decider itself.
        countsCell.append(el('label', { class: 'attest course-approval' }, cb, ` The ${deciderTitle(student.program)} approved this course for me`));
      }
      // A dual-degree student's course that also counts toward the other
      // program (Academic Code §2.2; policy review 2026-10-04, P2-ac-1-3-2):
      // offered only once the student said, under Your standing, that they are
      // enrolled in two Notre Dame programs at the same time.
      if (student.concurrentDegree === true && c.origin === 'nd') {
        const shared = el('input', {
          type: 'checkbox',
          'data-key': `course.${index}.sharedWithOtherDegree`,
          onchange: (e) =>
            update((s) => {
              const entry = s.courses[index];
              if (!entry) return;
              if ((e.target as HTMLInputElement).checked) entry.sharedWithOtherDegree = true;
              else delete entry.sharedWithOtherDegree;
            }),
        }) as HTMLInputElement;
        shared.checked = c.sharedWithOtherDegree === true;
        countsCell.append(el('label', { class: 'attest course-approval' }, shared, ' Also counts toward my other degree'));
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
        const groupName = (g: string) => groupShortName(rules, g);
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
      // apply to both degrees and each line says so. Every Ph.D. student is
      // (Graduate School 2026-09-22: at most 6 credits may count toward two
      // degrees, and the bachelor's-and-MSCSE courses use them up first).
      const askedWhichDegrees = student.program === 'phd';
      const holdsNdMasters = student.ndMasters !== undefined;
      // And only for a course that COULD count toward this degree (DGS
      // 2026-09-22): a 30000-level or lower course counts toward the
      // bachelor's alone whatever the answer — the engine never asks about
      // it (undergradLevelEligible), so the page must not either.
      const couldCountHere = priorNdUndergraduateCanCount(c, resolveRuleRow(rules, c.courseId, c.term), student.program);
      if (asUndergraduate && askedWhichDegrees && couldCountHere) {
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
            : holdsNdMasters
              ? ([
                  ['', 'Already counted toward…'],
                  ['neither', 'Neither — it was extra'],
                  ['bs', 'My bachelor’s degree'],
                  ['mscse', 'My MSCSE'],
                  ['both', 'Both my bachelor’s and my MSCSE'],
                ] as const)
              : // No Notre Dame master's: the only degree that can have used
                // the course is the bachelor's (2026-09-22).
                ([
                  ['', 'Already counted toward…'],
                  ['neither', 'Nothing — it was extra'],
                  ['bs', 'My bachelor’s degree'],
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
                : holdsNdMasters
                  ? 'Notre Dame coursework you took as an undergraduate can count here — 60000-level in full, and up to 6 credits below it. No course may count toward three degrees, and at most 6 credits may count toward two (Graduate School): the courses that counted toward both your bachelor’s and your MSCSE use up that allowance, and a course only your bachelor’s used draws on what is left. This answer decides it.'
                  : 'Notre Dame coursework you took as an undergraduate can count here — 60000-level in full for a 4+1 student (with the DGS’s approval otherwise, Academic Code §4.6), and up to 6 credits below it. At most 6 credits may count toward two degrees (Graduate School), so say whether your bachelor’s degree used this course. This answer decides it.',
            ),
          );
        }
      }
      // Strike through only courses that count NOTHING — a course partly over
      // a cap still counts its allowed credits.
      // …and a course with a qualifier line of its own is not struck through:
      // it still does something for the degree (2026-09-27).
      const countsNothing = line?.mark === 'excluded' && line.qualifier === undefined;
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
            setFocusAfterRender(last ? (index > 0 ? `course.${index - 1}.remove` : 'course.new.id') : `course.${index}.remove`);
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
        el('td', { class: 'cell-meta', 'data-label': 'Grade' }, gradeLabel(c.grade)),
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
  function askGradAdminCard(report: ReturnType<typeof audit>, classified: readonly ClassifiedCourse[]): HTMLElement {
    const built = gradAdminRequest(report, student, rules, { todayIso, entryTerm: termLabel(student.entryTerm), priorStudy: PRIOR_LABELS[student.priorMs], gpa: student.gpa, history: programHistory(student) }, classified);
    const n = built.items.count;
    const decider = deciderContact(student.program);
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
            'Nothing to process yet — this button becomes active as soon as any requirement is met, or a transfer credit the DGS has approved, a milestone date, or the MSCSE along the way appears in your record.',
            toast,
            label,
          )
        : el(
            'button',
            {
              ...attrs,
              onclick: () => {
                void copyDialog({
                  what: 'Processing request',
                  recipient: { role: GRAD_ADMIN.role, name: GRAD_ADMIN.name, email: GRAD_ADMIN.email, cc: { role: decider.role, name: decider.name, email: decider.email } },
                  subject: built.subject,
                  text: built.text,
                  html: built.html,
                  steps: [{ text: FILL_IN_STEP }, ...(needsTranscripts ? [{ text: 'Attach copies of your transcripts as PDFs (Bachelor’s / Master’s / Ph.D. — whichever apply); the official transcript must be sent directly to the Graduate School by each university’s registrar.', emphasis: true }] : [])],
                  returnFocusKey: 'gradadmin.copy',
                });
              },
            },
            label,
          );
    return el(
      'section',
      { class: 'card grad-admin-request', id: 'grad-admin' },
      el('h2', {}, 'Ask the Grad Admin to process ', el('span', { class: 'chip-note' }, plural(n, 'item'))),
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
            `Initiate the processing by clicking the following button: it opens the request for you to check and send from your own email app, to the Grad Admin with the DGS in cc${needsTranscripts ? ' — attach copies of your transcripts' : ''}.`,
          ),
      ...built.items.lines.map((text) => el('div', { class: 'review-line', 'data-keep-dgs': '' }, text)),
      el('div', { class: 'save-buttons' }, button),
    );
  }

  /** An optional term as a semester and a year (2026-10-04: the semester of
   * graduation, the Graduate School's extension). The year box refuses an
   * out-of-range value like every other year box; empty clears the term. */
  function termPicker(key: string, label: string, current: Term | undefined, seasons: readonly Season[], set: (t: Term | undefined) => void): HTMLElement {
    const season = el('select', { 'aria-label': `${label} — semester`, 'data-key': `${key}.season` });
    season.append(...seasons.map((se) => option(se, se[0]!.toUpperCase() + se.slice(1), (current?.season ?? seasons[0]) === se)));
    const commit = (year: number | undefined): void => set(year === undefined ? undefined : { season: (season as HTMLSelectElement).value as Season, year });
    const { input: year, error } = rangedNumber(
      { key: `${key}.year`, range: TERM_YEAR_RANGE, value: current ? String(current.year) : '', allowEmpty: true, attrs: { 'aria-label': `${label} — year`, placeholder: 'year' }, commit },
      refusedValues,
      toast,
    );
    season.addEventListener('change', () => {
      const text = (year as HTMLInputElement).value;
      if (text !== '' && inRange(Number(text), TERM_YEAR_RANGE)) commit(Number(text));
    });
    return el('div', { class: 'field' }, el('span', { class: 'label' }, label), el('div', { class: 'pair' }, season, year), error);
  }

  function milestonesCard(classified: readonly ClassifiedCourse[], report: AuditReport): HTMLElement {
    const m = student.milestones;
    // Every date with its deadline beside it (DGS 2026-10-04: "In the
    // Milestones, next to all the dates, specify the deadlines.") — the
    // engine's own date for the matching row (report.milestoneDeadlines).
    const dateField = (label: string, key: MilestoneDateKey): HTMLElement => datedField(label, key, report.milestoneDeadlines?.[key]);
    const a = student.attestations;
    const card = el(
      'section',
      { class: 'card', id: 'milestones' },
      el('h2', {}, el('span', { class: 'step-no' }, '4. '), 'Milestones ', el('span', { class: 'chip-note' }, student.program === 'mscse' ? '§2.3, §3.4' : '§2.3, §4.4–4.7')),
      // "Optional" once, leading (2026-09-05 item 11; trim review 2026-09-18, P-41).
      el('p', { class: 'hint' }, 'Every date here is optional — enter a date once it has happened.'),
    );

    // Is the advisor tenured or tenure-track CSE faculty? (CSE §2.3; Academic
    // Code §6.2.7 — policy review 2026-10-04, P2-ac-6.2-app-8.) The app cannot
    // see faculty status, so the student answers it; "no" or "not sure" goes to
    // the DGS. Asked of every Ph.D. student and, since P2-dh-10-5 (DGS Handbook
    // §10.3.2, §10.3.8), of an MSCSE student on the thesis option — under the name.
    const thesisMs = student.program === 'mscse' && student.msOption === 'thesis';
    const tttQuestion = (which: 'advisorTtt' | 'advisorTtt2', legend: string): HTMLElement | null =>
      student.program === 'phd' || thesisMs
        ? fieldset(
            legend,
            radios(`milestone.${which}`, [['yes', 'Yes'], ['no', 'No'], ['unsure', 'Not sure']], m[which] ?? '', (v) =>
              update((s) => void (s.milestones[which] = v as 'yes' | 'no' | 'unsure')),
            ),
            'inline',
          )
        : null;
    card.append(
      field(
        'Advisor name (§2.3)',
        el('input', {
          value: m.advisorName ?? '',
          'data-key': 'milestone.advisorName',
          onchange: (e) => update((s) => void (s.milestones.advisorName = (e.target as HTMLInputElement).value || undefined)),
        }),
      ),
      ...[tttQuestion('advisorTtt', thesisMs ? 'Is your thesis advisor tenured or tenure-track CSE faculty? (§2.3)' : 'Is your advisor tenured or tenure-track CSE faculty? (§2.3)')].filter((q): q is HTMLElement => q !== null),
      // A student may have two advisors (DGS 2026-09-22); the second box is
      // optional and the two names read as one supervision everywhere.
      // Uncommon: behind a selector unless a second name is on file (DGS 2026-10-03).
      rareFold(
        'coadvisor',
        'A second advisor (co-advisor)?',
        !!m.advisorName2,
        field(
          'Second advisor (co-advisor)',
          el('input', {
            value: m.advisorName2 ?? '',
            'data-key': 'milestone.advisorName2',
            onchange: (e) => update((s) => void (s.milestones.advisorName2 = (e.target as HTMLInputElement).value || undefined)),
          }),
        ),
        tttQuestion('advisorTtt2', 'Is your co-advisor tenured or tenure-track CSE faculty?'),
      ),
      dateField('Advisor identified on (§2.3)', 'advisorIdentified'),
    );

    if (student.program === 'mscse') {
      const opt = student.msOption ?? 'undecided';
      if (opt !== 'project') {
        card.append(
          // Academic Code §6.1.7 (policy review 2026-10-04, P2-ac-5b-6.1-14).
          dateField('Thesis topic approved — proposed with your advisor’s approval (Academic Code §6.1.7)', 'thesisTopicApproved'),
          // The readers' faculty status (CSE §3.4; DGS Handbook §10.3.8 —
          // policy review 2026-10-04, P2-dh-10-19): on the thesis route only,
          // behind a selector until the readers exist, so nobody answers
          // "Not sure" before there is anyone to be sure about; "no" or "not
          // sure" goes to the DGS.
          ...(opt === 'thesis'
            ? [
                rareFold(
                  'thesis-readers',
                  'Have your two thesis readers been nominated?',
                  m.thesisReadersTtt !== undefined,
                  fieldset(
                    'Are both readers tenured or tenure-track CSE faculty, and is neither of them your advisor? (§3.4)',
                    radios('milestone.thesisReadersTtt', [['yes', 'Yes'], ['no', 'No'], ['unsure', 'Not sure']], m.thesisReadersTtt ?? '', (v) =>
                      update((s) => void (s.milestones.thesisReadersTtt = v as 'yes' | 'no' | 'unsure')),
                    ),
                    'inline',
                  ),
                ),
              ]
            : []),
          dateField('Thesis defense passed (§3.4)', 'thesisDefensePassed'),
          // A failed first attempt (Academic Code §6.1.5: one retake, by the
          // end of the following semester) — uncommon, so behind a selector
          // (policy review 2026-10-04, P2-ac-5b-6.1-12).
          rareFold('thesis-failed', 'Did you fail a thesis defense attempt?', !!m.thesisDefenseFailed, dateField('Thesis defense failed — the first attempt (Academic Code §6.1.5)', 'thesisDefenseFailed')),
          // The final thesis to the Graduate School (Academic Code §6.1.8 —
          // policy review 2026-10-04, P2-ac-5b-6.1-15): on the thesis route,
          // once the defense is dated (or a date is already on file).
          ...(opt === 'thesis' && (m.thesisDefensePassed || m.thesisSubmitted)
            ? [dateField('Final thesis submitted to the Graduate School (Academic Code §6.1.8)', 'thesisSubmitted')]
            : []),
        );
      }
      if (opt !== 'thesis') {
        card.append(dateField('Project report accepted by advisor (§3.4)', 'projectReportAccepted'));
      }
      // The master's candidacy application (Academic Code §6.1.6; policy
      // review 2026-10-04) — every MSCSE student files it in the end.
      // Shown once the application is due (the row appears) or dated (DGS
      // 2026-10-04: "Show the entries only when they are in progress").
      if (m.msCandidacyApplied || report.requirements.some((r) => r.id === 'shared.msCandidacy')) {
        card.append(dateField('Application for Admission to Master’s Degree Candidacy submitted to the Graduate School (Academic Code §6.1.6)', 'msCandidacyApplied'));
      }
    } else {
      // Milestones appear once they are under way (DGS 2026-10-04: "Show the
      // entries only when they are in progress"): a date field whose row reads
      // Not started stays hidden until a date is on file — nothing on file is
      // ever hidden. The OCE waits for its coursework (DGS 2026-10-05), so does
      // its field, and the qualifier completion form appears with it.
      const notStarted = (id: string): boolean => {
        const r = report.requirements.find((x) => x.id === id);
        return r !== undefined && r.status === 'unmet' && /^Not started\b/.test(r.detail);
      };
      const oceOpen = !notStarted('phd.candidacy');
      const qualifierDone = report.requirements.some((r) => r.id === 'phd.qualifier' && r.status === 'met');
      card.append(
        dateField('Research qualifier passed — advisor filed the form (§4.4.3)', 'researchQualifierPassed'),
        // A FAIL within the 18 months starts the DGS committee's six months
        // (§4.4.3; policy review 2026-10-03).
        rareFold('rq-failed', 'Did the advisor file a research-qualifier fail?', !!m.researchQualifierFailed, dateField('Research qualifier failed — the advisor filed a fail (§4.4.3)', 'researchQualifierFailed')),
        // "(DGS office)" dropped (trim review 2026-09-18, P-51): the handbook's
        // phrase for the desk the page calls the Grad Admin, one card above
        // "two people, two jobs"; phd.ts and the advisor summary already read this way.
        ...(m.qualifierFormFiled || qualifierDone || oceOpen ? [dateField('Qualifier completion form filed with the Grad Admin (§4.4)', 'qualifierFormFiled')] : []),
        // Academic Code §6.2.4; a candidacy condition per the DGS Handbook §3.22.3
        // (2026-10-03). Part of the candidacy card since 2026-10-04, so shown
        // once that card is under way (DGS 2026-10-05: "hide it until it
        // becomes 'in progress'") — or once dated.
        ...(m.rcrTrainingCompleted || !notStarted('phd.candidacyAdmission') ? [dateField('Responsible Conduct of Research and ethics training completed (Graduate School)', 'rcrTrainingCompleted')] : []),
        ...(m.candidacyPassed || oceOpen ? [dateField('Oral Candidacy Exam (OCE) passed (§4.5)', 'candidacyPassed')] : []),
      );
      // §4.6 opens "After satisfying the above requirements": nobody has a
      // dissertation date without an OCE date, so the admission and
      // dissertation fields appear once the OCE is dated — or when a loaded record already
      // carries either date, so nothing on file is ever hidden (trim review
      // 2026-09-18, P-64). No readers'-approval date since 2026-10-04 (DGS:
      // the committee approves the dissertation and passes the defense at the
      // same time — "Only the 'dissertation defense passed' is needed").
      if (m.candidacyPassed || m.candidacyAdmitted || m.defensePassed || m.dissertationSubmitted) {
        card.append(
          // Admission to candidacy is the Graduate School's own step after the
          // OCE (DGS 2026-10-04: "OCE and doctoral candidacy are two different
          // things"), so it appears with the fields that follow the OCE.
          dateField('Admitted to doctoral candidacy by the Graduate School (Academic Code §6.2.9)', 'candidacyAdmitted'),
          dateField('Dissertation defense passed (§4.7)', 'defensePassed'),
          // The official submission is the last requirement inside the eight
          // years (Academic Code §6.2.6/§6.2.12; policy review 2026-10-03) —
          // shown once the defense is dated (DGS 2026-10-04: in progress only).
          ...(m.defensePassed || m.dissertationSubmitted ? [dateField('Final dissertation submitted to the Graduate School (Academic Code §6.2.12)', 'dissertationSubmitted')] : []),
        );
      }
      // The MSCSE along the way's candidacy application (DGS Handbook §3.21.1;
      // 2026-10-04): once the award's requirements are met, or once dated.
      if (m.msCandidacyApplied || report.requirements.some((r) => r.id === 'phd.msAlongTheWay' && r.status === 'met')) {
        card.append(dateField('Application for Admission to Master’s Degree Candidacy submitted — the MSCSE along the way (DGS Handbook §3.21.1)', 'msCandidacyApplied'));
      }
    }
    // The semester of graduation (DGS Handbook §3.23.1; Academic Code §3.7 —
    // policy review 2026-10-04, P2-dh-3.21-3.24-24): optional; the report
    // checks that a course of at least one credit is entered for it.
    card.append(
      termPicker('milestone.graduationTerm', 'Semester you plan to graduate in (optional)', student.graduationTerm, ['fall', 'spring', 'summer'], (t) => update((s) => void (s.graduationTerm = t))),
    );

    card.append(el('h2', { class: 'mt' }, 'Approvals you already have'));
    card.append(
      // The two-roles sentence is the next card's opening (trim review 2026-09-18, P-16).
      el('p', { class: 'hint' }, 'Tick only what has actually been approved.'),
      attestation('My advisor approved my plan of study (' + (student.program === 'mscse' ? '§3.2' : '§4.2') + ')', a.advisorApprovedPlan, (v, s) => (s.attestations.advisorApprovedPlan = v)),
    );
    // The Graduate School's extension of the time limit (policy review
    // 2026-10-04, P2-ac-6.2-app-7, P2-dh-3.14-3.20-27, P2-dh-10-10) — rare, so
    // behind a selector, open once a term is on file.
    card.append(
      rareFold(
        'time-extension',
        `Did the Graduate School extend your ${student.program === 'phd' ? 'eight' : 'five'}-year time limit?`,
        a.timeLimitExtendedThrough !== undefined,
        termPicker(
          'attest.timeLimitExtendedThrough',
          student.program === 'phd'
            ? 'The Graduate School extended my time limit — dissertation completion status or an eligibility extension (Academic Code §6.2.6.1; DGS Handbook §3.19) — through the end of:'
            : 'The Graduate School extended my time limit — an eligibility extension (DGS Handbook §10.3.5) — through the end of:',
          a.timeLimitExtendedThrough,
          ['fall', 'spring', 'summer'],
          (t) => update((s) => void (s.attestations.timeLimitExtendedThrough = t)),
        ),
      ),
    );
    // The Graduate School's approval of a dual-degree plan of study (DGS
    // Handbook §2.9; policy review 2026-10-04, P2-ac-1-3-2) — shown only to a
    // student who said they are in two programs at once.
    if (student.concurrentDegree === true || a.dualPlanApproved === true) {
      card.append(attestation('The Graduate School approved my dual-degree plan of study (DGS Handbook §2.9)', a.dualPlanApproved, (v, s) => (s.attestations.dualPlanApproved = v)));
    }
    // §5.2 criterion 5 — the Graduate School's approval — recorded here once
    // the Grad Admin has processed the transfer (policy review 2026-10-03);
    // shown only while the record has transfer courses.
    if (classified.some((c) => c.entry.origin === 'transfer' && c.caps.includes('transfer'))) {
      card.append(attestation('The Graduate School approved my transfer credit and the Grad Admin recorded it (§5.2)', a.transferRecorded, (v, s) => (s.attestations.transferRecorded = v)));
    }
    // Academic Code §3.8's semester maximum (2026-10-03): a semester over it —
    // or one already ticked — offers the overload tick, behind a selector that
    // is open once a tick is on file (an uncommon case, DGS 2026-10-03).
    const overloadTicked = student.creditOverloadTerms ?? [];
    const overloadTerms = new Map<number, Term>();
    for (const o of overMaxTerms(classified, student, normalizeEntryTerm(student.entryTerm).term)) overloadTerms.set(termIndex(o.term), o.term);
    for (const t of overloadTicked) overloadTerms.set(termIndex(t), t);
    if (overloadTerms.size > 0) {
      const ticks = [...overloadTerms.entries()]
        .sort((x, y) => x[0] - y[0])
        .map(([key, t]) =>
          attestation(`A credit overload was approved for me in ${termLabel(t)} (Academic Code §3.8)`, overloadTicked.some((o) => termIndex(o) === key), (v, s) => {
            const list = (s.creditOverloadTerms ?? []).filter((o) => termIndex(o) !== key);
            if (v) list.push(t);
            s.creditOverloadTerms = list.length > 0 ? list : undefined;
          }),
        );
      card.append(rareFold('overload', 'Was a credit overload approved for you?', overloadTicked.length > 0, ...ticks));
    }
    // The DGS's course approvals left this card on 2026-09-27: each is a tick
    // on the course it concerns, shown only where the sheet decides the
    // course case by case (the coursework table).
    if (student.program === 'phd') {
      // A NUMBER of semesters since 2026-10-03 (DGS: "DGS may give any number
      // of semesters as extensions"); the old tick box read as one.
      const extension = el('input', {
        type: 'number',
        min: '0',
        max: '20',
        step: '1',
        value: a.qualifierExtensionSemesters === undefined ? (a.qualifierExtensionGranted ? '1' : '') : String(a.qualifierExtensionSemesters),
        'data-key': 'attest.qualifier-extension-semesters',
        'aria-label': 'Semesters by which the DGS extended my qualifier deadline (§4.4)',
        onchange: (e) => {
          const raw = (e.target as HTMLInputElement).value.trim();
          const n = Number(raw);
          update((s) => {
            s.attestations.qualifierExtensionSemesters = raw === '' || !Number.isInteger(n) || n <= 0 ? undefined : Math.min(20, n);
            s.attestations.qualifierExtensionGranted = undefined;
          });
        },
      });
      card.append(
        rareFold(
          'q-extension',
          'Did the DGS extend your qualifier deadline?',
          a.qualifierExtensionSemesters !== undefined || a.qualifierExtensionGranted === true,
          el('label', { class: 'attest attest-number' }, 'The DGS extended my qualifier deadline (§4.4) by this many semesters: ', extension),
        ),
      );
      // The qualifier rule changed several times in four years (DGS
      // 2026-09-21): from the third year on, a student may attest that they
      // passed the examination under the requirements in force at the time.
      // Hidden before then — a ticked box on an earlier record is ignored by
      // the engine, which says so in a warning.
      if (qualifierPriorRulesEligible(student.entryTerm, todayIso) || a.qualifierPassedUnderPriorRules) {
        card.append(
          rareFold(
            'prior-rules',
            'Passed the qualifying examination under the earlier requirements?',
            a.qualifierPassedUnderPriorRules === true,
            attestation('I passed the qualifying examination under the earlier requirements (§4.4, third year or later)', a.qualifierPassedUnderPriorRules, (v, s) => (s.attestations.qualifierPassedUnderPriorRules = v)),
          ),
        );
      }
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

  /** A milestone date box with its deadline beside it (DGS 2026-10-04): the
   * label on its own line, then the box and the deadline side by side, so
   * every deadline starts at the same place (a wrapping <label> pushed each
   * one past its own label's width). The label names the box through `for`;
   * the deadline is tied to it by aria-describedby, so the box's accessible
   * name stays the label. */
  function datedField(label: string, key: MilestoneDateKey, deadline: MilestoneDeadline | undefined): HTMLElement {
    const value = (student.milestones[key] as string | undefined) ?? '';
    const inputId = `milestone-${key}`;
    const noteId = `deadline-${key}`;
    const note = deadlineNote(deadline, noteId);
    return el(
      'div',
      { class: 'field dated' },
      el('label', { class: 'label', for: inputId }, label),
      el('input', {
        type: 'date',
        id: inputId,
        value,
        'data-key': `milestone.${key}`,
        ...(note ? { 'aria-describedby': noteId } : {}),
        onchange: (e) =>
          update((s) => void ((s.milestones as Record<string, string | undefined>)[key] = (e.target as HTMLInputElement).value || undefined)),
      }),
      note,
    );
  }

  // ---------- save / load ----------

  /** "Send summary to advisor" (DGS 2026-09-15): the dialog with the
   * advisor summary. Rendered at the end of the report since the trim review
   * (2026-09-18, P-72); it was the third button of the storage card. */
  function advisorSummaryButton(report: ReturnType<typeof audit>, key = 'save.copy'): HTMLElement {
    return el(
      'button',
      {
        class: 'btn',
        'data-key': key,
        onclick: () => {
          const advisors = [student.milestones.advisorName, student.milestones.advisorName2].filter((n): n is string => !!n);
          const built = advisorSummary(report, { todayIso, entryTerm: termLabel(student.entryTerm), priorStudy: PRIOR_LABELS[student.priorMs], gpa: student.gpa, advisors, history: programHistory(student), unofficialNote: unofficialTranscriptNote(student.courses) });
          void copyDialog({
            what: 'Summary for your advisor',
            recipient: { role: advisors.length > 1 ? 'Your advisors' : 'Your advisor', name: advisors.length > 0 ? advisors.join(' and ') : 'name not entered under Milestones' },
            subject: built.subject,
            text: built.text,
            html: built.html,
            steps: [{ text: FILL_IN_STEP }],
            returnFocusKey: key,
          });
        },
      },
      'Send summary to advisor',
    );
  }

  function saveCard(report: ReturnType<typeof audit>): HTMLElement {
    const fileInput = el('input', { type: 'file', accept: '.json,application/json', class: 'hidden', 'aria-label': 'Saved file', 'data-key': 'save.fileinput' }); // (P-62); the tools row's "Load a file" opens it too
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
          applyRefusals(refusedValues, refusals);
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
        // Reset beside Print (DGS 2026-09-22) — the card whose sentence tells a
        // student on a shared machine to clear the record holds the button.
        // Also here (DGS 2026-09-23), with its own key so focus returns to
        // the right one of the two buttons.
        advisorSummaryButton(report, 'save.summary'),
        el('button', { class: 'btn', 'data-key': 'save.reset', onclick: resetAll }, 'Reset'),
      ),
      fileInput,
    );
  }

  // ---------- diagnostics ----------

  function diagnosticsCard(): HTMLElement | null {
    const issues = rules.issues;
    // Students see this only when the sheet has ERRORS (usability review
    // 2026-09-05, item 19); warnings alone are the DGS's business and are
    // printed by `npm run sync-sheet`.
    if (!issues.some((i) => i.severity === 'error')) return null;
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
        // Brought up to date on 2026-10-04 (DGS: "Not only CSE Grad Studies
        // Handbook was used. For GS academic code and DGS handbook, links are
        // not necessary"): the policy-compliance review added the Graduate
        // School's rules, and the facts the page now routes to the DGS.
        student.program === 'mscse' ? 'It applies Section 3 of the ' : 'It applies Section 4 of the ',
        handbookLink(),
        // Who decides and who processes is on the Grad Admin card, in the
        // glossary and in the contact card right below; the footer keeps its
        // one imperative (trim review 2026-09-18, P-21).
        ', together with the Graduate School’s rules in its Academic Code, its DGS Handbook and its 4+1 guidance. Some requirements rest on approvals and facts this page cannot see — advisor and DGS sign-off, transfer-credit recommendations, Graduate School approvals and extensions, and what you state yourself, such as your advisor’s faculty status, a leave or a readmission, or a probation letter — so those are sent to the DGS rather than decided here. Deadlines are shown by semester and are approximate; the Graduate School calendar sets the exact dates. Confirm with the DGS before you rely on this self-check.',
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
      // The card's narrow-width and embed host (the desk host is in the masthead).
      mainContactHost,
    );
  }


  // ---------- example / clear ----------

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
    student = exampleFor(program, todayIso);
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
      `${plural(removed, 'example row')} removed${student.courses.length > 0 ? ` — your own ${student.courses.length} stay${student.courses.length === 1 ? 's' : ''}` : ''}.`,
      'Undo',
      () => {
        student = before;
        saveLocal(student);
        render();
      },
      { ttlMs: 20000 },
    );
  }

  function resetAll(): void {
    if (!window.confirm('Reset everything you have entered on this device and start over?')) return;
    cancelUndo();
    refusedValues.clear();
    student = emptyStudent();
    clearLocal();
    render();
    // A reset record is a new student (DGS 2026-09-22): back to the opening
    // dialog — the degree and the earlier degrees are chosen there.
    openOpeningDialog(undefined);
  }

  // A record already on this device may carry a number an older build let
  // through (R1, 2026-09-18): it is refused now, shown back in its field, and
  // said out loud once the page is up — never dropped in silence.
  if (loadRefusals.length > 0) applyRefusals(refusedValues, loadRefusals);
  render();
  for (const r of loadRefusals) toast(r.message);
}

function deadlineNote(d: MilestoneDeadline | undefined, id: string): HTMLElement | null {
  if (!d) return null;
  return el('span', { class: `ms-deadline${d.state ? ` ms-${d.state}` : ''}`, id }, deadlineText(d));
}
