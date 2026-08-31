// E2E: the basic app flow — initial Ph.D. report, example student, M.S. tab.
export async function driveApp(s, baseUrl) {
  await s.send('Page.navigate', { url: baseUrl });
  await s.waitFor(`document.querySelector('.masthead h1')`);
  await s.evalJs(`localStorage.clear()`);
  await s.send('Page.navigate', { url: baseUrl });
  await s.waitFor(`document.querySelectorAll('.req').length > 5`);
  await s.shot('app-initial-phd');

  await s.evalJs(
    `[...document.querySelectorAll('button')].find(b => b.textContent === 'Load example').click()`,
  );
  await s.waitFor(`document.querySelectorAll('table.courses tr').length > 3`);
  await s.shot('app-example-phd');

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
