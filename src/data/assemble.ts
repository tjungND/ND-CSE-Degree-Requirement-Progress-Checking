// Pure assembly: three CSV texts → a validated Rules object. Used by the live
// loader, the snapshot fallback, and the tests — one parse path for all three.
import type { Term } from '../engine/types.ts';
import { compareTerm, termIndex } from '../engine/term.ts';
import { makeParameters } from './params.ts';
import { parseCategoriesTab, parseCoursesTab, parseParametersTab } from './parse.ts';
import type { RuleCourse, Rules, RulesDate, SheetIssue } from './types.ts';
import { validateCourses } from './validate.ts';

export interface CsvTexts {
  courses: string;
  parameters: string;
  categories: string;
}

export function rulesFromCsvTexts(
  texts: CsvTexts,
  meta: { source: 'live' | 'snapshot'; syncedAt: string; rulesDate?: RulesDate },
): Rules {
  const issues: SheetIssue[] = [];
  const { coreAreas, categoryGroups } = parseCategoriesTab(texts.categories, issues);
  const rawCourses = parseCoursesTab(texts.courses, issues);
  const courses = validateCourses(rawCourses, coreAreas, categoryGroups, issues);
  const parameters = makeParameters(parseParametersTab(texts.parameters, issues), issues);

  const byId = new Map<string, RuleCourse[]>();
  for (const c of courses) {
    const list = byId.get(c.courseId) ?? [];
    list.push(c);
    byId.set(c.courseId, list);
  }
  for (const list of byId.values()) {
    list.sort((a, b) => {
      const ai = a.effectiveTerm ? termIndex(a.effectiveTerm) : -Infinity;
      const bi = b.effectiveTerm ? termIndex(b.effectiveTerm) : -Infinity;
      return ai - bi;
    });
  }

  return {
    courses: byId,
    parameters,
    coreAreas,
    categoryGroups,
    issues,
    source: meta.source,
    syncedAt: meta.syncedAt,
    rulesDate: meta.rulesDate,
  };
}

/** Which rules row governs a course taken in `term`?
 * Latest row with effective_term ≤ the course's term (rule changes grandfather
 * past courses); if none matches — every live row currently says Fall 2026 —
 * the EARLIEST row applies retroactively, so students' older courses still
 * resolve. Rows without an effective_term are always in effect. */
export function resolveRuleRow(
  rules: Rules,
  courseId: string,
  term: Term | undefined,
): RuleCourse | undefined {
  const list = rules.courses.get(courseId);
  if (!list || list.length === 0) return undefined;
  if (!term) return list[list.length - 1];
  let best: RuleCourse | undefined;
  for (const row of list) {
    if (!row.effectiveTerm || compareTerm(row.effectiveTerm, term) <= 0) best = row;
  }
  return best ?? list[0]; // none in effect yet → earliest row, retroactively
}
