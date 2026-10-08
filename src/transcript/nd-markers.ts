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

export function looksLikeNotreDameTranscript(text: string): boolean {
  const noEmails = text.replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, ' ').replace(new RegExp(OTHER_NOTRE_DAMES.source, 'gi'), ' ');
  if (/university\s+of\s+notre\s+dame/i.test(noEmails)) return true;
  // insideND URLs live in the browser's print footer of the unofficial transcript.
  if (/\bnd\.edu\b/i.test(noEmails) || /\binside\.nd\b/i.test(noEmails)) return true;
  // Every mention below contains "notre dame", so a text without it has none
  // (efficiency, 2026-10-07): the mention pattern restarts at every character
  // of a long line, which made it slow on long transcripts from other
  // universities, so it only runs on text that can match. Keep this test in
  // step with the pattern.
  if (!/notre\s+dame/i.test(noEmails)) return false;
  const mentions = noEmails.match(/[^\n]*notre\s+dame[^\n]*/gi) ?? [];
  return mentions.some((line) => !/notre\s+dame,?\s+(in|indiana)\b/i.test(line));
}
