// People students should contact, shown in the page footer and in the feedback
// notes. Not policy — names and addresses only. Since 2026-09-04 the names and
// emails come from the rules sheet's Parameters tab (contact_dgs_name,
// contact_dgs_email, contact_adgs_name, contact_adgs_email,
// contact_grad_admin_name, contact_grad_admin_email — see data/README.md), so
// a DGS handoff is a sheet edit, not a code change. The values below are the
// FALLBACK for keys that are missing or blank; refresh them occasionally so an
// offline snapshot without the keys still shows someone real.
import type { Parameters } from '../data/types.ts';
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
    role: 'Assistant DGS (ADGS)',
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

/** Overwrite the baked-in contacts with the sheet's Parameters values, when
 * present and non-blank (2026-09-04). Both pages call this right after the
 * rules load, before anything renders, so every place a name or address
 * appears — the contact card, the consent notice, the review-request
 * emails — shows the sheet's version. Mutates the Contact objects in place,
 * so the DGS/GRAD_ADMIN references below stay valid. */
export function applyContactOverrides(params: Parameters): void {
  const read = (key: string): string | undefined => {
    const v = params.raw.get(key)?.value.trim();
    return v ? v : undefined;
  };
  const apply = (c: Contact, prefix: string) => {
    c.name = read(`${prefix}_name`) ?? c.name;
    c.email = read(`${prefix}_email`) ?? c.email;
  };
  apply(CONTACTS[0]!, 'contact_dgs');
  apply(CONTACTS[1]!, 'contact_adgs');
  apply(CONTACTS[2]!, 'contact_grad_admin');
}

/** The DGS — the address error reports and feedback go to. */
export const DGS: Contact = CONTACTS[0]!;

/** The Graduate Program Administrator — course review requests MUST be
 * emailed to the DGS AND this address (DGS policy, 2026-09-03). */
export const GRAD_ADMIN: Contact = CONTACTS.find((c) => c.role === 'Graduate Program Administrator')!;

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
