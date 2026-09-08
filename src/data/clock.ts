// What day it is AT NOTRE DAME (DGS request 2026-09-07).
//
// The page used to take the date straight from the device: `new Date()` in
// whatever zone the machine is set to. That is wrong twice over.
//   1. TIME ZONE. A student in Seoul at 09:00 on 2 January is still in the
//      previous semester at Notre Dame. `Intl` fixes this with no network at
//      all: the browser ships the IANA database, so we can ask for the wall
//      clock in South Bend directly.
//   2. A WRONG DEVICE CLOCK. Nothing on the device can detect one. A clock off
//      by months would shift every deadline in the report.
//
// For (2) the page asks a server — but its OWN server, not a third party. The
// HTTP `Date` header of any same-origin response is a server clock, and
// CLAUDE.md allows same-origin loads of the app's own assets while forbidding
// runtime calls to anyone else. So the page keeps its printed promise that
// nothing is sent to the University or to any third party: this request goes
// to the host the page was served from, carries no student data, and the only
// thing read from the answer is what time it is. When it fails — offline, a
// file:// copy, a host that strips the header — the device clock is used and
// the loading card says so, because a stated guess beats a silent one.
//
// Everything here is pure except `serverInstant`, whose fetch is injectable so
// the tests never touch the network.

/** St. Joseph County, Indiana — Eastern time, with US daylight saving. */
export const ND_TIME_ZONE = 'America/Indiana/Indianapolis';

export type ClockSource = 'server' | 'device';

export interface NotreDameNow {
  /** YYYY-MM-DD as the calendar reads at Notre Dame. */
  iso: string;
  /** Where the instant came from — the loading card tells the student. */
  source: ClockSource;
  /** "Monday, September 7, 2026 at 7:48 PM", for the loading card. */
  label: string;
  /** False when the runtime does not know the zone and the device's own
   * calendar had to be used (very old browsers). */
  zoneOk: boolean;
}

/** The calendar date at Notre Dame for a given instant, as YYYY-MM-DD.
 * `en-CA` formats as YYYY-MM-DD, which is exactly the shape the engine wants. */
export function notreDameDate(instant: Date, timeZone: string = ND_TIME_ZONE): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(instant);
}

/** The same instant spelled out for a human, in Notre Dame's zone. */
export function notreDameLabel(instant: Date, timeZone: string = ND_TIME_ZONE): string {
  return new Intl.DateTimeFormat('en-US', { timeZone, dateStyle: 'full', timeStyle: 'short' }).format(instant);
}

/** True when this runtime actually knows the zone. An engine that does not
 * support it silently falls back to UTC, which would be a wrong answer given
 * confidently, so it is worth detecting. */
export function zoneSupported(timeZone: string = ND_TIME_ZONE): boolean {
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date(0));
    return true;
  } catch {
    return false;
  }
}

/** The server's clock, from the `Date` header of a same-origin response.
 * `no-store` forces a real request rather than a cached answer; `Age` (seconds
 * the answer sat in a cache) is added back when a proxy served it anyway.
 * Resolves undefined on any failure — the caller falls back to the device. */
export async function serverInstant(
  url: string,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 2000,
): Promise<Date | undefined> {
  const controller = typeof AbortController === 'function' ? new AbortController() : undefined;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : undefined;
  try {
    const res = await fetchImpl(url, { method: 'HEAD', cache: 'no-store', signal: controller?.signal });
    const header = res.headers.get('date');
    if (header === null) return undefined;
    const sent = Date.parse(header);
    if (!Number.isFinite(sent)) return undefined;
    const age = Number(res.headers.get('age') ?? '0');
    return new Date(sent + (Number.isFinite(age) && age > 0 ? age * 1000 : 0));
  } catch {
    return undefined;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/** The date to run the whole self-check against: the server's instant when it
 * can be had, the device's otherwise, both read in Notre Dame's zone. */
export async function notreDameNow(opts: {
  url: string;
  fetchImpl?: typeof fetch;
  deviceNow?: Date;
  timeoutMs?: number;
}): Promise<NotreDameNow> {
  const device = opts.deviceNow ?? new Date();
  const fromServer = await serverInstant(opts.url, opts.fetchImpl ?? fetch, opts.timeoutMs);
  return describe(fromServer ?? device, fromServer ? 'server' : 'device');
}

/** The device-clock answer, available before any request — the loading card
 * shows something immediately and the failure paths always have a value. */
export function deviceNow(instant: Date = new Date()): NotreDameNow {
  return describe(instant, 'device');
}

function describe(instant: Date, source: ClockSource): NotreDameNow {
  const zoneOk = zoneSupported();
  const zone = zoneOk ? ND_TIME_ZONE : undefined;
  return {
    iso: zone ? notreDameDate(instant, zone) : localDate(instant),
    source,
    label: zone ? notreDameLabel(instant, zone) : instant.toString(),
    zoneOk,
  };
}

/** Last resort: the device's own calendar, local time (never UTC — an evening
 * at Notre Dame must not audit as tomorrow). */
function localDate(instant: Date): string {
  const p2 = (n: number) => String(n).padStart(2, '0');
  return `${instant.getFullYear()}-${p2(instant.getMonth() + 1)}-${p2(instant.getDate())}`;
}
