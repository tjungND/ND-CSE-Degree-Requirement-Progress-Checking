// The choreography every e2e session shares, whatever the browser behind it:
// cdp.mjs (headless Chrome over the DevTools Protocol) and webkit.mjs
// (Playwright's WebKit — Safari's engine, E2E_BROWSER=webkit) each supply the
// primitives (navigate / evalJs / shot) and get the same waitFor and open back,
// so the drivers see the loading card and the opening notice handled
// identically in both browsers. Change the page's start-up flow here, once.
export function sessionHelpers({ navigate, evalJs, shot }) {
  const waitFor = async (expression, timeoutMs = 20000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      if (await evalJs(`!!(${expression})`)) return;
      await new Promise((r) => setTimeout(r, 250));
    }
    throw new Error('timeout waiting for: ' + expression);
  };

  // Navigate and get past the loading card. In a sandbox without network the
  // live fetch fails at once and the card offers "Continue with the copy saved
  // on …" — the harness screenshots that card (once) and clicks it, so the
  // failure path is exercised on every run. With network, the live rules load
  // and the masthead appears by itself.
  let failureShotTaken = false;
  let consentShotTaken = false;
  const open = async (url, readySelector = '.masthead h1') => {
    await navigate(url);
    // The live rules come from Google at start-up: allow a slow network a full
    // minute before calling the load a failure (two drivers timed out at 20 s on
    // 2026-09-06 with nothing wrong in the page).
    await waitFor(`document.querySelector('${readySelector}') || document.querySelector('.load-card.failed')`, 60000);
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

  return { waitFor, open };
}
