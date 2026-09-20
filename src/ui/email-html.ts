// DOM-free text helpers shared by the copied emails (advisor-summary.ts,
// grad-admin-request.ts) and the page (app.ts): HTML escaping for the
// text/html clipboard flavour, the two program names, and a plural.
// (transcript/external.ts keeps its own `esc` — it is the other side of the
// engine/ui line.)
import type { Program } from '../engine/types.ts';

/** Escape a string for the HTML flavour of a copied message. */
export function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** "M.S. in CSE" / "Ph.D." — the subject lines. */
export function programShort(program: Program): string {
  return program === 'mscse' ? 'M.S. in CSE' : 'Ph.D.';
}

/** "M.S. in CSE (Handbook §3)" / "Ph.D. (Handbook §4)" — the standing paragraph. */
export function programLabel(program: Program): string {
  return program === 'mscse' ? 'M.S. in CSE (Handbook §3)' : 'Ph.D. (Handbook §4)';
}

/** "1 course" / "3 courses" — a count and its noun, pluralised with -s. */
export function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}
