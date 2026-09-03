// Browser-side rules loading: fetch the published sheet CSVs, reporting progress
// so the page can show what it is waiting for (src/ui/loading.ts). On failure
// the loader THROWS a RulesLoadError — it does NOT fall back to the bundled
// snapshot by itself (DGS decision 2026-09-01: when Google does not answer,
// suggest reloading rather than quietly showing an older copy). The page offers
// the saved copy as a second choice (rulesFromSnapshot) so the tool still works
// if the sheet is ever unpublished. Either way the rules are dated against that
// snapshot (src/data/rules-date.ts explains how).
import sheetUrls from '../../data/sheet-urls.json';
import snapshot from '../../data/snapshot.json';
import { rulesFromCsvTexts, type CsvTexts } from './assemble.ts';
import { dateLiveRules } from './rules-date.ts';
import type { Rules } from './types.ts';

/** How long the page waits for Google before giving up. The loading card
 * promises "up to 15 seconds" — keep the two in step. */
export const FETCH_TIMEOUT_MS = 15_000;

export type TabName = keyof CsvTexts;
/** The three tabs the app cannot run without. */
export const REQUIRED_TABS: readonly TabName[] = ['courses', 'parameters', 'categories'];
/** The tabs in words a student understands ("the course list", not "Courses"). */
export const TAB_LABELS: Record<TabName, string> = {
  courses: 'the course list',
  parameters: 'the parameters',
  categories: 'the categories',
  external: 'the external-course rules',
};

/** Is the ExternalCourses tab published and configured? Until the DGS creates
 * the tab and pastes its published-CSV URL into data/sheet-urls.json, the app
 * runs without it and every external course shows as "not yet reviewed". */
export const EXTERNAL_TAB_CONFIGURED: boolean =
  typeof (sheetUrls as { external?: string }).external === 'string' && (sheetUrls as { external?: string }).external !== '';

/** What the loader reports while it works (drives the loading card). */
export type LoadProgress =
  | { step: 'connect' }
  | { step: 'tab'; tab: TabName; rows: number; ms: number }
  | { step: 'check' };

export type LoadFailureKind = 'timeout' | 'unreachable' | 'http' | 'unpublished' | 'empty';

/** Why a live load failed, in words a student can act on. `retryable` says
 * whether reloading the page is likely to help (a hung or failed connection:
 * yes; a sheet that is unpublished or empty: no — that needs the DGS). */
export class RulesLoadError extends Error {
  constructor(
    readonly kind: LoadFailureKind,
    readonly tab: TabName | undefined,
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'RulesLoadError';
  }
}

/** The day the bundled copy was saved (YYYY-MM-DD), for the page's messages. */
export const SNAPSHOT_SAVED_ON = snapshot.syncedAt.slice(0, 10);

/** Data rows in a CSV text: non-empty lines (a line of only commas is a blank
 * sheet row) minus the header. Good enough for "371 rows" on the loading card. */
export function countCsvRows(csv: string): number {
  let n = 0;
  for (const line of csv.split(/\r?\n/)) if (!/^[\s,]*$/.test(line)) n++;
  return Math.max(0, n - 1);
}

async function fetchCsv(tab: TabName, url: string, onProgress: (p: LoadProgress) => void): Promise<string> {
  const started = Date.now();
  let res: Response;
  let text: string;
  try {
    res = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      // The published CSV is public; no credentials, no cookies.
      credentials: 'omit',
      cache: 'no-cache',
    });
    if (!res.ok) {
      throw new RulesLoadError('http', tab, `Google answered with an error (HTTP ${res.status}) for ${TAB_LABELS[tab]}.`, true);
    }
    text = await res.text();
  } catch (e) {
    if (e instanceof RulesLoadError) throw e;
    if (e instanceof DOMException && (e.name === 'TimeoutError' || e.name === 'AbortError')) {
      throw new RulesLoadError(
        'timeout',
        tab,
        `Google did not send ${TAB_LABELS[tab]} within ${FETCH_TIMEOUT_MS / 1000} seconds.`,
        true,
      );
    }
    throw new RulesLoadError('unreachable', tab, 'The spreadsheet could not be reached — check your internet connection.', true);
  }
  // Google serves an HTML error page (not CSV) for unpublished sheets.
  if (/^\s*</.test(text)) {
    throw new RulesLoadError(
      'unpublished',
      tab,
      'The spreadsheet is no longer published to the web, so no one can load it until the DGS re-publishes it. Reloading will not help.',
      false,
    );
  }
  onProgress({ step: 'tab', tab, rows: countCsvRows(text), ms: Date.now() - started });
  return text;
}

/** The copy of the rules saved in the app (data/snapshot.json) — shown only
 * when the student chooses it after a failed live load. Its syncedAt is when
 * these rules were first seen by the sync, so they are dated `known`. */
export function rulesFromSnapshot(): Rules {
  return rulesFromCsvTexts(snapshot.csv as CsvTexts, {
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

/** Load the live rules, reporting progress; throws RulesLoadError on failure.
 * The optional ExternalCourses tab is different: if IT alone fails, the app
 * still runs — external courses degrade to "not yet reviewed" and the
 * diagnostics panel says why (never a dead page over the optional tab). */
export async function loadLiveRules(nowIso: string, onProgress: (p: LoadProgress) => void = () => {}): Promise<Rules> {
  onProgress({ step: 'connect' });
  const urls = sheetUrls as { courses: string; parameters: string; categories: string; external?: string };
  let externalIssue: string | undefined;
  const externalPromise: Promise<string | undefined> = EXTERNAL_TAB_CONFIGURED
    ? fetchCsv('external', urls.external!, onProgress).catch((e: unknown) => {
        externalIssue = e instanceof Error ? e.message : String(e);
        return undefined;
      })
    : Promise.resolve(undefined);
  const [courses, parameters, categories, external] = await Promise.all([
    fetchCsv('courses', urls.courses, onProgress),
    fetchCsv('parameters', urls.parameters, onProgress),
    fetchCsv('categories', urls.categories, onProgress),
    externalPromise,
  ]);
  onProgress({ step: 'check' });
  const live: CsvTexts = { courses, parameters, categories, ...(external !== undefined ? { external } : {}) };
  const rules = rulesFromCsvTexts(live, { source: 'live', syncedAt: nowIso, rulesDate: dateLiveRules(live, snapshot) });
  // A tab that answered but holds no data (cleared by accident, or unpublished
  // on its own) is a failure to report, not "there are no courses".
  const emptyTab: TabName | undefined =
    rules.courses.size === 0 ? 'courses' : rules.parameters.raw.size === 0 ? 'parameters' : rules.categoryGroups.length === 0 ? 'categories' : undefined;
  if (emptyTab) {
    throw new RulesLoadError(
      'empty',
      emptyTab,
      `The spreadsheet answered, but ${TAB_LABELS[emptyTab]} tab is empty — the DGS needs to check the sheet. Reloading will not help until then.`,
      false,
    );
  }
  if (externalIssue !== undefined) {
    rules.issues.push({
      severity: 'warning',
      tab: 'ExternalCourses',
      message: `The ExternalCourses tab could not be loaded (${externalIssue}) — courses from other universities show as "not yet reviewed by the DGS" until it is reachable again.`,
    });
  }
  return noteNewerSheet(rules);
}
