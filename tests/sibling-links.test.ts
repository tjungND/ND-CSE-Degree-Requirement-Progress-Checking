// The two pages' links to each other (DGS 2026-09-16): relative when
// standalone, the WordPress host page in the top window when the embed's
// iframe src names it; anything but an http(s) URL is ignored.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { siblingLink } from '../src/ui/sibling-links.ts';

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
});
