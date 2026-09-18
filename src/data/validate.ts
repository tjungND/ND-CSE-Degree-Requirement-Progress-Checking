// Cross-tab validation + semantic warnings. Everything lands in Rules.issues as
// plain English for the DGS diagnostics panel.
import { termIndex } from '../engine/term.ts';
import type { RuleCourse, SheetIssue } from './types.ts';
import { RESERVED_GROUP_CODES } from './types.ts';

export function validateCourses(
  courses: RuleCourse[],
  coreAreas: { code: string }[],
  categoryGroups: { code: string }[],
  issues: SheetIssue[],
): RuleCourse[] {
  const coreCodes = new Set(coreAreas.map((c) => c.code));
  const groupCodes = new Set([...categoryGroups.map((c) => c.code), ...RESERVED_GROUP_CODES]);

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
        message: `Courses row ${c.sheetRow}: ${c.courseId} already has a row with the same rules_effective_term — using the first one.`,
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
    // A cell may now name several groups (DGS 2026-09-08): each code is
    // checked on its own, the good ones are kept, and only the bad ones are
    // reported — a typo in one code must not throw away the others.
    if (c.categoryGroups && c.categoryGroups.length > 0) {
      const bad = c.categoryGroups.filter((g) => !groupCodes.has(g));
      if (bad.length > 0) {
        issues.push({
          severity: 'error',
          tab: 'Courses',
          row: c.sheetRow,
          column: 'category_group',
          message: `Courses row ${c.sheetRow} (${c.courseId}), column category_group: ${bad.map((g) => `'${g}'`).join(', ')} ${bad.length === 1 ? 'is' : 'are'} not in the Categories tab's group list (${[...groupCodes].join(', ')}) — ignored. A cell may name one group, or several separated by ';'.`,
        });
        const kept = c.categoryGroups.filter((g) => groupCodes.has(g));
        c = { ...c, ...(kept.length > 0 ? { categoryGroups: kept } : { categoryGroups: undefined }) };
      }
    }

    // `ineligible` with a group code beside it is a cell that says two
    // opposite things (review R-12, 2026-09-18). `ineligible` wins, silently,
    // so a course the DGS meant to list under Algorithms disappears from that
    // card — with the raw cell still reading "alg; ineligible" in the sheet.
    if (c.categoryIneligible && /[a-z]/i.test((c.categoryGroupRaw ?? '').replace(/ineligible/gi, ''))) {
      issues.push({
        severity: 'warning',
        tab: 'Courses',
        row: c.sheetRow,
        column: 'category_group',
        message: `Courses row ${c.sheetRow} (${c.courseId}), column category_group: '${c.categoryGroupRaw}' says 'ineligible' AND names a group. 'ineligible' wins — the course satisfies no §4.4.2 category. Delete one of the two.`,
      });
    }

    // A course marked as running this semester or next while its `active` cell
    // says it is retired (review B-4, 2026-09-18). The schedule cards show
    // live rows only, so the course silently went missing from the card the
    // sheet had just put it on — four live rows were in this state.
    if (!c.active && (c.offeredNow === true || c.offeredNext === true)) {
      issues.push({
        severity: 'warning',
        tab: 'Courses',
        row: c.sheetRow,
        column: 'active',
        message: `Courses row ${c.sheetRow} (${c.courseId}): active is 'no' (retired) but ${c.offeredNow === true && c.offeredNext === true ? 'offered_now and offered_next are' : c.offeredNow === true ? 'offered_now is' : 'offered_next is'} 'yes'. A retired course is not shown on the schedule cards, so those cells have no effect — clear them, or set active to 'yes'.`,
      });
    }

    // Semantic sniff: a research/seminar-titled course typed 'regular' would
    // count toward the 24 regular credits (§3.2/§4.2) — almost certainly a
    // sheet mistake (the live sheet has several such rows).
    if (c.courseType === 'regular' && /\b(research|dissertation|seminar|thesis)\b/i.test(c.title)) {
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
