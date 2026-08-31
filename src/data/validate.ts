// Cross-tab validation + semantic warnings. Everything lands in Rules.issues as
// plain English for the DGS diagnostics panel.
import { termIndex } from '../engine/term.ts';
import type { RuleCourse, SheetIssue } from './types.ts';

export function validateCourses(
  courses: RuleCourse[],
  coreAreas: { code: string }[],
  categoryGroups: { code: string }[],
  issues: SheetIssue[],
): RuleCourse[] {
  const coreCodes = new Set(coreAreas.map((c) => c.code));
  const groupCodes = new Set([...categoryGroups.map((c) => c.code), 'any']);

  const kept: RuleCourse[] = [];
  const seen = new Set<string>();
  for (let c of courses) {
    const termKey = c.effectiveTerm ? termIndex(c.effectiveTerm) : 'always';
    const dupKey = `${c.courseId}|${termKey}`;
    if (seen.has(dupKey)) {
      issues.push({
        severity: 'error',
        tab: 'Courses',
        row: c.sheetRow,
        message: `Courses row ${c.sheetRow}: ${c.courseId} already has a row with the same effective_term — using the first one.`,
      });
      continue;
    }
    seen.add(dupKey);

    if (c.coreArea && !coreCodes.has(c.coreArea)) {
      issues.push({
        severity: 'error',
        tab: 'Courses',
        row: c.sheetRow,
        column: 'core_area',
        message: `Courses row ${c.sheetRow} (${c.courseId}), column core_area: '${c.coreArea}' is not in the Categories tab's core list (${[...coreCodes].join(', ')}) — ignored.`,
      });
      c = { ...c, coreArea: undefined };
    }
    if (c.categoryGroup && !groupCodes.has(c.categoryGroup)) {
      issues.push({
        severity: 'error',
        tab: 'Courses',
        row: c.sheetRow,
        column: 'category_group',
        message: `Courses row ${c.sheetRow} (${c.courseId}), column category_group: '${c.categoryGroup}' is not in the Categories tab's group list (${[...groupCodes].join(', ')}) — ignored.`,
      });
      c = { ...c, categoryGroup: undefined };
    }

    // Semantic sniff: a research/seminar-titled course typed 'regular' would
    // count toward the 24 regular credits (§3.2/§4.2) — almost certainly a
    // sheet mistake (the live sheet has several such rows).
    if (c.courseType === 'regular' && /research|dissertation|seminar|thesis/i.test(c.title)) {
      issues.push({
        severity: 'warning',
        tab: 'Courses',
        row: c.sheetRow,
        column: 'course_type',
        message: `Courses row ${c.sheetRow} (${c.courseId} "${c.title}"): course_type is 'regular', but the title sounds like research/seminar work, which §3.2/§4.2 exclude from regular courses. Double-check this row.`,
      });
    }
    kept.push(c);
  }
  return kept;
}
