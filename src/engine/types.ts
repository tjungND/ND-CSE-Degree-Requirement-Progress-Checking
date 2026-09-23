// Student-side data model. See docs/DECISIONS.md for every interpretation choice.
// The engine is pure: audit(student, rules, today) — no DOM, no fetch, no Date.now().
import type { CourseMark } from './allocate.ts';
import type { SpecialTrack } from './tracks.ts';

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
  /** True on every row "Load example" seeded (interface review R5,
   * 2026-09-18). `isExample` was a flag on the WHOLE record, so adding one
   * real course of your own left the banner still saying "Nothing here came
   * from you" — and its button still offered to clear the lot. The flag is
   * per row, so the banner can count what is the example's and the button can
   * take back exactly those. */
  fromExample?: true;
  /** transfer-only: §4.4.1 core area the student claims this course satisfies (decision Q12).
   *
   * Deprecated 2026-09-03 (the claim path is retired — the DGS's
   * ExternalCourses rulings decide §4.4.1). Kept so old saved/imported
   * student files still load; the engine ignores it. */
  claimedCoreArea?: CoreArea;
  /** Only meaningful where the rules sheet lists the course under SEVERAL
   * groups, so the student's pick decides which one it fills (decision Q2).
   * ('any' was the old way of saying "all five"; retired 2026-09-18.) */
  assignedGroup?: CategoryGroup;
  /** Which degrees this course's credits have ALREADY been counted toward —
   * asked of the student, per course, for Notre Dame coursework taken in or
   * before the term their bachelor's degree was awarded (Graduate School via
   * the DGS, 2026-09-10 evening).
   *
   * The Graduate School's answer: 60000-level and above taken as an
   * undergraduate counts toward the master's AND the Ph.D., beyond §5.2's
   * twenty-four; up to six credits of 40000-level B.S. coursework counts
   * toward the Ph.D.; and the one hard limit is that no course may count
   * toward all three degrees. So what the audit needs from the student is
   * simply which degrees each such course has been spent on.
   *
   * `undefined` = not answered, and nothing is counted on a guess. A Ph.D.
   * student who holds no Notre Dame master's is never asked: with two degrees
   * in play, no course of theirs can already have counted toward two. */
  countedToward?: 'bs' | 'mscse' | 'both' | 'neither';
  /** transfer-only: the credit system the TRANSCRIPT itself announced
   * (2026-09-11 — "Fall Quarter 2023", "Quarter Units"). Read at import,
   * correctable in the preview. A `credit_system` cell in the DGS's
   * ExternalCourses tab for the university always wins over it. */
  creditSystem?: 'quarter' | 'semester' | 'trimester';
}

/** ISO dates (YYYY-MM-DD), all optional — milestones are dates, not checkboxes. */
export interface Milestones {
  advisorIdentified?: string;
  advisorName?: string;
  /** A second advisor (co-advisor), when the student has two (DGS 2026-09-22). */
  advisorName2?: string;
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
  /** The student passed the qualifying examination under the requirements in
   * force when they took it — the rule changed several times in four years
   * (DGS 2026-09-21). Offered only to students in their third year or later;
   * the engine honours it only then (`qualifierPriorRulesEligible`). */
  qualifierPassedUnderPriorRules?: boolean;
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
  /** The student's earlier degrees, asked in the opening dialog (DGS
   * 2026-09-22): where the bachelor's is from and whether a graduate degree
   * came before this program. Decides which transcript rows are shown
   * (src/ui/background.ts). Absent on records saved before it was asked —
   * every row shows then, as before. */
  background?: { bachelors: 'nd-cse' | 'nd-other' | 'elsewhere'; ndIntegrated?: boolean; graduate: 'none' | 'elsewhere' | 'nd-mscse' | 'nd-4plus1' | 'nd-other'; samePlace?: boolean; finished?: boolean };
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
  bachelorsAwardedInferred?: {
    how: string;
    /** Set when the value is only "before this term" (DGS 2026-09-20): a
     * standalone master's transcript says nothing about the bachelor's award,
     * so `bachelorsAwarded` holds the term before the master's first semester
     * and the page shows "Before <that semester>" instead of a season and a
     * year. Cleared when the student sets the exact term. */
    before?: Term;
  };
  /** Set when the student ALREADY HOLDS a Notre Dame master's degree — the
   * MSCSE earned before entering the Ph.D. program (DGS 2026-09-09). §4.5's
   * "along the way" MSCSE is a degree they cannot earn a second time, so that
   * row is left out of their report entirely rather than counting from zero
   * toward a degree they hold. Presence is the fact; `term` is only for the
   * wording and may be unknown. Read from the Notre Dame transcript's
   * degree-conferral lines (then `inferred` says so, and the checkbox under
   * Your standing corrects it). Says nothing about transfer credit: those
   * courses are §5.2 candidates like any other prior graduate coursework. */
  ndMasters?: { term?: Term; inferred?: { how: string } };
  /** Was the student in Notre Dame's Integrated B.S. + M.S. (4+1) program
   * (DGS 2026-09-12, red-team F7)? Only then does a 60000-level course taken
   * as an undergraduate earn MSCSE/Ph.D. credit (§3.5; the Graduate School's
   * 2026-09-10 answer). Unanswered = not a 4+1: no credit, and the line says
   * how to change that. A plain bachelor's course still demonstrates §4.4.1
   * core knowledge and a §4.4.2 group for a Ph.D. student. */
  integratedBsMs?: boolean;
  /** Set while integratedBsMs was read off the transcript (graduate-registered
   * coursework dated inside the bachelor's degree); cleared when the student answers. */
  integratedBsMsInferred?: { how: string };
  /** The DATED degree conferrals on the Notre Dame transcript, kept so the
   * fact above can be worked out AGAIN when the entry term changes (2026-09-10).
   * Whether a master's was earned "before this program" or along the way is a
   * question about the entry term, and on a 4+1's transcript the entry term is
   * exactly what the import is least sure of — so deciding it once, at import,
   * against a term the student then corrects is how a student who holds the
   * MSCSE ended up with a 6-credit transfer cap instead of 24. */
  ndDegrees?: { level: 'bachelors' | 'masters' | 'phd'; date: string }[];
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

/** One statement of a requirement's detail: plain prose, a lead sentence with
 * enumerated items (e.g. the per-course sign-off list) that the report renders
 * as a nested bullet list (DGS request 2026-09-04), or a WARNING — something
 * the student is losing, which must not read as ordinary body text under a
 * green pill (interface review R2, 2026-09-18: three CSE 4xxxx courses against
 * a six-credit cap printed "CSE 40554: 3 credits not counted — over the cap"
 * in the same grey prose as everything else). `detail` is unchanged either
 * way: a warning flattens to its own sentence, so the copied messages and the
 * scenario fixtures keep reading as before. */
export type DetailPart = string | { lead: string; items: string[] } | { warn: string };

export interface Contribution {
  courseId: string;
  credits: number;
  pending?: true;
}

export interface RequirementResult {
  id: string;
  group: string; // display group heading, e.g. "Coursework — §4.2"
  title: string;
  status: Status;
  /** Overrides the pill's WORDING for this row only — the status, the score and
   * the dashboard counts are untouched (W-CS2, DGS 2026-09-18). One row uses
   * it: a dissertation defended after §4.3's eight-year limit reads
   * "Eligibility at risk", because the shared "Conditionally met" would promise
   * a degree whose eligibility may be forfeit. */
  statusLabel?: string;
  /** Informational rows (e.g. MSCSE-along-the-way) are excluded from the score. */
  informational?: boolean;
  detail: string;
  /** When the detail was built from several independent statements, they are
   * also kept separately so the UI can render a long detail as a bulleted
   * list (DGS request 2026-09-04). A part may itself carry a lead sentence
   * plus enumerated items — rendered as a nested (two-layer) list. `detail`
   * stays the joined prose — the advisor summary and tests keep using it. */
  detailParts?: DetailPart[];
  /** The same statements with the §4.4.1 / §4.4.2 names shortened, for the
   * page only (DGS 2026-09-08). The report renders these when they are here;
   * `detail` and `detailParts` stay FULL, so the messages copied for the
   * advisor, the DGS and the Grad Admin — which re-voice them — keep the
   * names spelled out, which is what the DGS asked for. */
  shortDetailParts?: DetailPart[];
  /** The numbers behind a threshold row, for the credit meters (B3,
   * 2026-09-18). The meters used to re-parse them out of `detail` with
   * /^(\d+) of (\d+)/, so rewording the sentence silently deleted the bar. */
  progress?: { have: number; need: number; unit: string };
  deadline?: DeadlineInfo;
  citation: { section: string; quote: string };
  /** What satisfies the row right now — course ids for course-based rows,
   * semester labels for residency — so the Grad Admin's processing request
   * can table "which courses meet this requirement" from data rather than
   * prose (DGS request 2026-09-06 evening). Only definite credits count
   * here (passed, no approval pending). Absent when nothing does yet. */
  satisfiedBy?: string[];
  /** The courses behind a credit row and what each contributes (DGS
   * 2026-09-22): counted credits, or credits that will count once the course
   * is passed or approved (`pending`). The report folds them behind
   * "Courses counted" on every threshold and cap row. */
  contributions?: Contribution[];
  /** A short name for lists, where the full title is too long to read
   * sideways (DGS 2026-09-08 — "24 credit hours of regular courses at the
   * 60000 level or higher" swamped a course's "Counts toward" cell). The card
   * itself always shows the full `title`; this is only for references to it. */
  shortTitle?: string;
  /** §4.4.2 only (2026-09-12): the coverage-maximising group for each
   * flexible course, courseId → group code, so the page can pre-fill the
   * student's pick rather than let a pick strand the course. */
  groupAssignments?: Record<string, string>;
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
  counts: { id: string; title: string; long: string; when: 'now' | 'later' }[];
  /** How the page paints the line (2026-09-06; split four ways 2026-09-13):
   * green (earns credit or a core area now), blue (in progress — credit once
   * it is passed), amber (counted only until an advisor/DGS approval), red
   * (earns nothing). "Taken", "in progress" and "pending approval" were one
   * amber mark until the DGS asked for them to be told apart. */
  mark: CourseMark;
}

export interface AuditReport {
  program: Program;
  requirements: RequirementResult[];
  courseLines: CourseLine[];
  /** met / scored, where n/a and informational rows are excluded from both.
   * `met` counts rows that are satisfied outright; `conditional` those
   * satisfied except for an approval (W-CS1, 2026-09-18). They are disjoint,
   * and both are inside `scored`. */
  summary: { met: number; conditional: number; scored: number };
  warnings: string[];
  /** Notes for the DGS that are not about one course (2026-09-12): copied
   * into the review request and shown in its card. */
  reviewFlags?: string[];
  /** §3.5 / §3.6 tracks this audit does not model, recognised from the
   * student's own coursework (2026-09-10, promised 2026-08-31). Not warnings:
   * nothing is wrong, and no verdict changes — the note names what the page
   * cannot decide and sends the student to the DGS. */
  tracks: SpecialTrack[];
}
