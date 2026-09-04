// §4.4.1 core-area TITLE keywords (DGS decision 2026-09-03, moved here from
// the UI 2026-09-04 so the classifier can use them too): an undergraduate
// course earns no transfer credit, but a title matching these keywords
// suggests it may demonstrate a core-knowledge area, so it is listed, shown
// to the student, and offered to the DGS for review. Extend the regex (and
// the mapping below) if the DGS adds keywords.
export const CORE_TITLE_RE = /algorithm|operating|architect/i;

/** The human name of the §4.4.1 core area a course title suggests, or
 * undefined when no keyword matches. Order matters only for titles matching
 * several keywords — the first named area wins. */
export function coreTitleSuggestion(title: string | undefined): string | undefined {
  const t = title ?? '';
  if (/operating/i.test(t)) return 'Operating Systems';
  if (/algorithm/i.test(t)) return 'Algorithms';
  if (/architect/i.test(t)) return 'Computer Architecture';
  return undefined;
}

/** Does this title's keyword point at the given core-area CODE (the engine's
 * os / algorithms / architecture)? Used by the §4.4.1 rows to mark an area
 * "pending review" when an unreviewed course could satisfy it (2026-09-04). */
const AREA_TITLE_RE: Record<string, RegExp> = {
  os: /operating/i,
  algorithms: /algorithm/i,
  architecture: /architect/i,
};
export function coreTitleMatchesArea(title: string | undefined, areaCode: string): boolean {
  const re = AREA_TITLE_RE[areaCode];
  return re !== undefined && re.test(title ?? '');
}
