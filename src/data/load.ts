// Browser-side rules loading: fetch the published sheet CSVs, reporting progress
// so the page can show what it is waiting for (src/ui/loading.ts). On failure
// the loader THROWS a RulesLoadError — it does NOT fall back to the bundled
// snapshot by itself (DGS decision 2026-09-01: when Google does not answer,
// suggest reloading rather than quietly showing an older copy). The page offers
// the saved copy as a second choice (rulesFromSnapshot) so the tool still works
// if the sheet is ever unpublished. Either way the rules are dated against that
// snapshot (src/data/rules-date.ts explains how).
import sheetUrls from '../../data/sheet-urls.json' with { type: 'json' }; // the attribute lets node's test runner import this file too
import snapshot from '../../data/snapshot.json' with { type: 'json' };
import { rulesFromCsvTexts, type CsvTexts } from './assemble.ts';
import { dateLiveRules } from './rules-date.ts';
import type { Rules } from './types.ts';

/** How long each request to Google may take before it is abandoned and the
 * tab asked for again — one entry per attempt. Google's publish-to-web
 * endpoint answers a tab in well under a second most of the time, but every so
 * often a request simply stalls (measured from the DGS's Mac, 2026-09-06: about
 * 1 request in 15 hung past 10 s, whether the tabs were fetched one at a time
 * or together, while the next request for the same tab answered in 0.3 s).
 * Waiting longer for a stalled request does not help; asking again does. The
 * first attempt is short (a stall costs six seconds, not fifteen); the later
 * ones are longer so a slow but working connection still gets through. */
export const ATTEMPT_TIMEOUTS_MS: readonly number[] = [6_000, 10_000, 14_000];
/** Attempts per tab before the load is reported as failed. */
export const MAX_ATTEMPTS = ATTEMPT_TIMEOUTS_MS.length;
/** Tabs fetched at the same time (DGS suggestion 2026-09-06). Two keeps the
 * page fast when Google is healthy and gentle on the endpoint, which stalls
 * more often under three or four simultaneous requests for one spreadsheet. */
export const FETCH_CONCURRENCY = 2;
/** What the loading card calls the upper bound ("usually a few seconds, up to
 * about 30"): the three attempts end to end, plus the pauses between them. */
export const LOAD_BUDGET_MS = 30_000;

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
  /** A request stalled and the tab is being asked for again. */
  | { step: 'retry'; tab: TabName; attempt: number; of: number }
  | { step: 'tab'; tab: TabName; rows: number; ms: number }
  | { step: 'check' };

export type LoadFailureKind = 'timeout' | 'unreachable' | 'http' | 'unpublished' | 'empty';

/** Why a live load failed, in words a student can act on. `retryable` says
 * whether reloading the page is likely to help (a hung or failed connection:
 * yes; a sheet that is unpublished or empty: no — that needs the DGS). */
export class RulesLoadError extends Error {
  readonly kind: LoadFailureKind;
  readonly tab: TabName | undefined;
  readonly retryable: boolean;
  /** The HTTP status for kind 'http' (a 5xx is worth asking again; a 4xx is not). */
  readonly status: number | undefined;
  // Plain fields rather than constructor parameter properties: node's
  // type-stripping test runner does not support the latter (tests/load-retry.test.ts).
  constructor(kind: LoadFailureKind, tab: TabName | undefined, message: string, retryable: boolean, status?: number) {
    super(message);
    this.name = 'RulesLoadError';
    this.kind = kind;
    this.tab = tab;
    this.retryable = retryable;
    this.status = status;
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

/** One request for one tab. Exported for the tests, which stub `fetch`. */
export async function fetchCsvOnce(tab: TabName, url: string, onProgress: (p: LoadProgress) => void, timeoutMs: number): Promise<string> {
  const started = Date.now();
  let res: Response;
  let text: string;
  try {
    res = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      // The published CSV is public; no credentials, no cookies.
      credentials: 'omit',
      cache: 'no-cache',
    });
    if (!res.ok) {
      throw new RulesLoadError('http', tab, `Google answered with an error (HTTP ${res.status}) for ${TAB_LABELS[tab]}.`, true, res.status);
    }
    text = await res.text();
  } catch (e) {
    if (e instanceof RulesLoadError) throw e;
    if (e instanceof DOMException && (e.name === 'TimeoutError' || e.name === 'AbortError')) {
      throw new RulesLoadError('timeout', tab, `Google did not send ${TAB_LABELS[tab]} within ${timeoutMs / 1000} seconds.`, true);
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

/** Is this failure the kind that a second request usually cures? A stalled or
 * dropped request, or a server-side error — not an unpublished sheet (an HTML
 * page instead of CSV) or a 4xx, which the DGS has to fix. */
export function worthRetrying(e: unknown): boolean {
  return e instanceof RulesLoadError && (e.kind === 'timeout' || e.kind === 'unreachable' || (e.kind === 'http' && (e.status ?? 0) >= 500));
}

/** Fetch one tab, asking again after a stalled request (up to MAX_ATTEMPTS).
 * The pause between attempts is short: the stall is a one-off on Google's
 * side, not a sign that the endpoint is overloaded. */
export async function fetchCsv(
  tab: TabName,
  url: string,
  onProgress: (p: LoadProgress) => void,
  timeouts: readonly number[] = ATTEMPT_TIMEOUTS_MS,
  pause: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): Promise<string> {
  const attempts = timeouts.length;
  for (let attempt = 1; ; attempt++) {
    try {
      return await fetchCsvOnce(tab, url, onProgress, timeouts[attempt - 1]!);
    } catch (e) {
      if (!worthRetrying(e) || attempt >= attempts) {
        if (e instanceof RulesLoadError && e.kind === 'timeout' && attempts > 1) {
          const total = timeouts.reduce((a, b) => a + b, 0) / 1000;
          throw new RulesLoadError('timeout', tab, `Google did not send ${TAB_LABELS[tab]} — ${attempts} requests, ${total} seconds in all, went unanswered.`, true);
        }
        throw e;
      }
      onProgress({ step: 'retry', tab, attempt: attempt + 1, of: attempts });
      await pause(250 * attempt);
    }
  }
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
  // Two tabs at a time, each request retried after a stall (2026-09-06). The
  // tabs were first fetched all at once (12–30 s waits, timeouts: the endpoint
  // stalls more often under three or four simultaneous requests), then one
  // after another (still failed whenever ANY single request stalled — one in
  // about fifteen does, and one stall was the whole 15-second budget). What
  // works is not waiting on a stalled request: 8 s, then ask again.
  const got: Partial<Record<TabName, string>> = {};
  let externalIssue: string | undefined;
  let failed = false;
  const queue: TabName[] = ['courses', 'parameters', 'categories', ...(EXTERNAL_TAB_CONFIGURED ? (['external'] as TabName[]) : [])];
  const worker = async (): Promise<void> => {
    for (let tab = queue.shift(); tab !== undefined && !failed; tab = queue.shift()) {
      try {
        got[tab] = await fetchCsv(tab, urls[tab]!, onProgress);
      } catch (e: unknown) {
        // The optional tab degrades; a required one fails the load (and the
        // other worker stops taking tabs — the card is already reporting).
        if (tab !== 'external') {
          failed = true;
          throw e;
        }
        externalIssue = e instanceof Error ? e.message : String(e);
      }
    }
  };
  await Promise.all(Array.from({ length: FETCH_CONCURRENCY }, worker));
  const { courses, parameters, categories, external } = got as { courses: string; parameters: string; categories: string; external?: string };
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
