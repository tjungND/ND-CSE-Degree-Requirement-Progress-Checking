// Browser-side rules loading: fetch the published sheet CSVs; on any failure,
// fall back to the bundled snapshot (raw CSV text, same parse path) and let the
// UI show "rules last synced on <date>".
import sheetUrls from '../../data/sheet-urls.json';
import snapshot from '../../data/snapshot.json';
import { rulesFromCsvTexts } from './assemble.ts';
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
  return rulesFromCsvTexts(snapshot.csv, { source: 'snapshot', syncedAt: snapshot.syncedAt });
}

/** Load live rules; never throws — the snapshot is the safety net. */
export async function loadRules(nowIso: string): Promise<Rules> {
  try {
    const [courses, parameters, categories] = await Promise.all([
      fetchCsv(sheetUrls.courses),
      fetchCsv(sheetUrls.parameters),
      fetchCsv(sheetUrls.categories),
    ]);
    const rules = rulesFromCsvTexts({ courses, parameters, categories }, { source: 'live', syncedAt: nowIso });
    // A live sheet with no usable Courses rows is worse than the snapshot.
    if (rules.courses.size === 0) return rulesFromSnapshot();
    return rules;
  } catch {
    return rulesFromSnapshot();
  }
}
