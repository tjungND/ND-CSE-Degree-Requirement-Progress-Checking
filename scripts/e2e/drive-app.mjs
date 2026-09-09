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
      dialStroke: document.querySelector('.dial circle:nth-of-type(2)')?.getAttribute('stroke') ?? '',
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
  if ((await s.evalJs(`document.querySelector('.dial circle:nth-of-type(2)')?.getAttribute('stroke')`)) === 'var(--bad)') {
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
  if (!gaDlg.title.startsWith('Processing request') || !gaDlg.to[0].startsWith('To: Graduate Program Administrator') || !(gaDlg.to[1] ?? '').startsWith('Cc: Director of Graduate Studies') || !gaDlg.subject.startsWith('Subject: Processing request (degree self-check) — Ph.D., entered Fall 2026') || !gaDlg.text.includes('Dear Grad Admin,')) throw new Error('Grad Admin dialog: ' + JSON.stringify(gaDlg));
  // Four numbered steps (2026-09-06 evening): paste, attach the ORIGINAL transcripts, attach the saved self-check file, send.
  const gaSteps = await s.evalJs(`[...document.querySelectorAll('dialog.copy-check ol.copy-steps li')].map(li => (li.querySelector('strong') ? '*' : '') + li.textContent)`);
  console.log('  Grad Admin dialog steps:', JSON.stringify(gaSteps.map((t) => t.slice(0, 70))));
  if (gaSteps.length !== 4 || !gaSteps[1].startsWith('*Attach your ORIGINAL transcripts') || !gaSteps[2].includes('cse-degree-audit-phd.json') || !/^Send it\./.test(gaSteps[3])) throw new Error('Grad Admin dialog steps: ' + JSON.stringify(gaSteps));
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

  const summary = await s.evalJs(
    `document.querySelector('.headline')?.textContent + ' | ' + document.querySelector('.dial-text')?.textContent`,
  );
  console.log('  M.S. summary:', summary);
  if (!/\d+\/\d+/.test(summary ?? '')) throw new Error('score dial did not render');
}

// Both pages link the DGS's rules spreadsheet (2026-09-04): once in the masthead
// (under the dated line) and once in the footer, each time saying it is
// accessible by faculty only. The link must be the sheet's human address, not
// a published-CSV one.
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
  if (found.footer !== 1) bad.push(`footer links: ${found.footer}`);
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
  await s.waitFor(`document.querySelectorAll('table.course-rules tbody tr').length > 10`);
  await s.shot('courses-list');
  await checkSheetLink(s, 'courses');
  const count = await s.evalJs(`document.querySelector('.count')?.textContent`);
  console.log('  course list:', count);
  if (!/\d+ of \d+ courses/.test(count ?? '')) throw new Error('course list did not render');
  // (Note rows — the DGS's notes, opened per course since 2026-09-05 — are tbody rows too; count courses only.)
  const before = await s.evalJs(`document.querySelectorAll('table.course-rules tbody tr:not(.note-row)').length`);
  await s.evalJs(
    `const sel=[...document.querySelectorAll('.filters select')].find(x=>[...x.options].some(o=>o.value==='algorithms')); sel.value='algorithms'; sel.dispatchEvent(new Event('change'))`,
  );
  await s.waitFor(`document.querySelectorAll('table.course-rules tbody tr:not(.note-row)').length < ${before}`);
  const after = await s.evalJs(`document.querySelectorAll('table.course-rules tbody tr:not(.note-row)').length`);
  console.log(`  core-area filter: ${before} → ${after} rows`);
  if (!(after > 0 && after < before)) throw new Error('core-area filter did not narrow the table');
  await s.shot('courses-filtered');

  // The DGS's notes open from a Notes button on the row (2026-09-05, usability
  // review item 24) — no longer a hover-only tooltip.
  const notes = await s.evalJs(`(() => {
    const b = document.querySelector('table.course-rules button.notes');
    if (!b) return { present: false };
    b.click();
    const row = document.getElementById(b.getAttribute('aria-controls'));
    return { present: true, expanded: b.getAttribute('aria-expanded'), shown: !!row && !row.classList.contains('hidden'), text: row?.textContent.slice(0, 60) };
  })()`);
  if (!notes.present) console.log('  (no course carries DGS notes in this rules snapshot — Notes disclosure not exercised)');
  else if (notes.expanded !== 'true' || !notes.shown) throw new Error('Notes button did not open the note row: ' + JSON.stringify(notes));
  else console.log('  Notes button opens the DGS note row:', notes.text);
  // Clear filters (item 26) drops the core-area filter set above…
  await s.evalJs(`document.querySelector('[data-key="filter.clear"]').click()`);
  await s.waitFor(`document.querySelectorAll('table.course-rules tbody tr:not(.note-row)').length > 10`);
  console.log('  Clear filters restores the full list');
  // …and search ignores spacing: "cse60641" finds CSE 60641.
  await s.evalJs(`const q = document.querySelector('[data-key="filter.search"]'); q.value = 'cse60641'; q.dispatchEvent(new Event('input'));`);
  await s.waitFor(`document.querySelectorAll('table.course-rules tbody tr:not(.note-row)').length === 1`);
  console.log('  search ignores spacing: "cse60641" → 1 row');
  await s.evalJs(`document.querySelector('[data-key="filter.clear"]').click()`);
  await s.waitFor(`document.querySelectorAll('table.course-rules tbody tr:not(.note-row)').length > 10`);

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
    if (sched.options.join(',') !== ',now,next') throw new Error('schedule filter options: ' + JSON.stringify(sched.options));
    if (!/Offered this semester \(/.test(sched.labels[1] ?? '') || !/Offered next semester \(/.test(sched.labels[2] ?? '')) {
      throw new Error('the schedule options must name their semesters: ' + JSON.stringify(sched.labels));
    }
    const before = await s.evalJs(`document.querySelectorAll('table.course-rules tbody tr:not(.note-row)').length`);
    await s.evalJs(`(() => { const sel = document.querySelector('[data-key="filter.offered"]'); sel.value = 'now'; sel.dispatchEvent(new Event('change')); })()`);
    await s.waitFor(`document.querySelectorAll('table.course-rules tbody tr:not(.note-row)').length !== ${before}`);
    const after = await s.evalJs(`document.querySelectorAll('table.course-rules tbody tr:not(.note-row)').length`);
    if (!(after > 0 && after < before)) throw new Error(`the schedule filter did not narrow the table (${before} → ${after})`);
    if (!/offered=now/.test(await s.evalJs(`window.location.search`))) throw new Error('the schedule filter must reach the address bar');
    console.log(`  schedule filter: ${before} → ${after} rows offered this semester, and the URL carries it`);
    await s.evalJs(`document.querySelector('[data-key="filter.clear"]').click()`);
    await s.waitFor(`document.querySelectorAll('table.course-rules tbody tr:not(.note-row)').length > 10`);
  }

  // Specialization categories (DGS 2026-09-08): "Listed under every category"
  // is gone as a sixth category, a course listed under several categories
  // stands in EACH of their cards, and the note above them says it can fill
  // only one. A blank Specialization cell sorts LAST, not first.
  const spec = JSON.parse(await s.evalJs(`JSON.stringify((() => {
    const sel = document.querySelector('[data-key="filter.category"]');
    const opts = [...sel.options].map((o) => o.value);
    const cards = [...document.querySelectorAll('.overview .ov-grid')].pop();
    const headings = [...cards.querySelectorAll('.ov-card h3')].map((h) => h.textContent.trim());
    const inEvery = headings.every((_, i) => cards.querySelectorAll('.ov-card')[i].textContent.includes('CSE 60876'));
    const note = [...document.querySelectorAll('.overview p')].map((p) => p.textContent).find((t) => /fill only/.test(t)) ?? '';
    return { opts, headings, inEvery, note };
  })())`));
  if (spec.opts.includes('any-listed')) throw new Error('the "Listed under every category" filter value is still offered');
  if (spec.headings.length !== 5) throw new Error('expected the five real specialization cards, got ' + JSON.stringify(spec.headings));
  if (!spec.inEvery) throw new Error('a course listed under every category must appear in every card: ' + JSON.stringify(spec.headings));
  if (!/never several/.test(spec.note)) throw new Error('the "fills only one category" note is missing: ' + spec.note);
  console.log('  specialization cards:', spec.headings.join(', '), '— the flexible course is in each, with the "only one" note');
  await s.evalJs(`(() => { const sel = document.querySelector('[data-key="filter.sort"]'); sel.value = 'category'; sel.dispatchEvent(new Event('change')); })()`);
  await s.waitFor(`document.querySelectorAll('table.course-rules tbody tr:not(.note-row)').length > 10`);
  const firstSpec = await s.evalJs(`document.querySelector('table.course-rules tbody tr:not(.note-row) td[data-label^="Specialization"]')?.textContent.trim()`);
  if (!firstSpec || firstSpec === '—') throw new Error('sorting by Specialization must put the rows WITH a category first, got: ' + JSON.stringify(firstSpec));
  console.log('  sort by Specialization → first row is', JSON.stringify(firstSpec) + ', blanks last');
  await s.evalJs(`document.querySelector('[data-key="filter.clear"]').click()`);
  await s.waitFor(`document.querySelectorAll('table.course-rules tbody tr:not(.note-row)').length > 10`);

  // Filters live in the URL (2026-09-05, item 29) and a view picks the columns
  // (item 30): open a shared link, check what it selected, then change a
  // filter and check the address bar followed.
  await s.open(new URL('courses.html?view=mscse&core=algorithms', baseUrl).href, 'table.course-rules');
  const shared = JSON.parse(await s.evalJs(`JSON.stringify({ view: document.querySelector('[data-key="filter.view"]').value, core: document.querySelector('[data-key="filter.core"]').value, program: document.querySelector('[data-key="filter.program"]').value, hiddenHeaders: document.querySelectorAll('table.course-rules thead th.col-hidden').length, rows: document.querySelectorAll('table.course-rules tbody tr:not(.note-row)').length })`));
  if (shared.view !== 'mscse' || shared.core !== 'algorithms') throw new Error('shared link did not select the view/filters: ' + JSON.stringify(shared));
  if (shared.hiddenHeaders !== 3) throw new Error('the M.S. view should hide 3 columns, hid ' + shared.hiddenHeaders);
  await s.evalJs(`(() => { const q = document.querySelector('[data-key="filter.search"]'); q.value = 'algorithms'; q.dispatchEvent(new Event('input')); })()`);
  const search = await s.evalJs(`window.location.search`);
  if (!/q=algorithms/.test(search) || !/view=mscse/.test(search)) throw new Error('the address bar did not follow the filters: ' + search);
  console.log(`  shared link → view/filters applied (${shared.rows} rows, 3 columns hidden); filters written back to the URL (${search})`);
}
