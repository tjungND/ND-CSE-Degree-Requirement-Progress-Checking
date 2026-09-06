// The WebKit backend of the e2e harness — Safari's engine, driven through
// Playwright (playwright-core, a devDependency used only here; Apache-2.0,
// never shipped). E2E_BROWSER=webkit npm run e2e runs the SAME four drivers
// as the Chrome run: this module gives them a session of the same shape as
// cdp.mjs (send / evalJs / waitFor / shot / shotElement / setFileInput / open
// / close), translating the few DevTools-Protocol commands the drivers use
// directly. Why: the subgrid incident of 2026-09-06 — Chrome rendered a
// preview layout that Safari broke — and Safari itself cannot be scripted
// headlessly; Playwright's WebKit build is the closest stand-in and runs on
// the DGS's Mac. One-time setup per machine (the build is cached outside the
// repo, in ~/Library/Caches/ms-playwright):  npx playwright-core install webkit
import { join } from 'node:path';
import { sessionHelpers } from './session-common.mjs';

export async function launchWebkit() {
  let pw;
  try {
    pw = await import('playwright-core');
  } catch {
    throw new Error('playwright-core is not installed — run npm ci (it is a devDependency).');
  }
  try {
    return await pw.webkit.launch({ headless: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/Executable doesn't exist|playwright install/i.test(msg)) {
      throw new Error(
        "Playwright's WebKit build is not on this machine yet — run once:  npx playwright-core install webkit\n  (" +
          msg.split('\n')[0] +
          ')',
      );
    }
    throw err;
  }
}

export async function openWebkitSession(context, outDir) {
  const page = await context.newPage();

  // Same contract as cdp.mjs's evalJs: the string is evaluated in the page
  // (statements allowed, a returned promise awaited, the value serialized).
  const evalJs = async (expression) => {
    try {
      return await page.evaluate(expression);
    } catch (err) {
      throw new Error('page JS failed: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  const settle = () => evalJs('new Promise(r => requestAnimationFrame(() => setTimeout(r, 120)))');
  const shot = async (name) => {
    await settle();
    await page.screenshot({ path: join(outDir, `${name}.png`) });
    console.log('  screenshot:', `${name}.png`);
  };
  const shotElement = async (name, selector) => {
    await settle();
    const el = page.locator(selector).first();
    if ((await el.count()) === 0) throw new Error('shotElement: nothing matches ' + selector);
    await el.screenshot({ path: join(outDir, `${name}.png`) });
    console.log('  screenshot:', `${name}.png`);
  };

  const setFileInput = async (selector, filePath) => {
    const handle = await page.$(selector);
    if (!handle) throw new Error('setFileInput: nothing matches ' + selector);
    await handle.setInputFiles(filePath); // fires input + change, like DOM.setFileInputFiles
  };

  // The drivers speak a few DevTools-Protocol commands directly (viewport
  // changes, key presses, a bare navigation); translate those — and refuse
  // anything else loudly, so a new CDP call in a driver is noticed here.
  const send = async (method, params = {}) => {
    switch (method) {
      case 'Page.navigate':
        await page.goto(params.url);
        return {};
      case 'Emulation.setDeviceMetricsOverride':
        // Width and height are what the layout checks depend on; Chrome's
        // "mobile" flag (touch, meta-viewport handling) has no per-page
        // equivalent in Playwright and the app's breakpoints are width-only.
        await page.setViewportSize({ width: params.width, height: params.height });
        return {};
      case 'Input.dispatchKeyEvent':
        if (params.type === 'keyDown' || params.type === 'rawKeyDown') await page.keyboard.down(params.key);
        else if (params.type === 'keyUp') await page.keyboard.up(params.key);
        else if (params.type === 'char') await page.keyboard.type(params.text ?? '');
        return {};
      case 'Page.captureScreenshot': {
        const data = await page.screenshot();
        return { data: data.toString('base64') };
      }
      case 'Page.enable':
      case 'DOM.enable':
        return {};
      default:
        throw new Error(`webkit session: no translation for the DevTools command ${method} — add one in scripts/e2e/webkit.mjs`);
    }
  };

  const { waitFor, open } = sessionHelpers({ navigate: (url) => page.goto(url), evalJs, shot });

  return { send, evalJs, waitFor, shot, shotElement, setFileInput, open, close: () => page.close() };
}
