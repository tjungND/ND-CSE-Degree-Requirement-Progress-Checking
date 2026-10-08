// A Notre Dame transcript's major cells (insideND prints each term's college
// and major): which name CSE, which name another department, and which name
// nothing a reader can rely on. Shared by the earlier-degrees reading
// (src/ui/background-read.ts) and the entry-term rule (parse.ts). Pure.

/** CSE's majors as insideND prints them — Computer Science, Computer
 * Engineering, Computer Science & Engineering (or "and") — and their usual
 * abbreviations ("Computer Sci & Engr", "Comp Sci", "CSE"). */
export function isCseMajor(major: string | undefined): boolean {
  return major !== undefined && (/\bcomputer\s+(science|engineering)\b|\bcomp(?:uter)?\.?\s*(?:sci(?:ence)?|eng(?:r|ineering)?)\b/i.test(major) || /^\s*cse\s*$/i.test(major));
}

/** A major cell that does not name a department: a placeholder for a
 * student without a degree program or a declared major. */
const PLACEHOLDER_MAJOR_RE = /\bnon[-\s]?degree\b|\bundeclared\b|\bundecided\b|\bunclassified\b|\bvisiting\b|\bexchange\b|\bspecial\s+student\b|\bno\s+major\b|^\s*none\s*$|\bintent\b/i;

/** A major cell that names a whole major of another department. Not a
 * fragment of a CSE major cut by a wrapped cell ("Computer", "Computer
 * Science"), a placeholder ("-", "Undeclared", "Non-Degree Seeking"), a
 * standing value, or a name cut after "&", "and" or "of" — those leave the
 * question to the student (review of Option 1, 2026-10-08: only a positive
 * reading is evidence). */
export function isOtherDepartmentMajor(major: string | undefined): boolean {
  if (major === undefined || isCseMajor(major)) return false;
  const m = major.trim().replace(/\s+/g, ' ');
  if (!/[a-z]{3}/i.test(m) || PLACEHOLDER_MAJOR_RE.test(m) || /\bstanding\b|\bprobation\b|\bwarning\b/i.test(m) || /(?:&|\band|\bof)$/i.test(m)) return false;
  // A leading part of a CSE major's name, cut by a wrapped cell.
  const words = m.toLowerCase().split(' ');
  for (const cse of ['computer science and engineering', 'computer science & engineering', 'computer engineering']) {
    const full = cse.split(' ');
    if (words.length < full.length && words.every((w, i) => w === full[i])) return false;
  }
  return true;
}
