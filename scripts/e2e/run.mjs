// End-to-end harness: builds if needed, serves dist/ with vite preview, drives
// a headless browser through the four drivers, and screenshots into .e2e-out/.
//
//   npm run e2e                      headless Chrome over the DevTools Protocol
//                                    (needs Chrome/Chromium; CHROME_BIN overrides the binary)
//   E2E_BROWSER=webkit npm run e2e   Playwright's WebKit — Safari's engine — through the
//     (= npm run e2e:webkit)         SAME drivers; screenshots in .e2e-out/webkit/. One-time
//                                    setup per Mac:  npx playwright-core install webkit
//   E2E_ONLY=<substring>             run a single driver while iterating (e.g. E2E_ONLY=access)
//   E2E_BUILD=1                      rebuild dist/ first even if it looks up to date
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openSession } from './cdp.mjs';
import { driveA11y } from './drive-a11y.mjs';
import { driveApp, driveCourses } from './drive-app.mjs';
import { driveTranscript } from './drive-transcript.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PREVIEW_PORT = 4273; // not 4173, so a dev's own preview keeps running
const DEBUG_PORT = 9333;

const browserKind = (process.env.E2E_BROWSER ?? 'chrome').toLowerCase();
if (browserKind !== 'chrome' && browserKind !== 'webkit') {
  console.error(`E2E_BROWSER must be "chrome" (the default) or "webkit", not "${process.env.E2E_BROWSER}".`);
  process.exit(2);
}
// Each browser clears only its own screenshots (Chrome: the top-level PNGs;
// WebKit: the webkit/ folder), so one run never erases the other's frames.
const outRoot = join(root, '.e2e-out');
const outDir = browserKind === 'webkit' ? join(outRoot, 'webkit') : outRoot;
if (browserKind === 'webkit') rmSync(outDir, { recursive: true, force: true });
else if (existsSync(outRoot)) for (const f of readdirSync(outRoot)) if (f.endsWith('.png')) rmSync(join(outRoot, f));
mkdirSync(outDir, { recursive: true });

function findChrome() {
  if (process.env.CHROME_BIN) return process.env.CHROME_BIN;
  const candidates = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
  ];
  for (const c of candidates) if (existsSync(c)) return c;
  throw new Error('No Chrome/Chromium found — set CHROME_BIN to the browser binary.');
}

async function waitForHttp(url, timeoutMs = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`timed out waiting for ${url}`);
}

// The newest mtime under a path (a file, or a folder walked recursively).
function newestMtime(path) {
  const st = statSync(path);
  if (!st.isDirectory()) return st.mtimeMs;
  let newest = st.mtimeMs;
  for (const entry of readdirSync(path)) newest = Math.max(newest, newestMtime(join(path, entry)));
  return newest;
}

// Build when dist/ is missing, when E2E_BUILD=1, or when anything the build
// reads is newer than the last build — otherwise the run tests a stale page.
const distIndex = join(root, 'dist', 'index.html');
const buildInputs = ['src', 'index.html', 'courses.html', 'public', join('data', 'snapshot.json')].map((p) => join(root, p)).filter(existsSync);
const buildReason = !existsSync(distIndex)
  ? 'dist/ missing'
  : process.env.E2E_BUILD === '1'
    ? 'E2E_BUILD=1'
    : Math.max(...buildInputs.map(newestMtime)) > statSync(distIndex).mtimeMs
      ? 'dist/ is older than the sources'
      : null;
if (buildReason) {
  console.log(`${buildReason} — running npm run build first…`);
  const b = spawnSync('npm', ['run', 'build'], { cwd: root, stdio: 'inherit' });
  if (b.status !== 0) process.exit(b.status ?? 1);
}

const children = [];
const cleanup = () => {
  for (const c of children) {
    try {
      c.kill('SIGTERM');
    } catch {
      /* already gone */
    }
  }
};
process.on('exit', cleanup);
process.on('SIGINT', () => process.exit(130));

let failed = false;
const runStarted = Date.now();
const seconds = (since) => ((Date.now() - since) / 1000).toFixed(1);
let webkitBrowser; // closed in the finally below (Playwright owns that process, not `children`)
try {
  // vite is spawned directly (not through npm) so kill() reaches the server.
  const vite = spawn(
    join(root, 'node_modules', '.bin', 'vite'),
    ['preview', '--port', String(PREVIEW_PORT), '--strictPort'],
    { cwd: root, stdio: 'ignore' },
  );
  children.push(vite);
  await waitForHttp(`http://localhost:${PREVIEW_PORT}/`);
  console.log(`preview server on :${PREVIEW_PORT}`);

  let openSessionFor;
  if (browserKind === 'webkit') {
    // Imported lazily: the Chrome run must never need playwright-core.
    const { launchWebkit, openWebkitSession } = await import('./webkit.mjs');
    webkitBrowser = await launchWebkit();
    const context = await webkitBrowser.newContext({ viewport: { width: 1400, height: 1900 } });
    console.log(`headless WebKit ${webkitBrowser.version()} up (Playwright)`);
    openSessionFor = () => openWebkitSession(context, outDir);
  } else {
    const chrome = spawn(
      findChrome(),
      [
        '--headless=new',
        `--remote-debugging-port=${DEBUG_PORT}`,
        `--user-data-dir=${join(tmpdir(), 'cse-audit-e2e-profile')}`,
        '--no-first-run',
        '--no-sandbox', // required on CI runners; harmless locally
        'about:blank',
      ],
      { stdio: 'ignore' },
    );
    children.push(chrome);
    await waitForHttp(`http://127.0.0.1:${DEBUG_PORT}/json/version`);
    console.log('headless Chrome up');
    openSessionFor = () => openSession(DEBUG_PORT, outDir);
  }

  const baseUrl = `http://localhost:${PREVIEW_PORT}/`;
  // The transcript fixtures, by name → path (all sanitized PDFs in tests/fixtures/).
  const pdfs = Object.fromEntries(
    Object.entries({
      nd: 'nd-transcript.pdf',
      other: 'other-transcript.pdf',
      external: 'external-transcript.pdf',
      scan: 'external-transcript-scan.pdf',
      banner: 'banner-transcript.pdf',
      watermarked: 'banner-watermarked-transcript.pdf',
      combined: 'combined-transcript.pdf',
      ndUg: 'nd-undergrad-transcript.pdf',
      uc: 'uc-system-transcript.pdf',
      ndOfficial: 'nd-official-transcript.pdf',
      noLines: 'no-lines-transcript.pdf',
      ndUgInProgress: 'nd-undergrad-in-progress-transcript.pdf',
    }).map(([name, file]) => [name, join(root, 'tests', 'fixtures', file)]),
  );

  // E2E_ONLY=<substring> runs a single driver while iterating (e.g. E2E_ONLY=access).
  const only = process.env.E2E_ONLY;
  for (const [name, fn] of [
    ['app basics', (s) => driveApp(s, baseUrl)],
    ['transcript upload', (s) => driveTranscript(s, baseUrl, pdfs)],
    ['course rules list', (s) => driveCourses(s, baseUrl)],
    ['accessibility and phone layout', (s) => driveA11y(s, baseUrl)],
  ].filter(([name]) => !only || name.includes(only))) {
    console.log(`\n▶ ${name}`);
    const started = Date.now();
    const session = await openSessionFor();
    try {
      await fn(session);
      console.log(`✔ ${name} (${seconds(started)} s)`);
    } catch (err) {
      failed = true;
      console.error(`✖ ${name}:`, err instanceof Error ? err.message : err);
    } finally {
      await session.close();
    }
  }
} catch (err) {
  failed = true;
  console.error('e2e harness error:', err instanceof Error ? err.message : err);
} finally {
  if (webkitBrowser) await webkitBrowser.close().catch(() => {});
  cleanup();
}

console.log(`\n${seconds(runStarted)} s in all.`);
console.log(`Screenshots in ${relative(root, outDir)}/ (${browserKind}). ${failed ? 'E2E FAILED' : 'E2E passed.'}`);
process.exit(failed ? 1 : 0);
