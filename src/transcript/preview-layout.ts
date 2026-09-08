// Which layout a preview row gets (bug found by the DGS, 2026-09-07). DOM-free
// so the rule can be tested on its own (tests/preview-layout.test.ts).
//
// A COMPACT row is the one-line form: "☐ CS 25100  Data Structures  4 cr · A ·
// FA23 · [UG student]". It works only because every value is short locked text
// and the only control is the level dropdown, so the row can be told not to
// wrap and the columns line up down the card.
//
// Being a text-layer import is NOT enough to earn it. The parser can read a
// course and its title and still miss the credits, the grade or the year — it
// then renders a full-size input or select in that cell, and a row that cannot
// wrap overflows the card sideways, cutting the level dropdown in half (the
// DGS's screenshot of 2026-09-07: three rows whose years were unread, the
// "Taken as" column sliced off the right edge and a horizontal scrollbar).
//
// So: compact only when there is nothing left to fill in. Any row still asking
// the student for a value keeps the labelled layout, which wraps.

export interface PreviewRowValues {
  /** The import gives fixed values (a text-layer transcript), not editable ones. */
  locked: boolean;
  /** Undefined when the parser could not read the credits. */
  credits?: number;
  /** '' when the parser could not map the grade. */
  grade: string;
  /** Undefined when the parser could not read the year. */
  year?: number;
}

export function rowIsCompact(r: PreviewRowValues): boolean {
  return r.locked && r.credits !== undefined && r.grade !== '' && r.year !== undefined;
}

/** Which bachelor's award term a previous-transcript preview should show, and
 * where it came from (DGS bug 2026-09-07). A term the student set THEMSELVES
 * wins: importing a second transcript must not move an answer they already
 * gave. A term merely inferred from an earlier transcript does not win — this
 * transcript's own conferral date is the better evidence and replaces it, as
 * before. Callers pass `handSet` only when the student set it by hand. */
export function bachelorsPrefill<T>(handSet: T | undefined, fromTranscript: T | undefined): { term: T; source: 'student' | 'transcript' } | undefined {
  if (handSet !== undefined) return { term: handSet, source: 'student' };
  if (fromTranscript !== undefined) return { term: fromTranscript, source: 'transcript' };
  return undefined;
}
