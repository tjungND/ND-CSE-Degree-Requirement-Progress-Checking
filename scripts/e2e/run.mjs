// End-to-end harness: builds if needed, serves dist/ with vite preview, drives
// headless Chrome over the DevTools Protocol, and screenshots into .e2e-out/.
// Run with: npm run e2e   (needs Chrome/Chromium; override the binary with CHROME_BIN)
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openSession } from './cdp.mjs';
import { driveApp, driveCourses } from './drive-app.mjs';
import { driveTranscript } from './drive-transcript.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PREVIEW_PORT = 4273; // not 4173, so a dev's own preview keeps running
const DEBUG_PORT = 9333;
const outDir = join(root, '.e2e-out');
rmSync(outDir, { recursive: true, force: true });
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

if (!existsSync(join(root, 'dist', 'index.html'))) {
  console.log('dist/ missing — running npm run build first…');
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

  const baseUrl = `http://localhost:${PREVIEW_PORT}/`;
  const ndPdf = join(root, 'tests', 'fixtures', 'nd-transcript.pdf');
  const externalPdf = join(root, 'tests', 'fixtures', 'external-transcript.pdf');
  const scanPdf = join(root, 'tests', 'fixtures', 'external-transcript-scan.pdf');
  const otherPdf = join(root, 'tests', 'fixtures', 'other-transcript.pdf');

  for (const [name, fn] of [
    ['app basics', (s) => driveApp(s, baseUrl)],
    ['transcript upload', (s) => driveTranscript(s, baseUrl, ndPdf, otherPdf, externalPdf, scanPdf)],
    ['course rules list', (s) => driveCourses(s, baseUrl)],
  ]) {
    console.log(`\n▶ ${name}`);
    const session = await openSession(DEBUG_PORT, outDir);
    try {
      await fn(session);
      console.log(`✔ ${name}`);
    } catch (err) {
      failed = true;
      console.error(`✖ ${name}:`, err instanceof Error ? err.message : err);
    } finally {
      session.close();
    }
  }
} catch (err) {
  failed = true;
  console.error('e2e harness error:', err instanceof Error ? err.message : err);
} finally {
  cleanup();
}

console.log(`\nScreenshots in .e2e-out/. ${failed ? 'E2E FAILED' : 'E2E passed.'}`);
process.exit(failed ? 1 : 0);
