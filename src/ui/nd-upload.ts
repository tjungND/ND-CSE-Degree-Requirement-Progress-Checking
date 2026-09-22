// The Notre Dame unofficial-transcript import (moved out of app.ts,
// 2026-09-20): the Import button and its persistent error, the parse, the
// preview the student ticks through, and the Add that files the rows. The
// preview state lives here, like external-upload.ts's; app.ts asks
// `ndPreviewOpen()` to block the other import buttons while it is open.
// Everything else — the record, the rules, the toasts, the render — arrives in
// `NdUploadArgs` on every call, so this module never captures the reassignable
// `student`.
import { resolveRuleRow } from '../data/assemble.ts';
import { findExternalRule } from '../data/external.ts';
import type { Rules } from '../data/types.ts';
import { priorNdUndergraduateCanCount } from '../engine/allocate.ts';
import { CORE_TITLE_RE } from '../engine/core-title.ts';
import { GRADE_POINTS } from '../engine/grades.ts';
import { GPA_RANGE, formatValue, inRange, rangeSpan } from '../engine/ranges.ts';
import { termIndex, termLabel, termOfDate, termShort } from '../engine/term.ts';
import type { CourseEntry, Student, Term } from '../engine/types.ts';
import { parseTranscript, type DegreeAwarded, type EntryTermInference, type ParsedCourse } from '../transcript/parse.ts';
import { el, inactiveButton, PREVIEW_OPEN_NOTE } from './dom.ts';
import { plural } from './email-html.ts';
import { ndRowLabel } from './external-upload.ts';
import { deriveNdMasters, derivePriorMs, hasPriorGraduateStudy, priorNdDegreeLevel, reclassifyNotreDameCourses } from './prior-nd.ts';
import type { RefusedValues } from './refusals.ts';

/** What app.ts hands every call — the same shape external-upload.ts takes,
 * plus the focus keeper's `setFocusAfterRender` and the form's refused
 * values (an import answers a box, so its refusal goes). */
export interface NdUploadArgs {
  student: Student;
  rules: Rules;
  update: (fn: (s: Student) => void) => void;
  toast: (msg: string) => void;
  toastWithAction: (msg: string, actionLabel: string, action: () => void, opts?: { ttlMs?: number; focusKey?: string }) => void;
  render: () => void;
  /** One transcript at a time (2026-09-03): true while ANY preview is open. */
  blocked: boolean;
  setFocusAfterRender: (key: string) => void;
  refusedValues: RefusedValues;
}

/** Parsed-transcript preview awaiting the student's confirmation. */
export interface NdPreview {
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
let transcriptPreview: NdPreview | undefined;

/** True while the Notre Dame preview is open — app.ts combines it with
 * external-upload.ts's `importsBusy()` to block every import button. */
export function ndPreviewOpen(): boolean {
  return transcriptPreview !== undefined;
}

/** An import that failed (usability review 2026-09-05, item 6): shown as a
 * persistent message under the Notre Dame row — a 4-second toast was easy
 * to miss and impossible to re-read. Cleared by the next import or Dismiss. */
let ndImportError: string | undefined;

export function ndTranscriptUpload(args: NdUploadArgs): HTMLElement {
  const fileInput = el('input', { type: 'file', accept: '.pdf,application/pdf', class: 'hidden', 'aria-label': 'ND unofficial transcript PDF' });
  const fail = (message: string): void => {
    transcriptPreview = undefined;
    ndImportError = message;
    args.setFocusAfterRender('import.nd.error');
    args.render();
  };
  fileInput.addEventListener('change', async () => {
    const file = (fileInput as HTMLInputElement).files?.[0];
    if (!file) return;
    ndImportError = undefined;
    args.toast('Reading the transcript… (it never leaves this browser)');
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
        args.student.courses.some(
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
      const entry = parsed.entryTerm?.term ?? args.student.entryTerm;
      const bsTerm = bachelorsTermFor(parsed.degreesAwarded, args.student);
      const qualifierApplies = args.student.program === 'phd';
      const irrelevantPrior = parsed.courses.map((c) => {
        if (c.origin !== 'nd' || termIndex(c.term) >= termIndex(entry)) return false;
        const rule = resolveRuleRow(args.rules, c.courseId, c.term);
        return (
          priorNdDegreeLevel({ courseId: c.courseId, registeredLevel: c.level, term: c.term }, bsTerm) === 'bachelors' &&
          !priorNdUndergraduateCanCount({ courseId: c.courseId, credits: c.credits, term: c.term, grade: c.grade, origin: 'transfer' }, rule, args.student.program) &&
          !(qualifierApplies && CORE_TITLE_RE.test(c.title ?? '')) &&
          !(qualifierApplies && rule?.coreArea) &&
          !(qualifierApplies && findExternalRule(args.rules.external, 'University of Notre Dame', c.courseId))
        );
      });
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
      args.render();
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
              args.setFocusAfterRender('import.nd');
              args.render();
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
  const imported = args.student.courses.filter((c) => c.fromNdTranscript === true);
  // While a preview is open (this row's or a previous-university one), the
  // Import and Remove buttons are inactive and say why on hover / click
  // (DGS request 2026-09-06) — `inactiveButton`, not `disabled`, so the
  // reason can be shown.
  const button = (attrs: Record<string, string | boolean | ((ev: Event) => void)>, label: string): HTMLButtonElement =>
    args.blocked ? inactiveButton(attrs, PREVIEW_OPEN_NOTE, args.toast, label) : el('button', attrs, label);
  const importButton = button(
    {
      class: 'btn',
      'data-key': 'import.nd',
      // B7 (2026-09-18): four buttons on this card read "Import from PDF".
      // The visible label stays short; the accessible name says which row.
      'aria-label': `${imported.length > 0 ? 'Import again' : 'Import'} — ${ndRowLabel(args.student)}`,
      onclick: () => (fileInput as HTMLInputElement).click(),
    },
    imported.length > 0 ? 'Import again' : 'Import from PDF',
  );
  const parts: (Node | string)[] = [
    // Named for the program the student picked at the top (DGS 2026-09-11):
    // an ND 4+1 student has several Notre Dame transcripts, and "ND
    // Unofficial Transcript" did not say which one this row wants.
    el('span', { class: 'slot-label' }, ndRowLabel(args.student)),
    el('span', { class: 'slot-sep', 'aria-hidden': 'true' }, ' — '),
  ];
  if (imported.length > 0) {
    const n = imported.length;
    parts.push(
      el('span', {}, `${plural(n, 'course')} from your transcript `),
      button(
        {
          class: 'btn tiny',
          'aria-label': `Remove the ${plural(n, 'course')} imported from your ND transcript`,
          'data-key': 'import.nd.remove',
          onclick: () => {
            // Index-preserving (2026-09-06 evening): Undo puts every row
            // back where it was, so the table order and the course.N.remove
            // keys are exactly as before the Remove.
            const removed = args.student.courses.map((c, i) => ({ c, i })).filter(({ c }) => c.fromNdTranscript === true);
            const before = { gpa: args.student.gpa, gpaSource: args.student.gpaSource, priorMs: args.student.priorMs, inferred: args.student.priorMsInferred };
            args.setFocusAfterRender('import.nd');
            args.update((s) => {
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
            args.toastWithAction(
              `${plural(removed.length, 'course')} from your ND transcript removed${before.gpaSource !== undefined ? ', and the GPA it filled in' : ''}.`,
              'Undo',
              () =>
                args.update((s) => {
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
      el('span', { class: 'hint-inline' }, ' — the system-generated PDF from insideND; fills the coursework table and GPA below. If it also shows a Notre Dame bachelor’s or master’s, import it here once — those degrees, their courses and your entry term are read from it. The Previous rows are for other universities.'),
    );
  }
  return el('div', { class: 'transcript-upload external-slot' }, ...parts, fileInput, errorBox);
}

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
const bachelorsTermFor = (degrees: DegreeAwarded[], student: Student): Term | undefined => {
  const bs = bachelorsAwardFrom(degrees);
  return bs && bachelorsMayBeSet(student) ? bs.term : student.bachelorsAwarded;
};

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

export function ndTranscriptPreviewBlock(args: NdUploadArgs): HTMLElement {
  const tp = transcriptPreview!;
  const box = el('div', { class: 'transcript-preview' });
  // The entry term the split below is judged against: the transcript's
  // reading while its checkbox is ticked, otherwise the standing card's.
  const entry = tp.useEntryTerm && tp.entryTerm ? tp.entryTerm.term : args.student.entryTerm;
  const priorCount = tp.courses.filter((c) => c.origin === 'nd' && termIndex(c.term) < termIndex(entry)).length;
  box.append(
    el('h3', {}, `Found ${plural(tp.courses.length, 'course')} — untick anything that shouldn't count, then add`),
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
        args.render();
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
  if (bs && bachelorsMayBeSet(args.student)) {
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
        args.student.program === 'phd'
          ? `${plural(priorCount, 'course')} dated before ${termLabel(entry)} are filed as coursework from before you entered: no residency counts, but they can still satisfy core knowledge (§4.4.1), count toward the credits if taken at Notre Dame as an undergraduate (§4.2), or transfer as graduate courses from elsewhere under §5.2. Undergraduate courses that cannot matter start unticked.`
          : `${plural(priorCount, 'course')} dated before ${termLabel(entry)} are filed as coursework from before you entered: no residency counts, but they can still count toward the credits if taken at Notre Dame as an undergraduate (§3.2) or transfer as graduate courses from elsewhere under §5.2. Undergraduate courses that cannot matter start unticked.`,
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
        args.render(); // the Add button's count follows (item 13)
      },
    });
    cb.checked = tp.selected[i]!;
    const prior = c.origin === 'nd' && termIndex(c.term) < termIndex(entry);
    const note = tp.duplicate[i]
      ? 'already entered'
      : c.origin === 'transfer'
        ? 'transfer'
        : prior
          ? `before entry — prior ${priorNdDegreeLevel({ courseId: c.courseId, registeredLevel: c.level, term: c.term }, bachelorsTermFor(tp.degreesAwarded, args.student)) === 'bachelors' ? 'undergraduate' : 'graduate'} coursework`
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
    args.render();
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
          onclick: () => applyNdPreview(tp, args),
        },
        `Add ${plural(tp.selected.filter(Boolean).length, 'selected course')}`,
      ),
      el('button', { class: 'btn', 'data-key': 'preview.cancel', onclick: () => { transcriptPreview = undefined; args.setFocusAfterRender('import.nd'); args.render(); } }, 'Cancel'),
    ),
  );
  return box;
}

/** The preview's Add: file the ticked rows on the record, apply what the
 * transcript read for the standing card (entry term, bachelor's award, prior
 * degrees, the MSCSE box, the GPA), close the preview and say what was done. */
function applyNdPreview(tp: NdPreview, args: NdUploadArgs): void {
  const picked = tp.courses.filter((_, i) => tp.selected[i]);
  let priorAdded = 0;
  let priorSet: Student['priorMs'] | undefined;
  let bachelorsSet: Term | undefined;
  let ndMastersSet = false;
  args.update((s) => {
    if (tp.useEntryTerm && tp.entryTerm) {
      s.entryTerm = { ...tp.entryTerm.term };
      s.entryTermInferred = { how: tp.entryTerm.how, alternative: tp.entryTerm.alternative };
      args.refusedValues.delete('standing.year'); // the transcript answered this box
    }
    // Likewise for the two boxes the import fills in below: a
    // refusal left over from something typed earlier would show a
    // rejected figure beside a row now reading the transcript's
    // (R1, 2026-09-18).
    if (tp.gpaChoice !== 'none') args.refusedValues.delete('courses.gpa');
    // The bachelor's award term (2026-09-06), before the prior
    // rows are filed — they follow it when unlabelled.
    const bs = bachelorsAwardFrom(tp.degreesAwarded);
    if (bs && bachelorsMayBeSet(s)) {
      args.refusedValues.delete('standing.bachelors.year');
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
  args.setFocusAfterRender('import.nd');
  args.render();
  // "Check it under Your standing" once, at the end, for the entry
  // term and the bachelor's term together — it used to follow each
  // (trim review 2026-09-18, P-90). The unfinished-M.S. clause keeps
  // its own, different instruction.
  const toCheck = (appliedEntry ? 1 : 0) + (bachelorsSet ? 1 : 0);
  args.toast(
    `Added ${plural(picked.length, 'course')} from the transcript` +
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
}
