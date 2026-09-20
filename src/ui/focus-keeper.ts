// Every change rebuilds the page from the student record (simple, and the
// engine stays pure) — so the control the student was using is destroyed
// and re-created. Keyboard and screen-reader users were dropped to the top
// of the page after every dropdown or checkbox (usability review
// 2026-09-05, item 23): the rebuild now remembers which control had focus,
// by its stable `data-key` (or, failing that, its position in the tree),
// and its text selection and the scroll position, and restores them.
// (Moved out of app.ts on 2026-09-20.)

/** What `remember()` takes before a render and `restore()` puts back after it. */
export interface FocusMemo {
  key?: string;
  path?: number[];
  selection?: [number, number];
  x: number;
  y: number;
  open: string[];
  expanded: string[];
}

export interface FocusKeeper {
  remember: () => FocusMemo;
  restore: (memo: FocusMemo) => void;
  /** Where to put focus after the NEXT render, when the focused control will
   * not exist any more (a removed course row, the closed preview). */
  setFocusAfterRender: (key: string) => void;
}

export function createFocusKeeper(root: HTMLElement): FocusKeeper {
  let focusAfterRender: string | undefined;

  function rememberFocus(): FocusMemo {
    const active = document.activeElement as HTMLElement | null;
    // What the student had opened, so a keystroke elsewhere does not close it
    // (2026-09-08): render() rebuilds the whole root, and used to restore focus
    // to a § button whose quote had silently collapsed underneath it.
    const memo: FocusMemo = {
      x: window.scrollX,
      y: window.scrollY,
      open: [...root.querySelectorAll<HTMLDetailsElement>('details[data-key]')].filter((d) => d.open).map((d) => d.dataset['key'] ?? ''),
      expanded: [...root.querySelectorAll<HTMLElement>('[aria-expanded="true"][data-key]')].map((b) => b.dataset['key'] ?? ''),
    };
    if (!active || active === document.body || !root.contains(active)) return memo;
    memo.key = active.dataset['key'];
    if (!memo.key) {
      const path: number[] = [];
      for (let n: Element | null = active; n && n !== root; n = n.parentElement) {
        path.unshift(Array.prototype.indexOf.call(n.parentElement?.children ?? [], n));
      }
      memo.path = path;
    }
    const input = active as HTMLInputElement;
    if ((active.tagName === 'INPUT' || active.tagName === 'TEXTAREA') && typeof input.selectionStart === 'number' && input.selectionEnd !== null) {
      memo.selection = [input.selectionStart, input.selectionEnd];
    }
    return memo;
  }

  function restoreFocus(memo: FocusMemo): void {
    // Re-open first, so focus lands inside something that is actually visible.
    for (const k of memo.open) {
      const d = root.querySelector<HTMLDetailsElement>(`details[data-key="${CSS.escape(k)}"]`);
      if (d) d.open = true;
    }
    for (const k of memo.expanded) {
      const b = root.querySelector<HTMLElement>(`[data-key="${CSS.escape(k)}"][aria-expanded]`);
      if (!b) continue;
      b.setAttribute('aria-expanded', 'true');
      const controls = b.getAttribute('aria-controls');
      if (controls) document.getElementById(controls)?.classList.remove('hidden');
    }
    const key = focusAfterRender ?? memo.key;
    focusAfterRender = undefined;
    let target: HTMLElement | null = null;
    if (key) target = root.querySelector<HTMLElement>(`[data-key="${CSS.escape(key)}"]`);
    if (!target && memo.path) {
      let n: Element | null = root;
      for (const i of memo.path) n = n?.children[i] ?? null;
      target = n as HTMLElement | null;
    }
    if (target && typeof target.focus === 'function') {
      target.focus({ preventScroll: true });
      const input = target as HTMLInputElement;
      if (memo.selection && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') && /^(text|search|number|email|url|tel|password)$/.test(input.type || 'text')) {
        try {
          if (input.type !== 'number') input.setSelectionRange(memo.selection[0], memo.selection[1]);
        } catch {
          /* selection is not supported on this input type — focus alone is enough */
        }
      }
    }
    window.scrollTo(memo.x, memo.y);
  }

  return {
    remember: rememberFocus,
    restore: restoreFocus,
    setFocusAfterRender: (key) => {
      focusAfterRender = key;
    },
  };
}
