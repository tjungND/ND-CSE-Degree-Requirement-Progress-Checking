// The numeric ranges the entry form advertises — enforced, not decorative
// (interface review R1, 2026-09-18: the `min`/`max` attributes on every number
// field were read by nothing, so a GPA of 35 stored as 35 and rendered
// "Cumulative GPA 35.00 meets the 3.0 minimum" under a green Met pill).
//
// One table, read by the form, by the save-file loader, by the transcript
// import and by the engine, so all four refuse the same values and say the
// same sentence.
//
// These are NOT handbook policy and NOT sheet parameters: they are the shape
// of the number itself — Notre Dame's grade points run 0.00–4.00, a course is
// worth some credits, a term has a year. The §2.2 MINIMUM a student must keep
// is policy and still comes from the sheet (`gpa_min`), as does every other
// threshold (CLAUDE.md: "policy lives in the sheet, structure lives in code").

export type NumberRange = {
  min: number;
  /** Absent = open-ended above. The DGS ruled on 2026-09-18 that a YEAR has no
   * upper bound (a student may record a term as far ahead as they plan); every
   * other number here is bounded at both ends. */
  max?: number;
  /** How many decimals the bounds are written with in a message. */
  decimals: number;
  /** Subject of the refusal sentence, e.g. "A cumulative GPA". */
  what: string;
  /** Where the student can find the right value. */
  help: string;
};

/** §2.2's GPA is the registrar's cumulative figure, on Notre Dame's 4.00 scale. */
export const GPA_RANGE: NumberRange = {
  min: 0,
  max: 4,
  decimals: 2,
  what: 'A cumulative GPA',
  help: 'Check the figure on your transcript and enter it again.',
};

/** One course's credit hours. Fifteen is the most any single course may be
 * worth (DGS 2026-09-18), so this one bound holds everywhere a course's credits
 * are entered — the add-course form, every transcript preview row, and a saved
 * file — not just in the form that first advertised it. */
export const COURSE_CREDITS_RANGE: NumberRange = {
  min: 0,
  max: 15,
  decimals: 0,
  what: 'The credits for one course',
  help: 'Your transcript prints the credit hours beside each course.',
};

/** The year of a term a student took a course in, or entered the program in.
 * Open-ended above (DGS 2026-09-18: “do not have a maximum bound for the
 * year”) — a term may be as far ahead as the student plans. The floor is
 * 2000, here and in every transcript preview: coursework older than that
 * settles nothing either degree asks about (§5.2's transfer window is five
 * years). */
export const TERM_YEAR_RANGE: NumberRange = {
  min: 2000,
  decimals: 0,
  what: 'A term year',
  help: 'Enter the four-digit year of the semester.',
};

/** The year a bachelor's degree was awarded — earlier than any term of this
 * program, and the switch §5.2 turns on (a graduate course dated in or before
 * it earns no transfer credit). ONE rule for every year (DGS 2026-09-18, asked
 * directly): floor 2000, no ceiling. The floor was 1970; the DGS was shown that
 * 2000 refuses a returning student whose bachelor's degree is older than that,
 * and chose the single rule anyway. */
export const BACHELORS_YEAR_RANGE: NumberRange = {
  min: 2000,
  decimals: 0,
  what: 'The year a bachelor’s degree was awarded',
  help: 'Enter the four-digit year your degree was conferred.',
};

/** Is this value one the app may keep? A value that is not a finite number at
 * all fails too: a hand-edited save file can carry `"four point oh"`, and
 * before this check it reached the §2.2 row and threw on `.toFixed()`. */
export function inRange(value: unknown, range: NumberRange): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= range.min &&
    (range.max === undefined || value <= range.max)
  );
}

/** The cumulative GPA only where it is a figure the app may reason FROM.
 * Every gate that compares the GPA to §2.2's minimum reads it through here
 * (interface review R1, 2026-09-18): the §2.2 row says an off-scale figure
 * cannot be checked, so no other row in the same report may go on to say
 * "yours is -2.00" — and the §4.5 candidacy gate used to throw outright on a
 * `null` one. */
export function usableGpa(gpa: unknown): number | undefined {
  return inRange(gpa, GPA_RANGE) ? gpa : undefined;
}

/** The bounds as a refusal sentence says them: "between 0.00 and 4.00", or
 * "2000 or later" where there is no ceiling (only the year ranges are
 * open-ended, hence "later" rather than "more"). */
function rangeBounds(range: NumberRange): string {
  const min = range.min.toFixed(range.decimals);
  return range.max === undefined ? `${min} or later` : `between ${min} and ${range.max.toFixed(range.decimals)}`;
}

/** The same bounds where a sentence wants a span: "0.00–4.00", "2000 or later". */
export function rangeSpan(range: NumberRange): string {
  const min = range.min.toFixed(range.decimals);
  return range.max === undefined ? `${min} or later` : `${min}–${range.max.toFixed(range.decimals)}`;
}

/** A value as a student reads it back — whatever it was, never rounded.
 * A number takes the range's own precision only where that is exact (35 →
 * "35.00"); otherwise it is printed as it stands (15.5 stays "15.5"). Rounding
 * would name a figure the student never entered, and for 15.5 credits or a GPA
 * of 4.001 it would name one INSIDE the range the same sentence calls for.
 * Anything that is not a finite number (a string from an edited file) is
 * printed as it stands too, never coerced into something that looks official. */
export function formatValue(value: unknown, range: NumberRange): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return String(value);
  const padded = value.toFixed(range.decimals);
  return Number(padded) === value ? padded : String(value);
}

/** The one refusal sentence, used by the form, the loader and the import.
 * `action` is what did not happen to the value ("saved", "added", "loaded"). */
export function rangeRefusal(value: unknown, range: NumberRange, action = 'saved'): string {
  return `${range.what} must be ${rangeBounds(range)} — ${formatValue(value, range)} was not ${action}. ${range.help}`;
}

/** The same sentence for what a box in the form hands back: a `type="number"`
 * input returns an empty string both for a box left blank and for text it
 * could not parse at all, so the two arrive here alike. */
export function inputRefusal(text: string, range: NumberRange, action = 'saved'): string {
  if (text.trim() === '') {
    return `This box cannot be left empty — ${range.what.charAt(0).toLowerCase()}${range.what.slice(1)} must be ${rangeBounds(range)}. ${range.help}`;
  }
  const n = Number(text);
  return rangeRefusal(Number.isFinite(n) ? n : text, range, action);
}
