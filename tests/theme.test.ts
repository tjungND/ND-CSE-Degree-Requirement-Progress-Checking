// Night mode (DGS 2026-10-04): Auto follows the device, as Claude Desktop's
// Appearance setting does; Light and Dark are fixed; embedded, Auto is light.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { THEME_KEY, resolveTheme } from '../src/ui/theme.ts';

describe('night mode (src/ui/theme.ts)', () => {
  it('Auto follows the device; Light and Dark ignore it', () => {
    assert.equal(resolveTheme('auto', true, false), 'dark');
    assert.equal(resolveTheme('auto', false, false), 'light');
    assert.equal(resolveTheme('light', true, false), 'light');
    assert.equal(resolveTheme('dark', false, false), 'dark');
  });

  it('embedded in a light WordPress page, Auto stays light but Dark is honoured', () => {
    assert.equal(resolveTheme('auto', true, true), 'light');
    assert.equal(resolveTheme('dark', false, true), 'dark');
  });

  it('both pages set the theme in <head> with the same storage key, before the first paint', () => {
    for (const page of ['index.html', 'courses.html']) {
      const html = readFileSync(new URL(`../${page}`, import.meta.url), 'utf8');
      const head = html.slice(0, html.indexOf('</head>'));
      assert.ok(head.includes(`localStorage.getItem('${THEME_KEY}')`), `${page}: the inline script reads ${THEME_KEY}`);
      assert.match(head, /<meta name="color-scheme" content="light dark" \/>/, page);
    }
  });

  it('every colour in the stylesheet outside :root and print is a token', () => {
    const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
    // Strip the token definitions and the @media print blocks (paper stays light).
    let rest = css.replace(/:root\s*\{[^}]*\}/, '').replace(/:root\[data-theme="dark"\]\s*\{[^}]*\}/, '');
    rest = rest.replace(/@media print\s*\{(?:[^{}]|\{[^{}]*\})*\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    assert.deepEqual(rest.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [], []);
  });
});
