// Student-side data model. See docs/DECISIONS.md for every interpretation choice.
// The engine is pure: audit(student, rules, today) — no DOM, no fetch, no Date.now().

export type Program = 'mscse' | 'phd';

/** §3.4 — "the M.S. project or thesis requirement can be satisfied in one of two ways". */
export type MsOption = 'project' | 'thesis' | 'undecided';

export type Season = 'spring' | 'summer' | 'fall';

export interface Term {
  season: Season;
  year: number;
}

/** IP = in progress (registered, no final grade yet). S/U = satisfactory/unsatisfactory. */
export type Grade =
  | 'A' | 'A-' | 'B+' | 'B' | 'B-' | 'C+' | 'C' | 'C-' | 'D' | 'F'
  | 'S' | 'U' | 'IP';

export type CoreArea = 'os' | 'algorithms' | 'architecture';
export type CategoryGroup = 'alg' | 'hcc' | 'arch' | 'dsai' | 'sys';

export interface CourseEntry {
  /** 'CSE 60641' — or free text for non-CSE / unknown courses (decision Q6). */
  courseId: string;
  title?: string;
  credits: number;
  term: Term;
  grade: Grade;
  origin: 'nd' | 'transfer';
  /** transfer-only */
  institution?: string;
  /** transfer-only: which uploaded transcript (degree level) the course came
   * from. Bachelor's coursework can satisfy §4.4.1 core knowledge but can never
   * transfer credit — §5.2 requires graduate courses taken with graduate
   * student status. Absent on manual transfer entries (treated as graduate).
   * Also set on Notre Dame courses taken BEFORE the entry term (2026-09-05):
   * a Notre Dame transcript that includes an earlier degree yields prior
   * coursework — origin 'transfer', institution "University of Notre Dame",
   * level from the transcript's UG/GR column. */
  degreeLevel?: 'bachelors' | 'masters' | 'phd';
  /** Notre Dame transcript rows (2026-09-05): the level the student was
   * registered at (the transcript's UG/GR column). Kept so a course can be
   * re-sorted between program coursework and prior coursework whenever the
   * entry term changes — the level, not the term, decides bachelor's vs
   * master's prior coursework. */
  registeredLevel?: 'undergraduate' | 'graduate';
  /** True on every row the Notre Dame transcript import added (2026-09-06) —
   * program courses, pre-entry prior coursework and the transcript's own
   * transfer-credit block alike — so the "Remove" button next to that import
   * can take back exactly what it added and leave hand-entered rows alone.
   * Absent on rows saved before this flag existed; those are removed one by
   * one in the table, as before. */
  fromNdTranscript?: true;
  /** transfer-only: §4.4.1 core area the student claims this course satisfies (decision Q12). */
  /** Deprecated 2026-09-03 (the claim path is retired — the DGS's
   * ExternalCourses rulings decide §4.4.1). Kept so old saved/imported
   * student files still load; the engine ignores it. */
  claimedCoreArea?: CoreArea;
  /** Only meaningful when the rules sheet says category_group = 'any' (decision Q2). */
  assignedGroup?: CategoryGroup;
}

/** ISO dates (YYYY-MM-DD), all optional — milestones are dates, not checkboxes. */
export interface Milestones {
  advisorIdentified?: string;
  advisorName?: string;
  researchQualifierPassed?: string; // §4.4.3
  qualifierFormFiled?: string; // §4.4
  candidacyPassed?: string; // §4.5
  dissertationApprovedForDefense?: string; // §4.6
  defensePassed?: string; // §4.7
  thesisApprovedByReaders?: string; // §3.4 thesis option
  thesisDefensePassed?: string; // §3.4 thesis option
  projectReportAccepted?: string; // §3.4 project option
}

/** Self-attested approvals (decision Q21) — clearly labeled in the UI; the legal
 * footer reminds students that real approvals live with the DGS office. */
export interface Attestations {
  advisorApprovedPlan?: boolean; // §3.2/§4.2 "approval of their advisor"
  dgsApproved4xxxx?: boolean; // §3.2/§4.2
  dgsApprovedNonCse?: boolean; // §3.2/§4.2
  transferApproved?: boolean; // §5.2 DGS + Graduate School
  /** Deprecated 2026-09-03 (retired with the claim path — see
   * claimedCoreArea). Kept so old saved files still load; ignored. */
  corePassedElsewhere?: CoreArea[];
  qualifierExtensionGranted?: boolean; // §4.4 "the DGS may extend the deadline"
}

export interface Student {
  schemaVersion: 1;
  program: Program;
  msOption?: MsOption;
  entryTerm: Term;
  /** Set while entryTerm holds a value the student has NOT chosen (2026-09-05):
   * `how` = "assumed" for a fresh record (the fall of the current year), or
   * the transcript reading it was set from ("the first graduate-level term on
   * your transcript"); `alternative` names the other reading a combined
   * transcript supports. Cleared when the student touches the dropdown. The
   * standing card warns while it is set — the §4.3 residency count and every
   * deadline (§4.3 eight-year limit, §4.4.3 eighteen months, §4.5 eighth
   * semester) hang on this term. */
  entryTermInferred?: { how: string; alternative?: { term: Term; why: string } };
  priorMs: 'none' | 'unfinished' | 'completed'; // §5.2 transfer caps
  /** True while priorMs holds a value INFERRED from an uploaded transcript
   * (2026-09-03) rather than chosen by the student — cleared when they touch
   * the dropdown, and reset with priorMs when the inferring transcript's
   * courses are removed. */
  priorMsInferred?: boolean;
  /** The term the bachelor's degree was awarded (DGS 2026-09-06: "Only the
   * courses taken with the graduate student status can count. The
   * graduate-level courses taken before earning the bachelor's degree do not
   * count."). §5.2 criterion 2 needs graduate student status, so a transfer
   * course dated in or before this term earns no credit whatever its number
   * or registration level (classify() in allocate.ts). Optional in the TYPE
   * only — the UI marks it required and audit() warns while it is unset
   * (2026-09-07); while unknown, each course's degreeLevel decides. Set under "Your
   * standing", or filled in by a transcript import that finds a dated
   * bachelor's award (then bachelorsAwardedInferred says so). */
  bachelorsAwarded?: Term;
  /** Set while bachelorsAwarded holds a value read from a transcript rather
   * than chosen by the student; `how` names the reading. Cleared when the
   * student touches the control; a later import may replace an inferred
   * value, never a chosen one. Remove/Undo leave both alone (like the entry
   * term — a fact about the student, not about the import). */
  bachelorsAwardedInferred?: { how: string };
  gpa?: number; // self-reported cumulative (decision Q7)
  /** Where `gpa` came from when a Notre Dame transcript filled it in
   * (2026-09-05, combined-transcript bug report): the transcript's
   * graduate-level cumulative figure, or this program's courses alone when
   * an earlier graduate program at Notre Dame is folded into that figure.
   * Display only — the engine reads `gpa`; cleared when the student types. */
  gpaSource?: {
    basis: 'transcript-graduate' | 'program-only';
    transcriptGpa?: number;
    programGpa?: number;
    undergraduateGpa?: number;
  };
  fullTimeTermOverrides?: Term[]; // decision Q8 residency override
  /** Set only by "Load example" (2026-09-08). The record is saved like any
   * other, so without a marker a student returning the next day cannot tell
   * the demo from their own work. Never written by a transcript import, and
   * stripped from a file the student loads. */
  isExample?: true;
  courses: CourseEntry[];
  milestones: Milestones;
  attestations: Attestations;
}

// ---------- audit output ----------

export type Status =
  | 'met'
  | 'in_progress'
  | 'unmet'
  | 'needs_dgs_review'
  | 'cannot_evaluate'
  | 'not_applicable';

export interface ApproxDate {
  date: string; // ISO
  approx: boolean;
  note?: string;
}

export type DeadlineState = 'done' | 'upcoming' | 'due_soon' | 'overdue';

export interface DeadlineInfo extends ApproxDate {
  state: DeadlineState;
  /** e.g. "Due by the end of Spring 2030 (approximate)" / "Past due — …" */
  label: string;
}

/** One statement of a requirement's detail: plain prose, or a lead sentence
 * with enumerated items (e.g. the per-course sign-off list) that the report
 * renders as a nested bullet list (DGS request 2026-09-04). */
export type DetailPart = string | { lead: string; items: string[] };

export interface RequirementResult {
  id: string;
  group: string; // display group heading, e.g. "Coursework — §4.2"
  title: string;
  status: Status;
  /** Informational rows (e.g. MSCSE-along-the-way) are excluded from the score. */
  informational?: boolean;
  detail: string;
  /** When the detail was built from several independent statements, they are
   * also kept separately so the UI can render a long detail as a bulleted
   * list (DGS request 2026-09-04). A part may itself carry a lead sentence
   * plus enumerated items — rendered as a nested (two-layer) list. `detail`
   * stays the joined prose — the advisor summary and tests keep using it. */
  detailParts?: DetailPart[];
  deadline?: DeadlineInfo;
  citation: { section: string; quote: string };
  /** What satisfies the row right now — course ids for course-based rows,
   * semester labels for residency — so the Grad Admin's processing request
   * can table "which courses meet this requirement" from data rather than
   * prose (DGS request 2026-09-06 evening). Only definite credits count
   * here (passed, no approval pending). Absent when nothing does yet. */
  satisfiedBy?: string[];
  /** §4.4.2 only (DGS request 2026-09-08). A course the sheet marks `any` can
   * satisfy ANY specialization group, so the student chooses — and the useful
   * choice depends on what their other courses already cover. Course id → the
   * groups that would add a distinct group they do not have yet. Empty for a
   * course whose choice cannot help (every group is already covered). */
  groupChoices?: Record<string, string[]>;
  /** Courses that WILL count toward this row once they are passed or approved
   * — the in-progress and provisional counterpart of `satisfiedBy`
   * (DGS request 2026-09-08: a course's line should name every requirement it
   * satisfies OR will satisfy). Never used by the emails, which report only
   * what is already true. */
  pendingBy?: string[];
}

export interface CourseLine {
  courseId: string;
  term: Term;
  text: string;
  /** Every requirement row this course feeds, in report order (DGS request
   * 2026-09-08). One course routinely serves several — a 60000-level course
   * counts toward the total credits, the regular-course credits, the nine at
   * Notre Dame, a §4.4.1 core area and a §4.4.2 specialization group — and the
   * sentence above names only the credit pool. `when` separates what it counts
   * toward now from what it will count toward once passed or approved. */
  counts: { id: string; title: string; when: 'now' | 'later' }[];
  /** How the page paints the line (2026-09-06): green (earns credit or a core
   * area now), amber (in progress, or counted only until an approval), red
   * (earns nothing). */
  mark: 'counts' | 'pending' | 'excluded';
}

export interface AuditReport {
  program: Program;
  requirements: RequirementResult[];
  courseLines: CourseLine[];
  /** met / scored, where n/a and informational rows are excluded from both. */
  summary: { met: number; scored: number };
  warnings: string[];
}
