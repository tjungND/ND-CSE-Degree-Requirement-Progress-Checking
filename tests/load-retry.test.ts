// The rules loader asks Google again after a stalled request (2026-09-06):
// one attempt of 15 s used to be the whole budget, and Google's publish-to-web
// endpoint stalls roughly one request in fifteen. `fetch` is stubbed here; the
// pause between attempts is a no-op so the tests run in milliseconds.
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { fetchCsv, RulesLoadError, worthRetrying, type LoadProgress } from '../src/data/load.ts';

const CSV = 'course_id,title\r\nCSE 60641,Graduate Operating Systems\r\n';
const realFetch = globalThis.fetch;
const timeoutError = () => new DOMException('The operation timed out', 'TimeoutError');
const noPause = async () => {};

/** A fetch stub answering from a script: 'timeout' throws like an aborted
 * request; a number answers with that HTTP status; a string is the body. */
function stubFetch(script: (number | string | 'timeout' | 'network')[]): () => number {
  let calls = 0;
  globalThis.fetch = (async () => {
    const step = script[Math.min(calls, script.length - 1)]!;
    calls += 1;
    if (step === 'timeout') throw timeoutError();
    if (step === 'network') throw new TypeError('Failed to fetch');
    if (typeof step === 'number') return new Response('', { status: step });
    return new Response(step, { status: 200 });
  }) as typeof fetch;
  return () => calls;
}

describe('rules loader: retries', () => {
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('asks again after a stalled request and reports the retry', async () => {
    const calls = stubFetch(['timeout', CSV]);
    const events: LoadProgress[] = [];
    const text = await fetchCsv('courses', 'https://example.test/courses', (p) => events.push(p), [6000, 10000, 14000], noPause);
    assert.equal(text, CSV);
    assert.equal(calls(), 2);
    assert.deepEqual(
      events.map((e) => (e.step === 'retry' ? `retry ${e.attempt}/${e.of}` : e.step === 'tab' ? `tab ${e.tab} ${e.rows} rows` : e.step)),
      ['retry 2/3', 'tab courses 1 rows'],
    );
  });

  it('gives up after the last attempt with a message that counts the attempts', async () => {
    const calls = stubFetch(['timeout']);
    await assert.rejects(
      fetchCsv('parameters', 'https://example.test/p', () => {}, [6000, 10000, 14000], noPause),
      (e: unknown) => e instanceof RulesLoadError && e.kind === 'timeout' && e.retryable && /3 requests, 30 seconds in all/.test(e.message),
    );
    assert.equal(calls(), 3);
  });

  it('retries a dropped connection and a 5xx, never a 4xx or an unpublished sheet', async () => {
    let calls = stubFetch(['network', 503, CSV]);
    assert.equal(await fetchCsv('categories', 'https://example.test/c', () => {}, [6000, 10000, 14000], noPause), CSV);
    assert.equal(calls(), 3);

    calls = stubFetch([404, CSV]);
    await assert.rejects(fetchCsv('courses', 'https://example.test/x', () => {}, [6000, 10000, 14000], noPause), (e: unknown) => e instanceof RulesLoadError && e.kind === 'http' && e.status === 404);
    assert.equal(calls(), 1, 'a 404 is not asked again');

    calls = stubFetch(['<!DOCTYPE html><html>Sign in</html>', CSV]);
    await assert.rejects(fetchCsv('courses', 'https://example.test/y', () => {}, [6000, 10000, 14000], noPause), (e: unknown) => e instanceof RulesLoadError && e.kind === 'unpublished' && !e.retryable);
    assert.equal(calls(), 1, 'an unpublished sheet is not asked again');
  });

  it('worthRetrying: only stalls, dropped connections and server errors', () => {
    assert.equal(worthRetrying(new RulesLoadError('timeout', 'courses', 'x', true)), true);
    assert.equal(worthRetrying(new RulesLoadError('unreachable', 'courses', 'x', true)), true);
    assert.equal(worthRetrying(new RulesLoadError('http', 'courses', 'x', true, 502)), true);
    assert.equal(worthRetrying(new RulesLoadError('http', 'courses', 'x', true, 404)), false);
    assert.equal(worthRetrying(new RulesLoadError('unpublished', 'courses', 'x', false)), false);
    assert.equal(worthRetrying(new Error('x')), false);
  });
});
