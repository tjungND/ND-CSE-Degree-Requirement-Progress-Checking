// E2E: accessibility and phone-layout guard rails (usability review
// 2026-09-05, Phase 0 — item 22). Each check pins a defect that was measured
// and fixed that day, so it cannot come back quietly:
//   1. the opening notice is a real modal — focus starts inside it, Tab never
//      reaches the page behind it, Escape or Agree closes it and focus lands
//      on the page heading;
//   2. changing a control (the page re-renders) keeps keyboard focus on the
//      same control, and pressing Tab continues from there;
//   3. at a phone width nothing scrolls sideways (WCAG 1.4.10 reflow);
//   4. axe-core finds no WCAG 2.x A/AA violation on either page (colour
//      contrast, labels, names, landmarks…).
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const AXE_SOURCE = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

const key = (s, k, code, vk) =>
  s.send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, windowsVirtualKeyCode: vk }).then(() =>
    s.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk }),
  );
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

export async function driveA11y(s, baseUrl) {
  await checkDialog(s, baseUrl);
  await s.open(baseUrl); // agrees, so the page beneath is usable
  // Start from an empty record: "Load example" asks for confirmation when
  // courses exist, and a native confirm() would block the page.
  await s.evalJs(`localStorage.clear()`);
  await s.open(baseUrl);
  await s.evalJs(`[...document.querySelectorAll('button')].find(b => b.textContent === 'Load example').click()`);
  await s.waitFor(`document.querySelectorAll('table.courses tr').length > 3`);
  await checkFocusPreserved(s);
  await checkAxe(s, 'self-check page (example student)');
  await checkPhone(s, 'app', `document.querySelectorAll('table.courses tr').length > 3`);
  await s.open(new URL('courses.html', baseUrl).href, 'table.course-rules');
  await checkAxe(s, 'course-rules page');
  await checkPhone(s, 'courses', `document.querySelectorAll('table.course-rules tbody tr').length > 10`);
  await s.send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 1900, deviceScaleFactor: 1, mobile: false });
}

// 1. The opening notice as a modal dialog.
async function checkDialog(s, baseUrl) {
  await s.send('Page.navigate', { url: baseUrl });
  await s.waitFor(`document.querySelector('.masthead h1') || document.querySelector('.load-card.failed')`);
  if (await s.evalJs(`!!document.querySelector('.load-card.failed')`)) {
    await s.evalJs(`document.querySelector('.load-card.failed button.use-saved').click()`);
    await s.waitFor(`document.querySelector('.masthead h1')`);
  }
  await s.waitFor(`document.querySelector('dialog.consent[open]')`);
  await pause(150);
  const inside = () => s.evalJs(`!!document.activeElement?.closest('dialog.consent')`);
  if (!(await inside())) throw new Error('opening dialog: focus did not move into the dialog');
  for (let i = 0; i < 4; i++) {
    await key(s, 'Tab', 'Tab', 9);
    const where = await s.evalJs(`document.activeElement === document.body ? 'body' : (document.activeElement?.closest('dialog.consent') ? 'dialog' : 'PAGE:' + document.activeElement?.textContent?.slice(0, 40))`);
    if (where.startsWith('PAGE:')) throw new Error('opening dialog: Tab reached the page behind it — ' + where);
  }
  const labelled = await s.evalJs(`document.getElementById(document.querySelector('dialog.consent')?.getAttribute('aria-labelledby') ?? '')?.textContent ?? ''`);
  if (labelled !== 'Before you continue') throw new Error('opening dialog: not labelled by its visible title (' + labelled + ')');
  await key(s, 'Escape', 'Escape', 27);
  await s.waitFor(`!document.querySelector('dialog.consent')`);
  const focusAfter = await s.evalJs(`document.activeElement?.tagName + ':' + (document.activeElement?.textContent ?? '').slice(0, 30)`);
  if (!focusAfter.startsWith('H1:')) throw new Error('opening dialog: focus did not land on the page heading after closing — ' + focusAfter);
  console.log('  opening notice: focus inside, Tab contained, Escape closes, focus returns to the heading');
}

// 2. Focus survives the re-render that every change triggers.
async function checkFocusPreserved(s) {
  await s.evalJs(`document.querySelector('[data-key="standing.prior"]').focus()`);
  const before = await s.evalJs(`document.querySelector('[data-key="standing.prior"]').value`);
  await key(s, 'ArrowDown', 'ArrowDown', 40); // a real keystroke: the select changes and the page re-renders
  await pause(200);
  const after = await s.evalJs(`JSON.stringify({ value: document.querySelector('[data-key="standing.prior"]').value, focused: document.activeElement?.dataset?.key })`);
  const a = JSON.parse(after);
  if (a.value === before) throw new Error('focus check: ArrowDown did not change the dropdown (' + before + ')');
  if (a.focused !== 'standing.prior') throw new Error('focus check: focus left the dropdown after the change — now on ' + a.focused);
  await key(s, 'Tab', 'Tab', 9);
  const next = await s.evalJs(`document.activeElement?.dataset?.key ?? document.activeElement?.tagName`);
  if (next === 'standing.prior' || next === 'BODY') throw new Error('focus check: Tab after the change did not move on — ' + next);
  // A checkbox: focus then click (the page re-renders), focus must stay put.
  await s.evalJs(`const cb = document.querySelector('[data-key^="attest."]'); cb.focus(); cb.click();`);
  await pause(150);
  const cbKey = await s.evalJs(`document.activeElement?.dataset?.key ?? ''`);
  if (!cbKey.startsWith('attest.')) throw new Error('focus check: focus left the checkbox after the change — now on ' + cbKey);
  // Put the example back the way it was (the dropdown moved one option down).
  await s.evalJs(`const sel = document.querySelector('[data-key="standing.prior"]'); sel.value = 'none'; sel.dispatchEvent(new Event('change'));`);
  await pause(100);
  console.log('  focus is preserved across re-renders (dropdown, checkbox); Tab continues from the same control');
}

// 3. No sideways scrolling at a phone width.
async function checkPhone(s, page, readyExpr) {
  await s.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true, screenWidth: 390, screenHeight: 844 });
  await s.waitFor(readyExpr);
  await s.evalJs('new Promise(r => requestAnimationFrame(() => setTimeout(r, 250)))');
  const m = JSON.parse(
    await s.evalJs(`JSON.stringify({ scrollW: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth, wide: [...document.querySelectorAll('body *')].filter(e => e.getBoundingClientRect().right > 391 && getComputedStyle(e).position !== 'fixed').slice(0, 5).map(e => e.tagName + '.' + String(e.className).slice(0, 30)) })`),
  );
  await s.shot(`phone-${page}`);
  if (m.scrollW > m.clientW) throw new Error(`${page} at 390 px scrolls sideways (${m.scrollW} > ${m.clientW}); widest: ${m.wide.join(', ')}`);
  console.log(`  phone width (390 px), ${page} page: no horizontal scrolling`);
  await s.send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 1900, deviceScaleFactor: 1, mobile: false });
  await s.evalJs('new Promise(r => requestAnimationFrame(() => setTimeout(r, 150)))');
}

// 4. axe-core: WCAG 2.x A/AA rules plus the landmark best practices.
async function checkAxe(s, label) {
  await s.evalJs(AXE_SOURCE + '; true');
  const result = JSON.parse(
    await s.evalJs(`axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] } }).then(r => JSON.stringify(r.violations.map(v => ({ id: v.id, impact: v.impact, count: v.nodes.length, first: v.nodes[0]?.target.join(' ') }))))`),
  );
  if (result.length > 0) {
    throw new Error(
      `axe-core found ${result.length} violation type(s) on the ${label}: ` +
        result.map((v) => `${v.id} [${v.impact}] ×${v.count} (first: ${v.first})`).join('; '),
    );
  }
  console.log(`  axe-core: no WCAG 2.x A/AA or landmark violations on the ${label}`);
}
