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
//   IIT CS 455 — "This was also my mistake. If you notice such courses that
//     look like undergrad courses from another institution, raise warnings to
//     DGS/ADGS/Grad Admin." (DGS 2026-10-04)
// Both are read from the course number and title, which differ from school to
// school, so they only WARN — the sheet check (for the DGS) and the review and
// processing requests (for the ADGS/DGS and the Grad Admin). Nothing is
// counted or refused on them. The number is checked on every course from
// another institution that could count — ruled `yes`, case by case, or not in
// the course rules yet; the title only on a `yes` (a case-by-case or unlisted
// course is read by the person who decides it).

/** The first run of digits in a course id, when it is a course number of 3 to
 * 5 digits ("ECE 4804" → "4804"; "6.006" and "30240233" have none). The
 * leftmost greedy match IS the first whole run; no lookbehind, which Safari
 * before 16.4 cannot compile (cross-browser review, 2026-10-10). */
function courseNumber(courseId: string): string | undefined {
  const m = /[0-9]+/.exec(courseId);
  return m && m[0].length >= 3 && m[0].length <= 5 ? m[0] : undefined;
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

/** How the course rules treat a course from another institution, for the
 * wording of its warning: `yes` (it transfers), `case` (dgs_approval /
 * adgs_approval — decided for each student), `unlisted` (no row yet). */
export type TransferVerdict = 'yes' | 'case' | 'unlisted';

/** The warnings for one course from another institution that could count, as
 * plain sentences for the people who decide and process. `section` is the
 * program's regular-course section (§3.2 or §4.2). */
export function transferCourseChecks(courseId: string, university: string, title: string | undefined, section: string, verdict: TransferVerdict = 'yes'): string[] {
  const out: string[] = [];
  const who = `${courseId} (${university})`;
  if (looksUndergraduateNumber(courseId)) {
    const rule =
      verdict === 'yes' ? 'the course rules let it transfer' : verdict === 'case' ? 'the course rules decide it case by case' : 'it is not in the course rules yet';
    const act = verdict === 'yes' ? 'Check that it is the graduate version, and correct its ExternalCourses row if not.' : 'Check that it is the graduate version before approving it.';
    out.push(`${who}: ${rule}, but its number looks like an undergraduate course — only graduate courses transfer (Academic Code §4.6). ${act}`);
  }
  if (verdict === 'yes' && looksNonRegularTitle(title)) {
    out.push(
      `${who}${title ? ` “${title}”` : ''}: the course rules let it transfer, and it counts toward the regular-course credits, but its title suggests independent study, research or a seminar, which are not regular courses (${section}). Check it, and correct its ExternalCourses row if so.`,
    );
  }
  return out;
}
