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
  const mentions = noEmails.match(/[^\n]*notre\s+dame[^\n]*/gi) ?? [];
  return mentions.some((line) => !/notre\s+dame,?\s+(in|indiana)\b/i.test(line));
}
