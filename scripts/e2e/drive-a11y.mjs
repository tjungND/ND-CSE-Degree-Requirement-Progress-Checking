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

export async function driveA11y(s, baseUrl) {
  await checkDialog(s, baseUrl);
  await s.open(baseUrl); // agrees, so the page beneath is usable
  // Start from an empty record: "Load example" asks for confirmation when
  // courses exist, and a native confirm() would block the page.
  await s.evalJs(`localStorage.clear()`);
  await s.open(baseUrl);
  await checkFirstScreen(s, baseUrl);
  await s.evalJs(`[...document.querySelectorAll('button')].find(b => b.textContent === 'Load example').click()`);
  await s.waitFor(`document.querySelectorAll('table.courses tr').length > 3`);
  await checkFocusPreserved(s);
  await checkAxe(s, 'self-check page (example student)');
  await checkNightMode(s, 'app', 'self-check page (example student)');
  await checkCopyDialog(s);
  await checkMobilePieces(s, 'app');
  await checkPhone(s, 'app', `document.querySelectorAll('table.courses tr').length > 3`, 390);
  await checkPhone(s, 'app', `document.querySelectorAll('table.courses tr').length > 3`, 820);
  await s.open(new URL('courses.html', baseUrl).href, '.all-courses table.course-rules');
  await checkAxe(s, 'course-rules page');
  await checkNightMode(s, 'courses', 'course-rules page');
  await checkMobilePieces(s, 'courses');
  await checkPhone(s, 'courses', `document.querySelectorAll('.all-courses table.course-rules tbody tr').length > 10`, 390);
  await checkPhone(s, 'courses', `document.querySelectorAll('.all-courses table.course-rules tbody tr').length > 10`, 820);
  await checkWide(s, 'courses', `document.querySelectorAll('.all-courses table.course-rules tbody tr').length > 10`);
  // Embed mode (?embed=1, DGS 2026-09-16) at the three widths a WordPress
  // content column actually takes: a phone, a laptop, and the widest the
  // sites.nd.edu theme gives us (measured 1082 px on a 1568 px viewport).
  // 700 px is the one that matters — it sits in the 601-860 px band where the
  // overview cards used to overflow.
  const coursesReady = `document.querySelectorAll('.all-courses table.course-rules tbody tr').length > 10`;
  await s.open(new URL('courses.html?embed=1', baseUrl).href, '.all-courses table.course-rules');
  await checkAxe(s, 'course-rules page, embed mode');
  for (const width of [360, 700, 1100]) await checkPhone(s, `courses-embed-${width}`, coursesReady, width);
  await s.open(new URL('?embed=1', baseUrl).href, '.masthead h1');
  await checkAxe(s, 'self-check page, embed mode');
  await s.open(baseUrl, '.masthead h1');
  await checkWide(s, 'app', `document.querySelector('.layout')`);
  await s.setViewport({ width: 1400, height: 1900 });
}

// 3b. The phone/tablet layout pieces (2026-09-05, review items 2, 13, 30):
// hidden on wide screens, present on narrow ones — the summary-first block
// and sticky score bar on the self-check page, stacked course rows; on the
// course-rules page the table becomes cards with a Sort control.
async function checkMobilePieces(s, page) {
  const visible = (sel) => s.evalJs(`(() => { const e = document.querySelector('${sel}'); return !!e && getComputedStyle(e).display !== 'none' && e.getClientRects().length > 0; })()`);
  const at = (width, mobile) => s.setViewport({ width, height: 900, mobile });
  if (page === 'app') {
    await at(1400, false);
    if ((await visible('.summary-mobile')) || (await visible('.sticky-score'))) throw new Error('summary block / sticky bar must be hidden on wide screens');
    await at(390, true);
    if (!(await visible('.summary-mobile')) || !(await visible('.audit .back-link'))) throw new Error('summary block and back link must show on phones');
    // The sticky bar duplicates the score headline, so it is display:none
    // (`.score-on-screen`, one IntersectionObserver in app.ts) while either
    // score headline is in the viewport and back as soon as the score scrolls
    // off (trim review 2026-09-18, P-66): assert both states, not just "shown".
    const settle = () => s.settle();
    await s.evalJs(`document.querySelector('.summary-mobile .headline').scrollIntoView({ block: 'center' })`);
    await settle();
    if (await visible('.sticky-score')) throw new Error('the sticky score bar must hide while the summary headline is on screen (P-66)');
    await s.evalJs(`document.getElementById('inputs').scrollIntoView()`);
    await settle();
    if (!(await visible('.sticky-score'))) throw new Error('the sticky score bar must show once the score headline has scrolled off (P-66)');
    await s.evalJs('window.scrollTo(0, 0)');
    await settle();
    const stacked = await s.evalJs(`getComputedStyle(document.querySelector('table.courses.stack tr:nth-child(2)')).display`);
    if (stacked !== 'flex') throw new Error('course rows must stack on phones (got display: ' + stacked + ')');
    console.log('  phone pieces on the self-check page: summary first, sticky score bar, back link, stacked course rows');
  } else {
    await at(1400, false);
    if (await visible('[data-key="filter.sort"]')) throw new Error('the Sort control must be hidden on wide screens (headers sort there)');
    await at(390, true);
    // On a phone the sort control lives behind "More filters" (mobile review
    // 2026-09-19): closed by default, open when a filter in it is set.
    // `visible()` is not enough here: WebKit lays out a closed <details>'
    // content (content-visibility: hidden — boxes with sizes, nothing drawn),
    // so the sort control has client rects while unseen. checkVisibility()
    // answers the real question in both engines.
    const shown = (sel) => s.evalJs(`document.querySelector('${sel}')?.checkVisibility() === true`);
    if (await shown('[data-key="filter.sort"]')) throw new Error('the "More filters" fold must start closed on a phone with nothing set');
    if (!(await visible('.filters details.more-filters > summary'))) throw new Error('the "More filters" summary must show on phones');
    await s.evalJs(`document.querySelector('.filters details.more-filters').open = true`);
    if (!(await shown('[data-key="filter.sort"]'))) throw new Error('the Sort control must show on phones once More filters is open');
    const card = await s.evalJs(`getComputedStyle(document.querySelector('.all-courses table.course-rules tbody tr')).display`);
    if (card !== 'block') throw new Error('course rows must render as cards on phones (got display: ' + card + ')');
    await s.evalJs(`(() => { const sel = document.querySelector('[data-key="filter.sort"]'); sel.value = 'title'; sel.dispatchEvent(new Event('change')); })()`);
    const first = await s.evalJs(`document.querySelector('.all-courses table.course-rules tbody tr th.course-id')?.textContent`);
    const firstTitle = await s.evalJs(`document.querySelector('.all-courses table.course-rules tbody tr td.cell-title')?.textContent`);
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
  // The advisor has no address on file: the email-app link opens with To empty (DGS 2026-09-15).
  const advMail = await s.evalJs(`document.querySelector('dialog.copy-check [data-key="copy.email"]')?.getAttribute('href') ?? ''`);
  if (!/^mailto:\?subject=/.test(advMail)) throw new Error('the advisor dialog must open the email app with To left empty: ' + advMail.slice(0, 60));
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
  // A fresh record: the earlier steps' saved answers would make the dialog
  // ready at once (every family must be answered since 2026-09-23).
  await s.send('Page.navigate', { url: baseUrl });
  await s.waitFor(`document.querySelector('.masthead h1') || document.querySelector('.load-card.failed')`);
  await s.evalJs(`localStorage.clear()`);
  await s.send('Page.navigate', { url: baseUrl });
  await s.waitFor(`document.querySelector('.masthead h1') || document.querySelector('.load-card.failed')`);
  if (await s.evalJs(`!!document.querySelector('.load-card.failed')`)) {
    await s.evalJs(`document.querySelector('.load-card.failed button.use-saved').click()`);
    await s.waitFor(`document.querySelector('.masthead h1')`);
  }
  await s.waitFor(`document.querySelector('dialog.consent[open]')`);
  await s.settle();
  const inside = () => s.evalJs(`!!document.activeElement?.closest('dialog.consent')`);
  if (!(await inside())) throw new Error('opening dialog: focus did not move into the dialog');
  for (let i = 0; i < 4; i++) {
    await key(s, 'Tab', 'Tab', 9);
    const where = await s.evalJs(`document.activeElement === document.body ? 'body' : (document.activeElement?.closest('dialog.consent') ? 'dialog' : 'PAGE:' + document.activeElement?.textContent?.slice(0, 40))`);
    if (where.startsWith('PAGE:')) throw new Error('opening dialog: Tab reached the page behind it — ' + where);
  }
  const labelled = await s.evalJs(`document.getElementById(document.querySelector('dialog.consent')?.getAttribute('aria-labelledby') ?? '')?.textContent ?? ''`);
  if (labelled !== 'Before you continue') throw new Error('opening dialog: not labelled by its visible title (' + labelled + ')');
  // Escape never closes it (DGS 2026-09-23) — twice in a row, because Chrome
  // lets a second Escape through a refused `cancel` — and the button waits
  // for every family.
  const stillOpen = () => s.evalJs(`!!document.querySelector('dialog.consent[open]')`);
  await key(s, 'Escape', 'Escape', 27);
  await key(s, 'Escape', 'Escape', 27);
  await s.settle();
  if (!(await stillOpen())) throw new Error('opening dialog: Escape must not close it');
  if (!(await s.evalJs(`document.querySelector('dialog.consent .btn.primary')?.hasAttribute('disabled')`))) throw new Error('opening dialog: the button must wait for the answers');
  // Only the program is asked here since 2026-10-08 (DGS, Option 1): no
  // earlier-degrees question in the dialog — they are on the page.
  if (await s.evalJs(`!!document.querySelector('dialog.consent [data-key^="consent.bachelors."], dialog.consent [data-key^="consent.graduate."]')`)) throw new Error('opening dialog: the earlier-degrees questions belong on the page now');
  await s.evalJs(`document.querySelector('[data-key="consent.program.phd"]').click()`);
  await s.settle();
  await s.shot('consent-answered');
  // Enter does nothing while the button waits (2026-10-04): the notice is not ticked yet.
  await s.evalJs(`document.querySelector('[data-key="consent.program.phd"]').focus()`);
  await key(s, 'Enter', 'Enter', 13);
  await s.settle();
  if (!(await stillOpen())) throw new Error('opening dialog: Enter must not continue while the button is inactive');
  // The program chosen, the notice not yet acknowledged (2026-09-29): the
  // button waits for the tick INSIDE the notice, and the hint says so.
  if (!(await s.evalJs(`document.querySelector('dialog.consent .btn.primary')?.hasAttribute('disabled')`))) throw new Error('opening dialog: the button must wait for the acknowledgement tick');
  const hintText = await s.evalJs(`document.querySelector('.consent-hint')?.textContent ?? ''`);
  if (hintText !== 'To continue, acknowledge the notice at the top by checking its box.') throw new Error('opening dialog: the hint must say the notice at the top needs acknowledging: ' + hintText);
  if (!(await s.evalJs(`!!document.querySelector('.consent-warning [data-key="consent.ack"]')`))) throw new Error('opening dialog: the acknowledgement must sit inside the notice');
  await s.evalJs(`document.querySelector('[data-key="consent.ack"]').click()`);
  await s.settle();
  if (await s.evalJs(`document.querySelector('dialog.consent .btn.primary')?.hasAttribute('disabled')`)) throw new Error('opening dialog: the button must be live once the program is chosen and the notice ticked');
  if (!(await s.evalJs(`document.querySelector('.consent-hint')?.hidden === true`))) throw new Error('opening dialog: the hint must go once the button is live');
  if ((await s.evalJs(`document.querySelector('dialog.consent .btn.primary')?.textContent`)) !== 'Continue') throw new Error('opening dialog: the button reads "Continue" since 2026-09-29');
  // One question, the program, and no number on it (Option 1, 2026-10-08).
  const steps = JSON.parse(await s.evalJs(`JSON.stringify([...document.querySelectorAll('dialog.consent legend.step-title')].filter((l) => l.closest('fieldset') && !l.closest('fieldset').hidden).map((l) => getComputedStyle(l, '::before').content))`));
  if (steps.length !== 1 || !steps.every((c) => c === 'none' || c === 'normal')) throw new Error('opening dialog: one question, unnumbered, expected — ' + JSON.stringify(steps));
  await key(s, 'Escape', 'Escape', 27);
  await key(s, 'Escape', 'Escape', 27);
  await s.settle();
  if (!(await stillOpen())) throw new Error('opening dialog: Escape must not close it even once everything is answered');
  // Enter on the tick box just ticked continues, as the button would (DGS
  // 2026-10-04: "let an Enter key pressed by the user click the Continue button").
  await s.evalJs(`document.querySelector('[data-key="consent.ack"]').focus()`);
  await key(s, 'Enter', 'Enter', 13);
  await s.waitFor(`!document.querySelector('dialog.consent')`);
  const focusAfter = await s.evalJs(`document.activeElement?.tagName + ':' + (document.activeElement?.textContent ?? '').slice(0, 30)`);
  if (!focusAfter.startsWith('H1:')) throw new Error('opening dialog: focus did not land on the page heading after closing — ' + focusAfter);
  // The earlier-degrees questions on the page (2026-10-08, Option 1): in the
  // Transcripts card, each follow-up just below the answer that asks it.
  if (!(await s.evalJs(`!!document.querySelector('#earlier-degrees [data-key="earlier.bachelors.elsewhere"]')`))) throw new Error('the earlier-degrees questions must be in the Transcripts card');
  await s.evalJs(`document.querySelector('[data-key="earlier.graduate.elsewhere"]').click()`);
  await s.settle();
  const under = await s.evalJs(`(() => { const row = document.querySelector('[data-key="earlier.graduate.elsewhere"]').closest('label'); const next = row?.nextElementSibling; return !!next && next.matches('fieldset') && !next.hidden && !!next.querySelector('[data-key="earlier.sameplace.no"]'); })()`);
  if (!under) throw new Error('"same university?" must sit just below "Yes, at another university"');
  // Each answer is clicked with focus on it, as a keyboard user would: the
  // answer that completes the questions leaves them (and the focus) in place,
  // saved, until Done; Done gives way to the one-line summary and puts focus
  // on its Change (review of Option 1, 2026-10-08).
  // …and every answer keeps its focus, a follow-up included ("same
  // university?" rebuilds its own box — UI review, 2026-10-08).
  for (const k of ['earlier.bachelors.elsewhere', 'earlier.sameplace.no', 'earlier.finished.yes']) {
    await s.evalJs(`(() => { const i = document.querySelector('[data-key="${k}"]'); i.focus(); i.click(); })()`);
    await s.settle();
    const at = await s.evalJs(`document.activeElement?.dataset?.key ?? document.activeElement?.tagName`);
    if (at !== k) throw new Error(`answering ${k} must keep its focus, not move it to ${at}`);
  }
  if (!(await s.evalJs(`!!document.querySelector('#earlier-degrees') && !!document.querySelector('[data-key="earlier.done"]')`))) throw new Error('complete: the questions stay, with Done');
  if ((await s.evalJs(`document.activeElement?.dataset?.key ?? ''`)) !== 'earlier.finished.yes') throw new Error('the completing answer must keep its focus');
  await s.evalJs(`document.querySelector('#earlier-degrees').scrollIntoView({ block: 'start' })`);
  await s.shot('earlier-degrees-done');
  await s.evalJs(`(() => { const d = document.querySelector('[data-key="earlier.done"]'); d.focus(); d.click(); })()`);
  await s.settle();
  if (!(await s.evalJs(`!!document.querySelector('[data-key="transcripts.background"].background-line') && !document.querySelector('#earlier-degrees')`))) throw new Error('Done: the questions must give way to the one-line summary');
  if ((await s.evalJs(`document.activeElement?.dataset?.key ?? ''`)) !== 'transcripts.background.change') throw new Error('Done must put focus on the summary’s Change');
  // …and bring it into view (UI review, 2026-10-08: it landed off screen).
  if (!(await s.evalJs(`(() => { const r = document.activeElement.getBoundingClientRect(); return r.bottom > 0 && r.top < window.innerHeight; })()`))) throw new Error('after Done the focused Change must be on screen');
  console.log('  opening notice: focus inside, Tab contained, Escape never closes it, Enter does nothing until the button is live and then continues like it, focus returns to the heading; the earlier-degrees questions are on the page, keep focus through the completing answer, and give way to a summary on Done');
}

// 1b. The first screen belongs to the work, not the preamble (blue-team B1,
// 2026-09-18). At 708×937 the "1. Transcripts — START HERE" heading sat at
// y=944 and the first Import button at y=1104, and the first nineteen
// interactive elements included no data-entry control at all.
async function checkFirstScreen(s, baseUrl) {
  await s.setViewport({ width: 708, height: 937 });
  // A FIRST visit is what B1 measured: no record, so nothing to summarise.
  await s.open(baseUrl, '.transcript-upload');
  const first = JSON.parse(await s.evalJs(`JSON.stringify((() => {
    const start = [...document.querySelectorAll('h2')].find((h) => /START HERE/.test(h.textContent ?? ''));
    const importBtn = document.querySelector('[data-key="import.nd"]');
    const focusable = [...document.querySelectorAll('a[href], button, input, select, textarea')]
      .filter((n) => n.offsetParent !== null && !n.closest('.skip-link') && n.tabIndex >= 0); // a radio group's unchosen buttons are not tab stops
    const firstEntry = focusable.findIndex((n) => /^(import\.|course\.new\.|standing\.|courses\.|program\.)/.test(n.dataset?.key ?? ''));
    return {
      startHereTop: Math.round(start?.getBoundingClientRect().top ?? -1),
      importTop: Math.round(importBtn?.getBoundingClientRect().top ?? -1),
      firstEntryIndex: firstEntry,
      contactAtEnd: !!document.querySelector('footer .contact-card'),
      contactInMasthead: !!document.querySelector('.masthead .contact-card'),
      noticeLines: document.querySelectorAll('.notice-strip .notice-line').length,
    };
  })())`));
  console.log('  first screen at 708×937:', JSON.stringify(first));
  if (first.importTop < 0 || first.importTop > 937) throw new Error('the first import control must be on the first screen: ' + first.importTop);
  // Seven focusables preceded the first import control once the program tabs
  // left the masthead (DGS 2026-09-22): three masthead links, Load example,
  // Reset, and the two notice strips' Details. The tools row has since gained
  // Send summary (DGS 2026-09-22) and Save / Load / Print (DGS 2026-09-24),
  // at the DGS's request; the skip link still jumps straight to the inputs.
  // The Auto · Light · Dark switch (night mode, DGS 2026-10-04) is one more —
  // one tab stop, an ARIA radio group, so 12.
  if (first.firstEntryIndex < 0 || first.firstEntryIndex > 12) {
    throw new Error('a data-entry control must come early in the tab order, not 20th: ' + first.firstEntryIndex);
  }
  if (first.contactInMasthead || !first.contactAtEnd) throw new Error('the who-to-contact card belongs at the end: ' + JSON.stringify(first));
  // Two strips since 2026-09-19 (DGS: red for alpha, green for privacy), one line each.
  if (first.noticeLines !== 2) throw new Error('the notices collapse to one line each above the fold: ' + first.noticeLines);
  await s.shot('first-screen-708');
  await s.setViewport({ width: 1400, height: 1900 });
}

// 2. Focus survives the re-render that every change triggers.
async function checkFocusPreserved(s) {
  // The standing card's radio groups left with the earlier-degrees questions
  // (DGS 2026-09-22); the §3.4 option radios exist only for the MSCSE, so the
  // radio half of this check uses the report's attestation checkboxes below
  // and the milestones' date fields: focus then type, re-render, focus stays.
  await s.evalJs(`(() => { const d = document.querySelector('[data-key="milestone.advisorName"]'); d.focus(); d.value = 'Prof. Focus'; d.dispatchEvent(new Event('change')); })()`);
  await s.settle();
  const nameKey = await s.evalJs(`document.activeElement?.dataset?.key ?? ''`);
  if (nameKey !== 'milestone.advisorName') throw new Error('focus check: focus left the text field after the change — now on ' + nameKey);
  await key(s, 'Tab', 'Tab', 9);
  const next = await s.evalJs(`document.activeElement?.dataset?.key ?? document.activeElement?.tagName`);
  if (next === 'milestone.advisorName' || next === 'BODY') throw new Error('focus check: Tab after the change did not move on — ' + next);
  // Put the example's advisor back: the copy-dialog check later names them.
  await s.evalJs(`(() => { const d = document.querySelector('[data-key="milestone.advisorName"]'); d.value = 'Prof. Example'; d.dispatchEvent(new Event('change')); })()`);
  await s.settle();
  // A checkbox: focus then click (the page re-renders), focus must stay put.
  // (The click itself is synchronous through evalJs, so there is nothing to
  // wait FOR here — unlike the radio above, whose key event arrives
  // asynchronously. The wait stays.)
  await s.evalJs(`const cb = document.querySelector('[data-key^="attest."]'); cb.focus(); cb.click();`);
  await s.settle();
  const cbKey = await s.evalJs(`document.activeElement?.dataset?.key ?? ''`);
  if (!cbKey.startsWith('attest.')) throw new Error('focus check: focus left the checkbox after the change — now on ' + cbKey);
  console.log('  focus is preserved across re-renders (text field, checkbox); Tab continues from the same control');
}

// 3. No sideways scrolling at a phone (390) or tablet-portrait (820) width.
// 3b. The page FILLS a wide window (DGS 2026-09-09): it used to stop at
// 1240 px and centre, leaving a monitor half empty. Both columns grow with it.
async function checkWide(s, page, readyExpr, width = 2200) {
  await s.setViewport({ width, height: 1200 });
  await s.waitFor(readyExpr);
  await s.settle(250);
  const m = JSON.parse(await s.evalJs(`JSON.stringify((() => {
    const app = document.getElementById('app');
    const lay = document.querySelector('.layout');
    return {
      app: Math.round(app.getBoundingClientRect().width),
      cols: lay ? getComputedStyle(lay).gridTemplateColumns.split(' ').map((c) => Math.round(parseFloat(c))) : [],
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  })())`));
  // Padding is 20 px a side, so a fluid page is within 40 px of the window.
  if (m.app < width - 44) throw new Error(`${page} at ${width} px does not fill the window: #app is ${m.app} px`);
  if (m.overflow > 0) throw new Error(`${page} at ${width} px scrolls sideways`);
  if (page === 'app' && !(m.cols.length === 2 && m.cols[1] > 480)) {
    throw new Error('the inputs column must grow with the window, not stay at its minimum: ' + JSON.stringify(m.cols));
  }
  console.log(`  ${page} fills a ${width} px window (#app ${m.app} px${m.cols.length === 2 ? `, columns ${m.cols.join(' + ')}` : ''})`);
}

async function checkPhone(s, page, readyExpr, width = 390) {
  const height = width < 600 ? 844 : 1180;
  await s.setViewport({ width, height, mobile: true });
  await s.waitFor(readyExpr);
  await s.settle(250);
  const m = JSON.parse(
    await s.evalJs(`JSON.stringify({ scrollW: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth, wide: [...document.querySelectorAll('body *')].filter(e => e.getBoundingClientRect().right > ${width + 1} && getComputedStyle(e).position !== 'fixed').slice(0, 5).map(e => e.tagName + '.' + String(e.className).slice(0, 30)) })`),
  );
  await s.shot(`${width < 600 ? 'phone' : 'tablet'}-${page}`);
  if (m.scrollW > m.clientW) throw new Error(`${page} at ${width} px scrolls sideways (${m.scrollW} > ${m.clientW}); widest: ${m.wide.join(', ')}`);
  // The schedule tables keep a course on one line at desk widths. On a phone
  // the same table is a stack of cards, and a title that cannot wrap runs past
  // the card and drags the page sideways (DGS 2026-09-09, iPhone 14 Pro).
  // Only below the 860 px card breakpoint: above it the table is a real table
  // inside a horizontal scroller, where running past the card is what the
  // scroller is FOR (2026-09-16).
  if (page.startsWith('courses') && width <= 860) {
    // tbody only: the header row is visually hidden with the clip() pattern, so
    // it keeps a wide geometry that nobody can see.
    const spill = await s.evalJs(`JSON.stringify([...document.querySelectorAll('.schedule-table tbody td, .schedule-table tbody th')]
      .filter((c) => { const card = c.closest('.ov-card'); return card && c.getBoundingClientRect().right > card.getBoundingClientRect().right + 1; })
      .slice(0, 3).map((c) => (c.textContent || '').trim().slice(0, 40)))`);
    const out = JSON.parse(spill);
    if (out.length > 0) throw new Error(`a schedule cell runs past its card at ${width} px: ${out.join(' | ')}`);
  } else if (page.startsWith('courses')) {
    // Above the card breakpoint the schedule tables fit their card with every
    // column in view — no sideways scroll, as in All courses (DGS 2026-09-29).
    // The 980 px floor and the one-line titles used to overflow a 1,030 px card.
    const scrollers = JSON.parse(await s.evalJs(`JSON.stringify([...document.querySelectorAll('.schedule-overview .table-scroll')].map((d) => ({ client: d.clientWidth, scroll: d.scrollWidth })))`));
    const wide = scrollers.filter((d) => d.scroll > d.client);
    if (wide.length > 0) throw new Error(`a schedule table scrolls sideways at ${width} px: ${JSON.stringify(wide)}`);
    if (scrollers.length > 0) console.log(`  schedule tables fit their cards at ${width} px (${scrollers.map((d) => d.scroll + '/' + d.client).join(', ')})`);
  }
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
  await s.setViewport({ width: 1400, height: 1900 });
}

// 4. axe-core: WCAG 2.x A/AA rules plus the landmark best practices.
// Night mode (DGS 2026-10-04, src/ui/theme.ts): the Dark choice turns the
// page dark — <html data-theme="dark">, a dark ground — with every visible
// text still meeting WCAG contrast (axe's color-contrast rule); Auto then puts
// it back (headless browsers report a light device). The choice is saved, so
// a reload stays dark until Auto is picked.
async function checkNightMode(s, page, label) {
  await s.evalJs(`document.querySelector('[data-key="theme.dark"]').click()`);
  await s.settle();
  const state = JSON.parse(
    await s.evalJs(`JSON.stringify({ theme: document.documentElement.dataset.theme, pressed: document.querySelector('[data-key="theme.dark"]').getAttribute('aria-checked'), bg: getComputedStyle(document.body).backgroundColor })`),
  );
  const rgb = (state.bg.match(/\d+/g) ?? []).slice(0, 3).map(Number);
  if (state.theme !== 'dark' || state.pressed !== 'true' || !(rgb.length === 3 && Math.max(...rgb) < 60)) {
    throw new Error('night mode: Dark did not turn the page dark — ' + JSON.stringify(state));
  }
  await s.shot(`${page}-dark`);
  await checkAxe(s, `${label}, night mode`);
  await s.evalJs(`document.querySelector('[data-key="theme.auto"]').click()`);
  await s.settle();
  const back = await s.evalJs(`document.documentElement.dataset.theme`);
  if (back !== 'light') throw new Error('night mode: Auto did not return a light-device page to light — ' + back);
  console.log(`  night mode: Dark turns the ${label} dark with no contrast violations; Auto returns it to light`);
}

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
