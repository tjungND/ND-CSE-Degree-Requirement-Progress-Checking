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

/** The dated line under each page's title — two dates, one sentence (DGS wording,
 *  2026-09-01): "The course rules here were last updated on <X>, and are up-to-date
 *  as of <Y>." X is when the sheet's content last changed; Y is the day the page
 *  read the sheet (or, when the live fetch failed, the day the fallback copy was
 *  saved — the banner explains). X comes from `rules.rulesDate`
 *  (`src/data/rules-date.ts`): `known` → that date; `after` → the live sheet is
 *  newer than the deployed copy, so "were updated after <copy date>" until the next
 *  sync run (within 6 hours) pins the revision date. The DGS's optional
 *  `rules_effective_date` Parameters row replaces X with "are effective as of <date>";
 *  rules built without a snapshot (tests) fall back to "are those in effect for
 *  <term>". */
export function rulesDateLine(
  rules: {
    parameters: { raw: ReadonlyMap<string, { value: string }> };
    rulesDate?: RulesDate;
    source: 'live' | 'snapshot';
    syncedAt: string;
  },
  currentTermLabel: string,
  todayIso: string,
): string {
  const asOf = rules.source === 'live' ? formatYmdLong(todayIso.slice(0, 10)) : formatDateLong(rules.syncedAt);
  const tail = asOf ? `, and are up-to-date as of ${asOf}.` : '.';
  const override = rules.parameters.raw.get('rules_effective_date')?.value.trim();
  if (override) return `The course rules here are effective as of ${formatYmdLong(override) ?? override}${tail}`;
  const at = formatDateLong(rules.rulesDate?.at);
  if (at && rules.rulesDate?.kind === 'known') return `The course rules here were last updated on ${at}${tail}`;
  if (at) return `The course rules here were updated after ${at}${tail}`;
  return `The course rules here are those in effect for ${currentTermLabel}${tail}`;
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
