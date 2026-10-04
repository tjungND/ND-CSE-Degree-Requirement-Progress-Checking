// Two ExternalCourses mistakes the DGS made and corrected (2026-10-04), with
// the instruction to warn the deciders and the Grad Admin if they happen again:
//   P1-sheet-48 — "If a course is an undergrad version, they should not
//     transfer. I corrected them on the spreadsheet. In the future, if such
//     things happen, a warning needs to be shown to ADGS/DGS/Grad Admin."
//     (Academic Code §4.6: only "graduate courses appropriate to the Notre
//     Dame graduate program" transfer.)
//   P1-sheet-c2 — independent-study / special-problems courses ruled `yes`:
//     a transferred course counts toward the regular-course credits, which
//     §3.2/§4.2 keep for regular courses ("Research seminar, research credits,
//     independent study, and other similar courses do not count as regular
//     courses"). "If this happens in the future, a warning needs to be shown to
//     ADGS/DGS/Grad Admin."
// Both are read from the course number and title, which differ from school to
// school, so they only WARN — the sheet check (for the DGS) and the review and
// processing requests (for the ADGS/DGS and the Grad Admin). Nothing is
// counted or refused on them. Only a `yes` row is checked: a case-by-case row
// is decided by a person for each student anyway.

/** The first run of digits in a course id, when it is a course number of 3 to
 * 5 digits ("ECE 4804" → "4804"; "6.006" and "30240233" have none). */
function courseNumber(courseId: string): string | undefined {
  const m = /(?<![0-9])([0-9]+)(?![0-9])/.exec(courseId);
  return m && m[1]!.length >= 3 && m[1]!.length <= 5 ? m[1] : undefined;
}

/** Does the course number look like an undergraduate course, as most
 * universities number them? Below 5000 for four digits, below 50000 for five,
 * and the 100s, 300s and 400s for three. The 200s are left alone: the
 * University of California numbers its graduate courses 200–299. A guess, for
 * a warning only. */
export function looksUndergraduateNumber(courseId: string): boolean {
  const n = courseNumber(courseId);
  if (n === undefined) return false;
  if (n.length === 3) return n[0] === '1' || n[0] === '3' || n[0] === '4';
  return Number(n) < (n.length === 4 ? 5000 : 50000);
}

const NON_REGULAR_TITLE =
  /\b(?:independent stud(?:y|ies)|special problems?|directed (?:study|studies|readings?|research)|individual(?:ized)? (?:study|studies|research)|readings? (?:and|&|in)\b|reading course|thesis|dissertation|seminar|colloquium|practicum|internship|co-?op\b|research (?:credits?|hours?)|(?:graduate|doctoral|master'?s) research)/i;

/** Does the title suggest a course that is not a regular course — independent
 * study, research, a thesis, a seminar, an internship? A guess, for a warning
 * only ("Special Topics" and "Research Methods" are regular courses and are
 * not matched). */
export function looksNonRegularTitle(title: string | undefined): boolean {
  return title !== undefined && NON_REGULAR_TITLE.test(title);
}

/** The warnings for one course from another university that the course rules
 * let transfer (`yes`), as plain sentences for the people who decide and
 * process. `section` is the program's regular-course section (§3.2 or §4.2). */
export function transferCourseChecks(courseId: string, university: string, title: string | undefined, section: string): string[] {
  const out: string[] = [];
  const who = `${courseId} (${university})`;
  if (looksUndergraduateNumber(courseId)) {
    out.push(
      `${who}: the course rules let it transfer, but its number looks like an undergraduate course — only graduate courses transfer (Academic Code §4.6). Check that it is the graduate version, and correct its ExternalCourses row if not.`,
    );
  }
  if (looksNonRegularTitle(title)) {
    out.push(
      `${who}${title ? ` “${title}”` : ''}: the course rules let it transfer, and it counts toward the regular-course credits, but its title suggests independent study, research or a seminar, which are not regular courses (${section}). Check it, and correct its ExternalCourses row if so.`,
    );
  }
  return out;
}
