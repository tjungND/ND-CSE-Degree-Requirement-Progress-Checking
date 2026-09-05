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
import { termIndex, termLabel, termOfDate } from '../engine/term.ts';
import type { Grade, Season, Term } from '../engine/types.ts';
import { looksLikeNotreDameTranscript } from './nd-markers.ts';

/** The level the student was registered at when taking the course — the
 * transcript's Level column (UG / GR…), else the term's level block ("Term
 * Totals (Undergraduate)", "College: Graduate School"), else the course number
 * (≥ 60000 graduate, < 50000 undergraduate; 5xxxx stays unknown). */
export type RegisteredLevel = 'undergraduate' | 'graduate';

export interface ParsedCourse {
  courseId: string;
  title?: string;
  credits: number;
  grade: Grade;
  term: Term;
  origin: 'nd' | 'transfer';
  institution?: string;
  /** Notre Dame rows only (2026-09-05) — see RegisteredLevel. */
  level?: RegisteredLevel;
}

/** A degree the transcript says was AWARDED (never one merely sought). */
export interface DegreeAwarded {
  /** As printed, e.g. "Bachelor of Science". */
  name: string;
  level: 'bachelors' | 'masters' | 'phd' | 'other';
  /** ISO date when the transcript prints one (same line, or a "Degree Date:"
   * line right after). */
  date?: string;
}

/** Where the student's CURRENT program starts, read from the transcript
 * (2026-09-05). Every deadline (§4.3 eight-year limit, §4.4.3 eighteen months,
 * §4.5 eighth semester) and the §4.3 residency count hang on this term, and
 * a combined transcript (undergraduate + graduate at Notre Dame) does not say
 * it outright — so the reading is explained (`how`) and, when the transcript
 * supports a second reading, that one is named too (`alternative`). */
export interface EntryTermInference {
  term: Term;
  /** Plain English, for the standing card: "the admit-term line on your transcript". */
  how: string;
  /** The other reading, when a Notre Dame degree was awarded mid-record: a
   * separate degree finished BEFORE this program (entry = the term after it),
   * or a degree earned along the way (entry unchanged). The earlier term is
   * chosen — earlier deadlines are the safe error — and the card names this. */
  alternative?: { term: Term; why: string };
}

export interface ParsedTranscript {
  isNotreDame: boolean;
  courses: ParsedCourse[];
  cumulativeGpa?: number;
  warnings: string[];
  /** Degrees the transcript says were awarded, in reading order (2026-09-05). */
  degreesAwarded: DegreeAwarded[];
  /** The current program's entry term, when the transcript supports a reading (2026-09-05). */
  entryTerm?: EntryTermInference;
}

const LETTER_GRADES: Grade[] = ['A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D', 'F', 'S', 'U'];
/** Grades that appear on transcripts but earn nothing / need a human decision
 * ('I' becomes an F after 30 days per §5.1 — a human should decide). */
const SKIP_GRADES = new Set(['W', 'WF', 'WP', 'AU', 'NR', 'X', 'NG', 'I']);

const TERM_RE = /\b(Fall|Spring|Summer)\s+(?:Semester\s+|Session\s+)?(\d{4})\b/i;
const COURSE_HEAD_RE = /^([A-Z]{2,5})\s+(\d{5})\b\s*(?:(UG|GR|PR|LW|EM|GB)\b)?\s*(.*)$/;
/** Banner term codes: YYYY00 = Summer YYYY, YYYY10 = Fall YYYY, YYYY20 = Spring YYYY+1. */
const BANNER_CODE_RE = /\b(\d{4})(00|10|20)\b/;
/** Lines that state when the student was admitted / matriculated. */
const ADMIT_RE = /\b(ADMIT(?:TED)?\s*TERM|MATRICULAT(?:ED|ION)(?:\s*TERM)?|ENTRY\s*TERM|TERM\s*ADMITTED|ADMITTED\s*(?:FOR|IN)|ENTERED\s*(?:PROGRAM|IN))\b/;
/** Banner's per-term "Student Type" line: "New", "New First Time", "New Graduate"… */
const NEW_STUDENT_RE = /\bSTUDENT\s*TYPE\s*:?\s*NEW\b/;
const DEGREE_WORD_RE = /\b(BACHELOR|MASTER|DOCTOR|PH\.?\s?D)\b/;
const AWARD_WORD_RE = /\b(AWARDED|CONFERRED|GRANTED|DEGREE\s*DATE|GRADUATED|GRADUATION\s*DATE)\b/;
const NOT_AWARDED_RE = /\b(SOUGHT|PENDING|EXPECTED|ANTICIPATED|CANDIDATE|CURRENT\s*PROGRAM|IN\s*PROGRESS)\b|NOT\s+COMPLET|INCOMPLETE/;
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

function bannerCodeTerm(code: string): Term {
  const year = Number(code.slice(0, 4));
  const suffix = code.slice(4);
  return suffix === '10' ? { season: 'fall', year } : suffix === '20' ? { season: 'spring', year: year + 1 } : { season: 'summer', year };
}

/** A term stated on a line: "Fall 2022", "Fall Semester 2022", or a Banner code. */
function termOnLine(line: string): Term | undefined {
  const m = TERM_RE.exec(line);
  if (m) return { season: m[1]!.toLowerCase() as Season, year: Number(m[2]) };
  const code = BANNER_CODE_RE.exec(line);
  return code ? bannerCodeTerm(code[1]! + code[2]!) : undefined;
}

/** A calendar date printed on a line, as ISO: "15-MAY-2024", "May 17, 2020",
 * "05/17/2020", "2020-05-17", or "May 2020" (day 15 — only the term matters). */
function dateOnLine(line: string): string | undefined {
  const pad = (n: number) => String(n).padStart(2, '0');
  const month = (name: string) => MONTHS.indexOf(name.slice(0, 3).toUpperCase()) + 1;
  let m = /\b(\d{1,2})[-/ ]([A-Za-z]{3,9})[-/ ,]+(\d{4})\b/.exec(line);
  if (m && month(m[2]!) > 0) return `${m[3]}-${pad(month(m[2]!))}-${pad(Number(m[1]))}`;
  m = /\b([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})\b/.exec(line);
  if (m && month(m[1]!) > 0) return `${m[3]}-${pad(month(m[1]!))}-${pad(Number(m[2]))}`;
  m = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(line);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/.exec(line);
  if (m) return `${m[3]}-${pad(Number(m[1]))}-${pad(Number(m[2]))}`;
  m = /\b([A-Za-z]{3,9})\.?\s+(\d{4})\b/.exec(line);
  if (m && month(m[1]!) > 0) return `${m[2]}-${pad(month(m[1]!))}-15`;
  return undefined;
}

function degreeLevelOf(text: string): DegreeAwarded['level'] {
  const u = text.toUpperCase();
  if (/\bBACHELOR/.test(u)) return 'bachelors';
  if (/\bMASTER/.test(u)) return 'masters';
  if (/\bDOCTOR|\bPH\.?\s?D/.test(u)) return 'phd';
  return 'other';
}

/** The degree name as printed, cut before any date, label or column gap. */
function degreeNameOf(line: string): string {
  const m = /\b((?:Bachelor|Master|Doctor)(?:\s+of\s+[A-Za-z&.,' -]+?|(?:'s)?)|Ph\.?\s?D\.?)(?=\s*(?:[-–—:,(]|\d|Degree\b|Awarded\b|Conferred\b|Granted\b|Date\b|in\s+[A-Z]|$))/i.exec(line);
  const name = (m?.[1] ?? line).replace(/\s+/g, ' ').replace(/[\s,.-]+$/, '').trim();
  return name.length > 60 ? name.slice(0, 60).trim() : name;
}

export function parseTranscript(lines: string[]): ParsedTranscript {
  const warnings: string[] = [];
  // The ND marker can live anywhere: the page body, the official PDF's header,
  // or only the browser's print footer (an nd.edu URL) on a printed-to-PDF
  // web transcript — so scan the whole text.
  // Shared with the external parser (nd-markers.ts, 2026-09-05): an nd.edu
  // e-mail address or a "Notre Dame, IN" mailing address is NOT a marker.
  const isNotreDame = looksLikeNotreDameTranscript(lines.join('\n'));
  if (!isNotreDame) {
    return { isNotreDame: false, courses: [], warnings, degreesAwarded: [] };
  }

  let term: Term | undefined;
  let origin: 'nd' | 'transfer' = 'nd';
  let inProgress = false;
  let institution: string | undefined;
  let expectInstitution = false;
  let cumulativeGpa: number | undefined;
  const courses: ParsedCourse[] = [];
  const skipped: string[] = [];

  // Signals for the entry-term reading and the per-course level (2026-09-05).
  const admitTerms: Term[] = [];
  const newStudentTerms = new Set<number>();
  const termLevelHints = new Map<number, RegisteredLevel>();
  let documentLevel: RegisteredLevel | undefined; // "Course Level: Graduate" before any term
  const degreesAwarded: DegreeAwarded[] = [];
  let inDegreesAwarded = false; // inside a "DEGREES AWARDED" block
  let degreeAwaitingDate: DegreeAwarded | undefined; // a "Degree Date:" line may follow

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+/g, ' ').trim();
    if (line === '') continue;
    const upper = line.toUpperCase();

    // ---- header signals (2026-09-05) ----
    if (ADMIT_RE.test(upper)) {
      const t = termOnLine(line);
      if (t) admitTerms.push(t);
      continue;
    }
    if (NEW_STUDENT_RE.test(upper)) {
      if (term) newStudentTerms.add(termIndex(term));
      continue;
    }
    // Degrees awarded: a block header ("DEGREES AWARDED"), a line that names a
    // degree together with an award word ("Degree Awarded Doctor of Philosophy
    // 15-MAY-2024", "Bachelor of Science — Conferred May 2020"), or a degree
    // name inside the block; a "Degree Date:" line right after supplies the
    // date. "Sought"/"Current Program" lines name a degree that is NOT awarded.
    if (/^DEGREES?\s+(AWARDED|CONFERRED|EARNED)\b/.test(upper) && !DEGREE_WORD_RE.test(upper.replace(/^DEGREES?\s+(AWARDED|CONFERRED|EARNED)/, ''))) {
      inDegreesAwarded = true;
      continue;
    }
    if (/^(CURRENT\s+PROGRAM|CURRICULUM\s+INFORMATION|INSTITUTION(AL)?\s+CREDIT|TRANSFER\s+CREDIT|COURSES?\s+IN\s+PROGRESS|TRANSCRIPT\s+TOTALS)/.test(upper)) {
      inDegreesAwarded = false;
      degreeAwaitingDate = undefined;
    }
    if (degreeAwaitingDate && AWARD_WORD_RE.test(upper) && !DEGREE_WORD_RE.test(upper)) {
      const date = dateOnLine(line);
      if (date) degreeAwaitingDate.date = date;
      degreeAwaitingDate = undefined;
      continue;
    }
    if (DEGREE_WORD_RE.test(upper) && !COURSE_HEAD_RE.test(line) && !NOT_AWARDED_RE.test(upper) && (inDegreesAwarded || AWARD_WORD_RE.test(upper))) {
      const degree: DegreeAwarded = { name: degreeNameOf(line), level: degreeLevelOf(line), date: dateOnLine(line) };
      degreesAwarded.push(degree);
      degreeAwaitingDate = degree.date ? undefined : degree;
      continue;
    }
    // Level markers: the term's totals line ("Term Totals (Graduate)"), a
    // "Level: Graduate" line, or the term block's college ("College: Graduate
    // School" — Notre Dame's graduate programs all sit in the Graduate School).
    const levelWord = /\b(UNDERGRADUATE|GRADUATE)\b/.exec(upper);
    if (levelWord && !COURSE_HEAD_RE.test(line) && /^(TERM\s+TOTALS|\(?(UNDER)?GRADUATE\)?$|(COURSE\s+)?LEVEL\s*:|COLLEGE\s*:?\s*(THE\s+)?GRADUATE\s+SCHOOL)/.test(upper)) {
      const level: RegisteredLevel = levelWord[1] === 'UNDERGRADUATE' ? 'undergraduate' : 'graduate';
      if (term) termLevelHints.set(termIndex(term), level);
      else documentLevel = level;
      continue;
    }

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

    const [, subject, number, levelCode, rest] = courseMatch;
    const courseId = `${subject} ${number}`;
    // The Level column: UG = undergraduate; GR (graduate), PR (professional),
    // LW (law), EM/GB (business graduate) are all graduate-status registrations.
    const rowLevel: RegisteredLevel | undefined = levelCode === undefined ? undefined : levelCode === 'UG' ? 'undergraduate' : 'graduate';

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
      level: origin === 'nd' ? rowLevel : undefined,
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

  // Fill in the level of Notre Dame rows that carried no Level column: the
  // term's level block, then the course number, then a document-wide
  // "Course Level:" line (2026-09-05).
  for (const c of unique) {
    if (c.origin !== 'nd' || c.level !== undefined) continue;
    c.level = termLevelHints.get(termIndex(c.term)) ?? levelFromNumber(c.courseId) ?? documentLevel;
  }

  return {
    isNotreDame: true,
    courses: unique,
    cumulativeGpa,
    warnings,
    degreesAwarded,
    entryTerm: inferEntryTerm({ courses: unique, admitTerms, newStudentTerms, degreesAwarded }),
  };
}

/** Notre Dame numbering: 1xxxx–4xxxx undergraduate, 6xxxx and up graduate;
 * 5xxxx (bridge courses) is taken by both and stays unknown. */
export function levelFromNumber(courseId: string): RegisteredLevel | undefined {
  const m = /\b(\d)\d{4}\b/.exec(courseId);
  if (!m) return undefined;
  const digit = Number(m[1]);
  return digit >= 6 ? 'graduate' : digit <= 4 ? 'undergraduate' : undefined;
}

/** The current program's entry term (2026-09-05). Precedence:
 *   1. a stated admit / matriculation term (the latest one, when a transcript
 *      with several curricula states several — the most recent admission is
 *      the current program);
 *   2. the latest graduate-level term whose block says "Student Type: New…"
 *      (Banner marks the first term of a new admission);
 *   3. the first graduate-level term (rows registered at the graduate level);
 *   4. with no graduate-level rows at all: the first term after the last
 *      degree awarded, else the earliest term.
 * Under 3, a degree awarded with graduate-level terms on BOTH sides supports
 * a second reading (a separate earlier degree — 4+1, a prior Notre Dame M.S.
 * — versus a degree earned along the way); the earlier term is kept, because
 * earlier deadlines are the safe mistake, and the other reading is returned
 * as `alternative` for the standing card to spell out. */
export function inferEntryTerm(args: {
  courses: ParsedCourse[];
  admitTerms: Term[];
  newStudentTerms: Set<number>;
  degreesAwarded: DegreeAwarded[];
}): EntryTermInference | undefined {
  const { courses, admitTerms, newStudentTerms, degreesAwarded } = args;
  const byIndex = (a: Term, b: Term) => termIndex(a) - termIndex(b);
  if (admitTerms.length > 0) {
    const latest = [...admitTerms].sort(byIndex)[admitTerms.length - 1]!;
    return { term: latest, how: 'the admit-term line on your transcript' };
  }
  const ndCourses = courses.filter((c) => c.origin === 'nd');
  const uniqueTerms = (list: ParsedCourse[]): Term[] => {
    const map = new Map<number, Term>();
    for (const c of list) map.set(termIndex(c.term), c.term);
    return [...map.values()].sort(byIndex);
  };
  const allTerms = uniqueTerms(ndCourses);
  if (allTerms.length === 0) return undefined;
  const gradTerms = uniqueTerms(ndCourses.filter((c) => c.level === 'graduate'));

  if (gradTerms.length > 0) {
    const marked = gradTerms.filter((t) => newStudentTerms.has(termIndex(t)));
    const chosen =
      marked.length > 0
        ? { term: marked[marked.length - 1]!, how: 'the term your transcript marks as your admission at the graduate level' }
        : { term: gradTerms[0]!, how: 'the first graduate-level term on your transcript' };
    // A degree awarded after the chosen term, with graduate-level terms
    // continuing past it, supports the other reading.
    let alternative: EntryTermInference['alternative'];
    for (const d of degreesAwarded) {
      if (!d.date) continue;
      const awardTerm = termOfDate(d.date);
      if (termIndex(awardTerm) < termIndex(chosen.term)) continue;
      const after = gradTerms.filter((t) => termIndex(t) > termIndex(awardTerm));
      if (after.length === 0) continue;
      const candidate = after[0]!;
      if (termIndex(candidate) <= termIndex(chosen.term)) continue;
      if (!alternative || termIndex(candidate) > termIndex(alternative.term)) {
        alternative = {
          term: candidate,
          why:
            `your transcript also shows a ${d.name} awarded ${d.date}. If that was a separate degree finished before this program ` +
            `(a prior Notre Dame degree, or a 4+1 program), the entry term is ${termLabel(candidate)} — the earlier term is the safe assumption, so ${termLabel(chosen.term)} is set until you change it`,
        };
      }
    }
    return { ...chosen, alternative };
  }

  // No graduate-level rows: after the last awarded degree, else the earliest term.
  const dated = degreesAwarded.filter((d) => d.date !== undefined).sort((a, b) => (a.date! < b.date! ? -1 : 1));
  const last = dated[dated.length - 1];
  if (last) {
    const awardTerm = termOfDate(last.date!);
    const after = allTerms.filter((t) => termIndex(t) > termIndex(awardTerm));
    if (after.length > 0) return { term: after[0]!, how: `the first term after your ${last.name} was awarded` };
  }
  return { term: allTerms[0]!, how: 'the earliest term on your transcript' };
}
