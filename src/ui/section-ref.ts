// The CSE handbook's own words behind a section chip (DGS 2026-10-05: "when
// the cursor hovers over the section of CSE handbook in these screenshots,
// show its relevant texts" — the "CSE §4.2" beside a card heading on the
// self-check page, and "CSE §4.4", "§4.4.1", "§4.4.2" on the course rules
// page).
//
// The chip is a button. Hovering shows the text in a panel under it (moving
// into the panel keeps it open, so a long section can be scrolled); clicking,
// tapping or pressing Enter keeps it open until Escape or a click elsewhere,
// and from the keyboard moves focus into it. The text is generated from the
// handbook PDF by `npm run handbook-text` (src/ui/handbook-text.ts), never
// typed by hand, so it is the edition in policy-sources/.
import { el } from './dom.ts';
import { HANDBOOK_SECTIONS, HANDBOOK_SOURCE, type HandbookSection } from './handbook-text.ts';

/** "§2.3, §4.4–4.7" → the sections it names, in the handbook's order: a single
 * number takes the section with its subsections (§4.4 is §4.4–§4.4.3), a range
 * every section from its first number through the last. Numbers the handbook
 * does not have are skipped. */
export function sectionsFor(ref: string): HandbookSection[] {
  const ids = HANDBOOK_SECTIONS.map((s) => s.id);
  const within = (id: string, head: string) => id === head || id.startsWith(`${head}.`);
  const picked = new Set<number>();
  for (const part of ref.split(',')) {
    const m = /(\d+(?:\.\d+)*)(?:\s*[–-]\s*(\d+(?:\.\d+)*))?/.exec(part);
    if (!m) continue;
    const start = ids.indexOf(m[1]!);
    if (start < 0) continue;
    const last = m[2] ?? m[1]!;
    let end = start;
    ids.forEach((id, i) => {
      if (i >= start && within(id, last)) end = i;
    });
    for (let i = start; i <= end; i++) picked.add(i);
  }
  return [...picked].sort((a, b) => a - b).map((i) => HANDBOOK_SECTIONS[i]!);
}

let counter = 0;

/** A section chip that shows the handbook's text for `ref` ("§4.2"). Falls back
 * to the plain chip when the handbook has no such section. `className` keeps
 * the chip's look on its page; `dataKey` lets the focus keeper find it again
 * after a re-render. */
export function sectionRef(ref: string, opts: { className: string; dataKey: string }): HTMLElement {
  const sections = sectionsFor(ref);
  if (sections.length === 0) return el('span', { class: opts.className }, ref);
  const id = `sec-pop-${++counter}`;
  const chip = el(
    'button',
    {
      type: 'button',
      class: `${opts.className} sec-ref`,
      'data-key': opts.dataKey,
      'aria-expanded': 'false',
      'aria-controls': id,
      title: 'Show the handbook’s text',
    },
    ref,
  ) as HTMLButtonElement;

  let pop: HTMLElement | undefined;
  let pinned = false;
  let hoverTimer: number | undefined;
  let hideTimer: number | undefined;
  let listeners: AbortController | undefined;

  const build = (): HTMLElement => {
    const panel = el(
      'div',
      { class: 'sec-pop', id, role: 'region', 'aria-label': `CSE Graduate Studies Handbook ${ref}`, tabindex: '-1', hidden: true },
      ...sections.flatMap((s) => [el('p', { class: 'sec-pop-title' }, `§${s.id} ${s.title}`), ...s.paragraphs.map((p) => el('p', {}, p))]),
      el('p', { class: 'sec-pop-source' }, `From the CSE Graduate Studies Handbook${HANDBOOK_SOURCE.edition ? ` (${HANDBOOK_SOURCE.edition})` : ''}.`),
    );
    panel.addEventListener('mouseenter', () => window.clearTimeout(hideTimer));
    panel.addEventListener('mouseleave', scheduleHide);
    return panel;
  };

  // Under the chip, or above it when there is more room there; inside the
  // window at any width (the 16 px side margin of the page).
  const place = (): void => {
    if (!pop || pop.hidden) return;
    const r = chip.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    const width = Math.min(560, vw - 32);
    pop.style.width = `${width}px`;
    pop.style.left = `${Math.max(16, Math.min(r.left, vw - width - 16))}px`;
    const below = vh - r.bottom - 14;
    const above = r.top - 14;
    const wanted = Math.min(pop.scrollHeight, 480);
    if (below >= wanted || below >= above) {
      pop.style.top = `${r.bottom + 6}px`;
      pop.style.bottom = '';
      pop.style.maxHeight = `${Math.max(160, Math.min(480, below))}px`;
    } else {
      pop.style.top = '';
      pop.style.bottom = `${vh - r.top + 6}px`;
      pop.style.maxHeight = `${Math.max(160, Math.min(480, above))}px`;
    }
  };

  const open = (): void => {
    window.clearTimeout(hideTimer);
    pop ??= build();
    // After the heading in the document, so a screen reader meets the text
    // where the chip is; drawn over the page, so nothing below moves.
    if (!pop.isConnected) (chip.closest('h1, h2, h3, h4, h5, h6') ?? chip).after(pop);
    if (!pop.hidden) return;
    pop.hidden = false;
    chip.setAttribute('aria-expanded', 'true');
    place();
    listeners?.abort();
    listeners = new AbortController();
    const signal = listeners.signal;
    document.addEventListener(
      'keydown',
      (e) => {
        if (e.key !== 'Escape') return;
        close();
        chip.focus();
      },
      { signal },
    );
    document.addEventListener(
      'pointerdown',
      (e) => {
        const t = e.target as Node;
        if (!chip.contains(t) && !pop?.contains(t)) close();
      },
      { signal },
    );
    window.addEventListener('scroll', place, { signal, passive: true, capture: true });
    window.addEventListener('resize', place, { signal });
  };

  const close = (): void => {
    window.clearTimeout(hideTimer);
    window.clearTimeout(hoverTimer);
    pinned = false;
    if (pop) pop.hidden = true;
    chip.setAttribute('aria-expanded', 'false');
    listeners?.abort();
    listeners = undefined;
  };

  function scheduleHide(): void {
    window.clearTimeout(hoverTimer);
    if (pinned) return;
    window.clearTimeout(hideTimer);
    hideTimer = window.setTimeout(close, 250);
  }

  // Hover: a short pause first, so passing over the heading does not flash it.
  chip.addEventListener('mouseenter', () => {
    window.clearTimeout(hideTimer);
    hoverTimer = window.setTimeout(open, 120);
  });
  chip.addEventListener('mouseleave', scheduleHide);
  // Click, tap or Enter: keep it open; again: close. From the keyboard (a
  // click with no pointer), the text takes the focus, to be read or scrolled.
  chip.addEventListener('click', (e) => {
    window.clearTimeout(hoverTimer);
    if (pop && !pop.hidden && pinned) {
      close();
      return;
    }
    open();
    pinned = true;
    if ((e as MouseEvent).detail === 0) pop?.focus();
  });
  return chip;
}
