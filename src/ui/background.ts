// The student's situation — asked once in the opening dialog, changed from
// the Transcripts card, reset with the record (DGS 2026-09-22). Two facts
// with their follow-ups decide which transcript rows a student needs and
// settle the standing card's prior-degree facts (§5.2 caps, the Notre Dame
// MSCSE already held, the Integrated 4+1), which used to be controls of
// their own. A Notre Dame degree of either kind is on the same insideND
// transcript as the current program, so it never needs a row of its own.
import type { Program, Student } from '../engine/types.ts';
import { openModal, returnFocusTo } from './copy-dialog.ts';
import { el } from './dom.ts';

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
}
export type PriorSlot = 'bachelors' | 'masters' | 'phd';

export const BACHELORS_OPTIONS: [BachelorsFrom, string][] = [
  ['elsewhere', 'Another university'],
  ['nd-cse', 'Notre Dame — Computer Science and Engineering'],
  ['nd-other', 'Notre Dame — another department'],
];
/** The graduate-degree answers a program can give: an MSCSE student cannot
 * already hold the MSCSE. */
export function graduateOptions(program: Program): [GraduateBefore, string][] {
  return [
    ['none', 'No'],
    ['elsewhere', 'Yes, at another university (a master’s, or Ph.D. study)'],
    ...(program === 'phd'
      ? ([
          ['nd-mscse', 'Yes, the MSCSE at Notre Dame — as a regular master’s student'],
          ['nd-4plus1', 'Yes, the MSCSE at Notre Dame — through the Integrated B.S. + M.S. (4+1) program'],
          ['nd-mscse-transfer', 'Not a degree — I started in the MSCSE at Notre Dame and transferred into the Ph.D. before finishing it'],
        ] as [GraduateBefore, string][])
      : []),
    ['nd-other', 'Yes, at Notre Dame in another department'],
  ];
}

/** A complete answer for this program, or undefined while a question that
 * applies is still open. */
export function completeBackground(b: Partial<Background> | undefined, program: Program): Background | undefined {
  if (!b || b.bachelors === undefined || b.graduate === undefined) return undefined;
  if (program === 'mscse' && (b.graduate === 'nd-mscse' || b.graduate === 'nd-4plus1' || b.graduate === 'nd-mscse-transfer')) return undefined;
  const asksIntegrated = program === 'mscse' && b.bachelors === 'nd-cse';
  if (asksIntegrated && b.ndIntegrated === undefined) return undefined;
  if (b.graduate === 'elsewhere' && (b.samePlace === undefined || b.finished === undefined)) return undefined;
  return {
    bachelors: b.bachelors,
    ...(asksIntegrated ? { ndIntegrated: b.ndIntegrated === true } : {}),
    graduate: b.graduate,
    ...(b.graduate === 'elsewhere' ? { samePlace: b.samePlace === true, finished: b.finished === true } : {}),
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
          ? 'none — transferred into the Ph.D. from the Notre Dame MSCSE (deadlines count from the MSCSE start)'
          : b.graduate === 'nd-other'
            ? 'Notre Dame, another department'
            : `${b.finished ? 'finished' : 'not finished'}, at ${b.samePlace ? 'the same university as the bachelor’s (a 4+1 or 5+1)' : 'another university'}`;
  return `Bachelor’s: ${bs} · Graduate degree before this program: ${grad}`;
}

/** What an answer settles on the record — the facts the standing card's
 * prior-degree controls used to hold (removed 2026-09-22). Imports no longer
 * infer these once an answer exists. */
export function applyBackground(s: Student, b: Background): void {
  s.background = b;
  s.priorMs = b.graduate === 'elsewhere' ? (b.finished ? 'completed' : 'unfinished') : 'none';
  s.priorMsInferred = undefined;
  const holdsNdMscse = s.program === 'phd' && (b.graduate === 'nd-mscse' || b.graduate === 'nd-4plus1');
  s.ndMasters = holdsNdMscse ? { ...(s.ndMasters?.term ? { term: s.ndMasters.term } : {}) } : undefined;
  s.integratedBsMs = s.program === 'phd' ? b.graduate === 'nd-4plus1' : b.bachelors === 'nd-cse' && b.ndIntegrated === true;
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
  const radios = (name: string, options: [string, string][], chosen: string | undefined, pick: (v: string) => void): HTMLElement => {
    const box = el('div', { class: 'radios' });
    for (const [value, label] of options) {
      const r = el('input', { type: 'radio', name: `${prefix}-${name}`, value, 'data-key': `${prefix}.${name}.${value}`, onchange: () => pick(value) }) as HTMLInputElement;
      r.checked = chosen === value;
      box.append(el('label', { class: 'radio' }, r, ` ${label}`));
    }
    return box;
  };
  const yesNo = (name: string, chosen: boolean | undefined, pick: (v: boolean) => void): HTMLElement =>
    radios(name, [['yes', 'Yes'], ['no', 'No']], chosen === undefined ? undefined : chosen ? 'yes' : 'no', (v) => pick(v === 'yes'));
  const integratedBox = el('fieldset', { class: 'field group background-followup' });
  const elsewhereBox = el('fieldset', { class: 'field group background-followup' });
  const finishedBox = el('fieldset', { class: 'field group background-followup' });
  const renderFollowUps = (): void => {
    integratedBox.replaceChildren(
      el('legend', { class: 'label' }, 'Are you in Notre Dame’s Integrated B.S. + M.S. (4+1) program? (§3.5)'),
      yesNo('ndintegrated', state.ndIntegrated, (v) => {
        state.ndIntegrated = v;
        onChange(state);
      }),
    );
    integratedBox.hidden = !(program === 'mscse' && state.bachelors === 'nd-cse');
    elsewhereBox.replaceChildren(
      el('legend', { class: 'label' }, 'Was it at the same university as your bachelor’s (a 4+1 or 5+1 program)?'),
      yesNo('sameplace', state.samePlace, (v) => {
        state.samePlace = v;
        onChange(state);
      }),
    );
    finishedBox.replaceChildren(
      el('legend', { class: 'label' }, 'Did you finish that degree? (§5.2 allows 24 transfer credits after a finished master’s, 6 otherwise)'),
      yesNo('finished', state.finished, (v) => {
        state.finished = v;
        onChange(state);
      }),
    );
    elsewhereBox.hidden = state.graduate !== 'elsewhere';
    finishedBox.hidden = state.graduate !== 'elsewhere' || (sequential && state.samePlace === undefined);
    // The graduate-degree family waits for the bachelor's answer (and the
    // 4+1 follow-up, when it is asked).
    graduateBox.hidden = sequential && (state.bachelors === undefined || (program === 'mscse' && state.bachelors === 'nd-cse' && state.ndIntegrated === undefined));
  };
  const graduateBox = el(
    'fieldset',
    { class: 'field group' },
    el('legend', { class: 'label' }, 'Did you hold, or start, a graduate degree before this program?'),
    radios('graduate', graduateOptions(program), state.graduate, (v) => {
      state.graduate = v as GraduateBefore;
      if (v !== 'elsewhere') {
        state.samePlace = undefined;
        state.finished = undefined;
      }
      renderFollowUps();
      onChange(state);
    }),
  );
  renderFollowUps();
  return el(
    'div',
    { class: 'background-questions' },
    el(
      'fieldset',
      { class: 'field group' },
      el('legend', { class: 'label' }, 'Where is your bachelor’s degree from?'),
      radios('bachelors', BACHELORS_OPTIONS, state.bachelors, (v) => {
        state.bachelors = v as BachelorsFrom;
        if (v !== 'nd-cse') state.ndIntegrated = undefined;
        renderFollowUps();
        onChange(state);
      }),
    ),
    integratedBox,
    graduateBox,
    elsewhereBox,
    finishedBox,
  );
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
  document.body.append(dialog);
  if (openModal(dialog)) (dialog.querySelector('input[type=radio]') as HTMLElement | null)?.focus();
}
