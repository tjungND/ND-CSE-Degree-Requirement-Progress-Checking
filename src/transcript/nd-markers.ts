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
 * institution. */
export const OTHER_NOTRE_DAMES = /university\s+of\s+notre\s+dame,?\s+australia|notre\s+dame\s+of\s+maryland|notre\s+dame\s+de\s+namur|(?<!university\s+of\s+)notre\s+dame\s+college(?!\s+of\b)|college\s+of\s+notre\s+dame|notre\s+dame\s+university|notre\s+dame\s+seishin|notre\s+dame\s+women/i;

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
  const noEmails = text.replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, ' ').replace(new RegExp(OTHER_NOTRE_DAMES.source, 'gi'), ' ');
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
    if (/university\s+of\s+notre\s+dame/i.test(line)) return true;
    return !/notre\s+dame,?\s+(in|indiana)\b/i.test(line);
  });
}
