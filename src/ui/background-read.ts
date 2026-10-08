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
//     bachelor's, the LAST undergraduate term's major names the department
//     (none is not read as another university: the transcript does not say
//     which levels it covers);
//   - a graduate program in another Notre Dame department — graduate terms
//     under another department's major before the CSE ones.
// Only a positive reading is evidence: a placeholder ("Undeclared",
// "Non-Degree"), a fragment of a wrapped cell or a standing value reads
// nothing. Everything else (the 4+1, the MSCSE, a transfer into the Ph.D.,
// whether an earlier program was finished) stays for the student to answer on
// the page. A transcript from another university, imported into a previous
// row, says the student's bachelor's or graduate degree was there, and
// whether it was conferred when its transcript says so.
//
// A reading only FILLS IN the questions; it never applies the answer. The
// student confirms it — by answering what is left, or with "Done" — so a
// question no transcript can answer (the Notre Dame MSCSE beside a master's
// elsewhere) is always seen (review of Option 1, 2026-10-08).
import { termLabel } from '../engine/term.ts';
import type { Program, Student } from '../engine/types.ts';
import { normalizeUniversity } from '../data/external.ts';
import { isCseMajor, isOtherDepartmentMajor } from '../transcript/majors.ts';
import type { TranscriptTerm } from '../transcript/parse.ts';
import { applyBackground, completeBackground, type Background } from './background.ts';
import { asksAlsoElsewhere, deriveNdMasters, derivePriorMs } from './prior-nd.ts';

export { isCseMajor, isOtherDepartmentMajor };

type Key = keyof Background;
/** Where a reading came from: the Notre Dame row or a previous row. */
export type ReadingSource = 'nd' | 'bachelors' | 'masters' | 'phd';

/** A partial earlier-degrees answer read from transcripts, with where each
 * part came from (shown to the student beside it). */
export interface BackgroundReading {
  answer: Partial<Background>;
  how: Partial<Record<Key, string>>;
  source: ReadingSource;
}

/** What a Notre Dame transcript's terms settle. Empty when the transcript
 * does not mark its terms' levels (an older layout) — nothing is guessed. */
export function readBackgroundFromNdTerms(terms: readonly TranscriptTerm[] | undefined): BackgroundReading {
  const out: BackgroundReading = { answer: {}, how: {}, source: 'nd' };
  if (!terms || !terms.some((t) => t.level !== undefined)) return out;
  const undergrad = terms.filter((t) => t.level === 'undergraduate');
  // No undergraduate terms is NOT read as a bachelor's elsewhere: insideND's
  // transcript does not say which levels it covers, so a print limited to the
  // graduate level looks the same (review of Option 1, 2026-10-08 — "never
  // guess").
  if (undergrad.length > 0) {
    // The department is the LAST undergraduate term's major (a first-year
    // "Computer Science" may become another major later) — when that term's
    // major can be read as one. An unread last major reads nothing: an
    // earlier term's major may not be the one the degree was in.
    const last = undergrad[undergrad.length - 1]!;
    if (isCseMajor(last.major) || isOtherDepartmentMajor(last.major)) {
      out.answer.bachelors = isCseMajor(last.major) ? 'nd-cse' : 'nd-other';
      out.how.bachelors = `your Notre Dame transcript shows undergraduate terms through ${termLabel(last.term)}, majoring in ${last.major}`;
    }
  }
  // A graduate program in another Notre Dame department: graduate terms under
  // another department's major before the first CSE term — a graduate one, or
  // the term in progress (a student's first CSE semester). Whether it was
  // finished is not on the transcript; the student answers it.
  const firstCse = terms.findIndex((t) => t.level !== 'undergraduate' && isCseMajor(t.major));
  const otherBefore = (firstCse < 0 ? [] : terms.slice(0, firstCse)).filter((t) => t.level === 'graduate' && isOtherDepartmentMajor(t.major));
  if (otherBefore.length > 0) {
    out.answer.graduate = 'nd-other';
    out.how.graduate = `your Notre Dame transcript shows graduate terms in ${otherBefore[0]!.major} from ${termLabel(otherBefore[0]!.term)}, before your CSE terms`;
  }
  return out;
}

/** Two university names for "the same university?": equal names (after the
 * usual normalisation) are, names that do not overlap are not, and names of
 * which one contains the other ("Purdue University" / "Purdue University
 * Fort Wayne", "Indiana University" / "Indiana University of Pennsylvania")
 * are not decided (review of Option 1, 2026-10-08). */
export function sameUniversityReading(a: string, b: string): boolean | undefined {
  const x = normalizeUniversity(a);
  const y = normalizeUniversity(b);
  if (x === y) return true;
  if (x.includes(y) || y.includes(x)) return undefined;
  return false;
}

/** What a transcript from another university, imported into the Previous
 * Master's or Ph.D. row, settles: a graduate degree there, finished when the
 * transcript says it was conferred, and whether it was at the bachelor's
 * university when that is known — the bachelor's at Notre Dame (not the same
 * place), or a single earlier bachelor's transcript. A transcript that also
 * prints the bachelor's conferral (one transcript for a B.S. + M.S.) says the
 * bachelor's was there too. */
export function readBackgroundFromPriorGraduate(args: {
  university?: string;
  conferred?: boolean;
  /** The university of the one bachelor's transcript on file, if any. */
  bachelorsUniversity?: string;
  /** The answer so far says the bachelor's is Notre Dame's. */
  bachelorsAtNotreDame?: boolean;
  /** This transcript prints a bachelor's conferral as well. */
  bachelorsOnThisTranscript?: boolean;
  slot: 'masters' | 'phd';
}): BackgroundReading {
  const out: BackgroundReading = { answer: { graduate: 'elsewhere' }, how: {}, source: args.slot };
  const where = args.university ? ` from ${args.university}` : '';
  out.how.graduate = `you added a previous ${args.slot === 'phd' ? 'Ph.D.' : 'master’s'} transcript${where}`;
  if (args.conferred === true) {
    out.answer.finished = true;
    out.how.finished = `that transcript says the degree was conferred`;
  }
  if (args.bachelorsOnThisTranscript) {
    out.answer.bachelors = 'elsewhere';
    out.how.bachelors = `your previous ${args.slot === 'phd' ? 'Ph.D.' : 'master’s'} transcript${where} also shows your bachelor’s degree conferred`;
    out.answer.samePlace = true;
    out.how.samePlace = 'one transcript shows both degrees';
  } else if (args.bachelorsAtNotreDame) {
    out.answer.samePlace = false;
    out.how.samePlace = 'your bachelor’s is from Notre Dame';
  } else if (args.university && args.bachelorsUniversity) {
    const same = sameUniversityReading(args.university, args.bachelorsUniversity);
    if (same !== undefined) {
      out.answer.samePlace = same;
      out.how.samePlace = same ? 'your bachelor’s transcript is from the same university' : 'your bachelor’s transcript is from another university';
    }
  }
  return out;
}

/** A transcript from another university imported into the Previous
 * Undergraduate row: the bachelor's was there — and, with a master's
 * transcript already on file from one university, whether that was the same
 * place. */
export function readBackgroundFromPriorBachelors(university: string | undefined, graduateUniversity?: string): BackgroundReading {
  const out: BackgroundReading = { answer: { bachelors: 'elsewhere' }, how: { bachelors: `you added a previous undergraduate transcript${university ? ` from ${university}` : ''}` }, source: 'bachelors' };
  if (university && graduateUniversity) {
    const same = sameUniversityReading(university, graduateUniversity);
    if (same !== undefined) {
      out.answer.samePlace = same;
      out.how.samePlace = same ? 'your master’s transcript is from the same university' : 'your master’s transcript is from another university';
    }
  }
  return out;
}

/** The follow-ups that belong to the graduate answer, and to the bachelor's:
 * a part read for one answer goes when that answer changes. */
const GRADUATE_FOLLOW_UPS: Key[] = ['finished', 'samePlace', 'alsoElsewhere', 'transferredTerm'];
const BACHELORS_FOLLOW_UPS: Key[] = ['samePlace', 'ndIntegrated'];

/** Fold a transcript reading into the record (Option 1). Nothing changes once
 * the student has a complete answer — "imports no longer infer these once an
 * answer exists" (2026-09-22) — and a reading never overwrites a part already
 * there: it only fills gaps. One exception: a degree elsewhere read while the
 * student has said the Notre Dame MSCSE is "also held or started elsewhere"
 * (P3-prior-programs-1/-2). When this transcript contradicts a part READ from
 * another one, neither is kept: the part — with the follow-ups read for it —
 * is cleared for the student to answer; a part the student answered stays
 * theirs. The reading is never applied: the student confirms it (review of
 * Option 1, 2026-10-08). Says what happened, for the import's toast. */
export type ReadingResult = false | 'filled' | 'disagree';
export function mergeReading(s: Student, reading: BackgroundReading): ReadingResult {
  if (s.background !== undefined) return false;
  const draft: Partial<Background> = { ...(s.backgroundDraft ?? {}) };
  const read: Partial<Record<Key, string>> = { ...(s.backgroundRead ?? {}) };
  const from: Partial<Record<Key, ReadingSource>> = { ...(s.backgroundReadFrom ?? {}) };
  let changed = false;
  let disagree = false;
  const clear = (k: Key): void => {
    delete (draft as Record<string, unknown>)[k];
    delete read[k];
    delete from[k];
  };
  const fill = (k: Key, v: unknown, how: string | undefined): void => {
    const current = (draft as Record<string, unknown>)[k];
    if (current !== undefined) {
      if (read[k] !== undefined && JSON.stringify(current) !== JSON.stringify(v)) {
        clear(k);
        // What was read for the cleared answer goes with it.
        const followUps = k === 'graduate' ? GRADUATE_FOLLOW_UPS : k === 'bachelors' ? BACHELORS_FOLLOW_UPS : [];
        for (const f of followUps) if (read[f] !== undefined) clear(f);
        changed = true;
        disagree = true;
      }
      return;
    }
    (draft as Record<string, unknown>)[k] = v;
    if (how) {
      read[k] = how;
      from[k] = reading.source;
    }
    changed = true;
  };
  const { graduate, ...rest } = reading.answer;
  if (rest.bachelors !== undefined) fill('bachelors', rest.bachelors, reading.how.bachelors);
  if (graduate === 'elsewhere' && asksAlsoElsewhere(draft.graduate)) fill('alsoElsewhere', true, reading.how.graduate);
  else if (graduate !== undefined) fill('graduate', graduate, reading.how.graduate);
  // A reading's "finished" and "same university" describe the degree
  // elsewhere it read: they are filled only where the answer asks them about
  // that degree — not beside "No", nor beside another Notre Dame department
  // (whose "finished" is about that program), nor beside the MSCSE with "No"
  // to a degree elsewhere (review of Option 1, 2026-10-08).
  const aboutElsewhere = draft.graduate === 'elsewhere' || (asksAlsoElsewhere(draft.graduate) && draft.alsoElsewhere === true);
  for (const [k, v] of Object.entries(rest) as [Key, unknown][]) {
    if (k === 'bachelors') continue;
    if (k === 'finished' && (graduate === undefined || !aboutElsewhere)) continue;
    if (k === 'samePlace' && draft.graduate !== 'elsewhere') continue;
    fill(k, v, reading.how[k]);
  }
  if (!changed) return false;
  s.backgroundDraft = Object.keys(draft).length > 0 ? draft : undefined;
  s.backgroundRead = Object.keys(read).length > 0 ? read : undefined;
  s.backgroundReadFrom = Object.keys(from).length > 0 ? from : undefined;
  reconcileInferences(s);
  return disagree ? 'disagree' : 'filled';
}

/** An import removed while the answer is still a draft (review of Option 1,
 * 2026-10-08): what it read, and the student has not changed, goes — so the
 * next transcript is read afresh, not reported as a disagreement. */
export function forgetReadings(s: Student, source: ReadingSource): void {
  if (s.background !== undefined || !s.backgroundReadFrom) return;
  const draft: Partial<Background> = { ...(s.backgroundDraft ?? {}) };
  const read = { ...(s.backgroundRead ?? {}) };
  const from = { ...s.backgroundReadFrom };
  const drop = (k: Key): void => {
    delete (draft as Record<string, unknown>)[k];
    delete read[k];
    delete from[k];
  };
  for (const k of Object.keys(from) as Key[]) if (from[k] === source) drop(k);
  // A follow-up read for an answer that is now gone (a "same university?"
  // read against the master's just removed) goes too.
  if (draft.graduate === undefined) for (const k of GRADUATE_FOLLOW_UPS) if (read[k] !== undefined) drop(k);
  if (draft.bachelors === undefined) for (const k of BACHELORS_FOLLOW_UPS) if (read[k] !== undefined) drop(k);
  s.backgroundDraft = Object.keys(draft).length > 0 ? draft : undefined;
  s.backgroundRead = Object.keys(read).length > 0 ? read : undefined;
  s.backgroundReadFrom = Object.keys(from).length > 0 ? from : undefined;
  reconcileInferences(s);
}

/** The earlier-degrees draft and its read marks, kept by a Remove for its
 * Undo (coverage review, 2026-10-08: Remove forgets what the import read). */
export interface EarlierDegreesState {
  draft: Student['backgroundDraft'];
  read: Student['backgroundRead'];
  from: Student['backgroundReadFrom'];
}
export function earlierDegreesState(s: Student): EarlierDegreesState {
  return { draft: s.backgroundDraft && { ...s.backgroundDraft }, read: s.backgroundRead && { ...s.backgroundRead }, from: s.backgroundReadFrom && { ...s.backgroundReadFrom } };
}
/** Undo a Remove's forgetting — only while the answer is still a draft. */
export function restoreEarlierDegrees(s: Student, state: EarlierDegreesState): void {
  if (s.background !== undefined) return;
  s.backgroundDraft = state.draft;
  s.backgroundRead = state.read;
  s.backgroundReadFrom = state.from;
  reconcileInferences(s);
}

/** The student's own answer, from the questions on the page or the Change
 * dialog: whatever they changed is theirs now, not "read from your
 * transcript", and a follow-up read for an answer they changed goes with it.
 * A complete answer is applied. */
export function answerBackground(s: Student, given: Partial<Background>): void {
  const b: Partial<Background> = { ...given };
  const before: Partial<Background> = s.background ?? s.backgroundDraft ?? {};
  const read = { ...(s.backgroundRead ?? {}) };
  const from = { ...(s.backgroundReadFrom ?? {}) };
  const dropReadFollowUps = (keys: Key[]): void => {
    for (const k of keys) if (read[k] !== undefined && JSON.stringify(before[k]) === JSON.stringify(b[k])) delete (b as Record<string, unknown>)[k];
  };
  if (before.graduate !== b.graduate) dropReadFollowUps(GRADUATE_FOLLOW_UPS);
  if (before.bachelors !== b.bachelors) dropReadFollowUps(BACHELORS_FOLLOW_UPS);
  for (const k of Object.keys(read) as Key[]) {
    if (JSON.stringify(before[k]) !== JSON.stringify(b[k])) {
      delete read[k];
      delete from[k];
    }
  }
  s.backgroundRead = Object.keys(read).length > 0 ? read : undefined;
  s.backgroundReadFrom = Object.keys(from).length > 0 ? from : undefined;
  const done = completeBackground(b, s.program);
  if (done) {
    applyBackground(s, done);
    s.backgroundDraft = undefined;
  } else {
    // Incomplete: a draft. (An applied answer made incomplete again — the
    // Change dialog cannot do it — is withdrawn, undoing what it settled.)
    if (s.background !== undefined) withdrawBackground(s, b);
    else {
      s.backgroundDraft = Object.keys(b).length > 0 ? b : undefined;
      reconcileInferences(s);
    }
  }
}

/** The student confirms a draft that is already complete — every part read
 * from transcripts, or left so by a program change ("Done", review of Option
 * 1, 2026-10-08): it is applied, and nothing is marked as read any more. */
export function confirmDraft(s: Student): boolean {
  if (s.background !== undefined || s.backgroundDraft === undefined) return false;
  const done = completeBackground(s.backgroundDraft, s.program);
  if (!done) return false;
  applyBackground(s, done);
  s.backgroundDraft = undefined;
  s.backgroundRead = undefined;
  s.backgroundReadFrom = undefined;
  return true;
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
export function pruneRead(s: Student, b: Partial<Background>): void {
  const read = { ...(s.backgroundRead ?? {}) };
  const from = { ...(s.backgroundReadFrom ?? {}) };
  for (const k of Object.keys(read) as Key[]) if (b[k] === undefined) delete read[k];
  for (const k of Object.keys(from) as Key[]) if (b[k] === undefined) delete from[k];
  s.backgroundRead = Object.keys(read).length > 0 ? read : undefined;
  s.backgroundReadFrom = Object.keys(from).length > 0 ? from : undefined;
}

/** The import-time inferences, made to agree with a partial answer (review
 * of Option 1, 2026-10-08): an inference never stands against what the draft
 * already says — "another department", "none" or a transfer is not the Notre
 * Dame MSCSE held; "none" is no prior graduate program, and a "finished" for
 * an earlier program sets prior study to match (prior-nd.ts derivePriorMs);
 * a "No" to the 4+1, or a bachelor's that is not Notre Dame CSE's, is no
 * 4+1. The draft itself is still not applied. */
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
