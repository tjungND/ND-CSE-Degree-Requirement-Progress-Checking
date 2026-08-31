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
