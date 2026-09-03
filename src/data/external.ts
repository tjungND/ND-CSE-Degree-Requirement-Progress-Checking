// The ExternalCourses tab: courses from OTHER universities the DGS has already
// ruled on — whether each satisfies a §4.4.1 core-knowledge area and whether
// its credits can transfer under §5.2 (feature decisions, docs/DECISIONS.md
// 2026-09-01). Matching is deliberately forgiving about spelling: university
// names are compared case-, punctuation- and diacritic-insensitively, matched
// on the name exactly as transcripts print it (the aliases column was retired
// 2026-09-03), and course ids ignore spaces and hyphens — but a course
// with no matching row is NEVER guessed at; it stays "not yet reviewed".
import type { ExternalRule } from './types.ts';

/** "Univ. of Notre-Dame " → "univ of notre dame" (case, punctuation and
 * diacritics ignored; whitespace collapsed). Non-Latin letters are kept, but
 * the sheet convention (2026-09-03) is the university's name in CAPITAL
 * ENGLISH exactly as its transcripts print it. */
export function normalizeUniversity(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '') // strip the accents NFKD split off
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** "cs-5321" / "CS 5321" / "cs5321" → "CS5321". */
export function normalizeCourseId(id: string): string {
  return id.toUpperCase().replace(/[\s\-–—_./]+/g, '');
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
  return rules.find((r) => r.universityKey === uni && normalizeCourseId(r.courseId) === id);
}
