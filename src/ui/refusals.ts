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
// good value back and drop the message. (Moved out of app.ts on 2026-09-20;
// the map itself is created there and passed in, so nothing here is shared
// state between modules.)
import { type NumberRange, inRange, inputRefusal } from '../engine/ranges.ts';
import { el } from './dom.ts';
import { clearInvalid, errorLine, markInvalid } from './form-helpers.ts';
import type { Refusal } from './state.ts';

/** The refused text and its sentence, by the `data-key` of the box it belongs to. */
export type RefusedValues = Map<string, { text: string; message: string }>;

/** The `data-key`s a refusal can be shown back in — every box `rangedNumber`
 * builds. A refusal for anything else is reported but has no field to sit in. */
const FORM_REFUSAL_KEYS = new Set(['courses.gpa', 'standing.year', 'standing.bachelors.year']);

/** A number a saved record or a transcript carried that the app will not
 * keep lands in the SAME refused state as one typed into the box: shown back
 * in its own field, marked invalid, with the sentence beside it. */
export function applyRefusals(refusedValues: RefusedValues, refusals: Refusal[]): void {
  // Only the refusals that belong to a box on this page go back into one;
  // the rest (a course's credits, which the coursework table shows as text)
  // are told in their own toast and live on the course's own line.
  for (const r of refusals) {
    if (FORM_REFUSAL_KEYS.has(r.key)) refusedValues.set(r.key, { text: r.text, message: r.message });
  }
}

/** A number input whose range is enforced, with its own persistent message
 * (the `.field-error` pattern the course-number box has used since the
 * 2026-09-05 usability review — item 6: a problem stays beside its field,
 * it does not flash past in a toast).
 *
 * `commit` is called only with a value inside the range; an empty box
 * commits `undefined` when `allowEmpty`, and is refused when it is not.
 * `toast` is the page's polite live region, so a refusal is heard as well
 * as seen. */
export function rangedNumber(
  opts: {
    key: string;
    range: NumberRange;
    value: string;
    allowEmpty: boolean;
    attrs?: Record<string, string>;
    commit: (value: number | undefined) => void;
  },
  refusedValues: RefusedValues,
  toast: (msg: string) => void,
): { input: HTMLInputElement; error: HTMLElement } {
  const refused = refusedValues.get(opts.key);
  const error = errorLine(`${opts.key.replace(/[^\w-]+/g, '-')}-error`);
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
  const show = (message: string): void => markInvalid(input, error, message, describedBy);
  const clear = (): void => clearInvalid(input, error, describedBy);
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
