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
