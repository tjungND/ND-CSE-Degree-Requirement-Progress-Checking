// The handbook edition the page texts refer to, and where the official PDF lives.
// This is the ONE place to update when a new handbook is published (see README.md
// "The yearly routine"); the masthead, footer and copied summary all read from here.
// The rules themselves come from the Google Sheet and the engine, not from this file.
import { formatDateLong } from '../data/rules-date.ts';
import type { RulesDate } from '../data/types.ts';
import { el } from './dom.ts';

export const HANDBOOK_EDITION = 'July 2026';
export const HANDBOOK_URL =
  'https://cse.nd.edu/wp-content/uploads/sites/7/2026/07/CSE-Graduate-Handbook-July2026.pdf';
export const HANDBOOK_TITLE = `CSE Graduate Studies Handbook (${HANDBOOK_EDITION})`;

/** A link to the official handbook PDF, opening in a new tab. */
export function handbookLink(label: string = HANDBOOK_TITLE): HTMLAnchorElement {
  return el('a', { href: HANDBOOK_URL, target: '_blank', rel: 'noopener noreferrer' }, label);
}

/** The alpha-status disclaimer, worded by the DGS (docs/DECISIONS.md, 2026-09-01). */
export const ALPHA_NOTICE =
  'This page is for informational purposes only and is provided without any warranty or ' +
  'guarantee. It is not an official degree audit; the final decision on every requirement ' +
  'is at the discretion of the Director of Graduate Studies.';

/** The dated line under each page's title — one sentence, one date (DGS wording,
 *  2026-09-01): "The course rules here are up-to-date as of <date>." Precedence:
 *  1. the DGS's explicit `rules_effective_date` Parameters row (an override for
 *     when the policy date differs from the last edit) → "Rules effective as of …";
 *  2. `rules.rulesDate` from `src/data/rules-date.ts`: `known` → the date the sheet
 *     last changed (as recorded by the sync); `after` → the live sheet is newer than
 *     the deployed copy, and since the page has just read it, "as of <today>" (the
 *     next sync run, within 6 hours, pins the revision date);
 *  3. nothing dated at all (rules built without a snapshot) → "… those in effect for
 *     <current term>." */
export function rulesDateLine(
  rules: { parameters: { raw: ReadonlyMap<string, { value: string }> }; rulesDate?: RulesDate },
  currentTermLabel: string,
  todayIso: string,
): string {
  const v = rules.parameters.raw.get('rules_effective_date')?.value.trim();
  if (v) return `Rules effective as of ${formatYmdLong(v) ?? v}.`;
  if (rules.rulesDate?.kind === 'known') {
    const at = formatDateLong(rules.rulesDate.at);
    if (at) return `The course rules here are up-to-date as of ${at}.`;
  }
  if (rules.rulesDate?.kind === 'after') {
    const today = formatYmdLong(todayIso);
    if (today) return `The course rules here are up-to-date as of ${today}.`;
  }
  return `The course rules here are those in effect for ${currentTermLabel}.`;
}

/** "2026-09-01" → "September 1, 2026" as a calendar date (no time-zone shift);
 *  undefined for anything that is not YYYY-MM-DD. */
function formatYmdLong(ymd: string): string | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return undefined;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}
