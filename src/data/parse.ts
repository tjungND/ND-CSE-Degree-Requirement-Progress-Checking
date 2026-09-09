// Header-keyed tab parsers. Never positional: the live Courses tab has 17
// columns, the old samples had 11, and the DGS may insert more — rows are read
// by column name. Malformed cells produce plain-English SheetIssues; prose
// "note rows" at the bottom of a tab are skipped silently.
import { parseTermLabel } from '../engine/term.ts';
import { parseCsv } from './csv.ts';
import { normalizeUniversity } from './external.ts';
import type { CourseType, Counts, ExternalRule, RuleCourse, SheetIssue, Transferable } from './types.ts';
import { RESERVED_GROUP_CODES } from './types.ts';

const COURSE_ID_RE = /^[A-Z]{2,5} \d{5}$/;
const CODE_RE = /^[a-z0-9_]+$/;

const COURSE_TYPES: CourseType[] = ['regular', 'seminar', 'research', 'independent', 'project'];
const COUNTS: Counts[] = ['yes', 'no', 'dgs_approval'];
const TRANSFERABLE: Transferable[] = ['yes', 'no', 'dgs_approval'];

/** A verdict cell as typed by a human into a spreadsheet. The DGS types these
 * by hand, so "DGS approval", "dgs-approval" and "DGS Approval" all mean
 * `dgs_approval` (2026-09-08 — a rejected cell reads as "not decided", which is
 * safe but silently loses the ruling the DGS thought they had recorded). Case
 * and the separator are all that is forgiven; a different word is still an
 * error the diagnostics report. */
function verdictWord(cell: string | undefined): string {
  return (cell ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
}

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

/** The §4.4.2 groups a `category_group` cell names (DGS 2026-09-08). One code,
 * several separated by `;` `,` `|` `/` or spaces, `any` for every group, or
 * `ineligible`. Codes are validated later against the Categories tab, so this
 * only splits and tidies; the raw cell is kept for the diagnostics. */
export function categoryGroupsOf(cell: string | undefined): {
  categoryGroups?: string[];
  categoryIneligible?: true;
  categoryGroupRaw?: string;
} {
  const raw = (cell ?? '').trim();
  if (raw === '') return {};
  const codes = raw
    .split(/[;,|/\s]+/)
    .map((c) => c.trim().toLowerCase())
    .filter((c) => c !== '');
  if (codes.includes('ineligible')) return { categoryIneligible: true, categoryGroupRaw: raw };
  // `any` anywhere in the cell means every group — a course listed as "any"
  // plus a code is still every group, and saying so is simpler than guessing.
  if (codes.includes('any')) return { categoryGroups: ['any'], categoryGroupRaw: raw };
  return { categoryGroups: [...new Set(codes)], categoryGroupRaw: raw };
}

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
      const raw = cells[column] ?? '';
      if (raw === '') return undefined; // blank → the app says "needs DGS review"
      const v = verdictWord(raw);
      if (!COUNTS.includes(v as Counts)) {
        bad(column, raw, COUNTS.join('|'));
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

    // offered_now / offered_next (DGS 2026-09-09): is the course on the
    // schedule this semester, and the next one? A blank cell is UNDEFINED —
    // the sheet has not said — which the course-rules page treats as "not
    // listed as offered", never as a promise that it is not.
    const offeredOf = (column: 'offered_now' | 'offered_next'): boolean | undefined => {
      const v = verdictWord(cells[column]);
      if (v === '') return undefined;
      if (v === 'yes') return true;
      if (v === 'no') return false;
      // Not `bad()`: that one says "Row skipped", and only this cell is.
      issues.push({
        severity: 'error',
        tab: 'Courses',
        row: rowNum,
        column,
        message: `Courses row ${rowNum} (${courseId}), column ${column}: '${cells[column] ?? ''}' is not 'yes', 'no' or blank. That cell is ignored — the course is not listed as offered.`,
      });
      return undefined;
    };
    const offeredNow = offeredOf('offered_now');
    const offeredNext = offeredOf('offered_next');

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
      ...categoryGroupsOf(cells['category_group']),
      typicallyOffered: cells['typically_offered'] || undefined,
      ...(offeredNow !== undefined ? { offeredNow } : {}),
      ...(offeredNext !== undefined ? { offeredNext } : {}),
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

    // satisfies_core_area: a core-area code, `none` (decided: no core area —
    // DGS 2026-09-06, so a core-sounding title stops asking for a ruling), or
    // blank (not decided yet — the course stays in the review request).
    const core = (cells['satisfies_core_area'] ?? '').trim().toLowerCase();
    if (core === 'none') rule.satisfiesCoreArea = null;
    else if (core !== '') {
      if (coreAreas.some((a) => a.code === core)) rule.satisfiesCoreArea = core;
      else {
        err(rowNum, 'satisfies_core_area',
          `ExternalCourses row ${rowNum} (${university} ${courseId}): satisfies_core_area '${core}' is not one of the Categories tab's core areas (${coreAreas.map((a) => a.code).join(', ')}), 'none' or blank. That cell is ignored.`);
      }
    }

    // transferable: `yes` (pre-approved), `no` (ruled out), `dgs_approval`
    // (decided case by case — DGS 2026-09-08, for a course outside the usual
    // CSE ground that may still transfer when it serves the dissertation), or
    // blank (not decided at all). The same three words the Courses tab uses.
    const transferable = verdictWord(cells['transferable']);
    if (TRANSFERABLE.includes(transferable as Transferable)) rule.transferable = transferable as Transferable;
    else if (transferable !== '') {
      err(rowNum, 'transferable',
        `ExternalCourses row ${rowNum} (${university} ${courseId}): transferable must be ${TRANSFERABLE.map((t) => `'${t}'`).join(', ')} or blank (undecided) — got '${cells['transferable']}'. That cell is ignored.`);
    }

    // nd_credits: a FIXED Notre Dame value for this one course. It cannot
    // describe a course whose credits vary (2 to 4), which is what
    // credit_system is for (DGS 2026-09-08); a value here still wins.
    const nd = cells['nd_credits'] ?? '';
    if (nd !== '') {
      const n = Number(nd);
      if (Number.isFinite(n) && n >= 0 && n <= 30) rule.ndCredits = n;
      else err(rowNum, 'nd_credits', `ExternalCourses row ${rowNum} (${university} ${courseId}): nd_credits '${nd}' is not a number between 0 and 30. That cell is ignored (credits as printed will count).`);
    }

    // credit_system: the university's own system. 'quarter' converts whatever
    // the student's transcript prints, so a 2-to-4-credit course converts
    // correctly every time (DGS 2026-09-08).
    const system = (cells['credit_system'] ?? '').trim().toLowerCase();
    if (system === 'quarter' || system === 'semester') rule.creditSystem = system;
    else if (system !== '') {
      err(rowNum, 'credit_system',
        `ExternalCourses row ${rowNum} (${university} ${courseId}): credit_system must be 'quarter', 'semester' or blank — got '${system}'. That cell is ignored (credits count as printed).`);
    }

    // Two rows for the same university + course: the LAST row wins (DGS
    // 2026-09-06 — a corrected row pasted below an old one takes effect),
    // with a warning so the older row can be deleted.
    const dupIndex = out.findIndex(
      (r) => r.universityKey === rule.universityKey && r.courseId.toUpperCase().replace(/[^A-Z0-9]/g, '') === courseId.toUpperCase().replace(/[^A-Z0-9]/g, ''),
    );
    if (dupIndex >= 0) {
      const dup = out[dupIndex]!;
      issues.push({
        severity: 'warning',
        tab: 'ExternalCourses',
        row: rowNum,
        message: `ExternalCourses row ${rowNum} repeats ${university} ${courseId} (already in row ${dup.sheetRow}) — the last row wins: row ${rowNum} replaces row ${dup.sheetRow}; delete the older one.`,
      });
      out.splice(dupIndex, 1, rule);
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
