// Notre Dame unofficial-transcript text → course entries. Pure (text in,
// data out) so it is unit-testable without a PDF.
//
// ND runs Ellucian Banner; the self-service "Academic Transcript (unofficial)"
// lists, per term ("Fall Semester 2026" — the same naming Banner uses in ND's
// own course exports), rows of:
//   SUBJ 12345 [LEVEL] Title… GRADE credits [quality points] [R]
// plus sections "TRANSFER CREDIT ACCEPTED BY INSTITUTION" (origin: transfer),
// "INSTITUTION CREDIT" (origin: nd), "COURSES IN PROGRESS" (no grade → IP),
// and "TRANSCRIPT TOTALS" (the Overall row's last column is the cumulative GPA).
//
// Parsing a PDF's text is inherently best-effort: everything parsed here is
// shown to the student for confirmation before anything is added (never guess).
import type { Grade, Season, Term } from '../engine/types.ts';
import { looksLikeNotreDameTranscript } from './nd-markers.ts';

export interface ParsedCourse {
  courseId: string;
  title?: string;
  credits: number;
  grade: Grade;
  term: Term;
  origin: 'nd' | 'transfer';
  institution?: string;
}

export interface ParsedTranscript {
  isNotreDame: boolean;
  courses: ParsedCourse[];
  cumulativeGpa?: number;
  warnings: string[];
}

const LETTER_GRADES: Grade[] = ['A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D', 'F', 'S', 'U'];
/** Grades that appear on transcripts but earn nothing / need a human decision
 * ('I' becomes an F after 30 days per §5.1 — a human should decide). */
const SKIP_GRADES = new Set(['W', 'WF', 'WP', 'AU', 'NR', 'X', 'NG', 'I']);

const TERM_RE = /\b(Fall|Spring|Summer)\s+(?:Semester\s+|Session\s+)?(\d{4})\b/i;
const COURSE_HEAD_RE = /^([A-Z]{2,5})\s+(\d{5})\b\s*(?:(UG|GR|PR|LW|EM|GB)\b)?\s*(.*)$/;

export function parseTranscript(lines: string[]): ParsedTranscript {
  const warnings: string[] = [];
  // The ND marker can live anywhere: the page body, the official PDF's header,
  // or only the browser's print footer (an nd.edu URL) on a printed-to-PDF
  // web transcript — so scan the whole text.
  // Shared with the external parser (nd-markers.ts, 2026-09-05): an nd.edu
  // e-mail address or a "Notre Dame, IN" mailing address is NOT a marker.
  const isNotreDame = looksLikeNotreDameTranscript(lines.join('\n'));
  if (!isNotreDame) {
    return { isNotreDame: false, courses: [], warnings };
  }

  let term: Term | undefined;
  let origin: 'nd' | 'transfer' = 'nd';
  let inProgress = false;
  let institution: string | undefined;
  let expectInstitution = false;
  let cumulativeGpa: number | undefined;
  const courses: ParsedCourse[] = [];
  const skipped: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+/g, ' ').trim();
    if (line === '') continue;
    const upper = line.toUpperCase();

    // Section switches — tolerant of both Banner 8 ("INSTITUTION CREDIT",
    // "COURSES IN PROGRESS", trailing "-Top-" link text) and Banner 9
    // ("Institutional Credit", "Course(s) in Progress") wording.
    if (/TRANSFER CREDIT ACCEPTED|TRANSFER CREDIT\b/.test(upper)) {
      origin = 'transfer';
      inProgress = false;
      expectInstitution = true;
      continue;
    }
    if (/INSTITUTION(AL)? CREDIT/.test(upper)) {
      origin = 'nd';
      inProgress = false;
      institution = undefined;
      continue;
    }
    if (/COURSE\(?S?\)? IN PROGRESS|WORK IN PROGRESS/.test(upper)) {
      origin = 'nd';
      inProgress = true;
      institution = undefined;
      continue;
    }
    if (/TRANSCRIPT TOTALS/.test(upper)) {
      inProgress = false;
      continue;
    }

    // Cumulative GPA. Web transcript: the "Overall" totals row's last ≤4.334
    // decimal. Official ND PDF: running totals like "NOTRE DAME Ehrs: 72.000
    // QPts: 106.000 GPA-Hrs: 28.000 GPA: 3.786" — take the labeled value; the
    // LAST occurrence in either style is the final cumulative figure.
    const labeledGpa = /\bGPA:?\s*([0-4]\.\d{1,3})\b\s*$/.exec(line);
    if (labeledGpa) {
      cumulativeGpa = Number(labeledGpa[1]);
      continue;
    }
    if (/^OVERALL\b/.test(upper) || /\bCUMULATIVE\b.*\bGPA\b/.test(upper)) {
      const nums = line.match(/\d+\.\d{1,3}/g);
      if (nums && nums.length > 0) {
        const last = Number(nums[nums.length - 1]);
        if (last <= 4.334) cumulativeGpa = last;
      }
      continue;
    }

    // Term headers ("Fall Semester 2026", "Term: Spring Semester 2027", …).
    const termMatch = TERM_RE.exec(line);
    if (termMatch && !COURSE_HEAD_RE.test(line)) {
      term = { season: termMatch[1]!.toLowerCase() as Season, year: Number(termMatch[2]) };
      continue;
    }

    // In the transfer section, a non-course line right after the header names
    // the attempt period and source institution (e.g. "202010: Purdue
    // University"). ND's Banner term codes: YYYY00 = Summer YYYY, YYYY10 =
    // Fall YYYY, YYYY20 = Spring YYYY+1 (confirmed against ND's own catalog
    // exports: 202610 = "Fall Semester 2026", 201800 = "Summer Session 2018").
    const courseMatch = COURSE_HEAD_RE.exec(line);
    if (!courseMatch) {
      if (expectInstitution && origin === 'transfer' && /[A-Za-z]{4,}/.test(line) && !TERM_RE.test(line)) {
        const code = /^(\d{4})(00|10|20)\b/.exec(line);
        if (code) {
          const year = Number(code[1]);
          term =
            code[2] === '10'
              ? { season: 'fall', year }
              : code[2] === '20'
                ? { season: 'spring', year: year + 1 }
                : { season: 'summer', year };
        }
        institution = line.replace(/^\d+\s*:?\s*/, '').replace(/[.:]\s*$/, '').trim() || undefined;
        expectInstitution = false;
      }
      continue;
    }
    expectInstitution = false;

    const [, subject, number, , rest] = courseMatch;
    const courseId = `${subject} ${number}`;

    // Walk the tail tokens: trailing decimals are credits [+ quality points];
    // the token before them, if it looks like a grade, is the grade.
    const tokens = (rest ?? '').trim().split(' ').filter((t) => t !== '');
    while (tokens.length > 0 && /^(R|E)$/.test(tokens[tokens.length - 1]!)) tokens.pop(); // repeat/exclude markers
    const decimals: number[] = [];
    while (tokens.length > 0 && /^\d+\.\d{1,3}$/.test(tokens[tokens.length - 1]!)) {
      decimals.unshift(Number(tokens.pop()));
      if (decimals.length === 4) break;
    }
    if (decimals.length === 0) continue; // not a course row (no credit hours)
    // Web-transcript layout: "… GRADE credits [qualityPoints]" — with 2+
    // trailing decimals the FIRST is the credit hours.
    const credits = decimals[0]!;

    let grade: Grade | undefined;
    const tail = tokens[tokens.length - 1] ?? '';
    const tailUpper = tail.toUpperCase();
    let creditsOverride: number | undefined;
    const popCreditsBeforeGrade = () => {
      // ND's OFFICIAL PDF orders columns "… credits GRADE qualitypoints"
      // (e.g. "Tpcs in Evol Biol 3.000 B+ 9.999") — after removing the grade,
      // a decimal still trails the title: THAT is the credit-hours value.
      const prev = tokens[tokens.length - 1] ?? '';
      if (/^\d+\.\d{1,3}$/.test(prev) && Number(prev) <= 20) {
        creditsOverride = Number(tokens.pop());
      }
    };
    if (LETTER_GRADES.includes(tailUpper as Grade)) {
      grade = tailUpper as Grade;
      tokens.pop();
      popCreditsBeforeGrade();
    } else if (tailUpper === 'P' || tailUpper === 'PASS') {
      grade = 'S';
      tokens.pop();
      popCreditsBeforeGrade();
    } else if (SKIP_GRADES.has(tailUpper)) {
      skipped.push(`${courseId} (${tailUpper})`);
      continue;
    } else if (tailUpper === 'TR') {
      tokens.pop();
      skipped.push(`${courseId} (TR — the original grade is not shown; add it manually)`);
      continue;
    }

    const resolvedCredits = creditsOverride ?? credits;
    if (resolvedCredits > 20) continue; // not a plausible credit-hours value

    if (!term) {
      warnings.push(`${courseId} appeared before any term header — it was skipped; add it manually.`);
      continue;
    }

    courses.push({
      courseId,
      title: tokens.join(' ') || undefined,
      credits: resolvedCredits,
      grade: grade ?? 'IP',
      term,
      origin,
      institution: origin === 'transfer' ? institution : undefined,
    });
  }

  if (skipped.length > 0) {
    warnings.push(`Skipped (withdrawn/audit/no grade shown): ${skipped.join(', ')}.`);
  }

  // De-duplicate identical rows (the same course line can appear in both a term
  // listing and a summary block).
  const seen = new Set<string>();
  const unique = courses.filter((c) => {
    const key = `${c.courseId}|${c.term.season}${c.term.year}|${c.grade}|${c.credits}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return { isNotreDame: true, courses: unique, cumulativeGpa, warnings };
}
