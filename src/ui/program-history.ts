// The student's Notre Dame programs with their entry terms — the subject line
// and the standing paragraph of every copied email (DGS 2026-09-28: "need all
// ND programs and their entry terms including transfer — in case students
// have BS, MS at ND and/or transferred into PhD from MS"). DOM-free.
//
// What the record knows: the current program and its entry term; the
// earlier-degrees answer (src/ui/background.ts); for a transfer from the
// Notre Dame MSCSE into the Ph.D., the transfer term (asked in the same
// dialog — the entry term stays the MSCSE's, since every clock counts from
// it, DGS 2026-09-26); the award terms a Notre Dame transcript carries
// (`bachelorsAwarded`, `ndMasters.term`, `ndDegrees`); and the terms of the
// Notre Dame coursework from before the entry term, which bound each earlier
// program. Nothing is guessed: a term the record does not hold is left out.
import { isNotreDameInstitution } from '../data/external.ts';
import { compareTerm, termLabel, termOfDate } from '../engine/term.ts';
import type { Student, Term } from '../engine/types.ts';
import { programShort } from './email-html.ts';

export interface ProgramHistory {
  /** For a subject line: "Ph.D., entered Fall 2025; MSCSE at Notre Dame, Fall 2023–Spring 2025". */
  compact: string;
  /** The earlier Notre Dame programs as one sentence for the standing
   * paragraph — "Earlier Notre Dame programs: …" — or '' when the current
   * program is the only one. */
  earlier: string;
}

/** First and last term of the Notre Dame coursework from before entry at one
 * degree level (the transcript's UG/GR column decided the level). */
function span(student: Student, level: 'bachelors' | 'masters'): { from?: Term; to?: Term } {
  const terms = student.courses
    .filter((c) => c.origin === 'transfer' && isNotreDameInstitution(c.institution) && c.degreeLevel === level)
    .map((c) => c.term)
    .sort(compareTerm);
  return terms.length === 0 ? {} : { from: terms[0], to: terms[terms.length - 1] };
}

/** The award term the record holds for a Notre Dame degree, if any. A
 * bachelor's known only as "before <term>" is not an award term. */
function awarded(student: Student, level: 'bachelors' | 'masters'): Term | undefined {
  if (level === 'bachelors') return student.bachelorsAwardedInferred?.before ? undefined : student.bachelorsAwarded;
  if (student.ndMasters?.term) return student.ndMasters.term;
  const conferral = (student.ndDegrees ?? []).find((d) => d.level === 'masters');
  return conferral ? termOfDate(conferral.date) : undefined;
}

/** ", Fall 2021–Spring 2023" / ", awarded Spring 2023" / ", from Fall 2021" / "". */
function range(from: Term | undefined, to: Term | undefined, award: Term | undefined): string {
  const end = award ?? to;
  if (from && end && compareTerm(from, end) < 0) return `, ${termLabel(from)}–${termLabel(end)}`;
  if (award) return `, awarded ${termLabel(award)}`;
  if (from) return `, from ${termLabel(from)}`;
  return '';
}

export function programHistory(student: Student): ProgramHistory {
  const b = student.background;
  const entry = termLabel(student.entryTerm);
  // The current program. A transfer from the MSCSE keeps the MSCSE's entry
  // term (every clock counts from it) and names the term of the transfer.
  const current =
    student.program === 'phd' && b?.graduate === 'nd-mscse-transfer'
      ? `Ph.D. (transferred ${b.transferredTerm ? termLabel(b.transferredTerm) : 'term not entered'} from the Notre Dame MSCSE, entered ${entry})`
      : `${programShort(student.program)}, entered ${entry}`;
  const earlier: string[] = [];
  if (b?.graduate === 'nd-mscse' || b?.graduate === 'nd-4plus1' || b?.graduate === 'nd-other') {
    const { from, to } = span(student, 'masters');
    const what = b.graduate === 'nd-other' ? 'a graduate degree at Notre Dame (another department)' : `MSCSE at Notre Dame${b.graduate === 'nd-4plus1' ? ' (Integrated 4+1)' : ''}`;
    earlier.push(`${what}${range(from, to, awarded(student, 'masters'))}`);
  }
  if (b?.bachelors === 'nd-cse' || b?.bachelors === 'nd-other') {
    const { from, to } = span(student, 'bachelors');
    const what = b.bachelors === 'nd-cse' ? `B.S. at Notre Dame CSE${b.ndIntegrated ? ' (Integrated 4+1)' : ''}` : 'B.S. at Notre Dame (another department)';
    earlier.push(`${what}${range(from, to, awarded(student, 'bachelors'))}`);
  }
  return {
    compact: [current, ...earlier].join('; '),
    earlier: earlier.length > 0 ? `Earlier Notre Dame programs: ${earlier.join('; ')}.` : '',
  };
}
