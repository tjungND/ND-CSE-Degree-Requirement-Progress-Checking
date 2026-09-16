// Embed mode (?embed=1) — the DOM-free half of src/ui/embed.ts, which is what
// CI can actually run (the browser half is pinned by the "course rules list"
// e2e driver). Added 2026-09-16 for the WordPress embed on sites.nd.edu.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { EMBED_PARENT_ORIGINS, MAX_EMBED_HEIGHT, clampEmbedHeight, fullPageHref, isEmbedRequested } from '../src/ui/embed.ts';

describe('isEmbedRequested', () => {
  it('accepts the documented spellings and nothing else', () => {
    assert.equal(isEmbedRequested('?embed=1', ''), true);
    assert.equal(isEmbedRequested('?view=mscse&embed=1', ''), true);
    assert.equal(isEmbedRequested('?embed=1&core=algorithms', '#CSE-60641'), true);
    assert.equal(isEmbedRequested('', '#embed'), true);
    // One spelling: a link that looks like it turns embedding on either does or
    // plainly does not, so a typo shows up as the full page rather than as a
    // half-trimmed one nobody can explain.
    assert.equal(isEmbedRequested('?embed=0', ''), false);
    assert.equal(isEmbedRequested('?embed=true', ''), false);
    assert.equal(isEmbedRequested('?embed', ''), false);
    assert.equal(isEmbedRequested('?embedded=1', ''), false);
    assert.equal(isEmbedRequested('', ''), false);
    assert.equal(isEmbedRequested('?view=mscse', '#all-courses'), false);
  });

  it('never throws on a malformed query string', () => {
    assert.equal(isEmbedRequested('?%', ''), false);
    assert.equal(isEmbedRequested('?a=%E0%A4%A', '#embed'), true); // the hash still decides
  });
});

describe('clampEmbedHeight', () => {
  it('rounds up, so a fractional layout never leaves a one-pixel scrollbar', () => {
    assert.equal(clampEmbedHeight(1200.2), 1201);
    assert.equal(clampEmbedHeight(1200), 1200);
  });

  it('caps the height, so a layout bug cannot ask for an absurd frame', () => {
    assert.equal(clampEmbedHeight(999_999), MAX_EMBED_HEIGHT);
    assert.equal(MAX_EMBED_HEIGHT, 100000); // measured: 42,290 px at a 700 px column, 117 courses (2026-09-16)
  });

  it('says nothing rather than something meaningless', () => {
    assert.equal(clampEmbedHeight(0), undefined);
    assert.equal(clampEmbedHeight(-5), undefined);
    assert.equal(clampEmbedHeight(Number.NaN), undefined);
    assert.equal(clampEmbedHeight(Number.POSITIVE_INFINITY), undefined);
  });
});

describe('fullPageHref', () => {
  it('drops only the embed flag, so the reader keeps what they were looking at', () => {
    assert.equal(fullPageHref('/courses.html', '?view=mscse&core=algorithms&embed=1', ''), '/courses.html?view=mscse&core=algorithms');
    assert.equal(fullPageHref('/courses.html', '?embed=1', ''), '/courses.html');
    assert.equal(fullPageHref('/courses.html', '', ''), '/courses.html');
  });

  it('keeps a real fragment and drops the one that turns embed mode on', () => {
    assert.equal(fullPageHref('/courses.html', '?embed=1', '#CSE-60641'), '/courses.html#CSE-60641');
    assert.equal(fullPageHref('/courses.html', '', '#embed'), '/courses.html');
  });

  it('keeps a parameter it does not recognise, re-encoded', () => {
    // URLSearchParams normalises rather than throwing, so an odd parameter
    // survives in canonical form. Harmless: every parameter on this page is
    // one of ours, and filtersFromUrl re-reads them the same way.
    assert.equal(fullPageHref('/courses.html', '?%&embed=1', '#all-courses'), '/courses.html?%25=#all-courses');
  });
});

describe('EMBED_PARENT_ORIGINS', () => {
  // postMessage's targetOrigin is the whole access control here: a page framed
  // by anyone else is told nothing at all. '*' would hand the message to
  // whatever framed us (spec 2026-09-16, "never '*'").
  it('is exactly the three Notre Dame hosts the DGS allowed on 2026-09-16', () => {
    assert.deepEqual([...EMBED_PARENT_ORIGINS], ['https://sites.nd.edu', 'https://cse.nd.edu', 'https://www.nd.edu']);
  });

  it('holds no wildcard and no scheme other than https', () => {
    for (const origin of EMBED_PARENT_ORIGINS) {
      assert.ok(origin.startsWith('https://'), `${origin} is not https`);
      assert.ok(!origin.includes('*'), `${origin} is a wildcard`);
      // An origin is scheme + host + port and nothing else; a trailing path
      // would silently never match and the height would simply stop arriving.
      assert.equal(new URL(origin).origin, origin);
    }
  });
});
