// E2E: the basic app flow — initial Ph.D. report, example student, M.S. tab.
export async function driveApp(s, baseUrl) {
  await s.open(baseUrl);
  await s.evalJs(`localStorage.clear()`);
  await s.open(baseUrl);
  await s.waitFor(`document.querySelectorAll('.req').length > 5`);
  await s.shot('app-initial-phd');
  await checkSheetLink(s, 'app');

  await s.evalJs(
    `[...document.querySelectorAll('button')].find(b => b.textContent === 'Load example').click()`,
  );
  await s.waitFor(`document.querySelectorAll('table.courses tr').length > 3`);
  await s.shot('app-example-phd');

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
  const before = await s.evalJs(`document.querySelectorAll('table.course-rules tbody tr').length`);
  await s.evalJs(
    `const sel=[...document.querySelectorAll('.filters select')].find(x=>[...x.options].some(o=>o.value==='algorithms')); sel.value='algorithms'; sel.dispatchEvent(new Event('change'))`,
  );
  await s.waitFor(`document.querySelectorAll('table.course-rules tbody tr').length < ${before}`);
  const after = await s.evalJs(`document.querySelectorAll('table.course-rules tbody tr').length`);
  console.log(`  core-area filter: ${before} → ${after} rows`);
  if (!(after > 0 && after < before)) throw new Error('core-area filter did not narrow the table');
  await s.shot('courses-filtered');
}
