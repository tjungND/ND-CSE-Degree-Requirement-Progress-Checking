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
import { DGS, mailto } from './contacts.ts';
import { el } from './dom.ts';

/** The spreadsheet's title as it appears in Google Drive. */
export const SHEET_NAME = 'CSE-Degree-Audit-Rules';

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

/** The footer explanation: what the spreadsheet is (its four tabs), that the
 *  page reads its published copy on every load, that only faculty can open it,
 *  and where students see the same rules instead. `page` picks the
 *  cross-reference: the self-check tool points at the course rules page and
 *  vice versa. Returns the paragraph's children so each footer can prepend its
 *  own opening sentence. */
export function sheetSourceNote(page: 'app' | 'courses'): (string | Node)[] {
  const crossRef =
    page === 'app'
      ? [
          'the ',
          el('a', { href: './courses.html' }, 'course rules page'),
          ' shows the same rules, and this tool applies them to your coursework.',
        ]
      : [
          'this page shows the same rules, and the ',
          el('a', { href: './index.html' }, 'degree self-check tool'),
          ' applies them to your coursework.',
        ];
  return [
    'The ',
    sheetLink(),
    ' Google Spreadsheet is the rules sheet the DGS maintains, with four tabs: ',
    el('em', {}, 'Courses'),
    ' (which courses count toward the MSCSE and the Ph.D., and each course’s core-knowledge area and specialization category), ',
    el('em', {}, 'Parameters'),
    ' (every number the handbook states — credit minimums, caps, time limits — and the contacts shown above), ',
    el('em', {}, 'Categories'),
    ' (the specialization categories of §4.4.2), and ',
    el('em', {}, 'ExternalCourses'),
    ' (the DGS’s rulings on courses from other universities). The page reads the sheet’s published copy every time it loads, so it always reflects the DGS’s latest decisions. ',
    el('strong', {}, 'The spreadsheet itself is accessible by faculty only'),
    ' — students do not need it: ',
    ...crossRef,
    ' Faculty who spot an error in the sheet: please email the DGS (',
    mailto(DGS.email),
    ').',
  ];
}
