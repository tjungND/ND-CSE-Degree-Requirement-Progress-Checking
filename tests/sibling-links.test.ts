// The two pages' links to each other (DGS 2026-09-16): relative when
// standalone, the WordPress host page in the top window when the embed's
// iframe src names it; anything but an http(s) URL is ignored.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { allowedHostPage, siblingAnchorAttrs, siblingLink } from '../src/ui/sibling-links.ts';

describe('links between the two pages', () => {
  it('standalone: the sibling file next to this one', () => {
    assert.deepEqual(siblingLink('course-rules', ''), { href: './courses.html' });
    assert.deepEqual(siblingLink('self-check', '?q=algorithms'), { href: './index.html' });
  });
  it('embedded: the host page named in the query string, in the top window', () => {
    assert.deepEqual(siblingLink('course-rules', '?course_rules_url=https%3A%2F%2Fcse.nd.edu%2Fgraduate%2Fcourse-rules%2F'), { href: 'https://cse.nd.edu/graduate/course-rules/', target: '_top' });
    assert.deepEqual(siblingLink('self-check', '?self_check_url=https://cse.nd.edu/graduate/self-check/&program=phd'), { href: 'https://cse.nd.edu/graduate/self-check/', target: '_top' });
  });
  it('only http(s) is honoured', () => {
    assert.deepEqual(siblingLink('course-rules', '?course_rules_url=javascript:alert(1)'), { href: './courses.html' });
    assert.deepEqual(siblingLink('self-check', '?self_check_url=data:text/html,hi'), { href: './index.html' });
  });
  // The parameter names the WordPress page that frames this one, and those are
  // always on an ND host. Anything else made an official-looking page into a
  // one-click hop to an attacker's site, under this page's own link text
  // (review R-2, 2026-09-18).
  it('only Notre Dame hosts are honoured', () => {
    assert.equal(allowedHostPage('https://cse.nd.edu/graduate/self-check/'), true);
    assert.equal(allowedHostPage('https://sites.nd.edu/cse/x'), true);
    assert.equal(allowedHostPage('https://nd.edu/'), true);
    assert.equal(allowedHostPage('https://evil.example/'), false);
    assert.equal(allowedHostPage('http://cse.nd.edu/x'), false, 'http is not honoured — the real host pages are https');
    assert.equal(allowedHostPage('https://nd.edu.evil.example/'), false, 'a suffix that only looks like nd.edu');
    assert.equal(allowedHostPage('https://nd.edu@evil.example/'), false, 'credentials hide the real host from a reader');
    assert.equal(allowedHostPage('https://notnd.edu/'), false);
    assert.equal(allowedHostPage(''), false);
    assert.deepEqual(siblingLink('self-check', '?self_check_url=https://evil.example/'), { href: './index.html' });
  });

  it('anchor attributes combine both embed rules', () => {
    assert.deepEqual(siblingAnchorAttrs('course-rules', '', {}), { href: './courses.html' });
    assert.deepEqual(siblingAnchorAttrs('course-rules', '?embed=1', { target: '_top', rel: 'noopener' }), { href: './courses.html', target: '_top', rel: 'noopener' });
    assert.deepEqual(siblingAnchorAttrs('course-rules', '?embed=1&course_rules_url=https://cse.nd.edu/rules/', { target: '_top', rel: 'noopener' }), { href: 'https://cse.nd.edu/rules/', target: '_top', rel: 'noopener' });
  });
});
