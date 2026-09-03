// Header-keyed tab parsers. Never positional: the live Courses tab has 17
// columns, the old samples had 11, and the DGS may insert more — rows are read
// by column name. Malformed cells produce plain-English SheetIssues; prose
// "note rows" at the bottom of a tab are skipped silently.
import { parseTermLabel } from '../engine/term.ts';
import { parseCsv } from './csv.ts';
import { normalizeUniversity } from './external.ts';
import type { CourseType, Counts, ExternalRule, RuleCourse, SheetIssue } from './types.ts';
import { RESERVED_GROUP_CODES } from './types.ts';

const COURSE_ID_RE = /^[A-Z]{2,5} \d{5}$/;
const CODE_RE = /^[a-z0-9_]+$/;

const COURSE_TYPES: CourseType[] = ['regular', 'seminar', 'research', 'independent', 'project'];
const COUNTS: Counts[] = ['yes', 'no', 'dgs_approval'];

interface Tab {
  header: string[];
  /** [spreadsheetRow, cells-by-header-name] */
  rows: [number, Record<string, string>][];
}

function readTab(text: string, tabName: string, issues: SheetIssue[]): Tab {
  const raw = parseCsv(text);
  const header = (raw[0] ?? []).map((h) => h.trim().toLowerCase());
  const seen = new Set<string>();
  for (const name of header) {
    if (!name) continue;
    if (seen.has(name)) {
      issues.push({
        severity: 'error',
        tab: tabName,
        row: 1,
        column: name,
        message: `The ${tabName} tab's header row has two '${name}' columns — only the first is read; delete or rename one.`,
      });
    }
    seen.add(name);
  }
  const rows: Tab['rows'] = [];
  for (let i = 1; i < raw.length; i++) {
    const cells: Record<string, string> = {};
    for (let c = 0; c < header.length; c++) {
      const name = header[c]!;
      if (name && !(name in cells)) cells[name] = (raw[i]![c] ?? '').trim(); // first column wins
    }
    rows.push([i + 1, cells]); // 1-based spreadsheet row (header is row 1)
  }
  return { header, rows };
}

/** A prose note row: its key cell fails the format check and every other
 * meaningful cell is empty (the sheet's tabs end with explanatory sentences). */
function isNoteRow(cells: Record<string, string>, keyColumn: string, keyRe: RegExp): boolean {
  const key = cells[keyColumn] ?? '';
  if (keyRe.test(key)) return false;
  const others = Object.entries(cells).filter(([name]) => name !== keyColumn);
  return others.every(([, v]) => v === '');
}

function isBlankRow(cells: Record<string, string>): boolean {
  return Object.values(cells).every((v) => v === '');
}

// ---------- Courses tab ----------

export function parseCoursesTab(text: string, issues: SheetIssue[]): RuleCourse[] {
  const tab = readTab(text, 'Courses', issues);
  const out: RuleCourse[] = [];
  if (!tab.header.includes('course_id')) {
    issues.push({
      severity: 'error',
      tab: 'Courses',
      message: 'The Courses tab has no course_id column — is the right tab published?',
    });
    return out;
  }
  for (const [rowNum, cells] of tab.rows) {
    const courseId = (cells['course_id'] ?? '').toUpperCase().replace(/\s+/g, ' ').trim();
    // Note-row check runs on the NORMALIZED id, so "cse 60641" is a data row
    // (parsed below), not a silently skipped note.
    if (isBlankRow(cells) || isNoteRow({ ...cells, course_id: courseId }, 'course_id', COURSE_ID_RE))
      continue;
    if (!COURSE_ID_RE.test(courseId)) {
      issues.push({
        severity: 'error',
        tab: 'Courses',
        row: rowNum,
        column: 'course_id',
        message: `Courses row ${rowNum}, column course_id: '${cells['course_id']}' is not in the form 'CSE 60641' (department, space, five digits). Row skipped.`,
      });
      continue;
    }

    const bad = (column: string, value: string, allowed: string) => {
      issues.push({
        severity: 'error',
        tab: 'Courses',
        row: rowNum,
        column,
        message: `Courses row ${rowNum} (${courseId}), column ${column}: '${value}' is not one of ${allowed}. Row skipped.`,
      });
    };

    // A blank course_type must not silently become 'regular' (which counts
    // toward the 24 regular credits) — report it and skip the row.
    const typeRaw = cells['course_type'] ?? '';
    if (typeRaw === '') {
      bad('course_type', '(blank)', COURSE_TYPES.join('|'));
      continue;
    }
    if (!COURSE_TYPES.includes(typeRaw as CourseType)) {
      bad('course_type', typeRaw, COURSE_TYPES.join('|'));
      continue;
    }
    const courseType = typeRaw as CourseType;

    const activeRaw = cells['active'] ?? '';
    if (activeRaw !== '' && activeRaw !== 'yes' && activeRaw !== 'no') {
      issues.push({
        severity: 'warning',
        tab: 'Courses',
        row: rowNum,
        column: 'active',
        message: `Courses row ${rowNum} (${courseId}), column active: '${activeRaw}' is not yes|no — treating it as yes.`,
      });
    }

    const countsOf = (column: string): Counts | undefined | null => {
      const v = cells[column] ?? '';
      if (v === '') return undefined; // blank → the app says "needs DGS review"
      if (!COUNTS.includes(v as Counts)) {
        bad(column, v, COUNTS.join('|'));
        return null;
      }
      return v as Counts;
    };
    const countsTowardMscse = countsOf('counts_toward_mscse');
    if (countsTowardMscse === null) continue;
    const countsTowardPhd = countsOf('counts_toward_phd');
    if (countsTowardPhd === null) continue;

    const numberOf = (column: string): number | undefined => {
      const v = cells[column] ?? '';
      if (v === '') return undefined;
      const n = Number(v);
      if (!Number.isFinite(n)) {
        issues.push({
          severity: 'warning',
          tab: 'Courses',
          row: rowNum,
          column,
          message: `Courses row ${rowNum} (${courseId}), column ${column}: '${v}' is not a number — ignored.`,
        });
        return undefined;
      }
      return n;
    };

    let effectiveTerm = undefined;
    const termRaw = cells['effective_term'] ?? '';
    if (termRaw !== '') {
      effectiveTerm = parseTermLabel(termRaw);
      if (!effectiveTerm) {
        issues.push({
          severity: 'warning',
          tab: 'Courses',
          row: rowNum,
          column: 'effective_term',
          message: `Courses row ${rowNum} (${courseId}), column effective_term: '${termRaw}' is not like 'Fall 2026' — treating the row as always in effect.`,
        });
      }
    }

    const levelFromId = Number(courseId.split(' ')[1]![0]);
    out.push({
      courseId,
      title: cells['title'] ?? '',
      level: numberOf('level') ?? levelFromId,
      creditMin: numberOf('credit_min'),
      creditMax: numberOf('credit_max'),
      creditsDefault: numberOf('credits_default'),
      courseType,
      countsTowardMscse,
      countsTowardPhd,
      coreArea: cells['core_area'] || undefined,
      categoryGroup: cells['category_group'] || undefined,
      typicallyOffered: cells['typically_offered'] || undefined,
      active: activeRaw !== 'no',
      effectiveTerm,
      notes: cells['notes'] || undefined,
      dgsReviewed: (cells['dgs_reviewed'] ?? '').trim().toLowerCase() === 'yes',
      sheetRow: rowNum,
    });
  }
  return out;
}

// ---------- Parameters tab ----------

export function parseParametersTab(
  text: string,
  issues: SheetIssue[],
): Map<string, { value: string; section: string; row: number }> {
  const tab = readTab(text, 'Parameters', issues);
  const out = new Map<string, { value: string; section: string; row: number }>();
  for (const [rowNum, cells] of tab.rows) {
    if (isBlankRow(cells) || isNoteRow(cells, 'key', CODE_RE)) continue;
    const key = cells['key'] ?? '';
    if (!CODE_RE.test(key)) {
      issues.push({
        severity: 'error',
        tab: 'Parameters',
        row: rowNum,
        column: 'key',
        message: `Parameters row ${rowNum}, column key: '${key}' is not a lowercase_underscore key. Row skipped.`,
      });
      continue;
    }
    if (out.has(key)) {
      issues.push({
        severity: 'error',
        tab: 'Parameters',
        row: rowNum,
        column: 'key',
        message: `Parameters row ${rowNum}: key '${key}' appears more than once — using the first value.`,
      });
      continue;
    }
    out.set(key, { value: cells['value'] ?? '', section: cells['handbook_section'] ?? '', row: rowNum });
  }
  return out;
}

// ---------- Categories tab (two lists side by side) ----------

export function parseCategoriesTab(
  text: string,
  issues: SheetIssue[],
): { coreAreas: { code: string; name: string }[]; categoryGroups: { code: string; name: string }[] } {
  const tab = readTab(text, 'Categories', issues);
  const coreAreas: { code: string; name: string }[] = [];
  const categoryGroups: { code: string; name: string }[] = [];
  const dup = (column: string, code: string, rowNum: number) =>
    issues.push({
      severity: 'error',
      tab: 'Categories',
      row: rowNum,
      column,
      message: `Categories row ${rowNum}: the code '${code}' appears twice in ${column} — using the first entry.`,
    });
  for (const [rowNum, cells] of tab.rows) {
    // Each half is read independently; a prose note row has an invalid code in
    // one half and nothing in the other, so both halves just skip it.
    const core = cells['core_area'] ?? '';
    if (CODE_RE.test(core)) {
      if (coreAreas.some((c) => c.code === core)) dup('core_area', core, rowNum);
      else coreAreas.push({ code: core, name: cells['core_area_name'] || core });
    } else if (core !== '' && (cells['core_area_name'] ?? '') !== '') {
      issues.push({
        severity: 'error',
        tab: 'Categories',
        row: rowNum,
        column: 'core_area',
        message: `Categories row ${rowNum}, column core_area: '${core}' is not a lowercase code. Entry skipped.`,
      });
    }
    const group = cells['category_group'] ?? '';
    if (CODE_RE.test(group)) {
      // Reserved codes ('any', 'ineligible') may sit in this list for the
      // sheet's own dropdowns, but they are NOT matchable §4.4.2 groups.
      if (!(RESERVED_GROUP_CODES as readonly string[]).includes(group)) {
        if (categoryGroups.some((c) => c.code === group)) dup('category_group', group, rowNum);
        else categoryGroups.push({ code: group, name: cells['category_group_name'] || group });
      }
    } else if (group !== '' && (cells['category_group_name'] ?? '') !== '') {
      issues.push({
        severity: 'error',
        tab: 'Categories',
        row: rowNum,
        column: 'category_group',
        message: `Categories row ${rowNum}, column category_group: '${group}' is not a lowercase code. Entry skipped.`,
      });
    }
  }
  return { coreAreas, categoryGroups };
}

// ---------- ExternalCourses tab (courses at other universities, §4.4.1/§5.2) ----------

export function parseExternalTab(
  text: string,
  coreAreas: { code: string; name: string }[],
  issues: SheetIssue[],
): ExternalRule[] {
  const tab = readTab(text, 'ExternalCourses', issues);
  const out: ExternalRule[] = [];
  const err = (rowNum: number, column: string, message: string) =>
    issues.push({ severity: 'error', tab: 'ExternalCourses', row: rowNum, column, message });

  let aliasContentSeen = false;
  for (const [rowNum, cells] of tab.rows) {
    if (isBlankRow(cells)) continue;
    if ((cells['university_aliases'] ?? '').trim() !== '') aliasContentSeen = true;
    const university = cells['university'] ?? '';
    const courseId = cells['course_id'] ?? '';
    // Prose note rows (the tab ends with explanatory sentences): a filled
    // university cell with everything else empty.
    if (university !== '' && courseId === '' && Object.entries(cells).every(([k, v]) => k === 'university' || v === '')) continue;
    if (university === '' || courseId === '') {
      err(rowNum, university === '' ? 'university' : 'course_id',
        `ExternalCourses row ${rowNum} is missing its ${university === '' ? 'university' : 'course_id'} — row skipped.`);
      continue;
    }

    const rule: ExternalRule = {
      university,
      universityKey: normalizeUniversity(university),
      courseId,
      title: cells['course_title'] ?? '',
      decidedOn: cells['decided_on'] || undefined,
      notes: cells['notes'] || undefined,
      sheetRow: rowNum,
    };

    const core = (cells['satisfies_core_area'] ?? '').toLowerCase();
    if (core !== '') {
      if (coreAreas.some((a) => a.code === core)) rule.satisfiesCoreArea = core;
      else {
        err(rowNum, 'satisfies_core_area',
          `ExternalCourses row ${rowNum} (${university} ${courseId}): satisfies_core_area '${core}' is not one of the Categories tab's core areas (${coreAreas.map((a) => a.code).join(', ')}). That cell is ignored.`);
      }
    }

    const transferable = (cells['transferable'] ?? '').toLowerCase();
    if (transferable === 'yes') rule.transferable = true;
    else if (transferable === 'no') rule.transferable = false;
    else if (transferable !== '') {
      err(rowNum, 'transferable',
        `ExternalCourses row ${rowNum} (${university} ${courseId}): transferable must be 'yes', 'no' or blank (undecided) — got '${transferable}'. That cell is ignored.`);
    }

    const nd = cells['nd_credits'] ?? '';
    if (nd !== '') {
      const n = Number(nd);
      if (Number.isFinite(n) && n >= 0 && n <= 30) rule.ndCredits = n;
      else err(rowNum, 'nd_credits', `ExternalCourses row ${rowNum} (${university} ${courseId}): nd_credits '${nd}' is not a number between 0 and 30. That cell is ignored (credits as printed will count).`);
    }

    const dup = out.find(
      (r) => r.universityKey === rule.universityKey && r.courseId.toUpperCase().replace(/[^A-Z0-9]/g, '') === courseId.toUpperCase().replace(/[^A-Z0-9]/g, ''),
    );
    if (dup) {
      issues.push({
        severity: 'warning',
        tab: 'ExternalCourses',
        row: rowNum,
        message: `ExternalCourses row ${rowNum} repeats ${university} ${courseId} (already in row ${dup.sheetRow}) — the first row wins.`,
      });
      continue;
    }
    out.push(rule);
  }
  if (aliasContentSeen) {
    issues.push({
      severity: 'warning',
      tab: 'ExternalCourses',
      column: 'university_aliases',
      message:
        'The university_aliases column is no longer used (decision 2026-09-03): courses are matched by the ' +
        'university name exactly as the transcript prints it. The column can be deleted.',
    });
  }
  return out;
}
