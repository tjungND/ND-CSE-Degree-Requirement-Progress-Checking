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

/** A page the OCR path read below its usual resolution (OCR step 12,
 * 2026-10-09): `ocrRenderScale` in ocr-lines.ts had to bring a much larger
 * than letter-size page under 216 dpi so its canvas stays inside the limits
 * iOS Safari draws nothing beyond. `page` is 1-based; `dpi` the resolution
 * it was read at. */
export interface OcrReducedPage {
  page: number;
  dpi: number;
}

/** The sentence the OCR banner adds for such pages (W-CL373): which pages,
 * why, and the lowest resolution among them — so the student checks those
 * rows with extra care. '' when no page was reduced. */
export function ocrReducedPagesNote(pages: readonly OcrReducedPage[]): string {
  if (pages.length === 0) return '';
  const numbers = [...pages].sort((a, b) => a.page - b.page).map((p) => String(p.page));
  const list = numbers.length === 1 ? numbers[0]! : `${numbers.slice(0, -1).join(', ')} and ${numbers[numbers.length - 1]!}`;
  const dpi = Math.min(...pages.map((p) => p.dpi));
  return numbers.length === 1
    ? `Page ${list} is much larger than a letter page and was read at a lower resolution than usual (about ${dpi} dpi), so its rows may be rougher — check them with extra care.`
    : `Pages ${list} are much larger than a letter page and were read at a lower resolution than usual (about ${dpi} dpi), so their rows may be rougher — check them with extra care.`;
}

/** The sentence the OCR banner adds when the orientation trial turned the
 * scan before reading it (OCR step 12; W-CL374): a quarter turn either way
 * is "sideways", a half turn "upside down". '' when it was the right way up. */
export function ocrTurnedNote(turned: 0 | 90 | 180 | 270): string {
  if (turned === 0) return '';
  return `The scan was ${turned === 180 ? 'upside down' : 'sideways'} and was turned the right way up before reading.`;
}
