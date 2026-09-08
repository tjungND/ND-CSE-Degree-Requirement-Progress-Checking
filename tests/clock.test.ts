// Today's date AT NOTRE DAME (DGS request 2026-09-07): the zone conversion and
// the same-origin server clock behind it. No network — the fetch is injected.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ND_TIME_ZONE, deviceNow, notreDameDate, notreDameLabel, notreDameNow, serverInstant, zoneSupported } from '../src/data/clock.ts';

/** A fetch that answers with the headers a test asks for. */
const fakeFetch = (headers: Record<string, string>, opts: { throws?: boolean } = {}): typeof fetch =>
  (async () => {
    if (opts.throws) throw new Error('offline');
    return { headers: new Headers(headers) } as Response;
  }) as unknown as typeof fetch;

describe('the date at Notre Dame', () => {
  it('reads the calendar in South Bend, not on the device', () => {
    assert.equal(zoneSupported(ND_TIME_ZONE), true, 'this runtime must know the zone');
    // 03:30 UTC on 8 September is still 7 September in Indiana (EDT, UTC-4).
    assert.equal(notreDameDate(new Date('2026-09-08T03:30:00Z')), '2026-09-07');
    // 05:30 UTC on 15 January is still 14 January (EST, UTC-5).
    assert.equal(notreDameDate(new Date('2026-01-15T04:30:00Z')), '2026-01-14');
    // Just after midnight in Indiana is already the new day.
    assert.equal(notreDameDate(new Date('2026-09-08T04:30:00Z')), '2026-09-08');
    // Indiana keeps US daylight saving: the same wall clock, two offsets.
    assert.equal(notreDameDate(new Date('2026-07-15T16:00:00Z')), '2026-07-15');
    assert.equal(notreDameDate(new Date('2026-12-15T16:00:00Z')), '2026-12-15');
  });

  it('a student abroad still gets Notre Dame’s semester', () => {
    // 09:00 on 2 January in Seoul is 19:00 on 1 January in Indiana — the term
    // the engine derives (termOfDate) must follow Notre Dame, not the student.
    const instant = new Date('2026-01-02T00:00:00Z'); // 09:00 KST, 19:00 EST on 1 Jan
    assert.equal(notreDameDate(instant), '2026-01-01');
    assert.equal(notreDameDate(instant, 'Asia/Seoul'), '2026-01-02', 'the device would have said otherwise');
  });

  it('spells the instant out for the loading card', () => {
    assert.match(notreDameLabel(new Date('2026-09-08T03:30:00Z')), /September 7, 2026/);
  });
});

describe('the same-origin server clock', () => {
  it('reads the Date header', async () => {
    const at = await serverInstant('https://example.test/', fakeFetch({ date: 'Mon, 07 Sep 2026 23:48:25 GMT' }));
    assert.equal(at?.toISOString(), '2026-09-07T23:48:25.000Z');
  });

  it('adds Age back when a cache answered', async () => {
    const at = await serverInstant('https://example.test/', fakeFetch({ date: 'Mon, 07 Sep 2026 23:48:25 GMT', age: '600' }));
    assert.equal(at?.toISOString(), '2026-09-07T23:58:25.000Z');
  });

  it('gives up quietly on a missing, unreadable or failed answer', async () => {
    assert.equal(await serverInstant('https://example.test/', fakeFetch({})), undefined);
    assert.equal(await serverInstant('https://example.test/', fakeFetch({ date: 'not a date' })), undefined);
    assert.equal(await serverInstant('https://example.test/', fakeFetch({}, { throws: true })), undefined);
  });
});

describe('which clock the page ends up using', () => {
  const device = new Date('2020-01-01T12:00:00Z'); // a badly wrong device clock

  it('prefers the server, and says so', async () => {
    const now = await notreDameNow({
      url: 'https://example.test/',
      fetchImpl: fakeFetch({ date: 'Mon, 07 Sep 2026 23:48:25 GMT' }),
      deviceNow: device,
    });
    assert.equal(now.source, 'server');
    assert.equal(now.iso, '2026-09-07', 'the wrong device clock is not used');
    assert.equal(now.zoneOk, true);
  });

  it('falls back to the device and says that instead', async () => {
    const now = await notreDameNow({ url: 'https://example.test/', fetchImpl: fakeFetch({}), deviceNow: device });
    assert.equal(now.source, 'device');
    assert.equal(now.iso, '2020-01-01', 'still read in Notre Dame’s zone (07:00 EST)');
  });

  it('deviceNow answers immediately, before any request', () => {
    const now = deviceNow(new Date('2026-09-08T03:30:00Z'));
    assert.deepEqual({ iso: now.iso, source: now.source }, { iso: '2026-09-07', source: 'device' });
  });
});
