// The student-facing app: standing form, course table with sheet-driven
// autocomplete, milestone dates, attestations, and the live report.
// All rule logic lives in src/engine/ — this file only collects input and renders.
import type { NotreDameNow } from '../data/clock.ts';
import { canonicalCourseId, resolveRuleRow } from '../data/assemble.ts';
import { findExternalRule, isNotreDameInstitution } from '../data/external.ts';
import { CORE_TITLE_RE } from '../engine/core-title.ts';
import { classify, priorNdUndergraduateCanCount, type ClassifiedCourse } from '../engine/allocate.ts';
import type { Rules } from '../data/types.ts';
import { coursesNeedingDgsReviewFor, reviewRequestSummary, undergraduateGraduateCourseworkFlagFor, type PendingDgsReview } from '../engine/review.ts';
import { shortName } from '../engine/short-names.ts';
import { audit } from '../engine/audit.ts';
import { GRADES } from '../engine/grades.ts';
import { termIndex, termLabel, termOfDate, termShort } from '../engine/term.ts';
import type { CourseEntry, CourseLine, Program, Season, Student, Term } from '../engine/types.ts';
import { clear, el, inactiveButton, option } from './dom.ts';
import { siblingAnchorAttrs } from './sibling-links.ts';
import { BETA_NOTICE, BETA_SCOPE_NOTICE, RULES_ACCURACY_NOTICE, handbookLink, rulesDateLine } from './handbook.ts';
import { DGS, GRAD_ADMIN, LICENSE_URL, REPO_URL, applyContactOverrides, contactCard, mailto, reportToDgs, deciderContact } from './contacts.ts';
import { embedTargetAttrs, isEmbedded, openFullPageLink, placeInFrame } from './embed.ts';
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
import { DEGREE_SLOTS, importsBusy, priorTranscriptSection } from './external-upload.ts';
import { statusMark } from './marks.ts';
import { type NdUploadArgs, ndPreviewOpen, ndTranscriptPreviewBlock, ndTranscriptUpload } from './nd-upload.ts';
import { deriveNdMasters, derivePriorMs, isNotreDameCourse, isPriorNd, reclassifyNotreDameCourses } from './prior-nd.ts';
import { applyDeciderRule, applyFirstMentionRule } from './first-mention.ts';
import { canonicalUniversityName, knownUniversities } from './university-name.ts';
import { confirmDialog, copyDialog, openModal, returnFocusTo } from './copy-dialog.ts';
import { plural } from './email-html.ts';
import { EXAMPLE_ATTESTATIONS, EXAMPLE_MILESTONES, exampleFor } from './example.ts';
import { clearInvalid, errorLine, field, fieldset, labelWrap, markInvalid, radios } from './form-helpers.ts';
import { createFocusKeeper } from './focus-keeper.ts';
import { type RefusedValues, applyRefusals, rangedNumber } from './refusals.ts';
import { createToasts } from './toasts.ts';
import { gradAdminRequest } from './grad-admin-request.ts';
import { advisorSummary } from './advisor-summary.ts';
import { renderReport, renderSummary, reqAnchorId, scoreLine } from './report.ts';
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
    returnFocusTo();
  };
  agreeButton.addEventListener('click', closeConsent);
  consentDialog.addEventListener('close', closeConsent);
  document.body.append(consentDialog);
  placeInFrame(consentDialog); // embed mode: at the top of the frame, not the middle of a tall page (DGS 2026-09-16)
  if (openModal(consentDialog)) agreeButton.focus();

  // Established on the loading card (DGS 2026-09-07): the date at Notre Dame,
  // from the server this page came from when it answers, and read in Notre
  // Dame's own zone either way — never the device's idea of the calendar.
  const todayIso = today.iso;
  const fullTimeFloor = rules.parameters.number('fulltime_credits_min') ?? 9;
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
    clear(root);
    root.append(
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
        untouched ? null : renderSummary(report),
        el(
          'div',
          { class: 'layout' },
          el(
            'div',
            { class: 'inputs', id: 'inputs' },
            transcriptsCard(),
            standingCard(),
            coursesCard(report.courseLines),
            askDgsCard(classified),
            milestonesCard(classified),
            askGradAdminCard(report, classified),
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
    seasonSel.append(...seasonOptions(student.entryTerm.season));
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
      bsBeforeLine ? fieldset('Bachelor’s degree awarded', bsBeforeLine) : fieldset('Bachelor’s degree awarded (required)', el('div', { class: 'pair' }, bsSeason, bsYear)),
      bsBeforeLine ? null : bsYearError,
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

    const ftTerms = fullTimeTerms();
    if (ftTerms) card.append(ftTerms);
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

  /** The full-time-terms fieldset, or null while the record has no term to list. */
  function fullTimeTerms(): HTMLElement | null {
    // Residency (decision Q8): ≥9 entered credits marks a term full-time
    // automatically; these checkboxes cover research-heavy terms that aren't.
    // Only terms from the entry term on: residence is counted in THIS program
    // (2026-09-05 — the engine's residency.ts applies the same guard).
    const entryIndex = termIndex(student.entryTerm);
    const terms = new Map<number, Term>();
    for (const c of student.courses) if (c.origin === 'nd' && termIndex(c.term) >= entryIndex) terms.set(termIndex(c.term), c.term);
    for (const t of student.fullTimeTermOverrides ?? []) if (termIndex(t) >= entryIndex) terms.set(termIndex(t), t);
    if (terms.size === 0) return null;
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
              `${g.hidden > 0 ? ` ${plural(g.hidden, 'other course')} from this transcript ${g.hidden === 1 ? 'is' : 'are'} not shown.` : ''}`,
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
  function askDgsCard(classified: readonly ClassifiedCourse[]): HTMLElement | null {
    // Which courses need a DGS decision, and why, is the engine's call
    // (src/engine/review.ts, 2026-09-06 evening — with the test matrix that
    // pins it); this card only lists them and builds the copy-ready request.
    const pending = coursesNeedingDgsReviewFor(classified, student);
    const n = pending.length;
    // Notes that are not about one course (2026-09-12): a 4+1 with many
    // undergraduate graduate-level courses counted.
    const flags = undergraduateGraduateCourseworkFlagFor(classified, student);
    const notes = flags ? [flags] : [];
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
        mailto(decider.email),
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
                  recipient: { role: decider.role, name: decider.name, email: decider.email },
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
    for (const g of GRADES) gradeSel.append(option(g, g === 'IP' ? 'In progress' : g, g === 'IP'));
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
          list.append(el('a', { class: 'req-link', href: `#${reqAnchorId(r.id)}`, title: r.long }, r.title));
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
  function askGradAdminCard(report: ReturnType<typeof audit>, classified: readonly ClassifiedCourse[]): HTMLElement {
    const built = gradAdminRequest(report, student, rules, { todayIso, entryTerm: termLabel(student.entryTerm), priorStudy: PRIOR_LABELS[student.priorMs], gpa: student.gpa }, classified);
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
            'Nothing to process yet — this button becomes active as soon as any requirement is met, or a transfer credit the DGS has ruled transferable, a milestone date, or the MSCSE along the way appears in your record.',
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
            `Initiate the processing by clicking the following button: it opens the request for you to check and send from your own email app, to the Grad Admin with the DGS in cc${needsTranscripts ? ' — attach your original transcripts' : ''}.`,
          ),
      ...built.items.lines.map((text) => el('div', { class: 'review-line', 'data-keep-dgs': '' }, text)),
      el('div', { class: 'save-buttons' }, button),
    );
  }

  function milestonesCard(classified: readonly ClassifiedCourse[]): HTMLElement {
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
      const transfers = classified.filter(
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

  function clearAll(): void {
    if (!window.confirm('Clear everything you have entered on this device?')) return;
    cancelUndo();
    refusedValues.clear();
    student = emptyStudent();
    clearLocal();
    render();
  }

  // A record already on this device may carry a number an older build let
  // through (R1, 2026-09-18): it is refused now, shown back in its field, and
  // said out loud once the page is up — never dropped in silence.
  if (loadRefusals.length > 0) applyRefusals(refusedValues, loadRefusals);
  render();
  for (const r of loadRefusals) toast(r.message);
}
