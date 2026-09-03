// Best-effort parser for transcripts from OTHER universities (feature decision
// 2026-09-01). Layouts vary wildly across institutions, so this extracts
// CANDIDATE course rows for the student to correct and confirm — nothing is
// added without their review, and unmatched grades must be chosen by hand.
// System-generated PDFs are read exactly; a PDF with no text layer is offered
// the opt-in English-only OCR instead (decision 2026-09-02; src/transcript/ocr.ts).
import type { Grade } from '../engine/types.ts';

export interface ExternalCourseCandidate {
  courseId: string;
  title?: string;
  credits?: number;
  /** Mapped app grade when the transcript's token is unambiguous; otherwise
   * undefined and `rawGrade` holds what was printed (student must choose). */
  grade?: Grade;
  rawGrade?: string;
  year?: number;
  /** OCR only: the source line read below the confidence floor — the preview
   * marks the row so the student checks it against the paper. */
  lowConfidence?: boolean;
}

export interface ExternalParseResult {
  /** false → no text layer: scanned/photographed, or an image-only export. */
  hasTextLayer: boolean;
  /** Looks like an ND transcript → point the student at the ND upload instead. */
  looksLikeNotreDame: boolean;
  /** Best guess at the institution's name, from the header lines. */
  university?: string;
  courses: ExternalCourseCandidate[];
}

const LETTER_GRADE_RE = /^(A|A-|B\+|B|B-|C\+|C|C-|D\+?|D-?|F)$/;
// Codes: "CS 5321", "CS-5321", "COMP1521", or an all-digit id ("30240233").
const CODE_RE = /^(?:[A-Z]{2,6}[- ]?\d{2,5}[A-Z]{0,2}|\d{5,10})$/;
const YEAR_RE = /\b(19[5-9]\d|20[0-4]\d)\b/;

function mapGrade(token: string): Grade | undefined {
  const t = token.toUpperCase().replace(/\s+/g, '');
  if (LETTER_GRADE_RE.test(t)) {
    if (t === 'D+' || t === 'D-') return 'D';
    return t as Grade;
  }
  if (t === 'P' || t === 'PASS' || t === 'CR' || t === 'S') return 'S';
  if (t === 'NP' || t === 'FAIL' || t === 'NC' || t === 'U') return 'U';
  if (t === 'IP' || t === 'INPROGRESS' || t === 'ENROLLED') return 'IP';
  return undefined;
}

/** A cell that reads as a plausible credit value (0 < n ≤ 30, ≤ 2 decimals). */
function asCredits(token: string): number | undefined {
  if (!/^\d{1,2}(?:[.,]\d{1,2})?$/.test(token)) return undefined;
  const n = Number(token.replace(',', '.'));
  return n > 0 && n <= 30 ? n : undefined;
}

/** Guess the institution from the first page's header lines: the earliest
 * digit-free line that names a university-like body. */
function guessUniversity(lines: string[]): string | undefined {
  const UNI_RE = /universit|institute of technology|polytechnic|college|école|hochschule|universidad|università|universität|universiteit|대학교|大学/i;
  for (const line of lines.slice(0, 30)) {
    const clean = line.replace(/\s{2,}/g, ' ').trim();
    if (clean.length < 4 || clean.length > 80) continue;
    if (/\d{3,}/.test(clean)) continue; // addresses, ids, dates
    if (UNI_RE.test(clean)) {
      // Header lines often append record words ("TSINGHUA UNIVERSITY STUDENT
      // RECORD"); strip them so the guess is the institution's name alone.
      const stripped = clean
        .replace(/^(unofficial|official)?\s*transcript\s*(of|from)?\s*/i, '')
        .replace(/[\s—–-]*(unofficial|official)?\s*(student|academic)?\s*(records?|transcripts?|copy)\s*$/i, '')
        .trim();
      return stripped || clean;
    }
  }
  return undefined;
}

/** OCR lines below this confidence get their rows flagged in the preview. */
const OCR_CONFIDENCE_FLOOR = 80;

export function parseExternalTranscript(lines: string[], confidences?: number[]): ExternalParseResult {
  const allText = lines.join('\n');
  if (allText.replace(/\s+/g, '').length < 200) {
    return { hasTextLayer: false, looksLikeNotreDame: false, courses: [] };
  }
  const looksLikeNotreDame = /notre dame|nd\.edu/i.test(allText);

  const courses: ExternalCourseCandidate[] = [];
  let currentYear: number | undefined;
  let lineIndex = -1;
  const LEAD_CODE_RE = /^([A-Z]{2,6}[- ]?\d{2,5}[A-Z]{0,2}|\d{5,10})\b[.:]?\s*(.*)$/;
  for (const line of lines) {
    lineIndex += 1;
    // Track the nearest term-ish header so course rows inherit its year.
    if (/(fall|spring|summer|autumn|winter|semester|term|trimester|quarter|session)/i.test(line)) {
      const y = YEAR_RE.exec(line);
      if (y && line.replace(/\s{2,}/g, ' ').length < 60) currentYear = Number(y[1]);
    }
    const flat = line.replace(/\s{2,}/g, '  ').trim();
    if (flat.length < 6) continue;
    // The course code is expected at the start of the row (or right after a
    // leading term/date cell). Column gaps are unreliable across layouts, so
    // the rest of the line is TOKENIZED: credits and grade are searched among
    // the tokens after the title; the title is the leading run of wordy tokens.
    const cells = flat.split(/\s{2,}/);
    let m = LEAD_CODE_RE.exec(cells[0]!.toUpperCase()) ? LEAD_CODE_RE.exec(cells[0]!) : null;
    if (!m && cells.length > 1) {
      const second = LEAD_CODE_RE.exec(cells[1]!);
      if (second && !/[a-z]{3}/i.test(cells[0]!)) m = second; // e.g. "2023FA | CS 5321 …"
    }
    if (!m) continue;
    const code = m[1]!.toUpperCase();
    if (/^(19|20)\d{2}$/.test(code)) continue; // a bare year, not a course code
    const restText = [m === LEAD_CODE_RE.exec(cells[0]!) ? m[2]! : m[2]!, ...cells.slice(m[2] !== undefined && cells.length > 1 && m.input === cells[1] ? 2 : 1)].join('  ');
    const tokens = restText.split(/\s+/).filter((t) => t !== '');

    let credits: number | undefined;
    let grade: Grade | undefined;
    let rawGrade: string | undefined;
    const titleParts: string[] = [];
    let titleDone = false;
    for (const token of tokens) {
      const asCr = asCredits(token);
      const asGr = mapGrade(token);
      const gradeShaped =
        asGr === undefined && /^[A-Z][A-Z+\-/0-9.]{0,3}$/.test(token.toUpperCase()) && !/^\d/.test(token) && token.length <= 4;
      if (!titleDone && asCr === undefined && asGr === undefined && /[\p{L}]/u.test(token) && !/^\(?\d/.test(token)) {
        titleParts.push(token);
        continue;
      }
      titleDone = true;
      if (credits === undefined && asCr !== undefined) {
        credits = asCr;
        continue;
      }
      if (grade === undefined && rawGrade === undefined) {
        if (asGr !== undefined) grade = asGr;
        else if (gradeShaped && titleParts.length > 0) rawGrade = token;
      }
    }
    // A candidate needs a code plus at least a credit value or a grade —
    // otherwise it is a header/footer line that happened to start with a code.
    if (credits === undefined && grade === undefined && rawGrade === undefined) continue;
    const confidence = confidences?.[lineIndex];
    // OCR-only sanity check: real credit values come in half-credit steps, so
    // "3.6" is a misread ("3.0" with a 0→6 confusion) — flag, never silently fix.
    const oddCredits = confidences !== undefined && credits !== undefined && (credits * 2) % 1 !== 0;
    courses.push({
      courseId: code.replace(/^([A-Z]+)[- ]?(\d)/, '$1 $2'),
      title: titleParts.join(' ').slice(0, 90) || undefined,
      credits,
      grade,
      rawGrade,
      year: YEAR_RE.exec(line) ? Number(YEAR_RE.exec(line)![1]) : currentYear,
      lowConfidence: (confidence !== undefined && confidence < OCR_CONFIDENCE_FLOOR) || oddCredits ? true : undefined,
    });
  }
  return { hasTextLayer: true, looksLikeNotreDame, university: guessUniversity(lines), courses };
}

/** One unreviewed course, pre-rendered for the review request (the caller
 * supplies the term label and slot label so this stays UI- and engine-free). */
export interface ReviewRequestCourse {
  institution?: string;
  courseId: string;
  title?: string;
  credits: number;
  grade: string;
  termText: string;
  slotLabel?: string;
}

/** Shared assembly for the copy-ready review requests (decisions 2026-09-03).
 * Every request is addressed to BOTH decision-makers — DGS policy: students
 * MUST email it to the DGS and the Graduate Program Administrator. Two
 * clipboard flavors are returned and written together: `text` (tab-separated
 * rows) for plain-text contexts, and `html`, where the rows are a REAL
 * `<table>` — HTML email composers (Gmail etc.) flatten tab characters to
 * spaces, but a table survives the whole journey: app → email → the DGS
 * copies it → Google Sheets pastes it as cells. */
function buildReviewRequest(opts: {
  subject: string;
  intro: string;
  /** Sheet-paste sections (one per tab); a section with no rows is skipped. */
  sections: readonly { rowsIntro: string; rows: readonly (readonly string[])[] }[];
  details: readonly string[];
}): { text: string; html: string } {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const greeting = 'Dear DGS and Graduate Program Administrator,';
  const sections = opts.sections.filter((s) => s.rows.length > 0);
  const text =
    `Subject: ${opts.subject}\n\n${greeting}\n\n${opts.intro}\n\n` +
    sections.map((s) => `${s.rowsIntro}\n\n${s.rows.map((r) => r.join('\t')).join('\n')}\n\n`).join('') +
    `Course details:\n` +
    opts.details.map((d) => `- ${d}`).join('\n') +
    `\n\nThank you!\n`;
  const html =
    `<p>${esc(`Subject: ${opts.subject}`)}</p><p>${esc(greeting)}</p><p>${esc(opts.intro)}</p>` +
    sections
      .map(
        (s) =>
          `<p>${esc(s.rowsIntro)}</p><table border="1" cellspacing="0" cellpadding="4">` +
          s.rows.map((r) => `<tr>${r.map((v) => `<td>${esc(v)}</td>`).join('')}</tr>`).join('') +
          `</table>`,
      )
      .join('') +
    `<p>Course details:</p><ul>` +
    opts.details.map((d) => `<li>${esc(d)}</li>`).join('') +
    `</ul><p>Thank you!</p>`;
  return { text, html };
}

/** One pending course in the combined review request (2026-09-03: ONE request
 * covers everything). `unlisted` marks courses that need a NEW sheet row —
 * ND courses missing from the Courses tab, external courses with no
 * ExternalCourses ruling; the rest need a decision, not a row. */
export interface PendingReviewCourse extends ReviewRequestCourse {
  reason: string;
  unlisted: boolean;
}

/** THE review request (2026-09-03): one email covering Notre Dame courses
 * that still need a DGS decision (not in the rules sheet — typical for
 * non-CSE; dgs_approval not yet approved; blank verdict) AND external courses
 * the ExternalCourses tab has not ruled on. Paste-ready rows per tab —
 * Courses (course_id, title) and ExternalCourses (UNIVERSITY in the sheet's
 * capital-English convention, course_id, course_title) — then detail lines
 * with credits, grade, term and the reason each course needs review. */
export function buildCombinedReviewRequest(
  nd: readonly PendingReviewCourse[],
  external: readonly PendingReviewCourse[],
): { text: string; html: string } {
  const detail = (c: PendingReviewCourse, where?: string) =>
    `${c.courseId}${c.title ? ` “${c.title}”` : ''}${where ? ` (${where})` : ''}: ` +
    `${c.credits} credit${c.credits === 1 ? '' : 's'}, grade ${c.grade}, ${c.termText}` +
    `${c.slotLabel ? ` (${c.slotLabel})` : ''} — ${c.reason}`;
  return buildReviewRequest({
    subject: 'Course review request (degree self-check)',
    intro:
      'Could you review these courses for the degree audit? ' +
      'The self-check cannot count them until they are decided in the course rules.',
    sections: [
      {
        rowsIntro:
          'Rows for the Courses tab (leading columns, course_id and title — paste into the sheet ' +
          'at a new row’s “course_id” cell, then fill in the rest):',
        rows: nd.filter((c) => c.unlisted).map((c) => [c.courseId, c.title ?? '']),
      },
      {
        rowsIntro:
          'Rows for the ExternalCourses tab, in the tab’s column order — ' +
          'paste into the sheet at a new row’s “university” cell, then fill in the ruling columns:',
        rows: external.filter((c) => c.unlisted).map((c) => [(c.institution ?? '').toUpperCase(), c.courseId, c.title ?? '']),
      },
    ],
    details: [...nd.map((c) => detail(c, 'Notre Dame')), ...external.map((c) => detail(c, c.institution ?? 'other university'))],
  });
}
