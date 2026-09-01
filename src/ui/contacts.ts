// People students should contact, shown in the page footer and in the feedback
// notes. Not policy — names and addresses only. Update this file at every DGS
// handoff (README.md "Handoff checklist"); nothing else on the page needs to change.
import { el } from './dom.ts';

export interface Contact {
  role: string;
  name: string;
  email: string;
  /** What to ask this person about. */
  scope: string;
}

export const CONTACTS: Contact[] = [
  {
    role: 'Director of Graduate Studies (DGS)',
    name: 'Taeho Jung',
    email: 'tjung@nd.edu',
    scope: 'Ph.D. policies and the graduate program in general',
  },
  {
    role: 'Assistant DGS',
    name: 'Aaron Dingler',
    email: 'adingler@nd.edu',
    scope: 'MSCSE policies',
  },
  {
    role: 'Graduate Program Administrator',
    name: 'Cari White',
    email: 'csalmons@nd.edu',
    scope: 'logistics, paperwork, processing — and everything else',
  },
];

/** The DGS — the address error reports and feedback go to. */
export const DGS: Contact = CONTACTS[0]!;

/** A mailto link showing the address itself. */
export function mailto(email: string): HTMLAnchorElement {
  return el('a', { href: `mailto:${email}` }, email);
}

/** "…please email the DGS (tjung@nd.edu)." — used under the disclaimer and the PDF upload. */
export function reportToDgs(prefix: string): (string | Node)[] {
  return [prefix, ' the DGS (', mailto(DGS.email), ').'];
}

/** The "Who to contact" card shown at the top right of every page. */
export function contactCard(): HTMLElement {
  return el(
    'aside',
    { class: 'contact-card', 'aria-label': 'Who to contact' },
    el('h2', {}, 'Who to contact'),
    el(
      'ul',
      {},
      ...CONTACTS.map((c) =>
        el(
          'li',
          {},
          el('span', { class: 'role' }, c.role),
          ': ',
          c.name,
          ' (',
          mailto(c.email),
          ')',
          el('span', { class: 'scope' }, c.scope),
        ),
      ),
    ),
  );
}

// The public source repository, linked from the footer's license line.
export const REPO_URL = 'https://github.com/tjungND/ND-CSE-Degree-Requirement-Progress-Checking';
export const LICENSE_URL = `${REPO_URL}/blob/main/LICENSE.md`;
