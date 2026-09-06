// Tiny DOM helpers. Everything user-entered is rendered through textContent —
// never innerHTML — so a course id like "<img onerror=…>" is inert text.
export type Child = Node | string | null | undefined;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | boolean | ((ev: Event) => void)> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (typeof value === 'function') {
      node.addEventListener(key.replace(/^on/, ''), value);
    } else if (typeof value === 'boolean') {
      if (value) node.setAttribute(key, '');
    } else if (key === 'value' && 'value' in node) {
      (node as HTMLInputElement).value = value;
    } else {
      node.setAttribute(key, value);
    }
  }
  for (const child of children) {
    if (child === null || child === undefined) continue;
    node.append(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
}

export function clear(node: HTMLElement): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}

export function option(value: string, label: string, selected = false): HTMLOptionElement {
  const o = el('option', { value }, label);
  o.selected = selected;
  return o;
}

/** Why the transcript-row buttons are inactive while a preview is open (DGS
 * request 2026-09-06) — shown on hover, on click, and to screen readers. */
export const PREVIEW_OPEN_NOTE =
  'Not available while a transcript preview is open: finish selecting and adding those courses (“Add …”), or cancel the preview, and this button becomes active again.';

/** A button that is inactive for a stated reason. Not the `disabled`
 * attribute: a disabled button gets no hover, no focus and no click, so its
 * reason could never be shown. `aria-disabled` keeps it in the tab order and
 * reachable by the mouse; the reason is the tooltip, and a click repeats it
 * through `explain` (a toast) instead of acting. */
export function inactiveButton(
  attrs: Record<string, string | boolean | ((ev: Event) => void)>,
  reason: string,
  explain: (reason: string) => void,
  ...children: Child[]
): HTMLButtonElement {
  const { onclick: _ignored, class: cls, ...rest } = attrs;
  return el(
    'button',
    {
      ...rest,
      class: `${typeof cls === 'string' ? cls : ''} inactive`.trim(),
      'aria-disabled': 'true',
      title: reason,
      onclick: (ev) => {
        ev.preventDefault();
        explain(reason);
      },
    },
    ...children,
  );
}
