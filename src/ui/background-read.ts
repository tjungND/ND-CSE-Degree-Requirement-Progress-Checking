// What the imported transcripts say about the student's earlier degrees — the
// answers the opening dialog used to ask for (DGS 2026-10-08, Option 1: "ask
// only the program up front; read the rest from the transcripts and let the
// student change it"). Pure: a transcript reading in, a partial answer out,
// each part with where it came from, so the page can say "read from your
// transcript" beside it.
//
// What a Notre Dame unofficial transcript can settle (insideND's layout, seen
// on two redacted transcripts the DGS provided): every term's level (its
// "Term Totals (Undergraduate | Graduate)"), college and major. It prints no
// degrees awarded, no program (M.S. or Ph.D.), no move from the MSCSE into
// the Ph.D., and nothing about the Integrated 4+1. So it answers:
//   - where the bachelor's is from — undergraduate terms mean a Notre Dame
//     bachelor's, the last undergraduate major names the department (none
//     is not read as another university: the transcript does not say which
//     levels it covers);
//   - a graduate program in another Notre Dame department — graduate terms
//     under a non-CSE major before the CSE ones.
// Everything else (the 4+1, the MSCSE, a transfer into the Ph.D., whether an
// earlier program was finished) stays for the student to answer on the page.
// A transcript from another university, imported into the Previous Master's
// or Ph.D. row, says the student held or started a graduate degree there, and
// whether it was conferred when its transcript says so.
import { termLabel } from '../engine/term.ts';
import type { TranscriptTerm } from '../transcript/parse.ts';
import { applyBackground, completeBackground, type Background } from './background.ts';
import type { Program, Student } from '../engine/types.ts';
import { asksAlsoElsewhere, deriveNdMasters, derivePriorMs } from './prior-nd.ts';

/** A partial earlier-degrees answer read from transcripts, with where each
 * part came from (shown to the student beside it). */
export interface BackgroundReading {
  answer: Partial<Background>;
  how: Partial<Record<keyof Background, string>>;
}

/** CSE's majors as insideND prints them: Computer Science, Computer
 * Engineering, Computer Science & Engineering (or "and"). */
export function isCseMajor(major: string | undefined): boolean {
  return major !== undefined && /\bcomputer\s+(science|engineering)\b/i.test(major);
}

/** A major cell that names a whole major of another department. Not a
 * fragment of a CSE major cut by a wrapped cell ("Computer", "Computer
 * Science"), a placeholder ("-"), a standing value, or a name cut after "&",
 * "and" or "of" — those leave the question to the student (review of Option 1,
 * 2026-10-08: only a positive reading is evidence). */
export function isOtherDepartmentMajor(major: string | undefined): boolean {
  if (major === undefined || isCseMajor(major)) return false;
  const m = major.trim().replace(/\s+/g, ' ');
  if (!/[a-z]{3}/i.test(m) || /\bstanding\b|\bprobation\b|\bwarning\b/i.test(m) || /(?:&|\band|\bof)$/i.test(m)) return false;
  // A leading part of a CSE major's name, cut by a wrapped cell.
  const words = m.toLowerCase().split(' ');
  for (const cse of ['computer science and engineering', 'computer science & engineering', 'computer engineering']) {
    const full = cse.split(' ');
    if (words.length < full.length && words.every((w, i) => w === full[i])) return false;
  }
  return true;
}

/** What a Notre Dame transcript's terms settle. Empty when the transcript
 * does not mark its terms' levels (an older layout) — nothing is guessed. */
export function readBackgroundFromNdTerms(terms: readonly TranscriptTerm[] | undefined): BackgroundReading {
  const out: BackgroundReading = { answer: {}, how: {} };
  if (!terms || !terms.some((t) => t.level !== undefined)) return out;
  const undergrad = terms.filter((t) => t.level === 'undergraduate');
  const graduate = terms.filter((t) => t.level === 'graduate');
  // No undergraduate terms is NOT read as a bachelor's elsewhere: insideND's
  // transcript does not say which levels it covers, so a print limited to the
  // graduate level looks the same (policy review of Option 1, 2026-10-08 —
  // "never guess").
  if (undergrad.length > 0) {
    // The department is the last undergraduate major the transcript prints
    // (a first-year "Computer Science" may become another major later) — when
    // it can be read as one (isOtherDepartmentMajor).
    const last = [...undergrad].reverse().find((t) => t.major !== undefined);
    if (last !== undefined && (isCseMajor(last.major) || isOtherDepartmentMajor(last.major))) {
      out.answer.bachelors = isCseMajor(last.major) ? 'nd-cse' : 'nd-other';
      out.how.bachelors = `your Notre Dame transcript shows undergraduate terms through ${termLabel(undergrad[undergrad.length - 1]!.term)}, majoring in ${last.major}`;
    }
  }
  // A graduate program in another Notre Dame department: graduate terms under
  // a non-CSE major before the CSE ones. Whether it was finished is not on the
  // transcript; the student answers it.
  const firstCse = graduate.findIndex((t) => isCseMajor(t.major));
  const otherBefore = (firstCse < 0 ? [] : graduate.slice(0, firstCse)).filter((t) => isOtherDepartmentMajor(t.major));
  if (otherBefore.length > 0) {
    out.answer.graduate = 'nd-other';
    out.how.graduate = `your Notre Dame transcript shows graduate terms in ${otherBefore[0]!.major} from ${termLabel(otherBefore[0]!.term)}, before your CSE terms`;
  }
  return out;
}

/** What a transcript from another university, imported into the Previous
 * Master's or Ph.D. row, settles: a graduate degree there, finished when the
 * transcript says it was conferred, and whether it was at the bachelor's
 * university when that is known too. */
export function readBackgroundFromPriorGraduate(args: { university?: string; conferred?: boolean; bachelorsUniversity?: string; sameUniversity: (a: string, b: string) => boolean; slot: 'masters' | 'phd' }): BackgroundReading {
  const out: BackgroundReading = { answer: { graduate: 'elsewhere' }, how: {} };
  const where = args.university ? ` from ${args.university}` : '';
  out.how.graduate = `you added a previous ${args.slot === 'phd' ? 'Ph.D.' : 'master’s'} transcript${where}`;
  if (args.conferred === true) {
    out.answer.finished = true;
    out.how.finished = `that transcript says the degree was conferred`;
  }
  if (args.university && args.bachelorsUniversity) {
    out.answer.samePlace = args.sameUniversity(args.university, args.bachelorsUniversity);
    out.how.samePlace = out.answer.samePlace ? 'your bachelor’s transcript is from the same university' : 'your bachelor’s transcript is from another university';
  }
  return out;
}

/** A transcript from another university imported into the Previous
 * Undergraduate row: the bachelor's was there. */
export function readBackgroundFromPriorBachelors(university: string | undefined): BackgroundReading {
  return { answer: { bachelors: 'elsewhere' }, how: { bachelors: `you added a previous undergraduate transcript${university ? ` from ${university}` : ''}` } };
}

type Key = keyof Background;

/** Fold a transcript reading into the record (Option 1). Nothing changes once
 * the student has a complete answer — "imports no longer infer these once an
 * answer exists" (2026-09-22) — and a reading never overwrites a part already
 * there, read or answered: it only fills gaps. One exception: a degree
 * elsewhere read while the student has said the Notre Dame MSCSE is "also
 * held or started elsewhere" (P3-prior-programs-1/-2). When the draft becomes
 * complete it is applied as the answer. When this transcript contradicts a
 * part READ from another one, neither is kept: the part is cleared for the
 * student to answer (review of Option 1, 2026-10-08) — a part the student
 * answered stays theirs. Says what happened, for the import's toast. */
export type ReadingResult = false | 'filled' | 'disagree';
export function mergeReading(s: Student, reading: BackgroundReading): ReadingResult {
  if (s.background !== undefined) return false;
  const draft: Partial<Background> = { ...(s.backgroundDraft ?? {}) };
  const read: Partial<Record<Key, string>> = { ...(s.backgroundRead ?? {}) };
  let changed = false;
  let disagree = false;
  const fill = (k: Key, v: unknown, how: string | undefined): void => {
    const current = (draft as Record<string, unknown>)[k];
    if (current !== undefined) {
      if (read[k] !== undefined && JSON.stringify(current) !== JSON.stringify(v)) {
        delete (draft as Record<string, unknown>)[k];
        delete read[k];
        changed = true;
        disagree = true;
      }
      return;
    }
    (draft as Record<string, unknown>)[k] = v;
    if (how) read[k] = how;
    changed = true;
  };
  const { graduate, ...rest } = reading.answer;
  if (graduate === 'elsewhere' && asksAlsoElsewhere(draft.graduate)) fill('alsoElsewhere', true, reading.how.graduate);
  else if (graduate !== undefined) fill('graduate', graduate, reading.how.graduate);
  // A reading's "finished" and "same university" describe the degree
  // elsewhere it read: they are filled only where the answer asks them about
  // that degree — not beside "No", nor beside another Notre Dame department
  // (whose "finished" is about that program), nor beside the MSCSE with "No"
  // to a degree elsewhere (policy review of Option 1, 2026-10-08).
  const aboutElsewhere = draft.graduate === 'elsewhere' || (asksAlsoElsewhere(draft.graduate) && draft.alsoElsewhere === true);
  for (const [k, v] of Object.entries(rest) as [Key, unknown][]) {
    if (k === 'finished' && (graduate === undefined || !aboutElsewhere)) continue;
    if (k === 'samePlace' && (graduate === undefined || draft.graduate !== 'elsewhere')) continue;
    fill(k, v, reading.how[k]);
  }
  if (!changed) return false;
  s.backgroundDraft = Object.keys(draft).length > 0 ? draft : undefined;
  s.backgroundRead = Object.keys(read).length > 0 ? read : undefined;
  settleDraft(s);
  reconcileInferences(s);
  return disagree ? 'disagree' : 'filled';
}

/** The student's own answer, from the questions on the page or the Change
 * dialog: whatever they changed is theirs now, not "read from your
 * transcript". A complete answer is applied. */
export function answerBackground(s: Student, b: Partial<Background>): void {
  const before: Partial<Background> = s.background ?? s.backgroundDraft ?? {};
  if (s.backgroundRead) {
    const read = { ...s.backgroundRead };
    for (const k of Object.keys(read) as Key[]) if (JSON.stringify(before[k]) !== JSON.stringify(b[k])) delete read[k];
    s.backgroundRead = Object.keys(read).length > 0 ? read : undefined;
  }
  const done = completeBackground(b, s.program);
  if (done) {
    applyBackground(s, done);
    s.backgroundDraft = undefined;
  } else {
    // Incomplete: a draft. (An applied answer made incomplete again — the
    // Change dialog cannot do it — is withdrawn, undoing what it settled.)
    if (s.background !== undefined) withdrawBackground(s, b);
    else {
      s.backgroundDraft = Object.keys(b).length > 0 ? { ...b } : undefined;
      reconcileInferences(s);
    }
  }
}

/** The part of an answer that still applies under `program` (a program
 * change, 2026-10-08): the MSCSE cannot already hold, or have moved from, the
 * Notre Dame MSCSE, so those graduate answers go — with what they asked —
 * and the question is asked again. */
export function draftForProgram(d: Partial<Background>, program: Program): Partial<Background> {
  if (program !== 'mscse' || !asksAlsoElsewhere(d.graduate)) return { ...d };
  const { graduate: _g, alsoElsewhere: _a, finished: _f, samePlace: _s, transferredTerm: _t, ...rest } = d;
  return rest;
}

/** An answer the program no longer fits goes back to being a draft
 * (2026-10-08): what `applyBackground` settled is undone — the record's
 * unanswered defaults — and the import-time inferences run again, so the
 * record behaves as an unanswered one does. Read marks of the parts dropped
 * go too. */
export function withdrawBackground(s: Student, draft: Partial<Background>): void {
  s.background = undefined;
  s.backgroundDraft = Object.keys(draft).length > 0 ? { ...draft } : undefined;
  pruneRead(s, draft);
  s.priorMs = 'none';
  s.priorMsInferred = undefined;
  s.ndMasters = undefined;
  s.integratedBsMs = undefined;
  s.integratedBsMsInferred = undefined;
  s.integratedAdmitted = undefined;
  deriveNdMasters(s);
  derivePriorMs(s);
}

/** Read marks only for parts the answer still holds. */
function pruneRead(s: Student, b: Partial<Background>): void {
  if (!s.backgroundRead) return;
  const read = { ...s.backgroundRead };
  for (const k of Object.keys(read) as Key[]) if (b[k] === undefined) delete read[k];
  s.backgroundRead = Object.keys(read).length > 0 ? read : undefined;
}

/** The import-time inferences, made to agree with a partial answer (policy
 * review of Option 1, 2026-10-08): an inference never stands against what the
 * draft already says — "another department", "none" or a transfer is not the
 * Notre Dame MSCSE held; "none" is no prior graduate program; a "No" to the
 * 4+1, or a bachelor's that is not Notre Dame CSE's, is no 4+1. The draft
 * itself is still not applied. */
export function reconcileInferences(s: Student): void {
  if (s.background !== undefined) return;
  deriveNdMasters(s);
  derivePriorMs(s);
  const d = s.backgroundDraft;
  if (s.integratedBsMsInferred !== undefined && (d?.ndIntegrated === false || (d?.bachelors !== undefined && d.bachelors !== 'nd-cse'))) {
    s.integratedBsMs = undefined;
    s.integratedBsMsInferred = undefined;
  }
}

/** A complete draft becomes the answer. */
export function settleDraft(s: Student): void {
  if (s.background !== undefined || s.backgroundDraft === undefined) return;
  const done = completeBackground(s.backgroundDraft, s.program);
  if (done) {
    applyBackground(s, done);
    s.backgroundDraft = undefined;
  }
}
