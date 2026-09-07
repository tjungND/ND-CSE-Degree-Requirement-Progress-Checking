// "Oral Candidacy Exam (OCE)" in full at its FIRST mention only; every later
// mention says "OCE" (DGS, 2026-09-06 evening). The engine and every builder
// keep writing the full name — a string is self-contained and the tests pin
// it — and each SURFACE shortens the repeats on the way out: the page in
// render() (document order = phone and screen-reader order), the copied
// emails on their text and html flavours. DOM-free apart from the walker.
export const OCE_FULL = 'Oral Candidacy Exam (OCE)';
export const OCE_SHORT = 'OCE';

/** Case-insensitive (the advisor summary upper-cases section headings), with
 * or without the bracketed acronym, so a later bare "Oral Candidacy Exam"
 * shortens too. A lone "OCE" never matches. */
const OCE_RE = /Oral Candidacy Exam(?: \(OCE\))?/gi;

/** The text with the first mention kept as written and every later one
 * replaced by the short form. Idempotent. */
export function shortenAfterFirst(text: string, re: RegExp = OCE_RE, short: string = OCE_SHORT): string {
  let seen = false;
  return text.replace(re, (m) => {
    if (seen) return short;
    seen = true;
    return m;
  });
}

/** The same rule over a rendered page: walks the text nodes under `root` in
 * document order and rewrites `nodeValue` only (never the element tree —
 * restoreFocus() relies on element-index paths). Skipped: the glossary (its
 * term keeps the full name — it is the definition), the print-only header,
 * and form values (`select`, `textarea`). */
export function applyFirstMentionRule(root: ParentNode, re: RegExp = OCE_RE, short: string = OCE_SHORT): void {
  const doc = (root as Node).ownerDocument ?? (root as Document);
  const walker = doc.createTreeWalker(root as Node, 4 /* NodeFilter.SHOW_TEXT */);
  const test = new RegExp(re.source, re.flags.replace('g', ''));
  let seen = false;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const value = node.nodeValue;
    if (!value || !test.test(value)) continue;
    if (node.parentElement?.closest('details.glossary, .print-header, select, textarea, script, style')) continue;
    if (seen) {
      node.nodeValue = value.replace(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g'), short);
    } else {
      node.nodeValue = shortenAfterFirst(value, re, short);
      seen = true;
    }
  }
}
