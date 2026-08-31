// Header-keyed tab parsers. Never positional: the live Courses tab has 17
// columns, the old samples had 11, and the DGS may insert more — rows are read
// by column name. Malformed cells produce plain-English SheetIssues; prose
// "note rows" at the bottom of a tab are skipped silently.
import { parseTermLabel } from '../engine/term.ts';
import { parseCsv } from './csv.ts';
import type { CourseType, Counts, RuleCourse, SheetIssue } from './types.ts';

const COURSE_ID_RE = /^[A-Z]{2,5} \d{5}$/;
const CODE_RE = /^[a-z0-9_]+$/;

const COURSE_TYPES: CourseType[] = ['regular', 'seminar', 'research', 'independent', 'project'];
const COUNTS: Counts[] = ['yes', 'no', 'dgs_approval'];

interface Tab {
  header: string[];
  /** [spreadsheetRow, cells-by-header-name] */
  rows: [number, Record<string, string>][];
}

function readTab(text: string): Tab {
  const raw = parseCsv(text);
  const header = (raw[0] ?? []).map((h) => h.trim().toLowerCase());
  const rows: Tab['rows'] = [];
  for (let i = 1; i < raw.length; i++) {
    const cells: Record<string, string> = {};
    for (let c = 0; c < header.length; c++) {
      const name = header[c]!;
      if (name) cells[name] = (raw[i]![c] ?? '').trim();
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
  const tab = readTab(text);
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
    if (isBlankRow(cells) || isNoteRow(cells, 'course_id', COURSE_ID_RE)) continue;
    const courseId = (cells['course_id'] ?? '').toUpperCase().replace(/\s+/g, ' ').trim();
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

    const typeRaw = cells['course_type'] || 'regular';
    if (!COURSE_TYPES.includes(typeRaw as CourseType)) {
      bad('course_type', typeRaw, COURSE_TYPES.join('|'));
      continue;
    }
    const courseType = typeRaw as CourseType;

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
      active: (cells['active'] || 'yes') !== 'no',
      effectiveTerm,
      notes: cells['notes'] || undefined,
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
  const tab = readTab(text);
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
  const tab = readTab(text);
  const coreAreas: { code: string; name: string }[] = [];
  const categoryGroups: { code: string; name: string }[] = [];
  for (const [rowNum, cells] of tab.rows) {
    // Each half is read independently; a prose note row has an invalid code in
    // one half and nothing in the other, so both halves just skip it.
    const core = cells['core_area'] ?? '';
    if (CODE_RE.test(core)) {
      coreAreas.push({ code: core, name: cells['core_area_name'] || core });
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
      if (group !== 'any') categoryGroups.push({ code: group, name: cells['category_group_name'] || group });
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
