// Minimal Chrome DevTools Protocol client — stdlib only (node >= 22 has a
// global WebSocket). Used by the e2e drivers; no Playwright/puppeteer needed
// for the Chrome run. The WebKit run (E2E_BROWSER=webkit, scripts/e2e/webkit.mjs)
// hands the drivers a session of the same shape; what both share — waiting,
// the loading card, the opening notice — lives in session-common.mjs.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { sessionHelpers } from './session-common.mjs';

export async function openSession(debugPort, outDir) {
  const target = await (
    await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`, { method: 'PUT' })
  ).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  let id = 0;
  const pending = new Map();
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  };
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const mid = ++id;
      pending.set(mid, (m) =>
        m.error ? reject(new Error(`${method}: ${JSON.stringify(m.error)}`)) : resolve(m.result),
      );
      ws.send(JSON.stringify({ id: mid, method, params }));
    });

  const evalJs = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) {
      throw new Error(
        'page JS failed: ' +
          JSON.stringify(r.exceptionDetails.exception?.description ?? r.exceptionDetails),
      );
    }
    return r.result?.value;
  };

  const settle = () => evalJs('new Promise(r => requestAnimationFrame(() => setTimeout(r, 120)))');
  const save = (name, base64) => {
    writeFileSync(join(outDir, `${name}.png`), Buffer.from(base64, 'base64'));
    console.log('  screenshot:', `${name}.png`);
  };

  const shot = async (name) => {
    await settle();
    const { data } = await send('Page.captureScreenshot', { format: 'png' });
    save(name, data);
  };

  // A cropped screenshot of one element (a preview card, say): scrolled into
  // view, then clipped in page coordinates — the way puppeteer does it.
  const shotElement = async (name, selector) => {
    await settle();
    const rect = await evalJs(`(() => {
      const e = document.querySelector(${JSON.stringify(selector)});
      if (!e) return null;
      e.scrollIntoView({ block: 'start' });
      const r = e.getBoundingClientRect();
      return { x: r.left + window.scrollX, y: r.top + window.scrollY, width: r.width, height: r.height };
    })()`);
    if (!rect) throw new Error('shotElement: nothing matches ' + selector);
    const { data } = await send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true,
      clip: { ...rect, scale: 1 },
    });
    save(name, data);
  };

  const setFileInput = async (selector, filePath) => {
    const doc = await send('DOM.getDocument');
    const node = await send('DOM.querySelector', { nodeId: doc.root.nodeId, selector });
    await send('DOM.setFileInputFiles', { files: [filePath], nodeId: node.nodeId });
  };

  const { waitFor, open } = sessionHelpers({
    navigate: (url) => send('Page.navigate', { url }),
    evalJs,
    shot,
  });

  await send('Page.enable');
  await send('DOM.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1400,
    height: 1900,
    deviceScaleFactor: 1,
    mobile: false,
  });

  return { send, evalJs, waitFor, shot, shotElement, setFileInput, open, close: () => ws.close() };
}
