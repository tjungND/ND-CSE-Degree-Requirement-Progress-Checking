// A withdrawal the Notre Dame transcript shows by its grades (policy review
// round 3, P3-dh-3.1-3.13-1; DGS 2026-10-06: "Apply the suggested handling").
// Your standing asks about a readmission when the transcript has a fall or
// spring with no registration (DGS 2026-10-04) — but a student who withdraws
// after the course-discontinuance date keeps the semester's rows, each graded
// W (Academic Code §5.5: "Grades of W are given when a student withdraws after
// the mid-semester course discontinuance deadline"), and one who leaves
// without the Separation form gets an F in every course. Both had to be
// readmitted to return ("To re-enter a program, the student must follow the
// readmission process", ibid.). A leave is requested before the first class
// day (Academic Code §5.1), so an all-W semester is not a leave.
import { isAudit, isWithdrawn } from '../engine/grades.ts';
import { normalizeEntryTerm, semesterSeq, termIndex, termOfDate } from '../engine/term.ts';
import type { Student, Term } from '../engine/types.ts';

export interface WithdrawalSemester {
  term: Term;
  /** 'W': every course withdrawn. 'F': every course failed — softer, since
   * that can also be failed courses. */
  kind: 'W' | 'F';
}

/** The falls and springs, from the entry term on, in which every Notre Dame
 * course (audits aside) is W, or every one is F, and after which a later fall
 * or spring has a Notre Dame course — the student came back. Undefined when
 * no Notre Dame transcript was imported (a hand-entered record is not read
 * this way, as for the empty semesters). */
export function withdrawalSemesters(student: Student): WithdrawalSemester[] | undefined {
  if (!student.courses.some((c) => c.fromNdTranscript)) return undefined;
  const entry = normalizeEntryTerm(student.entryTerm).term;
  const bySeq = new Map<number, Student['courses']>();
  for (const c of student.courses) {
    if (c.origin !== 'nd' || c.term.season === 'summer' || termIndex(c.term) < termIndex(entry) || isAudit(c.grade)) continue;
    const k = semesterSeq(c.term);
    bySeq.set(k, [...(bySeq.get(k) ?? []), c]);
  }
  if (bySeq.size === 0) return [];
  const last = Math.max(...bySeq.keys());
  const out: WithdrawalSemester[] = [];
  for (const [seq, rows] of [...bySeq].sort((a, b) => a[0] - b[0])) {
    if (seq >= last) continue; // not returned yet: no question until a later semester shows the return
    const kind = rows.every((c) => isWithdrawn(c.grade)) ? 'W' : rows.every((c) => c.grade === 'F') ? 'F' : undefined;
    if (kind) out.push({ term: rows[0]!.term, kind });
  }
  return out;
}

/** The question for Your standing's selector, naming the semesters. */
export function withdrawalQuestion(found: readonly WithdrawalSemester[], label: (t: Term) => string): string {
  const list = (kind: 'W' | 'F') => found.filter((w) => w.kind === kind).map((w) => label(w.term));
  const join = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
  const w = list('W');
  const f = list('F');
  return [
    ...(w.length > 0 ? [`Your transcript shows every course withdrawn in ${join(w)} — did you withdraw from the University and return?`] : []),
    ...(f.length > 0 ? [`Your transcript shows an F in every course in ${join(f)} — if you left the University without the Separation form, did you return?`] : []),
  ].join(' ');
}

/** The falls and springs a Notre Dame transcript shows no registration in,
 * from the entry term on: strictly between the first and the last semester
 * with a Notre Dame course — and, since policy review round 3
 * (P3-dh-3.1-3.13-2; DGS 2026-10-06: "Apply the handling with option (b)"),
 * after the last one up to the current semester, the range the full-time list
 * already uses: a student on leave this semester has no later registration to
 * frame the gap. Undefined when no Notre Dame transcript was imported — a
 * hand-entered record may leave a research-only semester empty, so nothing is
 * read into an empty semester there (2026-10-04). A transcript imported
 * before this semester's registration posts names the current semester too;
 * the student leaves the leave count at 0. */
export function transcriptGapSemesters(student: Student, todayIso: string): Term[] | undefined {
  if (!student.courses.some((c) => c.fromNdTranscript)) return undefined;
  const entry = normalizeEntryTerm(student.entryTerm).term;
  const seqs = new Set(student.courses.filter((c) => c.origin === 'nd' && c.term.season !== 'summer' && termIndex(c.term) >= termIndex(entry)).map((c) => semesterSeq(c.term)));
  if (seqs.size === 0) return [];
  const first = Math.min(...seqs);
  const last = Math.max(...seqs);
  const now = semesterSeq(termOfDate(todayIso));
  const out: Term[] = [];
  for (let seq = first + 1; seq <= Math.max(last - 1, now); seq++) if (!seqs.has(seq)) out.push({ season: seq % 2 === 1 ? 'fall' : 'spring', year: Math.floor(seq / 2) });
  return out;
}
