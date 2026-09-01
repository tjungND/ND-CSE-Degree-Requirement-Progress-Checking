// The handbook edition the page texts refer to, and where the official PDF lives.
// This is the ONE place to update when a new handbook is published (see README.md
// "The yearly routine"); the masthead, footer and copied summary all read from here.
// The rules themselves come from the Google Sheet and the engine, not from this file.
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
