// Rules-side data model: what the DGS's Google Sheet becomes after parsing.
// Schema of record: the live sheet "CSE-Degree-Audit-Rules" (see data/README.md).
import type { Term } from '../engine/types.ts';

export type Counts = 'yes' | 'no' | 'dgs_approval';

/** category_group values that are valid on a Courses row but are NOT real
 * §4.4.2 specialization groups: 'any' = listed under every group (student
 * picks), 'ineligible' = can never satisfy the category requirement (the DGS
 * marks all 40000-level courses this way). They may appear in the Categories
 * tab for the sheet's own dropdowns, but never join the matchable group list. */
export const RESERVED_GROUP_CODES = ['any', 'ineligible'] as const;

export type CourseType = 'regular' | 'seminar' | 'research' | 'independent' | 'project';

/** One row of the Courses tab (the same course_id may appear in several rows
 * with different effective_term values — see resolveRuleRow in assemble.ts). */
export interface RuleCourse {
  courseId: string;
  title: string;
  level?: number; // 4..9; falls back to the first digit of the course number
  creditMin?: number;
  creditMax?: number;
  creditsDefault?: number;
  courseType: CourseType;
  countsTowardMscse?: Counts; // blank → needs DGS review
  countsTowardPhd?: Counts;
  coreArea?: string; // validated against the Categories core list (§4.4.1)
  categoryGroup?: string; // validated against the Categories groups + RESERVED_GROUP_CODES (§4.4.2)
  typicallyOffered?: string;
  active: boolean; // course-picker visibility only
  effectiveTerm?: Term;
  notes?: string;
  /** dgs_reviewed = yes: the DGS has confirmed this row. Shown on the public
   * course list; the audit engine ignores it (an unreviewed 'yes' still counts). */
  dgsReviewed: boolean;
  /** 1-based spreadsheet row, for diagnostics. */
  sheetRow: number;
}

export interface SheetIssue {
  severity: 'error' | 'warning';
  tab: string;
  row?: number;
  column?: string;
  message: string; // plain English, written for a DGS editing a spreadsheet
}

/** Typed accessors over the Parameters tab. A missing/bad value returns
 * undefined (the engine then reports "cannot evaluate"), never a guess. */
export interface Parameters {
  number(key: string): number | undefined;
  gradeLetter(key: string): string | undefined;
  courseList(key: string): string[] | undefined;
  section(key: string): string | undefined;
  has(key: string): boolean;
  raw: ReadonlyMap<string, { value: string; section: string; row: number }>;
}

export interface Rules {
  /** courseId → all its rows, sorted by effectiveTerm ascending. */
  courses: ReadonlyMap<string, RuleCourse[]>;
  parameters: Parameters;
  coreAreas: { code: string; name: string }[];
  categoryGroups: { code: string; name: string }[]; // the real groups; 'any' is not one
  issues: SheetIssue[];
  source: 'live' | 'snapshot';
  syncedAt: string;
}

/** Parameter keys the app reads. Anything else in the sheet is ignored with a
 * gentle warning; anything here that is missing makes its requirement
 * "cannot evaluate". Keep in sync with data/README.md. */
export const KNOWN_PARAMETER_KEYS = [
  'ms_total_credits_min',
  'ms_regular_credits_min',
  'ms_project_credits_min',
  'ms_4xxxx_credits_max',
  'ms_noncse_credits_max',
  'ms_time_limit_years',
  'ms_thesis_readers_min',
  'ms_transfer_completed_ms_credits_max',
  'phd_total_credits_min',
  'phd_regular_credits_min',
  'phd_nd_credits_min',
  'phd_seminar_courses',
  'phd_4xxxx_cse_credits_max',
  'phd_noncse_6xxxx_credits_max',
  'phd_transfer_window_years',
  'phd_transfer_completed_ms_credits_max',
  'phd_residency_semesters',
  'phd_time_limit_years',
  'transfer_unfinished_ms_credits_max',
  'transfer_min_grade',
  'fulltime_credits_min',
  'qualifier_deadline_semesters',
  'category_courses_required',
  'category_distinct_groups_required',
  'category_min_grade',
  'research_qualifier_deadline_months',
  'candidacy_deadline_semester',
  'candidacy_committee_additional_members_min',
  'gpa_min',
] as const;
