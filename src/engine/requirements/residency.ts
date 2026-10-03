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
import { compareTerm, semesterSeq, termIndex } from '../term.ts';
import type { Term } from '../types.ts';
import type { Ctx } from './context.ts';

export interface FullTimeTermRecord {
  term: Term;
  fullTime: boolean;
  credits: number;
  /** Every registration in the term was withdrawn (policy review 2026-10-03):
   * a full withdrawal (Academic Code §3.8/§5.5), not a semester of residence —
   * the term is never counted automatically, and the rows say so. */
  withdrawnOnly?: true;
}

export function fullTimeTermRecords(ctx: Ctx): FullTimeTermRecord[] {
  return fullTimeRecordsFrom(ctx.classified, ctx.student, ctx.params.number('fulltime_credits_min'));
}

/** The same, from the classified list and the record alone — what the
 * standing card's Full-time terms fieldset reads, so the card and the report
 * never disagree about which semester counted automatically (policy review
 * 2026-10-03: the card summed raw entered credits). */
export function fullTimeRecordsFrom(classified: readonly Ctx['classified'][number][], student: Ctx['student'], floor: number | undefined): FullTimeTermRecord[] {
  const ctx = { classified, student } as const;
  const entryIndex = termIndex(ctx.student.entryTerm);
  const byTerm = new Map<number, { term: Term; credits: number; withdrawn: number; rows: number }>();
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
    const rec = byTerm.get(key) ?? { term: c.term, credits: 0, withdrawn: 0, rows: 0 };
    rec.credits += c.credits;
    rec.rows += 1;
    if (cc.withdrawn) rec.withdrawn += 1;
    byTerm.set(key, rec);
  }
  for (const t of ctx.student.fullTimeTermOverrides ?? []) {
    const key = termIndex(t);
    if (key < entryIndex) continue;
    if (!byTerm.has(key)) byTerm.set(key, { term: t, credits: 0, withdrawn: 0, rows: 0 });
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
    return {
      term: rec.term,
      credits: rec.credits,
      fullTime: academicYearFullTime(rec) || summerContinuing,
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
