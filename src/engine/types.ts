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
   * student status. Absent on manual transfer entries (treated as graduate). */
  degreeLevel?: 'bachelors' | 'masters' | 'phd';
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
  priorMs: 'none' | 'unfinished' | 'completed'; // §5.2 transfer caps
  gpa?: number; // self-reported cumulative (decision Q7)
  fullTimeTermOverrides?: Term[]; // decision Q8 residency override
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

export interface RequirementResult {
  id: string;
  group: string; // display group heading, e.g. "Coursework — §4.2"
  title: string;
  status: Status;
  /** Informational rows (e.g. MSCSE-along-the-way) are excluded from the score. */
  informational?: boolean;
  detail: string;
  deadline?: DeadlineInfo;
  citation: { section: string; quote: string };
}

export interface CourseLine {
  courseId: string;
  term: Term;
  text: string;
}

export interface AuditReport {
  program: Program;
  requirements: RequirementResult[];
  courseLines: CourseLine[];
  /** met / scored, where n/a and informational rows are excluded from both. */
  summary: { met: number; scored: number };
  warnings: string[];
}
