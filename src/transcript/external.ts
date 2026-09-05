// Best-effort parser for transcripts from OTHER universities (feature decision
// 2026-09-01). Layouts vary wildly across institutions, so this extracts
// CANDIDATE course rows for the student to correct and confirm — nothing is
// added without their review, and unmatched grades must be chosen by hand.
// System-generated PDFs are read exactly; a PDF with no text layer is offered
// the opt-in English-only OCR instead (decision 2026-09-02; src/transcript/ocr.ts).
import { termIndex, termOfDate } from '../engine/term.ts';
import type { Grade, Season } from '../engine/types.ts';
import { looksLikeNotreDameTranscript } from './nd-markers.ts';
import { dateOnLine } from './parse.ts';

export interface ExternalCourseCandidate {
  courseId: string;
  title?: string;
  credits?: number;
  /** Mapped app grade when the transcript's token is unambiguous; otherwise
   * undefined and `rawGrade` holds what was printed (student must choose). */
  grade?: Grade;
  rawGrade?: string;
  year?: number;
  /** The season of the nearest term header (2026-09-05) — the preview's
   * Term column starts from it instead of always "Fall". */
  season?: Season;
  /** OCR only: the source line read below the confidence floor — the preview
   * marks the row so the student checks it against the paper. */
  lowConfidence?: boolean;
  /** The level the student was registered at for this row, when the
   * transcript says (2026-09-05 — combined B.S.+M.S. and 4+1 transcripts):
   * a UG/GR-style level cell on the row, a "Level: Graduate" / "Term Totals
   * (Undergraduate)" block, or the bachelor's conferral date (rows in terms
   * up to that date are undergraduate, later ones graduate). Undefined when
   * nothing says — the slot's level then applies. */
  level?: 'undergraduate' | 'graduate';
}

export interface ExternalParseResult {
  /** false → no text layer: scanned/photographed, or an image-only export. */
  hasTextLayer: boolean;
  /** Looks like an ND transcript → point the student at the ND upload instead. */
  looksLikeNotreDame: boolean;
  /** Best guess at the institution's name, from the header lines. */
  university?: string;
  /** POSITIVE evidence only (2026-09-03): a line that both names a graduate
   * degree and says conferred/awarded/granted. Absence stays undefined — the
   * app never guesses whether a degree was completed. */
  degreeConferred?: true;
  /** A bachelor's degree conferral with a date (2026-09-05): the boundary
   * between undergraduate and graduate rows on a combined transcript. */
  bachelorsConferredOn?: string;
  /** True when rows of BOTH levels were found — the preview then shows the
   * per-row level for the student to check (2026-09-05). */
  mixedLevels?: true;
  /** Rows listed under Banner's "TRANSFER CREDIT ACCEPTED BY THE INSTITUTION"
   * (courses this university accepted from ANOTHER school) are not this
   * university's courses — they are left out and counted here so the preview
   * can say so (2026-09-05). */
  transferRowsSkipped?: number;
  courses: ExternalCourseCandidate[];
}

/** Conferral wording and graduate-degree names must appear on the SAME line
 * ("Master of Science — Conferred May 2021", "Degree Completed: Master of
 * Science"), so a bachelor's conferral on a graduate transcript does not
 * count as graduate-degree evidence. "complet" added 2026-09-04 — with the
 * negative guard below, so "Not completed"/"Incomplete" never reads as
 * positive evidence. */
const CONFER_RE = /conferr|awarded|granted|complet/i;
const NOT_COMPLETE_RE = /incomplete|not\s+complet/i;
const GRAD_DEGREE_RE = /master|\bm\.?\s?sc?\.?\b|ph\.?\s?d|doctor of philosophy/i;

const LETTER_GRADE_RE = /^(A|A-|B\+|B|B-|C\+|C|C-|D\+?|D-?|F)$/;
// Codes: "CS 5321", "CS-5321", "COMP1521", or an all-digit id ("30240233").
const CODE_RE = /^(?:[A-Z]{2,6}[- ]?\d{2,5}[A-Z]{0,2}|\d{5,10})$/;
const YEAR_RE = /\b(19[5-9]\d|20[0-4]\d)\b/;

function mapGrade(token: string): Grade | undefined {
  const t = token.toUpperCase().replace(/\s+/g, '');
  if (t === 'A+') return 'A'; // no A+ in the app's grade scale (2026-09-05)
  if (LETTER_GRADE_RE.test(t)) {
    if (t === 'D+' || t === 'D-') return 'D';
    return t as Grade;
  }
  if (t === 'P' || t === 'PASS' || t === 'CR' || t === 'S') return 'S';
  if (t === 'NP' || t === 'FAIL' || t === 'NC' || t === 'U') return 'U';
  if (t === 'IP' || t === 'INPROGRESS' || t === 'ENROLLED') return 'IP';
  return undefined;
}

/** A cell that reads as a plausible credit value (0 ≤ n ≤ 30, up to 3
 * decimals — Banner and PeopleSoft print "3.000", 2026-09-05). */
function asCredits(token: string): number | undefined {
  if (!/^\d{1,2}(?:[.,]\d{1,3})?$/.test(token)) return undefined;
  const n = Number(token.replace(',', '.'));
  // 0 is a real value (zero-credit seminars, internships — "0.00 S"), kept
  // since 2026-09-05 so such rows do not come back with blank credits.
  return n >= 0 && n <= 30 ? n : undefined;
}

/** Guess the institution from the first page's header lines: the earliest
 * digit-free line that names a university-like body. */
function guessUniversity(lines: string[]): string | undefined {
  // Strong words name an institution; "college" alone is weak (it also names a
  // division — "College of Science" — or a Banner field, "College : …").
  const STRONG_RE = /universit|institute of technology|polytechnic|école|hochschule|universidad|università|universität|universiteit|대학교|大学/i;
  const WEAK_RE = /college/i;
  const DIVISION_RE = /^(college|school|department|faculty|institute)\s+of\b|\bcollege of\b|^(program|college|major|degree)\s*:/i;
  /** Candidate name cells: each line split at column gaps (a merged two-column
   * line yields the institution's own cell), cleaned, and filtered. */
  // A sentence that merely mentions a university ("This official university
  // transcript is certified to be a …") is not a name (2026-09-05).
  const SENTENCE_RE = /\b(this|is|are|was|were|has|have|to be|certified|issued|printed|member of|does not|registrar|provost|dean)\b/i;
  const clean = (c: string) => c.replace(/\s{2,}/g, ' ').trim();
  const plausible = (c: string) => c.length >= 4 && c.length <= 80 && !/\d{3,}/.test(c) && !DIVISION_RE.test(c) && !SENTENCE_RE.test(c);
  /** Candidate name cells: the whole line first when it is a short,
   * digit-free name spaced out across the page ("UNIVERSITY   OF   SOUTHERN
   * CALIFORNIA", 2026-09-05), then each cell at a column gap (a merged
   * two-column line yields the institution's own cell). */
  const cells = (line: string): string[] => {
    const whole = clean(line);
    const parts = line.split(/\s{3,}/).map(clean);
    const wholeFirst = parts.length > 1 && parts.every((c) => /^[A-Za-z.,'&-]+$/.test(c)) && whole.split(' ').length <= 8 ? [whole] : [];
    return [...wholeFirst, ...parts].filter(plausible);
  };
  const stripRecordWords = (cell: string): string => {
    // Header lines often append record words ("TSINGHUA UNIVERSITY STUDENT
    // RECORD", "Northeastern University, Office of the Registrar"); strip them
    // so the guess is the institution's name alone.
    const stripped = cell
      .replace(/^(unofficial|official)?\s*transcript\s*(of|from)?\s*/i, '')
      .replace(/^(the\s+)?office of the (university\s+)?registrar[,\s-]*/i, '')
      .replace(/[,\s—–-]*(the\s+)?office of the (university\s+)?registrar\s*$/i, '')
      .replace(/[\s—–-]*(unofficial|official)?\s*(student|academic)?\s*(records?|transcripts?|copy)\s*$/i, '')
      .replace(/[\s—–-]*(course\s+numbering|grade\s+scale|grading\s+(system|scale)|transcript\s+(guide|key|legend))\s*$/i, '')
      .replace(/^[\s?•·*|,-]+|[\s?•·*|,-]+$/g, '')
      .trim();
    return stripped; // empty when the cell was only record words ("Office of the University Registrar")
  };
  // Header first (the first 30 lines), then the rest of the document: Banner
  // official transcripts name the institution only on the legend page
  // (2026-09-05), so the header may hold nothing but divisions and programs.
  const passes: [string[], RegExp][] = [
    [lines.slice(0, 30), STRONG_RE],
    [lines, STRONG_RE],
    [lines.slice(0, 30), WEAK_RE],
  ];
  for (const [scope, re] of passes) {
    for (const line of scope) {
      for (const cell of cells(line)) {
        if (!re.test(cell)) continue;
        const name = stripRecordWords(cell);
        if (name !== '' && (re.test(name) || WEAK_RE.test(name))) return name;
      }
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
  const looksLikeNotreDame = looksLikeNotreDameTranscript(allText);

  const courses: ExternalCourseCandidate[] = [];
  let currentYear: number | undefined;
  let currentSeason: Season | undefined;
  const seasonOf = (text: string): Season | undefined =>
    /\b(fall|autumn)\b/i.test(text) ? 'fall' : /\bspring\b/i.test(text) ? 'spring' : /\bsummer\b/i.test(text) ? 'summer' : undefined;
  // Course numbers: 2–5 digits, an optional dotted part (Johns Hopkins
  // "601.226"), up to three trailing letters (Buffalo "106LEC", Western
  // "3331A"); or an all-digit id ("30240233").
  const NUMBER_RE = /^(\d{2,5}(?:\.\d{3})?[A-Za-z]{0,3})\b(.*)$/;
  const LEAD_CODE_RE = /^([A-Z]{2,6}[- ]?\d{2,5}(?:\.\d{1,3})?[A-Z]{0,3}|\d{5,10})\b[.:]?\s*(.*)$/;
  // Codes are matched case-insensitively (2026-09-04 — some registrars print
  // "cs 5321"), so common words that would then look like codes are refused:
  // term headers and summary lines such as "Fall 2023  GPA 3.85".
  const CODE_STOPWORDS_RE =
    /^(FALL|SPRING|SUMMER|WINTER|AUTUMN|TERM|SEM|SEMESTER|SESSION|QUARTER|YEAR|PAGE|TOTAL|TOTALS|GPA|CGPA|SGPA|CUM|ROOM|ID|NO|OVERALL|REGENTS|CUMULATIVE|INSTITUTION|TRANSFER|EARNED|ATTEMPTED|CREDITS|HOURS|UNITS|POINTS)$/;
  // A subject cell: "CS", "COMPSCI", or a two-part code with a space ("E E",
  // "A A" at the University of Washington, 2026-09-05).
  const SUBJECT_RE = /^[A-Za-z]{2,7}$|^[A-Za-z]{1,4} [A-Za-z]{1,4}$/;

  /** Scan the tokens after the course code: leading wordy tokens form the
   * title, then credits, a letter/coded grade — or (2026-09-04) a NUMERIC
   * grade (85, 9.5 — common outside the US), kept as rawGrade for the student
   * to map. A later unambiguous letter grade replaces a numeric guess. When
   * the title comes AFTER the numbers ("CSCI-549   B   4.0   Title", USC,
   * 2026-09-05) the wordy tail becomes the title. */
  const scanTokens = (
    tokens: string[],
    into: { credits?: number; grade?: Grade; rawGrade?: string; titleParts: string[] },
  ): void => {
    let titleDone = into.titleParts.length > 0 && (into.credits !== undefined || into.grade !== undefined || into.rawGrade !== undefined);
    const tail: string[] = [];
    let sawEcho = false;
    for (let k = 0; k < tokens.length; k++) {
      const token = tokens[k]!;
      const nextToken = tokens[k + 1];
      // A single letter right after the code (2026-09-05): Georgia Tech's
      // "H" column flag before the title ("CS 8946   B Title …") is dropped
      // when a wordy title follows it; a grade before the credits
      // ("CSCI-549   B   4.0   Title", USC) is read as the grade.
      if (k === 0 && into.titleParts.length === 0 && /^[A-Z]$/.test(token) && nextToken !== undefined) {
        if (/[\p{L}]{2}/u.test(nextToken) && asCredits(nextToken) === undefined) continue;
      }
      // A bare integer followed by a decimal credit value is part of the
      // title ("College Calculus 1   4.000   4.000   D", 2026-09-05).
      const integerInTitle = !titleDone && /^\d{1,2}$/.test(token) && nextToken !== undefined && /^\d{1,2}[.,]\d{1,3}$/.test(nextToken) && asCredits(nextToken) !== undefined;
      if (integerInTitle && into.titleParts.length > 0) {
        into.titleParts.push(token);
        continue;
      }
      const asCr = asCredits(token);
      const asGr = mapGrade(token);
      const gradeFirst =
        into.titleParts.length === 0 && into.grade === undefined && asGr !== undefined && nextToken !== undefined && asCredits(nextToken) !== undefined;
      if (gradeFirst) {
        into.grade = asGr;
        titleDone = true;
        continue;
      }
      const gradeShaped =
        asGr === undefined && /^[A-Z][A-Z+\-/0-9.]{0,3}$/.test(token.toUpperCase()) && !/^\d/.test(token) && token.length <= 4;
      const numericGrade =
        asGr === undefined && /^\d{1,3}(?:[.,]\d{1,2})?$/.test(token) && Number(token.replace(',', '.')) <= 100;
      // A title token is wordy — or a bare connector ("&", "/", "-", ":")
      // between wordy tokens ("Econ & Priv Issues in Big Data", 2026-09-05).
      const wordy = /[\p{L}]/u.test(token) && !/^\(?\d/.test(token);
      const connector = into.titleParts.length > 0 && /^[&/+:\-–—]$/.test(token);
      if (!titleDone && asCr === undefined && asGr === undefined && (connector || wordy)) {
        into.titleParts.push(token);
        continue;
      }
      titleDone = true;
      if (into.credits === undefined && asCr !== undefined) {
        into.credits = asCr;
        continue;
      }
      if (asGr !== undefined && into.grade === undefined) {
        into.grade = asGr;
        into.rawGrade = undefined; // a real grade beats a numeric guess
        continue;
      }
      if (into.grade === undefined && into.rawGrade === undefined && into.titleParts.length > 0) {
        // A number equal to the credits just read is the "earned" column
        // ("3.00   3.00   12.00"), not a numeric grade (2026-09-05).
        const echoesCredits = into.credits !== undefined && Number(token.replace(',', '.')) === into.credits;
        if (echoesCredits) sawEcho = true;
        if (gradeShaped) into.rawGrade = token;
        else if (numericGrade && !echoesCredits && !sawEcho) into.rawGrade = token; // after "earned" comes "points"
      }
      if (wordy && !gradeShaped && token.length > 1) tail.push(token);
    }
    if (into.titleParts.length === 0 && tail.length > 0 && (into.credits !== undefined || into.grade !== undefined)) {
      into.titleParts = tail;
    }
  };

  /** The course code at the start of a line's first (or second) cell —
   * case-insensitive, stopword-guarded. Returns the UPPERCASED code and the
   * rest of the line's tokens (original case, for the title). */
  const leadCode = (flat: string): { code: string; tokens: string[] } | undefined => {
    // A stray 1–3-letter security mark merged onto the row's start ("XK ITWS
    // 1882 …", 2026-09-05) is skipped when a real code follows it.
    const cells = flat.replace(/^[A-Z]{1,3}\s+(?=[A-Za-z]{2,7}(?: [A-Za-z]{1,4})?\s+\d)/, '').split(/\s{2,}/);
    // Banner / PeopleSoft layouts print the subject and the number in SEPARATE
    // columns ("CS   455   Data Communication   3.00 A   12.00"; Western's
    // "COMPSCI   3331A Title …" keeps the title in the number's cell; Johns
    // Hopkins leads with a 2-letter division cell) — so the code spans two
    // adjacent cells, starting at the first or second cell (2026-09-05;
    // stopword-guarded like the rest).
    for (const i of [0, 1] as const) {
      const subjectCell = cells[i];
      const numberCell = cells[i + 1];
      if (subjectCell === undefined || numberCell === undefined || cells.length < i + 3) break;
      if (i === 1 && !/^[A-Za-z]{1,3}$/.test(cells[0]!)) break; // only a short division/security cell may precede
      if (!SUBJECT_RE.test(subjectCell)) continue;
      const num = NUMBER_RE.exec(numberCell);
      if (!num) continue;
      const subject = subjectCell.toUpperCase();
      if (CODE_STOPWORDS_RE.test(subject.replace(/ /g, ''))) continue;
      const tokens = [num[2]!.trim(), ...cells.slice(i + 2)]
        .join('  ')
        .split(/\s+/)
        .filter((t) => t !== '');
      return { code: `${subject} ${num[1]!.toUpperCase()}`, tokens };
    }
    for (const idx of [0, 1] as const) {
      const cell = cells[idx];
      if (cell === undefined) break;
      if (idx === 1 && /[a-z]{3}/i.test(cells[0]!)) break; // wordy first cell → not a leading term/date
      const m = LEAD_CODE_RE.exec(cell.toUpperCase());
      if (!m) continue;
      const code = m[1]!;
      if (/^(19|20)\d{2}$/.test(code)) return undefined; // a bare year, not a course code
      if (CODE_STOPWORDS_RE.test(code.replace(/[^A-Z]/g, ''))) return undefined;
      const rest = cell.slice(cell.length - m[2]!.length); // same indices — toUpperCase is length-stable for these codes
      const tokens = [rest, ...cells.slice(idx + 1)]
        .join('  ')
        .split(/\s+/)
        .filter((t) => t !== '');
      return { code, tokens };
    }
    return undefined;
  };

  /** A plain wordy line — no code, no numbers, no label — that can only be
   * a course title printed on its own line (ShanghaiTech, bilingual Chinese
   * transcripts, 2026-09-05). */
  const NOT_TITLE_RE = /[:]|\b(standing|total|totals|gpa|term|semester|page|program|plan|major|college|school|department|degree|credits?|hours|grade|course|title|record|continued|end of)\b/i;
  const plainTitleLine = (text: string | undefined): string | undefined => {
    if (text === undefined) return undefined;
    const t = text.replace(/\s+/g, ' ').trim();
    if (t.length < 4 || t.length > 90 || /\d{2,}/.test(t) || NOT_TITLE_RE.test(t) || leadCode(t)) return undefined;
    if ((t.match(/[\p{L}]/gu) ?? []).length < 4) return undefined;
    return t;
  };

  // Banner's "TRANSFER CREDIT ACCEPTED BY THE INSTITUTION:" block lists courses
  // this university accepted from ANOTHER school (often the student's
  // bachelor's) until "INSTITUTION CREDIT:" opens the university's own record.
  // Those rows are not this university's courses — importing them here would
  // let undergraduate work masquerade as graduate transfer credit — so they are
  // skipped and counted (2026-09-05).
  let transferBlock: 'banner' | 'table' | undefined;
  let transferRowsSkipped = 0;
  // Level signals (2026-09-05, combined B.S.+M.S. / 4+1 transcripts): a
  // "Level:" / "Term Totals (Graduate)" / "College: Graduate School" line sets
  // the level of the rows that follow, as does a cell that is exactly the
  // level word ("Graduate   Units Attempted: …", a "Year of Study" table) or a
  // term header ending in it ("Fall Quarter 2029 Graduate"); a UG/GR cell
  // right after the course code sets one row's; a dated bachelor's conferral
  // splits the rest by term; a closing "GRADUATE SEMESTER TOTALS" line labels
  // the rows above it when nothing else did.
  type Level = NonNullable<ExternalCourseCandidate['level']>;
  const LEVEL_BLOCK_RE =
    /^(?:[a-z]+\s+)?level\s*:?\s*(undergraduate|graduate)\b|^term\s+totals\s*\(?\s*(undergraduate|graduate)\b|^\(?(undergraduate|graduate)\)?$|^college\s*:?\s*(?:the\s+)?(graduate)\s+school\b|^(?:beginning\s+of\s+)?(undergraduate|graduate)\s+(?:academic\s+)?record\b/i;
  const LEVEL_TOTALS_RE = /\b(undergraduate|graduate)\s+(?:semester\s+)?totals\b/i;
  const ROW_LEVEL_RE = /^(UG|UGRD|GR|GRAD)$/;
  const levelWord = (w: string): Level => (w.toLowerCase() === 'undergraduate' ? 'undergraduate' : 'graduate');
  let blockLevel: Level | undefined;
  let retroLevel: Level | undefined;
  let bachelorsConferredOn: string | undefined;
  const rowLevels: (Level | undefined)[] = [];
  // Degrees (2026-09-05): a "Degrees Awarded" block makes the degree lines
  // under it conferred even without an award word on the line itself (USC,
  // Duke, Western); a "Degree and Date Conferred" table header does the same
  // for the line below it (Johns Hopkins).
  let degreeBlock = 0; // lines of a degrees-awarded block still to read
  let blockConferredGrad = false;
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex]!;
    // Transfer blocks: Banner's "TRANSFER CREDIT ACCEPTED BY …" until
    // "INSTITUTION CREDIT"; PeopleSoft's "Term  Course  Transfer Course …"
    // table (2026-09-05, a scanned community-college block) until the next
    // term header.
    if (/TRANSFER\s+CREDIT\s+ACCEPTED\s+BY/i.test(line)) transferBlock = 'banner';
    else if (/^\s*(?:term\s+)?course\s+transfer\s+course\b/i.test(line)) transferBlock = 'table';
    else if (/INSTITUTION(?:AL)?\s+CREDIT|UNIVERSITY OF NOTRE DAME CREDIT/i.test(line)) transferBlock = undefined;
    // Track the nearest term-ish header so course rows inherit its year.
    if (/(fall|spring|summer|autumn|winter|semester|term|trimester|quarter|session|academic\s+year)/i.test(line)) {
      const y = YEAR_RE.exec(line);
      if (y && line.replace(/\s{2,}/g, ' ').length < 60) {
        if (transferBlock === 'table') transferBlock = undefined; // the table ends at the next term header
        currentYear = Number(y[1]);
        currentSeason = seasonOf(line) ?? currentSeason;
        const suffix = /\b(undergraduate|graduate)\s*$/i.exec(line.trim());
        if (suffix) blockLevel = levelWord(suffix[1]!);
      }
    }
    const flat = line.replace(/\s{2,}/g, '  ').trim();
    const levelBlock = LEVEL_BLOCK_RE.exec(flat);
    if (levelBlock && !/\d{2,}/.test(flat.slice(0, 12))) {
      const word = levelBlock.slice(1).find((g) => g !== undefined) ?? '';
      blockLevel = levelWord(word);
      continue;
    }
    const levelCell = flat.split(/\s{2,}/).find((c) => /^(undergraduate|graduate)$/i.test(c.trim()));
    if (levelCell && !leadCode(flat)) {
      blockLevel = levelWord(levelCell.trim());
      if (/^(undergraduate|graduate)$/i.test(flat)) continue;
    }
    const totalsLevel = LEVEL_TOTALS_RE.exec(flat);
    if (totalsLevel) retroLevel = levelWord(totalsLevel[1]!);
    // Degrees awarded.
    if (/^[\s*-]*degrees?\s+(awarded|conferred|earned)\b/i.test(flat) && !/\b(bachelor|master|doctor)/i.test(flat)) {
      degreeBlock = 6;
    } else if (/degree\b.*\b(conferred|awarded)\b/i.test(flat) && !/\b(bachelor|master|doctor)/i.test(flat) && flat.split(/\s{2,}/).length >= 2) {
      degreeBlock = 2; // a table header: the values follow on the next line(s)
    }
    const namesDegree = /\b(bachelor|master|doctor|ph\.?\s?d)\b/i.test(flat) && !/\bsought\b|\bexpected\b|\bcandidate\b|\bcurrent program\b/i.test(flat);
    const conferredHere = namesDegree && (CONFER_RE.test(flat) || degreeBlock > 0) && !NOT_COMPLETE_RE.test(flat);
    if (degreeBlock > 0 && !leadCode(flat)) degreeBlock -= 1;
    if (conferredHere && GRAD_DEGREE_RE.test(flat)) blockConferredGrad = true;
    if (conferredHere && /\bbachelor/i.test(flat) && bachelorsConferredOn === undefined) {
      // The date may sit on the same line or on a "Degree Date:" / "Confer
      // Date:" / "Awarded:" line within the next few lines.
      bachelorsConferredOn = dateOnLine(flat);
      for (let k = 1; k <= 4 && bachelorsConferredOn === undefined; k++) {
        const later = lines[lineIndex + k];
        if (later === undefined || leadCode(later.replace(/\s{2,}/g, '  ').trim())) break;
        if (/degree\s+date|confer|awarded|graduat/i.test(later)) bachelorsConferredOn = dateOnLine(later);
      }
    }
    if (flat.length < 6) continue;
    // The course code is expected at the start of the row (or right after a
    // leading term/date cell). Column gaps are unreliable across layouts, so
    // the rest of the line is TOKENIZED: credits and grade are searched among
    // the tokens after the title; the title is the leading run of wordy tokens.
    const lead = leadCode(flat);
    if (!lead) continue;
    if (transferBlock !== undefined) {
      transferRowsSkipped += 1;
      continue;
    }
    let rowLevel: Level | undefined;
    if (lead.tokens.length > 0 && ROW_LEVEL_RE.test(lead.tokens[0]!)) {
      rowLevel = /^U/.test(lead.tokens[0]!) ? 'undergraduate' : 'graduate';
      lead.tokens.shift();
    }
    const into: { credits?: number; grade?: Grade; rawGrade?: string; titleParts: string[] } = { titleParts: [] };
    scanTokens(lead.tokens, into);
    let usedContinuation = false;
    if (into.credits === undefined && into.grade === undefined && into.rawGrade === undefined && into.titleParts.length > 0) {
      // Two-line rows (2026-09-04): some registrars print the code + title on
      // one line and the numbers on the next. If the NEXT line has no code of
      // its own, few tokens, and yields a credit or grade, treat it as this
      // row's continuation.
      const next = lines[lineIndex + 1]?.replace(/\s{2,}/g, '  ').trim();
      if (next && next.length >= 1 && !leadCode(next)) {
        const nextTokens = next.split(/\s+/).filter((t) => t !== '');
        if (nextTokens.length <= 8) {
          const probe = { titleParts: [...into.titleParts], credits: undefined, grade: undefined, rawGrade: undefined } as typeof into;
          scanTokens(nextTokens, probe);
          if (probe.credits !== undefined || probe.grade !== undefined || probe.rawGrade !== undefined) {
            into.credits = probe.credits;
            into.grade = probe.grade;
            into.rawGrade = probe.rawGrade;
            into.titleParts = probe.titleParts;
            usedContinuation = true;
          }
        }
      }
    }
    // A candidate needs a code plus at least a credit value or a grade —
    // otherwise it is a header/footer line that happened to start with a code.
    if (into.credits === undefined && into.grade === undefined && into.rawGrade === undefined) continue;
    // A row printed without its title, or with an unreadable one (a bilingual
    // transcript's non-Latin title), takes the plain wordy line just above
    // and/or the one after the row (after a consumed continuation line).
    const unreadable = into.titleParts.length > 0 && (into.titleParts.join(' ').match(/[\p{L}]/gu) ?? []).length < 4;
    if (into.titleParts.length === 0 || unreadable) {
      const before = plainTitleLine(lines[lineIndex - 1]);
      const after = plainTitleLine(lines[lineIndex + (usedContinuation ? 2 : 1)]);
      const found = [before, after].filter((t): t is string => t !== undefined);
      if (found.length > 0) {
        into.titleParts = found.join(' ').split(' ');
        if (after !== undefined) lineIndex += 1; // consumed as a title, never as a row
      }
    }
    const confidence = confidences?.[lineIndex];
    // OCR-only sanity check: real credit values come in half-credit steps, so
    // "3.6" is a misread ("3.0" with a 0→6 confusion) — flag, never silently fix.
    const oddCredits = confidences !== undefined && into.credits !== undefined && (into.credits * 2) % 1 !== 0;
    // The row's own year, if it prints one — with the course code removed
    // first, so "CSCI 2018" is never read as the year 2018 (2026-09-05).
    const codeDigits = lead.code.replace(/^[A-Z ]+[- ]?/, '');
    const withoutCode = (text: string) => text.replace(codeDigits, ' ');
    const yearLine = withoutCode(usedContinuation ? `${line} ${lines[lineIndex + 1] ?? ''}` : line);
    courses.push({
      courseId: lead.code.replace(/^([A-Z]+(?: [A-Z]+)?)[- ]?(\d)/, '$1 $2'),
      title: into.titleParts.join(' ').slice(0, 90) || undefined,
      credits: into.credits,
      grade: into.grade,
      rawGrade: into.rawGrade,
      year: YEAR_RE.exec(yearLine) ? Number(YEAR_RE.exec(yearLine)![1]) : currentYear,
      season: YEAR_RE.exec(yearLine) ? (seasonOf(yearLine) ?? currentSeason) : currentSeason,
      lowConfidence: (confidence !== undefined && confidence < OCR_CONFIDENCE_FLOOR) || oddCredits ? true : undefined,
    });
    rowLevels.push(rowLevel ?? blockLevel);
    if (usedContinuation) lineIndex += 1; // the continuation line is consumed
  }
  // Per-row level (2026-09-05): the row's or block's own marker first; else,
  // with a dated bachelor's conferral, the row's term against that date; else
  // the closing totals line's level.
  const conferralTerm = bachelorsConferredOn ? termOfDate(bachelorsConferredOn) : undefined;
  courses.forEach((c, i) => {
    let level = rowLevels[i];
    if (level === undefined && conferralTerm && c.year !== undefined) {
      if (c.season !== undefined) level = termIndex({ season: c.season, year: c.year }) <= termIndex(conferralTerm) ? 'undergraduate' : 'graduate';
      else if (c.year !== conferralTerm.year) level = c.year < conferralTerm.year ? 'undergraduate' : 'graduate';
    }
    if (level === undefined && retroLevel !== undefined && rowLevels.every((l) => l === undefined)) level = retroLevel;
    if (level !== undefined) c.level = level;
  });
  const levels = new Set(courses.map((c) => c.level).filter((l) => l !== undefined));
  const degreeConferred =
    blockConferredGrad || lines.some((l) => CONFER_RE.test(l) && GRAD_DEGREE_RE.test(l) && !NOT_COMPLETE_RE.test(l)) || undefined;
  return {
    hasTextLayer: true,
    looksLikeNotreDame,
    university: guessUniversity(lines),
    degreeConferred,
    bachelorsConferredOn,
    mixedLevels: levels.size > 1 ? true : undefined,
    transferRowsSkipped: transferRowsSkipped > 0 ? transferRowsSkipped : undefined,
    courses,
  };
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
  /** Extra context lines shown right under the intro (e.g. prior graduate study). */
  context: readonly string[];
  /** Sheet-paste sections (one per tab); a section with no rows is skipped. */
  sections: readonly { rowsIntro: string; rows: readonly (readonly string[])[] }[];
  detailsTitle: string;
  /** Detail lines grouped per transcript, each group under its heading. */
  detailGroups: readonly { heading: string; lines: readonly string[] }[];
}): { text: string; html: string } {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const greeting = 'Dear DGS and Graduate Program Administrator,';
  const sections = opts.sections.filter((s) => s.rows.length > 0);
  const groups = opts.detailGroups.filter((g) => g.lines.length > 0);
  // The human half (greeting, context, sign-off) sits ABOVE one line; the
  // machine-readable half (tables + details) below it, marked once
  // (DGS wording, 2026-09-03).
  const marker = '(DO NOT MODIFY ANYTHING BELOW THIS LINE)';
  const divider = '-'.repeat(64);
  const text =
    `Subject: ${opts.subject}\n\n${greeting}\n\n${opts.intro}\n\n` +
    opts.context.map((c) => `${c}\n`).join('') +
    `\nThank you!\n\n${divider}\n${marker}\n\n` +
    sections.map((s) => `${s.rowsIntro}\n\n${s.rows.map((r) => r.join('\t')).join('\n')}\n\n`).join('') +
    `${opts.detailsTitle}\n\n` +
    groups.map((g) => `${g.heading}\n${g.lines.map((d) => `- ${d}`).join('\n')}`).join('\n\n') +
    `\n`;
  const html =
    `<p>${esc(`Subject: ${opts.subject}`)}</p><p>${esc(greeting)}</p><p>${esc(opts.intro)}</p>` +
    (opts.context.length > 0 ? `<p>${opts.context.map((c) => esc(c)).join('<br>')}</p>` : '') +
    `<p>Thank you!</p><hr><p><strong>${esc(marker)}</strong></p>` +
    sections
      .map(
        (s) =>
          `<p>${esc(s.rowsIntro)}</p><table border="1" cellspacing="0" cellpadding="4">` +
          s.rows.map((r) => `<tr>${r.map((v) => `<td>${esc(v)}</td>`).join('')}</tr>`).join('') +
          `</table>`,
      )
      .join('') +
    `<p>${esc(opts.detailsTitle)}</p>` +
    groups.map((g) => `<p><strong>${esc(g.heading)}</strong></p><ul>${g.lines.map((d) => `<li>${esc(d)}</li>`).join('')}</ul>`).join('');
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
 * the ExternalCourses tab has not ruled on. Carries the student's prior
 * graduate study (the §5.2 caps depend on it), paste-ready rows per tab —
 * Courses (course_id, title) and ExternalCourses (UNIVERSITY in the sheet's
 * capital-English convention, course_id, course_title) — and detail lines
 * grouped per transcript. The tables and details are marked DO NOT MODIFY
 * (DGS wording, 2026-09-03) so students leave the machine-readable parts
 * intact. */
export function buildCombinedReviewRequest(opts: {
  /** The "Prior graduate study" choice, as its dropdown label. */
  priorStudy: string;
  nd: readonly PendingReviewCourse[];
  external: readonly PendingReviewCourse[];
}): { text: string; html: string } {
  const detail = (c: PendingReviewCourse) =>
    `${c.courseId}${c.title ? ` “${c.title}”` : ''}: ` +
    `${c.credits} credit${c.credits === 1 ? '' : 's'}, grade ${c.grade}, ${c.termText} — ${c.reason}`;
  // Group the external courses per transcript (slot + university), so the
  // details read the way the student uploaded them.
  const groups: { heading: string; lines: string[] }[] = [];
  if (opts.nd.length > 0) groups.push({ heading: 'Notre Dame:', lines: opts.nd.map(detail) });
  for (const c of opts.external) {
    const heading = `${c.slotLabel ?? 'Entered by hand'} — ${(c.institution ?? 'university not given').toUpperCase()}:`;
    let g = groups.find((x) => x.heading === heading);
    if (!g) {
      g = { heading, lines: [] };
      groups.push(g);
    }
    g.lines.push(detail(c));
  }
  return buildReviewRequest({
    subject: 'Course review request (degree self-check)',
    intro:
      'Could you review these courses for the degree self-check? ' +
      'It cannot count them until they are decided in the course rules.',
    context: [
      `Prior graduate study: ${opts.priorStudy}.`,
      'My transcripts (Bachelor’s / Master’s / Ph.D., whichever apply) are attached to this email.',
    ],
    sections: [
      {
        rowsIntro: 'This is the table that can be imported to the DGS’s rules sheet — Courses tab:',
        rows: opts.nd.filter((c) => c.unlisted).map((c) => [c.courseId, c.title ?? '']),
      },
      {
        rowsIntro: 'This is the table that can be imported to the DGS’s rules sheet — ExternalCourses tab:',
        rows: opts.external.filter((c) => c.unlisted).map((c) => [(c.institution ?? '').toUpperCase(), c.courseId, c.title ?? '']),
      },
    ],
    detailsTitle: 'Course details:',
    detailGroups: groups,
  });
}
