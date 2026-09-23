// The student's earlier degrees — asked once in the opening dialog, changed
// from the Transcripts card (DGS 2026-09-22). Two facts decide which
// transcript rows a student needs: where the bachelor's degree is from, and
// whether a graduate degree came before this program. A Notre Dame degree of
// either kind is on the same insideND transcript as the current program, so
// it never needs a row of its own.
import type { Student } from '../engine/types.ts';
import { openModal, returnFocusTo } from './copy-dialog.ts';
import { el } from './dom.ts';

export type BachelorsFrom = 'nd-cse' | 'nd-other' | 'elsewhere';
export type GraduateBefore = 'none' | 'nd-mscse' | 'nd-other' | 'elsewhere';
export interface Background {
  bachelors: BachelorsFrom;
  graduate: GraduateBefore;
  /** For a graduate degree elsewhere: the same university as the bachelor's
   * (a 4+1 or 5+1), which usually means ONE transcript covering both. */
  samePlace?: boolean;
}
export type PriorSlot = 'bachelors' | 'masters' | 'phd';

export const BACHELORS_OPTIONS: [BachelorsFrom, string][] = [
  ['elsewhere', 'Another university'],
  ['nd-cse', 'Notre Dame — Computer Science and Engineering'],
  ['nd-other', 'Notre Dame — another department'],
];
export const GRADUATE_OPTIONS: [GraduateBefore, string][] = [
  ['none', 'No'],
  ['elsewhere', 'Yes, at another university (a master’s, or Ph.D. study — finished or not)'],
  ['nd-mscse', 'Yes, the MSCSE at Notre Dame (whether through the 4+1 program or not)'],
  ['nd-other', 'Yes, at Notre Dame in another department'],
];

/** A complete answer, or undefined while a question is still open. */
export function completeBackground(b: Partial<Background> | undefined): Background | undefined {
  if (!b || b.bachelors === undefined || b.graduate === undefined) return undefined;
  if (b.graduate === 'elsewhere' && b.samePlace === undefined) return undefined;
  return { bachelors: b.bachelors, graduate: b.graduate, ...(b.graduate === 'elsewhere' ? { samePlace: b.samePlace === true } : {}) };
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

/** One line for the Transcripts card: "Bachelor’s: another university · Master’s or Ph.D. study: at the same university (a 4+1)". */
export function describeBackground(b: Background): string {
  const bs = b.bachelors === 'elsewhere' ? 'another university' : b.bachelors === 'nd-cse' ? 'Notre Dame CSE' : 'Notre Dame, another department';
  const grad =
    b.graduate === 'none'
      ? 'none'
      : b.graduate === 'nd-mscse'
        ? 'the MSCSE at Notre Dame'
        : b.graduate === 'nd-other'
          ? 'Notre Dame, another department'
          : b.samePlace
            ? 'the same university as the bachelor’s (a 4+1 or 5+1)'
            : 'another university';
  return `Bachelor’s: ${bs} · Graduate degree before this program: ${grad}`;
}

/** What an answer settles on the standing card, applied when it is saved. */
export function applyBackground(s: Student, b: Background): void {
  s.background = b;
  if (b.graduate === 'none') {
    s.priorMs = 'none';
    s.priorMsInferred = undefined;
  }
  if (b.graduate === 'nd-mscse' && s.program === 'phd' && s.ndMasters === undefined) s.ndMasters = {};
}

/** The two (or three) questions as fieldsets; `onChange` gets the current
 * partial answer after every click. `prefix` keeps the radio groups and
 * data-keys distinct between the opening dialog and the change dialog. */
export function backgroundQuestions(current: Partial<Background> | undefined, prefix: string, onChange: (b: Partial<Background>) => void): HTMLElement {
  const state: Partial<Background> = { ...(current ?? {}) };
  const radios = (name: string, options: [string, string][], chosen: string | undefined, pick: (v: string) => void): HTMLElement => {
    const box = el('div', { class: 'radios' });
    for (const [value, label] of options) {
      const r = el('input', { type: 'radio', name: `${prefix}-${name}`, value, 'data-key': `${prefix}.${name}.${value}`, onchange: () => pick(value) }) as HTMLInputElement;
      r.checked = chosen === value;
      box.append(el('label', { class: 'radio' }, r, ` ${label}`));
    }
    return box;
  };
  const samePlaceBox = el('fieldset', { class: 'field group background-sameplace' });
  const renderSamePlace = (): void => {
    samePlaceBox.replaceChildren(
      el('legend', { class: 'label' }, 'Was it at the same university as your bachelor’s (a 4+1 or 5+1 program)?'),
      radios('sameplace', [['yes', 'Yes'], ['no', 'No']], state.samePlace === undefined ? undefined : state.samePlace ? 'yes' : 'no', (v) => {
        state.samePlace = v === 'yes';
        onChange(state);
      }),
    );
    samePlaceBox.hidden = state.graduate !== 'elsewhere';
  };
  renderSamePlace();
  return el(
    'div',
    { class: 'background-questions' },
    el(
      'fieldset',
      { class: 'field group' },
      el('legend', { class: 'label' }, 'Where is your bachelor’s degree from?'),
      radios('bachelors', BACHELORS_OPTIONS, state.bachelors, (v) => {
        state.bachelors = v as BachelorsFrom;
        onChange(state);
      }),
    ),
    el(
      'fieldset',
      { class: 'field group' },
      el('legend', { class: 'label' }, 'Did you hold, or start, a graduate degree before this program?'),
      radios('graduate', GRADUATE_OPTIONS, state.graduate, (v) => {
        state.graduate = v as GraduateBefore;
        if (v !== 'elsewhere') state.samePlace = undefined;
        renderSamePlace();
        onChange(state);
      }),
    ),
    samePlaceBox,
  );
}

/** The "Change" dialog on the Transcripts card: the same questions, saved
 * on "Save", left alone on Cancel or Escape. */
export function openBackgroundDialog(student: Student, update: (fn: (s: Student) => void) => void, returnKey: string): void {
  let answer: Partial<Background> | undefined = student.background;
  const save = el('button', { class: 'btn primary', 'data-key': 'background.save' }, 'Save');
  if (completeBackground(answer) === undefined) save.setAttribute('disabled', 'disabled');
  const dialog = el(
    'dialog',
    { class: 'consent background-dialog', 'aria-labelledby': 'background-title' },
    el(
      'div',
      { class: 'consent-box' },
      el('h2', { id: 'background-title' }, 'Your earlier degrees'),
      el('p', { class: 'hint' }, 'These answers decide which transcript rows you see. A Notre Dame degree is on the same insideND transcript as your current program, so it needs no row of its own.'),
      backgroundQuestions(answer, 'background', (b) => {
        answer = b;
        if (completeBackground(b)) save.removeAttribute('disabled');
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
    const b = completeBackground(answer);
    if (b) update((s) => applyBackground(s, b));
    close();
  });
  dialog.addEventListener('close', () => dialog.remove());
  document.body.append(dialog);
  if (openModal(dialog)) (dialog.querySelector('input[type=radio]') as HTMLElement | null)?.focus();
}
