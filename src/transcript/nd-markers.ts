// "Does this text come from a Notre Dame transcript?" — shared by the ND
// parser (which REJECTS transcripts that fail it) and the external parser
// (which REDIRECTS transcripts that pass it to the ND row). Pure.
//
// Positive markers only. An e-mail address never decides (2026-09-05): a
// current ND student's contact address on file at a previous institution is
// "…@nd.edu", which made a real IIT transcript look like Notre Dame's. Nor
// does a "Notre Dame, IN 46556" mailing address (a student's home address on
// another university's transcript).
export function looksLikeNotreDameTranscript(text: string): boolean {
  const noEmails = text.replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, ' ');
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
