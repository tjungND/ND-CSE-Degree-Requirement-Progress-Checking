// Best-effort parser for transcripts from OTHER universities (feature decision
// 2026-09-01). Layouts vary wildly across institutions, so this extracts
// CANDIDATE course rows for the student to correct and confirm — nothing is
// added without their review, and unmatched grades must be chosen by hand.
// System-generated PDFs are read exactly; a PDF with no text layer is offered
// the opt-in English-only OCR instead (decision 2026-09-02; src/transcript/ocr.ts).
import { joinSpacedSubject } from '../data/assemble.ts';
import { expandInstitutionAbbreviations, normalizeCourseId, normalizeUniversity } from '../data/external.ts';
import { shortenAfterFirst } from '../ui/first-mention.ts';
import { termIndex, termOfDate } from '../engine/term.ts';
import type { Grade, Season } from '../engine/types.ts';
import { looksLikeNotreDameTranscript } from './nd-markers.ts';
import { resolveCampus } from './campus.ts';
import { MONTHS, dateOnLine } from './parse.ts';

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
  /** The name came from an ACRONYM, not from a name printed in the text
   * (2026-09-08). Weaker evidence, so the preview leaves the box editable
   * instead of locking it the way a printed name is locked. */
  universityGuessed?: true;
  /** The printed name is a multi-campus SYSTEM (DGS 2026-09-12): the campus
   * read from the record when it could be (`university` then holds the
   * campus's full name), else `campusSystem` alone — the student must choose. */
  campusSystem?: string;
  campus?: string;
  /** POSITIVE evidence only (2026-09-03): a line that both names a graduate
   * degree and says conferred/awarded/granted. Absence stays undefined — the
   * app never guesses whether a degree was completed. */
  degreeConferred?: true;
  /** A bachelor's degree conferral with a date (2026-09-05): the boundary
   * between undergraduate and graduate rows on a combined transcript. */
  bachelorsConferredOn?: string;
  /** The transcript STATES the bachelor's was conferred ("Graduated on … with
   * the degree of Bachelor …", a dated award line) even when its date could
   * not be read — OCR garbles dates (DGS 2026-09-16). The record is complete;
   * the term is then set by hand. */
  bachelorsConferred?: true;
  /** The transcript says its terms are QUARTERS (2026-09-11): a term header
   * such as "Fall Quarter 2023" / "Autumn Qtr 2023", or a "Quarter Units" /
   * "Quarter Hours" heading. Its credits are then quarter hours, worth a fraction (the sheet’s `quarter_credit_factor`, 0.66) of
   * a Notre Dame semester hour (§5.2 pro-rata) unless the DGS's row says
   * otherwise. Absent = no such word; nothing is assumed. */
  quarterSystem?: true;
  /** The transcript says its terms are TRIMESTERS (red-team F6, 2026-09-12):
   * the same two tests, with the word trimester. */
  trimesterSystem?: true;
  /** A bachelor's degree is NAMED anywhere on the transcript, with or without
   * a conferral date (2026-09-08). Without this there is no reason to think a
   * record covers an undergraduate degree at all, so the two-year "Taken as"
   * estimate must not run: a Master's that took three years is not a 4+1
   * (DGS bug report — a USC M.S. had its first year marked undergraduate). */
  bachelorsNamed?: true;
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
// "Graduated on 15 June 2020 with the degree of Bachelor of Science …" (DGS
// 2026-09-16) is a conferral too.
// Widened 2026-09-26 (public templates): "Award:", "Degree obtained", German
// verliehen / erworben, Portuguese formado / colação de grau, Spanish fecha de
// grado / egreso / titulación, Italian conseguito / conferito, Swedish utfärdad.
const CONFER_RE = /conferr|\bconfer\s+date|awarded|\baward\s*:|\bdate\s+of\s+award|granted|complet|graduat|obtained|obtid[oa]|verliehen|erworben|abgeschlossen|délivré|obtenu|conseguito|conferito|obtenido|utfärdad|tildelt|formado|colação\s+de\s+grau|fecha\s+de\s+(?:grado|egreso|titulaci[oó]n)|data\s+da\s+defesa/i;
const NOT_COMPLETE_RE = /incomplete|not\s+complet/i;
/** A status that says the degree is NOT done — "Status: IN PROGRESS - NOT
 * CONFERRED" under "Master of Science" in a degrees-awarded block (DGS's RPI,
 * Pitt and DePaul specimens, 2026-09-20). Tested on the degree line and, when
 * the degree line itself carries no award word, on the line below it. */
const NOT_CONFERRED_STATUS_RE = /\bnot\s+(?:yet\s+)?(?:conferred|awarded|granted|completed)\b|\bin\s+progress\b/i;
/** A line that carries a degree's date (DGS request 2026-09-06, late evening:
 * use the conferral OR completion date to pre-fill "Bachelor's degree
 * awarded"): "Degree Date:", "Degree Completion Date:", "Conferral Date:",
 * "Date Conferred:", "Graduation Date:", "Awarded:", "Completed on". */
const DEGREE_DATE_LINE_RE =
  /degree\s+(?:completion\s+|conferral\s+|award(?:ed)?\s+)?date|\bconfer(?:ral)?\s+date|\bconferr|\bawarded\b|\bgranted\b|completion\s+date|completed\s+on|date\s+(?:of\s+)?(?:completion|conferral|graduation|award)|graduation\s+date|\bgraduated\b|colação\s+de\s+grau|fecha\s+de\s+(?:grado|egreso|titulaci[oó]n)|data\s+da\s+defesa|verliehen\s+am/i;
/** A dated line that is a forecast, never an award. */
const NOT_YET_RE = /expected|anticipated|projected|sought|in\s+progress|pending/i;
// Abbreviations from Indian, Bangladeshi and Commonwealth transcripts (2026-09-26).
const GRAD_DEGREE_RE = /master|\bm\.?\s?sc?\.?\b|ph\.?\s?d|doctor of philosophy|integrated\s+m\.?\s?tech|dual\s+degree/i;
const gradDegreeIn = (text: string): boolean => GRAD_DEGREE_RE.test(text) || GRAD_ABBR_RE.test(text) || GRAD_WORDS_RE.test(text);

const LETTER_GRADE_RE = /^(A|A-|B\+|B|B-|C\+|C|C-|D\+?|D-?|F)$/;
const YEAR_RE = /\b(19[5-9]\d|20[0-4]\d)\b/;

/** Words that name an institution outright (guessUniversity has a wider list
 * of its own, with the non-English forms and the weak "college"). */
// Widened 2026-09-26 (public keys): institutes of information technology /
// science / engineering, Indonesia's Institut Teknologi, Italy's Politecnico,
// technical universities, academies of higher education, vidyapeeth.
const STRONG_NAME_RE =
  /universit|\binst(?:itute)?\.?\s+of\s+(?:tech|information\s+technology|science|engineering)|\binstitut\w*\s+(?:of\s+)?(?:science|technology|teknologi)|polytechnic|politecnico|polytechnique|politécnic|technical\s+university|technische\s+universität|hochschule|academy\s+of\s+higher\s+education|vidyapeeth|vishwavidyalaya|viswavidyalaya|universidad|università|universität|universiteit|universitas/i;
// A sentence that merely mentions a university ("This official university
// transcript is certified to be a …") is not a name (2026-09-05).
const SENTENCE_RE = /\b(this|is|are|was|were|has|have|to be|certified|issued|printed|member of|does not|registrar|provost|dean)\b/i;

// Degree lines (named once here; the scan tests them on every line).
// "Degree(s) Awarded" with the parenthesis is UMass Amherst's heading (DGS 2026-09-13).
const DEGREES_AWARDED_HEADING_RE = /^[\s*-]*degree(?:s|\(s\))?\s+(awarded|conferred|earned)\b/i;
// Degree abbreviations are CASE-SENSITIVE and want their dots or a degree
// context ("B.Tech.", "BSc", "BS in …") — "be applied toward a degree" is
// prose, not a B.E. (2026-09-26).
const BACHELORS_ABBR_RE = /\bB\.\s?(?:E|Tech|Sc|S|Eng|Arch|A)\.?(?=[\s.,(]|$)|\b(?:BSc|BEng|BTech|BE|BS|BA)(?:\s*\(Hons\.?\))?(?=\s+(?:in|of|degree|\()|[.,]|$)/;
const GRAD_ABBR_RE = /\bM\.\s?(?:Tech|E|Eng|Sc|S|Phil|CA)\.?(?=[\s.,(]|$)|\b(?:MSc|MEng|MTech|ME|MS)(?=\s+(?:in|of|degree|\()|[.,]|$)/;
const GRAD_WORDS_RE = /\bmestre\b|\bmestrado\b|\bmag[ií]ster\b|\bmaestr[ií]a\b|\bdoutorado\b|\bdoctorado\b/i;
const BACHELORS_WORDS_RE = /\bbachelor|licenciad[oa]|licenciatura|bacharel(?:ado)?|\bt[ií]tulo\s*:\s*ingenier[oa]/i;
const bachelorsIn = (text: string): boolean => BACHELORS_WORDS_RE.test(text) || BACHELORS_ABBR_RE.test(text);
const DEGREE_NAME_RE = /\b(bachelor|master|doctor)/i;
const namesDegreeIn = (text: string): boolean => /\b(bachelor|master|doctor|ph\.?\s?d)\b/i.test(text) || bachelorsIn(text) || GRAD_ABBR_RE.test(text) || GRAD_WORDS_RE.test(text);
const NOT_AWARDED_RE = /\bsought\b|\bexpected\b|\bcandidate\b|\bcurrent program\b/i;
const gradDegreeNameIn = (text: string): boolean => /\b(master|doctor|ph\.?\s?d)\b/i.test(text) || GRAD_ABBR_RE.test(text) || GRAD_WORDS_RE.test(text);
const DEGREE_CONFERRED_HEADER_RE = /degree\b.*\b(conferred|awarded)\b/i;
const DEGREE_CONFERRED_HEADER_ALONE_RE = /^[^:]*\bdegree\b[^:]*\b(conferred|awarded)\b\s*:?\s*$/i;

// Block and term markers the scan tests on every line.
const TRANSFER_BANNER_RE = /TRANSFER\s+CREDIT\s+ACCEPTED\s+BY/i;
const TRANSFER_TABLE_RE = /^\s*(?:term\s+)?course\s+transfer\s+course\b/i;
const INSTITUTION_CREDIT_RE = /INSTITUTION(?:AL)?\s+CREDIT|UNIVERSITY OF NOTRE DAME CREDIT/i;
// Lines that END a transfer-credit block when no "INSTITUTION CREDIT" line
// does (DGS's synthetic set, 2026-09-20): "Beginning of Graduate Record",
// "***** GRADUATE RECORD *****", "-- GRADUATE --", "Graduate Program of
// Study", and the block's own "Total transfer credits accepted: 6" line.
const TRANSFER_PEOPLESOFT_RE = /^\s*transfer\s+(?:credits?|work|coursework)(?:\s+from\b|\s*:?\s*$)|^\s*transfer\s+credit\s+summary\b|^\s*applied\s+toward\b/i;
const TRANSFER_TOTALS_RE = /^\s*(?:course\s+trans\s+gpa|transfer\s+totals?)\b/i;
const TRANSFER_END_RE =
  /^\s*(?:\*+\s*)?(?:beginning\s+of\s+)?(?:graduate|undergraduate)\s+(?:academic\s+)?record\b|^\s*(?:graduate|undergraduate)\s+program\s+of\s+study\b|^\s*-+\s*(?:graduate|undergraduate)\s*-+|^\s*total\s+transfer\b/i;
// "Transferred from: University of Florida" names the OTHER school (2026-09-20):
// never the transcript's own name, whether in the header or a degree block.
const TRANSFER_FROM_RE = /^\s*transfer(?:red)?\s+(?:from|credit)\b/i;
// An institution named on a term line ("Fall 2018: Purdue University" inside
// Banner's transfer block) keeps that block open; a bare term header ends it.
const NAMES_INSTITUTION_RE = /universit|college|institute|school|academy/i;
// An academic-year term header, "2023-24 Spring Term" (2026-09-20): Fall is
// the first year, Winter / Spring / Summer the second.
// Two-digit or four-digit second year (2026-09-26: Wisconsin "Spring 2023-2024",
// MIT "Spring Term 2022-2023", NUS "2022/2023"); no leading \b so "AY2022/2023" reads.
const ACADEMIC_YEAR_RE = /((?:19|20)\d{2})[-–/]((?:19|20)?\d{2})\b/;
// WPI's seven-week terms, "A Term 2020" … "D Term 2021" (DGS 2026-09-20: a
// quarter calendar). A and B fall in the autumn semester, C and D in spring.
const WPI_TERM_RE = /^\s*([A-D])\s+term\s+((?:19|20)\d{2})\b/i;
// A totals line — "Ehrs: 8.000 GPA-Hrs: 8.000", "Term Totals: 12 credits",
// "Term Units 9" — is never the second line of a two-line course row
// (2026-09-20: a term total was read as the credits of the row above it).
const TOTALS_LINE_RE = /^\s*(?:ehrs|gpa-?hrs|qpts|term\s+(?:totals?|units|credits|gpa)|cumulative|totals?)\b|\bgpa\b/i;
// Word-bounded since 2026-09-26 ("Intermediate Writing" + course number 2010 was
// a term header), and widened to the words other registrars print: Monsoon
// (IIIT Hyderabad), Sem/Sem., "Examination(s) held", semestre / semester in
// four languages, the German Wintersemester / Sommersemester and their
// abbreviations, MIT's IAP, a January or winter session, Nepal's Year/Part.
const TERM_WORD_RE =
  /\b(fall|spring|summer|autumn|winter|semester|sem\.?|term|trimester|quarter|session|academic\s+year|monsoon|examinations?\s+held|regular\s+examinations?|semestre|semestr|per[ií]odo|ciclo|wintersemester|sommersemester|wise|sose|iap|january|j-term|midyear|special\s+term|full\s+year|year\/part|h[oọ]c\s+k[yỳ]|学期)\b/i;
const LEVEL_SUFFIX_RE = /\b(undergraduate|graduate|postgraduate)\s*$/i;
const LEVEL_ALONE_RE = /^(undergraduate|graduate)$/i;
// Season words (2026-09-26): Monsoon is the Indian fall semester; the southern
// hemisphere's Otoño / Outono (March–July) sits where Notre Dame's spring does
// and its Primavera (August–December) where the fall does; the German
// Wintersemester (October–March) is the fall term, the Sommersemester
// (April–July) the spring; Swiss HS / FS likewise; MIT's IAP, a January or
// winter session and an intersession precede the spring.
const FALL_RE = /\b(fall|autumn|monsoon|primavera|wintersemester|wise|herbstsemester|otoño\s+boreal)\b/i;
const SPRING_RE = /\b(spring|winter|intersession|otoño|outono|frühjahrssemester|iap|j-term)\b/i;
const SUMMER_RE = /\b(summer|verano|verão|midyear|special\s+(?:term|semester)|sommer|sommersemester|sose)\b/i;
/** An ordinal semester or term: "Semester I", "First Semester", "Term 2",
 * "Sem-II", "1º Sem", "1S", "Odd Semester", "Semester One", Nepal's
 * "Year/Part: I/II" (the part), Thailand's "1/2022". */
const ORDINAL_AFTER_RE = /\b(?:semester|sem\.?|term|trimestre|semestre|per[ií]odo|ciclo|h[oọ]c\s+k[yỳ]|part)\s*[-:#]?\s*(I{1,3}|IV|[1-4]|one|two|three|four|first|second|third|fourth|1st|2nd|3rd|4th|odd|even)\b(?![-/.]\d)/i;
const ORDINAL_BEFORE_RE = /\b(first|second|third|fourth|1st|2nd|3rd|4th|odd|even|[1-4]\s*[ºª°]|[1-4]S)\s*[-.]?\s*(?:semester|sem\b\.?|term|semestre|trimestre|quarter)/i;
/** IIT Kanpur's "2019-20/I": the ordinal after the academic year. */
const RANGE_SLASH_ORDINAL_RE = /(?:19|20)\d{2}[-–/](?:(?:19|20)?\d{2})\s*\/\s*(I{1,3}|[1-3])\b/i;
const YEAR_PART_RE = /year\s*\/\s*part\s*:?\s*(I{1,4}|IV|[1-4])\s*\/\s*(I{1,3}|[1-3])/i;
const SLASH_ORDINAL_RE = /(?:^|\s)([1-3])\s*[ºª°]?\s*(?:S|Sem\.?)?\s*\/\s*((?:19|20)\d{2})(?:\s|$)/i;
/** A month range on a term line (UBC "Term 1   September - December 2019"):
 * the first month names the season. */
const MONTH_RANGE_RE = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*[-–—]\s*(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*,?\s*((?:19|20)\d{2})\b/i;
const MONTH_YEAR_RE = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?(?:\s*\/\s*(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?)?,?\s*((?:19|20)\d{2})\b/i;
const SOLAR_HIJRI_YEAR_RE = /\b(13[5-9]\d|14[0-2]\d)\b/;
const GREGORIAN_HINT_RE = /\(\s*((?:19|20)\d{2})(?:\s*[-–/]\s*(?:19|20)?\d{2})?\s*(?:G\.?C\.?|A\.?D\.?)?\s*\)|((?:19|20)\d{2})(?:\s*[-–/]\s*(?:19|20)?\d{2})?\s*(?:G\.?C\.?|A\.?D\.?)/i;

/** The season a term header names, when it names one. */
/** The ordinal a term line names (1–4), or undefined. */
function ordinalOf(text: string): number | undefined {
  const word = (w: string): number => {
    const t = w.toLowerCase().replace(/[ºª°]/g, '').replace(/s$/i, '');
    if (/^(i|1|one|first|1st|odd)$/.test(t)) return 1;
    if (/^(ii|2|two|second|2nd|even)$/.test(t)) return 2;
    if (/^(iii|3|three|third|3rd)$/.test(t)) return 3;
    return 4;
  };
  const yp = YEAR_PART_RE.exec(text);
  if (yp) return word(yp[2]!);
  const rs = RANGE_SLASH_ORDINAL_RE.exec(text);
  if (rs) return word(rs[1]!);
  const after = ORDINAL_AFTER_RE.exec(text);
  if (after) return word(after[1]!);
  const before = ORDINAL_BEFORE_RE.exec(text);
  if (before) return word(before[1]!);
  const slash = SLASH_ORDINAL_RE.exec(text);
  if (slash) return Number(slash[1]);
  return undefined;
}

function seasonOf(text: string): Season | undefined {
  return FALL_RE.test(text) ? 'fall' : SPRING_RE.test(text) ? 'spring' : SUMMER_RE.test(text) ? 'summer' : undefined;
}

/** Whitespace-split tokens of a row's cells (joined at column gaps). */
const tokensOf = (parts: string[]): string[] =>
  parts
    .join('  ')
    .split(/\s+/)
    .filter((t) => t !== '');

/** What one row's tokens yield (scanTokens): the title's words, then the
 * credits and the grade — or the printed grade token when it maps to none. */
interface RowScan {
  credits?: number;
  /** The credits as printed ("3.000"), so the Earned column can be told from a
   * grade on the 4.0 scale that happens to equal the credits (2026-09-26). */
  creditsText?: string;
  grade?: Grade;
  rawGrade?: string;
  titleParts: string[];
}

/** What the transcript's OWN legend says about tokens the app would otherwise
 * read wrongly or not at all (public-transcript research, 2026-09-26 — the
 * legend is the only evidence the app may act on; CLAUDE.md: never guess):
 * `eFails` — the failing grade is E (Ohio State, Utah, Arizona State, Florida:
 * "E 0.0 Failure"); `nUnsatisfactory` — N means no credit / not satisfactory
 * (Minnesota); `sIsTop` — S is the top grade of an S/A/B/C/D/E scale worth 10
 * points (IIT Madras, Anna University), NOT the app's satisfactory, so it is
 * left raw for the student to map. */
interface LegendHints {
  eFails?: true;
  nUnsatisfactory?: true;
  sIsTop?: true;
  /** NP means "no grade — pass" here (KFUPM), not the US "no pass". */
  npPasses?: true;
  /** P is a letter grade worth points (India's UGC scale "P 4"), not a pass. */
  pIsLetter?: true;
  /** The Australian HD / D / CR / P / N scale (the ANU sample, 2026-09-26):
   * D is a Distinction (70–79), not the app's D, CR a Credit band, P the
   * 50–59 pass — every band is left raw beside its mark for the DGS. */
  hdScale?: true;
}

function readLegend(lines: string[]): LegendHints {
  const hints: LegendHints = {};
  for (const raw of lines) {
    const l = raw.replace(/\s+/g, ' ');
    // "E 0.0 Failure", "E = Failure", "E - Failing grade", "E (0.0)". The
    // synthetic legends of the committed fixtures say "F 0.00 Failure" and
    // define no E, so they leave every hint unset.
    if (/(?:^|[\s,;|(])E\s*[=:–-]?\s*\(?\s*(?:0(?:\.0+)?\s*[)\s,]*)?\(?\s*(?:[=:–-]\s*)?(?:fail(?:ure|ing|ed)?|unsatisfactory)\b/i.test(l)) hints.eFails = true;
    // "E 0.00" only where the E opens a legend entry — on a course row ("MATH
    // 1210   Calculus I   4.000   E   0.00") it is a grade and its points.
    if (/^(?:.{0,24}[\s,;|])?E\s*[=:–-]?\s*(?:\()?0\.0+\)?(?:\s|$)/.test(l) && !/^[A-Z]{2,10}\s+\d{2,5}\b/.test(l)) hints.eFails = true;
    if (/(?:^|[\s,;|])N\s*[=:–-]?\s*(?:\()?\s*(?:not\s+satisfactory|no\s+credit|non-?credit|unsatisfactory)\b/i.test(l)) hints.nUnsatisfactory = true;
    // "S 10", "S = 10", "S (10)", "S – Outstanding (10 points)".
    if (/(?:^|[\s,;|])S\s*(?:[=:–-]|\()?\s*(?:outstanding\s*\(?)?10\b/i.test(l)) hints.sIsTop = true;
    if (/(?:^|[\s,;|])NP\s*[=:–-]?\s*\(?\s*(?:no\s+grade\s*[-–:]?\s*pass|pass(?:ed|ing)?(?:\s*[,;)]|\s+without|\s*$))/i.test(l)) hints.npPasses = true;
    if (/(?:^|[\s,;|])P\s*(?:\(pass\))?\s*[=:–-]?\s*(?:\()?\s*[4-5](?:\.0+)?\b(?!\s*\.\d)/.test(l) && /\b(?:O|A\+?)\s*[=:–-]?\s*\(?\s*(?:10|9)\b/.test(l)) hints.pIsLetter = true;
    // An HD grade on a row, or a legend naming the High Distinction: the
    // Australian scale, where D is a Distinction (the ANU sample, 2026-09-26).
    if (/\bhigh\s+distinction\b/i.test(l) || /(?:^|\s)HD\s*\*?$/.test(l)) hints.hdScale = true;
  }
  return hints;
}

/** Registrar pass/fail spellings and status codes read from public transcript
 * keys (2026-09-26): Penn State SA/UN, Ohio State PA, Illinois PS/PP/PD/PZ,
 * NUS CS/CU, HKUST PP, IIT-style SAT, and the words other languages print in
 * the grade cell (German "bestanden", Italian "idoneo", Spanish "aprobado",
 * Portuguese "aprovado", Swedish "godkänd", Norwegian "bestått"). Tokens that
 * are NOT a pass/fail — a transfer T/TR, a withdrawal W, an incomplete I, an
 * audit AU, a top grade S on an S–E scale — are left raw for the student. */
const PASS_TOKENS = new Set(['P', 'PASS', 'PASSED', 'PASSING', 'CR', 'S', 'BESTANDEN', 'IDONEO', 'IDONEA', 'APROBADO', 'APROBADA', 'APROVADO', 'APROVADA', 'GODKÄND', 'GODKAND', 'BESTÅTT', 'BESTATT', 'APPROVED', 'SUPERATO', 'SUPERATA', 'SATISFACTORY']);
const FAIL_TOKENS = new Set(['NP', 'FAIL', 'FAILED', 'NC', 'U', 'NICHTBESTANDEN', 'REPROBADO', 'REPROBADA', 'REPROVADO', 'REPROVADA', 'NONSUPERATO', 'NONSUPERATA', 'UNSATISFACTORY', 'UNDERKÄND', 'UNDERKAND']);
const IN_PROGRESS_TOKENS = new Set(['IP', 'INPROGRESS', 'ENROLLED']);
/** Registrar codes that are also ordinary words inside a course title ("CS
 * Trends", "Lab for CS 2000", "Course to be …"): read as grades only where a
 * grade sits — after the credits, or right before them — never while the
 * title is still open (2026-09-26, the Binghamton and Northeastern fixtures). */
const CODED_PASS_TOKENS = new Set(['SA', 'SAT', 'PA', 'PS', 'PP', 'PD', 'PZ', 'CS', 'BE', 'SY', 'CPL', 'ACC']);
const CODED_FAIL_TOKENS = new Set(['UN', 'NS', 'NZ', 'CU', 'IB', 'NAC']);
const CODED_IN_PROGRESS_TOKENS = new Set(['IPR', 'INP', 'PR']);

function mapGrade(token: string, legend: LegendHints = {}, inGradePosition = true): Grade | undefined {
  const t = token.toUpperCase().replace(/\s+/g, '');
  if (inGradePosition) {
    if (CODED_PASS_TOKENS.has(t)) return 'S';
    if (CODED_FAIL_TOKENS.has(t)) return 'U';
    if (CODED_IN_PROGRESS_TOKENS.has(t)) return 'IP';
  }
  if (t === 'A+') return 'A'; // no A+ in the app's grade scale (2026-09-05)
  // On the Australian scale D, CR, P and N are bands of the mark beside them
  // (D = Distinction, 70–79), none of them the app's grades: left raw.
  if (legend.hdScale && /^(?:HD|D|CR|P|N)$/.test(t)) return undefined;
  if (LETTER_GRADE_RE.test(t)) {
    if (t === 'D+' || t === 'D-') return 'D';
    return t as Grade;
  }
  // Korean-style "A0 / B0" (the plain grade, beside A+ and B+): the zero is
  // the absence of a plus (public keys, 2026-09-26).
  if (/^[A-D]0$/.test(t)) return t[0] as Grade;
  // The transcript's legend decides what E, N and S mean (never a guess).
  if (t === 'E' && legend.eFails) return 'F';
  if (t === 'N' && legend.nUnsatisfactory) return 'U';
  if (t === 'S' && legend.sIsTop) return undefined;
  if (t === 'NP' && legend.npPasses) return 'S';
  if (t === 'P' && legend.pIsLetter) return undefined;
  if (PASS_TOKENS.has(t)) return 'S';
  if (FAIL_TOKENS.has(t)) return 'U';
  if (IN_PROGRESS_TOKENS.has(t)) return 'IP';
  return undefined;
}

/** A pass/fail-class token (S/U/IP family), as opposed to a letter grade: a
 * letter grade may replace a numeric guess on the row ("a real grade beats a
 * numeric guess"), a pass/fail token may not — the University of Sydney prints
 * "66   CR" where CR is the 65–74 band and the mark is the grade (2026-09-26). */
const isPassFailToken = (token: string, legend: LegendHints): boolean => {
  const g = mapGrade(token, legend);
  return g === 'S' || g === 'U' || g === 'IP';
};

/** Grade tokens that carry no letter grade but ARE the row's result, kept as
 * printed for the student to map (2026-09-26): a fraction mark (15/20, 28/30,
 * 16.2/20), the Italian 30 with honours ("30L", "30 e lode"), the Chinese
 * five-level words, and a CJK grade character (優 / 良 / 合格 / 及格). */
const FRACTION_MARK_RE = /^\d{1,2}(?:[.,]\d{1,2})?\/(?:10|20|30)$/;
const LODE_RE = /^30\s?(?:L|e lode|cum laude|con lode)$/i;
const GRADE_WORD_RE = /^(?:excellent|good|medium|fair|qualified|average|poor|distinction|merit|very good|pass with distinction|high pass|low pass|honou?rs)$/i;
const CJK_GRADE_RE = /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]{1,3}$/u;
/** Phrases a transcript prints as several words in the grade cell, joined
 * before the token scan so they read as one token. */
const GRADE_PHRASES: readonly (readonly string[])[] = [
  ['30', 'e', 'lode'],
  ['30', 'cum', 'laude'],
  ['30', 'con', 'lode'],
  ['nicht', 'bestanden'],
  ['non', 'superato'],
  ['non', 'superata'],
  ['very', 'good'],
  ['pass', 'with', 'distinction'],
  ['high', 'pass'],
  ['low', 'pass'],
];
const joinGradePhrases = (tokens: string[]): string[] => {
  const out: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const phrase = GRADE_PHRASES.find((p) => p.every((w, j) => tokens[i + j]?.toLowerCase() === w));
    if (phrase) {
      out.push(tokens.slice(i, i + phrase.length).join(' '));
      i += phrase.length - 1;
    } else out.push(tokens[i]!);
  }
  return out;
};

/** A cell that reads as a plausible credit value (0 ≤ n ≤ 30, up to 3
 * decimals — Banner and PeopleSoft print "3.000", 2026-09-05). */
/** WPI prints its seven-week-term credits as a fraction, "1/3" (DGS
 * 2026-09-20): read as the number, to three decimals. */
const FRACTION_CREDITS_RE = /^(\d)\/(\d)$/;
/** "3.000" → 3 decimals, "3" → 0 (the credits' printed format, 2026-09-26). */
const decimalsOf = (token: string): number => (/[.,](\d+)$/.exec(token)?.[1] ?? '').length;
const numericLike = (token: string): boolean => /^\d{1,3}(?:[.,]\d{1,2})?$/.test(token);

function asCredits(token: string): number | undefined {
  const fraction = FRACTION_CREDITS_RE.exec(token);
  if (fraction && Number(fraction[2]) > 0) return Math.round((Number(fraction[1]) / Number(fraction[2])) * 1000) / 1000;
  if (!/^\d{1,2}(?:[.,]\d{1,3})?$/.test(token)) return undefined;
  if (/^0\d$/.test(token)) return undefined; // "01" is a section number, not 1 credit
  const n = Number(token.replace(',', '.'));
  // 0 is a real value (zero-credit seminars, internships — "0.00 S"), kept
  // since 2026-09-05 so such rows do not come back with blank credits.
  return n >= 0 && n <= 30 ? n : undefined;
}

/** The credits cell as a COLUMN-MAPPED layout may print it (2026-09-26):
 * parentheses round a value no credit was awarded for (Tulane "(3.000)"), a
 * lecture:lab sum (IISc "3:1"), WPI's fraction, and values up to 120 — UK and
 * Australian credit points (15, 20, 40, 60), UChicago's 100 units — which the
 * position-free scan must keep refusing (a mark of 85 would read as credits). */
function asCreditsWide(token: string): number | undefined {
  const bare = /^\(\d{1,3}(?:[.,]\d{1,3})?\)$/.test(token) ? token.slice(1, -1) : token;
  const lectureLab = /^(\d{1,2}):(\d{1,2})$/.exec(bare);
  if (lectureLab) return Number(lectureLab[1]) + Number(lectureLab[2]);
  const narrow = asCredits(bare);
  if (narrow !== undefined) return narrow;
  if (!/^\d{1,3}(?:[.,]\d{1,3})?$/.test(bare)) return undefined;
  const n = Number(bare.replace(',', '.'));
  return n > 30 && n <= 120 ? n : undefined;
}

/** The kinds of column a course table's header line names — read so the row
 * scan knows WHERE the grade and the credits sit (public-transcript research,
 * 2026-09-26): marks columns before the grade (Indian universities), the
 * grade before the credits (Banner Self-Service), attempted/earned pairs
 * (PeopleSoft), ECTS beside a local grade (Europe), a level or type cell. */
type ColumnKind = 'code' | 'title' | 'credits' | 'ects' | 'attempted' | 'earned' | 'grade' | 'points' | 'mark' | 'level' | 'flag' | 'term' | 'serial' | 'workload' | 'duration';

const COLUMN_KIND_RES: readonly (readonly [ColumnKind, RegExp])[] = [
  ['serial', /^(?:s\.?\s*)?(?:no\.?|sl\.?\s*no\.?|sr\.?\s*no\.?|#|s\.?\s*n\.?)$/i],
  ['term', /^(?:term|semester|session|period|periodo|período|date|year|academic\s*year|semester\s*ending\s*date|quarter|exam\s*(?:period|month|date)|month\s*&?\s*year|announced\s*on|declared\s*on|date\s*of\s*result|result\s*date|completed|month\/year|pr[üu]fungsdatum|datum|fecha|data|semestre|per[ií]odo\s*letivo)$/i],
  ['code', /^(?:course|subject|subj\.?|subject\s*code|course\s*(?:code|id|no\.?|number|num\.?|unit\s*code)|code|kode(?:\s*\/\s*code)?|no\.?|number|cat\.?\s*no\.?|ref\.?|clave|código|codigo|course\s*unit|crs\.?(?:\s*no\.?)?|crse(?:\s*no\.?)?|dept\s*crs|modulnummer|modul-?nr\.?|modul\s*no\.?|kennung)$/i],
  ['title', /(?:title|name|description|nama|titre|denominaci|disciplina|asignatura|materia|curso|course\s*unit\s*name|subject\s*name|unit\s*of\s*study|modul(?!nummer|-?nr|\s*no)|module|lehrveranstaltung)/i],
  ['flag', /^(?:r|rpt|repeat(?:ed)?|h|flag|notes?|remarks?|type|course\s*type|category|status|exam\s*type|tipo(?:\s*de\s*examen)?|mode|comments?|excl\.?|incl\.?|situa[çc][aã]o|section|sec\.?|instructor|room|days|time|campus|component|delivery|part|option|classification\s*code|core\/elective|elective\/core|resit|pass\/fail|p\/f|honor\s*code|notation|code)$/i],
  ['mark', /(?:marks?|mrk|score|internals?|externals?|total|theor(?:y|etical)|practical|term\s*work|assessment|exam(?:ination)?|full|max|obtained|nota\b|média|media\b|promedio|calif|punt|out\s*of)/i],
  ['attempted', /(?:attempt|taken|enrol|registered|inscri)/i],
  ['earned', /(?:earned|passed|aprobad|obtid|erworben)/i],
  ['points', /^(?:(?:quality|grade|honor|gpa)\s*(?:points?|pts?)|q\.?\s*pts?|g\.?\s*pts?|gp|pts?|points?|qpts?|gpa\s*hrs?|gpa|c\s*\*\s*g|cxg|credit\s*x\s*grade|credits?\s*\*\s*(?:grade\s*)?points?)$/i],
  ['workload', /^(?:ch|carga\s*hor[aá]ria|workload|contact\s*hours|hours\s*per\s*week|lecture\s*hours|l-t-p|ltp|wochenstunden|sws|freq\.?|frequ[êe]ncia|attendance|presença|asistencia)$/i],
  ['duration', /^duration/i],
  ['ects', /^(?:ects(?:\s*credits?)?|ects\s*cr\.?|credit\s*\(?ects\)?)$/i],
  ['credits', /^(?:credits?|cr\.?|crd|crds|cr\.?\s*hrs?\.?|hrs?\.?|hours|credit\s*(?:hours?|hrs?|value|units?|points?|weight)|units?|cu|course\s*units?|unit\s*value|sem\.?\s*hrs?|semester\s*(?:hours?|credits?)|quarter\s*(?:units?|hours?|hrs?)|sks(?:\s*\/\s*credits?)?|weight|wgt|units?\s*of\s*credit|cp|cfu|créditos?(?:\s+(?:aula|trabalho))?|creditos?|crédits?|kredit|c)$/i],
  ['grade', /^(?:grade|grd|gr|letter\s*grade|final\s*grade|results?|outcome|nilai(?:\s*\/\s*grade)?|grado|voto|calificaci[oó]n|betyg|karakter|note|conceito|grade\s*letter|grade\s*\(?letter\)?|local\s*grade|ects\s*grade|honor|honou?rs|classification)$/i],
  ['level', /^(?:level|lvl|career|academic\s*career|ug\/gr|course\s*level)$/i],
];

/** The kinds of a header line, in column order — or undefined when the line
 * is not a course-table header: fewer than three cells, fewer than three of
 * them recognised, no course/title column, or nothing to read (no credits,
 * grade or marks column). A cell no pattern knows is 'flag' (skipped). */
/** The header's cell texts, kept beside the kinds (Sharif "Theoretical /
 * Practical" are credit hours, not marks, when no credits column exists). */
let lastHeaderCells: string[] = [];
function readColumnHeader(flat: string): ColumnKind[] | undefined {
  const cells = flat.split(/\s{2,}/).map((c) => c.trim().replace(/[.:]+$/, '')).filter((c) => c.length > 0);
  if (cells.length < 3 || cells.length > 14) return undefined;
  if (cells.some((c) => /\d{3,}/.test(c))) return undefined; // a row, a date, a code
  let known = 0;
  const kinds: ColumnKind[] = cells.map((cell) => {
    // "Credits (ECTS)", "Grade (Letter)", "Score (10)" — the parenthesis
    // qualifies the column, it does not rename it; a slash joins two languages
    // ("Kode / Code") and the first half decides.
    const head = cell.replace(/\s*\(.*\)\s*$/, '').split(/\s*\/\s*/)[0]!.trim();
    for (const [kind, re] of COLUMN_KIND_RES) {
      if (re.test(head) || (kind === 'title' && re.test(cell)) || (kind === 'mark' && re.test(cell) && !/credit|unit|hour|grade|point/i.test(cell))) {
        known += 1;
        return kind;
      }
    }
    return 'flag';
  });
  if (known < 3 || known < Math.ceil(cells.length * 0.6)) return undefined;
  if (!kinds.includes('code') && !kinds.includes('title')) return undefined;
  if (!kinds.some((k) => k === 'credits' || k === 'ects' || k === 'grade' || k === 'mark' || k === 'attempted' || k === 'earned')) return undefined;
  // German "Note" is the grade unless another grade column exists (then it is
  // the English "Note", a remark).
  if (!kinds.includes('grade')) cells.forEach((c, i) => { if (/^note$/i.test(c)) kinds[i] = 'grade'; });
  // "Number   Course   ECTS …": two code-like cells and no title — the second
  // is the title. "Unit of Study   Title …": two title-like cells and no code
  // — the first is the code. A lone "Course" cell is the code AND the title.
  // A "Code" / "Notation" cell AFTER the title is a notation column (UCI).
  const firstTitle = kinds.indexOf('title');
  const firstCode = kinds.indexOf('code');
  if (firstTitle < 0 && kinds.filter((k) => k === 'code').length >= 2) kinds[kinds.indexOf('code', firstCode + 1)] = 'title';
  else if (firstTitle < 0) kinds[firstCode] = 'title';
  else if (firstCode < 0 && kinds.filter((k) => k === 'title').length >= 2) kinds[firstTitle] = 'code';
  const titleAt = kinds.indexOf('title');
  for (let i = titleAt + 1; i < kinds.length; i++) if (kinds[i] === 'code' || kinds[i] === 'title' || kinds[i] === 'serial') kinds[i] = 'flag';
  // No credits column: a "Points" column BEFORE the grade is the credits (New
  // Zealand, UK credit points), and Iranian "Theoretical / Practical" cells
  // are credit hours of each kind.
  if (!kinds.includes('credits') && !kinds.includes('attempted')) {
    const gradeAt = kinds.indexOf('grade');
    const pointsAt = kinds.indexOf('points');
    if (pointsAt >= 0 && (gradeAt < 0 || pointsAt < gradeAt)) kinds[pointsAt] = 'credits';
    cells.forEach((c, i) => {
      if (kinds[i] === 'mark' && /^(?:theoretical|practical|theory\s*credits?|lab\s*credits?)$/i.test(c.replace(/\s*\(.*\)\s*$/, ''))) kinds[i] = 'credits';
    });
  }
  lastHeaderCells = cells;
  return kinds;
}

const PLACEHOLDER_TOKEN_RE = /^(?:[-–—_]+|n\/a|\.{2,}|\*+)$/i; // bare "NA" is Illinois Tech's non-attendance grade, not a blank

/** Institutions whose transcript prints its NAME only as an image, but whose
 * text carries an unmistakable acronym (DGS 2026-09-08: Johns Hopkins prints
 * the name in a logo, and the text says "JHU Degree and Date Conferred").
 *
 * This is the last thing tried, so a transcript that spells its name out
 * always wins — the acronym never overrides a name the parser can read. The
 * pattern is CASE-SENSITIVE: transcripts print these acronyms in capitals, and
 * requiring capitals keeps a lower-case look-alike (a surname, a web address
 * inside a course title) from renaming the whole transcript.
 *
 * The value is the institution's real name, because that is what the student,
 * the DGS and the Grad Admin read, and what the ExternalCourses tab is keyed
 * on. Add a row here when another school turns up with the same problem. */
const NAME_ONLY_IN_IMAGE: readonly (readonly [RegExp, string])[] = [
  [/\bJHU\b/, 'Johns Hopkins University'],
  // UC San Diego prints the logo as an image and abbreviates itself in the
  // text ("---UCSD DEGREES AWARDED---", DGS 2026-09-09).
  [/\bUCSD\b/, 'University of California, San Diego'],
  // Schools whose header prints only the brand (public transcript keys and
  // templates, 2026-09-26); each is a weak guess the student can correct.
  [/\bKU\s?LEUVEN\b/i, 'KU Leuven'],
  [/\bETH\s+Z[uü]rich\b/i, 'ETH Zurich'],
  [/\bEPFL\b/, 'École Polytechnique Fédérale de Lausanne'],
  [/\bTU\s?Delft\b/i, 'Delft University of Technology'],
  [/\bTU\/e\b|\bTU\s?Eindhoven\b/i, 'Eindhoven University of Technology'],
  [/\bTU\s?Wien\b/i, 'TU Wien'],
  [/\bKTH\b/, 'KTH Royal Institute of Technology'],
  [/\bDTU\b/, 'Technical University of Denmark'],
  [/\bNTNU\b/, 'Norwegian University of Science and Technology'],
  [/\bUCL\b/, 'University College London'],
  [/\bLSE\b/, 'London School of Economics and Political Science'],
  [/\bKIT\b/, 'Karlsruhe Institute of Technology'],
  [/\bRWTH\b/, 'RWTH Aachen University'],
  [/\bTUM\b/, 'Technical University of Munich'],
  [/\bKAIST\b/, 'Korea Advanced Institute of Science and Technology'],
  [/\bPOSTECH\b/, 'Pohang University of Science and Technology'],
];

/** The name a WATERMARK spells out (DGS 2026-09-12). UC San Diego tiles
 * "UNIVERSITY OF CALIFORNIA SAN DIEGO • UNIVERSITY OF CALIFORNIA SAN DIEGO •
 * …" across every page; the text layer breaks the tiles at the margins and at
 * column gaps, and a fragment such as "UNIVERSITY OF CALIFORNIA" is itself a
 * perfectly good-looking name — which is what the parser returned. But a
 * phrase repeated on one line with a separator, on several lines, IS the
 * institution's name in full: read it from the tiles rather than from any
 * fragment. Undefined when no line repeats a university-like phrase. */
function watermarkName(lines: string[]): string | undefined {
  const seen = new Map<string, { count: number; text: string }>();
  for (const line of lines) {
    const parts = line.split(/\s*[•·|]\s*/).map((c) => c.replace(/\s+/g, ' ').trim());
    const counts = new Map<string, string>();
    const perLine = new Map<string, number>();
    for (const c of parts) {
      if (c.length < 8 || c.length > 80 || /\d/.test(c) || !STRONG_NAME_RE.test(c)) continue;
      const key = normalizeUniversity(c);
      if (key === '') continue;
      counts.set(key, c);
      perLine.set(key, (perLine.get(key) ?? 0) + 1);
    }
    for (const [key, n] of perLine) {
      if (n < 2) continue; // repeated on the SAME line — the tiling, not a header
      const e = seen.get(key) ?? { count: 0, text: counts.get(key)! };
      e.count += 1;
      seen.set(key, e);
    }
  }
  const best = [...seen.values()].filter((e) => e.count >= 2).sort((a, b) => b.count - a.count)[0];
  if (best === undefined) return undefined;
  // A school this file already knows by its acronym keeps its canonical
  // spelling (the ExternalCourses tab is keyed on it); otherwise Title Case.
  const known = NAME_ONLY_IN_IMAGE.find(([, name]) => normalizeUniversity(name) === normalizeUniversity(best.text));
  if (known) return known[1];
  return best.text
    .toLowerCase()
    .replace(/(^|[\s-])([a-zà-ÿ])/g, (_, sep: string, ch: string) => sep + ch.toUpperCase())
    .replace(/\b(Of|The|And|At|De|Da|Di|Du|Von|Van|Der|Del|La|Le)\b/g, (w) => w.toLowerCase())
    .replace(/^([a-z])/, (ch) => ch.toUpperCase());
}

/** Resolve a multi-campus system's campus (DGS 2026-09-12): the full campus
 * name when the record says which campus, else the system name plus
 * `campusSystem` so the preview asks. */
function withCampus(
  guess: { university?: string; universityGuessed?: true },
  lines: string[],
): { university?: string; universityGuessed?: true; campusSystem?: string; campus?: string } {
  const r = resolveCampus(guess.university, lines);
  if (r.system === undefined) return guess;
  // An acronym-recovered name stays a guess even once the campus is known.
  if (r.campus !== undefined) return { ...guess, university: r.campus.full, campusSystem: r.system.system, campus: r.campus.name };
  return { ...guess, university: r.system.system, campusSystem: r.system.system };
}

/** The institution that AWARDED the degree, when the "Degrees Awarded" block
 * names one (DGS 2026-09-13). Indiana University's registrar prints "Indiana
 * University Bloomington" in the header of every IU transcript — including
 * an IUPUI student's, whose degree block then says "Indiana University Purdue
 * University Indianapolis". The awarding school is the one the rules key on,
 * so a university-like name inside the block (the longest, digit-free one,
 * within ten lines of the heading) beats the header. A block headed "…by
 * other institutions" (UC San Diego) names somebody else and is skipped. */
function awardingInstitution(lines: string[]): string | undefined {
  for (let i = 0; i < lines.length; i++) {
    const flat = lines[i]!.replace(/\s+/g, ' ').trim();
    if (!DEGREES_AWARDED_HEADING_RE.test(flat) || /other\s+institution/i.test(flat)) continue;
    let best: string | undefined;
    for (let k = 1; k <= 10 && i + k < lines.length; k++) {
      const cand = lines[i + k]!
        .replace(/\s+/g, ' ')
        .replace(/\s+degree\s*$/i, '')
        // "Campus: Indiana University Indianapolis" (IU's degree block, 2026-09-26).
        .replace(/^(?:campus|institution|university|school|awarded\s+by|awarding\s+institution|name\s+of\s+institution)\s*:\s*/i, '')
        .trim();
      // The block ends where the transfer-credit block begins (2026-09-20):
      // "Transferred from: University of Florida" names the other school.
      if (TRANSFER_BANNER_RE.test(cand)) break;
      if (TRANSFER_FROM_RE.test(cand)) continue;
      if (cand.length < 8 || cand.length > 90 || /\d/.test(cand) || !STRONG_NAME_RE.test(cand) || SENTENCE_RE.test(cand) || /^(college|school|department|faculty|institute)\s+of\b/i.test(cand)) continue;
      if (best === undefined || cand.length > best.length) best = cand;
    }
    if (best !== undefined) return best;
  }
  return undefined;
}

/** The date that follows the degree-date label on a line — "Date of
 * Registration: 09.09.2019   Graduation Date: 30.06.2023" gives the second
 * (METU, 2026-09-26) — else the line's first date. */
function dateAfterLabel(line: string): string | undefined {
  const at = DEGREE_DATE_LINE_RE.exec(line)?.index;
  const tail = at === undefined ? line : line.slice(at);
  // dateOnLine reads "25/06/2022" month-first and returns an impossible month;
  // a day-first reading is then the one (University of Delhi, 2026-09-26).
  const sane = (d: string | undefined) => (d !== undefined && Number(d.slice(5, 7)) <= 12 ? d : undefined);
  return sane(dateOnLine(tail)) ?? isoOrEuropeanDate(gregorianPart(tail)) ?? sane(dateOnLine(line)) ?? isoOrEuropeanDate(gregorianPart(line));
}

/** The Gregorian half of a dual-calendar date: "1401/06/30 (2022/09/21)" →
 * "(2022/09/21)"; a line with no parenthesised date is returned whole. */
const gregorianPart = (text: string): string => /\(\s*(?:19|20)\d{2}[-/.]\d{1,2}[-/.]\d{1,2}\s*\)/.exec(text)?.[0] ?? text.replace(/\b1[34]\d{2}[-/.]\d{1,2}[-/.]\d{1,2}\b/g, ' ');

/** An ISO or day-first numeric date on a line (2026-09-26): "2023-10-27",
 * "27-Jun-19", "30.06.2023", "15/07/2023", "25/06/2022" — day-first when the
 * first number exceeds 12 or the separator is a dot or dash; a month above 12
 * is refused rather than written into the record. */
const ROMANCE_MONTHS: readonly (readonly string[])[] = [
  ['enero', 'janeiro', 'janvier', 'gennaio', 'jan'],
  ['febrero', 'fevereiro', 'février', 'fevrier', 'febbraio', 'feb', 'fev'],
  ['marzo', 'março', 'marco', 'mars', 'mar'],
  ['abril', 'avril', 'aprile', 'abr', 'apr'],
  ['mayo', 'maio', 'mai', 'maggio', 'may'],
  ['junio', 'junho', 'juin', 'giugno', 'jun'],
  ['julio', 'julho', 'juillet', 'luglio', 'jul'],
  ['agosto', 'août', 'aout', 'ago', 'aug'],
  ['septiembre', 'setembro', 'setiembre', 'septembre', 'settembre', 'sep', 'set'],
  ['octubre', 'outubro', 'octobre', 'ottobre', 'oct', 'out'],
  ['noviembre', 'novembro', 'novembre', 'nov'],
  ['diciembre', 'dezembro', 'décembre', 'decembre', 'dicembre', 'dic', 'dez', 'dec'],
];
export function isoOrEuropeanDate(text: string, dayFirst = false): string | undefined {
  const pad = (n: number) => String(n).padStart(2, '0');
  const valid = (y: number, m: number, d: number) => (y >= 1950 && y <= 2049 && m >= 1 && m <= 12 && d >= 1 && d <= 31 ? `${y}-${pad(m)}-${pad(d)}` : undefined);
  const iso = /\b((?:19|20)\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/.exec(text);
  if (iso) return valid(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  // "18 de marzo de 2023", "15 de dezembro de 2023", "5 luglio 2024", "12 juin 2023".
  const romance = /\b(\d{1,2})\s+(?:de\s+)?([a-zçéû]{3,10})\s+(?:de\s+)?((?:19|20)\d{2})\b/i.exec(text);
  if (romance) {
    const month = ROMANCE_MONTHS.findIndex((names) => names.some((n) => romance[2]!.toLowerCase().startsWith(n))) + 1;
    if (month > 0) return valid(Number(romance[3]), month, Number(romance[1]));
  }
  const mon = /\b(\d{1,2})[-/. ]([A-Za-z]{3})[a-z]*[-/. ,]+(\d{2,4})\b/.exec(text);
  if (mon) {
    const month = MONTHS.indexOf(mon[2]!.toUpperCase()) + 1;
    const y = mon[3]!.length === 2 ? 2000 + Number(mon[3]) : Number(mon[3]);
    return month === 0 ? undefined : valid(y, month, Number(mon[1]));
  }
  const num = /\b(\d{1,2})([-/.])(\d{1,2})\2((?:19|20)\d{2})\b/.exec(text);
  if (num) {
    const a = Number(num[1]);
    const b = Number(num[3]);
    const y = Number(num[4]);
    if (num[2] === '/' && a <= 12 && b > 12) return valid(y, a, b); // US month-first
    if (num[2] !== '/' || a > 12 || dayFirst) return valid(y, b, a); // day-first
    return undefined; // ambiguous "05/06/2023": dateOnLine's US reading stands
  }
  return undefined;
}

/** A date read through OCR noise (DGS 2026-09-16): "Aprill//09, Z2025/l" is
 * April 9, 2025 — the month by its first three letters, up to four stray
 * characters between the parts, a stray letter glued to the year. Only used
 * where a conferral is already established, so the looseness cannot invent
 * a date elsewhere. */
export function looseDateOnLine(line: string): string | undefined {
  const m = /\b([A-Za-z]{3,10})[^A-Za-z0-9]{0,4}(\d{1,2})[^0-9]{0,4}[A-Za-z]?(\d{4})\b/.exec(line);
  if (!m) return undefined;
  const month = MONTHS.indexOf(m[1]!.slice(0, 3).toUpperCase()) + 1;
  const day = Number(m[2]);
  const year = Number(m[3]);
  if (month === 0 || day < 1 || day > 31 || year < 1950 || year > 2049) return undefined;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** The institution and how sure we are of it: a name read from the text is
 * taken as printed; a name recovered from an acronym is only a suggestion, so
 * the preview lets the student correct it (2026-09-08). */
function guessedUniversity(lines: string[]): { university?: string; universityGuessed?: true } {
  // The watermark, when there is one, spells the name in full and beats any
  // fragment of itself (DGS 2026-09-12).
  const tiled = watermarkName(lines);
  if (tiled !== undefined) return { university: expandInstitutionAbbreviations(tiled) };
  // The school that awarded the degree beats the registrar's header (DGS
  // 2026-09-13: an IUPUI transcript is issued by IU Bloomington).
  const awarding = awardingInstitution(lines);
  if (awarding !== undefined) return { university: expandInstitutionAbbreviations(awarding) };
  // A name printed in the text wins — but only a STRONG one. The acronym of a
  // school that hides its name in an image beats a weak "… College" match,
  // because that match is as likely to come from a block naming somebody else
  // (UC San Diego lists "DEGREES AWARDED BY OTHER INSTITUTIONS" — DGS
  // 2026-09-09).
  const strong = expandName(guessUniversity(lines, false));
  if (strong !== undefined) return { university: strong };
  for (const [re, name] of NAME_ONLY_IN_IMAGE) {
    if (lines.some((line) => re.test(line))) return { university: name, universityGuessed: true };
  }
  const weak = expandName(guessUniversity(lines, true));
  return weak === undefined ? {} : { university: weak };
}

const expandName = (name: string | undefined): string | undefined => (name === undefined ? undefined : expandInstitutionAbbreviations(name));

/** Guess the institution from the first page's header lines: the earliest
 * digit-free line that names a university-like body. */
function guessUniversity(lines: string[], weak: boolean): string | undefined {
  // Strong words name an institution; "college" alone is weak (it also names a
  // division — "College of Science" — or a Banner field, "College : …").
  // "Inst." is how Georgia Tech's transcript abbreviates it (DGS 2026-09-08).
  const STRONG_RE =
    /universit|\binst(?:itute)?\.?\s+of\s+(?:tech|information\s+technology|science|engineering)|\binstitut\w*\s+(?:of\s+)?(?:science|technology|teknologi)|polytechnic|politecnico|polytechnique|politécnic|technical\s+university|technische\s+universität|école|hochschule|academy\s+of\s+higher\s+education|vidyapeeth|vishwavidyalaya|viswavidyalaya|universidad|università|universität|universiteit|universitas|대학교|大学/i;
  const WEAK_RE = /college/i;
  const DIVISION_RE = /^(college|school|department|faculty|institute)\s+of\b|\bcollege of\b|^(program|college|major|degree)\s*:/i;
  /** Candidate name cells: each line split at column gaps (a merged two-column
   * line yields the institution's own cell), cleaned, and filtered. */
  // "UNIVERSITY" on its own names nobody. UC San Diego's transcript tiles
  // "UNIVERSITY OF CALIFORNIA, SAN DIEGO •" across the page as a watermark,
  // and the text layer breaks it into fragments — one of which was read as the
  // institution (DGS 2026-09-09).
  const GENERIC_ONLY_RE = /^(the\s+)?(universit(y|e|à|ä|ies)|college|institute|school|campus)(\s+of)?[.,]?$/i;
  // A program name that happens to contain the word ("BACHELOR OF UNIVERSITY",
  // the ANU sample's award list, 2026-09-26) is not the institution.
  const DEGREE_PHRASE_RE = /^(?:bachelor|master|doctor)s?(?:'s)?\s+(?:of|in)\b|^(?:graduate|postgraduate)\s+(?:diploma|certificate)\b/i;
  // The same watermark, unbroken: a university phrase REPEATS on the line
  // ("UNIVERSITY OF CALIFORNIA … UNIVERSITY OF CALIFORNIA"). Two different
  // "University" phrases are a real name — "BINGHAMTON UNIVERSITY, STATE
  // UNIVERSITY OF NEW YORK" (DGS 2026-09-20; the word alone used to refuse it).
  const REPEATED_RE = /\b(universit\w*(?:\s+\w+){1,3})\b[\s\S]*\b\1\b/i;
  const clean = (c: string) =>
    c
      .replace(/\s{2,}/g, ' ')
      .replace(/\s*::\s*[A-Z][A-Za-z .]*?\s*-?\s*\d{3}\s?\d{3}\s*$/, '')
      .replace(/[\s,]+-\s*\d{3}\s?\d{3}\s*$/, '')
      .trim();
  const plausible = (c: string) =>
    c.length >= 4 && c.length <= 80 && !/\d{3,}/.test(c) && !DIVISION_RE.test(c) && !SENTENCE_RE.test(c) && !GENERIC_ONLY_RE.test(c) && !DEGREE_PHRASE_RE.test(c) && !REPEATED_RE.test(c) && !TRANSFER_FROM_RE.test(c);
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
      // "ANNA UNIVERSITY :: CHENNAI 600 025", "… TIRUCHIRAPPALLI - 620 015" (2026-09-26).
      .replace(/\s*::\s*[A-Z][A-Za-z .]*?\s*-?\s*\d{3}\s?\d{3}\s*$/, '')
      .replace(/[\s,]+-\s*\d{3}\s?\d{3}\s*$/, '')
      .replace(/^(unofficial|official)?\s*transcript\s*(of|from)?\s*/i, '')
      // A bare leading "UNOFFICIAL" ("UNOFFICIAL University at Buffalo
      // Transcript", DGS 2026-09-14).
      .replace(/^(unofficial|official)\s+/i, '')
      .replace(/^(the\s+)?office of the (university\s+)?registrar[,\s-]*/i, '')
      .replace(/[,\s—–-]*(the\s+)?office of the (university\s+)?registrar\s*$/i, '')
      .replace(/[\s—–-]*(unofficial|official)?\s*(student|academic)?\s*(records?|transcripts?|copy)\s*$/i, '')
      .replace(/[\s—–-]*(course\s+numbering|grade\s+scale|grading\s+(system|scale)|transcript\s+(guide|key|legend))\s*$/i, '')
      .replace(/^[\s?•·*|,.-]+|[\s?•·*|,.-]+$/g, '')
      .trim();
    return stripped; // empty when the cell was only record words ("Office of the University Registrar")
  };
  // Header first (the first 30 lines), then the rest of the document: Banner
  // official transcripts name the institution only on the legend page
  // (2026-09-05), so the header may hold nothing but divisions and programs.
  const passes: [string[], RegExp][] = weak
    ? [[lines.slice(0, 30), WEAK_RE]]
    : [
        [lines.slice(0, 30), STRONG_RE],
        [lines, STRONG_RE],
      ];
  for (const [scope, re] of passes) {
    for (const line of scope) {
      for (const cell of cells(line)) {
        if (!re.test(cell)) continue;
        const name = stripRecordWords(cell);
        // Stripping the record words can leave a generic remainder
        // ("University Registrar" → "University"), which names nobody.
        if (name !== '' && !GENERIC_ONLY_RE.test(name) && (re.test(name) || WEAK_RE.test(name))) return name;
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
  const legend = readLegend(lines);
  // A document with one unambiguously day-first date ("15/02/2023") prints
  // every slashed date day-first (Politecnico di Milano's "12/07/2023" is 12
  // July, not 7 December — 2026-09-26).
  const dayFirstDocument = lines.some((l) => /\b(?:1[3-9]|2\d|3[01])\/\d{1,2}\/(?:19|20)\d{2}\b/.test(l));
  let currentYear: number | undefined;
  let currentSeason: Season | undefined;
  // Course numbers: 2–5 digits, an optional dotted part (Johns Hopkins
  // "601.226"), up to three trailing letters (Buffalo "106LEC", Western
  // "3331A"); or an all-digit id ("30240233").
  // A capital may lead the number — Columbia's "W4111", Drexel's "I699"
  // (DGS 2026-09-20).
  // Widened 2026-09-26 (public keys): six digits (NTHU "542100"), a one- or
  // two-digit dotted part (UC Berkeley Extension "X479.2"), a campus digit after
  // the letter suffix (Toronto "108H1").
  const NUMBER_RE = /^([A-Z]?\d{2,6}(?:\.\d{1,3})?[A-Za-z]{0,3}\d?)\b(.*)$/;
  // Subjects run 2–10 letters: "CS", "COMPSCI", "STATISTC", "ENGLWRIT" (UMass
  // prints 7- and 8-letter subjects, DGS bug report 2026-09-06 — the earlier
  // cap of 6 dropped every such course).
  // The second branch is Johns Hopkins' dotted code, "EN.601.433" — division,
  // department, course (DGS 2026-09-08). Both dots are REQUIRED, so loosening
  // the ordinary separator to a full stop (which would turn "VOL.12" and
  // "MAY.2025" into course codes) is not needed.
  // More shapes from the DGS's 48-transcript set (2026-09-20), each kept as
  // printed: NYU "CSCI-GA.1170" and Indiana "CSCI-P 556" (subject, dash, one
  // or two letters, then dot or space); Wisconsin "COMP SCI 787" and BU "CAS
  // CS 505" (two-word subject); Columbia "COMS W4111" (a capital on the
  // number); CMU "15-513" (digits, dash, digits).
  // More shapes from the public-transcript research (2026-09-26), each gated
  // by the row needing a credit value or a grade after it as before:
  // Toronto "CSC108H1" (a campus digit after the suffix); NTHU "CS 542100"
  // (six digits); UCI "IN4MATX 209" (a digit inside the subject); Berkeley
  // Extension "COMPSCI X479.2" and "EL ENG X404" (a lettered number, dotted
  // section, two-word subject); BITS WILP "SS ZG519" (two letters glued to
  // the number); IISc "E0 251" (letter-digit subject); MIT "6.5840", "6.S898",
  // "6.THG" (department number, dot, subject — a title must follow, so a
  // totals value "12.000" never becomes a course); U Tokyo "4860-1005"; ETH
  // "252-0027-00L"; KU Leuven "H02A5A"; IIIT Hyderabad "CS1.301"; VTU / SRM
  // "18CS51", "18CSC301T" (a scheme year before the letters); UNAM's
  // zero-padded "0001" (any four-digit number outside the year range — a
  // 2000–2049 key is refused as a year, a known limit).
  const LEAD_CODE_RE =
    /^((?:[A-Z]{2,10}|[A-Z]{2,4}\d[A-Z]{2,6})[- ]?\d{2,6}(?:\.\d{1,3})?[A-Z]{0,3}\d?|[A-Z]{2,10}-[A-Z]{1,2}[. ]\d{2,5}[A-Z]{0,3}|[A-Z]{2,10} [A-Z]{2,4} \d{2,5}[A-Z]{0,3}|[A-Z]{2,10}(?: [A-Z]{2,4})? [A-Z]{1,2}\d{2,5}(?:\.\d{1,2})?[A-Z]?|[A-Z]\d \d{3,4}|\d{2}-\d{3}|[A-Z]{2,4}\.\d{2,5}\.\d{1,3}[A-Z]{0,3}|[A-Z]{2}\d\.\d{3}|\d{1,2}\.(?:\d{3,4}|[A-Z]{1,3}\d{0,3})[A-Z]?|\d{4}-\d{4}|\d{3}-\d{4}-\d{2}[A-Z]?|[A-Z]\d[A-Z0-9]{3}[A-Z]|\d{2}[A-Z]{2,6}\d{2,4}[A-Z]{0,2}|\d{5,10}|\d{4})\b[.:]?\s*(.*)$/;
  /** Codes that are digits with a dot or dash, or a four-digit key: taken only
   * when a wordy title follows, so a totals line ("12.000   3.000") or a bare
   * year never starts a row. */
  const DIGIT_LED_CODE_RE = /^(?:\d{1,2}\.|\d{4}$|\d{4}-\d{4}|\d{3}-\d{4}-\d{2}|[A-Z]\d[A-Z0-9]{3}[A-Z])/;
  // Codes are matched case-insensitively (2026-09-04 — some registrars print
  // "cs 5321"), so common words that would then look like codes are refused:
  // term headers and summary lines such as "Fall 2023  GPA 3.85" — and,
  // since the registrar keys that travel as a transcript's back page were
  // read (2026-09-26), the function words, document-structure words and
  // address words that precede a number in prose ("Since 1998, a scheme…",
  // "Clause 11.", "Suite 200", "Rs. 5000/-"). "OR" (operations research),
  // "ED" (education), "ART" and "LAW" are real subjects and stay allowed, and
  // so are "IN" (TUM's Informatik, UCI's "IN4MATX"), "ON" and "FOR"
  // (forestry) — those are refused only when printed in lowercase or
  // capitalised, the way prose prints them (`proseSubject`).
  const CODE_STOPWORDS_RE =
    /^(JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER|JAN|FEB|MAR|APR|JUN|JUL|AUG|SEP|SEPT|OCT|NOV|DEC|FALL|SPRING|SUMMER|WINTER|AUTUMN|TERM|SEM|SEMESTER|SESSION|QUARTER|YEAR|PAGE|TOTAL|TOTALS|SUBTOTAL|AVERAGE|GPA|CGPA|SGPA|CUM|ROOM|NO|NUM|NUMBER|CODE|TITLE|OVERALL|REGENTS|CUMULATIVE|INSTITUTION|TRANSFER|EARNED|ATTEMPTED|PASSED|CREDIT|CREDITS|HOUR|HOURS|UNIT|UNITS|POINT|POINTS|GRADE|GRADES|COURSE|SECTION|CHAPTER|LEVEL|CLASS|STUDENT|RECORD|GRADUATE|UNDERGRADUATE|ACADEMIC|DEGREE|PROGRAM|PLAN|COLLEGE|SCHOOL|CAMPUS|CATALOG|MAJOR|MINOR|DATE|PRINTED|ISSUED|STANDING|STATUS|VERSION|SINCE|AT|FROM|THAN|THE|AND|OF|TO|BY|WITH|INTO|UPON|PRE|POST|CLAUSE|ARTICLE|RULE|ITEM|STEP|NOTE|TABLE|FIGURE|FIG|ANNEX|APPENDIX|PART|OPEN|GRAND|AVANT|DEPUIS|BEFORE|AFTER|UNTIL|OVER|UNDER|ABOUT|PER|EACH|EVERY|ONLY|SEE|LINE|ROW|REV|PHONE|TEL|FAX|BOX|SUITE|ZIP|MUST|SHALL|ALSO|ABOVE|BELOW|WITHIN|WITHOUT|THROUGH|BETWEEN|DURING|WHEN|WHERE|WHICH|THAT|THIS|THESE|THOSE|THERE|THEIR|THEY|THEN|BOTH|SUCH|SAME|MORE|MOST|LESS|LEAST|LAST|NEXT|FIRST|SECOND|THIRD|FOURTH|FINAL|MAXIMUM|MINIMUM|APPROXIMATELY|AROUND|NEARLY|JUST|EVEN|STILL|YET|NOW|ALWAYS|NEVER|OFTEN|USUALLY|OUT|OFF|OWN|NOT|NON|YES|VIA|ETC|VS|WWW|HTTP|HTTPS|EMAIL|STREET|AVENUE|ROAD|FLOOR|CALL|VISIT|CONTACT|FEE|FEES|COST|USD|EUR|INR|RS|RUPEES|DOLLARS|AMOUNT|PRICE|COPY|COPIES|STUDENTS|CANDIDATES|EXAMPLE|SUPPOSE|UPPOSE|ROM|SECTIONS|PAGES|LINES|ITEMS|FORM|FORMS)$/;
  // "ID" was refused as a code until 2026-09-08 (it reads as "identifier"),
  // which dropped every Georgia Tech industrial-design course. It is a real
  // subject, so only the shape that is genuinely an identifier is refused: a
  // record number with no course title after it. A student id is long enough
  // that the code pattern (2-5 digits) does not match it anyway.
  const BARE_IDENTIFIER_RE = /^ID$/;
  /** Function words a subject cell can only be in prose when not set in
   * capitals: "in 2009", "For Y22", "on 24" (2026-09-26). */
  const PROSE_SUBJECT_RE = /^(?:in|on|for|as|or|an|if|is|it|no|so|up|we|he|do|be|my|us|at|to|by|of|the|and|than|since|from|with)$/i;
  const proseSubject = (original: string): boolean => PROSE_SUBJECT_RE.test(original) && original !== original.toUpperCase();
  const looksLikeIdentifierLine = (subject: string, tokens: string[]): boolean =>
    BARE_IDENTIFIER_RE.test(subject) && !tokens.some((tk) => /[A-Za-z]{3}/.test(tk));
  // A subject cell: "CS", "COMPSCI", "STATISTC", or a two-part code with a
  // space ("E E", "A A" at the University of Washington, 2026-09-05 — since
  // 2026-09-20 joinSpacedSubject turns those into "EE", "AA" first, so the
  // second alternative is now the multi-letter case such as "MATH SCI").
  const SUBJECT_RE = /^[A-Za-z]{2,10}$|^[A-Za-z]{1,4} [A-Za-z]{1,4}$|^[A-Za-z]{2,4}\d[A-Za-z]{2,6}$|^[A-Za-z]\d$/;
  // Subject cells with a column artefact (DGS 2026-09-20): RIT prints "CSCI-"
  // (the dash belongs to the code, "CSCI-603", split at the column); Clemson
  // prints a cross-listing, "CPSC (ECE)"; Rutgers' subject is numeric with
  // colons, "16:198:" (its code is "16:198:507", no space).
  const SUBJECT_TRAILING_DASH_RE = /-$/;
  const CROSS_LISTED_SUBJECT_RE = /\s*\([A-Za-z]{2,10}\)$/;
  const COLON_SUBJECT_RE = /^\d{1,2}:\d{3}:$/;
  /** Course subjects are printed in capitals (DGS, 2026-09-06). A short
   * subject may still be lowercase ("cs 5321", 2026-09-04), but a word of
   * seven letters or more counts as a subject only when it IS all capitals —
   * "Chapter 3" and "Building 12" are prose, "COMPSCI 501" is a course. */
  const subjectCase = (original: string): boolean => {
    const letters = original.replace(/[^A-Za-z]/g, '');
    return letters.length <= 6 || letters === letters.toUpperCase();
  };

  /** Scan the tokens after the course code: leading wordy tokens form the
   * title, then credits, a letter/coded grade — or (2026-09-04) a NUMERIC
   * grade (85, 9.5 — common outside the US), kept as rawGrade for the student
   * to map. A later unambiguous letter grade replaces a numeric guess. When
   * the title comes AFTER the numbers ("CSCI-549   B   4.0   Title", USC,
   * 2026-09-05) the wordy tail becomes the title. */
  const scanTokens = (rawTokens: string[], into: RowScan): void => {
    const tokens = joinGradePhrases(rawTokens);
    let titleDone = into.titleParts.length > 0 && (into.credits !== undefined || into.grade !== undefined || into.rawGrade !== undefined);
    const tail: string[] = [];
    let sawEcho = false;
    for (let k = 0; k < tokens.length; k++) {
      const token = tokens[k]!;
      const nextToken = tokens[k + 1];
      if (/^[*#@]$/.test(token) && (titleDone || into.titleParts.length > 0)) continue; // a repeat / exclusion mark beside a value or a title ("&" stays a title connector)
      // A single letter right after the code (2026-09-05): Georgia Tech's
      // "H" column flag before the title ("CS 8946   B Title …") is dropped
      // when a wordy title follows it; a grade before the credits
      // ("CSCI-549   B   4.0   Title", USC) is read as the grade.
      if (k === 0 && into.titleParts.length === 0 && /^[A-Z]$/.test(token) && nextToken !== undefined) {
        if (/[\p{L}]{2}/u.test(nextToken) && asCredits(nextToken) === undefined) continue;
      }
      // A bare integer followed by a decimal credit value is part of the
      // title ("College Calculus 1   4.000   4.000   D", 2026-09-05).
      // Narrowed 2026-09-26: a small integer (Calculus 1, Part 2) before a
      // one- or two-decimal value; a larger one ("Master Thesis 15   8.7") is
      // the credits and the decimal a grade. Banner's three-decimal credits
      // ("College Calculus 1   4.000") keep the wider rule.
      const integerInTitle =
        !titleDone &&
        /^\d{1,2}$/.test(token) &&
        nextToken !== undefined &&
        asCredits(nextToken) !== undefined &&
        (/^\d{1,2}[.,]\d{3}$/.test(nextToken) ||
          (/^\d{1,2}[.,]\d{1,2}$/.test(nextToken) && Number(token) <= 3 && tokens[k + 2] !== undefined && mapGrade(tokens[k + 2]!, legend) !== undefined));
      // A lone lowercase letter between title words is a word of the title
      // ("Introducción a la Programación", "Álgebra y Geometría" — 2026-09-26),
      // never the grade A that its capital would be.
      if (!titleDone && into.titleParts.length > 0 && /^[a-zà-ÿ]$/.test(token)) {
        into.titleParts.push(token);
        continue;
      }
      if (integerInTitle && into.titleParts.length > 0) {
        into.titleParts.push(token);
        continue;
      }
      // "Calculus 1   3   A-" (McGill, NTU — 2026-09-26): a one-digit integer
      // after title words, then INTEGER credits, then a grade-like token — the
      // digit is the title's.
      const integerBeforeIntegerCredits =
        !titleDone &&
        into.titleParts.length > 0 &&
        /^\d$/.test(token) &&
        nextToken !== undefined &&
        /^\d{1,2}$/.test(nextToken) &&
        asCredits(nextToken) !== undefined &&
        tokens[k + 2] !== undefined &&
        (mapGrade(tokens[k + 2]!, legend) !== undefined || /^[A-Z][A-Z+\-/0-9.]{0,3}\*?$/.test(tokens[k + 2]!) || /^\d{1,3}(?:[.,]\d{1,2})?$/.test(tokens[k + 2]!));
      if (integerBeforeIntegerCredits) {
        into.titleParts.push(token);
        continue;
      }
      const prevWord = into.titleParts[into.titleParts.length - 1];
      // "Calculus 1 for Science and Engineering   4.0   A-" (Northeastern,
      // 2026-09-20): a small integer between title words is a title word —
      // the next token is a wordy one that is no grade token.
      const integerBetweenWords =
        !titleDone &&
        prevWord !== undefined &&
        /^\d{1,2}$/.test(token) &&
        nextToken !== undefined &&
        /^[\p{L}]{3,}/u.test(nextToken) &&
        mapGrade(nextToken, legend) === undefined &&
        !/^[A-Z]{1,4}$/.test(nextToken);
      // "Lab for CS 2000   1.0   A" (Northeastern, 2026-09-20): a number that
      // with the capitalised word before it forms a course code stays in the
      // title, and the row's year is never read from it.
      const codeInTitle = !titleDone && prevWord !== undefined && /^[A-Z]{2,10}$/.test(prevWord) && /^\d{3,5}[A-Z]{0,2}$/.test(token) && asCredits(token) === undefined;
      // "Introduction to Programming, Part A   2.0   B+" (Lehigh, 2026-09-20):
      // a single letter after title words is a title word when the credits
      // AND a grade still follow it.
      const letterInTitle =
        !titleDone &&
        prevWord !== undefined &&
        /^[A-F]$/.test(token) &&
        nextToken !== undefined &&
        asCredits(nextToken) !== undefined &&
        tokens[k + 2] !== undefined &&
        mapGrade(tokens[k + 2]!, legend) !== undefined;
      if (integerBetweenWords || codeInTitle || letterInTitle) {
        into.titleParts.push(token);
        continue;
      }
      const asCr = asCredits(token);
      // "(P)" / "(F)" — Villanova prints pass/fail results in parentheses
      // (public keys, 2026-09-26); the letters inside are the token.
      const bareToken = /^\([A-Za-z]{1,2}[+-]?\)$/.test(token) ? token.slice(1, -1) : token;
      const creditsFollow = nextToken !== undefined && asCredits(nextToken) !== undefined;
      const asGr = mapGrade(bareToken, legend, titleDone || into.credits !== undefined || creditsFollow);
      const gradeFirst =
        into.titleParts.length === 0 && into.grade === undefined && asGr !== undefined && nextToken !== undefined && asCredits(nextToken) !== undefined;
      if (gradeFirst) {
        into.grade = asGr;
        titleDone = true;
        continue;
      }
      // Grade-shaped: a short capitalised token the app cannot map ("W", "T",
      // "ABS", "AA"), kept as printed for the student. Since 2026-09-26 also
      // with one trailing star (BU "P*", Penn "I*", IIT Kanpur "A*"), a zero
      // prefix (Binghamton's excluded first attempt "0F"), a fraction mark,
      // the Italian 30 with honours, a grade word or a CJK grade character.
      const upper = bareToken.toUpperCase();
      const gradeShaped =
        asGr === undefined &&
        // Printed in capitals, as grades are ("to" in a title's tail is not one).
        ((/^[A-Z][A-Z+\-/0-9.]{0,3}\*?$/.test(upper) && bareToken === upper && bareToken.length <= 5) ||
          /^0[A-F][+-]?$/.test(upper) ||
          bareToken === 'Fx' || // KTH's fail-with-resit
          FRACTION_MARK_RE.test(bareToken) ||
          LODE_RE.test(bareToken) ||
          (titleDone && GRADE_WORD_RE.test(bareToken)) ||
          (titleDone && CJK_GRADE_RE.test(bareToken)));
      const numericGrade =
        asGr === undefined && /^\d{1,3}(?:[.,]\d{1,2})?$/.test(token) && Number(token.replace(',', '.')) <= 100;
      // A title token is wordy — or a bare connector ("&", "/", "-", ":")
      // between wordy tokens ("Econ & Priv Issues in Big Data", 2026-09-05).
      const wordy = /[\p{L}]/u.test(token) && !/^\(?\d/.test(token) && !FRACTION_MARK_RE.test(token) && !LODE_RE.test(token);
      const connector = into.titleParts.length > 0 && /^[&/+:\-–—]$/.test(token);
      if (!titleDone && asCr === undefined && asGr === undefined && (connector || wordy)) {
        into.titleParts.push(token);
        continue;
      }
      titleDone = true;
      if (into.credits === undefined && asCr !== undefined) {
        into.credits = asCr;
        into.creditsText = token;
        continue;
      }
      if (asGr !== undefined && into.grade === undefined) {
        // A letter grade beats a numeric guess ("3.00   3.00   A"); a pass/fail
        // token does not (Sydney "66   CR": the mark is the grade, CR its
        // band — 2026-09-26), and neither beats a grade-shaped token already
        // read.
        const passFail = isPassFailToken(bareToken, legend);
        if (into.rawGrade === undefined || !passFail) {
          into.grade = asGr;
          into.rawGrade = undefined;
        }
        continue;
      }
      if (into.grade === undefined && into.titleParts.length > 0) {
        // The Earned column repeats the credits ("3.00   3.00   A   12.00",
        // 2026-09-05) — but only in the credits' own printed format with
        // another token after it: a lone "3.0" after credits of "3", or the
        // last number of the row, is a grade on the 4.0 scale (Michigan
        // State, Washington) or the Danish 7-step scale (DTU) — 2026-09-26.
        const value = Number(token.replace(',', '.'));
        const sameFormat = into.creditsText !== undefined && decimalsOf(token) === decimalsOf(into.creditsText);
        const echoesCredits = into.credits !== undefined && value === into.credits && sameFormat && nextToken !== undefined;
        // "3.00   0.00   W" (PeopleSoft, a failed / withdrawn / in-progress
        // row): zero earned right after the credits is that column, never a
        // grade, when a grade-like token still follows (2026-09-26).
        const zeroEarned =
          value === 0 && tokens[k - 1] === into.creditsText && tokens.slice(k + 1).some((t) => mapGrade(t, legend) !== undefined || /^[A-Z][A-Z+\-/0-9.]{0,3}\*?$/.test(t));
        if (echoesCredits || zeroEarned) sawEcho = true;
        // A grade-shaped token replaces a numeric guess only when that guess
        // looks like a points value ("12.00   W"); a printed MARK keeps its
        // number and the band beside it is dropped (Sydney "78   DI", 2026-09-26).
        else if (gradeShaped && (into.rawGrade === undefined || decimalsOf(into.rawGrade) >= 2)) into.rawGrade = /^W\d$/.test(bareToken) ? 'W' : bareToken;
        else if (into.rawGrade === undefined && numericGrade && !sawEcho) into.rawGrade = token; // after "earned" comes "points"
      }
      if (wordy && !gradeShaped && token.length > 1) tail.push(token);
    }
    if (into.titleParts.length === 0 && tail.length > 0 && (into.credits !== undefined || into.grade !== undefined)) {
      into.titleParts = tail;
    }
  };

  /** The column order of the course table being read, from its header line
   * (readColumnHeader, 2026-09-26). Kept until the next header; the tables of
   * one transcript share a layout, and a legend page that looks like a header
   * is harmless (no course rows follow it).
   * Only the columns AFTER the title are matched against a row's tail; the
   * cells before the code (a serial number, a date) are leadCode's business,
   * and a level or flag cell between the code and the title is consumed
   * first. */
  let columnKinds: ColumnKind[] | undefined;
  const numericToken = (t: string) => /^-?\d{1,3}(?:[.,]\d{1,3})?$/.test(t);
  const gradeLike = (t: string): boolean => {
    const bare = /^\([A-Za-z]{1,2}[+-]?\)$/.test(t) ? t.slice(1, -1) : t;
    if (mapGrade(bare, legend) !== undefined) return true;
    const upper = bare.toUpperCase();
    if (/^[A-Z][A-Z+\-/0-9.]{0,3}\*?$/.test(upper) && bare === upper && bare.length <= 5) return true;
    if (/^0[A-F][+-]?$/.test(upper) || FRACTION_MARK_RE.test(bare) || LODE_RE.test(bare) || GRADE_WORD_RE.test(bare) || CJK_GRADE_RE.test(bare) || bare === 'Fx' || /^(?:Ab|Abs|Absent)$/i.test(bare)) return true;
    return numericToken(bare) && Number(bare.replace(',', '.')) <= 100;
  };
  const fits = (kind: ColumnKind, t: string): boolean => {
    if (PLACEHOLDER_TOKEN_RE.test(t)) return true; // an empty cell printed as "-"
    switch (kind) {
      case 'credits':
      case 'ects':
        return asCreditsWide(t) !== undefined;
      case 'attempted':
      case 'earned':
      case 'points':
      case 'workload':
      case 'duration':
        return numericToken(t);
      case 'mark':
        return numericToken(t) || /^\d{1,3}(?:[.,]\d{1,2})?\/\d{1,3}$/.test(t) || /^[A-Z]{1,3}$/.test(t) || /^\d{1,3}(?:[.,]\d+)?%$/.test(t);
      case 'grade':
        return gradeLike(t);
      case 'level':
        return /^(?:UG|UGRD|GR|GRAD|U|G|L|V|M|[4-8]|undergraduate|graduate|postgraduate|masters?|doctoral)$/i.test(t);
      case 'term':
        return /^(?:\d{4}(?:-\d)?|[A-Z]\d{2}|S1S2|A1A2|S[12]|A[12]|(?:fall|spring|summer|autumn|winter)\w*|\d{1,2}[-/.]\w{2,3}[-/.]\d{2,4})$/i.test(t);
      case 'flag':
        // A short mark ("R", "H", "*", "ORD") or a course-type word — never a
        // word that could be part of the title ("IT Risk Management").
        // …or an attempt number, a percentage attendance, a status word.
        return (
          /^[A-Z][A-Z0-9*#&+-]{0,3}$/.test(t) ||
          /^[*#&+-]$/.test(t) ||
          /^\d$/.test(t) ||
          /^\d{1,3}(?:[.,]\d+)?%$/.test(t) ||
          mapGrade(t, legend) !== undefined ||
          /^(?:compulsory|elective|core|lab|theory|practical|honou?rs|regular|repeat|optional|major|minor|general|open|basic|advanced|obligatorio|optativo|opcional|obrigat[oó]ria|optativa|pflicht|wahl|ord|ext|ex|course|matriculado|trancado|cursando|aprovad[oa]|reprovad[oa])$/i.test(t)
        );
      default:
        return false;
    }
  };
  /** Match a row's tokens against the header's columns: the longest title
   * whose remaining tokens all land in a column, preferring the fewest empty
   * columns. Fills `into` and returns the level cell, or undefined when the
   * layout does not fit (the position-free scan then runs as before). */
  const scanWithMap = (rawTokens: string[], into: RowScan): { level?: Level; year?: number; season?: Season } | undefined => {
    if (!columnKinds) return undefined;
    const tokens = joinGradePhrases(rawTokens);
    const titleAt = columnKinds.indexOf('title');
    const codeAt = columnKinds.indexOf('code');
    // Only a level cell may sit between the code and the title (Banner
    // Self-Service); a header with no code column has nothing before the title.
    const pre = codeAt >= 0 ? columnKinds.slice(codeAt + 1, titleAt).filter((k) => k === 'level') : [];
    const post = columnKinds.slice(titleAt + 1).filter((k) => k !== 'code' && k !== 'serial');
    if (post.length === 0) return undefined;
    // Cells between the code and the title (Banner Self-Service's Level).
    let start = 0;
    const preValues: Partial<Record<ColumnKind, string>> = {};
    for (const kind of pre) {
      const t = tokens[start];
      if (t !== undefined && fits(kind, t) && !/^[\p{L}]{3,}/u.test(t)) {
        preValues[kind] = t;
        start += 1;
      }
    }
    let best: { s: number; values: (string | undefined)[]; blanks: number } | undefined;
    for (let s = tokens.length - 1; s >= start; s--) {
      const tail = tokens.slice(s);
      const values: (string | undefined)[] = [];
      let i = 0;
      let blanks = 0;
      for (const kind of post) {
        // A repeat / exclusion mark beside a value ("C- #", "A *") belongs to
        // no column; step over it.
        while (tail[i] !== undefined && /^[*#@]$/.test(tail[i]!)) i += 1;
        const t = tail[i];
        // A numeric token that would be the grade is the points cell when it
        // is the row's last token and a points column follows (a gradeless
        // row: "3.00   3.00   12.00").
        const lastNumeric = kind === 'grade' && t !== undefined && numericToken(t) && i === tail.length - 1 && post.slice(post.indexOf(kind) + 1).includes('points');
        // A letter token under a MARK column, with a grade column still to
        // come, is that column's (Toronto "0.50   SDF": the mark is blank).
        const gradeFollows = kind === 'mark' && t !== undefined && /^[A-Za-z]/.test(t) && post.slice(post.indexOf(kind) + 1).includes('grade');
        if (t !== undefined && fits(kind, t) && !lastNumeric && !gradeFollows) {
          values.push(PLACEHOLDER_TOKEN_RE.test(t) ? undefined : t);
          i += 1;
          // "1 semester", "2 years" — the duration's unit word goes with it.
          if (kind === 'duration' && tail[i] !== undefined && /^(?:semesters?|years?|terms?|weeks?|months?|quarters?)$/i.test(tail[i]!)) i += 1;
        } else {
          values.push(undefined);
          blanks += 1;
        }
      }
      // Every token must land in a column — except a trailing one-letter flag
      // the header does not name (WashU's repeat "R" after the grade).
      const leftover = tail.slice(i);
      // …or the rest of a two-word type cell ("Core Course") when the last
      // column is such a cell.
      const restOfFlag = post[post.length - 1] === 'flag' && leftover.every((t) => /^[\p{L}]+$/u.test(t));
      if (!restOfFlag && (leftover.length > 1 || (leftover.length === 1 && !/^[A-Z*#&@]$/.test(leftover[0]!)))) continue;
      // A status row prints no mark ("CLASS 5   1   ABN *", the ANU sample,
      // 2026-09-26): reading the title's trailing number as the credits and
      // the credits as a one-digit mark beside an unmapped status fills every
      // column, so that fit costs one blank too — and the longer title wins
      // the tie, as it does everywhere else.
      const markAt = post.lastIndexOf('mark');
      const gradeAt = post.indexOf('grade');
      // Only where the mark column FOLLOWS the credits column (units, mark,
      // grade): with the marks before the credits (JNTU "… Lab   0   1.5   Ab")
      // a one-digit mark is the absent student's zero.
      const creditsAt = post.findIndex((k) => k === 'credits' || k === 'attempted' || k === 'earned' || k === 'ects');
      const oneDigitMark = markAt >= 0 && gradeAt >= 0 && creditsAt >= 0 && creditsAt < markAt && values[markAt] !== undefined && /^\d$/.test(values[markAt]!) && values[gradeAt] !== undefined && !numericToken(values[gradeAt]!) && mapGrade(values[gradeAt]!, legend) === undefined;
      const cost = blanks + (oneDigitMark ? 1 : 0);
      if (best === undefined || cost < best.blanks) best = { s, values, blanks: cost };
    }
    if (!best) return undefined;
    // A header that names fewer columns than the rows print (a term block
    // whose header dropped CREDITS while its rows still carry "3.0") would
    // leave the credits inside the title: hand such a row to the
    // position-free scan instead.
    const title = tokens.slice(start, best.s);
    const creditsFound = post.some((k, i) => (k === 'credits' || k === 'ects' || k === 'attempted' || k === 'earned') && best!.values[i] !== undefined);
    if (!creditsFound && (title.some((t) => /^\d{1,2}[.,]\d{1,3}$/.test(t)) || (title.length > 1 && /^\d{1,2}$/.test(title[title.length - 1]!)))) return undefined;
    const value = (kind: ColumnKind, nth = 0): string | undefined => {
      let seen = 0;
      for (let i = 0; i < post.length; i++) if (post[i] === kind) { if (seen === nth) return best!.values[i]; seen += 1; }
      return undefined;
    };
    const creditsValues = post.map((k, i) => (k === 'credits' ? best!.values[i] : undefined)).filter((t): t is string => t !== undefined);
    // The local credits first; ECTS only where nothing else is printed (METU
    // "Credit   Grade   ECTS"). Two credits cells are summed only when they are
    // the theoretical and practical hours (Sharif "3   0").
    const theoryPractical = lastHeaderCells.filter((c) => /^(?:theoretical|practical|créditos\s+(?:aula|trabalho))$/i.test(c.replace(/\s*\(.*\)\s*$/, ''))).length >= 2;
    const creditsToken =
      theoryPractical && creditsValues.length > 1 && creditsValues.every((t) => asCreditsWide(t) !== undefined)
        ? String(creditsValues.reduce((sum, t) => sum + (asCreditsWide(t) ?? 0), 0))
        : (value('credits') ?? value('attempted') ?? value('earned') ?? value('ects'));
    const lastMark = post.includes('mark') ? value('mark', post.filter((k) => k === 'mark').length - 1) : undefined;
    let gradeToken = value('grade') ?? (post.includes('grade') ? undefined : lastMark);
    // A pass/fail result or an unmapped band beside a printed mark ("93   P",
    // "66   CR", "78   DI"): the mark is the grade, the band derives from it
    // (GT05, 2026-09-26). A letter grade the app knows (HUST "8.7   B+") wins.
    let band: string | undefined;
    if (gradeToken !== undefined && lastMark !== undefined && numericToken(lastMark) && Number(lastMark.replace(',', '.')) > 0 && (isPassFailToken(gradeToken, legend) || mapGrade(gradeToken, legend) === undefined)) {
      // The band stays beside the mark in what the student is shown ("62 CR",
      // "77 D" — the ANU sample, 2026-09-26): the mark alone reads as a
      // grade on an unknown scale.
      if (gradeToken !== lastMark && /^[A-Za-z][A-Za-z+-]{0,3}$/.test(gradeToken)) band = gradeToken;
      gradeToken = lastMark;
    }
    if (creditsToken === undefined && gradeToken === undefined) return undefined;
    // A term cell on the row (U Tokyo "2022   S1S2", DTU "E23", UNAM "2019-1",
    // a result date) — read after the values are known.
    const termCells = post.map((k, i) => (k === 'term' ? best!.values[i] : undefined)).filter((t): t is string => t !== undefined);
    const rowTerm = rowTermOf(termCells);
    into.titleParts = title.filter((t) => !/^[*#@]$/.test(t));
    if (creditsToken !== undefined) {
      into.credits = asCreditsWide(creditsToken);
      into.creditsText = creditsToken;
    }
    if (gradeToken !== undefined) {
      const bare = /^\([A-Za-z]{1,2}[+-]?\)$/.test(gradeToken) ? gradeToken.slice(1, -1) : gradeToken;
      const mapped = mapGrade(bare, legend);
      if (mapped !== undefined) into.grade = mapped;
      else into.rawGrade = /^W\d$/.test(bare) ? 'W' : band === undefined ? bare : `${bare} ${band}`;
    }
    // A status word beside a one-letter grade decides it (TUM "B   bestanden":
    // B is bestanden, a pass, not the letter B — 2026-09-26).
    const statusValues = post.map((k, i) => (k === 'flag' ? best!.values[i] : undefined)).filter((t): t is string => t !== undefined);
    const germanStatus = statusValues.find((t) => /^(?:bestanden|nicht bestanden|nb)$/i.test(t));
    const statusGrade = germanStatus === undefined ? undefined : mapGrade(germanStatus, legend);
    if (statusGrade !== undefined && gradeToken !== undefined && /^[BU]$/.test(gradeToken)) {
      into.grade = statusGrade;
      into.rawGrade = undefined;
    }
    // A status cell saying the course is still running, with no grade printed
    // (USP "MA" — matriculado; "cursando"; "em curso"): in progress.
    if (gradeToken === undefined && statusValues.some((t) => /^(?:MA|matriculad[oa]|cursando|em\s+curso|en\s+curso|inscrit[oa]|enrolled|in\s+progress)$/i.test(t))) into.grade = 'IP';
    const levelToken = preValues.level ?? value('level');
    const level: Level | undefined = levelToken === undefined ? undefined : /^(?:UG|UGRD|U|L|[4-6]|undergraduate)$/i.test(levelToken) ? 'undergraduate' : 'graduate';
    return { level, ...rowTerm };
  };
  /** The term a row's own cells name (2026-09-26): a year with a semester
   * mark (U Tokyo "2022 S1S2" / "A1A2"), DTU's exam period ("E23" = efterår
   * = fall 2023, "F24" = forår = spring 2024), UNAM's "2019-1" (the first
   * semester of the 2019 academic year, which begins in August 2018) and
   * "2019-2", Uniandes' "2019-10 / -20 / -19" (spring / fall / summer), or a
   * full date, which termOfDate places. */
  const rowTermOf = (cells: string[]): { year?: number; season?: Season } => {
    let year: number | undefined;
    let season: Season | undefined;
    for (const c of cells) {
      const y = /^((?:19|20)\d{2})$/.exec(c);
      if (y) { year = Number(y[1]); continue; }
      const jp = /^(S|A)(?:1|2|1S2|1A2)?$/.exec(c);
      if (jp && /^(?:S1S2|A1A2|S1|S2|A1|A2)$/.test(c)) { season = jp[1] === 'S' ? 'spring' : 'fall'; continue; }
      const dk = /^([EF])(\d{2})$/.exec(c);
      if (dk) { year = 2000 + Number(dk[2]); season = dk[1] === 'E' ? 'fall' : 'spring'; continue; }
      const mx = /^((?:19|20)\d{2})-([12])$/.exec(c);
      if (mx) { year = mx[2] === '1' ? Number(mx[1]) - 1 : Number(mx[1]); season = mx[2] === '1' ? 'fall' : 'spring'; continue; }
      const co = /^((?:19|20)\d{2})-(10|20|19)$/.exec(c);
      if (co) { year = Number(co[1]); season = co[2] === '10' ? 'spring' : co[2] === '20' ? 'fall' : 'summer'; continue; }
      // Brazil's "1S/2022", "1º Sem/2019", "2022/1": the numbered half-year, in
      // calendar order.
      const br = /^([12])\s*[ºª°]?\s*(?:S|Sem\.?)?\s*\/\s*((?:19|20)\d{2})$/i.exec(c) ?? /^((?:19|20)\d{2})\s*\/\s*([12])$/.exec(c);
      if (br) { const half = /^[12]/.test(br[1]!) ? br[1]! : br[2]!; year = Number(/^[12]$/.test(br[1]!) ? br[2] : br[1]); season = half === '1' ? 'spring' : 'fall'; continue; }
      // A result date places the row only when no term header does (VTU's
      // "Announced on" is months after the semester).
      const sane = (d: string | undefined) => (d !== undefined && Number(d.slice(5, 7)) <= 12 ? d : undefined);
      const date = currentYear === undefined || !headerSeasonExplicit ? (isoOrEuropeanDate(c, dayFirstDocument) ?? sane(dateOnLine(c))) : undefined;
      if (date) { const t = termOfDate(date); year = t.year; season = t.season; }
    }
    return { ...(year !== undefined ? { year } : {}), ...(season !== undefined ? { season } : {}) };
  };

  /** The course code at the start of a line's first (or second) cell —
   * case-insensitive, stopword-guarded. Returns the UPPERCASED code and the
   * rest of the line's tokens (original case, for the title). */
  /** A date cell that may open a row before the code (Peradeniya "27-Jun-19
   * GP101 English I A 3", 2026-09-26): dd-Mon-yy, dd/mm/yyyy, yyyy-mm-dd. */
  const LEAD_DATE_RE = /^(?:\d{1,2}[-/.][A-Za-z]{3}[-/.]\d{2,4}|\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}|\d{4}-\d{2}-\d{2})$/;
  const leadCode = (flat: string): { code: string; tokens: string[]; date?: string; preCell?: string } | undefined => {
    // A stray 1–2-letter security mark merged onto the row's start ("XK ITWS
    // 1882 …", 2026-09-05) is skipped when a real code follows it. Three
    // letters are a college prefix that belongs to the code — BU's "CAS CS
    // 505" (DGS 2026-09-20) — so the mark is now at most two letters.
    // "C S 50300" reads as "CS 50300" (DGS 2026-09-20; see joinSpacedSubject).
    const cells = joinSpacedSubject(flat).replace(/^[A-Z]{1,2}\s+(?=[A-Za-z]{2,10}(?: [A-Za-z]{1,4})?\s+\d)/, '').split(/\s{2,}/);
    // Banner / PeopleSoft layouts print the subject and the number in SEPARATE
    // columns ("CS   455   Data Communication   3.00 A   12.00"; Western's
    // "COMPSCI   3331A Title …" keeps the title in the number's cell; Johns
    // Hopkins leads with a 2-letter division cell) — so the code spans two
    // adjacent cells, starting at the first or second cell (2026-09-05;
    // stopword-guarded like the rest).
    for (const i of [0, 1] as const) {
      const rawSubjectCell = cells[i];
      const numberCell = cells[i + 1];
      if (rawSubjectCell === undefined || numberCell === undefined || cells.length < i + 3) break;
      if (i === 1 && !/^[A-Za-z]{1,3}$/.test(cells[0]!) && !LEAD_DATE_RE.test(cells[0]!)) break; // only a short division/security cell, or a date, may precede
      const subjectCell = rawSubjectCell.replace(CROSS_LISTED_SUBJECT_RE, '').replace(SUBJECT_TRAILING_DASH_RE, '');
      const colonSubject = COLON_SUBJECT_RE.test(subjectCell);
      if (!colonSubject && (!SUBJECT_RE.test(subjectCell) || !subjectCase(subjectCell) || proseSubject(subjectCell))) continue;
      const num = NUMBER_RE.exec(numberCell);
      if (!num) continue;
      const subject = subjectCell.toUpperCase();
      if (CODE_STOPWORDS_RE.test(subject.replace(/ /g, ''))) continue;
      const tokens = tokensOf([num[2]!.trim(), ...cells.slice(i + 2)]);
      if (looksLikeIdentifierLine(subject, tokens)) continue;
      const date = i === 1 && LEAD_DATE_RE.test(cells[0]!) ? cells[0] : undefined;
      return { code: colonSubject ? `${subject}${num[1]!}` : `${subject} ${num[1]!.toUpperCase()}`, tokens, ...(date ? { date } : {}), ...(i === 1 ? { preCell: cells[0] } : {}) };
    }
    for (const idx of [0, 1] as const) {
      const cell = cells[idx];
      if (cell === undefined) break;
      if (idx === 1 && /[a-z]{3}/i.test(cells[0]!) && !LEAD_DATE_RE.test(cells[0]!)) break; // wordy first cell → not a leading term/date
      const m = LEAD_CODE_RE.exec(cell.toUpperCase());
      if (!m) continue;
      const code = m[1]!;
      // A bare year or a year range is not a course code: on its own it is a
      // term line; as a first cell ("2022/2023   052513   …", Politecnico di
      // Milano) the code may follow it (2026-09-26).
      if (/^(19|20)\d{2}(?:-(19|20)\d{2})?$/.test(code)) {
        if (idx === 0 && cells.length > 1 && /^(?:19|20)\d{2}(?:[-–/](?:19|20)?\d{2})?$/.test(cell)) continue;
        return undefined;
      }
      if (/^[A-Z]{2,10} (19|20)\d{2}$/.test(code) && m[2]!.trim() === '' && cells.length === 1) return undefined; // "IAP 2023" — a term, not a course
      // A digit-led or mixed code must be followed by a title (letters), or it
      // is a number on a totals line.
      // The rest of the cell in its printed case (the match ran on the
      // upper-cased cell; the code is length-stable).
      const restText = [cell.slice(cell.length - m[2]!.length), ...cells.slice(idx + 1)].join(' ');
      if (DIGIT_LED_CODE_RE.test(code) && !/[\p{L}]{2}/u.test(restText)) return undefined;
      if (proseSubject(cell.slice(0, code.length).replace(/[^A-Za-z].*$/, ''))) return undefined;
      // …and that title is printed with a capital or in another script — a
      // number-only code before lowercase prose is a grade-point table
      // ("B+   3.333 per credit", Delaware's key, 2026-09-26).
      if (DIGIT_LED_CODE_RE.test(code) && !/[\p{Lu}]|[^\x00-\x7F]/u.test(restText)) return undefined;
      // A course-number RANGE from a key ("0000-0999 … 5000-5999 Master's",
      // UConn) and a number the line continues ("199719/98", NUS) are not codes.
      if (/^\d000-\d999$/.test(code)) return undefined;
      if (/^\d{5,10}$/.test(code) && cell[code.length] === '/') return undefined;
      // Every word of the subject is tested ("TERM GPA 12" is no course).
      if (code.split(/[^A-Z]+/).some((w) => CODE_STOPWORDS_RE.test(w))) return undefined;
      if (!subjectCase(cell.slice(0, code.length).replace(/\d.*$/, ''))) return undefined; // "Chapter 3": prose, not a code
      const rest = cell.slice(cell.length - m[2]!.length); // same indices — toUpperCase is length-stable for these codes
      const tokens = tokensOf([rest, ...cells.slice(idx + 1)]);
      if (looksLikeIdentifierLine(code.replace(/[^A-Z]/g, ''), tokens)) return undefined;
      const date = idx === 1 && LEAD_DATE_RE.test(cells[0]!) ? cells[0] : undefined;
      return { code, tokens, ...(date ? { date } : {}), ...(idx === 1 ? { preCell: cells[0] } : {}) };
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
  // Banner's "COURSES IN PROGRESS" section (public keys, 2026-09-26): its rows
  // print credits and no grade — they are in progress until the next term
  // header or section heading, as the Notre Dame parser reads its own.
  let inProgressBlock = false;
  const IN_PROGRESS_HEADING_RE = /^\s*(?:\*+\s*)?(?:courses?\s+in\s+progress|(?:work\s+)?in[- ]progress(?:\s+courses?)?)\b/i;
  const SECTION_HEADING_RE = /^\s*(?:\*+\s*)?(?:transcript\s+totals|total\s+institution|totals?\b|overall\b|cumulative\b|end\s+of\s+(?:transcript|record)|transfer\s+credit|degrees?\s+awarded|academic\s+standing)/i;
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
  const CELL_LEVEL_RE =
    /^(?:academic\s+)?career\s*:?\s*(undergraduate|graduate|postgraduate|masters?|doctoral)\b|^program(?:me)?\s*:?\s*(?:master'?s|doctoral|ph\.?d\.?|graduate|postgraduate)\s+(?:program(?:me)?|course|degree)|^(graduate|postgraduate)\s+student'?s?\s+(?:work\s+)?record\b|^(?:p[oó]s-gradua[çc][aã]o|posgrado|mestrado|maestr[ií]a|doutorado|doctorado)\b|^(?:fheq|scqf|nfq)?\s*level\s*:?\s*([4-8])\b/i;
  const LEVEL_TOTALS_RE = /\b(undergraduate|graduate)\s+(?:semester\s+)?totals\b/i;
  const ROW_LEVEL_RE = /^(UG|UGRD|GR|GRAD)$/;
  const levelWord = (w: string): Level => (w.toLowerCase() === 'undergraduate' ? 'undergraduate' : 'graduate');
  let blockLevel: Level | undefined;
  let retroLevel: Level | undefined;
  let bachelorsConferredOn: string | undefined;
  let bachelorsConferred: true | undefined;
  let bachelorsNamed = false; // a bachelor's is named at all — dated or not (2026-09-08)
  let recentDegreeDate: { date: string; at: number } | undefined; // a dated "Degree Completion Date:" line, in case the degree name follows
  const rowLevels: (Level | undefined)[] = [];
  // Degrees (2026-09-05): a "Degrees Awarded" block makes the degree lines
  // under it conferred even without an award word on the line itself (USC,
  // Duke, Western); a "Degree and Date Conferred" table header does the same
  // for the line below it (Johns Hopkins).
  let degreeBlock = 0; // lines of a degrees-awarded block still to read
  let blockConferredGrad = false;
  type Lead = ReturnType<typeof leadCode>;
  /** Block and term tracking for one line: which transfer block the scan is
   * in, and the year, season and level the next course rows inherit. */
  const trackTermAndTransfer = (line: string): void => {
    // Transfer blocks: Banner's "TRANSFER CREDIT ACCEPTED BY …" until
    // "INSTITUTION CREDIT"; PeopleSoft's "Term  Course  Transfer Course …"
    // table (2026-09-05, a scanned community-college block) until the next
    // term header.
    if (TRANSFER_BANNER_RE.test(line)) transferBlock = 'banner';
    else if (TRANSFER_TABLE_RE.test(line)) transferBlock = 'table';
    // PeopleSoft's block (public keys, 2026-09-26): a bare "Transfer Credits"
    // heading, "Transfer Credit from <school>", "Applied Toward … Program";
    // closed by "Course Trans GPA" / "Transfer Totals" or the next term header.
    else if (TRANSFER_PEOPLESOFT_RE.test(line)) transferBlock = 'table';
    else if (INSTITUTION_CREDIT_RE.test(line) || TRANSFER_END_RE.test(line) || TRANSFER_TOTALS_RE.test(line)) transferBlock = undefined;
    // Track the nearest term-ish header so course rows inherit its year.
    if (IN_PROGRESS_HEADING_RE.test(line)) inProgressBlock = true;
    else if (SECTION_HEADING_RE.test(line)) inProgressBlock = false;
    const term = readTermLine(line);
    if (term) {
      // (The in-progress section's own term line — "Term: Fall 2024" under
      // "COURSES IN PROGRESS" — does not end it; a section heading does.)
      if (transferBlock === 'table') transferBlock = undefined; // the table ends at the next term header
      // A bare term header ends Banner's block too (2026-09-20) — one that
      // names an institution is a transfer term inside it.
      if (transferBlock === 'banner' && !NAMES_INSTITUTION_RE.test(line)) transferBlock = undefined;
      currentYear = term.year;
      // A header that names no season ("Term 2234", a bare "Session:
      // 2018-2019") leaves the season open rather than keeping the previous
      // header's (2026-09-26 — BITS Pilani's fall rows inherited "Summer").
      currentSeason = term.season;
      headerSeasonExplicit = term.explicit === true;
      const suffix = LEVEL_SUFFIX_RE.exec(line.trim());
      if (suffix) blockLevel = levelWord(suffix[1]!);
    }
  };
  /** A term header, read (2026-09-26) from the year(s) it prints and the
   * season, ordinal, month range or calendar it names. Undefined when the
   * line is not one: no term word, no usable year, a course row, or a
   * prose line (long, unless its only digits are years and an ordinal). */
  interface TermRead {
    year: number;
    season?: Season;
    /** The season came from the header itself, not from an academic-year default. */
    explicit?: true;
  }
  // The academic year of the last header that printed one (BUET prints
  // "Session: 2018-2019" once and "Level-1 Term-I" per term) and the highest
  // ordinal any term line uses (three terms in one year — UNSW — put the
  // second in the summer; two put it in the fall).
  let academicRange: { first: number; second: number } | undefined;
  // Whether the current header named a season, ordinal or month: a row's own
  // date wins over a header that only names the academic year (Politecnico
  // di Milano's exam dates under "Academic year 2022/2023").
  let headerSeasonExplicit = false;
  let ubcSessionYear: number | undefined;
  // "2019 Winter Session" is UBC's academic year only when its Term 1 / Term 2
  // lines with month ranges follow; at Toronto "2024 WINTER SESSION" is the
  // January–April term (2026-09-26).
  const ubcStyle = lines.some((l) => MONTH_RANGE_RE.test(l) && /\bterm\s*[12]\b/i.test(l));
  const maxOrdinal = Math.max(1, ...lines.map((l) => ordinalOf(l) ?? 0).filter((n) => n < 4));
  const readTermLine = (line: string): TermRead | undefined => {
    if (!TERM_WORD_RE.test(line) && !YEAR_PART_RE.test(line) && !SLASH_ORDINAL_RE.test(line) && !/\bsession\s*:/i.test(line)) return undefined;
    // A year whose last digit the PDF sets apart ("200 3   FULL YEAR", the
    // ANU sample, 2026-09-26) is joined back before anything reads it.
    const flat = line.replace(/\s{2,}/g, ' ').trim().replace(/\b((?:19|20)\d) (\d)\b/g, '$1$2');
    // A course row never opens a term ("ENGL 2010   Intermediate Writing").
    if (leadCode(line.replace(/\s{2,}/g, '  ').trim())) return undefined;
    // Long lines are prose — unless bilingual (the Latin half before a
    // separator decides) or made only of term words, years and an ordinal.
    const latin = flat.split(/\s+[/|]\s+/)[0]!;
    // JNTU's "B.Tech III Year I Semester (R18) Regular Examinations, November
    // 2021" is a header despite its length: a term word, a month or ordinal,
    // a year, and no other long number.
    const headerLike = latin.length < 120 && (ordinalOf(latin) !== undefined || MONTH_YEAR_RE.test(latin) || MONTH_RANGE_RE.test(latin)) && !/\d{5,}/.test(latin);
    if (latin.length >= 60 && !headerLike && !/^[A-Za-z .,()':/-]*(?:19|20)\d{2}[A-Za-z .,()':/-]*$/.test(latin.replace(/\b(?:I{1,3}|IV|[1-4])\b/g, ' '))) return undefined;
    // UBC's "2019 Winter Session" is the academic year, its Term 1 the fall
    // and Term 2 the spring; "winter" must not read as a season there.
    const ubc = ubcStyle ? (/^((?:19|20)\d{2})\s+winter\s+session\b/i.exec(flat) ?? /\bwinter\s+session\s+((?:19|20)\d{2})\b/i.exec(flat)) : null;
    if (ubc) {
      ubcSessionYear = Number(ubc[1]);
      academicRange = { first: ubcSessionYear, second: ubcSessionYear + 1 };
      return { year: ubcSessionYear };
    }
    // Uniandes' "Periodo 2019-10" (first semester), "-20" (second), "-19" (summer).
    const periodo = /^per[ií]odo\s+((?:19|20)\d{2})-(10|20|19)\b/i.exec(flat);
    if (periodo) return { year: Number(periodo[1]), season: periodo[2] === '10' ? 'spring' : periodo[2] === '20' ? 'fall' : 'summer', explicit: true };
    const monthRange = MONTH_RANGE_RE.exec(flat);
    if (monthRange) {
      // The range's middle month places it: Jul–Nov (IIT Madras) is the fall,
      // Jan–Apr the spring, May–Jul the summer.
      const monthNo = (m: string) => ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(m.slice(0, 3).toLowerCase()) + 1;
      const from = monthNo(monthRange[1]!);
      const to = monthNo(/[-–—]\s*([a-z]{3})/i.exec(monthRange[0])?.[1] ?? monthRange[1]!);
      const mid = (from + (to < from ? to + 12 : to)) / 2;
      const season: Season = mid < 5 ? 'spring' : mid < 8 ? 'summer' : 'fall';
      return { year: Number(monthRange[2]), season, explicit: true };
    }
    // An examination month names the term (VTU "Examination: December 2021 /
    // January 2022", Anna "Month & Year of Exam: NOV/DEC 2015"): the FIRST
    // month and the year beside it — December is the fall's exam.
    const monthYear = MONTH_YEAR_RE.exec(flat);
    if (monthYear && !FALL_RE.test(flat) && !SUMMER_RE.test(flat) && !/\bspring\b/i.test(flat)) {
      const m = monthYear[1]!.toLowerCase();
      // An EXAMINATION month is the end of its term: India's odd semester sits
      // its exams in November–January, the even one in April–August.
      const exam = /\bexam/i.test(flat);
      const season: Season = exam
        ? /^(nov|dec|jan|feb)/.test(m) ? 'fall' : 'spring'
        : /^(jan|feb|mar|apr|may)/.test(m) ? 'spring' : /^(jun|jul)/.test(m) ? 'summer' : 'fall';
      return { year: Number(monthYear[2]), season, explicit: true };
    }
    // Years: Gregorian first; a Gregorian year in parentheses or marked G.C. /
    // A.D. beats an Ethiopian or Nepali year beside it; a Solar Hijri year
    // (1397–1398) converts — Iran's first semester starts in September of
    // year + 621, its second in February of year + 622.
    const hint = GREGORIAN_HINT_RE.exec(flat);
    let year: number | undefined = hint ? Number(hint[1] ?? hint[2]) : undefined;
    // The hinted year may itself be a range ("(2019/20 G.C.)").
    let range = hint ? ACADEMIC_YEAR_RE.exec(hint[0]) : ACADEMIC_YEAR_RE.exec(flat);
    if (year === undefined && range) year = Number(range[1]);
    if (year === undefined) {
      const y = YEAR_RE.exec(flat);
      if (y) year = Number(y[1]);
    }
    let hijri = false;
    if (year === undefined) {
      const h = SOLAR_HIJRI_YEAR_RE.exec(flat);
      if (h) {
        hijri = true;
        year = Number(h[1]) + 621;
        const hr = /\b(13[5-9]\d|14[0-2]\d)\s*[-–/]\s*(13[5-9]\d|14[0-2]\d|\d{2})\b/.exec(flat);
        if (hr) range = [hr[0], hr[1]!, hr[2]!] as unknown as RegExpExecArray;
      }
    }
    const ordinal = ordinalOf(flat);
    if (year === undefined && currentYear !== undefined && flat.length <= 30 && !/\d/.test(flat)) {
      // A term line with no year of its own — "SECOND SEMESTER", "Summer
      // Session" — under a header that printed one (the ANU sample prints
      // "2005   FIRST SEMESTER" once, then "SECOND SEMESTER"; 2026-09-26).
      // One season word exactly; an ordinal alone falls in calendar order.
      const seasonWords = (flat.match(/\b(?:fall|spring|summer|autumn|winter)\b/gi) ?? []).length;
      const alone = seasonWords === 1 ? seasonOf(flat) : undefined;
      if (alone !== undefined) return { year: currentYear, season: alone, explicit: true };
      if (ordinal !== undefined && seasonWords === 0 && !/\blevel\b/i.test(flat)) {
        if (maxOrdinal >= 3) return { year: currentYear, season: ordinal === 1 ? 'spring' : ordinal === 2 ? 'summer' : 'fall', explicit: true };
        return { year: currentYear, season: ordinal === 1 ? 'spring' : ordinal === 2 ? 'fall' : 'summer', explicit: true };
      }
    }
    if (year === undefined) {
      // "Level-1 Term-I" under an earlier "Session: 2018-2019" (BUET): the
      // session is the admission year; Level N is N − 1 years on.
      if (ordinal === undefined || academicRange === undefined) return undefined;
      const level = /\blevel\s*[-:]?\s*([1-6])\b/i.exec(flat);
      const offset = level ? Number(level[1]) - 1 : 0;
      return { year: (ordinal === 1 ? academicRange.first : academicRange.second) + offset, season: ordinal === 1 ? 'fall' : ordinal === 2 ? 'spring' : 'summer', explicit: true };
    }
    const secondYear = (r: RegExpExecArray): number => {
      const raw = r[2]!;
      const n = raw.length === 4 ? Number(raw) : Number(String(r[1]).slice(0, 2) + raw);
      return hijri ? n + 621 : n;
    };
    if (range) academicRange = { first: year, second: secondYear(range) };
    else if (!ordinal || !/\bsession\b/i.test(flat)) academicRange = undefined;
    const wpi = WPI_TERM_RE.exec(line);
    if (wpi) return { year, season: /^[AB]$/i.test(wpi[1]!) ? 'fall' : 'spring', explicit: true };
    const season = seasonOf(ubcStyle ? flat.replace(/winter\s+session/i, '') : flat);
    if (season !== undefined) {
      // "Spring 2023-2024", "Sommersemester 2023", "Second Semester 1397-1398":
      // the spring and summer belong to the range's second year.
      if (range && season !== 'fall') return { year: secondYear(range), season, explicit: true };
      return { year, season, explicit: true };
    }
    if (ordinal === undefined && range && /\b(academic\s+year|session|year)\b/i.test(flat)) return { year, season: 'fall' }; // a whole academic year (KU Leuven "Academic year 2022-2023"): it opens in the fall — not explicit, a dated row may override it
    if (ordinal !== undefined) {
      if (range) return ordinal === 1 ? { year, season: 'fall' } : ordinal === 2 ? { year: secondYear(range), season: 'spring' } : { year: secondYear(range), season: 'summer' };
      // One calendar year, numbered terms: in calendar order — the first is
      // the spring, the last the fall, a middle one the summer (UNSW's three
      // terms). Thailand's "First Semester 2022" (August–December) is the one
      // documented exception (DECISIONS.md, 2026-09-26).
      if (ubcSessionYear !== undefined && year === ubcSessionYear) return ordinal === 1 ? { year, season: 'fall' } : { year: year + 1, season: 'spring' };
      if (maxOrdinal >= 3) return { year, season: ordinal === 1 ? 'spring' : ordinal === 2 ? 'summer' : 'fall', explicit: true };
      return { year, season: ordinal === 1 ? 'spring' : ordinal === 2 ? 'fall' : 'summer', explicit: true };
    }
    return { year };
  };
  /** Level markers on one line. True when the line was only a marker and is
   * done with. */
  const readLevelMarkers = (flat: string, lead: Lead): boolean => {
    // A level named in one cell of a wider line (HKUST "Career: Postgraduate",
    // CU Boulder "Academic Career: Graduate", "Program: Master's Program",
    // "GRADUATE STUDENT'S WORK RECORD", Brazil's "PÓS-GRADUAÇÃO", the UK's
    // "FHEQ Level 7") — public transcript keys, 2026-09-26.
    if (!lead) {
      for (const cell of flat.split(/\s{2,}/)) {
        const m = CELL_LEVEL_RE.exec(cell.trim());
        if (m) {
          const word = (m[1] ?? m[2] ?? m[3] ?? '').toLowerCase();
          blockLevel = /^(undergraduate|bachelor|graduação|grado|licenciatura|[456])$/.test(word) ? 'undergraduate' : 'graduate';
          break;
        }
      }
    }
    const levelBlock = LEVEL_BLOCK_RE.exec(flat);
    if (levelBlock && !/\d{2,}/.test(flat.slice(0, 12))) {
      const word = levelBlock.slice(1).find((g) => g !== undefined) ?? '';
      blockLevel = levelWord(word);
      return true;
    }
    const levelCell = flat.split(/\s{2,}/).find((c) => LEVEL_ALONE_RE.test(c.trim()));
    if (levelCell && !lead) {
      blockLevel = levelWord(levelCell.trim());
      if (LEVEL_ALONE_RE.test(flat)) return true;
    }
    const totalsLevel = LEVEL_TOTALS_RE.exec(flat);
    if (totalsLevel) retroLevel = levelWord(totalsLevel[1]!);
    return false;
  };
  /** Degree lines: the degrees-awarded block, a graduate conferral, and the
   * bachelor's name and date (which may sit on a nearby line). */
  const readDegreeSignals = (flat: string, lead: Lead, lineIndex: number): void => {
    // Degrees awarded.
    if (DEGREES_AWARDED_HEADING_RE.test(flat) && !DEGREE_NAME_RE.test(flat)) {
      degreeBlock = 6;
    } else if (
      DEGREE_CONFERRED_HEADER_RE.test(flat) &&
      !DEGREE_NAME_RE.test(flat) &&
      // Either laid out in columns, or a heading and nothing else on the line
      // (Johns Hopkins prints "JHU Degree and Date Conferred" as one run,
      // 2026-09-08).
      (flat.split(/\s{2,}/).length >= 2 || DEGREE_CONFERRED_HEADER_ALONE_RE.test(flat))
    ) {
      degreeBlock = 2; // a table header: the values follow on the next line(s)
    }
    const namesDegree = namesDegreeIn(flat) && !NOT_AWARDED_RE.test(flat);
    // "Master of Science" / "Major: … Status: IN PROGRESS - NOT CONFERRED":
    // the status line under a bare degree name in the block (2026-09-20).
    const notConferred =
      NOT_CONFERRED_STATUS_RE.test(flat) || (degreeBlock > 0 && !CONFER_RE.test(flat) && NOT_CONFERRED_STATUS_RE.test(lines[lineIndex + 1] ?? ''));
    const conferredHere = namesDegree && (CONFER_RE.test(flat) || degreeBlock > 0) && !NOT_COMPLETE_RE.test(flat) && !notConferred;
    if (degreeBlock > 0 && !lead) degreeBlock -= 1;
    if (conferredHere && gradDegreeIn(flat)) blockConferredGrad = true;
    // Named, not necessarily conferred: "Degree Sought: Bachelor of Science"
    // still says this record covers an undergraduate degree.
    if (namesDegree && bachelorsIn(flat)) bachelorsNamed = true;
    // A dated degree line without a degree name ("Degree Completion Date:
    // 05/17/2024") is remembered: the degree name may follow it.
    if (!namesDegree && DEGREE_DATE_LINE_RE.test(flat) && !NOT_YET_RE.test(flat)) {
      const d = dateAfterLabel(flat);
      if (d !== undefined) recentDegreeDate = { date: d, at: lineIndex };
    }
    if (namesDegree && bachelorsIn(flat) && !NOT_COMPLETE_RE.test(flat) && bachelorsConferredOn === undefined) {
      // The bachelor's date (2026-09-05; widened 2026-09-06, late evening):
      // on the degree line itself when it says conferred/awarded (or sits in a
      // degrees-awarded block); else on a labelled line within the next six
      // ("Degree Date:", "Degree Completion Date:", "Conferral Date:", "Date
      // Conferred:", "Graduation Date:", "Awarded:") — stopping at a course
      // row or at the NEXT degree's name, so a master's date is never taken;
      // else on such a line up to two lines before the name. A forecast
      // ("Expected graduation: May 2027") never counts.
      if (conferredHere) {
        bachelorsConferred = true;
        bachelorsConferredOn = dateAfterLabel(flat) ?? looseDateOnLine(flat);
      }
      for (let k = 1; k <= 6 && bachelorsConferredOn === undefined; k++) {
        const later = lines[lineIndex + k];
        if (later === undefined || leadCode(later.replace(/\s{2,}/g, '  ').trim()) || gradDegreeNameIn(later)) break;
        if (DEGREE_DATE_LINE_RE.test(later) && !NOT_YET_RE.test(later)) bachelorsConferredOn = dateAfterLabel(later);
        // A bare "Date:" right under "Degree Completed: Bachelor of Science"
        // is that degree's date (UMass Amherst, DGS 2026-09-13) — but only
        // when the degree line itself said completed/conferred/awarded, so a
        // "Date:" elsewhere in a block is never mistaken for it.
        else if (conferredHere && /^\s*date\s*:/i.test(later) && !NOT_YET_RE.test(later)) bachelorsConferredOn = dateOnLine(later);
      }
      if (bachelorsConferredOn === undefined && recentDegreeDate !== undefined && lineIndex - recentDegreeDate.at <= 2) bachelorsConferredOn = recentDegreeDate.date;
    }
  };
  /** One course row, when the line is one. Returns the index of the last line
   * consumed (a continuation or title line may be taken with the row). */
  const PROGRAM_TITLE_RE = /^(?:bachelor|master|doctor)s?(?:'s)?\s+(?:of|in)\b|^(?:graduate|postgraduate|advanced)\s+(?:diploma|certificate)\b|^(?:diploma|certificate|associate)\s+(?:of|in)\b|^(?:licenciatura|maestr[ií]a|mestrado|doutorado|doctorado)\s+(?:en|em)\b/i;
  const PROSE_WORD_RE = /^(?:is|are|was|were|be|been|shall|must|may|will|can|has|have|had|does|do|not|if|which|that|this|these|those|than|then|when|where|there|their|they|he|she|it|its|we|you|our|your|who|whom|whose|as|such|so|also|only|each|every|per|at|by|from|into|upon|about|after|before|during|until|while|because|provided|unless|otherwise|however|thus|therefore|hence|whereas|within|without|would|should|could|might|should)$/;
  const courseLikeTitle = (parts: readonly string[]): boolean => {
    if (parts.length === 0) return true;
    const text = parts.join(' ');
    if (PROGRAM_TITLE_RE.test(text)) return false;
    if (text.includes('@')) return false;
    if (/,$/.test(text)) return false;
    const words = parts.map((w) => w.replace(/[^\p{L}]/gu, ''));
    if (parts.length >= 6 && new Set(words.filter((w) => PROSE_WORD_RE.test(w))).size >= 2) return false;
    return true;
  };
  const readCourseRow = (line: string, flat: string, lead: Lead, lineIndex: number): number => {
    if (flat.length < 6) return lineIndex;
    // The course code is expected at the start of the row (or right after a
    // leading term/date cell). Column gaps are unreliable across layouts, so
    // the rest of the line is TOKENIZED: credits and grade are searched among
    // the tokens after the title; the title is the leading run of wordy tokens.
    if (!lead) return lineIndex;
    if (transferBlock !== undefined) {
      transferRowsSkipped += 1;
      return lineIndex;
    }
    let rowLevel: Level | undefined;
    const into: RowScan = { titleParts: [] };
    // The header's column order first (2026-09-26); the position-free scan
    // when there is no header or the row does not fit it.
    const mapped = scanWithMap(lead.tokens, into);
    let cellTerm: { year?: number; season?: Season } | undefined;
    // A term cell before the code (Unicamp "1S/2022   MO 417   …").
    if (lead.preCell !== undefined && !lead.date) {
      const pre = rowTermOf([lead.preCell]);
      if (pre.year !== undefined) cellTerm = pre;
    }
    if (mapped) {
      rowLevel = mapped.level;
      if (mapped.year !== undefined || mapped.season !== undefined) cellTerm = { year: mapped.year ?? cellTerm?.year, season: mapped.season ?? cellTerm?.season };
    } else {
      if (lead.tokens.length > 0 && ROW_LEVEL_RE.test(lead.tokens[0]!)) {
        rowLevel = /^U/.test(lead.tokens[0]!) ? 'undergraduate' : 'graduate';
        lead.tokens.shift();
      }
      scanTokens(lead.tokens, into);
    }
    // Lines a course row never looks like (the registrar keys and regulations
    // that travel as a transcript's back page, 2026-09-26): a program line
    // ("3500   BACHELOR OF CLASSES", the ANU sample), an address or e-mail
    // line, a title that ends in a comma, and prose — six words or more
    // with two of the function words no course title uses ("students were
    // admitted in a batch and there were 8 repeaters").
    if (!courseLikeTitle(into.titleParts)) return lineIndex;
    let usedContinuation = false;
    if (into.credits === undefined && into.grade === undefined && into.rawGrade === undefined && into.titleParts.length > 0) {
      // Two-line rows (2026-09-04): some registrars print the code + title on
      // one line and the numbers on the next. If the NEXT line has no code of
      // its own, few tokens, and yields a credit or grade, treat it as this
      // row's continuation.
      const next = lines[lineIndex + 1]?.replace(/\s{2,}/g, '  ').trim();
      if (next && next.length >= 1 && !leadCode(next) && !TOTALS_LINE_RE.test(next)) {
        const nextTokens = tokensOf([next]);
        // The continuation holds the row's NUMBERS: a next line of words is
        // the following prose sentence, not this row's credits (2026-09-26).
        const nextWordy = nextTokens.filter((tk) => /[\p{L}]{2}/u.test(tk)).length;
        if (nextTokens.length <= 8 && nextWordy <= 3) {
          const probe = { titleParts: [...into.titleParts], credits: undefined, grade: undefined, rawGrade: undefined } as RowScan;
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
    if (into.credits === undefined && into.grade === undefined && into.rawGrade === undefined) return lineIndex;
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
    if (inProgressBlock && into.grade === undefined && into.rawGrade === undefined) into.grade = 'IP';
    const confidence = confidences?.[lineIndex];
    // OCR-only sanity check: real credit values come in half-credit steps, so
    // "3.6" is a misread ("3.0" with a 0→6 confusion) — flag, never silently fix.
    const oddCredits = confidences !== undefined && into.credits !== undefined && (into.credits * 2) % 1 !== 0;
    // The row's own year, if it prints one — with the course code removed
    // first, so "CSCI 2018" is never read as the year 2018 (2026-09-05).
    const codeDigits = lead.code.replace(/^[A-Z ]+[- ]?/, '');
    const withoutCode = (text: string) => text.replace(codeDigits, ' ');
    const yearLine = withoutCode(usedContinuation ? `${line} ${lines[lineIndex + 1] ?? ''}` : line);
    // A year inside the title ("Lab for CS 2000", 2026-09-20) is not the row's.
    const yearMatch = YEAR_RE.exec(yearLine);
    // A date on the row (a semester-ending date before the code, a result
    // date after the grade — KTH, Peradeniya, 2026-09-26) places the row by
    // termOfDate when no term header covers it; a header's year is never
    // overridden by a row's date.
    const rowDate = lead.date ? (dateOnLine(lead.date) ?? isoOrEuropeanDate(lead.date)) : isoOrEuropeanDate(yearLine) ?? (currentYear === undefined ? dateOnLine(yearLine) : undefined);
    if (cellTerm === undefined && rowDate !== undefined && (currentYear === undefined || lead.date !== undefined)) {
      const t = termOfDate(rowDate);
      cellTerm = { year: t.year, season: t.season };
    }
    const rowYear = cellTerm === undefined && rowDate === undefined && yearMatch && !into.titleParts.includes(yearMatch[1]!) ? yearMatch : null;
    courses.push({
      // "CS5321" / "CS-5321" → "CS 5321". Subject words are two letters or
      // more, so Columbia's "COMS W4111" keeps its capital on the number.
      // "CS5321" / "CS-5321" → "CS 5321". A second word of one or two letters is
      // part of the number (Columbia "COMS W4111", BITS "SS ZG519"), and
      // IIIT Hyderabad's "CS1.301" stays as printed (2026-09-26).
      courseId: /^[A-Z]{2}\d\.\d{3}$/.test(lead.code) ? lead.code : lead.code.replace(/^([A-Z]{2,}(?: [A-Z]{3,})?)[- ]?(\d{2,})/, '$1 $2'),
      title: into.titleParts.join(' ').slice(0, 90) || undefined,
      credits: into.credits,
      grade: into.grade,
      rawGrade: into.rawGrade,
      year: cellTerm?.year ?? (rowYear ? Number(rowYear[1]) : currentYear),
      season: cellTerm?.season ?? (rowYear ? (seasonOf(yearLine) ?? currentSeason) : currentSeason),
      lowConfidence: (confidence !== undefined && confidence < OCR_CONFIDENCE_FLOOR) || oddCredits ? true : undefined,
    });
    rowLevels.push(rowLevel ?? blockLevel);
    if (usedContinuation) lineIndex += 1; // the continuation line is consumed
    return lineIndex;
  };
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex]!;
    trackTermAndTransfer(line);
    const flat = line.replace(/\s{2,}/g, '  ').trim();
    // The course code at the row's start, read once: the level and degree
    // tests below ask whether the line is a course row, and the row reader
    // needs the tokens.
    const lead = leadCode(flat);
    if (!lead) {
      const header = readColumnHeader(flat);
      if (header) {
        columnKinds = header;
        if ((globalThis as any).__DEBUG_COLUMNS) console.log('HEADER', JSON.stringify(flat), header);
        continue;
      }
    }
    if (readLevelMarkers(flat, lead)) continue;
    readDegreeSignals(flat, lead, lineIndex);
    lineIndex = readCourseRow(line, flat, lead, lineIndex);
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
    blockConferredGrad ||
    lines.some((l) => CONFER_RE.test(l) && gradDegreeIn(l) && !NOT_COMPLETE_RE.test(l) && !NOT_CONFERRED_STATUS_RE.test(l)) ||
    undefined;
  // Quarter system (2026-09-11): the word "quarter" in a term header ("Fall
  // Quarter 2023", "Autumn Qtr 2023 Graduate") or in a credits heading
  // ("Quarter Units", "Qtr Hrs"). Nothing weaker — a lone "Winter" term can be
  // a January session on a semester calendar. Two more shapes (DGS 2026-09-20):
  // term headers that use Autumn AND Winter AND Spring (a three-season year is
  // a quarter calendar; a semester school says Fall), and WPI's lettered
  // seven-week terms (two or more of A–D).
  const legendIndex = lines.findIndex((l) => /^\s*(?:transcript\s+key|legend|key\s+to\s+(?:the\s+)?transcript|guide\s+to\s+transcript|explanation\s+of\s+(?:the\s+)?transcript|grading\s+(?:system|scale|key))\b/i.test(l.replace(/\s{2,}/g, ' ').trim()));
  const legendStart = legendIndex < 0 ? lines.length : legendIndex;
  const termHeaders = lines.filter((l) => TERM_WORD_RE.test(l) && YEAR_RE.test(l) && l.replace(/\s{2,}/g, ' ').length < 60);
  const autumnWinterSpring = [/\bautumn\b/i, /\bwinter\b/i, /\bspring\b/i].every((re) => termHeaders.some((l) => re.test(l)));
  const wpiTerms = new Set(termHeaders.map((l) => WPI_TERM_RE.exec(l)?.[1]?.toUpperCase()).filter((t) => t !== undefined));
  const quarterSystem =
    lines.some((l) => /\b(fall|spring|summer|autumn|winter)\s+(quarter|qtr)\b/i.test(l) && YEAR_RE.test(l)) ||
    // A credits heading that says quarter — a column header or a short label,
    // never legend prose ("prior transcripts show quarter hours", Utah / Ohio
    // State keys, 2026-09-26) and nothing at or after a legend heading.
    lines.slice(0, legendStart).some((l) => /\b(quarter|qtr)\s+(units?|hours?|hrs?|credits?)\b/i.test(l) && l.replace(/\s{2,}/g, ' ').trim().length < 60 && !/\b(is|are|was|were|show|shown|prior|converted|conversion|equal|equals)\b/i.test(l)) ||
    autumnWinterSpring ||
    wpiTerms.size >= 2
      ? (true as const)
      : undefined;
  const trimesterSystem =
    !quarterSystem &&
    (lines.some((l) => /\b(fall|spring|summer|autumn|winter)\s+(trimester|tri)\b/i.test(l) && YEAR_RE.test(l)) ||
      lines.some((l) => /\btrimester\s+(units?|hours?|hrs?|credits?)\b/i.test(l)))
      ? (true as const)
      : undefined;
  return {
    ...(quarterSystem ? { quarterSystem } : {}),
    ...(trimesterSystem ? { trimesterSystem } : {}),
    hasTextLayer: true,
    looksLikeNotreDame,
    // Spelled out for everyone who reads it (DGS 2026-09-08): the student,
    // the DGS review request and the Grad Admin processing request.
    ...withCampus(guessedUniversity(lines), lines),
    degreeConferred,
    bachelorsConferredOn,
    ...(bachelorsConferred || bachelorsConferredOn !== undefined ? { bachelorsConferred: true as const } : {}),
    ...(bachelorsNamed ? { bachelorsNamed: true as const } : {}),
    mixedLevels: levels.size > 1 ? true : undefined,
    transferRowsSkipped: transferRowsSkipped > 0 ? transferRowsSkipped : undefined,
    courses,
  };
}

/** One unreviewed course, pre-rendered for the review request (the caller
 * supplies the term label and slot label so this stays UI- and engine-free). */
interface ReviewRequestCourse {
  institution?: string;
  courseId: string;
  title?: string;
  credits: number;
  grade: string;
  termText: string;
  slotLabel?: string;
}

/** Shared assembly for the copy-ready review requests (decisions 2026-09-03).
 * The request goes to the DGS alone (DGS decision 2026-09-06 — the Grad
 * Admin is not part of the review). Two clipboard flavors are returned and
 * written together: `text` (tab-separated sheet rows, pipe-separated detail
 * rows) for plain-text contexts, and `html`, where every row set is a REAL
 * `<table>` — HTML email composers (Gmail etc.) flatten tab characters to
 * spaces, but a table survives the whole journey: app → email → the DGS
 * copies it → Google Sheets pastes it as cells. The course details are
 * tables too (DGS request 2026-09-06: easier to read than bullet lines). */
function buildReviewRequest(opts: {
  subject: string;
  intro: string;
  /** Extra context lines shown right under the intro (e.g. prior graduate study). */
  context: readonly string[];
  /** Sheet-paste sections (one per tab); a section with no rows is skipped. */
  sections: readonly { rowsIntro: string; rows: readonly (readonly string[])[] }[];
  detailsTitle: string;
  /** Column headers of the detail tables. */
  detailHeaders: readonly string[];
  /** Detail rows grouped per transcript, each group a table under its heading. */
  detailGroups: readonly { heading: string; rows: readonly (readonly string[])[] }[];
}): { text: string; html: string; subject: string } {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const greeting = 'Dear DGS,';
  const sections = opts.sections.filter((s) => s.rows.length > 0);
  const groups = opts.detailGroups.filter((g) => g.rows.length > 0);
  const pipeRow = (r: readonly string[]) => r.join(' | ');
  // The human half (greeting, context, sign-off) sits ABOVE one line; the
  // machine-readable half (tables + details) below it. Both halves are
  // marked at the line (DGS wording, 2026-09-03 and 2026-09-06): the student
  // may reword the email, but must leave the tables intact.
  const editable = EDITABLE_MARKER;
  const marker = DO_NOT_MODIFY_MARKER;
  const divider = MARKER_DIVIDER;
  const text =
    `Subject: ${opts.subject}\n\n${greeting}\n\n${opts.intro}\n\n` +
    opts.context.map((c) => `${c}\n`).join('') +
    `\nThank you!\n\n${editable}\n${divider}\n${marker}\n\n` +
    sections.map((s) => `${s.rowsIntro}\n\n${s.rows.map((r) => r.join('\t')).join('\n')}\n\n`).join('') +
    `${opts.detailsTitle}\n\n` +
    groups.map((g) => `${g.heading}\n${pipeRow(opts.detailHeaders)}\n${g.rows.map(pipeRow).join('\n')}`).join('\n\n') +
    `\n`;
  const html =
    `<p>${esc(`Subject: ${opts.subject}`)}</p><p>${esc(greeting)}</p><p>${esc(opts.intro)}</p>` +
    (opts.context.length > 0 ? `<p>${opts.context.map((c) => esc(c)).join('<br>')}</p>` : '') +
    `<p>Thank you!</p><p><strong>${esc(editable)}</strong></p><hr><p><strong>${esc(marker)}</strong></p>` +
    sections
      .map(
        (s) =>
          `<p>${esc(s.rowsIntro)}</p><table border="1" cellspacing="0" cellpadding="4">` +
          s.rows.map((r) => `<tr>${r.map((v) => `<td>${esc(v)}</td>`).join('')}</tr>`).join('') +
          `</table>`,
      )
      .join('') +
    `<p>${esc(opts.detailsTitle)}</p>` +
    groups
      .map(
        (g) =>
          `<p><strong>${esc(g.heading)}</strong></p><table border="1" cellspacing="0" cellpadding="4"><tr>${opts.detailHeaders.map((h) => `<th>${esc(h)}</th>`).join('')}</tr>` +
          g.rows.map((r) => `<tr>${r.map((v) => `<td>${esc(v)}</td>`).join('')}</tr>`).join('') +
          `</table>`,
      )
      .join('');
  // The subject travels with the flavours (the copy dialog shows it, 2026-09-06 evening);
  // "Oral Candidacy Exam (OCE)" in full once per flavour, then "OCE".
  return { text: shortenAfterFirst(text), html: shortenAfterFirst(html), subject: opts.subject };
}

/** The markers every copied request carries (DGS wording 2026-09-03 / 2026-09-06):
 * students reword only their own half; the tables below stay machine-readable.
 * Shared with the Grad Admin's processing request (src/ui/grad-admin-request.ts). */
export const EDITABLE_MARKER = '(You may edit anything above this line)';
export const DO_NOT_MODIFY_MARKER = '(DO NOT MODIFY ANYTHING BELOW THIS LINE)';
export const MARKER_DIVIDER = '-'.repeat(64);

/** One pending course in the combined review request (2026-09-03: ONE request
 * covers everything). `unlisted` marks courses that need a NEW sheet row —
 * ND courses missing from the Courses tab, external courses with no
 * ExternalCourses ruling; the rest need a decision, not a row. */
interface PendingReviewCourse extends ReviewRequestCourse {
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
 * (DGS wording, 2026-09-03), with "(You may edit anything above this line)"
 * above the divider (2026-09-06), so students reword only their own half and
 * leave the machine-readable parts intact. */
/** One paste-ready row per COURSE, not per attempt (DGS 2026-09-09). A student
 * may take the same course several times — a master's project or thesis credit
 * — and every attempt used to become its own row, which is how the
 * ExternalCourses tab collected duplicates that shadow each other (the last
 * row wins). The course DETAILS below still list every attempt: that is the
 * evidence the DGS is being asked to weigh, and the repetition is visible
 * there. Keyed the way the sheet itself matches, so "CS-591" and "CS 591" at
 * one university count as the same course. */
function oncePerCourse(courses: readonly PendingReviewCourse[], keyOf: (c: PendingReviewCourse) => string): PendingReviewCourse[] {
  const seen = new Set<string>();
  const out: PendingReviewCourse[] = [];
  for (const c of courses) {
    if (!c.unlisted) continue;
    const key = keyOf(c);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

/** Said only when a repeat was actually folded away, so the DGS knows why the
 * table is shorter than the details below it. */
const repeatNote = (kept: readonly PendingReviewCourse[], all: readonly PendingReviewCourse[]): string =>
  all.filter((c) => c.unlisted).length > kept.length
    ? ' (one row per course — a course taken more than once is listed once here, and once per term in the details below)'
    : '';

export function buildCombinedReviewRequest(opts: {
  /** The "Prior graduate study" choice, as its dropdown label. */
  priorStudy: string;
  nd: readonly PendingReviewCourse[];
  external: readonly PendingReviewCourse[];
  /** Notes for the DGS that are not about one course (2026-09-12). */
  notes?: readonly string[];
}): { text: string; html: string; subject: string } {
  const detail = (c: PendingReviewCourse): string[] => [c.courseId, c.title ?? '', String(c.credits), c.grade, c.termText, c.reason];
  // One row per course for the sheet; every attempt still shown in the details.
  const ndRows = oncePerCourse(opts.nd, (c) => normalizeCourseId(c.courseId));
  const extRows = oncePerCourse(opts.external, (c) => `${normalizeUniversity(c.institution ?? '')}|${normalizeCourseId(c.courseId)}`);
  // Group the external courses per transcript (slot + university), so the
  // details read the way the student uploaded them — one table per group.
  const groups: { heading: string; rows: string[][] }[] = [];
  if (opts.nd.length > 0) groups.push({ heading: 'Notre Dame:', rows: opts.nd.map(detail) });
  for (const c of opts.external) {
    // The institution as the student's record has it — no upper-casing (DGS
    // 2026-09-06, late evening: keep what the transcript prints; the rules
    // match names case-insensitively anyway).
    const heading = `${c.slotLabel ?? 'Entered by hand'} — ${c.institution ?? 'university not given'}:`;
    let g = groups.find((x) => x.heading === heading);
    if (!g) {
      g = { heading, rows: [] };
      groups.push(g);
    }
    g.rows.push(detail(c));
  }
  return buildReviewRequest({
    subject: 'Course review request (degree self-check)',
    intro:
      'Could you review these courses for the degree self-check? ' +
      'It cannot count them until they are decided in the course rules.',
    context: [
      // (No second full stop after a label that ends in one — "…or Ph.D.".)
      `Prior graduate study: ${opts.priorStudy}${opts.priorStudy.endsWith('.') ? '' : '.'}`,
      // The "whichever apply" hedge instructs the student and lives in the
      // dialog step; the reader sees the attachments (trim review 2026-09-18, P-14).
      'My transcripts are attached.',
      ...(opts.notes ?? []).map((n) => `Please also check: ${n}`),
    ],
    // The reader owns the sheet (DGS 2026-09-03 wording, shortened in the trim
    // review 2026-09-18, P-15); naming no owner also keeps "the DGS's sheet"
    // from becoming "the ADGS's" on the MSCSE tab. Rows unchanged byte for byte.
    sections: [
      {
        rowsIntro: `Rows for the rules sheet — Courses tab:${repeatNote(ndRows, opts.nd)}`,
        rows: ndRows.map((c) => [c.courseId, c.title ?? '']),
      },
      {
        rowsIntro: `Rows for the rules sheet — ExternalCourses tab:${repeatNote(extRows, opts.external)}`,
        rows: extRows.map((c) => [c.institution ?? '', c.courseId, c.title ?? '']),
      },
    ],
    detailsTitle: 'Course details:',
    detailHeaders: ['Course', 'Title', 'Credits', 'Grade', 'Term', 'Why it needs a decision'],
    detailGroups: groups,
  });
}
