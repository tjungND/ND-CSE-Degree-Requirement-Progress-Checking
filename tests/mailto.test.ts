// "Open in my email app" (DGS 2026-09-13): the mailto: link behind the copy
// dialog carries To, Cc and Subject; the body only while short enough for
// every client (Outlook for Windows cuts a mailto: at about 2 000 characters).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MAILTO_BODY_LIMIT, mailtoHref } from '../src/ui/copy-dialog.ts';

describe('mailto: behind the copy dialog', () => {
  const dgs = { role: 'DGS', name: 'X', email: 'tjung@nd.edu' };
  it('To, Cc, Subject and a short body', () => {
    const href = mailtoHref({ ...dgs, cc: { role: 'Grad Admin', name: 'Y', email: 'csalmons@nd.edu' } }, 'Course review request', 'Dear DGS,\n\nline & more', true)!;
    assert.equal(href, 'mailto:tjung%40nd.edu?cc=csalmons%40nd.edu&subject=Course%20review%20request&body=Dear%20DGS%2C%0A%0Aline%20%26%20more');
  });
  it('a long message is replaced by a clipboard reminder, never truncated', () => {
    const long = 'x'.repeat(MAILTO_BODY_LIMIT + 1);
    const href = mailtoHref(dgs, 'S', long, true)!;
    assert.doesNotMatch(href, /xxxxxxxxxx/);
    assert.match(decodeURIComponent(href), /The message is on my clipboard — pasting it here\./);
    assert.match(decodeURIComponent(mailtoHref(dgs, 'S', long, false)!), /Pasting the message from the self-check page here\./);
  });
  it('no address on file (the advisor): the link still opens the email app, To left empty (DGS 2026-09-15)', () => {
    assert.equal(mailtoHref({ role: 'Your advisor', name: 'Prof. Example' }, 'S', 'body', true), 'mailto:?subject=S&body=body');
  });
});
