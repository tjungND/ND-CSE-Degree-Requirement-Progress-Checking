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
  await checkCopyDialog(s);
  await checkMobilePieces(s, 'app');
  await checkPhone(s, 'app', `document.querySelectorAll('table.courses tr').length > 3`, 390);
  await checkPhone(s, 'app', `document.querySelectorAll('table.courses tr').length > 3`, 820);
  await s.open(new URL('courses.html', baseUrl).href, 'table.course-rules');
  await checkAxe(s, 'course-rules page');
  await checkMobilePieces(s, 'courses');
  await checkPhone(s, 'courses', `document.querySelectorAll('table.course-rules tbody tr').length > 10`, 390);
  await checkPhone(s, 'courses', `document.querySelectorAll('table.course-rules tbody tr').length > 10`, 820);
  await s.send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 1900, deviceScaleFactor: 1, mobile: false });
}

// 3b. The phone/tablet layout pieces (2026-09-05, review items 2, 13, 30):
// hidden on wide screens, present on narrow ones — the summary-first block
// and sticky score bar on the self-check page, stacked course rows; on the
// course-rules page the table becomes cards with a Sort control.
async function checkMobilePieces(s, page) {
  const visible = (sel) => s.evalJs(`(() => { const e = document.querySelector('${sel}'); return !!e && getComputedStyle(e).display !== 'none' && e.getClientRects().length > 0; })()`);
  const at = async (width, mobile) => {
    await s.send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile, screenWidth: width, screenHeight: 900 });
    await s.evalJs('new Promise(r => requestAnimationFrame(() => setTimeout(r, 150)))');
  };
  if (page === 'app') {
    await at(1400, false);
    if ((await visible('.summary-mobile')) || (await visible('.sticky-score'))) throw new Error('summary block / sticky bar must be hidden on wide screens');
    await at(390, true);
    if (!(await visible('.summary-mobile')) || !(await visible('.sticky-score')) || !(await visible('.audit .back-link'))) throw new Error('summary block, sticky bar and back link must show on phones');
    const stacked = await s.evalJs(`getComputedStyle(document.querySelector('table.courses.stack tr:nth-child(2)')).display`);
    if (stacked !== 'flex') throw new Error('course rows must stack on phones (got display: ' + stacked + ')');
    console.log('  phone pieces on the self-check page: summary first, sticky score bar, back link, stacked course rows');
  } else {
    await at(1400, false);
    if (await visible('[data-key="filter.sort"]')) throw new Error('the Sort control must be hidden on wide screens (headers sort there)');
    await at(390, true);
    if (!(await visible('[data-key="filter.sort"]'))) throw new Error('the Sort control must show on phones');
    const card = await s.evalJs(`getComputedStyle(document.querySelector('table.course-rules tbody tr')).display`);
    if (card !== 'block') throw new Error('course rows must render as cards on phones (got display: ' + card + ')');
    await s.evalJs(`(() => { const sel = document.querySelector('[data-key="filter.sort"]'); sel.value = 'title'; sel.dispatchEvent(new Event('change')); })()`);
    const first = await s.evalJs(`document.querySelector('table.course-rules tbody tr th.course-id')?.textContent`);
    const firstTitle = await s.evalJs(`document.querySelector('table.course-rules tbody tr td.cell-title')?.textContent`);
    await s.evalJs(`(() => { const sel = document.querySelector('[data-key="filter.sort"]'); sel.value = 'course'; sel.dispatchEvent(new Event('change')); })()`);
    console.log(`  phone pieces on the course-rules page: cards, Sort control (by title → first card ${first} "${firstTitle}")`);
  }
  await at(1400, false);
}

// 2b. The check-before-you-send dialog behind the copy buttons (2026-09-06
// evening): axe-clean, names the advisor, Escape closes it, focus returns.
async function checkCopyDialog(s) {
  await s.evalJs(`document.querySelector('[data-key="save.copy"]').click()`);
  await s.waitFor(`document.querySelector('dialog.copy-check[open]')`);
  const to = await s.evalJs(`document.querySelector('dialog.copy-check .copy-to')?.textContent ?? ''`);
  if (!to.includes('Your advisor, Prof. Example')) throw new Error('copy dialog: the advisor by name — ' + to);
  await s.evalJs(AXE_SOURCE + '; true');
  const result = JSON.parse(
    await s.evalJs(`axe.run(document.querySelector('dialog.copy-check'), { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] } }).then(r => JSON.stringify(r.violations.map(v => ({ id: v.id, impact: v.impact, count: v.nodes.length, first: v.nodes[0]?.target.join(' ') }))))`),
  );
  if (result.length > 0) throw new Error(`axe-core found ${result.length} violation type(s) in the copy dialog: ` + result.map((v) => `${v.id} [${v.impact}] ×${v.count} (first: ${v.first})`).join('; '));
  await key(s, 'Escape', 'Escape', 27);
  await s.waitFor(`!document.querySelector('dialog.copy-check')`);
  const focused = await s.evalJs(`document.activeElement?.dataset?.key ?? ''`);
  if (focused !== 'save.copy') throw new Error('copy dialog: focus must return to the copy button after Escape — ' + focused);
  console.log('  copy dialog: axe-clean, names the advisor, Escape closes it, focus returns to the button');
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
  // "Prior graduate study" is a radio group (2026-09-05, item 12): ArrowDown
  // moves the selection to the next radio, which fires change → re-render.
  await s.evalJs(`document.querySelector('[data-key="standing.prior.none"]').focus()`);
  await key(s, 'ArrowDown', 'ArrowDown', 40);
  await pause(200);
  const a = JSON.parse(await s.evalJs(`JSON.stringify({ checked: document.querySelector('[data-key="standing.prior.unfinished"]').checked, focused: document.activeElement?.dataset?.key })`));
  if (!a.checked) throw new Error('focus check: ArrowDown did not move the radio selection');
  if (a.focused !== 'standing.prior.unfinished') throw new Error('focus check: focus left the radio after the change — now on ' + a.focused);
  await key(s, 'Tab', 'Tab', 9);
  const next = await s.evalJs(`document.activeElement?.dataset?.key ?? document.activeElement?.tagName`);
  if (next?.startsWith('standing.prior') || next === 'BODY') throw new Error('focus check: Tab after the change did not move on — ' + next);
  // A checkbox: focus then click (the page re-renders), focus must stay put.
  await s.evalJs(`const cb = document.querySelector('[data-key^="attest."]'); cb.focus(); cb.click();`);
  await pause(150);
  const cbKey = await s.evalJs(`document.activeElement?.dataset?.key ?? ''`);
  if (!cbKey.startsWith('attest.')) throw new Error('focus check: focus left the checkbox after the change — now on ' + cbKey);
  // Put the example back the way it was.
  await s.evalJs(`document.querySelector('[data-key="standing.prior.none"]').click()`);
  await pause(100);
  console.log('  focus is preserved across re-renders (radio group, checkbox); Tab continues from the same control');
}

// 3. No sideways scrolling at a phone (390) or tablet-portrait (820) width.
async function checkPhone(s, page, readyExpr, width = 390) {
  const height = width < 600 ? 844 : 1180;
  await s.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: true, screenWidth: width, screenHeight: height });
  await s.waitFor(readyExpr);
  await s.evalJs('new Promise(r => requestAnimationFrame(() => setTimeout(r, 250)))');
  const m = JSON.parse(
    await s.evalJs(`JSON.stringify({ scrollW: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth, wide: [...document.querySelectorAll('body *')].filter(e => e.getBoundingClientRect().right > ${width + 1} && getComputedStyle(e).position !== 'fixed').slice(0, 5).map(e => e.tagName + '.' + String(e.className).slice(0, 30)) })`),
  );
  await s.shot(`${width < 600 ? 'phone' : 'tablet'}-${page}`);
  if (m.scrollW > m.clientW) throw new Error(`${page} at ${width} px scrolls sideways (${m.scrollW} > ${m.clientW}); widest: ${m.wide.join(', ')}`);
  if (width < 600 && page === 'app') {
    // Usability pass 2026-09-08: one field per line in the add-a-course form,
    // a real touch target on every control that changes the record, and the
    // status pill in ONE column down the report instead of five.
    const phone = JSON.parse(await s.evalJs(`JSON.stringify((() => {
      const round = (n) => Math.round(n);
      const small = [...document.querySelectorAll('[data-key^="import."], [data-key^="ext.import."], .radios .radio, .attest')]
        .map((e) => ({ k: e.dataset.key ?? e.className, h: round(e.getBoundingClientRect().height) }))
        .filter((x) => x.h > 0 && x.h < 40);
      const row1 = document.querySelector('.course-form .row1');
      return {
        row1Tracks: row1 ? getComputedStyle(row1).gridTemplateColumns.split(' ').length : 0,
        cardPad: getComputedStyle(document.querySelector('.card')).paddingLeft,
        small,
        pillRights: [...new Set([...document.querySelectorAll('.req-head .pill')].map((p) => round(p.getBoundingClientRect().right)))],
      };
    })())`));
    console.log('  phone ergonomics:', JSON.stringify({ ...phone, pillRights: phone.pillRights.length }));
    if (phone.row1Tracks !== 1) throw new Error(`the add-a-course form must be one field per line on a phone (${phone.row1Tracks} tracks)`);
    if (phone.cardPad !== '12px') throw new Error('the phone card padding rule is dead again: ' + phone.cardPad);
    if (phone.small.length > 0) throw new Error('touch targets under 40 px: ' + JSON.stringify(phone.small));
    if (phone.pillRights.length > 1) throw new Error('the status pill must park in one column: ' + JSON.stringify(phone.pillRights));
  }
  console.log(`  ${width < 600 ? 'phone' : 'tablet'} width (${width} px), ${page} page: no horizontal scrolling`);
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
