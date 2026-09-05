// Where the rules live: the DGS's Google Spreadsheet, linked from both pages
// (DGS request, 2026-09-04). Students cannot open it — it is shared with faculty
// only — so every mention says so and points students at courses.html instead.
//
// The link itself comes from data/sheet-urls.json (`sheet_edit_url`), the ONE
// place the sheet's addresses are recorded; if the sheet is ever replaced, update
// that file and both the link here and the CSV fetch follow. The JSON import
// carries `with { type: 'json' }` because this module is also loaded by
// `node --test` (tests/sheet-source.test.ts), which requires the attribute;
// Vite accepts it too.
import sheetUrls from '../../data/sheet-urls.json' with { type: 'json' };
import { el } from './dom.ts';
import { handbookLink } from './handbook.ts';

/** The spreadsheet's title as it appears in Google Drive. */
export const SHEET_NAME = 'CSE-Degree-Checking-Rules'; // renamed from CSE-Degree-Audit-Rules on 2026-09-05 (DGS)

/** The human (edit/view) link — NOT one of the published-CSV links the app fetches. */
export const SHEET_EDIT_URL: string = sheetUrls.sheet_edit_url;

/** A link to the spreadsheet, opening in a new tab. */
export function sheetLink(label: string = SHEET_NAME): HTMLAnchorElement {
  return el('a', { href: SHEET_EDIT_URL, target: '_blank', rel: 'noopener noreferrer' }, label);
}

/** The one-line source note under each page's dated line in the masthead:
 *  the link, what it is in a phrase, and that only faculty can open it. */
export function sheetSourceLine(): HTMLElement {
  return el(
    'p',
    { class: 'effective sheet-source' },
    'Source: the ',
    sheetLink(),
    ' Google Spreadsheet — the DGS’s rules sheet; accessible by faculty only.',
  );
}

/** The footer explanation — deliberately short (DGS, 2026-09-04: readers, even
 *  faculty, do not need the sheet's internals): the data come from the DGS's
 *  rules spreadsheet, which is created based on the Graduate Studies Handbook
 *  (linked), and only faculty can open it. `page` picks the cross-reference —
 *  the self-check tool points students at the course rules page, and the course
 *  rules page says it shows the same rules. Returns the paragraph's children so
 *  each footer can prepend its own opening sentence. */
export function sheetSourceNote(page: 'app' | 'courses'): (string | Node)[] {
  const sameRules =
    page === 'app'
      ? ['students see the same rules on the ', el('a', { href: './courses.html' }, 'course rules page'), '.']
      : ['this page shows the same rules.'];
  return [
    'The data come from the DGS’s rules spreadsheet, ',
    sheetLink(),
    ', which is created based on the ',
    handbookLink(),
    '. ',
    el('strong', {}, 'The spreadsheet is accessible by faculty only'),
    '; ',
    ...sameRules,
  ];
}
