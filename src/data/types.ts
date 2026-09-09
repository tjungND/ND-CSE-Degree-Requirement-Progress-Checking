// Rules-side data model: what the DGS's Google Sheet becomes after parsing.
// Schema of record: the live sheet "CSE-Degree-Checking-Rules" (see data/README.md).
import type { Term } from '../engine/types.ts';

export type Counts = 'yes' | 'no' | 'dgs_approval';

/** §5.2 transferability of one course at another university, as the
 * ExternalCourses tab's `transferable` column states it. `yes` = pre-approved
 * by the DGS, so only the Grad Admin's processing is left; `no` = ruled out;
 * `dgs_approval` = decided case by case (DGS 2026-09-08 — a course outside the
 * usual CSE ground that may still transfer when it serves the student's
 * research), so it stays in the review request until the DGS rules on that
 * student's case. Whether it does serve their research is settled between the
 * advisor and the DGS: nothing on the page asks the student to argue it, and
 * the request says only that the decision is open. A blank cell is undefined:
 * not looked at yet. */
export type Transferable = 'yes' | 'no' | 'dgs_approval';

/** category_group values that are valid on a Courses row but are NOT real
 * §4.4.2 specialization groups: 'any' = listed under every group (student
 * picks), 'ineligible' = can never satisfy the category requirement (the DGS
 * marks all 40000-level courses this way). They may appear in the Categories
 * tab for the sheet's own dropdowns, but never join the matchable group list. */
export const RESERVED_GROUP_CODES = ['any', 'ineligible'] as const;

export type CourseType = 'regular' | 'seminar' | 'research' | 'independent' | 'project';

/** One row of the ExternalCourses tab: a course at ANOTHER university the DGS
 * has ruled on (docs/DECISIONS.md, 2026-09-01). `satisfiesCoreArea` says which
 * §4.4.1 core area the course covers (validated against the Categories core
 * list); `transferable` says whether its credits may transfer under §5.2 —
 * `yes`, `no`, or `dgs_approval` for a course decided case by case (undefined =
 * the DGS has not decided that part at all); `ndCredits` is the
 * Notre-Dame-equivalent credit value for non-semester systems — §5.2 "pro-rata"
 * (undefined = count the credits printed on the transcript). */
export interface ExternalRule {
  university: string;
  /** Normalized form of the university name, for matching (the aliases column
   * was retired 2026-09-03 — the name as the transcript prints it is the key). */
  universityKey: string;
  courseId: string;
  title: string;
  satisfiesCoreArea?: string | null; // null = decided, no core area (`none` in the sheet, DGS 2026-09-06); undefined = blank, not decided yet
  transferable?: Transferable;
  /** A FIXED Notre Dame credit value for this one course, when the conversion
   * below cannot express it. Overrides everything. */
  ndCredits?: number;
  /** The credit system this university awards in (DGS 2026-09-08). 'quarter'
   * converts the credits printed on the student's own transcript, which is the
   * only thing that works for a course whose credits vary from term to term
   * (2 to 4); a fixed `nd_credits` cannot. Set it on any row of a university
   * and it applies to every course from that university. */
  creditSystem?: 'quarter' | 'semester';
  decidedOn?: string;
  notes?: string;
  /** 1-based spreadsheet row, for diagnostics. */
  sheetRow: number;
}

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
  /** §4.4.2: every specialization group this course may satisfy (DGS
   * 2026-09-08 — the sheet's `category_group` cell may now name SEVERAL, so a
   * course can be worth a choice of two or three groups and not only one or
   * all five). `any` in the sheet expands to every group at parse time.
   * Undefined = the DGS has not said; empty = explicitly not eligible, which
   * `categoryIneligible` records so the two are never confused. */
  categoryGroups?: string[];
  /** The sheet said `ineligible`: this course can never satisfy §4.4.2. */
  categoryIneligible?: true;
  /** The cell exactly as the sheet holds it, for diagnostics and the course
   * rules page's own label. */
  categoryGroupRaw?: string;
  typicallyOffered?: string;
  /** Is the course on the schedule THIS semester, and the NEXT one (DGS
   * 2026-09-09 — the `offered_now` and `offered_next` columns)? These say what
   * the registrar's schedule says today, where `typicallyOffered` is a pattern
   * from past years. Undefined means the cell is blank: the sheet does not
   * say, which is not the same as "no". */
  offeredNow?: boolean;
  offeredNext?: boolean;
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
  /** A semester code — "FA26", "SP27" (DGS 2026-09-09). */
  term(key: string): Term | undefined;
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
  /** The DGS's rulings on courses from other universities (§4.4.1/§5.2);
   * empty until the ExternalCourses tab exists and is published. */
  external: ExternalRule[];
  issues: SheetIssue[];
  source: 'live' | 'snapshot';
  syncedAt: string;
  /** When the course rules last changed, as far as the app can tell — see
   * `src/data/rules-date.ts`. Undefined only for rules built without a snapshot
   * (tests); then the pages fall back to "are those in effect for <term>". */
  rulesDate?: RulesDate;
}

/** How the pages know when the rules last changed (`src/data/rules-date.ts`).
 *  - `known`: the rules being shown are the snapshot's content (the live sheet
 *    still matches it, or the snapshot itself is in use) → they last changed
 *    at `at`, i.e. when the sync first saw this content.
 *  - `after`: the live sheet differs from the snapshot → it changed some time
 *    after `at`; the next sync run (within 6 hours) records the date and
 *    redeploys. */
export interface RulesDate {
  kind: 'known' | 'after';
  /** ISO instant — the snapshot's `syncedAt`. */
  at: string;
}

/** Display-only parameter keys: read by the pages, never by the engine. Missing
 * is allowed (nothing shows, no warning); present → shown as given. */
export const DISPLAY_PARAMETER_KEYS = [
  // Optional override for the dated line on both pages (YYYY-MM-DD or free
  // text) → "Rules effective as of …". Without it the pages print the date the
  // rules last changed, as recorded by the sync (`rules-date.ts`).
  'rules_effective_date',
  // Who-to-contact overrides (2026-09-04): names and addresses shown in the
  // contact card, the consent notice, and the review-request emails. A key
  // that is missing or blank keeps the fallback baked into
  // src/ui/contacts.ts — so the next DGS updates the sheet, not the code.
  'contact_dgs_name',
  'contact_dgs_email',
  'contact_adgs_name',
  'contact_adgs_email',
  'contact_grad_admin_name',
  'contact_grad_admin_email',
  // Which fall or spring the Courses tab's `offered_now` column describes, as
  // the code the pages print ("FA26", "SP27") — DGS 2026-09-09. Without it the
  // course-rules page cannot tell a current schedule from last year's, so it
  // says "not released yet" rather than showing stale courses under this
  // semester's name. A summer code cannot date a schedule and is refused.
  'offered_semester',
] as const;

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
