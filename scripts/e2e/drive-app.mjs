// E2E: the basic app flow — initial Ph.D. report, example student, M.S. tab.
export async function driveApp(s, baseUrl) {
  await s.open(baseUrl);
  await s.evalJs(`localStorage.clear()`);
  await s.open(baseUrl);
  await s.waitFor(`document.querySelectorAll('.req').length > 5`);
  await s.shot('app-initial-phd');

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

// E2E: the public course-rules list (courses.html) — renders the overview and
// the full table from the same rules, filters work, no student data involved.
export async function driveCourses(s, baseUrl) {
  await s.open(new URL('courses.html', baseUrl).href);
  await s.waitFor(`document.querySelectorAll('table.course-rules tbody tr').length > 10`);
  await s.shot('courses-list');
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
