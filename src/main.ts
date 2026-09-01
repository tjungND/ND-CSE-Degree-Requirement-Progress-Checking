// Entry point: load the rules (live sheet → snapshot fallback), then start the
// app. All rule logic lives in src/engine/ (pure, tested); all sheet handling
// in src/data/; this file only wires them to the page.
import './style.css';
import { loadRulesWithCard } from './ui/loading.ts';
import { startApp } from './ui/app.ts';

const app = document.querySelector<HTMLDivElement>('#app');
if (app) {
  // The loading card (src/ui/loading.ts) shows progress and, on failure, suggests
  // reloading; it resolves with the live rules or the saved copy the student chose.
  loadRulesWithCard(app, new Date().toISOString()).then((rules) => {
    app.textContent = '';
    try {
      startApp(app, rules);
    } catch (err) {
      // Saved data from an old version (or a bad import) must never brick the
      // page — offer a way out instead of a blank screen.
      app.textContent = '';
      const msg = document.createElement('p');
      msg.textContent =
        'Something went wrong showing your saved data' +
        (err instanceof Error ? ` (${err.message})` : '') +
        '. You can clear it and start fresh — or close this tab if you want to try again later.';
      const btn = document.createElement('button');
      btn.textContent = 'Clear saved data and start fresh';
      btn.addEventListener('click', () => {
        try {
          localStorage.removeItem('cse-degree-audit/v1/student');
        } catch {
          /* ignore */
        }
        location.reload();
      });
      app.append(msg, btn);
    }
  });
}
