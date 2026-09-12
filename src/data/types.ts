// Rules-side data model: what the DGS's Google Sheet becomes after parsing.
// Schema of record: the live sheet "CSE-Degree-Checking-Rules" (see data/README.md).
import type { Term } from '../engine/types.ts';

/** `adgs_approval` beside `dgs_approval` (DGS 2026-09-12): the cell names WHO
 * signs off, so a future DGS can move a course's authority back without a code
 * change. */
export type Counts = 'yes' | 'no' | 'dgs_approval' | 'adgs_approval';

/** §5.2 transferability of one course at another university, as the
 * ExternalCourses tab states it. `yes` = pre-approved, so only the Grad
 * Admin's processing is left; `no` = ruled out; `dgs_approval` /
 * `adgs_approval` = this one needs an approval, so it stays in the review
 * request until it is given (DGS 2026-09-08, split 2026-09-09). A blank cell
 * is undefined: not looked at yet.
 *
 * The two approval words are treated as ONE case for now (DGS 2026-09-09:
 * "you can treat dgs_approval = adgs_approval"), and both are read as "DGS
 * approval is needed". They are kept apart in the type rather than collapsed
 * at parse time, so the day the DGS wants the MSCSE message to name the ADGS
 * instead, the sheet's own word is still there to key on. */
export type Transferable = 'yes' | 'no' | 'dgs_approval' | 'adgs_approval';

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
 * list); the two `transferable_*` columns say whether its credits may transfer
 * under §5.2 — separately for a Ph.D. and an MSCSE student since 2026-09-09
 * (undefined = that part is not decided for that program); `ndCredits` is the
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
  /** §5.2 transferability, decided per PROGRAM since 2026-09-09: the sheet's
   * `transferable_PhD` and `transferable_MSCSE` columns. A sheet still using
   * the single `transferable` column fills both. Read them through
   * `transferableFor(rule, program)` — never directly, or a Ph.D. ruling will
   * be applied to an MSCSE student. */
  transferablePhd?: Transferable;
  transferableMscse?: Transferable;
  /** A FIXED Notre Dame credit value for this one course, when the conversion
   * below cannot express it. Overrides everything. */
  ndCredits?: number;
  /** The credit system this university awards in (DGS 2026-09-08). 'quarter'
   * converts the credits printed on the student's own transcript, which is the
   * only thing that works for a course whose credits vary from term to term
   * (2 to 4); a fixed `nd_credits` cannot. Set it on any row of a university
   * and it applies to every course from that university. */
  creditSystem?: 'quarter' | 'semester';
  /** Is this a CSE course, for §4.2's nine-credit allowance for courses "taken
   * from a department other than CSE"? (DGS 2026-09-09.) Other universities
   * name the department every way there is — CS, CompSci, CSCI, CSYE, ECE, CE
   * — and several of those mean CSE at one school and not at another, which no
   * app can settle on its own. `cse_subject_codes` in the Parameters tab
   * settles the unambiguous codes; this cell is the DGS's ruling for a course
   * the code cannot settle, and it wins. Undefined = the sheet has not said,
   * and the allowance is not applied to the course at all. */
  isCse?: boolean;
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
  /** A list of SUBJECT codes, upper-cased ("CS; CSCI" → ['CS','CSCI']).
   * undefined = the key is missing OR its cell is blank — either way the
   * sheet has not said, and nothing is decided from it. */
  codeList(key: string): string[] | undefined;
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
// PARKED: a key the sheet carries that the engine does not read today.
// `phd_senior_grad_credits_max` was added and withdrawn on 2026-09-10, when the
// DGS took the §5.2 question to the Graduate School: until they answer, no
// credit earned before the bachelor's degree transfers, so there is no
// allowance to size. The row stays in the Parameters tab with the DGS's value
// (6 = §3.5's two 3-credit courses), listed here so it raises no "the app does
// not know this key" warning, and the engine will read it again the day the
// allowance comes back. Delete both if the Graduate School refuses.
const PARKED_PARAMETER_KEYS = ['phd_senior_grad_credits_max'] as const;

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
  // The semester the sheet as a whole is current for, as the code the pages
  // print ("FA26", "SP27") — DGS 2026-09-09, generalised from the narrower
  // `offered_semester` the same day. It is what the course-rules page reads
  // the Courses tab's `offered_now` / `offered_next` columns against: without
  // it the page cannot tell a current schedule from last year's, so it says
  // "not released yet" rather than showing stale courses under this semester's
  // name. A summer code cannot date a schedule and is refused.
  //
  // NOTE for whoever bumps it: the schedule columns are read as describing THIS
  // semester and the next. Moving this stamp forward without revisiting them
  // republishes an old schedule under a new semester's name — the one thing
  // the key exists to prevent.
  'current_semester',
  // The name it had for a few hours on 2026-09-09. Still read, so a sheet that
  // has not been renamed keeps working; `current_semester` wins where both
  // exist. Delete this once no sheet uses it.
  'offered_semester',
  ...PARKED_PARAMETER_KEYS,
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
  // §3.5, through the DGS (2026-09-10): "an ND 4+1 student can have up to 6
  // credits (whether 40xxx or 60xxx courses) counted towards both degrees" —
  // how much of an MSCSE student's coursework may also have counted toward
  // their bachelor's. The Ph.D. has no equivalent: its limit is that no course
  // may count toward all three degrees.
  'ms_bs_double_count_credits_max',
  'ms_time_limit_years',
  'ms_thesis_readers_min',
  'ms_transfer_completed_ms_credits_max',
  'ms_transfer_window_years',
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
  // The subject codes that mean "a CSE course" on ANOTHER university's
  // transcript (DGS 2026-09-09): "CS; CSCI; COMPSCI; CSYE". §4.2 caps credits
  // "taken from a department other than CSE" at nine, and until this existed
  // the app could not tell one department from another on a transcript it did
  // not write. A code the list does not name is treated as outside CSE — say
  // otherwise in an ExternalCourses row's `is_cse` cell, which wins. Notre
  // Dame's own courses are decided by their own subject, never by this list.
  'cse_subject_codes',
] as const;
