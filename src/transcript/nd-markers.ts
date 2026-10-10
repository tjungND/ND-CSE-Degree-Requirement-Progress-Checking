// "Does this text come from a Notre Dame transcript?" — shared by the ND
// parser (which REJECTS transcripts that fail it) and the external parser
// (which REDIRECTS transcripts that pass it to the ND row). Pure.
//
// Positive markers only. An e-mail address never decides (2026-09-05): a
// current ND student's contact address on file at a previous institution is
// "…@nd.edu", which made a real IIT transcript look like Notre Dame's. Nor
// does a "Notre Dame, IN 46556" mailing address (a student's home address on
// another university's transcript).
/** Other institutions named Notre Dame (review of Option 1, 2026-10-08): the
 * University of Notre Dame Australia, Notre Dame of Maryland University,
 * Notre Dame de Namur University, Notre Dame College (Ohio), the College of
 * Notre Dame, Notre Dame University–Louaize and the like. Their transcripts
 * are not Notre Dame's, and they are not Notre Dame in a course's
 * institution. "Notre Dame College" right after "University of" is not one
 * of them (group 1, refused by `otherNotreDameSpans`). Read it only through
 * `namesOtherNotreDame` and `withoutOtherNotreDames`.
 *
 * That refusal was a lookbehind inside the pattern until 2026-10-10. Safari
 * before 16.4 cannot compile a lookbehind, and every iOS browser is Safari;
 * this pattern is built when the shared module loads, so both pages were
 * blank there (cross-browser review). The check is now written out in code.
 * tests/browser-support.test.ts keeps lookbehinds out of src/. */
const OTHER_NOTRE_DAMES = /university\s+of\s+notre\s+dame,?\s+australia|notre\s+dame\s+of\s+maryland|notre\s+dame\s+de\s+namur|(notre\s+dame\s+college)(?!\s+of\b)|college\s+of\s+notre\s+dame|notre\s+dame\s+university|notre\s+dame\s+seishin|notre\s+dame\s+women/gi;
const ENDS_UNIVERSITY_OF = /university\s+of\s+$/i;
const WHITESPACE = /\s/;

/** Does text[0, end) end with "university\s+of\s+"? The same answer as
 * ENDS_UNIVERSITY_OF on the whole prefix, read from the only stretch a match
 * can cover — the whitespace before `end`, "of", the whitespace before it and
 * the ten letters of "university" — so a long transcript with many refusals
 * stays linear (review, 2026-10-10). */
function endsWithUniversityOf(text: string, end: number): boolean {
  let i = end;
  while (i > 0 && WHITESPACE.test(text[i - 1]!)) i--;
  if (i === end || i < 2) return false;
  const beforeOf = i - 2;
  i = beforeOf;
  while (i > 0 && WHITESPACE.test(text[i - 1]!)) i--;
  if (i === beforeOf || i < 10) return false;
  return ENDS_UNIVERSITY_OF.test(text.slice(i - 10, end));
}

/** Each [start, end) where `text` names another Notre Dame, in order. This
 * is the same scan the old lookbehind made: a refused match moves on by one
 * character, as the regex engine itself would. */
function otherNotreDameSpans(text: string): Array<[number, number]> {
  const re = new RegExp(OTHER_NOTRE_DAMES.source, 'gi');
  const spans: Array<[number, number]> = [];
  for (let m = re.exec(text); m !== null; m = re.exec(text)) {
    if (m[1] !== undefined && endsWithUniversityOf(text, m.index)) {
      re.lastIndex = m.index + 1;
      continue;
    }
    spans.push([m.index, m.index + m[0].length]);
  }
  return spans;
}

/** Does `text` name an institution other than Notre Dame that is called Notre Dame? */
export function namesOtherNotreDame(text: string): boolean {
  return otherNotreDameSpans(text).length > 0;
}

/** `text` with each other Notre Dame replaced by a space. */
export function withoutOtherNotreDames(text: string): string {
  let out = '';
  let at = 0;
  for (const [start, end] of otherNotreDameSpans(text)) {
    out += text.slice(at, start) + ' ';
    at = end;
  }
  return out + text.slice(at);
}

/** The part of a transcript that names the university that issued it: the
 * lines before its first course line (a subject code, a number and a title).
 * Another university's transcript names Notre Dame among its courses — a
 * transfer-credit block, a course taken there one summer — and that is not
 * Notre Dame's transcript (blue/red-team review of Option 1, item 14; DGS
 * 2026-10-08: option (b)). */
function headerOf(text: string): string {
  const firstCourse = /^[ \t]*[A-Z]{2,4}[ \t]?\d{3,5}[A-Z]?[ \t]+[A-Za-z]/m.exec(text);
  return firstCourse ? text.slice(0, firstCourse.index) : text;
}

export function looksLikeNotreDameTranscript(text: string): boolean {
  const noEmails = withoutOtherNotreDames(text.replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, ' '));
  // insideND URLs live in the browser's print footer of the unofficial transcript.
  if (/\bnd\.edu\b/i.test(noEmails) || /\binside\.nd\b/i.test(noEmails)) return true;
  // The issuer's own labels, anywhere: the official transcript's
  // "UNIVERSITY OF NOTRE DAME CREDIT:" section (it follows the transfer
  // block, whose course lines end the header) and the running-totals
  // "NOTRE DAME Ehrs:". A transfer block names a source, not a section.
  if (/university\s+of\s+notre\s+dame\s+credit\b/i.test(noEmails) || /notre\s+dame\s+ehrs\b/i.test(noEmails)) return true;
  // Only the header names the issuer (item 14, above), and not a line about
  // transfer credit — nor one up to three lines under a "transfer" heading,
  // where another university's transcript names the credit's source.
  const header = headerOf(noEmails);
  // Every mention below contains "notre dame", so a text without it has none
  // (efficiency, 2026-10-07): the line scan only runs on text that can match.
  if (!/notre\s+dame/i.test(header)) return false;
  const lines = header.split('\n');
  return lines.some((line, i) => {
    if (!/notre\s+dame/i.test(line)) return false;
    if (lines.slice(Math.max(0, i - 3), i + 1).some((l) => /transfer/i.test(l))) return false;
    // The RECIPIENT of another university's transcript (F5, Batch B
    // 2026-10-09): a delivery cover names Notre Dame as where the document
    // goes — UCLA's "Recipient: University of Notre Dame", eScrip-Safe's
    // "To: University of Notre Dame" and the lines under its "Receiver
    // Information" heading. A label before the mention, or such a heading up
    // to three lines above, says the line is not the issuer's.
    if (RECIPIENT_LABEL_RE.test(line)) return false;
    if (lines.slice(Math.max(0, i - 3), i).some((l) => RECIPIENT_HEADING_RE.test(l))) return false;
    if (/university\s+of\s+notre\s+dame/i.test(line)) return true;
    return !/notre\s+dame,?\s+(in|indiana)\b/i.test(line);
  });
}
/** "Recipient:", "To:", "Sent to", "Delivered to", "Receiver", "Destination",
 * "Requested by", "Order(ed) by" — before the mention of Notre Dame on the
 * same line. */
const RECIPIENT_LABEL_RE = /\b(?:recipient|to|sent\s+to|deliver(?:ed)?\s+to|receiver|destination|requested\s+by|order(?:ed)?\s+(?:by|for)|release\s+to)\s*:[^\n]*notre\s+dame/i;
/** A heading that opens the recipient's block on a delivery cover. */
const RECIPIENT_HEADING_RE = /^\s*(?:receiver|recipient|destination|deliver(?:y|ed)\s+to|sent\s+to)(?:\s+information|\s+details)?\s*:?\s*$/i;
