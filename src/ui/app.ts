// The student-facing app: standing form, course table with sheet-driven
// autocomplete, milestone dates, attestations, and the live report.
// All rule logic lives in src/engine/ — this file only collects input and renders.
import { resolveRuleRow } from '../data/assemble.ts';
import { findExternalRule } from '../data/external.ts';
import { CORE_TITLE_RE } from '../engine/core-title.ts';
import type { Rules } from '../data/types.ts';
import { classify } from '../engine/allocate.ts';
import { audit } from '../engine/audit.ts';
import { GRADES } from '../engine/grades.ts';
import { termIndex, termLabel, termOfDate } from '../engine/term.ts';
import type { CourseEntry, Season, Student, Term } from '../engine/types.ts';
import { parseTranscript, type ParsedCourse } from '../transcript/parse.ts';
import { clear, el, option } from './dom.ts';
import { BETA_NOTICE, BETA_SCOPE_NOTICE, RULES_ACCURACY_NOTICE, handbookLink, rulesDateLine } from './handbook.ts';
import { DGS, GRAD_ADMIN, LICENSE_URL, REPO_URL, applyContactOverrides, contactCard, mailto, reportToDgs } from './contacts.ts';
import { DEGREE_SLOTS, copyReviewRequest, importsBusy, priorTranscriptSection } from './external-upload.ts';
import { advisorSummary, renderReport } from './report.ts';
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
  const consentBox = el(
    'div',
    { class: 'consent-box' },
    el('h2', {}, 'Before you continue'),
    el(
      'p',
      {},
      'This tool has not been approved by the department yet. It is for testing and informational purposes only.',
    ),
    el('p', {}, `For errors and feedback, please contact the DGS (Prof. ${DGS.name}, `, mailto(DGS.email), ').'),
  );
  const consentOverlay = el('div', { class: 'consent-overlay', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Testing notice' }, consentBox);
  consentBox.append(el('button', { class: 'btn primary', onclick: () => consentOverlay.remove() }, 'Agree'));
  document.body.append(consentOverlay);

  let student: Student = loadLocal() ?? emptyStudent();
  // Local date, not UTC — an evening at Notre Dame must not audit as tomorrow.
  const now = new Date();
  const p2 = (n: number) => String(n).padStart(2, '0');
  const todayIso = `${now.getFullYear()}-${p2(now.getMonth() + 1)}-${p2(now.getDate())}`;
  const fullTimeFloor = rules.parameters.number('fulltime_credits_min') ?? 9;
  let toastTimer: number | undefined;
  /** Parsed-transcript preview awaiting the student's confirmation. */
  let transcriptPreview:
    | { courses: ParsedCourse[]; selected: boolean[]; duplicate: boolean[]; gpa?: number; useGpa: boolean }
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
      t.classList.add('show');
      window.clearTimeout(toastTimer);
      toastTimer = window.setTimeout(() => t.classList.remove('show'), 4000);
    }
  };

  function render(): void {
    const report = audit(student, rules, todayIso);
    clear(root);
    root.append(
      ...[
      masthead(),
      betaNotice(),
      privacyNotice(),
      rules.source === 'snapshot' ? snapshotBanner() : null,
      el(
        'div',
        { class: 'layout' },
        el(
          'div',
          { class: 'inputs' },
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
          { class: 'audit-col' },
          report.warnings.length > 0
            ? el('div', { class: 'warnings' }, ...report.warnings.map((w) => el('div', {}, `⚠ ${w}`)))
            : null,
          renderReport(report),
        ),
      ),
      footer(),
      el('div', { class: 'toast', role: 'status' }),
      ].filter((n): n is HTMLElement => n !== null),
    );
  }

  // ---------- masthead ----------

  function masthead(): HTMLElement {
    const tab = (label: string, program: Student['program']) =>
      el(
        'button',
        {
          class: `tab${student.program === program ? ' active' : ''}`,
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
        el('h1', {}, 'Graduate Degree Requirement Self-check Tool'),
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
      ),
      contactCard(),
      el(
        'div',
        { class: 'masthead-tools' },
        el('div', { class: 'tabs' }, tab('M.S. in CSE §3', 'mscse'), tab('Ph.D. §4', 'phd')),
        el(
          'div',
          {},
          el('button', { class: 'btn', onclick: loadExample }, 'Load example'),
          el('button', { class: 'btn', onclick: clearAll }, 'Clear'),
        ),
      ),
    );
  }

  function betaNotice(): HTMLElement {
    return el(
      'div',
      { class: 'banner beta', role: 'note' },
      el('strong', {}, 'Alpha version under testing. '),
      BETA_NOTICE,
      ' ',
      el('strong', {}, RULES_ACCURACY_NOTICE),
      ' (See the ',
      el('a', { href: './courses.html' }, 'course rules page'),
      '.) ',
      BETA_SCOPE_NOTICE,
      ...reportToDgs(' Error reports and feedback — please email'),
    );
  }

  /** Right below the beta notice (DGS placement, 2026-09-03): everything —
   * input, imported PDFs, and the optional OCR — stays in the browser. */
  function privacyNotice(): HTMLElement {
    return el(
      'div',
      { class: 'banner privacy', role: 'note' },
      el('strong', {}, 'Private by design. '),
      'Everything you enter — and any transcript PDF you import — is processed and stored entirely locally, within your own browser; the optional text recognition (OCR) for scanned transcripts is also computed in your browser. Nothing is uploaded, transmitted, or stored anywhere else. The page’s only network request is the read-only fetch of the public course rules.',
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
    const seasonSel = el('select', {
      onchange: (e) =>
        update((s) => void (s.entryTerm.season = (e.target as HTMLSelectElement).value as Season)),
    });
    for (const se of SEASONS) seasonSel.append(option(se, se[0]!.toUpperCase() + se.slice(1), student.entryTerm.season === se));
    const yearInput = el('input', {
      type: 'number',
      min: '2000',
      max: '2040',
      value: String(student.entryTerm.year),
      onchange: (e) => update((s) => void (s.entryTerm.year = Number((e.target as HTMLInputElement).value) || s.entryTerm.year)),
    });
    const priorSel = el('select', {
      onchange: (e) =>
        update((s) => {
          s.priorMs = (e.target as HTMLSelectElement).value as Student['priorMs'];
          s.priorMsInferred = undefined; // the student chose — no longer inferred
        }),
    });
    priorSel.append(
      option('none', 'No prior graduate degree', student.priorMs === 'none'),
      option('unfinished', 'Prior M.S., not completed', student.priorMs === 'unfinished'),
      option('completed', 'Completed prior M.S. or Ph.D.', student.priorMs === 'completed'),
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
      el('h2', {}, 'Your standing ', el('span', { class: 'chip-note' }, currentSemesterChip())),
      field('Entered the program', el('div', { class: 'pair' }, seasonSel, yearInput)),
      field('Prior graduate study (§5.2 transfer caps)', priorSel),
      priorNote,
    );

    if (student.program === 'mscse') {
      const optSel = el('select', {
        onchange: (e) => update((s) => void (s.msOption = (e.target as HTMLSelectElement).value as Student['msOption'])),
      });
      optSel.append(
        option('undecided', 'Undecided', (student.msOption ?? 'undecided') === 'undecided'),
        option('project', 'M.S. project (§3.4 i)', student.msOption === 'project'),
        option('thesis', 'M.S. thesis (§3.4 ii)', student.msOption === 'thesis'),
      );
      card.append(field('Project or thesis option (§3.4)', optSel));
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
    const terms = new Map<number, Term>();
    for (const c of student.courses) if (c.origin === 'nd') terms.set(termIndex(c.term), c.term);
    for (const t of student.fullTimeTermOverrides ?? []) terms.set(termIndex(t), t);
    if (terms.size === 0) return el('div', {});
    const box = el('div', { class: 'ft-terms' }, el('div', { class: 'label' }, 'Full-time terms (for residency, §3.3/§4.3)'));
    const byTermCredits = new Map<number, number>();
    for (const c of student.courses) {
      if (c.origin !== 'nd') continue;
      byTermCredits.set(termIndex(c.term), (byTermCredits.get(termIndex(c.term)) ?? 0) + c.credits);
    }
    for (const [key, t] of [...terms.entries()].sort((a, b) => a[0] - b[0])) {
      const auto = (byTermCredits.get(key) ?? 0) >= fullTimeFloor;
      const overridden = (student.fullTimeTermOverrides ?? []).some((o) => termIndex(o) === key);
      const cb = el('input', {
        type: 'checkbox',
        onchange: (e) => {
          const on = (e.target as HTMLInputElement).checked;
          update((s) => {
            const list = (s.fullTimeTermOverrides ?? []).filter((o) => termIndex(o) !== key);
            if (on) list.push(t);
            s.fullTimeTermOverrides = list;
          });
        },
      });
      cb.checked = auto || overridden;
      cb.disabled = auto;
      box.append(
        el('label', { class: 'ft-term' }, cb, ` ${termLabel(t)}${auto ? ` (${fullTimeFloor}+ credits entered)` : ''}`),
      );
    }
    return box;
  }

  // ---------- coursework ----------

  function coursesCard(courseLines: { courseId: string; term: Term; text: string }[]): HTMLElement {
    // The GPA lives here, next to the transcript import that prefills it
    // (moved from the standing card — DGS request, 2026-09-03).
    const gpaInput = el('input', {
      type: 'number',
      min: '0',
      max: '4',
      step: '0.01',
      placeholder: '3.50',
      value: student.gpa === undefined ? '' : String(student.gpa),
      onchange: (e) => {
        const v = (e.target as HTMLInputElement).value;
        update((s) => void (s.gpa = v === '' ? undefined : Number(v)));
      },
    });
    // Group the list by university + degree (2026-09-03): Notre Dame first,
    // then one section per (university, transcript) in first-seen order.
    const all = student.courses.map((c, index) => ({ c, index }));
    const nd = all.filter(({ c }) => c.origin === 'nd');
    const groups: { heading: string; bachelors: boolean; entries: { c: CourseEntry; index: number }[]; hidden: number }[] = [];
    for (const e of all.filter(({ c }) => c.origin === 'transfer')) {
      const slot = e.c.degreeLevel
        ? (DEGREE_SLOTS.find((sl) => sl.level === e.c.degreeLevel)?.label ?? e.c.degreeLevel)
        : 'graduate coursework (§5.2)';
      const heading = `${e.c.institution ?? 'University not set'} — ${slot}`;
      let g = groups.find((x) => x.heading === heading);
      if (!g) {
        g = { heading, bachelors: e.c.degreeLevel === 'bachelors', entries: [], hidden: 0 };
        groups.push(g);
      }
      // Undergraduate courses (DGS request 2026-09-04): only the ones that can
      // matter are listed — a title suggesting a §4.4.1 core area, or a course
      // the DGS has already ruled on. The rest stay in the saved data but out
      // of the way (undergraduate credits never transfer, §5.2).
      if (
        g.bachelors &&
        !CORE_TITLE_RE.test(e.c.title ?? '') &&
        !findExternalRule(rules.external, e.c.institution ?? '', e.c.courseId)
      ) {
        g.hidden += 1;
        continue;
      }
      g.entries.push(e);
    }
    const card = el(
      'section',
      { class: 'card' },
      el('h2', {}, 'Coursework ', el('span', { class: 'chip-note' }, student.program === 'mscse' ? '§3.2' : '§4.2')),
      el(
        'p',
        { class: 'hint' },
        'Everything you have taken or are taking belongs here — importing your transcripts above fills it in automatically, non-CSE and other-university courses included; you can also add or fix courses by hand. Anything the course rules have not decided yet goes into the review request below.',
      ),
      field('Cumulative GPA (from your transcript, §2.2)', gpaInput),
      courseForm(),
      el('h3', { class: 'subhead' }, 'Notre Dame'),
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
      el('h2', {}, 'Transcripts ', el('span', { class: 'chip-note' }, 'start here')),
      el(
        'p',
        { class: 'hint' },
        'The easiest way to start: import your transcripts, and most of the page below fills itself in. ',
        el('strong', {}, 'System-generated PDFs are read exactly; a scanned or photographed transcript can be read with built-in text recognition (OCR) — English-language transcripts only'),
        ' — after you agree, and with every field checked by you. Like everything here, files are read on your own computer and never uploaded.',
      ),
      busy
        ? el('p', { class: 'hint warn' }, 'One transcript at a time: confirm the open preview below (“Add …”) or cancel it before importing another PDF.')
        : null,
      transcriptUpload(busy),
      transcriptPreview ? transcriptPreviewBlock() : null,
      ...priorTranscriptSection({ student, rules, update, toast, render, blocked: busy }),
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
      // Unreviewed undergraduate courses earn no transfer credit, but the DGS
      // keywords (2026-09-03) flag the ones whose TITLE suggests a §4.4.1 core
      // area — those are worth a ruling.
      if (c.entry.degreeLevel === 'bachelors') return CORE_TITLE_RE.test(c.entry.title ?? '');
      // Unreviewed GRADUATE courses (2026-09-04): pending when transfer credit
      // is still possible (no hard §5.2 ineligibility) — and even when it is
      // not (outside the window, below the grade floor), a core-keyword title
      // still belongs in the request, because the course may satisfy §4.4.1
      // core knowledge, which has no such restrictions.
      return c.ineligibleReason === undefined || CORE_TITLE_RE.test(c.entry.title ?? '');
    });
    const n = nd.length + external.length;
    if (n === 0) return null;
    const ndReq = nd.map((c) => ({
      courseId: c.entry.courseId,
      title: c.entry.title ?? c.rule?.title,
      credits: c.entry.credits,
      grade: c.entry.grade,
      termText: termLabel(c.entry.term),
      reason: c.unknown === true ? 'not in the course rules yet' : (c.approvalPending ?? 'needs DGS review'),
      unlisted: c.unknown === true,
    }));
    const extReq = external.map((c) => ({
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
        ') and the Graduate Program Administrator (',
        mailto(GRAD_ADMIN.email),
        '). Attach your transcript PDFs (Bachelor’s / Master’s / Ph.D. — whichever apply) to the same email. It includes rows the DGS can paste straight into the rules sheet; the page itself sends nothing.',
      ),
      ...nd.map((c, i) => line(c.entry.courseId, 'Notre Dame', ndReq[i]!.reason)),
      ...external.map((c, i) => line(c.entry.courseId, c.entry.institution ?? 'other university', extReq[i]!.reason)),
      el(
        'div',
        { class: 'save-buttons' },
        el(
          'button',
          {
            class: 'btn',
            onclick: () => {
              import('../transcript/external.ts')
                .then(({ buildCombinedReviewRequest }) =>
                  copyReviewRequest(buildCombinedReviewRequest({ priorStudy: PRIOR_LABELS[student.priorMs], nd: ndReq, external: extReq })),
                )
                .then(() => toast('Review request copied — email it to the DGS and the Graduate Program Administrator, and attach your transcript PDFs. (Nothing is sent by this page.)'))
                .catch(() => toast('Could not copy automatically — please email the DGS and the Graduate Program Administrator with your course ids, credits, grades and terms.'));
            },
          },
          `Copy review request for ${n} course${n === 1 ? '' : 's'}`,
        ),
      ),
    );
  }

  // ---------- transcript upload ----------

  function transcriptUpload(blocked: boolean): HTMLElement {
    const fileInput = el('input', { type: 'file', accept: '.pdf,application/pdf', class: 'hidden' });
    fileInput.addEventListener('change', async () => {
      const file = (fileInput as HTMLInputElement).files?.[0];
      if (!file) return;
      toast('Reading the transcript… (it never leaves this browser)');
      try {
        const { pdfToLines } = await import('../transcript/pdf.ts'); // pdfjs loads lazily
        const lines = await pdfToLines(await file.arrayBuffer());
        // Kellogg's own instructions tell students to SCREENSHOT the page —
        // those PDFs have no text layer, and deserve a specific message,
        // not a false "this isn't ND" rejection.
        if (lines.join('').trim().length < 40) {
          transcriptPreview = undefined;
          render();
          toast(
            'This PDF has no readable text (a screenshot?). Please use your browser’s "Print → Save as PDF" on the transcript page instead, or add courses manually.',
          );
          return;
        }
        const parsed = parseTranscript(lines);
        if (!parsed.isNotreDame) {
          transcriptPreview = undefined;
          render();
          toast(
            "Only Notre Dame's unofficial transcript is accepted here — for courses from other universities, use the Previous-Transcript rows below.",
          );
          return;
        }
        if (parsed.courses.length === 0) {
          transcriptPreview = undefined;
          render();
          toast('This looks like a Notre Dame transcript, but no course lines could be read from it. Add your courses manually, and tell the DGS so the parser can be improved.');
          return;
        }
        const duplicate = parsed.courses.map((c) =>
          student.courses.some(
            (s) => s.courseId === c.courseId && termIndex(s.term) === termIndex(c.term),
          ),
        );
        transcriptPreview = {
          courses: parsed.courses,
          selected: parsed.courses.map((_, i) => !duplicate[i]),
          duplicate,
          gpa: parsed.cumulativeGpa,
          useGpa: parsed.cumulativeGpa !== undefined,
        };
        render();
        for (const w of parsed.warnings) toast(w);
      } catch {
        transcriptPreview = undefined;
        render();
        toast('That PDF could not be read (a scanned image, or not a PDF?). Add your courses manually.');
      } finally {
        (fileInput as HTMLInputElement).value = '';
      }
    });
    return el(
      'div',
      { class: 'transcript-upload external-slot' },
      el('span', { class: 'slot-label' }, 'Notre Dame Unofficial Transcript'),
      ' — ',
      el('button', { class: 'btn tiny', disabled: blocked, onclick: () => (fileInput as HTMLInputElement).click() }, 'Import Courses from PDF (alpha)'),
      el('span', { class: 'hint-inline' }, ' — the system-generated PDF from insideND; fills the coursework table and GPA below. Parsed courses are shown for your confirmation before anything is added.'),
      fileInput,
    );
  }

  function transcriptPreviewBlock(): HTMLElement {
    const tp = transcriptPreview!;
    const box = el('div', { class: 'transcript-preview' });
    box.append(
      el('h3', {}, `Found ${tp.courses.length} course${tp.courses.length === 1 ? '' : 's'} — untick anything that shouldn't count, then add`),
    );
    const table = el('table', { class: 'courses' });
    table.append(
      el('tr', {}, el('th', {}, ''), el('th', {}, 'Course'), el('th', {}, 'Term'), el('th', {}, 'Cr'), el('th', {}, 'Grade'), el('th', {}, '')),
    );
    tp.courses.forEach((c, i) => {
      const cb = el('input', { type: 'checkbox', onchange: (e) => (tp.selected[i] = (e.target as HTMLInputElement).checked) });
      cb.checked = tp.selected[i]!;
      table.append(
        el(
          'tr',
          {},
          el('td', {}, cb),
          el('td', {}, el('div', { class: 'cid' }, c.courseId), el('div', { class: 'ctitle' }, c.title ?? '')),
          el('td', {}, termLabel(c.term)),
          el('td', {}, String(c.credits)),
          el('td', {}, c.grade === 'IP' ? 'In progress' : c.grade),
          el('td', { class: 'ctitle' }, tp.duplicate[i] ? 'already entered' : c.origin === 'transfer' ? 'transfer' : ''),
        ),
      );
    });
    box.append(table);
    if (tp.gpa !== undefined) {
      const cb = el('input', { type: 'checkbox', onchange: (e) => (tp.useGpa = (e.target as HTMLInputElement).checked) });
      cb.checked = tp.useGpa;
      box.append(el('label', { class: 'attest' }, cb, ` Use the transcript's cumulative GPA (${tp.gpa.toFixed(2)}) for the §2.2 check`));
    }
    box.append(
      el(
        'div',
        { class: 'save-buttons' },
        el(
          'button',
          {
            class: 'btn primary',
            onclick: () => {
              const picked = tp.courses.filter((_, i) => tp.selected[i]);
              update((s) => {
                for (const c of picked) {
                  s.courses.push({
                    courseId: c.courseId,
                    title: c.title,
                    credits: c.credits,
                    term: c.term,
                    grade: c.grade,
                    origin: c.origin,
                    institution: c.institution,
                  });
                }
                if (tp.useGpa && tp.gpa !== undefined) s.gpa = tp.gpa;
              });
              transcriptPreview = undefined;
              render();
              toast(`Added ${picked.length} course${picked.length === 1 ? '' : 's'} from the transcript.`);
            },
          },
          'Add selected courses',
        ),
        el('button', { class: 'btn', onclick: () => { transcriptPreview = undefined; render(); } }, 'Cancel'),
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

    const idInput = el('input', { list: 'known-courses', placeholder: 'CSE 60641', class: 'course-id' });
    const titleInput = el('input', { placeholder: 'Title (filled automatically)', class: 'course-title' });
    const creditsInput = el('input', { type: 'number', min: '0', max: '15', step: '0.5', value: '3' });
    const seasonSel = el('select', {});
    for (const se of SEASONS) seasonSel.append(option(se, se[0]!.toUpperCase() + se.slice(1)));
    const yearInput = el('input', { type: 'number', min: '2000', max: '2040', value: String(new Date().getFullYear()) });
    const gradeSel = el('select', {});
    for (const g of GRADES) gradeSel.append(option(g, g === 'IP' ? 'In progress' : g, g === 'IP'));
    const originSel = el('select', {});
    originSel.append(option('nd', 'Taken at Notre Dame', true), option('transfer', 'From another university'));
    const institutionInput = el('input', { placeholder: 'Institution', class: 'hidden' });
    // (The per-course core-area claim dropdown was retired 2026-09-03 —
    // the DGS's ExternalCourses rulings are the only §4.4.1 external path.)
    // Degree level for a course from another university (2026-09-03): an
    // UNDERGRADUATE course is still worth adding — it earns no transfer
    // credit (§5.2) but can satisfy §4.4.1 core knowledge once the DGS
    // confirms it in the external-course rules.
    const levelSel = el('select', { class: 'hidden' });
    levelSel.append(option('', 'Graduate coursework (§5.2 transfer)', true));
    levelSel.append(option('bachelors', 'Undergraduate — core knowledge only, no transfer credit'));
    levelSel.append(option('masters', 'From a previous Master’s'));
    levelSel.append(option('phd', 'From a previous Ph.D.'));
    const groupSel = el('select', { class: 'hidden' });
    groupSel.append(option('', 'Assign a specialization group…'));
    for (const g of rules.categoryGroups) groupSel.append(option(g.code, `Count as: ${g.name}`));

    originSel.addEventListener('change', () => {
      const transfer = (originSel as HTMLSelectElement).value === 'transfer';
      institutionInput.classList.toggle('hidden', !transfer);
      levelSel.classList.toggle('hidden', !transfer);
    });

    idInput.addEventListener('change', () => {
      const id = idInput.value.toUpperCase().replace(/\s+/g, ' ').trim();
      idInput.value = id;
      const term: Term = { season: (seasonSel as HTMLSelectElement).value as Season, year: Number(yearInput.value) };
      const rule = resolveRuleRow(rules, id, term);
      if (rule) {
        titleInput.value = rule.title;
        creditsInput.value = String(rule.creditsDefault ?? rule.creditMin ?? 3);
        const isAny = rule.categoryGroup === 'any';
        groupSel.classList.toggle('hidden', !(isAny && student.program === 'phd'));
        if (isAny && student.program === 'phd') {
          toast(`${id} is listed under every specialization group (§4.4.2) — pick whichever group you still need.`);
        }
      } else {
        groupSel.classList.add('hidden');
      }
    });

    const add = () => {
      const id = idInput.value.toUpperCase().replace(/\s+/g, ' ').trim();
      if (!id) {
        toast('Enter a course number first.');
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
      if (group && !groupSel.classList.contains('hidden')) entry.assignedGroup = group as CourseEntry['assignedGroup'];
      update((s) => void s.courses.push(entry));
    };

    return el(
      'div',
      { class: 'course-form' },
      datalist,
      el('div', { class: 'row1' }, idInput, titleInput),
      el(
        'div',
        { class: 'row2' },
        labelWrap('Credits', creditsInput),
        labelWrap('Term', el('div', { class: 'pair' }, seasonSel, yearInput)),
        labelWrap('Grade', gradeSel),
        labelWrap('Where', originSel),
      ),
      el('div', { class: 'row3' }, institutionInput, levelSel, groupSel, el('button', { class: 'btn primary', onclick: add }, 'Add course')),
    );
  }

  // One table per (university, degree) group (2026-09-03) — the group heading
  // above each table carries the university and transcript, so the rows stay
  // uniform. The original index is kept so the delete/assign controls edit
  // the right entry.
  function courseTable(courseLines: { courseId: string; term: Term; text: string }[], entries: { c: CourseEntry; index: number }[]): HTMLElement {
    const table = el('table', { class: 'courses' });
    table.append(
      el(
        'tr',
        {},
        el('th', {}, 'Course'),
        el('th', {}, 'Term'),
        el('th', {}, 'Cr'),
        el('th', {}, 'Grade'),
        el('th', {}, 'Counts toward'),
        el('th', {}, ''),
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
        {},
        el('div', { class: 'cid' }, c.courseId),
        el('div', { class: 'ctitle' }, c.title ?? rule?.title ?? ''),
      );
      if (rule?.notes) nameCell.title = rule.notes;
      const countsCell = el('td', { class: 'counts' }, line?.text ?? '');
      if (rule?.categoryGroup === 'any' && student.program === 'phd') {
        const sel = el('select', {
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
      const countsNothing =
        line !== undefined && /^(not counted|superseded|failed|credits count once)/.test(line.text);
      const row = el(
        'tr',
        { class: countsNothing ? 'dropped' : '' },
        nameCell,
        el('td', {}, termLabel(c.term)),
        el('td', {}, String(c.credits)),
        el('td', {}, c.grade === 'IP' ? 'In progress' : c.grade),
        countsCell,
        el('td', {}, el('button', { class: 'btn tiny', onclick: () => update((s) => void s.courses.splice(index, 1)) }, '✕')),
      );
      table.append(row);
    });
    return table;
  }

  // ---------- milestones + attestations ----------

  function milestonesCard(): HTMLElement {
    const m = student.milestones;
    const a = student.attestations;
    const card = el(
      'section',
      { class: 'card' },
      el('h2', {}, 'Milestones ', el('span', { class: 'chip-note' }, student.program === 'mscse' ? '§2.3, §3.4' : '§2.3, §4.4–4.7')),
    );

    card.append(
      field(
        'Advisor name (§2.3)',
        el('input', {
          value: m.advisorName ?? '',
          placeholder: 'Prof. …',
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
        onchange: (e) =>
          update((s) => void ((s.milestones as Record<string, string | undefined>)[key] = (e.target as HTMLInputElement).value || undefined)),
      }),
    );
  }

  // ---------- save / load ----------

  function saveCard(report: ReturnType<typeof audit>): HTMLElement {
    const fileInput = el('input', { type: 'file', accept: '.json,application/json', class: 'hidden' });
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
        el('button', { class: 'btn primary', onclick: () => exportFile(student) }, 'Save to a file'),
        el('button', { class: 'btn', onclick: () => (fileInput as HTMLInputElement).click() }, 'Load a file'),
        el(
          'button',
          {
            class: 'btn',
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
        el('button', { class: 'btn', onclick: () => window.print() }, 'Print'),
      ),
      fileInput,
    );
  }

  // ---------- diagnostics ----------

  function diagnosticsCard(): HTMLElement {
    const issues = rules.issues;
    if (issues.length === 0) return el('div', {});
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
        'It applies the rules in Sections 3 and 4 of the ',
        handbookLink(),
        '. Several requirements turn on approvals this page cannot see — advisor and DGS sign-off, the category-specialization course list announced by email each term, transfer-credit recommendations, and Graduate School deadlines. Deadline dates shown are approximate; the registrar sets the real calendar. Confirm your standing with the Graduate Program Coordinator and the Director of Graduate Studies before you rely on it.',
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
        ...reportToDgs(' Error reports and feedback — please email'),
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
  function labelWrap(label: string, control: HTMLElement): HTMLElement {
    return el('label', { class: 'field inline' }, el('span', { class: 'label' }, label), control);
  }

  render();
}
