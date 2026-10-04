// Residency derivation (decision Q8): a term is full-time when the student's
// entered ND credits reach the §2.1.2 floor ("A full-time student is one who
// registers for at least nine (9) credit hours per semester. These credits may
// consist of both regular course credits and research credits."), or when the
// student marks it full-time (research-heavy terms may not be fully entered).
// Registration is what counts, so all grades — including IP and F — contribute.
// Only terms from the entry term on count (2026-09-05): residence is "for the
// Ph.D. degree" (§4.3) / "for the master's degree" (§3.3), so semesters spent
// at Notre Dame in an earlier program — an undergraduate degree on a combined
// transcript — are not residence in this one. (A transcript import already
// files pre-entry courses as prior coursework; this guard covers courses
// entered by hand and entry terms changed afterwards.)
import { levelOf } from '../allocate.ts';
import { compareTerm, semesterSeq, termIndex } from '../term.ts';
import { termLabel } from '../term.ts';
import type { DetailPart, Term } from '../types.ts';
import type { Ctx } from './context.ts';

/** Academic Code §4.1: "full-time degree-seeking graduate students are
 * expected to register for at least three hours of credit at the 60000 level
 * or higher every semester that they are enrolled, except with the permission
 * of the associate dean for academic affairs in the Graduate School." A
 * Graduate School number, kept in code like §2.3's twelve (policy review
 * 2026-10-03, P1-residency-enrollment-c5). */
export const GRADUATE_LEVEL_CREDITS_MIN = 3;

export interface FullTimeTermRecord {
  term: Term;
  fullTime: boolean;
  credits: number;
  /** Of `credits`, those at the 60000 level or higher (Academic Code §4.1). */
  graduateCredits: number;
  /** Every registration in the term was withdrawn (policy review 2026-10-03):
   * a full withdrawal (Academic Code §3.8/§5.5), not a semester of residence —
   * the term is never counted automatically, and the rows say so. */
  withdrawnOnly?: true;
}

export function fullTimeTermRecords(ctx: Ctx): FullTimeTermRecord[] {
  return fullTimeRecordsFrom(ctx.classified, ctx.student, ctx.params.number('fulltime_credits_min'), summerFullTimeFloor(ctx.student.program, (k) => ctx.params.number(k)));
}

/** The MSCSE's summer floor: DGS Handbook §10.3.2 — "The minimum residency
 * requirement for the master's degree is one semester of registration and
 * enrollment (may include summer session if the student is registered for six
 * or more credits)." A Parameters key by the DGS's choice (2026-10-04,
 * P1-page-text-ui-9: "Count a summer term automatically at six credits for the
 * MSCSE residency row (a summer_fulltime_credits_min parameter)"), like
 * `fulltime_credits_min`: the department's full-time definition, never below
 * the Graduate School's six. The Ph.D.'s residency never counts a summer
 * (§4.3), so the floor is the MSCSE's alone. */
export function summerFullTimeFloor(program: Ctx['student']['program'], number: (key: string) => number | undefined): number | undefined {
  return program === 'mscse' ? number('summer_fulltime_credits_min') : undefined;
}

/** The same, from the classified list and the record alone — what the
 * standing card's Full-time terms fieldset reads, so the card and the report
 * never disagree about which semester counted automatically (policy review
 * 2026-10-03: the card summed raw entered credits). */
export function fullTimeRecordsFrom(
  classified: readonly Ctx['classified'][number][],
  student: Ctx['student'],
  floor: number | undefined,
  /** The MSCSE's summer floor (`summerFullTimeFloor`); undefined for the
   * Ph.D., or when the rules sheet lacks the key. */
  summerFloor?: number,
): FullTimeTermRecord[] {
  const ctx = { classified, student } as const;
  const entryIndex = termIndex(ctx.student.entryTerm);
  const byTerm = new Map<number, { term: Term; credits: number; graduate: number; withdrawn: number; rows: number }>();
  // Registered credits come from rows the audit accepts as registrations
  // (2026-09-11): a duplicate entry of the same course, or a row whose grade
  // the app does not recognise, used to add its credits here while its own
  // line said "not counted" — turning a six-credit semester into a full-time
  // one. Two refinements from the policy review (2026-10-03): a withdrawn (W)
  // or Incomplete (I) course IS a registration (Academic Code §3.3 counts what
  // the student "registers for"), and an earlier attempt of a course retaken
  // in a LATER term was a registration in its own semester — only a same-term
  // duplicate is dropped.
  const countedAttempt = (cc: Ctx['classified'][number]): Ctx['classified'][number] | undefined =>
    ctx.classified.find((o) => o !== cc && !o.superseded && o.entry.courseId === cc.entry.courseId && o.entry.origin === 'nd');
  for (const cc of ctx.classified) {
    const c = cc.entry;
    if (cc.unrecognizedGrade) continue;
    if (cc.superseded) {
      const counted = countedAttempt(cc);
      if (counted === undefined || compareTerm(counted.entry.term, c.term) === 0) continue; // a true duplicate
    }
    if (c.origin !== 'nd' || termIndex(c.term) < entryIndex) continue;
    const key = termIndex(c.term);
    const rec = byTerm.get(key) ?? { term: c.term, credits: 0, graduate: 0, withdrawn: 0, rows: 0 };
    rec.credits += c.credits;
    if (levelOf(c, cc.rule) >= 6) rec.graduate += c.credits;
    rec.rows += 1;
    if (cc.withdrawn) rec.withdrawn += 1;
    byTerm.set(key, rec);
  }
  for (const t of ctx.student.fullTimeTermOverrides ?? []) {
    const key = termIndex(t);
    if (key < entryIndex) continue;
    if (!byTerm.has(key)) byTerm.set(key, { term: t, credits: 0, graduate: 0, withdrawn: 0, rows: 0 });
  }
  const overrides = new Set((ctx.student.fullTimeTermOverrides ?? []).map((t) => termIndex(t)));
  const records = [...byTerm.values()].sort((a, b) => termIndex(a.term) - termIndex(b.term));
  const academicYearFullTime = (rec: (typeof records)[number]): boolean =>
    overrides.has(termIndex(rec.term)) || (floor !== undefined && rec.credits >= floor && !(rec.rows > 0 && rec.withdrawn === rec.rows));
  return records.map((rec) => {
    const withdrawnOnly = rec.rows > 0 && rec.withdrawn === rec.rows && !overrides.has(termIndex(rec.term));
    // A SUMMER session (Academic Code §3.6: "Students who are enrolled
    // full-time during the academic year are considered full-time continuing
    // students in the summer"): any registration in a summer counts as
    // full-time when the spring before or the fall after was — the nine-credit
    // floor is "per semester" (§3.3), and only §3.3 of the CSE handbook, the
    // MSCSE's "one summer session", ever asks about a summer (policy review 2026-10-03).
    const summerContinuing =
      rec.term.season === 'summer' &&
      rec.credits > 0 &&
      records.some((o) => o.term.year === rec.term.year && o.term.season !== 'summer' && academicYearFullTime(o));
    // …and, for the MSCSE, a summer of six or more registered credits on its
    // own (DGS Handbook §10.3.2; DGS 2026-10-04 — `summerFullTimeFloor`).
    const summerOnItsOwn = rec.term.season === 'summer' && summerFloor !== undefined && rec.credits >= summerFloor && !withdrawnOnly;
    return {
      term: rec.term,
      credits: rec.credits,
      graduateCredits: rec.graduate,
      fullTime: academicYearFullTime(rec) || summerContinuing || summerOnItsOwn,
      ...(withdrawnOnly ? { withdrawnOnly: true as const } : {}),
    };
  });
}

/** The semesters of the longest run of consecutive full-time fall/spring
 * terms — what satisfies the residency rows, for the processing request
 * (2026-09-06 evening). Mirrors maxConsecutiveFullTime() in term.ts. */
export function longestFullTimeRun(records: { term: Term; fullTime: boolean }[]): Term[] {
  const byseq = new Map<number, Term>();
  for (const r of records) if (r.fullTime && r.term.season !== 'summer') byseq.set(semesterSeq(r.term), r.term);
  let best: Term[] = [];
  for (const [k, term] of byseq) {
    if (byseq.has(k - 1)) continue; // not the start of a run
    const run = [term];
    while (byseq.has(k + run.length)) run.push(byseq.get(k + run.length)!);
    if (run.length > best.length) best = run;
  }
  return best;
}

/** The fall and spring semesters a student was full-time in by the courses
 * entered (the floor reached, not a tick) with fewer than three credits at the
 * 60000 level or higher — Academic Code §4.1's expectation, which only the
 * Graduate School's associate dean can waive. The term still counts toward
 * residence ("never fail the term", policy review 2026-10-03,
 * P1-residency-enrollment-c5); the residency rows send it to the DGS. */
export function belowGraduateLevelTerms(records: FullTimeTermRecord[], floor: number | undefined): FullTimeTermRecord[] {
  if (floor === undefined) return [];
  return records.filter(
    (r) => r.term.season !== 'summer' && !r.withdrawnOnly && r.credits >= floor && r.graduateCredits < GRADUATE_LEVEL_CREDITS_MIN,
  );
}

/** What a residency row says about those semesters: the terms as the fact,
 * the rule as a note (DGS 2026-10-03: explanations behind "Details"). */
export function graduateLevelParts(records: FullTimeTermRecord[], floor: number | undefined): DetailPart[] {
  const terms = belowGraduateLevelTerms(records, floor).map((r) => termLabel(r.term));
  if (terms.length === 0) return [];
  return [
    `${terms.join(', ')}: fewer than ${GRADUATE_LEVEL_CREDITS_MIN} credits at the 60000 level or higher`,
    {
      note: `The Graduate School expects every full-time graduate student to register for at least ${GRADUATE_LEVEL_CREDITS_MIN} credits at the 60000 level or higher each semester, unless its associate dean for academic affairs allowed otherwise (Academic Code §4.1); the semester still counts here, and the review request asks the DGS`,
    },
  ];
}

/** The same, as one line for the DGS's review request. */
export function graduateLevelFlag(records: FullTimeTermRecord[], floor: number | undefined): string | undefined {
  const below = belowGraduateLevelTerms(records, floor);
  if (below.length === 0) return undefined;
  const what = below.map((r) => `${termLabel(r.term)} (${r.graduateCredits} of ${r.credits} credits)`).join(', ');
  return `Fewer than ${GRADUATE_LEVEL_CREDITS_MIN} credits at the 60000 level or higher in a full-time semester: ${what}. Academic Code §4.1 expects at least ${GRADUATE_LEVEL_CREDITS_MIN} every semester unless the Graduate School’s associate dean for academic affairs permitted otherwise.`;
}
