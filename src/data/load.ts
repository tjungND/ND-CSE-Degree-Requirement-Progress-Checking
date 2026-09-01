// Browser-side rules loading: fetch the published sheet CSVs; on any failure,
// fall back to the bundled snapshot (raw CSV text, same parse path) and let the
// UI show "showing the copy of the rules saved on <date>". Either way the rules
// are dated against that snapshot (src/data/rules-date.ts explains how).
import sheetUrls from '../../data/sheet-urls.json';
import snapshot from '../../data/snapshot.json';
import { rulesFromCsvTexts, type CsvTexts } from './assemble.ts';
import { dateLiveRules } from './rules-date.ts';
import type { Rules } from './types.ts';

const FETCH_TIMEOUT_MS = 12_000;

async function fetchCsv(url: string): Promise<string> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    // The published CSV is public; no credentials, no cookies.
    credentials: 'omit',
    cache: 'no-cache',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const text = await res.text();
  // Google serves an HTML error page (not CSV) for unpublished sheets.
  if (/^\s*</.test(text)) throw new Error('got HTML instead of CSV — is the tab still published?');
  return text;
}

export function rulesFromSnapshot(): Rules {
  // The snapshot holds exactly the content the sync last saw change, so its
  // syncedAt is when these rules last changed (rules-date.ts).
  return rulesFromCsvTexts(snapshot.csv, {
    source: 'snapshot',
    syncedAt: snapshot.syncedAt,
    rulesDate: { kind: 'known', at: snapshot.syncedAt },
  });
}

/** The live sheet is newer than the deployed copy: fine for a few hours after a
 * DGS edit, worth a look if it persists (the sync Action may have stopped). */
function noteNewerSheet(rules: Rules): Rules {
  if (rules.rulesDate?.kind === 'after') {
    rules.issues.push({
      severity: 'warning',
      tab: 'Courses',
      message:
        `The live sheet differs from the copy saved in the app on ${rules.rulesDate.at.slice(0, 10)}, so the pages can only say the rules were "updated after" that date. ` +
        'This is normal for up to ~6 hours after an edit — the sync-sheet Action then records the date, saves the new copy and redeploys. ' +
        "If it persists for more than a day, check that Action (MAINTENANCE.md, 'Sync, deploy, test').",
    });
  }
  return rules;
}

/** Load live rules; never throws — the snapshot is the safety net. */
export async function loadRules(nowIso: string): Promise<Rules> {
  try {
    const [courses, parameters, categories] = await Promise.all([
      fetchCsv(sheetUrls.courses),
      fetchCsv(sheetUrls.parameters),
      fetchCsv(sheetUrls.categories),
    ]);
    const live: CsvTexts = { courses, parameters, categories };
    const rules = rulesFromCsvTexts(live, {
      source: 'live',
      syncedAt: nowIso,
      rulesDate: dateLiveRules(live, snapshot),
    });
    // A live sheet missing an entire tab's data is worse than the snapshot
    // (e.g. a tab accidentally unpublished still returns an empty CSV).
    if (rules.courses.size === 0 || rules.parameters.raw.size === 0 || rules.categoryGroups.length === 0) {
      return rulesFromSnapshot();
    }
    return noteNewerSheet(rules);
  } catch {
    return rulesFromSnapshot();
  }
}
