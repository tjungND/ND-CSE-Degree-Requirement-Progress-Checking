import { readFileSync } from 'node:fs';

/** The WordPress-side listener, read out of the file the DGS copies and pastes
 * (docs/wordpress-footer-snippet.html) so the tested text and the pasted text
 * cannot drift apart. The prose above it mentions `<script>` as well — hence
 * the LAST occurrence, and the sanity check. */
function wordPressSnippetScript() {
  const file = readFileSync(new URL('../../docs/wordpress-footer-snippet.html', import.meta.url), 'utf8');
  const open = file.lastIndexOf('<script>');
  const close = file.indexOf('</script>', open);
  if (open < 0 || close < 0) throw new Error('docs/wordpress-footer-snippet.html has no <script> block');
  const js = file.slice(open + '<script>'.length, close);
  if (!js.includes('APP_ORIGIN') || js.includes('KSES')) throw new Error('extracted the wrong part of the WordPress snippet');
  return js;
}

// E2E: the basic app flow — initial Ph.D. report, example student, M.S. tab.
export async function driveApp(s, baseUrl) {
  await s.open(baseUrl);
  await s.evalJs(`localStorage.clear()`);
  await s.open(baseUrl);
  await s.waitFor(`document.querySelectorAll('.req').length > 5`);
  // A first visit describes the DEGREE, not a student who has failed thirteen
  // checks they have not been asked about (2026-09-08): the headline says so
  // and the "needs your attention" list is folded away, not gone.
  const firstVisit = JSON.parse(await s.evalJs(`JSON.stringify((() => {
    const fold = document.querySelector('details.attention-fold');
    return {
      headline: document.querySelector('.scorehead .headline, .summary-mobile .headline')?.textContent ?? document.querySelector('.audit .headline')?.textContent ?? '',
      folded: !!fold, open: fold ? fold.open : null,
      summary: fold?.querySelector('summary')?.textContent ?? '',
      attentionInside: !!fold?.querySelector('.attention'),
      // By class, not nth-of-type: since 2026-09-18 the ring carries a SECOND
      // arc for conditionally-met rows, drawn before this one.
      dialStroke: document.querySelector('.dial .dial-arc:not(.dial-arc-conditional)')?.getAttribute('stroke') ?? '',
    };
  })())`));
  console.log('  first visit:', JSON.stringify(firstVisit));
  if (!/^Getting started/.test(firstVisit.headline)) throw new Error('an untouched record must not lead with "0 of N met": ' + firstVisit.headline);
  if (!firstVisit.folded || firstVisit.open !== false || !firstVisit.attentionInside) throw new Error('the attention list must be folded on a first visit: ' + JSON.stringify(firstVisit));
  if (!/checks$/.test(firstVisit.summary)) throw new Error('the fold must name what it holds: ' + firstVisit.summary);
  if (firstVisit.dialStroke === 'var(--bad)') throw new Error('an empty record must not paint the dial red');
  await s.shot('app-initial-phd');
  await checkSheetLink(s, 'app');

  await s.evalJs(
    `[...document.querySelectorAll('button')].find(b => b.textContent === 'Load example').click()`,
  );
  await s.waitFor(`document.querySelectorAll('table.courses tr').length > 3`);
  // The example is saved like any other record, so it says whose it is until
  // it is cleared (2026-09-08).
  if (!(await s.evalJs(`!!document.querySelector('.example-banner')`))) throw new Error('the example record must announce itself');
  if ((await s.evalJs(`document.querySelector('.dial .dial-arc:not(.dial-arc-conditional)')?.getAttribute('stroke')`)) === 'var(--bad)') {
    throw new Error('a student who is simply not finished must not see a red dial');
  }
  // Every requirement a course feeds, under its credit sentence (2026-09-08):
  // one course routinely serves several, and the sentence names only the pool.
  const feeds = JSON.parse(await s.evalJs(`JSON.stringify((() => {
    const rows = [...document.querySelectorAll('table.courses tr')].map((tr) => ({
      id: tr.querySelector('.cid')?.textContent ?? '',
      now: [...tr.querySelectorAll('.counts-toward.now .req-link')].map((a) => ({ t: a.textContent, href: a.getAttribute('href') })),
      later: [...tr.querySelectorAll('.counts-toward.later .req-link')].map((a) => a.textContent),
    })).filter((r) => r.id);
    const targets = rows.flatMap((r) => r.now.map((n) => n.href)).filter((h) => !!document.querySelector(h));
    return { rows, linksResolve: targets.length, linkCount: rows.reduce((n, r) => n + r.now.length, 0) };
  })())`));
  const richest = feeds.rows.reduce((best, r) => (r.now.length > best.now.length ? r : best), { now: [], id: '' });
  console.log('  counts toward:', richest.id, JSON.stringify(richest.now.map((n) => n.t)));
  if (richest.now.length < 3) throw new Error('a course must name every requirement it feeds: ' + JSON.stringify(feeds.rows));
  if (!richest.now.some((n) => /^Core: /.test(n.t))) throw new Error('the §4.4.1 area a course covers must be named: ' + JSON.stringify(richest.now));
  // Short names (DGS 2026-09-08): the full requirement title is the tooltip.
  const longest = Math.max(...richest.now.map((n) => n.t.length));
  if (longest > 32) throw new Error('a requirement name in the list is too long for the cell: ' + JSON.stringify(richest.now.map((n) => n.t)));
  if (feeds.linksResolve !== feeds.linkCount) throw new Error(`${feeds.linkCount - feeds.linksResolve} requirement links do not resolve`);
  if (!feeds.rows.some((r) => r.later.length > 0)) throw new Error('an in-progress course must say what it WILL count toward');

  // A course that can count for ANY specialization group says which group is
  // worth choosing, from what the student's other courses already cover.
  const groups = JSON.parse(await s.evalJs(`JSON.stringify((() => {
    const sel = document.querySelector('table.courses select[data-key$=".group"]');
    if (!sel) return null;
    const tr = sel.closest('tr');
    return {
      labels: [...sel.querySelectorAll('optgroup')].map((g) => g.label),
      needed: [...(sel.querySelector('optgroup')?.children ?? [])].map((o) => o.textContent),
      covered: [...(sel.querySelectorAll('optgroup')[1]?.children ?? [])].map((o) => o.textContent),
      hint: tr?.querySelector('.group-hint')?.textContent ?? null,
    };
  })())`));
  console.log('  specialization choice:', JSON.stringify(groups));
  if (!groups || groups.labels[0] !== 'Groups you still need' || groups.labels[1] !== 'Already covered by another course') {
    throw new Error('a flexible course must sort its groups by what is still needed: ' + JSON.stringify(groups));
  }
  if (groups.needed.length === 0 || groups.covered.length === 0) throw new Error('the example should have both kinds: ' + JSON.stringify(groups));

  // A disclosure the student opened survives the next edit (2026-09-08):
  // render() rebuilds the DOM, and used to restore focus to a § button whose
  // quote had silently collapsed underneath it. The edit is a harmless
  // full-time-term tick, put back straight afterwards.
  await s.evalJs(`document.querySelector('.cite[aria-expanded]')?.click()`);
  await s.waitFor(`document.querySelector('.cite[aria-expanded="true"]')`);
  const citeKey = await s.evalJs(`document.querySelector('.cite[aria-expanded="true"]')?.dataset?.key ?? ''`);
  await s.evalJs(`document.querySelector('.ft-terms input[type="checkbox"]')?.click()`);
  await s.waitFor(`document.querySelectorAll('.req').length > 5`);
  const reopened = JSON.parse(await s.evalJs(`JSON.stringify((() => {
    const open = document.querySelector('.cite[aria-expanded="true"]');
    if (!open) return null;
    const quote = document.getElementById(open.getAttribute('aria-controls') ?? '');
    return { key: open.dataset.key ?? '', quoteVisible: !!quote && !quote.classList.contains('hidden') };
  })())`));
  console.log('  disclosure after an edit:', JSON.stringify(reopened), '(opened:', citeKey + ')');
  if (!reopened || reopened.key !== citeKey || reopened.quoteVisible !== true) {
    throw new Error('an opened § quote must survive the next edit: ' + JSON.stringify(reopened));
  }
  await s.evalJs(`document.querySelector('.ft-terms input[type="checkbox"]')?.click()`); // put it back
  await s.waitFor(`document.querySelectorAll('.req').length > 5`);
  await s.evalJs(`document.querySelector('.cite[aria-expanded="true"]')?.click()`); // and close the quote again
  await s.waitFor(`!document.querySelector('.cite[aria-expanded="true"]')`);
  await s.shot('app-example-phd');

  // "Oral Candidacy Exam (OCE)" in full once on the page (plus the glossary,
  // which keeps the full term), then "OCE" (DGS 2026-09-06 evening).
  const oce = JSON.parse(await s.evalJs(`JSON.stringify((() => {
    const all = document.querySelector('#app').textContent;
    const gl = document.querySelector('details.glossary')?.textContent ?? '';
    const count = (t) => t.split('Oral Candidacy Exam (OCE)').length - 1;
    return { page: count(all) - count(gl), glossary: count(gl), short: (all.match(/\\bOCE\\b/g) ?? []).length };
  })())`));
  console.log('  OCE mentions — page (outside the glossary):', oce.page, '| glossary:', oce.glossary, '| short "OCE":', oce.short);
  if (oce.page !== 1 || oce.glossary !== 1 || oce.short < 3) throw new Error('OCE first-mention rule: ' + JSON.stringify(oce));

  // A Ph.D. student who already holds Notre Dame's own master's (DGS
  // 2026-09-09): §4.5 cannot award a degree twice, so ticking the box takes
  // the along-the-way row out of the report entirely, and unticking brings it
  // back. The example student is a Ph.D. student, so the box is on the page.
  const msRow = () => `!!document.getElementById('req-phd-msAlongTheWay')`;
  // The box lives inside the "Prior degrees" <details> fold (trim review
  // 2026-09-18, P-65), closed for the example; a JS click fires inside a
  // closed fold, but open it so a screenshot of Your standing shows the box.
  await s.evalJs(`document.querySelector('[data-key="standing.prior.fold"]').open = true`);
  if (!(await s.evalJs(`document.querySelector('[data-key="standing.ndMasters"]') !== null`)))
    throw new Error('the "I already hold the MSCSE from Notre Dame" box is missing from Your standing');
  if ((await s.evalJs(msRow())) !== true) throw new Error('the §4.5 along-the-way row should be in the report before the box is ticked');
  await s.evalJs(`document.querySelector('[data-key="standing.ndMasters"]').click()`);
  await s.waitFor(`!document.getElementById('req-phd-msAlongTheWay')`);
  const ndMsHint = await s.evalJs(`[...document.querySelectorAll('.card .hint')].some((p) => /already hold the MSCSE|degree you already hold/.test(p.textContent))`);
  console.log('  already holds the MSCSE → the §4.5 along-the-way row is gone (hint shown:', ndMsHint + ')');
  await s.evalJs(`document.querySelector('[data-key="standing.ndMasters"]').click()`); // put it back
  await s.waitFor(`!!document.getElementById('req-phd-msAlongTheWay')`);

  // Manual course from another university (2026-09-06 evening): the University
  // box offers the ExternalCourses tab's universities and Title-Cases what is
  // typed; Level has two choices; the course lands under its heading.
  const form = JSON.parse(await s.evalJs(`JSON.stringify((() => {
    const origin = document.querySelector('[data-key="course.new.origin"]'); origin.value = 'transfer'; origin.dispatchEvent(new Event('change'));
    const uni = document.querySelector('[data-key="course.new.institution"]');
    const options = [...document.querySelectorAll('#known-universities option')].map(o => o.value);
    uni.value = 'example institute of technology'; uni.dispatchEvent(new Event('change'));
    const typed = uni.value;
    if (options.length > 0) { uni.value = options[0].toLowerCase(); uni.dispatchEvent(new Event('change')); }
    const known = uni.value;
    return { list: uni.getAttribute('list'), options, typed, known, levels: [...document.querySelector('[data-key="course.new.level"]').options].map(o => o.value + '=' + o.textContent) };
  })())`));
  console.log('  university box:', form.list, '|', form.options.length, 'known |', JSON.stringify(form.typed), JSON.stringify(form.known), '| levels:', JSON.stringify(form.levels));
  if (form.list !== 'known-universities' || form.typed !== 'Example Institute of Technology') throw new Error('university box: ' + JSON.stringify(form));
  if (form.options.length > 0 && form.known !== form.options[0]) throw new Error('a known university typed in lower case must come back in its list spelling: ' + JSON.stringify(form));
  if (form.levels.length !== 2 || !form.levels[0].startsWith('=Grad student — after') || !form.levels[1].startsWith('bachelors=UG student — before')) throw new Error('level options: ' + JSON.stringify(form.levels));
  await s.evalJs(`(() => { const uni = document.querySelector('[data-key="course.new.institution"]'); uni.value = 'example institute of technology'; uni.dispatchEvent(new Event('change')); const id = document.querySelector('[data-key="course.new.id"]'); id.value = 'CS 53000'; id.dispatchEvent(new Event('change')); document.querySelector('[data-key="course.new.add"]').click(); })()`);
  await s.waitFor(`[...document.querySelectorAll('h3.subhead')].some(h => h.textContent === 'Example Institute of Technology — graduate coursework (§5.2)')`);
  console.log('  a hand-typed course from another university lands under its Title-Cased heading');
  await s.evalJs(`(() => { const c = [...document.querySelectorAll('.card')].find(c => c.querySelector('h2')?.textContent.includes('Coursework')); c.id = 'shot-coursework'; })()`);
  await s.shotElement('manual-transfer-course', '#shot-coursework');
  await s.evalJs(`[...document.querySelectorAll('table.courses tr')].find(tr => tr.querySelector('.cid')?.textContent === 'CS 53000').querySelector('button.remove').click()`);
  await s.waitFor(`![...document.querySelectorAll('table.courses .cid')].some(e => e.textContent === 'CS 53000')`);

  // The Ph.D. tab cites §3 only where it must (DGS 2026-09-11): the §3.5 track
  // note, and the MSCSE-along-the-way row, which is §3.2's degree. Anything
  // else citing §3 on this page is a leak.
  {
    const tabs = JSON.parse(await s.evalJs(`JSON.stringify([...document.querySelectorAll('.tabs button')].map(b => b.textContent.trim()))`));
    const lines = (await s.evalJs(`document.querySelector('#app').innerText`)).split('\n').map((l) => l.trim()).filter((l) => /§3(\.\d)*\b/.test(l) && !tabs.includes(l));
    const allowed = (l) => /§3\.5/.test(l) || /along the way/i.test(l) || /Sections 3 and 4|Section 3 of the/.test(l) === false && /MSCSE/.test(l) && /§3\.2/.test(l);
    const leaks = lines.filter((l) => !allowed(l));
    if (leaks.length) throw new Error('the Ph.D. tab cites §3 where it need not:\n  ' + leaks.slice(0, 6).join('\n  '));
    console.log('  Ph.D. tab: §3 appears only where necessary (' + lines.length + ' line(s), all allowed)');
    // …and the decider is the DGS: "ADGS" appears only in the contact card (DGS 2026-09-11).
    const adgs = (await s.evalJs(`(() => { const c = document.querySelector('#app').cloneNode(true); c.querySelectorAll('.contact-card, details.glossary').forEach(e => e.remove()); return c.textContent; })()`));
    if (/ADGS/.test(adgs)) throw new Error('the Ph.D. tab must not send the student to the ADGS');
    const reviewHead = await s.evalJs(`document.querySelector('.dgs-review h2')?.textContent ?? ''`);
    if (reviewHead && !/Ask the DGS to review/.test(reviewHead)) throw new Error('the review card must address the DGS on the Ph.D. tab: ' + reviewHead);
    console.log('  Ph.D. tab: every decision goes to the DGS');
  }

  // A choice the page can make for the student, it makes (DGS 2026-09-12,
  // red-team F2): un-assign the example's flexible course and the page
  // re-assigns it to the group that covers the most, saying so in a toast.
  {
    const rowIndex = await s.evalJs(`[...document.querySelectorAll('table.courses tr')].findIndex(tr => tr.querySelector('.cid')?.textContent === 'CSE 60876') - 1`);
    await s.evalJs(`(() => { const sel = document.querySelector('[data-key="course.${rowIndex}.group"]'); sel.value = ''; sel.dispatchEvent(new Event('change')); })()`);
    await s.waitFor(`document.querySelector('[data-key="course.${rowIndex}.group"]')?.value !== ''`);
    const refilled = await s.evalJs(`document.querySelector('[data-key="course.${rowIndex}.group"]').value`);
    const autoToast = await s.evalJs(`document.querySelector('.toast.auto-notice')?.textContent ?? ''`);
    if (!/chosen automatically to cover the most distinct groups/.test(autoToast)) throw new Error('un-assigning a flexible course must be re-filled with a notice: ' + autoToast);
    if (!/CSE 60876 →/.test(autoToast)) throw new Error('the notice must name the course and group: ' + autoToast);
    console.log('  flexible course re-assigned automatically → ' + refilled + ' (toast shown)');
  }

  // Course ids are read case- and space-insensitively (DGS 2026-09-11): a
  // hand-typed "cse60641" is the sheet's CSE 60641, not a non-CSE course.
  await s.evalJs(`(() => { const o = document.querySelector('[data-key="course.new.origin"]'); o.value = 'nd'; o.dispatchEvent(new Event('change')); const id = document.querySelector('[data-key="course.new.id"]'); id.value = 'cse60641'; id.dispatchEvent(new Event('change')); })()`);
  const canon = await s.evalJs(`document.querySelector('[data-key="course.new.id"]').value + ' | ' + document.querySelector('[data-key="course.new.title"]').value`);
  console.log('  “cse60641” typed →', canon);
  if (!/^CSE 60641 \| .+/.test(canon)) throw new Error('a lower-case, unspaced id must resolve to the sheet row: ' + canon);
  await s.evalJs(`(() => { const id = document.querySelector('[data-key="course.new.id"]'); id.value = ''; id.dispatchEvent(new Event('change')); })()`);

  // A course entered with 0 credits (DGS 2026-09-11): allowed, because a
  // transcript's credit-hours column can come through blank and refusing the
  // row would lose the course — but never silently. The student is asked
  // first, the safe answer has focus, and Escape cancels.
  await s.evalJs(`(() => {
    const o = document.querySelector('[data-key="course.new.origin"]'); o.value = 'nd'; o.dispatchEvent(new Event('change'));
    const id = document.querySelector('[data-key="course.new.id"]'); id.value = 'CSE 60567'; id.dispatchEvent(new Event('change'));
    const cr = document.querySelector('[data-key="course.new.credits"]'); cr.value = '0'; cr.dispatchEvent(new Event('change'));
    document.querySelector('[data-key="course.new.add"]').click();
  })()`);
  await s.waitFor(`!!document.querySelector('dialog.confirm-check')`);
  const zero = JSON.parse(await s.evalJs(`JSON.stringify((() => {
    const d = document.querySelector('dialog.confirm-check');
    return { title: d.querySelector('h2').textContent, body: d.querySelector('p').textContent,
      buttons: [...d.querySelectorAll('button')].map(b => b.textContent),
      focused: document.activeElement?.dataset?.key ?? '' };
  })())`));
  console.log('  0-credit check:', JSON.stringify(zero.title), '| focus on', zero.focused, '|', JSON.stringify(zero.buttons));
  if (!/CSE 60567 is entered with 0 credits/.test(zero.title)) throw new Error('the 0-credit dialog must name the course: ' + zero.title);
  if (!/counts toward nothing/.test(zero.body)) throw new Error('the 0-credit dialog must say what 0 credits means: ' + zero.body);
  if (zero.focused !== 'confirm.no') throw new Error('the safe answer must have focus, not the one that adds the course: ' + zero.focused);
  await s.shotElement('zero-credit-check', 'dialog.confirm-check .consent-box');
  await s.evalJs(`document.querySelector('[data-key="confirm.no"]').click()`);
  await s.waitFor(`!document.querySelector('dialog.confirm-check')`);
  if (await s.evalJs(`[...document.querySelectorAll('table.courses .cid')].some(e => e.textContent === 'CSE 60567')`)) {
    throw new Error('cancelling the 0-credit check must not add the course');
  }
  // …and confirming adds it, with a line and a warning that say why it counts nothing.
  await s.evalJs(`document.querySelector('[data-key="course.new.add"]').click()`);
  await s.waitFor(`!!document.querySelector('dialog.confirm-check')`);
  await s.evalJs(`document.querySelector('[data-key="confirm.yes"]').click()`);
  await s.waitFor(`[...document.querySelectorAll('table.courses .cid')].some(e => e.textContent === 'CSE 60567')`);
  const zeroLine = await s.evalJs(`[...document.querySelectorAll('table.courses tr')].find(tr => tr.querySelector('.cid')?.textContent === 'CSE 60567')?.textContent ?? ''`);
  const zeroWarn = await s.evalJs(`document.querySelector('.warnings')?.textContent ?? ''`);
  if (!/entered with 0 credits; check the credit hours on your transcript/.test(zeroLine)) throw new Error('the 0-credit line must say why: ' + zeroLine.slice(0, 160));
  if (!/CSE 60567 is entered with 0 credits/.test(zeroWarn)) throw new Error('a 0-credit course must also raise a warning: ' + zeroWarn.slice(0, 200));
  console.log('  0-credit course added after confirming — line and warning both explain it');
  await s.evalJs(`[...document.querySelectorAll('table.courses tr')].find(tr => tr.querySelector('.cid')?.textContent === 'CSE 60567').querySelector('button.remove').click()`);
  await s.waitFor(`![...document.querySelectorAll('table.courses .cid')].some(e => e.textContent === 'CSE 60567')`);
  await s.evalJs(`(() => { const cr = document.querySelector('[data-key="course.new.credits"]'); cr.value = '3'; cr.dispatchEvent(new Event('change')); })()`);

  // Numbers the form refuses (interface review R1, 2026-09-18). Before this,
  // `min`/`max` were decorative: a GPA of 35 was stored and the §2.2 row read
  // "Cumulative GPA 35.00 meets the 3.0 minimum" under a green Met pill, and a
  // course at 999 credits (box max 15) was accepted.
  const gpaBefore = await s.evalJs(`document.querySelector('[data-key="courses.gpa"]').value`);
  const badGpa = JSON.parse(await s.evalJs(`JSON.stringify((() => {
    const g = document.querySelector('[data-key="courses.gpa"]');
    g.value = '35';
    g.dispatchEvent(new Event('change'));
    const row = [...document.querySelectorAll('.req')].find((r) => /Cumulative GPA/.test(r.querySelector('.req-title')?.textContent ?? ''));
    return {
      kept: g.value,
      invalid: g.getAttribute('aria-invalid'),
      describedBy: g.getAttribute('aria-describedby'),
      message: document.querySelector('#courses-gpa-error')?.textContent ?? '',
      hidden: document.querySelector('#courses-gpa-error')?.classList.contains('hidden'),
      stored: (JSON.parse(localStorage.getItem('cse-degree-audit/v1/student') || '{}')).gpa ?? null,
      rowStatus: [...(row?.classList ?? [])].find((c) => c.startsWith('s-')) ?? '',
      rowText: row?.textContent ?? '',
    };
  })())`));
  console.log('  GPA 35 refused:', JSON.stringify({ ...badGpa, rowText: badGpa.rowText.slice(0, 90) }));
  if (badGpa.kept !== '35') throw new Error('the refused value must stay in the box to be corrected: ' + badGpa.kept);
  if (badGpa.invalid !== 'true' || badGpa.hidden !== false) throw new Error('a refused box must be marked invalid and show its message: ' + JSON.stringify(badGpa));
  if (!/between 0.00 and 4.00/.test(badGpa.message)) throw new Error('the message must name the range: ' + badGpa.message);
  if (badGpa.describedBy !== 'courses-gpa-error') throw new Error('the message must be the box’s description: ' + badGpa.describedBy);
  if (badGpa.stored === 35) throw new Error('a refused value must never reach localStorage');
  // The record keeps the last figure the app accepted, so §2.2 still reads
  // against THAT one — what must never happen is 35 reaching the verdict.
  if (/\b35\b/.test(badGpa.rowText.split('Handbook §')[0])) throw new Error('§2.2 must never carry the refused figure: ' + badGpa.rowText.slice(0, 160));
  await s.evalJs(`(() => { document.querySelector('[data-key="courses.gpa"]').closest('.card').id = 'shot-gpa'; })()`);
  await s.shotElement('gpa-refused', '#shot-gpa');
  // …and a figure on the scale is accepted, clearing the mark and the message.
  const goodGpa = JSON.parse(await s.evalJs(`JSON.stringify((() => {
    const g = document.querySelector('[data-key="courses.gpa"]');
    g.value = '3.5';
    g.dispatchEvent(new Event('change'));
    const g2 = document.querySelector('[data-key="courses.gpa"]');
    const row = [...document.querySelectorAll('.req')].find((r) => /Cumulative GPA/.test(r.querySelector('.req-title')?.textContent ?? ''));
    return {
      invalid: g2.getAttribute('aria-invalid'),
      shown: !document.querySelector('#courses-gpa-error')?.classList.contains('hidden'),
      stored: (JSON.parse(localStorage.getItem('cse-degree-audit/v1/student') || '{}')).gpa ?? null,
      rowStatus: [...(row?.classList ?? [])].find((c) => c.startsWith('s-')) ?? '',
    };
  })())`));
  console.log('  GPA 3.5 accepted:', JSON.stringify(goodGpa));
  if (goodGpa.invalid !== null || goodGpa.shown) throw new Error('a corrected box must lose the mark and the message: ' + JSON.stringify(goodGpa));
  if (goodGpa.stored !== 3.5 || goodGpa.rowStatus !== 's-met') throw new Error('a GPA on the scale must be stored and met: ' + JSON.stringify(goodGpa));
  // A course at 999 credits is refused at entry, not counted.
  const badCredits = JSON.parse(await s.evalJs(`JSON.stringify((() => {
    const id = document.querySelector('[data-key="course.new.id"]');
    id.value = 'CSE 60772';
    id.dispatchEvent(new Event('change'));
    const cr = document.querySelector('[data-key="course.new.credits"]');
    cr.value = '999';
    document.querySelector('[data-key="course.new.add"]').click();
    return {
      added: [...document.querySelectorAll('table.courses .cid')].some((e) => e.textContent === 'CSE 60772'),
      invalid: document.querySelector('[data-key="course.new.credits"]')?.getAttribute('aria-invalid'),
      message: document.querySelector('#new-course-credits-error')?.textContent ?? '',
    };
  })())`));
  console.log('  999 credits refused:', JSON.stringify(badCredits));
  if (badCredits.added) throw new Error('a course at 999 credits must not be added');
  if (badCredits.invalid !== 'true' || !/between 0 and 15/.test(badCredits.message)) throw new Error('the credits box must say why: ' + JSON.stringify(badCredits));
  await s.evalJs(`(() => {
    const cr = document.querySelector('[data-key="course.new.credits"]');
    cr.value = '3';
    cr.dispatchEvent(new Event('input'));
    const id = document.querySelector('[data-key="course.new.id"]');
    id.value = '';
    const g = document.querySelector('[data-key="courses.gpa"]');
    g.value = ${JSON.stringify(gpaBefore ?? '')};
    g.dispatchEvent(new Event('change'));
  })()`);

  // Conditional satisfaction (interface review R2/W-CS1, 2026-09-18). A CSE
  // 4xxxx course the LIVE rules sheet gates on the DGS's approval: the cap row
  // must read "Conditionally met" rather than "Met", the ring must carry its
  // own band, and the headline and the sticky bar must count it apart from
  // "not yet" instead of burying it in a parenthetical.
  const cond = JSON.parse(await s.evalJs(`JSON.stringify((() => {
    const id = document.querySelector('[data-key="course.new.id"]');
    id.value = 'CSE 40243';
    id.dispatchEvent(new Event('change'));
    document.querySelector('[data-key="course.new.add"]').click();
    const row = [...document.querySelectorAll('.req')].find((r) => /below the 60000 level/.test(r.querySelector('.req-title')?.textContent ?? ''));
    return {
      pill: row?.querySelector('.pill')?.textContent ?? '',
      status: [...(row?.classList ?? [])].find((c) => c.startsWith('s-')) ?? '',
      headline: document.querySelector('.audit .headline, .scorehead .headline')?.textContent ?? '',
      sticky: document.querySelector('.sticky-score')?.textContent ?? '',
      keyItems: [...document.querySelectorAll('.audit .headline .key-item')].map((k) => k.textContent),
      condBand: document.querySelector('.dial .dial-arc-conditional')?.getAttribute('stroke-dasharray') ?? '',
    };
  })())`));
  console.log('  conditional satisfaction:', JSON.stringify({ ...cond, headline: cond.headline.slice(0, 80) }));
  if (cond.pill !== 'Conditionally met') throw new Error('the cap row must read "Conditionally met": ' + cond.pill);
  if (cond.status !== 's-needs_dgs_review') throw new Error('…without changing the underlying status: ' + cond.status);
  if (!/\d+ conditionally met/.test(cond.headline)) throw new Error('the headline must count it on its own: ' + cond.headline);
  if (!/conditionally met/.test(cond.sticky)) throw new Error('the sticky bar must name it too: ' + cond.sticky);
  if (!cond.keyItems.some((t) => /conditionally met/.test(t))) throw new Error('the status key must list it: ' + JSON.stringify(cond.keyItems));
  if (!/^[1-9]/.test(cond.condBand)) throw new Error('the ring must carry a conditional band: ' + cond.condBand);
  // The mobile summary is display:none at this width — take the visible one.
  await s.evalJs(`(() => {
    const n = [...document.querySelectorAll('.scorehead')].find((e) => e.getBoundingClientRect().width > 0);
    if (n) n.id = 'shot-dash';
  })()`);
  await s.shotElement('dashboard-conditional', '#shot-dash');
  // The over-cap warning is its own line, not grey prose under a green pill.
  await s.evalJs(`(() => {
    for (const [id, cr] of [['CSE 40567', '3'], ['CSE 40437', '3']]) {
      const i = document.querySelector('[data-key="course.new.id"]');
      i.value = id; i.dispatchEvent(new Event('change'));
      const c = document.querySelector('[data-key="course.new.credits"]');
      c.value = cr; c.dispatchEvent(new Event('change'));
      document.querySelector('[data-key="course.new.add"]').click();
    }
  })()`);
  const overCap = JSON.parse(await s.evalJs(`JSON.stringify((() => {
    const row = [...document.querySelectorAll('.req')].find((r) => /below the 60000 level/.test(r.querySelector('.req-title')?.textContent ?? ''));
    if (row) row.id = 'shot-overcap';
    return {
      warn: [...(row?.querySelectorAll('.detail-warn') ?? [])].map((n) => n.textContent),
      pill: row?.querySelector('.pill')?.textContent ?? '',
    };
  })())`));
  console.log('  over-cap warning:', JSON.stringify(overCap));
  if (overCap.warn.length === 0 || !/over the cap/.test(overCap.warn.join(' '))) {
    throw new Error('credits the cap discards must be a warning line: ' + JSON.stringify(overCap));
  }
  await s.shotElement('over-cap-warning', '#shot-overcap');
  for (const id of ['CSE 40243', 'CSE 40567', 'CSE 40437']) {
    await s.evalJs(`(() => {
      const tr = [...document.querySelectorAll('table.courses tr')].find((tr) => tr.querySelector('.cid')?.textContent === ${JSON.stringify(id)});
      tr?.querySelector('button.remove')?.click();
    })()`);
  }

  // §3.6 Transition to Computing (2026-09-10, promised 2026-08-31): a student
  // who enters a 50000-level bridge course is told the audit does not model
  // their track and sent to the DGS — above the dial, and NOT in the amber
  // warnings box, because nothing is wrong.
  if (await s.evalJs(`document.querySelectorAll('.track-note').length > 0`)) throw new Error('the example student is on no special track — no note should show');
  await s.evalJs(`(() => { const o = document.querySelector('[data-key="course.new.origin"]'); o.value = 'nd'; o.dispatchEvent(new Event('change')); const id = document.querySelector('[data-key="course.new.id"]'); id.value = 'CSE 50501'; id.dispatchEvent(new Event('change')); document.querySelector('[data-key="course.new.add"]').click(); })()`);
  await s.waitFor(`document.querySelectorAll('.track-note').length === 1`);
  const track = JSON.parse(await s.evalJs(`JSON.stringify((() => {
    const n = document.querySelector('.track-note');
    const dial = document.querySelector('.audit .dial') ?? document.querySelector('.audit .scorehead'); // the REPORT's dial — renderSummary draws one higher up the page
    return { text: n.textContent, beforeDial: !!(dial && (n.compareDocumentPosition(dial) & Node.DOCUMENT_POSITION_FOLLOWING)), inWarnings: !!n.closest('.warnings') };
  })())`));
  console.log('  §3.6 note:', JSON.stringify(track.text.slice(0, 96)));
  if (!/Transition to Computing \(§3\.6\)/.test(track.text)) throw new Error('the §3.6 note must name the track and its section: ' + track.text);
  if (!/DGS/.test(track.text)) throw new Error('the §3.6 note must send the student to the DGS: ' + track.text);
  if (!track.beforeDial) throw new Error('the track note belongs above the dial — the score means something different once you read it');
  if (track.inWarnings) throw new Error('the track note is not a warning: nothing is wrong with the record');
  await s.evalJs(`(() => { const c = [...document.querySelectorAll('.card, .audit')].find(c => c.querySelector('.track-note')); c.id = 'shot-track'; })()`);
  await s.shotElement('track-note', '#shot-track');
  await s.evalJs(`[...document.querySelectorAll('table.courses tr')].find(tr => tr.querySelector('.cid')?.textContent === 'CSE 50501').querySelector('button.remove').click()`);
  await s.waitFor(`document.querySelectorAll('.track-note').length === 0`);

  // Coursework table: the term cell shows the short form with the full name as its tooltip (DGS 2026-09-07).
  const termCell = await s.evalJs(`(() => { const a = document.querySelector('table.courses td[data-label="Term"] abbr.term'); return a ? a.textContent + '|' + a.title : ''; })()`);
  console.log('  coursework term cell:', termCell);
  if (!/^(FA|SP|SU)\d{2}\|(Fall|Spring|Summer) \d{4}$/.test(termCell)) throw new Error('coursework term cell must read e.g. "FA26" with the full name as tooltip: ' + termCell);

  // The Grad Admin card (2026-09-06 evening) and its copy dialog, the DGS in cc.
  const ga = await s.evalJs(`document.querySelector('.grad-admin-request')?.textContent ?? ''`);
  if (!ga.includes('Ask the Grad Admin to process') || !ga.includes('Two people, two jobs')) throw new Error('Grad Admin card: ' + ga.slice(0, 120));
  await s.shotElement('grad-admin-card', '.grad-admin-request');
  await s.evalJs(`document.querySelector('[data-key="gradadmin.copy"]').click()`);
  await s.waitFor(`document.querySelector('dialog.copy-check[open]')`);
  const gaDlg = JSON.parse(await s.evalJs(`JSON.stringify((() => { const d = document.querySelector('dialog.copy-check'); return { title: d.querySelector('h2').textContent, to: [...d.querySelectorAll('.copy-to')].map(p => p.textContent), subject: d.querySelector('.copy-subject').textContent, text: d.querySelector('textarea').value.slice(0, 200) }; })())`));
  console.log('  Grad Admin dialog:', gaDlg.title, '|', JSON.stringify(gaDlg.to), '|', gaDlg.subject);
  if (!gaDlg.title.startsWith('Processing request') || !gaDlg.to[0].startsWith('To: Graduate Program Administrator') || !(gaDlg.to[1] ?? '').startsWith('Cc: Director of Graduate Studies') || !/^Subject: Processing request \(degree self-check\) — Ph\.D\., entered Fall \d{4}$/.test(gaDlg.subject) || !gaDlg.text.includes('Dear Grad Admin,')) throw new Error('Grad Admin dialog: ' + JSON.stringify(gaDlg));
  // Two numbered steps for a student with no transfer credit (P-45, 2026-09-18;
  // the self-check-file step dropped 2026-09-15): open/paste, send. The Grad
  // Admin needs the original transcripts only for §5.2 transfer credit, so the
  // emphasised '*Attach your ORIGINAL transcripts' step appears — second of
  // three — only when a course the DGS ruled transferable is in the request;
  // the Ph.D. example has none.
  const gaSteps = await s.evalJs(`[...document.querySelectorAll('dialog.copy-check ol.copy-steps li')].map(li => (li.querySelector('strong') ? '*' : '') + li.textContent)`);
  console.log('  Grad Admin dialog steps:', JSON.stringify(gaSteps.map((t) => t.slice(0, 70))));
  if (gaSteps.length !== 2 || !/^Send it\./.test(gaSteps[1]) || gaSteps.some((t) => /ORIGINAL transcripts/.test(t))) throw new Error('Grad Admin dialog steps (no transfer → no attach step): ' + JSON.stringify(gaSteps));
  // "Open in my email app" (DGS 2026-09-13): a mailto: to the Grad Admin with
  // the DGS in cc and the subject; the body is the message itself only while
  // the address stays short enough for every client.
  const gaMail = await s.evalJs(`document.querySelector('dialog.copy-check [data-key="copy.email"]')?.getAttribute('href') ?? ''`);
  if (!/^mailto:csalmons%40nd\.edu\?cc=tjung%40nd\.edu&subject=Processing%20request/.test(gaMail)) throw new Error('the Grad Admin dialog must open the email app with To, Cc and Subject: ' + gaMail.slice(0, 120));
  if (!/&body=/.test(gaMail)) throw new Error('the mailto must carry a body');
  console.log('  Grad Admin dialog: "Open in my email app" → ' + decodeURIComponent(gaMail.slice(0, 80)) + '…');
  const gaLead = await s.evalJs(`document.querySelector('dialog.copy-check .copy-lead strong')?.textContent ?? ''`);
  if (!/copied to your clipboard\.$|blocked the clipboard\.$/.test(gaLead)) throw new Error('Grad Admin dialog must lead with the copied-to-clipboard line: ' + gaLead);
  const gaText = await s.evalJs(`document.querySelector('dialog.copy-check textarea').value`);
  if (!gaText.includes('(You may edit anything above this line)') || !gaText.includes('(DO NOT MODIFY ANYTHING BELOW THIS LINE)') || !gaText.includes('MET — CUMULATIVE GPA OF AT LEAST 3.0 (§2.2)')) throw new Error('Grad Admin text must carry the markers and the met-requirement tables: ' + gaText.slice(0, 300));
  await s.shot('grad-admin-dialog');
  await s.evalJs(`document.querySelector('[data-key="copy.ok"]').click()`);
  await s.waitFor(`!document.querySelector('dialog.copy-check')`);

  // The rule on the output side (2026-09-03): clicking a § chip reveals the
  // handbook sentence the verdict is checked against.
  await s.evalJs(`document.querySelector('button.cite').click()`);
  const quote = await s.evalJs(`document.querySelector('.rule-quote:not(.hidden)')?.textContent ?? ''`);
  if (!quote.startsWith('Handbook §')) throw new Error('clicking the § chip did not reveal the handbook rule: ' + quote.slice(0, 60));
  console.log('  § chip reveals the handbook rule');
  await s.shot('rule-quote');
  await s.evalJs(`document.querySelector('button.cite').click()`); // close it again

  await s.evalJs(
    `[...document.querySelectorAll('button.tab')].find(b => b.textContent.includes('M.S.')).click()`,
  );
  await s.waitFor(
    `[...document.querySelectorAll('.req-title')].some(e => e.textContent.includes('project'))`,
  );
  await s.shot('app-example-ms');

  // "Load example" loads the example for the tab you are on (DGS 2026-09-18).
  // One example for both was a Ph.D. record, so an MSCSE student who pressed it
  // was shown a dissertation and a qualifying examination, and the report
  // switched to §4 under them.
  // The record already holds the Ph.D. example, so the button asks first —
  // answer it the way a student would. (A real `confirm` blocks the page and
  // the harness has no dialog handler.)
  await s.evalJs(`(() => { window.__confirm = window.confirm; window.confirm = () => true; })()`);
  await s.evalJs(`[...document.querySelectorAll('button')].find((b) => b.textContent === 'Load example').click()`);
  await s.waitFor(`[...document.querySelectorAll('table.courses .cid')].some((e) => e.textContent === 'CSE 68902')`, 5000).catch(() => {});
  await s.evalJs(`(() => { window.confirm = window.__confirm; })()`);
  const msEx = JSON.parse(await s.evalJs(`JSON.stringify((() => {
    const txt = document.body.innerText;
    return {
      program: document.querySelector('[data-key="program.mscse"]')?.getAttribute('aria-pressed') ?? document.querySelector('.segmented [aria-pressed="true"]')?.textContent ?? '',
      courses: [...document.querySelectorAll('table.courses .cid')].map((e) => e.textContent),
      phdWords: /dissertation|Qualifying Examination|candidacy/i.test(txt),
      futureGrades: (txt.match(/is still counted, but check the term/g) || []).length,
      rows: [...document.querySelectorAll('.req-title')].map((e) => e.textContent).join(' | '),
    };
  })())`));
  if (msEx.phdWords) throw new Error('the MSCSE example must not put Ph.D. requirements on the page: ' + msEx.rows.slice(0, 200));
  if (!msEx.courses.includes('CSE 68902')) throw new Error('the MSCSE example must carry the §3.4 project course: ' + JSON.stringify(msEx.courses));
  if (msEx.courses.includes('CSE 98900')) throw new Error('the MSCSE example is still the Ph.D. record: ' + JSON.stringify(msEx.courses));
  if (msEx.futureGrades > 0) throw new Error('the example gives a final grade to a semester that has not happened');
  console.log('  Load example on the M.S. tab loads an MSCSE record (' + msEx.courses.length + ' courses, project included, no Ph.D. rows)');
  await s.shot('app-example-mscse');

  const summary = await s.evalJs(
    `document.querySelector('.headline')?.textContent + ' | ' + document.querySelector('.dial-text')?.textContent`,
  );
  console.log('  M.S. summary:', summary);
  if (!/\d+\/\d+/.test(summary ?? '')) throw new Error('score dial did not render');

  // Privacy wording against measured behaviour, and Clear where someone who has
  // finished reading actually is (interface review R6/R7, 2026-09-18).
  const privacy = JSON.parse(await s.evalJs(`JSON.stringify((() => {
    const txt = document.body.textContent ?? '';
    const card = document.querySelector('.finish-card');
    if (card) card.id = 'shot-finish';
    return {
      overstated: /only network request|to any third party/.test(txt),
      approved: /Your coursework never leaves this browser/.test(txt),
      ferpa: /FERPA-protected education records remain under your control/.test(txt),
      shared: /On a shared or public computer, clear your record before you walk away/.test(txt),
      finishCard: card?.textContent ?? '',
      clearAtEnd: !!document.querySelector('[data-key="report.clear"]'),
      clearAtTop: !!document.querySelector('[data-key="tools.clear"]'),
    };
  })())`));
  console.log('  privacy + shared computers:', JSON.stringify({ ...privacy, finishCard: privacy.finishCard.slice(0, 60) }));
  if (privacy.overstated) throw new Error('the overstated privacy claims must be gone');
  if (!privacy.approved || !privacy.ferpa) throw new Error('the approved wording and the FERPA sentence must both be there');
  if (!privacy.shared) throw new Error('the shared-computer line must be in the save card');
  if (!privacy.clearAtEnd || !privacy.clearAtTop) throw new Error('Clear must be reachable from BOTH ends: ' + JSON.stringify(privacy));
  await s.shotElement('finish-card', '#shot-finish');

  // The example banner tells the truth about whose rows these are (interface
  // review R5, 2026-09-18). `isExample` used to be a flag on the whole record:
  // load the example, add one course of your own, and the banner still said
  // "Nothing here came from you" while offering to clear the lot.
  await s.open(baseUrl);
  await s.evalJs(`localStorage.clear()`);
  await s.open(baseUrl);
  await s.waitFor(`document.querySelectorAll('.req').length > 5`);
  await s.evalJs(`[...document.querySelectorAll('button')].find((b) => b.textContent === 'Load example').click()`);
  await s.waitFor(`document.querySelectorAll('table.courses tr').length > 3`);
  const wholeExample = await s.evalJs(`document.querySelector('.example-banner')?.textContent ?? ''`);
  if (!/This is the example student, not your record/.test(wholeExample)) {
    throw new Error('an untouched example must still say it is the example: ' + wholeExample.slice(0, 120));
  }
  await s.evalJs(`(() => {
    const id = document.querySelector('[data-key="course.new.id"]');
    id.value = 'CSE 60772';
    id.dispatchEvent(new Event('change'));
    document.querySelector('[data-key="course.new.add"]').click();
  })()`);
  await s.waitFor(`[...document.querySelectorAll('table.courses .cid')].some((e) => e.textContent === 'CSE 60772')`);
  const mixed = JSON.parse(await s.evalJs(`JSON.stringify((() => {
    const b = document.querySelector('.example-banner');
    if (b) b.id = 'shot-example';
    return { text: b?.textContent ?? '', button: b?.querySelector('button')?.textContent ?? '' };
  })())`));
  console.log('  example banner after one real course:', JSON.stringify(mixed));
  if (!/8 of these 9 courses are the example student’s/.test(mixed.text)) {
    throw new Error('the banner must count whose rows these are: ' + mixed.text.slice(0, 160));
  }
  if (/Nothing here came from you/.test(mixed.text)) throw new Error('…and must not claim nothing came from the student');
  if (mixed.button !== 'Remove the example rows') throw new Error('the button must offer to remove only the example rows: ' + mixed.button);
  await s.shotElement('example-banner-mixed', '#shot-example');
  await s.evalJs(`document.querySelector('[data-key="example.clear"]').click()`);
  await s.waitFor(`!document.querySelector('.example-banner')`);
  const after = JSON.parse(await s.evalJs(`JSON.stringify((() => ({
    ids: [...document.querySelectorAll('table.courses .cid')].map((e) => e.textContent),
    banner: !!document.querySelector('.example-banner'),
    stored: (JSON.parse(localStorage.getItem('cse-degree-audit/v1/student') || '{}').courses ?? []).map((c) => c.courseId),
    advisor: JSON.parse(localStorage.getItem('cse-degree-audit/v1/student') || '{}').milestones?.advisorName ?? null,
  }))())`));
  console.log('  after removing the example rows:', JSON.stringify(after));
  if (after.banner) throw new Error('with no example rows left the banner must go');
  if (after.ids.join() !== 'CSE 60772' || after.stored.join() !== 'CSE 60772') {
    throw new Error('removing the example rows must leave the student\'s own course: ' + JSON.stringify(after));
  }
  if (after.advisor !== null) throw new Error('the example\'s advisor should have gone with it: ' + after.advisor);
  await s.evalJs(`localStorage.clear()`);

  // Printing opens the footer's closed disclosures ("What is still being
  // tested", "Where the rules come from") and closes them again afterwards
  // (trim review 2026-09-18, P-71): a closed <details> prints as a bare
  // heading with nothing under it. The handler listens for beforeprint /
  // afterprint, so dispatching the events stands in for the print dialog
  // headless Chrome cannot show. One fold is left open beforehand so the
  // "return to what the student had" half is exercised too.
  const printFold = JSON.parse(await s.evalJs(`JSON.stringify((() => {
    const all = () => [...document.querySelectorAll('footer.legal details')];
    const original = all().map((d) => d.open);
    all().forEach((d, i) => { d.open = i === 0; });
    const before = all().map((d) => d.open);
    window.dispatchEvent(new Event('beforeprint'));
    const during = all().map((d) => d.open);
    window.dispatchEvent(new Event('afterprint'));
    const after = all().map((d) => d.open);
    all().forEach((d, i) => { d.open = original[i]; });
    return { n: before.length, before, during, after };
  })())`));
  console.log('  footer disclosures around printing:', JSON.stringify(printFold));
  if (printFold.n < 2) throw new Error('expected the two footer disclosures: ' + JSON.stringify(printFold));
  if (!printFold.during.every(Boolean)) throw new Error('beforeprint must open every closed footer disclosure so the printed page carries its text (P-71): ' + JSON.stringify(printFold));
  if (printFold.after.join() !== printFold.before.join()) throw new Error('afterprint must return the footer disclosures to the state the student had (P-71): ' + JSON.stringify(printFold));

  await driveAppEmbed(s, baseUrl);
}

// E2E: ?embed=1 on the self-check tool (DGS 2026-09-16). The same chrome trim
// as the course-rules page, plus what is true only here: the student is told
// where their saved work is going, and — since later the same day — the page
// broadcasts its height like the course-rules page, with the opening notice
// placed at the top of the document rather than the middle of a tall frame.
async function driveAppEmbed(s, baseUrl) {
  await s.open(new URL('?embed=1', baseUrl).href, '.masthead h1');
  const m = JSON.parse(
    await s.evalJs(`(async () => {
      const heights = [];
      document.addEventListener('nd-cse-audit:height', (e) => heights.push(e.detail.height));
      // The page only reports a CHANGED height, and it finished growing before
      // this listener existed — so change it: open the notice's Details.
      document.querySelector('[data-key="notice.details"]')?.setAttribute('open', '');
      await new Promise((r) => setTimeout(r, 1200));
      return JSON.stringify({
        heights: heights.length,
        eyebrow: !!document.querySelector('.masthead .eyebrow'),
        h1Hidden: document.querySelector('.masthead h1')?.classList.contains('visually-hidden') === true,
        embedClass: document.documentElement.classList.contains('embed'),
        contactInMasthead: !!document.querySelector('.masthead .contact-card'),
        contactInFooter: !!document.querySelector('footer.legal .contact-card'),
        storageNote: !!document.querySelector('.banner.embed-storage'),
        privacy: !!document.querySelector('.legal-privacy'),
        exit: document.querySelector('footer.legal .embed-exit')?.getAttribute('target'),
        coursesTarget: document.querySelector('.masthead .sub a[href="./courses.html"]')?.getAttribute('target'),
        stickyHidden: !document.querySelector('.sticky-score') || getComputedStyle(document.querySelector('.sticky-score')).display === 'none',
      });
    })()`),
  );
  if (m.eyebrow || !m.h1Hidden || !m.embedClass) throw new Error('the self-check tool did not trim its chrome in embed mode: ' + JSON.stringify(m));
  if (m.contactInMasthead || !m.contactInFooter) throw new Error('"Who to contact" should move to the footer in embed mode: ' + JSON.stringify(m));
  if (!m.storageNote) throw new Error('embed mode must tell the student their saved work lives in the frame');
  if (!m.privacy) throw new Error('the FERPA paragraph must survive embed mode — it is the promise the page makes');
  // The masthead's intro (and its course-rules link) is not rendered in embed mode since 2026-09-16 (DGS: no text at the top).
  if (m.exit !== '_top') throw new Error('a link would load a whole page inside the frame: ' + JSON.stringify(m));
  if (m.coursesTarget !== undefined) throw new Error('embed mode must not render the masthead intro: ' + JSON.stringify(m));
  if (m.heights === 0) throw new Error('the self-check tool must broadcast its height in embed mode (DGS 2026-09-16)');
  if (!m.stickyHidden) throw new Error('the bottom score bar must be hidden in embed mode: ' + JSON.stringify(m));
  await s.shot('app-embed');
  console.log('  ?embed=1 on the self-check tool → chrome trimmed, storage note shown, FERPA paragraph kept, height broadcast, score bar hidden');

  await s.open(baseUrl, '.masthead h1');
  const back = JSON.parse(await s.evalJs(`JSON.stringify({ eyebrow: !!document.querySelector('.masthead .eyebrow'), embedClass: document.documentElement.classList.contains('embed'), storageNote: !!document.querySelector('.banner.embed-storage') })`));
  if (!back.eyebrow || back.embedClass || back.storageNote) throw new Error('the self-check tool without ?embed=1 is not the page it was: ' + JSON.stringify(back));
  console.log('  the self-check tool without the parameter is unchanged');
}

// Both pages link the DGS's rules spreadsheet (2026-09-04): in the masthead
// (under the dated line), saying it is accessible by faculty only, and — on the
// self-check page — in the footer as well. The course-rules page's footer copy
// went on 2026-09-18 (trim review P-12): it repeated the masthead's own source
// line word for word, on the page that IS the spreadsheet's public face. The
// link must be the sheet's human address, not a published-CSV one.
async function checkSheetLink(s, page) {
  const found = await s.evalJs(`(() => {
    const sel = 'a[href^="https://docs.google.com/spreadsheets/d/"]';
    const inMast = [...document.querySelectorAll('.masthead ' + sel)];
    const inFoot = [...document.querySelectorAll('footer.legal ' + sel)];
    const text = (a) => a.closest('p, div')?.textContent ?? '';
    return {
      masthead: inMast.length, footer: inFoot.length,
      csv: [...inMast, ...inFoot].some(a => /\\/d\\/e\\/|output=csv/.test(a.href)),
      name: [...inMast, ...inFoot].every(a => a.textContent === 'CSE-Degree-Checking-Rules'),
      facultyOnly: [...inMast, ...inFoot].every(a => /faculty only/.test(text(a))),
      newTab: [...inMast, ...inFoot].every(a => a.target === '_blank' && /noopener/.test(a.rel)),
    };
  })()`);
  const bad = [];
  if (found.masthead !== 1) bad.push(`masthead links: ${found.masthead}`);
  const wantFooter = page === 'courses' ? 0 : 1;
  if (found.footer !== wantFooter) bad.push(`footer links: ${found.footer} (expected ${wantFooter})`);
  if (found.csv) bad.push('a link points at a published-CSV address');
  if (!found.name) bad.push('link text is not the sheet name');
  if (!found.facultyOnly) bad.push('a mention lacks the faculty-only note');
  if (!found.newTab) bad.push('link does not open in a new tab safely');
  if (bad.length) throw new Error(`rules-spreadsheet link on the ${page} page: ${bad.join('; ')}`);
  console.log(`  rules-spreadsheet link present (masthead + footer, faculty-only note) on the ${page} page`);
}

// E2E: the public course-rules list (courses.html) — renders the overview and
// the full table from the same rules, filters work, no student data involved.
export async function driveCourses(s, baseUrl) {
  await s.open(new URL('courses.html', baseUrl).href);
  await s.waitFor(`document.querySelectorAll('.all-courses table.course-rules tbody tr').length > 10`);
  await s.shot('courses-list');
  await checkSheetLink(s, 'courses');
  const count = await s.evalJs(`document.querySelector('.count')?.textContent`);
  console.log('  course list:', count);
  if (!/\d+ of \d+ courses/.test(count ?? '')) throw new Error('course list did not render');
  // (Note rows — the DGS's notes, opened per course since 2026-09-05 — are tbody rows too; count courses only.)
  const before = await s.evalJs(`document.querySelectorAll('.all-courses table.course-rules tbody tr:not(.note-row)').length`);
  await s.evalJs(
    // The core areas and the specialization categories share one "Ph.D.
    // qualifier area" select since 2026-09-18 (trim review P-22); its values
    // carry a prefix so the two Algorithms entries stay apart.
    `const sel=document.querySelector('[data-key="filter.qualifier"]'); sel.value='core:algorithms'; sel.dispatchEvent(new Event('change'))`,
  );
  await s.waitFor(`document.querySelectorAll('.all-courses table.course-rules tbody tr:not(.note-row)').length < ${before}`);
  const after = await s.evalJs(`document.querySelectorAll('.all-courses table.course-rules tbody tr:not(.note-row)').length`);
  console.log(`  core-area filter: ${before} → ${after} rows`);
  if (!(after > 0 && after < before)) throw new Error('core-area filter did not narrow the table');
  await s.shot('courses-filtered');

  // The DGS's notes are the DGS's (2026-09-09): no Notes column, no
  // disclosure, and nothing on the page carries them.
  const noNotes = JSON.parse(await s.evalJs(`JSON.stringify({
    button: !!document.querySelector('.all-courses table.course-rules button.notes'),
    column: [...document.querySelectorAll('.all-courses table.course-rules thead th')].some((th) => /notes/i.test(th.textContent ?? '')),
    legend: /the DGS.s notes on a course/.test(document.body.textContent ?? ''),
  })`));
  if (noNotes.button || noNotes.column || noNotes.legend) throw new Error('the DGS notes are still reachable: ' + JSON.stringify(noNotes));
  console.log('  no Notes column, button or legend entry — the DGS notes stay with the DGS');
  // Clear filters (item 26) drops the core-area filter set above…
  await s.evalJs(`document.querySelector('[data-key="filter.clear"]').click()`);
  await s.waitFor(`document.querySelectorAll('.all-courses table.course-rules tbody tr:not(.note-row)').length > 10`);
  console.log('  Clear filters restores the full list');
  // …and search ignores spacing: "cse60641" finds CSE 60641.
  await s.evalJs(`const q = document.querySelector('[data-key="filter.search"]'); q.value = 'cse60641'; q.dispatchEvent(new Event('input'));`);
  await s.waitFor(`document.querySelectorAll('.all-courses table.course-rules tbody tr:not(.note-row)').length === 1`);
  console.log('  search ignores spacing: "cse60641" → 1 row');
  await s.evalJs(`document.querySelector('[data-key="filter.clear"]').click()`);
  await s.waitFor(`document.querySelectorAll('.all-courses table.course-rules tbody tr:not(.note-row)').length > 10`);

  // Embedded links (DGS 2026-09-16): with the host page named in the query
  // string, the cross-link goes there in the top window; without it, the
  // sibling file.
  {
    await s.open(new URL('courses.html?self_check_url=https%3A%2F%2Fcse.nd.edu%2Fgraduate%2Fself-check%2F', baseUrl).href, '.all-courses table.course-rules');
    const link = JSON.parse(await s.evalJs(`JSON.stringify((() => { const a = [...document.querySelectorAll('a')].find(a => /degree self-check tool/.test(a.textContent)); return { href: a?.getAttribute('href'), target: a?.getAttribute('target') }; })())`));
    if (link.href !== 'https://cse.nd.edu/graduate/self-check/' || link.target !== '_top') throw new Error('embedded cross-link must go to the host page in the top window: ' + JSON.stringify(link));
    await s.open(new URL('courses.html', baseUrl).href, '.all-courses table.course-rules');
    const plain = await s.evalJs(`[...document.querySelectorAll('a')].find(a => /degree self-check tool/.test(a.textContent))?.getAttribute('href')`);
    if (plain !== './index.html') throw new Error('standalone cross-link must be the sibling file: ' + plain);
    console.log('  cross-links: host page in the top window when named, sibling file otherwise');
  }
  // Qualifier-card courses (DGS 2026-09-17): a course offered this semester
  // links to its schedule row; one not offered links to its All-courses row;
  // the hover card names both semesters.
  {
    const q = JSON.parse(await s.evalJs(`JSON.stringify((() => {
      const items = [...document.querySelectorAll('.overview:not(.schedule-overview) a.ov-item')];
      const offered = items.find((a) => a.getAttribute('href').startsWith('#sched-'));
      const other = items.find((a) => !a.getAttribute('href').startsWith('#sched-'));
      const target = (a) => a && !!document.getElementById(a.getAttribute('href').slice(1));
      return { n: items.length, offeredHref: offered?.getAttribute('href') ?? null, offeredTargetExists: target(offered), otherTargetExists: target(other) };
    })())`));
    if (q.n === 0) throw new Error('no qualifier-card courses rendered');
    if (q.offeredHref && !q.offeredTargetExists) throw new Error('a qualifier link to the schedule must resolve: ' + q.offeredHref);
    if (q.otherTargetExists === false) throw new Error('a qualifier link to All courses must resolve');
    // The offering shows as a tag on the course, not in the hover card (DGS 2026-09-17, second pass).
    const tagged = await s.evalJs(`document.querySelectorAll('.overview:not(.schedule-overview) a.ov-item .pill.sched-now, .overview:not(.schedule-overview) a.ov-item .pill.sched-next').length`);
    if (q.offeredHref && tagged === 0) throw new Error('an offered qualifier course must carry a semester tag');
    const hover = await s.evalJs(`(() => { const a = document.querySelector('.overview:not(.schedule-overview) a.ov-item'); a.dispatchEvent(new Event('mouseenter')); const t = document.querySelector('#course-pop').textContent; a.dispatchEvent(new Event('mouseleave')); return t; })()`);
    if (/Offered (Fall|Spring) \d{4}/.test(hover)) throw new Error('the hover card must not show the offering status: ' + hover.slice(0, 200));
    console.log('  qualifier cards: links → schedule row when offered (' + (q.offeredHref ?? 'none offered') + '), else All courses; ' + tagged + ' semester tag(s)');

    // The review of 2026-09-18, in the browser. Each of these was a defect the
    // page shipped with: the key promising a marker no course carries (R-8),
    // retired courses missing from the cards the engine still counts them for
    // (B-3), the ADGS pill in the DGS colour inside the column guide (B-13),
    // the rule-version note written and never shown (B-1), and blanks sorting
    // to the top when a column is reversed (B-8).
    const rv = JSON.parse(await s.evalJs(`JSON.stringify((() => {
      const key = document.querySelector('.sched-key');
      const cards = [...document.querySelectorAll('.overview:not(.schedule-overview) .ov-card')];
      const legend = document.querySelector('details.legend');
      if (legend) legend.open = true;
      const legendPills = [...document.querySelectorAll('details.legend li .pill')].map((p) => p.textContent.trim() + '=' + p.className);
      return {
        keyText: key?.textContent ?? '',
        keyNowPills: key ? key.querySelectorAll('.sched-now').length : 0,
        keyNextPills: key ? key.querySelectorAll('.sched-next').length : 0,
        anyNextTag: document.querySelectorAll('.overview:not(.schedule-overview) .pill.sched-next').length,
        retiredInCards: document.querySelectorAll('.overview:not(.schedule-overview) a.ov-item .pill.retired').length,
        emptyCards: cards.filter((c) => /No current course is listed here/.test(c.textContent)).length,
        cardText: cards.map((c) => c.textContent).join(' '),
        adgsInLegend: legendPills.filter((x) => /^With ADGS approval=/.test(x)),
        // A character class, not a backslash escape: inside this template
        // literal \* would reach the page as a bare *, i.e. "zero or more spaces".
        starMarks: (document.querySelector('.overview:not(.schedule-overview)').textContent.match(/ [*]/g) ?? []).length,
        starContext: (document.querySelector('.overview:not(.schedule-overview)').textContent.match(/.{0,40} [*].{0,10}/g) ?? []).slice(0, 2),
        citeCursor: getComputedStyle(document.querySelector('.courses-page .cite')).cursor,
      };
    })())`));
    // The key must not advertise a semester with no tags anywhere on the page.
    if (rv.keyNextPills > 0 && rv.anyNextTag === 0) throw new Error('the key promises a next-semester tag that no course carries: ' + rv.keyText);
    if (rv.keyNowPills === 0 && rv.keyNextPills === 0 && /offered/.test(rv.keyText)) throw new Error('key line without pills: ' + rv.keyText);
    // Retired courses are NOT in these cards (DGS 2026-09-18, reversing his
    // answer of an hour before), and an empty card must not claim that nothing
    // is assigned when a retired course is.
    if (rv.retiredInCards > 0) throw new Error('a retired course is listed in a qualifying-examination card — the DGS asked for current courses only');
    if (/No course assigned yet/.test(rv.cardText)) throw new Error('an empty qualifier card must not say "No course assigned yet" — a retired course may be assigned');
    if (rv.adgsInLegend.some((x) => /pill approval(?!-adgs)/.test(x))) throw new Error('the ADGS pill in the column guide is painted with the DGS class: ' + JSON.stringify(rv.adgsInLegend));
    if (rv.starMarks > 0) throw new Error('the unexplained " *" marker is back in the qualifier cards: ' + JSON.stringify(rv.starContext));
    if (rv.citeCursor === 'pointer') throw new Error('the § citations on this page are labels, not buttons — they must not offer a hand cursor');
    console.log('  review 2026-09-18: key ' + JSON.stringify(rv.keyText.slice(0, 64)) + '; retired in cards ' + rv.retiredInCards + ' (must be 0); ADGS pill ' + JSON.stringify(rv.adgsInLegend));

    // Blanks stay at the END when a column is reversed (B-8).
    const blanks = JSON.parse(await s.evalJs(`JSON.stringify((() => {
      const read = () => [...document.querySelectorAll('.all-courses tbody tr')].map((tr) => tr.cells[5]?.textContent ?? '');
      const press = () => document.querySelector('[data-key="sort.core"]').click();
      press();
      const asc = read();
      press();
      const desc = read();
      press();
      return { ascFirst: asc[0], ascLast: asc[asc.length - 1], descFirst: desc[0], descLast: desc[desc.length - 1] };
    })())`));
    if (blanks.descFirst === '—') throw new Error('descending sort put the blank rows first: ' + JSON.stringify(blanks));
    if (blanks.ascFirst === '—') throw new Error('ascending sort put the blank rows first: ' + JSON.stringify(blanks));
    console.log('  sort: blanks last in both directions (' + blanks.ascFirst + '…' + blanks.ascLast + ' / ' + blanks.descFirst + '…' + blanks.descLast + ')');

    // A link someone was SENT, opened cold — the page has to re-apply the
    // fragment itself, because the browser resolved it while this page was
    // still the loading card (B-7).
    const deep = JSON.parse(await s.evalJs(`JSON.stringify([...document.querySelectorAll('.all-courses tbody tr')].slice(0, 1).map((tr) => tr.id))`));
    if (deep[0]) {
      // Leave this document first, so the fragment navigation is a real load —
      // which is the case that was broken: a link someone was SENT. Opening
      // `courses.html#x` from `courses.html` is a same-document scroll, and
      // `:target` handles that one natively.
      await s.open(baseUrl);
      await s.open(new URL('courses.html#' + deep[0], baseUrl).href, '.all-courses table.course-rules');
      // The page re-applies the fragment a frame (or 120 ms) after render, so
      // wait for the mark rather than racing it.
      await s.waitFor(`document.querySelector('.deep-linked')`, 5000).catch(() => {});
      const landed = JSON.parse(await s.evalJs(`JSON.stringify((() => {
        const t = document.getElementById(${JSON.stringify(deep[0])});
        return { id: ${JSON.stringify(deep[0])}, scrollY: Math.round(window.scrollY), marked: !!document.querySelector('.deep-linked'), rowExists: !!t, rowTop: t ? Math.round(t.getBoundingClientRect().top + window.scrollY) : null, nav: performance.getEntriesByType('navigation')[0]?.type, href: location.href, rows: document.querySelectorAll('.all-courses tbody tr').length };
      })())`));
      if (!landed.marked) throw new Error('a cold deep link did not mark its row: ' + JSON.stringify(landed));
      console.log('  cold deep link #' + deep[0] + ' → scrollY ' + landed.scrollY + ', row highlighted');
      await s.open(new URL('courses.html', baseUrl).href, '.all-courses table.course-rules');
    }
  }

  // Two schedule cards (DGS 2026-09-09), which say "Not released yet." while
  // the sheet's offered_now / offered_next are blank rather than showing an
  // empty list that would read as "nothing runs".
  const cards = JSON.parse(await s.evalJs(`JSON.stringify((() => {
    const sec = document.querySelector('.schedule-overview');
    if (!sec) return { present: false };
    const cs = [...sec.querySelectorAll('.ov-card')];
    return {
      present: true,
      headings: cs.map((c) => c.querySelector('h3')?.textContent ?? ''),
      bodies: cs.map((c) => (c.textContent ?? '').replace(c.querySelector('h3')?.textContent ?? '', '').trim().slice(0, 60)),
      // The cards hold a table of courses since 2026-09-09, not a plain list.
      items: cs.map((c) => c.querySelectorAll('tbody tr').length),
    };
  })())`));
  if (!cards.present) throw new Error('the two "On the schedule" cards are missing');
  if (cards.headings.length !== 2) throw new Error('expected two schedule cards: ' + JSON.stringify(cards.headings));
  if (!/^Offered this semester — /.test(cards.headings[0]) || !/^Offered next semester — /.test(cards.headings[1])) {
    throw new Error('schedule card headings: ' + JSON.stringify(cards.headings));
  }
  for (let i = 0; i < 2; i++) {
    // Either the sheet has spoken and the card lists courses (or says none is
    // listed), or it has not and the card says so — never a bare empty card.
    // "Not released yet" became "The rules sheet does not list <term> yet" on
    // 2026-09-18 (review R-14: the old phrasing blamed the registrar for a
    // sheet nobody had filled in), and a card with only a handful of answers
    // says how many rather than "no course is listed" (R-9).
    if (cards.items[i] === 0 && !/does not list .* yet|No course is listed|marked for .* so far/.test(cards.bodies[i])) {
      throw new Error(`schedule card ${i + 1} is empty without saying why: ${JSON.stringify(cards.bodies[i])}`);
    }
  }
  console.log('  schedule cards:', cards.headings.map((h, i) => `${h} (${cards.items[i] > 0 ? cards.items[i] + ' courses' : cards.bodies[i]})`).join(' | '));
  // A card may only ever list courses under a semester the row itself has
  // dated (DGS 2026-09-09; per row by `last_offered` since 2026-09-14): the
  // headings come from today, the columns do not. Fresh rows are listed;
  // stale or undated ones are left out and COUNTED in a "not shown" line, so
  // the two can coexist — but nothing listed and no reason given never can.
  const dated = JSON.parse(await s.evalJs(`JSON.stringify((() => {
    const sec = document.querySelector('.schedule-overview');
    const text = sec.textContent ?? '';
    return { listed: [...sec.querySelectorAll('.ov-card')].some((c) => c.querySelector('tbody tr')), refused: /not shown/.test(text) };
  })())`));
  if (!dated.listed && !dated.refused && !/does not list .* yet/.test(await s.evalJs(`document.querySelector('.schedule-overview').textContent`))) {
    throw new Error('the schedule cards show nothing and give no reason');
  }

  // The schedule filter (DGS 2026-09-09) appears only once the sheet's
  // offered_now / offered_next columns say something, so the check adapts to
  // whichever the live sheet currently is.
  const sched = JSON.parse(await s.evalJs(`JSON.stringify((() => {
    const sel = document.querySelector('[data-key="filter.offered"]');
    return sel ? { present: true, options: [...sel.options].map((o) => o.value), labels: [...sel.options].map((o) => o.textContent) } : { present: false };
  })())`));
  if (!sched.present) {
    console.log('  schedule filter: not shown — no course in the sheet carries offered_now/offered_next yet');
  } else {
    // A semester the sheet has not recorded is not offered as a choice, so the
    // control may hold "now", "next" or both — never neither, or it would not
    // be on the page at all.
    if (sched.options[0] !== '' || sched.options.length < 2 || sched.options.slice(1).some((o) => o !== 'now' && o !== 'next')) {
      throw new Error('schedule filter options: ' + JSON.stringify(sched.options));
    }
    if (!sched.labels.slice(1).every((l) => /Offered (this|next) semester \(/.test(l))) {
      throw new Error('the schedule options must name their semesters: ' + JSON.stringify(sched.labels));
    }
    const before = await s.evalJs(`document.querySelectorAll('.all-courses table.course-rules tbody tr:not(.note-row)').length`);
    await s.evalJs(`(() => { const sel = document.querySelector('[data-key="filter.offered"]'); sel.value = 'now'; sel.dispatchEvent(new Event('change')); })()`);
    await s.waitFor(`document.querySelectorAll('.all-courses table.course-rules tbody tr:not(.note-row)').length !== ${before}`);
    const after = await s.evalJs(`document.querySelectorAll('.all-courses table.course-rules tbody tr:not(.note-row)').length`);
    if (!(after > 0 && after < before)) throw new Error(`the schedule filter did not narrow the table (${before} → ${after})`);
    // The address is written on a 250 ms trailing timer since 2026-09-18
    // (review B-33: Safari throttles history writes and stopped following the
    // page altogether), so wait for it rather than reading it in the same tick.
    await s.waitFor(`/offered=now/.test(window.location.search)`, 3000).catch(() => {});
    if (!/offered=now/.test(await s.evalJs(`window.location.search`))) throw new Error('the schedule filter must reach the address bar');
    console.log(`  schedule filter: ${before} → ${after} rows offered this semester, and the URL carries it`);
    await s.evalJs(`document.querySelector('[data-key="filter.clear"]').click()`);
    await s.waitFor(`document.querySelectorAll('.all-courses table.course-rules tbody tr:not(.note-row)').length > 10`);
  }

  // Specialization categories (DGS 2026-09-08): "Listed under every category"
  // is gone as a sixth category, a course listed under several categories
  // stands in EACH of their cards, and the note above them says it can fill
  // only one. A blank Specialization cell sorts LAST, not first.
  const spec = JSON.parse(await s.evalJs(`JSON.stringify((() => {
    const sel = document.querySelector('[data-key="filter.qualifier"]');
    const opts = [...sel.options].map((o) => o.value.replace(/^(core|cat):/, ''));
    // The specialization cards are the qualifier section's grid — by class, not by position (the sections were reordered 2026-09-16).
    const cards = [...document.querySelectorAll('.overview:not(.schedule-overview) .ov-grid')].pop();
    const headings = [...cards.querySelectorAll('.ov-card h3')].map((h) => h.textContent.trim());
    const inEvery = headings.every((_, i) => cards.querySelectorAll('.ov-card')[i].textContent.includes('CSE 60876'));
    const note = [...document.querySelectorAll('.overview p')].map((p) => p.textContent).find((t) => /fill only/.test(t)) ?? '';
    return { opts, headings, inEvery, note };
  })())`));
  if (spec.opts.includes('any-listed')) throw new Error('the "Listed under every category" filter value is still offered');
  if (spec.headings.length !== 5) throw new Error('expected the five real specialization cards, got ' + JSON.stringify(spec.headings));
  if (!spec.inEvery) throw new Error('a course listed under every category must appear in every card: ' + JSON.stringify(spec.headings));
  // "never several" restated "only one" and went on 2026-09-18 (trim review
  // P-3); the rule it emphasised is what must still be there.
  if (!/can fill only/.test(spec.note)) throw new Error('the "fills only one category" note is missing: ' + spec.note);
  console.log('  specialization cards:', spec.headings.join(', '), '— the flexible course is in each, with the "only one" note');
  await s.evalJs(`(() => { const sel = document.querySelector('[data-key="filter.sort"]'); sel.value = 'category'; sel.dispatchEvent(new Event('change')); })()`);
  await s.waitFor(`document.querySelectorAll('.all-courses table.course-rules tbody tr:not(.note-row)').length > 10`);
  const firstSpec = await s.evalJs(`document.querySelector('.all-courses table.course-rules tbody tr:not(.note-row) td[data-label^="Specialization"]')?.textContent.trim()`);
  if (!firstSpec || firstSpec === '—') throw new Error('sorting by Specialization must put the rows WITH a category first, got: ' + JSON.stringify(firstSpec));
  console.log('  sort by Specialization → first row is', JSON.stringify(firstSpec) + ', blanks last');
  await s.evalJs(`document.querySelector('[data-key="filter.clear"]').click()`);
  await s.waitFor(`document.querySelectorAll('.all-courses table.course-rules tbody tr:not(.note-row)').length > 10`);

  // Filters live in the URL (2026-09-05, item 29) and a view picks the columns
  // (item 30): open a shared link, check what it selected, then change a
  // filter and check the address bar followed.
  await s.open(new URL('courses.html?view=mscse&core=algorithms', baseUrl).href, '.all-courses table.course-rules');
  const shared = JSON.parse(await s.evalJs(`JSON.stringify({ view: document.querySelector('[data-key="filter.view"]').value, core: document.querySelector('[data-key="filter.qualifier"]').value, program: document.querySelector('[data-key="filter.program"]').value, hiddenHeaders: document.querySelectorAll('.all-courses table.course-rules thead th.col-hidden').length, rows: document.querySelectorAll('.all-courses table.course-rules tbody tr:not(.note-row)').length })`));
  if (shared.view !== 'mscse' || shared.core !== 'core:algorithms') throw new Error('shared link did not select the view/filters: ' + JSON.stringify(shared));
  // The view picks the COLUMNS and must not narrow the rows (trim review P-19):
  // a shared link that names only a view leaves every course in the table.
  if (shared.program !== 'all') throw new Error('the view must not pre-set the Program filter: ' + JSON.stringify(shared));
  if (shared.hiddenHeaders !== 3) throw new Error('the M.S. view should hide 3 columns, hid ' + shared.hiddenHeaders);
  await s.evalJs(`(() => { const q = document.querySelector('[data-key="filter.search"]'); q.value = 'algorithms'; q.dispatchEvent(new Event('input')); })()`);
  await s.waitFor(`/q=algorithms/.test(window.location.search)`, 3000).catch(() => {});
  const search = await s.evalJs(`window.location.search`);
  if (!/q=algorithms/.test(search) || !/view=mscse/.test(search)) throw new Error('the address bar did not follow the filters: ' + search);
  console.log(`  shared link → view/filters applied (${shared.rows} rows, 3 columns hidden); filters written back to the URL (${search})`);

  await checkPrintColumns(s, baseUrl, '');
  await checkPrintColumns(s, baseUrl, '?embed=1');
  await driveCoursesEmbed(s, baseUrl);
}

// E2E: what a student actually gets when they print the course list
// (2026-09-16). The print block used to carry `th:last-child { display: none }`
// — written when the last column was the DGS's notes, which this page stopped
// showing on 2026-09-09. Unscoped, it went on hiding the last HEADER of every
// table on the page while the cells under it still printed: "DGS reviewed" on
// the main table, "Specialization" on each schedule card. A printed column with
// no heading is the bug this pins.
async function checkPrintColumns(s, baseUrl, query) {
  await s.open(new URL('courses.html' + query, baseUrl).href, '.all-courses table.course-rules');
  await s.send('Emulation.setEmulatedMedia', { media: 'print' });
  await s.evalJs('new Promise(r => requestAnimationFrame(() => setTimeout(r, 200)))');
  const tables = JSON.parse(
    await s.evalJs(`JSON.stringify([...document.querySelectorAll('table.course-rules')].map((t) => {
      const shown = (e) => getComputedStyle(e).display !== 'none';
      const heads = [...t.querySelectorAll('thead tr:last-child th')];
      const row = t.querySelector('tbody tr:not(.empty-row)');
      const cells = row ? [...row.children] : [];
      const last = heads[heads.length - 1];
      return {
        table: t.classList.contains('schedule-table') ? 'schedule card' : 'all courses',
        visibleHeaders: heads.filter(shown).length,
        visibleCells: cells.filter(shown).length,
        lastHeader: (last ? last.getAttribute('abbr') || last.textContent || '' : '').trim().slice(0, 28),
        lastHeaderShown: last ? shown(last) : null,
      };
    }))`),
  );
  // The card is text on paper, not a boxed aside — on BOTH pages. Embed mode
  // moves it out of the masthead and restyles it, which outranks a print rule
  // scoped to `.masthead`; without the embed selector the framed page printed a
  // bordered card (measured 2026-09-16).
  const card = JSON.parse(
    await s.evalJs(`(() => {
      const c = document.querySelector('.contact-card');
      if (!c) return JSON.stringify({ missing: true });
      const cs = getComputedStyle(c);
      return JSON.stringify({ border: cs.borderTopWidth, padding: cs.paddingTop });
    })()`),
  );
  await s.send('Emulation.setEmulatedMedia', { media: '' });
  await s.evalJs('new Promise(r => requestAnimationFrame(() => setTimeout(r, 150)))');
  if (!tables.length) throw new Error('no course tables found under print media');
  for (const t of tables) {
    if (!t.lastHeaderShown) throw new Error(`printing hides the "${t.lastHeader}" header of the ${t.table} table while its cells still print`);
    if (t.visibleHeaders !== t.visibleCells) {
      throw new Error(`the ${t.table} table prints ${t.visibleCells} columns under ${t.visibleHeaders} headers`);
    }
  }
  if (card.missing) throw new Error('the contact card is not on the page at all');
  if (card.border !== '0px' || card.padding !== '0px') throw new Error(`the contact card prints as a box (border ${card.border}, padding ${card.padding})`);
  console.log(`  printing courses.html${query || ' (plain)'}: ${tables.length} tables, every column keeps its heading (last: ${[...new Set(tables.map((t) => t.lastHeader))].join(', ')}); contact card unboxed`);
}

// E2E: ?embed=1 — the course-rules page inside someone else's page
// (sites.nd.edu WordPress, DGS 2026-09-16). Four things have to hold: the
// chrome the host already supplies is gone, the flag survives the page's own
// URL rewriting, the height the page broadcasts tracks the content both up and
// down, and a parent origin that is not on the allowlist is told nothing.
async function driveCoursesEmbed(s, baseUrl) {
  await s.open(new URL('courses.html?embed=1', baseUrl).href, '.all-courses table.course-rules');
  const trimmed = JSON.parse(
    await s.evalJs(`JSON.stringify({
      eyebrow: !!document.querySelector('.masthead .eyebrow'),
      h1Hidden: document.querySelector('.masthead h1')?.classList.contains('visually-hidden') === true,
      h1Text: document.querySelector('.masthead h1')?.textContent,
      embedClass: document.documentElement.classList.contains('embed'),
      contactInMasthead: !!document.querySelector('.masthead .contact-card'),
      contactAtEnd: !!document.querySelector('main .contact-card'),
      exit: document.querySelector('.embed-exit')?.getAttribute('target'),
      exitHref: document.querySelector('.embed-exit')?.getAttribute('href'),
      selfCheckTarget: document.querySelector('.masthead .sub a[href="./index.html"]')?.getAttribute('target'),
      rulesDate: /last updated|updated after|effective/i.test(document.querySelector('.masthead .effective')?.textContent ?? ''),
      search: window.location.search,
    })`),
  );
  if (trimmed.eyebrow) throw new Error('embed mode still renders the ND eyebrow — the host page already has one');
  if (!trimmed.h1Hidden) throw new Error('embed mode should hide the <h1> visually, not keep it on screen');
  if (!trimmed.h1Text) throw new Error('embed mode dropped the <h1> entirely — screen readers still need it');
  if (!trimmed.embedClass) throw new Error('<html> did not get the `embed` class');
  if (trimmed.contactInMasthead || !trimmed.contactAtEnd) throw new Error('"Who to contact" should move from the masthead to the end of the page: ' + JSON.stringify(trimmed));
  if (trimmed.exit !== '_top') throw new Error('"Open the full page" must leave the frame (target="_top"), got ' + trimmed.exit);
  if (/embed=1/.test(trimmed.exitHref ?? '')) throw new Error('"Open the full page" still carries embed=1: ' + trimmed.exitHref);
  // The masthead's intro, its self-check link and the dated line are not rendered in embed mode since 2026-09-16 (DGS: no text at the top).
  if (trimmed.selfCheckTarget !== undefined) throw new Error('embed mode must not render the masthead intro: ' + JSON.stringify(trimmed));
  if (trimmed.rulesDate) throw new Error('embed mode must not render the dated line either (DGS 2026-09-16: no text at the top)');
  // The page rewrites its own URL from the filters on first render; embed=1 is
  // not a filter and used to be dropped, which lost the mode on any reload.
  if (!/embed=1/.test(trimmed.search)) throw new Error('embed=1 did not survive the filter URL rewrite: ' + trimmed.search);
  console.log('  ?embed=1 → no ND eyebrow, <h1> for screen readers only, contacts at the end, exit link leaves the frame, flag kept in the URL');

  // The height message, watched through the DOM event the sender also fires
  // (src/ui/embed.ts) — same numbers the parent receives, observable without a
  // parent frame. It must FALL when the table is filtered down: sizing a frame
  // from scrollHeight instead would leave white space nothing could reclaim.
  await s.evalJs(`(() => { window.__heights = []; document.addEventListener('nd-cse-audit:height', (e) => window.__heights.push(e.detail.height)); })()`);
  await s.evalJs(`(() => { const q = document.querySelector('[data-key="filter.search"]'); q.value = 'cse60641'; q.dispatchEvent(new Event('input')); })()`);
  await s.waitFor(`window.__heights.length > 0`);
  const shrunk = JSON.parse(await s.evalJs(`JSON.stringify({ heights: window.__heights, docH: Math.ceil(document.documentElement.getBoundingClientRect().height) })`));
  const reported = shrunk.heights[shrunk.heights.length - 1];
  if (Math.abs(reported - shrunk.docH) > 8) throw new Error(`the broadcast height (${reported}) does not match the document (${shrunk.docH})`);
  console.log(`  filtering to one row shrank the broadcast height to ${reported} px, matching the document`);

  // The allowlist is the whole access control: a page framed by an origin that
  // is not one of the three ND hosts is told nothing at all. The preview server
  // (http://localhost:4273) is not on it, so framing the page from here must
  // produce silence — if this ever starts passing messages, the targetOrigin
  // has been loosened to '*'.
  await s.open(new URL('courses.html', baseUrl).href, '.all-courses table.course-rules');
  const heard = JSON.parse(
    await s.evalJs(`(async () => {
      const got = [];
      window.addEventListener('message', (e) => { if (e.data && typeof e.data === 'object' && String(e.data.type ?? '').startsWith('nd-cse-audit:')) got.push(e.data.type); });
      const frame = document.createElement('iframe');
      frame.style.cssText = 'width:700px;height:900px;border:0';
      frame.src = 'courses.html?embed=1';
      document.body.append(frame);
      await new Promise((r) => frame.addEventListener('load', r, { once: true }));
      // Wait for the framed page to actually render rather than for a fixed
      // four seconds: the inner page fetches the live sheet from Google, which
      // occasionally takes longer than that and failed this check for reasons
      // having nothing to do with what it tests (2026-09-18). Poll up to 25 s,
      // then give the settling messages a moment of quiet.
      const deadline = Date.now() + 25000;
      const rows = () => frame.contentDocument?.querySelectorAll('.all-courses table.course-rules tbody tr').length ?? 0;
      while (rows() < 10 && Date.now() < deadline) await new Promise((r) => setTimeout(r, 250));
      await new Promise((r) => setTimeout(r, 1500));
      const inner = frame.contentDocument;
      const out = { got, framedRows: inner.querySelectorAll('.all-courses table.course-rules tbody tr').length, framedEyebrow: !!inner.querySelector('.masthead .eyebrow') };
      frame.remove();
      return JSON.stringify(out);
    })()`),
  );
  if (heard.framedRows < 10) throw new Error('the framed page did not render (' + heard.framedRows + ' rows) — the silence below would prove nothing');
  if (heard.framedEyebrow) throw new Error('the framed page rendered the full-page chrome');
  if (heard.got.length > 0) throw new Error('an origin that is NOT on the allowlist received ' + heard.got.join(', ') + ' — targetOrigin has been loosened');
  console.log(`  a parent on an origin outside the allowlist receives nothing (frame rendered ${heard.framedRows} rows, 0 messages)`);

  // What it WOULD have sent, and to whom. The frame is same-origin here, so its
  // `window.parent` is this page: replacing this page's postMessage records
  // every call the sender makes, targetOrigin and all, without the browser's
  // origin check in the way. That is the only way to see the payloads — and it
  // also pins the three ND origins at the point of the call, not just in the
  // exported constant.
  const sent = JSON.parse(
    await s.evalJs(`(async () => {
      window.__posted = [];
      const original = window.postMessage;
      window.postMessage = function (msg, origin) { window.__posted.push({ type: msg && msg.type, origin, msg }); };
      try {
        const frame = document.createElement('iframe');
        frame.style.cssText = 'width:700px;height:900px;border:0';
        frame.src = 'courses.html?embed=1';
        document.body.append(frame);
        await new Promise((r) => frame.addEventListener('load', r, { once: true }));
        await new Promise((r) => setTimeout(r, 4000));
        const inner = frame.contentDocument;
        const chip = inner.querySelector('.ov-item[href^="#"]');
        const chipHref = chip ? chip.getAttribute('href') : null;
        if (chip) chip.click();
        await new Promise((r) => setTimeout(r, 400));
        const out = {
          chipHref,
          heightOrigins: [...new Set(window.__posted.filter((p) => p.type === 'nd-cse-audit:height').map((p) => p.origin))],
          heights: window.__posted.filter((p) => p.type === 'nd-cse-audit:height').map((p) => p.msg.height),
          scrolls: window.__posted.filter((p) => p.type === 'nd-cse-audit:scrollto').map((p) => p.msg.offset),
          scrollOrigins: [...new Set(window.__posted.filter((p) => p.type === 'nd-cse-audit:scrollto').map((p) => p.origin))],
          otherTypes: [...new Set(window.__posted.map((p) => p.type))].filter((t) => t !== 'nd-cse-audit:height' && t !== 'nd-cse-audit:scrollto'),
        };
        frame.remove();
        return JSON.stringify(out);
      } finally {
        window.postMessage = original;
      }
    })()`),
  );
  const expected = ['https://sites.nd.edu', 'https://cse.nd.edu', 'https://www.nd.edu'];
  if (JSON.stringify(sent.heightOrigins) !== JSON.stringify(expected)) throw new Error('height went to the wrong origins: ' + JSON.stringify(sent.heightOrigins));
  if (!sent.heights.length) throw new Error('the framed page never reported a height');
  if (sent.otherTypes.length) throw new Error('an unexpected message type was sent: ' + sent.otherTypes.join(', '));
  // A frame sized to its own content cannot scroll, so the page's own
  // "jump to CSE 60641" chips ask the parent to scroll instead.
  if (!sent.chipHref) throw new Error('no overview chip to click — the scroll relay is untested');
  // One click, one offset — addressed to each allowed origin in turn, exactly
  // as the height is, because only the matching one is ever delivered.
  if (sent.scrolls.length !== expected.length || new Set(sent.scrolls).size !== 1 || !(sent.scrolls[0] > 0)) {
    throw new Error(`clicking ${sent.chipHref} should ask each allowed parent to scroll to one offset, got ${JSON.stringify(sent.scrolls)}`);
  }
  if (JSON.stringify(sent.scrollOrigins) !== JSON.stringify(expected)) throw new Error('the scroll request went to the wrong origins: ' + JSON.stringify(sent.scrollOrigins));
  console.log(`  every message goes only to ${expected.join(', ')}; clicking ${sent.chipHref} asks the parent to scroll to ${sent.scrolls[0]} px`);

  await driveWordPressSnippet(s, baseUrl);

  // …and the plain page is unchanged (acceptance criterion 2).
  const plain = JSON.parse(await s.evalJs(`JSON.stringify({ eyebrow: !!document.querySelector('.masthead .eyebrow'), h1Hidden: document.querySelector('.masthead h1')?.classList.contains('visually-hidden') === true, contactInMasthead: !!document.querySelector('.masthead .contact-card'), embedClass: document.documentElement.classList.contains('embed'), exit: !!document.querySelector('.embed-exit') })`));
  if (!plain.eyebrow || plain.h1Hidden || !plain.contactInMasthead || plain.embedClass || plain.exit) {
    throw new Error('courses.html without ?embed=1 is not the page it was: ' + JSON.stringify(plain));
  }
  console.log('  courses.html without the parameter is unchanged');
}

// E2E: the WordPress half — docs/wordpress-footer-snippet.html, the text the
// DGS pastes into the "Head, Footer and Post Injections" footer field. Nothing
// else tests it, and a mistake there is invisible (the frame just never
// resizes). The script is run here with its APP_ORIGIN pointed at the preview
// server, and then fed hand-made MessageEvents: one good, and four that must be
// ignored. `new MessageEvent(...)` is the only way to control `origin` and
// `source`, which is exactly what the two security checks read.
async function driveWordPressSnippet(s, baseUrl) {
  const origin = new URL(baseUrl).origin;
  const script = wordPressSnippetScript().replace('https://tjungnd.github.io', origin);
  await s.open(new URL('courses.html', baseUrl).href, '.all-courses table.course-rules');
  const r = JSON.parse(
    await s.evalJs(`(async () => {
      ${script}
      const frame = document.createElement('iframe');
      // The snippet finds its frames by the repository name in the src, which
      // the preview server's flat path has not got; the parameter puts it there
      // (the page ignores parameters it does not know).
      frame.src = 'courses.html?embed=1&e2e=ND-CSE-Degree-Requirement-Progress-Checking';
      frame.style.cssText = 'width:700px;height:900px;border:0';
      document.body.append(frame);
      await new Promise((r) => frame.addEventListener('load', r, { once: true }));
      const other = document.createElement('iframe');
      other.src = 'about:blank';
      document.body.append(other);
      await new Promise((r) => setTimeout(r, 200));

      const fire = (data, o, src) => window.dispatchEvent(new MessageEvent('message', { data: data, origin: o, source: src }));
      const height = (h) => ({ type: 'nd-cse-audit:height', height: h });
      const reset = () => { frame.style.height = '900px'; };
      const out = {};

      reset(); fire(height(4321), ${JSON.stringify(origin)}, frame.contentWindow);
      out.accepted = frame.style.height;
      reset(); fire(height(4321), 'https://evil.example', frame.contentWindow);
      out.wrongOrigin = frame.style.height;
      reset(); fire(height(4321), ${JSON.stringify(origin)}, window);
      out.wrongSource = frame.style.height;
      reset(); fire(height(4321), ${JSON.stringify(origin)}, other.contentWindow);
      out.otherFrame = frame.style.height;
      reset(); fire(height(999999), ${JSON.stringify(origin)}, frame.contentWindow);
      out.tooTall = frame.style.height;
      reset(); fire(height(12), ${JSON.stringify(origin)}, frame.contentWindow);
      out.tooShort = frame.style.height;
      reset(); fire({ type: 'nd-cse-audit:somethingelse', height: 4321 }, ${JSON.stringify(origin)}, frame.contentWindow);
      out.unknownType = frame.style.height;
      reset(); fire('a plain string', ${JSON.stringify(origin)}, frame.contentWindow);
      out.notAnObject = frame.style.height;

      // …and the scroll request, which moves the window rather than the frame.
      const realScrollTo = window.scrollTo;
      const scrolls = [];
      window.scrollTo = (opts) => { scrolls.push(Math.round(opts && opts.top)); };
      fire({ type: 'nd-cse-audit:scrollto', offset: 500 }, ${JSON.stringify(origin)}, frame.contentWindow);
      fire({ type: 'nd-cse-audit:scrollto', offset: 500 }, 'https://evil.example', frame.contentWindow);
      fire({ type: 'nd-cse-audit:scrollto', offset: -5 }, ${JSON.stringify(origin)}, frame.contentWindow);
      window.scrollTo = realScrollTo;
      out.scrolls = scrolls;

      frame.remove(); other.remove();
      return JSON.stringify(out);
    })()`),
  );
  if (r.accepted !== '4321px') throw new Error('the WordPress snippet ignored a valid height message: ' + JSON.stringify(r));
  const mustIgnore = ['wrongOrigin', 'wrongSource', 'otherFrame', 'tooTall', 'tooShort', 'unknownType', 'notAnObject'];
  for (const k of mustIgnore) {
    if (r[k] !== '900px') throw new Error(`the WordPress snippet acted on a message it must ignore (${k} → ${r[k]})`);
  }
  if (r.scrolls.length !== 1) throw new Error('the snippet scrolled for a message it must ignore: ' + JSON.stringify(r.scrolls));
  console.log(`  the WordPress snippet, run verbatim from docs/: accepts a good height (${r.accepted}), ignores ${mustIgnore.join(', ')}, scrolls once`);
}
