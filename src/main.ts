// Entry point: load the rules (live sheet → snapshot fallback), then start the
// app. All rule logic lives in src/engine/ (pure, tested); all sheet handling
// in src/data/; this file only wires them to the page.
import './style.css';
import { loadRules } from './data/load.ts';
import { startApp } from './ui/app.ts';

const app = document.querySelector<HTMLDivElement>('#app');
if (app) {
  app.textContent = 'Loading the current course rules…';
  loadRules(new Date().toISOString()).then((rules) => {
    app.textContent = '';
    startApp(app, rules);
  });
}
