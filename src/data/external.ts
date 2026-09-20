// The ExternalCourses tab: courses from OTHER universities the DGS has already
// ruled on — whether each satisfies a §4.4.1 core-knowledge area and whether
// its credits can transfer under §5.2 (feature decisions, docs/DECISIONS.md
// 2026-09-01). Matching is deliberately forgiving about spelling: university
// names are compared case-, punctuation- and diacritic-insensitively, matched
// on the name exactly as transcripts print it (the aliases column was retired
// 2026-09-03), and course ids ignore spaces and hyphens — but a course
// with no matching row is NEVER guessed at; it stays "not yet reviewed".
import type { ExternalRule, Transferable } from './types.ts';

/** Abbreviations transcripts use in an institution's name, spelled out (DGS
 * 2026-09-08: "Georgia Inst. of Technology" is how Georgia Tech's UNOFFICIAL
 * transcript prints it; students, the DGS and the Grad Admin should all read
 * the real name). Applied for display AND inside `normalizeUniversity`, so a
 * sheet row written either way still matches the transcript.
 *
 * Conservative on purpose. "Tech" is expanded only with its full stop —
 * "Georgia Tech" is a name in its own right and must not become "Georgia
 * Technology" — and "St." is left alone, since it is Saint in one name and
 * State in another. */
const ABBREVIATIONS: [RegExp, string][] = [
  [/\binst\.?(?=\s|$)/gi, 'Institute'],
  [/\buniv\.?(?=\s|$)/gi, 'University'],
  [/\bcoll\.?(?=\s|$)/gi, 'College'],
  [/\bpoly\.?(?=\s|$)/gi, 'Polytechnic'],
  [/\bintl\.?(?=\s|$)/gi, 'International'],
  [/\bnatl\.?(?=\s|$)/gi, 'National'],
  [/\bengr\.?(?=\s|$)/gi, 'Engineering'],
  [/\btech\.(?=\s|$)/gi, 'Technology'],
  [/\bsci\.(?=\s|$)/gi, 'Science'],
  [/\bagri\.(?=\s|$)/gi, 'Agricultural'],
];

/** An institution's name with those abbreviations spelled out. Everything else
 * is left exactly as given — this is not a spell-checker. */
export function expandInstitutionAbbreviations(name: string): string {
  return ABBREVIATIONS.reduce((out, [re, word]) => out.replace(re, word), name).replace(/\s{2,}/g, ' ').trim();
}

/** "Univ. of Notre-Dame " → "university of notre dame" (abbreviations spelled
 * out since 2026-09-08, then case, punctuation and
 * diacritics ignored; whitespace collapsed). Non-Latin letters are kept, but
 * the sheet convention (2026-09-03) is the university's name in CAPITAL
 * ENGLISH exactly as its transcripts print it. */
export function normalizeUniversity(name: string): string {
  return expandInstitutionAbbreviations(name)
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '') // strip the accents NFKD split off
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    // "The Johns Hopkins University" and "Johns Hopkins University" are one
    // school; a sheet row written either way must match (2026-09-08).
    .replace(/^the /, '');
}

/** The institution name given to Notre Dame coursework taken BEFORE the entry
 * term (2026-09-05) — an earlier Notre Dame degree on a combined transcript.
 * Such courses are prior coursework (§5.2: the transfer conditions "also apply
 * to the transfer of credits earned in another program at Notre Dame"), so
 * they carry origin 'transfer' with this institution, and the DGS's
 * ExternalCourses rulings for them live under this name (in the sheet's
 * capital-English convention: UNIVERSITY OF NOTRE DAME). */
export const NOTRE_DAME = 'University of Notre Dame';

/** The §5.2 ruling that applies to THIS student (DGS 2026-09-09: the sheet
 * decides transferability separately for a Ph.D. and an MSCSE student). Always
 * go through here — reading `transferablePhd` directly would apply a Ph.D.
 * ruling to an MSCSE student. */
export function transferableFor(rule: ExternalRule | undefined, program: 'phd' | 'mscse'): Transferable | undefined {
  return program === 'phd' ? rule?.transferablePhd : rule?.transferableMscse;
}

/** Does this ruling mean "somebody has to approve it"? `dgs_approval` and
 * `adgs_approval` are one case for now (DGS 2026-09-09), and both are told to
 * the student as "needs DGS approval". */
export function needsApproval(t: Transferable | undefined): boolean {
  return t === 'dgs_approval' || t === 'adgs_approval';
}

/** The subject code of a course id — "CompSci 537" → "COMPSCI". Everything
 * before the first space, upper-cased and stripped of punctuation, so
 * "CS-503" and "CS 503" answer the same. */
export function subjectCode(courseId: string): string {
  return (courseId.split(' ')[0] ?? '').toUpperCase().replace(/[^A-Z]/g, '');
}

/** Is a course from ANOTHER university a CSE course, for §4.2's nine-credit
 * allowance for courses "taken from a department other than CSE"? (DGS
 * 2026-09-09.)
 *
 *   1. the ExternalCourses row's `is_cse` cell, when the DGS has filled it —
 *      the only thing that can settle a code like ECE, which means computing
 *      at one university and circuits at another;
 *   2. otherwise the Parameters tab's `cse_subject_codes` list;
 *   3. `undefined` when the sheet has no list at all — the app then says
 *      nothing about the course's department and the allowance is not applied.
 *
 * A code the list does not name is OUTSIDE CSE, not "unknown": the list is
 * where the DGS says which codes mean CSE, so its silence is an answer. The
 * course's line says which of the two decided it, so a wrong answer is
 * visible and correctable rather than silent. */
export function isCseCourse(
  courseId: string,
  rule: ExternalRule | undefined,
  cseSubjectCodes: string[] | undefined,
): boolean | undefined {
  if (rule?.isCse !== undefined) return rule.isCse;
  if (cseSubjectCodes === undefined) return undefined;
  return cseSubjectCodes.includes(subjectCode(courseId));
}

/** True for any spelling of Notre Dame as an institution name.
 *
 * Goes through normalizeUniversity() — the same folding every OTHER
 * institution comparison in this file uses — so hyphens, full stops and the
 * abbreviations a transcript (or a student typing the name by hand) may carry
 * are gone before the comparison: "Notre-Dame" and "Univ. of Notre Dame" are
 * the same school as "University of Notre Dame". The old regex read `\s*`
 * between the two words, so every hyphenated spelling silently failed — which
 * zeroed a 4+1's credit, dropped their coursework out of the DGS review
 * request, and refused it as a §5.2 transfer it never was (red-team 2026-09-13).
 *
 * A bare "ND" is accepted only when it is the WHOLE name: a student typing
 * just those two letters into this app can only mean Notre Dame, while
 * "ND State University" is a different school and must not match. */
export function isNotreDameInstitution(name: string | undefined): boolean {
  if (name === undefined) return false;
  const normalized = normalizeUniversity(name);
  return /\bnotre dame\b/.test(normalized) || normalized === 'nd';
}

/** "cs-5321" / "CS 5321" / "cs5321" → "CS5321". */
export function normalizeCourseId(id: string): string {
  return id.toUpperCase().replace(/[\s\-–—_./]+/g, '');
}

/** The ExternalCourses rows indexed by university key, then by normalized
 * course id — built once per rows array (a WeakMap keyed on the array itself,
 * so a fresh Rules object gets a fresh index) instead of scanning every row for
 * every course the engine classifies. First row wins on both levels, exactly
 * as the linear scans it replaces did. */
interface ExternalIndex {
  byUniversity: Map<string, { byCourse: Map<string, ExternalRule>; creditSystem?: CreditSystem }>;
}
const EXTERNAL_INDEX = new WeakMap<readonly ExternalRule[], ExternalIndex>();
function externalIndex(rules: readonly ExternalRule[]): ExternalIndex {
  let index = EXTERNAL_INDEX.get(rules);
  if (index) return index;
  index = { byUniversity: new Map() };
  for (const r of rules) {
    let uni = index.byUniversity.get(r.universityKey);
    if (!uni) {
      uni = { byCourse: new Map() };
      index.byUniversity.set(r.universityKey, uni);
    }
    const id = normalizeCourseId(r.courseId);
    if (!uni.byCourse.has(id)) uni.byCourse.set(id, r);
    if (uni.creditSystem === undefined && r.creditSystem !== undefined) uni.creditSystem = r.creditSystem;
  }
  EXTERNAL_INDEX.set(rules, index);
  return index;
}

/** The DGS's ruling for one (university, course) pair, or undefined = the DGS
 * has not reviewed that course yet. First matching row wins (duplicates are
 * reported at parse time). */
export function findExternalRule(
  rules: readonly ExternalRule[],
  university: string,
  courseId: string,
): ExternalRule | undefined {
  const uni = normalizeUniversity(university);
  const id = normalizeCourseId(courseId);
  if (uni === '' || id === '') return undefined;
  return externalIndex(rules).byUniversity.get(uni)?.byCourse.get(id);
}

/** §5.2: "Credits not earned on the semester system, such as trimester and
 * quarter-hour credits, will be transferred on a pro-rata basis." The factors
 * live on the sheet's Parameters tab (DGS 2026-09-12 — until then 2/3 and
 * 0.88 were constants here): `quarter_credit_factor` and
 * `trimester_credit_factor` — 0.66 and 0.88, the DGS Handbook's own §5.2
 * pro-rata table (DGS 2026-09-12, superseding the exact 2/3 of 2026-09-08). */
export type CreditSystem = 'quarter' | 'semester' | 'trimester';
/** The Parameters key that holds a system's factor; undefined for semester. */
export function creditSystemFactorKey(system: CreditSystem | undefined): 'quarter_credit_factor' | 'trimester_credit_factor' | undefined {
  return system === 'quarter' ? 'quarter_credit_factor' : system === 'trimester' ? 'trimester_credit_factor' : undefined;
}
/** How a factor is printed on a course line: two decimals ("0.67", "0.88"). */
export function creditSystemFactorLabel(factor: number): string {
  return factor.toFixed(2);
}

/** The credit system a university awards in, from ANY of its ExternalCourses
 * rows (the DGS sets it once; it applies to every course from that university,
 * listed or not). Undefined when no row says — credits then count as printed. */
export function universityCreditSystem(
  external: readonly ExternalRule[],
  university: string | undefined,
): CreditSystem | undefined {
  if (university === undefined) return undefined;
  const key = normalizeUniversity(university);
  if (key === '') return undefined;
  return externalIndex(external).byUniversity.get(key)?.creditSystem;
}

/** What one course counts for at Notre Dame: the DGS's fixed value for this
 * course when there is one, else the transcript's own credits converted from
 * the university's system, else undefined (count them as printed). */
export function ndEquivalentCredits(
  printed: number,
  rule: { ndCredits?: number } | undefined,
  system: CreditSystem | undefined,
  /** The sheet's factor for `system`; undefined = the key is missing, so no
   * conversion is possible (the caller says so rather than guessing). */
  factor: number | undefined,
): number | undefined {
  if (rule?.ndCredits !== undefined) return rule.ndCredits;
  if ((system === 'quarter' || system === 'trimester') && factor !== undefined) return printed * factor;
  return undefined;
}
