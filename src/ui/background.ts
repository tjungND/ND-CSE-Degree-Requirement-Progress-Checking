// The student's situation — asked once in the opening dialog, changed from
// the Transcripts card, reset with the record (DGS 2026-09-22). Two facts
// with their follow-ups decide which transcript rows a student needs and
// settle the standing card's prior-degree facts (§5.2 caps, the Notre Dame
// MSCSE already held, the Integrated 4+1), which used to be controls of
// their own. A Notre Dame degree of either kind is on the same insideND
// transcript as the current program, so it never needs a row of its own.
import { termLabel } from '../engine/term.ts';
import type { Program, Season, Student, Term } from '../engine/types.ts';
import { labelCitationsIn } from './citations.ts';
import { openModal, returnFocusTo } from './copy-dialog.ts';
import { el, option } from './dom.ts';
import { SEASONS } from './state.ts';

export type BachelorsFrom = 'nd-cse' | 'nd-other' | 'elsewhere';
/** `nd-mscse-transfer` (DGS 2026-09-26): no degree — the student began in the
 * Notre Dame MSCSE and transferred into the Ph.D. before finishing it. It
 * settles nothing about caps (no prior degree), but §4.5's eighth semester is
 * counted from the MSCSE start: the entry term is the MSCSE's. */
export type GraduateBefore = 'none' | 'elsewhere' | 'nd-mscse' | 'nd-4plus1' | 'nd-mscse-transfer' | 'nd-other';
export interface Background {
  bachelors: BachelorsFrom;
  /** An MSCSE student with a Notre Dame CSE bachelor's: in the Integrated
   * B.S. + M.S. (4+1) program now? (§3.5.) */
  ndIntegrated?: boolean;
  graduate: GraduateBefore;
  /** A graduate degree elsewhere: at the same university as the bachelor's
   * (a 4+1 or 5+1), which usually means ONE transcript covering both. */
  samePlace?: boolean;
  /** A graduate degree elsewhere: finished (the §5.2 cap is 24 credits) or
   * not (6). */
  finished?: boolean;
  /** `nd-mscse-transfer` only (DGS 2026-09-28): when the student moved into
   * the Ph.D. — named on the copied emails beside the MSCSE entry term. */
  transferredTerm?: Term;
}
export type PriorSlot = 'bachelors' | 'masters' | 'phd';

export const BACHELORS_OPTIONS: [BachelorsFrom, string][] = [
  ['elsewhere', 'Another university'],
  ['nd-cse', 'Notre Dame — Computer Science and Engineering'],
  ['nd-other', 'Notre Dame — another department'],
];
/** The graduate-degree answers a program can give: an MSCSE student cannot
 * already hold the MSCSE. Each label is the option's HEAD line; the detail
 * that used to follow it in the same sentence is in GRADUATE_NOTES (DGS
 * 2026-09-29: the dialog read as a wall of long radio labels). */
export function graduateOptions(program: Program): [GraduateBefore, string][] {
  return [
    ['none', 'No'],
    ['elsewhere', 'Yes, at another university'],
    ...(program === 'phd'
      ? ([
          ['nd-mscse', 'Yes, the MSCSE at Notre Dame'],
          ['nd-4plus1', 'Yes, the MSCSE at Notre Dame, through the Integrated 4+1'],
          ['nd-mscse-transfer', 'I transferred into the Ph.D. from the Notre Dame MSCSE'],
        ] as [GraduateBefore, string][])
      : []),
    ['nd-other', 'Yes, at Notre Dame in another department'],
  ];
}
/** The lighter second line under a graduate-degree option. */
export const GRADUATE_NOTES: Partial<Record<GraduateBefore, string>> = {
  elsewhere: 'a master’s, or Ph.D. study',
  'nd-mscse': 'as a regular master’s student',
  'nd-4plus1': 'the Integrated B.S. + M.S. program',
  'nd-mscse-transfer': 'not a degree — you started in the MSCSE and moved into the Ph.D. before finishing it',
};

/** One selectable option row (DGS 2026-09-29: the opening dialog's radios
 * were long sentences beside bare buttons). The whole row is the label — a
 * bold head, a lighter note under it — and CSS paints the chosen one. The
 * input keeps the data-key the drivers click. */
export function choiceRow(opts: { name: string; value: string; head: string; sub?: string; dataKey: string; checked: boolean; onChange: () => void }): HTMLElement {
  const input = el('input', { type: 'radio', name: opts.name, value: opts.value, 'data-key': opts.dataKey, onchange: opts.onChange }) as HTMLInputElement;
  input.checked = opts.checked;
  return el('label', { class: 'choice' }, input, el('span', { class: 'choice-text' }, el('span', { class: 'choice-head' }, opts.head), ...(opts.sub ? [el('span', { class: 'choice-sub' }, opts.sub)] : [])));
}

/** A complete answer for this program, or undefined while a question that
 * applies is still open. */
/** Which bachelor's answers ask the Integrated 4+1 follow-up: a Notre Dame
 * CSE bachelor's, for BOTH programs since 2026-10-03 (a Ph.D. student whose
 * master's year became the Ph.D.'s first could not say they were in the 4+1,
 * and lost every senior-year graduate course — policy review). A Ph.D.
 * student who holds the MSCSE through the 4+1 (`nd-4plus1`) has answered it
 * already. */
function asksIntegratedFor(b: Partial<Background>, program: Program): boolean {
  if (b.bachelors !== 'nd-cse') return false;
  return program === 'mscse' || b.graduate !== 'nd-4plus1';
}
/** Which graduate answers ask "Did you finish it?": a degree elsewhere, and a
 * degree at Notre Dame in another department (2026-10-03) — the Academic
 * Code's §4.6 caps run on a FINISHED master's or Ph.D. (9 / 24) against an
 * unfinished one (6), and another Notre Dame department is "another graduate
 * program at Notre Dame" (DGS: "they need to be properly treated as another
 * graduate program"). */
function asksFinishedFor(b: Partial<Background>): boolean {
  return b.graduate === 'elsewhere' || b.graduate === 'nd-other';
}

export function completeBackground(b: Partial<Background> | undefined, program: Program): Background | undefined {
  if (!b || b.bachelors === undefined || b.graduate === undefined) return undefined;
  if (program === 'mscse' && (b.graduate === 'nd-mscse' || b.graduate === 'nd-4plus1' || b.graduate === 'nd-mscse-transfer')) return undefined;
  const asksIntegrated = asksIntegratedFor(b, program);
  if (asksIntegrated && b.ndIntegrated === undefined) return undefined;
  if (b.graduate === 'elsewhere' && (b.samePlace === undefined || b.finished === undefined)) return undefined;
  if (b.graduate === 'nd-other' && b.finished === undefined) return undefined;
  return {
    bachelors: b.bachelors,
    ...(asksIntegrated ? { ndIntegrated: b.ndIntegrated === true } : {}),
    graduate: b.graduate,
    ...(b.graduate === 'elsewhere' ? { samePlace: b.samePlace === true, finished: b.finished === true } : {}),
    ...(b.graduate === 'nd-other' ? { finished: b.finished === true } : {}),
    // The transfer term is asked but not required: the answer is complete
    // without it, and the emails then say "term not entered".
    ...(b.graduate === 'nd-mscse-transfer' && b.transferredTerm ? { transferredTerm: b.transferredTerm } : {}),
  };
}

/** Which previous-transcript rows this student needs. No answer yet → every
 * row, as before the questions existed. */
export function priorSlotsFor(b: Background | undefined): PriorSlot[] {
  if (!b) return ['bachelors', 'masters', 'phd'];
  const slots: PriorSlot[] = [];
  // A 4+1 elsewhere keeps the Undergraduate row: some universities issue two
  // transcripts, one per career, and the fold above the rows says which row
  // takes which shape.
  if (b.bachelors === 'elsewhere') slots.push('bachelors');
  if (b.graduate === 'elsewhere') slots.push('masters', 'phd');
  return slots;
}

/** One line for the cards: "Bachelor’s: another university · Graduate degree before this program: none". */
export function describeBackground(b: Background): string {
  const bs =
    b.bachelors === 'elsewhere'
      ? 'another university'
      : b.bachelors === 'nd-cse'
        ? `Notre Dame CSE${b.ndIntegrated ? ' (Integrated B.S. + M.S.)' : ''}`
        : 'Notre Dame, another department';
  const grad =
    b.graduate === 'none'
      ? 'none'
      : b.graduate === 'nd-mscse'
        ? 'the MSCSE at Notre Dame'
        : b.graduate === 'nd-4plus1'
          ? 'the MSCSE at Notre Dame (4+1)'
          : b.graduate === 'nd-mscse-transfer'
          ? `none — transferred into the Ph.D. from the Notre Dame MSCSE${b.transferredTerm ? ` in ${termLabel(b.transferredTerm)}` : ''} (the §4.3 and §4.5 clocks count from the MSCSE start, the §4.4 qualifier clocks from the transfer)`
          : b.graduate === 'nd-other'
            ? `Notre Dame, another department (${b.finished ? 'finished' : 'not finished'})`
            : `${b.finished ? 'finished' : 'not finished'}, at ${b.samePlace ? 'the same university as the bachelor’s (a 4+1 or 5+1)' : 'another university'}`;
  return `Bachelor’s: ${bs} · Graduate degree before this program: ${grad}`;
}

/** What an answer settles on the record — the facts the standing card's
 * prior-degree controls used to hold (removed 2026-09-22). Imports no longer
 * infer these once an answer exists. */
export function applyBackground(s: Student, b: Background): void {
  s.background = b;
  // A graduate degree elsewhere, or at Notre Dame in another department
  // (2026-10-03), is a prior graduate program under §5.2: 9 / 24 credits after
  // a finished degree, 6 after an unfinished one. The CSE MSCSE is not —
  // the Graduate School treats it as the same program as the Ph.D.
  s.priorMs = b.graduate === 'elsewhere' || b.graduate === 'nd-other' ? (b.finished ? 'completed' : 'unfinished') : 'none';
  s.priorMsInferred = undefined;
  const holdsNdMscse = s.program === 'phd' && (b.graduate === 'nd-mscse' || b.graduate === 'nd-4plus1');
  s.ndMasters = holdsNdMscse ? { ...(s.ndMasters?.term ? { term: s.ndMasters.term } : {}) } : undefined;
  // Integrated 4+1: the MSCSE through the 4+1, or the answer to the follow-up
  // (asked of every student with a Notre Dame CSE bachelor's since 2026-10-03).
  s.integratedBsMs = b.graduate === 'nd-4plus1' || (b.bachelors === 'nd-cse' && b.ndIntegrated === true);
  s.integratedBsMsInferred = undefined;
}

/** The questions as fieldsets, for `program`; `onChange` gets the current
 * partial answer after every click. `prefix` keeps the radio groups and
 * data-keys distinct between the opening dialog and the change dialog. */
export function backgroundQuestions(
  current: Partial<Background> | undefined,
  prefix: string,
  program: Program,
  onChange: (b: Partial<Background>) => void,
  /** One question at a time (the opening dialog, DGS 2026-09-23): the next
   * family appears only once the one before it is answered. The Change
   * dialog shows them all, since its answers already exist. */
  sequential = false,
): HTMLElement {
  const state: Partial<Background> = { ...(current ?? {}) };
  if (program === 'mscse' && (state.graduate === 'nd-mscse' || state.graduate === 'nd-4plus1' || state.graduate === 'nd-mscse-transfer')) state.graduate = undefined;
  // Option rows (choiceRow), one per answer; a yes/no pair sits side by side.
  const radios = (name: string, options: [string, string][], chosen: string | undefined, pick: (v: string) => void, notes: Partial<Record<string, string>> = {}, inline = false): HTMLElement => {
    const box = el('div', { class: inline ? 'choices inline' : 'choices' });
    for (const [value, label] of options) {
      box.append(choiceRow({ name: `${prefix}-${name}`, value, head: label, sub: notes[value], dataKey: `${prefix}.${name}.${value}`, checked: chosen === value, onChange: () => pick(value) }));
    }
    return box;
  };
  const yesNo = (name: string, chosen: boolean | undefined, pick: (v: boolean) => void): HTMLElement =>
    radios(name, [['yes', 'Yes'], ['no', 'No']], chosen === undefined ? undefined : chosen ? 'yes' : 'no', (v) => pick(v === 'yes'), {}, true);
  // The follow-ups nest under their step (a left rule, no number of their own).
  const integratedBox = el('fieldset', { class: 'field group background-followup' });
  const elsewhereBox = el('fieldset', { class: 'field group background-followup' });
  const finishedBox = el('fieldset', { class: 'field group background-followup' });
  const transferBox = el('fieldset', { class: 'field group background-followup' });
  // The transfer term (DGS 2026-09-28): a season and a year, kept only when
  // the year is a real one; the entry term is not touched.
  const termControls = (): HTMLElement => {
    const current = state.transferredTerm;
    const season = el('select', { 'data-key': `${prefix}.transferred.season`, 'aria-label': 'Semester of the transfer' }) as HTMLSelectElement;
    season.append(...SEASONS.map((se) => option(se, se[0]!.toUpperCase() + se.slice(1), (current?.season ?? 'fall') === se)));
    const year = el('input', { type: 'number', min: '2000', max: '2100', step: '1', 'data-key': `${prefix}.transferred.year`, 'aria-label': 'Year of the transfer', placeholder: 'year' }) as HTMLInputElement;
    if (current) year.value = String(current.year);
    const pick = (): void => {
      const y = Number(year.value);
      state.transferredTerm = Number.isInteger(y) && y >= 2000 && y <= 2100 ? { season: season.value as Season, year: y } : undefined;
      onChange(state);
    };
    season.onchange = pick;
    year.onchange = pick;
    return el('div', { class: 'term-pick' }, season, ' ', year);
  };
  const renderFollowUps = (): void => {
    integratedBox.replaceChildren(
      el('legend', { class: 'followup-title' }, program === 'mscse' ? 'Are you in Notre Dame’s Integrated B.S. + M.S. (4+1) program? (§3.5)' : 'Were you in Notre Dame’s Integrated B.S. + M.S. (4+1) program as an undergraduate? (§3.5)'),
      yesNo('ndintegrated', state.ndIntegrated, (v) => {
        state.ndIntegrated = v;
        onChange(state);
      }),
    );
    // Asked of every student with a Notre Dame CSE bachelor's (2026-10-03);
    // for the Ph.D. it sits under the graduate-degree question, which may
    // already have answered it (the MSCSE through the 4+1).
    integratedBox.hidden = !asksIntegratedFor(state, program) || (program === 'phd' && sequential && state.graduate === undefined);
    elsewhereBox.replaceChildren(
      el('legend', { class: 'followup-title' }, 'Was it at the same university as your bachelor’s (a 4+1 or 5+1 program)?'),
      yesNo('sameplace', state.samePlace, (v) => {
        state.samePlace = v;
        // Re-decide what shows: in the opening dialog "Did you finish it?"
        // waits for this answer, and until 2026-09-29 nothing re-rendered
        // here, so it never appeared — the button stayed grey for every
        // student with a degree from another university. (The drivers had
        // clicked the hidden input and never noticed.)
        renderFollowUps();
        onChange(state);
      }),
    );
    finishedBox.replaceChildren(
      el('legend', { class: 'followup-title' }, `Did you finish that degree? (§5.2 allows ${program === 'mscse' ? '9' : '24'} transfer credits after a finished master’s or Ph.D., 6 otherwise)`),
      yesNo('finished', state.finished, (v) => {
        state.finished = v;
        onChange(state);
      }),
    );
    elsewhereBox.hidden = state.graduate !== 'elsewhere';
    // Asked for a degree elsewhere and for one at Notre Dame in another
    // department alike (2026-10-03: the other department is "another graduate
    // program at Notre Dame", with the Code's 9 / 24 after a finished degree).
    finishedBox.hidden = !asksFinishedFor(state) || (sequential && state.graduate === 'elsewhere' && state.samePlace === undefined);
    transferBox.replaceChildren(
      el('legend', { class: 'followup-title' }, 'When did you transfer into the Ph.D.? (Your entry term stays the MSCSE’s — the §4.3 eight years and §4.5’s eighth semester count from it; the §4.4 qualifier clocks and the first-year seminars count from this transfer term.)'),
      termControls(),
    );
    transferBox.hidden = state.graduate !== 'nd-mscse-transfer';
    // The graduate-degree family waits for the bachelor's answer (and, for
    // the MSCSE, the 4+1 follow-up); for the Ph.D. the 4+1 follow-up comes
    // after the graduate question, since that question may answer it.
    graduateBox.hidden = sequential && (state.bachelors === undefined || (program === 'mscse' && state.bachelors === 'nd-cse' && state.ndIntegrated === undefined));
    // These questions live in dialogs outside the page root, which the
    // after-render citation pass never reaches: label them here ("CSE §5.2",
    // DGS 2026-10-03, citations.ts).
    for (const box of [integratedBox, elsewhereBox, finishedBox, transferBox]) labelCitationsIn(box);
  };
  // A numbered step (CSS counts the visible ones): the question is the heading.
  const graduateBox = el(
    'fieldset',
    { class: 'field group step' },
    el('legend', { class: 'step-title' }, 'Did you hold, or start, a graduate degree before this program?'),
    radios(
      'graduate',
      graduateOptions(program),
      state.graduate,
      (v) => {
        state.graduate = v as GraduateBefore;
        if (v !== 'elsewhere') state.samePlace = undefined;
        if (v !== 'elsewhere' && v !== 'nd-other') state.finished = undefined;
        if (v !== 'nd-mscse-transfer') state.transferredTerm = undefined;
        // The MSCSE through the 4+1 answers the Ph.D.'s 4+1 follow-up.
        if (program === 'phd' && v === 'nd-4plus1') state.ndIntegrated = undefined;
        renderFollowUps();
        onChange(state);
      },
      GRADUATE_NOTES,
    ),
  );
  renderFollowUps();
  // The MSCSE asks the 4+1 question right under the bachelor's answer (it
  // decides which transcript rows show); the Ph.D. asks it after the graduate
  // question, which may answer it (2026-10-03).
  const questions = el(
    'div',
    { class: 'background-questions' },
    el(
      'fieldset',
      { class: 'field group step' },
      el('legend', { class: 'step-title' }, 'Where is your bachelor’s degree from?'),
      radios('bachelors', BACHELORS_OPTIONS, state.bachelors, (v) => {
        state.bachelors = v as BachelorsFrom;
        if (v !== 'nd-cse') state.ndIntegrated = undefined;
        renderFollowUps();
        onChange(state);
      }),
    ),
    ...(program === 'mscse' ? [integratedBox, graduateBox] : [graduateBox, integratedBox]),
    elsewhereBox,
    finishedBox,
    transferBox,
  );
  labelCitationsIn(questions);
  return questions;
}

/** The "Change" dialog on the Transcripts and standing cards: the same
 * questions for the record's program, saved on "Save", left alone on Cancel
 * or Escape. (The program itself changes only through Reset.) */
export function openBackgroundDialog(student: Student, update: (fn: (s: Student) => void) => void, returnKey: string): void {
  const program = student.program;
  let answer: Partial<Background> | undefined = student.background;
  const save = el('button', { class: 'btn primary', 'data-key': 'background.save' }, 'Save');
  if (completeBackground(answer, program) === undefined) save.setAttribute('disabled', 'disabled');
  const dialog = el(
    'dialog',
    { class: 'consent background-dialog', 'aria-labelledby': 'background-title' },
    el(
      'div',
      { class: 'consent-box' },
      el('h2', { id: 'background-title' }, 'Your earlier degrees'),
      el('p', { class: 'hint' }, 'These answers decide which transcript rows you see and how §5.2 applies. A Notre Dame degree is on the same insideND transcript as your current program, so it needs no row of its own. To change the degree you are working toward, use Reset.'),
      backgroundQuestions(answer, 'background', program, (b) => {
        answer = b;
        if (completeBackground(b, program)) save.removeAttribute('disabled');
        else save.setAttribute('disabled', 'disabled');
      }),
      el('div', { class: 'save-buttons' }, save, el('button', { class: 'btn', 'data-key': 'background.cancel', onclick: () => close() }, 'Cancel')),
    ),
  ) as HTMLDialogElement;
  const close = (): void => {
    if (dialog.open) dialog.close();
    dialog.remove();
    returnFocusTo(returnKey);
  };
  save.addEventListener('click', () => {
    const b = completeBackground(answer, program);
    if (b) update((s) => applyBackground(s, b));
    close();
  });
  dialog.addEventListener('close', () => dialog.remove());
  labelCitationsIn(dialog); // outside the root, like the toasts (citations.ts)
  document.body.append(dialog);
  if (openModal(dialog)) (dialog.querySelector('input[type=radio]') as HTMLElement | null)?.focus();
}
