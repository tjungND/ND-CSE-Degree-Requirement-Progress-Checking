// The check-before-you-send dialog behind every copy button (DGS request
// 2026-09-06 evening): the review request for the DGS, the summary for the
// advisor, the processing request for the Grad Admin. A toast vanished in
// four seconds; this stays until OK, showing WHO the message is for (name and
// address from the contact card), its subject, and the message itself — so a
// student can read it before pasting, and can still copy it by hand when the
// browser refused the clipboard. An emphasised lead line right above the
// message says that THIS is what is on the clipboard (DGS request 2026-09-06,
// late evening) — or that the clipboard was blocked. A native <dialog> like the opening notice
// (focus trapped, Escape closes); NOT class `consent-overlay`, which the e2e
// harness dismisses on sight. Appended to document.body, so a re-render of
// the page cannot destroy it.
import { mailto } from './contacts.ts';
import { el } from './dom.ts';

export interface CopyRecipient {
  role: string;
  name?: string;
  email?: string;
  cc?: { role: string; name: string; email: string };
}

export interface CopyDialogOptions {
  /** "Review request", "Summary for your advisor", "Processing request". */
  what: string;
  recipient: CopyRecipient;
  subject: string;
  text: string;
  html: string;
  /** The steps after "paste it into a new email", in order — e.g. attaching
   * the original transcripts (emphasised), attaching the saved self-check
   * file (DGS request 2026-09-06 evening: numbered, step by step). The
   * dialog adds the paste step first and "Send it" last. */
  steps?: { text: string; emphasis?: boolean }[];
  /** data-key of the button that opened the dialog: focus returns there. */
  returnFocusKey: string;
}

/** Write a message to the clipboard in BOTH flavours (2026-09-03):
 * text/plain keeps tab-separated rows; text/html carries real tables — HTML
 * email flattens tabs to spaces, but a table survives Gmail and pastes into
 * Sheets as cells. Falls back to plain text where ClipboardItem is
 * unsupported; rejects when the browser refuses the clipboard altogether. */
export async function writeClipboard(built: { text: string; html: string }): Promise<void> {
  try {
    await navigator.clipboard.write([
      new ClipboardItem({
        'text/plain': new Blob([built.text], { type: 'text/plain' }),
        'text/html': new Blob([built.html], { type: 'text/html' }),
      }),
    ]);
  } catch {
    await navigator.clipboard.writeText(built.text);
  }
}

/** Copy, then show the dialog — with the "copy it yourself" variant when the
 * clipboard was refused (the message is then focused and selected, so Cmd+C
 * works at once). */
export async function copyDialog(opts: CopyDialogOptions): Promise<void> {
  let copied = true;
  try {
    await writeClipboard(opts);
  } catch {
    copied = false;
  }
  showCopyDialog(opts, copied);
}

function showCopyDialog(opts: CopyDialogOptions, copied: boolean): void {
  const r = opts.recipient;
  const ok = el('button', { class: 'btn primary', 'data-key': 'copy.ok' }, 'OK');
  const preview = el('textarea', { class: 'copy-preview', readonly: 'readonly', 'aria-label': 'The copied message', spellcheck: 'false' });
  (preview as HTMLTextAreaElement).value = opts.text;
  const title = copied ? `${opts.what} copied — check it before you send` : `${opts.what} — copy it yourself (the clipboard was blocked)`;
  const to = el(
    'p',
    { class: 'copy-to' },
    el('strong', {}, 'To: '),
    `${r.role}${r.name ? `, ${r.name}` : ''}`,
    ...(r.email ? [' (', mailto(r.email), ')'] : []),
  );
  const cc = r.cc ? el('p', { class: 'copy-to' }, el('strong', {}, 'Cc: '), `${r.cc.role}, ${r.cc.name} (`, mailto(r.cc.email), ')') : null;
  const subject = el('p', { class: 'copy-subject' }, el('strong', {}, 'Subject: '), opts.subject);
  // The lead line above the message (DGS request 2026-09-06, late evening):
  // say plainly that the text below is what was copied.
  const lead = copied
    ? el('p', { class: 'copy-lead copied' }, el('strong', {}, '✓ The following message has been copied to your clipboard.'), ' Read it through — it is exactly what you will paste into the email.')
    : el('p', { class: 'copy-lead blocked' }, el('strong', {}, 'The following message was NOT copied — your browser blocked the clipboard.'), ' Select it and copy it yourself: on a phone, touch and hold the message, then Select All and Copy.');
  // Numbered steps (DGS request 2026-09-06 evening): what to do now, in order.
  const recipientText = `${r.role}${r.name ? ` (${r.name})` : ''}${r.cc ? `, with the ${r.cc.role} in cc` : ''}`;
  const first = copied
    ? `Paste the copied message into a new email to ${recipientText}. It is on your clipboard as text and as formatted HTML — the tables keep their shape in Gmail and Outlook.`
    : `Your browser did not allow the page to write to the clipboard: select the whole message above and copy it — on a phone, touch and hold it, then Select All and Copy — then paste it into a new email to ${recipientText}.`;
  const steps = el(
    'ol',
    { class: 'copy-steps' },
    el('li', {}, first),
    ...(opts.steps ?? []).map((step) => el('li', {}, step.emphasis ? el('strong', {}, step.text) : step.text)),
    el('li', {}, 'Send it. Nothing is sent by this page — the email is yours.'),
  );
  const note = el('p', { class: 'hint copy-note' }, 'Check the message, the name and the address before you send.');
  const dialog = el(
    'dialog',
    { class: 'consent copy-check', 'aria-labelledby': 'copy-check-title' },
    el('div', { class: 'consent-box copy-box' }, el('h2', { id: 'copy-check-title' }, title), to, cc, subject, lead, preview, steps, note, el('div', { class: 'save-buttons' }, ok)),
  );
  const close = (): void => {
    if (dialog.open) dialog.close();
    dialog.remove();
    const opener = document.querySelector<HTMLElement>(`[data-key="${CSS.escape(opts.returnFocusKey)}"]`);
    (opener ?? document.querySelector<HTMLElement>('.masthead h1'))?.focus();
  };
  ok.addEventListener('click', close);
  dialog.addEventListener('close', close); // Escape
  document.body.append(dialog);
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
  if (copied) ok.focus();
  else {
    preview.focus();
    (preview as HTMLTextAreaElement).select();
  }
}

/** A yes/no check before something the student probably did not mean — today
 * only the 0-credit course (DGS 2026-09-11: "show a warning message and
 * double-check with the students when they attempt to add 0-credit courses").
 * The same native <dialog> as the copy check: focus trapped, Escape cancels,
 * focus returns to the control that opened it. Resolves true only on the
 * confirm button, so a dismissed dialog never adds anything. */
export function confirmDialog(opts: {
  title: string;
  body: string[];
  confirmLabel: string;
  cancelLabel?: string;
  returnFocusKey: string;
}): Promise<boolean> {
  return new Promise((resolve) => {
    let answer = false;
    const confirm = el('button', { class: 'btn primary', 'data-key': 'confirm.yes' }, opts.confirmLabel);
    const cancel = el('button', { class: 'btn', 'data-key': 'confirm.no' }, opts.cancelLabel ?? 'Cancel');
    const dialog = el(
      'dialog',
      { class: 'consent confirm-check', 'aria-labelledby': 'confirm-title' },
      el(
        'div',
        { class: 'consent-box' },
        el('h2', { id: 'confirm-title' }, opts.title),
        ...opts.body.map((t) => el('p', {}, t)),
        el('div', { class: 'save-buttons' }, confirm, cancel),
      ),
    );
    const close = (): void => {
      if (dialog.open) dialog.close();
      dialog.remove();
      const opener = document.querySelector<HTMLElement>(`[data-key="${CSS.escape(opts.returnFocusKey)}"]`);
      (opener ?? document.querySelector<HTMLElement>('.masthead h1'))?.focus();
      resolve(answer);
    };
    confirm.addEventListener('click', () => {
      answer = true;
      close();
    });
    cancel.addEventListener('click', close);
    dialog.addEventListener('close', close); // Escape cancels
    document.body.append(dialog);
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    cancel.focus(); // the safe default has focus
  });
}
