// The form's building blocks (moved out of app.ts, 2026-09-20): a labelled
// control, a radio group, a fieldset for one question, the persistent error
// line under a box and the aria wiring that marks a box invalid. Pure
// functions of `el` — no student, no rules, no render.
import { el } from './dom.ts';

export function field(label: string, control: HTMLElement): HTMLElement {
  return el('label', { class: 'field' }, el('span', { class: 'label' }, label), control);
}
export function labelWrap(label: string, control: HTMLElement, hint?: string): HTMLElement {
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
export function radios(keyPrefix: string, options: [string, string][], current: string, onPick: (value: string) => void): HTMLElement {
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
export function fieldset(legend: string, controls: HTMLElement, variant: 'block' | 'inline' = 'block'): HTMLElement {
  return el('fieldset', { class: `field${variant === 'inline' ? ' inline' : ''} group` }, el('legend', { class: 'label' }, legend), controls);
}

/** The persistent message under a box (the `.field-error` pattern, usability
 * review 2026-09-05, item 6): hidden until `markInvalid` fills it. */
export function errorLine(id: string): HTMLElement {
  return el('p', { class: 'field-error hidden', id, role: 'alert' });
}

/** Show `message` in the box's error line and mark the box invalid: the line
 * becomes what describes the box (after `alsoDescribedBy`'s hint, when the
 * box has one), so a screen reader hears the problem with the field. */
export function markInvalid(input: HTMLElement, error: HTMLElement, message: string, alsoDescribedBy?: string): void {
  error.textContent = message;
  error.classList.remove('hidden');
  input.setAttribute('aria-invalid', 'true');
  input.setAttribute('aria-describedby', alsoDescribedBy ? `${error.id} ${alsoDescribedBy}` : error.id);
}

/** The reverse: hide the error line and leave the box described by its hint
 * alone (or by nothing). */
export function clearInvalid(input: HTMLElement, error: HTMLElement, alsoDescribedBy?: string): void {
  error.textContent = '';
  error.classList.add('hidden');
  input.removeAttribute('aria-invalid');
  if (alsoDescribedBy) input.setAttribute('aria-describedby', alsoDescribedBy);
  else input.removeAttribute('aria-describedby');
}
