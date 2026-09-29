// DOM-free text helpers shared by the copied emails (advisor-summary.ts,
// grad-admin-request.ts) and the page (app.ts): HTML escaping for the
// text/html clipboard flavour, the two program names, a plural — and, since
// 2026-09-28 (DGS: "Use the same style as in the texts for Grad Admin to
// format the text summary copied for advisor"), the ONE style both emails
// use for a requirement's standing: a coloured badge (HTML) or a [WORD] tag
// (text), and a deadline line highlighted when it is this semester, next
// semester or past.
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

/** The page's pill colours, named (DGS 2026-09-28: "green, amber, and gray";
 * red for a passed deadline and blue for a conditional row are the page's
 * own). `standingColor` in report.ts picks one per row. */
export type StandingColor = 'green' | 'amber' | 'grey' | 'red' | 'blue';

/** Inline styles — mail clients keep no stylesheet. The values are the
 * page's pills (style.css). */
export const BADGE_STYLE: Record<StandingColor, string> = {
  green: 'background:#e4f2ea;color:#10693f',
  amber: 'background:#fbeedd;color:#8e5108',
  grey: 'background:#eef0f3;color:#5a6472',
  red: 'background:#fbe9e7;color:#a81e14',
  blue: 'background:#e7eef9;color:#1f4e8c',
};

/** The status word as a pill: "Met", "In progress", "Not started" … */
export function htmlBadge(word: string, color: StandingColor): string {
  return `<span style="display:inline-block;padding:1px 8px;border-radius:99px;font-weight:bold;font-size:12px;${BADGE_STYLE[color]}">${esc(word)}</span>`;
}

/** How near a deadline is: this semester, next semester, already past, or
 * (undefined) further off. */
export type DeadlineAlert = 'this' | 'next' | 'passed' | undefined;

/** The deadline line in HTML: an orange box for this or next semester, a red
 * one for a passed deadline, plain text otherwise. `block` (default) is a
 * paragraph of its own; a table cell gets an inline box. */
export function htmlDeadline(text: string, alert: DeadlineAlert, block = true): string {
  const style =
    alert === 'passed'
      ? 'background:#fbe9e7;color:#7a1f1f;border-left:4px solid #a81e14'
      : alert
        ? 'background:#ffe3c9;color:#8a3a00;border-left:4px solid #e0863a'
        : '';
  const lead = alert === 'passed' ? 'Deadline passed:' : alert ? `Deadline ${alert} semester:` : 'Deadline:';
  const inner = `<strong>${lead}</strong> ${esc(text)}`;
  if (!style) return block ? `<p style="margin:2px 0 6px">${inner}</p>` : esc(text);
  return block ? `<p style="margin:2px 0 6px;padding:4px 8px;${style}">${inner}</p>` : `<span style="display:inline-block;padding:2px 6px;${style}">${inner}</span>`;
}

/** The deadline line in plain text: "!! DEADLINE NEXT SEMESTER: …",
 * "!! DEADLINE PASSED: …", or "Deadline: …" when it is further off. */
export function textDeadline(text: string, alert: DeadlineAlert): string {
  return alert === 'passed' ? `!! DEADLINE PASSED: ${text}` : alert ? `!! DEADLINE ${alert.toUpperCase()} SEMESTER: ${text}` : `Deadline: ${text}`;
}
