// When did the course rules last change? Google's published CSVs carry no
// Last-Modified (or ETag) header — verified 2026-09-01 by fetching all three tabs
// from the deployed page's own origin — so the app dates the rules itself, from
// the committed snapshot:
//   scripts/sync-sheet.ts runs every 6 hours (GitHub Action) and leaves
//   data/snapshot.json UNTOUCHED while the sheet's content is unchanged. So the
//   snapshot's `syncedAt` is the moment the CURRENT rules were first seen —
//   normally the day of the DGS's edit, never earlier than the real edit — and
//   each snapshot commit reads as "what the DGS changed".
// Pure (no fetch, no DOM) so the browser loader, the sync script and the tests
// share one definition of "same content".
import type { CsvTexts } from './assemble.ts';
import type { RulesDate } from './types.ts';

/** Same sheet content? Line endings and trailing whitespace are ignored so a
 * cosmetic difference in how the text was captured never looks like an edit. */
export function sameCsvContent(a: CsvTexts, b: CsvTexts): boolean {
  return changedTabs(a, b).length === 0;
}

/** Which tabs differ (for the sync log). The optional external tab counts as
 * changed when it appears, disappears, or its content changes. */
export function changedTabs(a: CsvTexts, b: CsvTexts): (keyof CsvTexts)[] {
  const tabs: (keyof CsvTexts)[] = ['courses', 'parameters', 'categories', 'external'];
  return tabs.filter((tab) => {
    const av = a[tab];
    const bv = b[tab];
    if (av === undefined || bv === undefined) return av !== bv;
    return normalize(av) !== normalize(bv);
  });
}

function normalize(text: string): string {
  return text.replace(/\r\n?/g, '\n').trimEnd();
}

/** Date the live rules against the bundled snapshot: identical content → they
 * last changed when the snapshot captured them; different → some time after. */
export function dateLiveRules(live: CsvTexts, snapshot: { syncedAt: string; csv: CsvTexts }): RulesDate {
  return { kind: sameCsvContent(live, snapshot.csv) ? 'known' : 'after', at: snapshot.syncedAt };
}

/** "September 1, 2026" in the reader's local time zone; undefined for bad input. */
export function formatDateLong(iso: string | undefined): string | undefined {
  if (!iso) return undefined;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return undefined;
  return new Date(t).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}
