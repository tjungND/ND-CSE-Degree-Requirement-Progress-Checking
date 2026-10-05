// Night mode (DGS 2026-10-04: "Introduce the night mode to both app and course
// rule page. Just like Claude Desktop app … Also allow users to manually toggle
// between them.").
//
// Three choices, as in Claude Desktop's Appearance setting: Auto, Light, Dark.
// Auto is what Claude Desktop does — it follows the device's own light/dark
// setting (the CSS `prefers-color-scheme` the browser reports) and switches the
// moment the device does. On a Mac set to Appearance "Auto", or a phone on a
// sunset schedule, that is the switch at nightfall; the page never reads the
// clock itself.
//
// The choice is a per-device convenience kept in localStorage — never student
// data, never sent anywhere. The resolved theme is written to <html> as
// `data-theme="light|dark"`; the stylesheet's dark tokens hang off it.
//
// Embedded in a WordPress page (?embed=1), Auto stays light: the host page is
// light, and a dark frame inside it would look broken. A reader who picks Dark
// still gets it.
//
// index.html and courses.html carry a few lines of the same logic inline in
// <head>, so the first paint is already in the right theme; keep the two in
// step (THEME_KEY and the embed rule).
import { el } from './dom.ts';
import { isEmbedded } from './embed.ts';

export type ThemePref = 'auto' | 'light' | 'dark';
export const THEME_KEY = 'cse-degree-audit/v1/theme';

const DARK_QUERY = '(prefers-color-scheme: dark)';

/** The saved choice; Auto when none (or storage is blocked). */
export function readThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === 'light' || v === 'dark' ? v : 'auto';
  } catch {
    return 'auto';
  }
}

function saveThemePref(pref: ThemePref): void {
  try {
    if (pref === 'auto') localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, pref);
  } catch {
    // Storage blocked (Safari in a frame, a private window): the choice holds
    // for this visit only.
  }
}

/** Light or dark, for a choice and the device's current setting. Pure, so it
 * is tested directly. */
export function resolveTheme(pref: ThemePref, deviceDark: boolean, embedded: boolean): 'light' | 'dark' {
  if (pref !== 'auto') return pref;
  return deviceDark && !embedded ? 'dark' : 'light';
}

function deviceDark(): boolean {
  try {
    return window.matchMedia(DARK_QUERY).matches;
  } catch {
    return false;
  }
}

let current: ThemePref = 'auto';
const toggles = new Set<HTMLElement>();

function apply(): void {
  document.documentElement.dataset.theme = resolveTheme(current, deviceDark(), isEmbedded());
  for (const t of toggles) {
    if (!t.isConnected) {
      toggles.delete(t);
      continue;
    }
    syncToggle(t);
  }
}

/** Once per page, before the first render: apply the saved choice and follow
 * the device while the choice is Auto. */
export function startTheme(): void {
  current = readThemePref();
  apply();
  try {
    window.matchMedia(DARK_QUERY).addEventListener('change', () => {
      if (current === 'auto') apply();
    });
  } catch {
    // An old browser without matchMedia listeners: Auto is read at load only.
  }
}

const CHOICES: { pref: ThemePref; label: string; title: string }[] = [
  { pref: 'auto', label: 'Auto', title: 'Follow this device’s light or dark setting' },
  { pref: 'light', label: 'Light', title: 'Always light' },
  { pref: 'dark', label: 'Dark', title: 'Always dark (night mode)' },
];

function syncToggle(group: HTMLElement): void {
  for (const b of group.querySelectorAll<HTMLButtonElement>('button[data-theme-pref]')) {
    const on = b.dataset.themePref === current;
    b.setAttribute('aria-checked', String(on));
    b.tabIndex = on ? 0 : -1; // one tab stop; the arrow keys move within (ARIA radio group)
  }
}

function choose(pref: ThemePref): void {
  current = pref;
  saveThemePref(pref);
  apply();
}

/** The Auto · Light · Dark switch for the masthead — an ARIA radio group: one
 * tab stop (the chosen button), the arrow keys move and choose. Any number may
 * be on the page; each reflects the current choice. */
export function themeToggle(): HTMLElement {
  const group = el(
    'div',
    { class: 'theme-toggle', role: 'radiogroup', 'aria-label': 'Appearance' },
    ...CHOICES.map((c) =>
      el(
        'button',
        {
          type: 'button',
          role: 'radio',
          class: 'theme-choice',
          'data-theme-pref': c.pref,
          'data-key': `theme.${c.pref}`,
          title: c.title,
          onclick: () => choose(c.pref),
        },
        c.label,
      ),
    ),
  );
  group.addEventListener('keydown', (e) => {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (step === 0) return;
    e.preventDefault();
    const at = CHOICES.findIndex((c) => c.pref === current);
    const next = CHOICES[(at + step + CHOICES.length) % CHOICES.length]!;
    choose(next.pref);
    // The app page re-renders on its own schedule; the focus keeper restores
    // focus by data-key, and on the course page the button is still here.
    document.querySelector<HTMLButtonElement>(`[data-key="theme.${next.pref}"]`)?.focus();
  });
  toggles.add(group);
  syncToggle(group);
  return group;
}
