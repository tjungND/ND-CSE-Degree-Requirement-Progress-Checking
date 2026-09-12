// Who decides (DGS 2026-09-11): "the ADGS will make decisions in the approval
// chain of MSCSE students. Regardless of which requirements are being decided,
// ADGS decides them for MSCSE students, and DGS decides them for PhD students."
//
// The engine's wording was written with one decider in mind, so rather than
// thread a name through every sentence, the finished text is rewritten once
// at the boundary: every standalone "DGS" becomes "ADGS" for an MSCSE
// student. "ADGS" itself never matches (no word boundary before the D), and
// handbook quotes are never rewritten — the handbook says what it says.
import type { Program } from './types.ts';

/** The title of the person who decides for this degree. */
export function deciderTitle(program: Program): 'DGS' | 'ADGS' {
  return program === 'mscse' ? 'ADGS' : 'DGS';
}

/** Rewrite a student-facing sentence for the degree's decider. */
export function decisionWording(program: Program, text: string): string {
  const byProgram = program === 'mscse' ? text.replace(/\bDGS\b/g, 'ADGS') : text;
  // A reviewer the rules sheet named for one course (`adgs_approval` /
  // `dgs_approval`, 2026-09-12) arrives as a token and wins over the
  // program's default: the sheet says who, per course.
  return byProgram.replace(/\{\{(A?DGS)\}\}/g, '$1');
}

/** Does this Courses-tab value ask for a sign-off? */
export function needsCourseApproval(counts: string | undefined): boolean {
  return counts === 'dgs_approval' || counts === 'adgs_approval';
}

/** The reviewer a Courses-tab value names, as a token `decisionWording` unwraps
 * — so a `dgs_approval` course on the MSCSE tab still says DGS. */
export function approverToken(counts: string | undefined): string {
  return counts === 'adgs_approval' ? '{{ADGS}}' : '{{DGS}}';
}

/** The same, over any string-bearing value (detail parts nest). */
export function decisionWordingDeep<T>(program: Program, value: T): T {
  if (program !== 'mscse') return value;
  if (typeof value === 'string') return decisionWording(program, value) as T;
  if (Array.isArray(value)) return value.map((v) => decisionWordingDeep(program, v)) as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = k === 'citation' ? v : decisionWordingDeep(program, v);
    return out as T;
  }
  return value;
}
