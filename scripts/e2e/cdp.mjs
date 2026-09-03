// Minimal Chrome DevTools Protocol client — stdlib only (node >= 22 has a
// global WebSocket). Used by the e2e drivers; no Playwright/puppeteer needed.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

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

  const waitFor = async (expression, timeoutMs = 20000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      if (await evalJs(`!!(${expression})`)) return;
      await new Promise((r) => setTimeout(r, 250));
    }
    throw new Error('timeout waiting for: ' + expression);
  };

  const shot = async (name) => {
    await evalJs('new Promise(r => requestAnimationFrame(() => setTimeout(r, 120)))');
    const { data } = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(outDir, `${name}.png`), Buffer.from(data, 'base64'));
    console.log('  screenshot:', `${name}.png`);
  };

  const setFileInput = async (selector, filePath) => {
    const doc = await send('DOM.getDocument');
    const node = await send('DOM.querySelector', { nodeId: doc.root.nodeId, selector });
    await send('DOM.setFileInputFiles', { files: [filePath], nodeId: node.nodeId });
  };

  // Navigate and get past the loading card. In a sandbox without network the
  // live fetch fails at once and the card offers "Continue with the copy saved
  // on …" — the harness screenshots that card (once) and clicks it, so the
  // failure path is exercised on every run. With network, the live rules load
  // and the masthead appears by itself.
  let failureShotTaken = false;
  let consentShotTaken = false;
  const open = async (url, readySelector = '.masthead h1') => {
    await send('Page.navigate', { url });
    await waitFor(`document.querySelector('${readySelector}') || document.querySelector('.load-card.failed')`);
    if (await evalJs(`!!document.querySelector('.load-card.failed')`)) {
      const text = await evalJs(`document.querySelector('.load-fail')?.textContent`);
      if (!/[Rr]eload the page/.test(text ?? '')) throw new Error('failure card must suggest reloading: ' + text);
      if (!failureShotTaken) {
        await shot('loading-failed');
        failureShotTaken = true;
      }
      await evalJs(`document.querySelector('.load-card.failed button.use-saved').click()`);
      await waitFor(`document.querySelector('${readySelector}')`);
    }
    // Department-approval gate (2026-09-03): screenshot the first one, then
    // Agree so the scripts can click the page beneath.
    if (await evalJs(`!!document.querySelector('.consent-overlay')`)) {
      if (!consentShotTaken) {
        await shot('consent-gate');
        consentShotTaken = true;
      }
      await evalJs(`document.querySelector('.consent-overlay button.btn').click()`);
      await waitFor(`!document.querySelector('.consent-overlay')`);
    }
  };

  await send('Page.enable');
  await send('DOM.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1400,
    height: 1900,
    deviceScaleFactor: 1,
    mobile: false,
  });

  return { send, evalJs, waitFor, shot, setFileInput, open, close: () => ws.close() };
}
