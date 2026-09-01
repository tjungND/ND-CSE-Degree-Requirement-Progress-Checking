// Entry point for courses.html — the public "which courses count" list. Same
// rules loader as the audit page (live sheet → snapshot fallback); no student
// data is involved on this page at all.
import './style.css';
import { loadRulesWithCard } from './ui/loading.ts';
import { renderCoursesPage } from './ui/courses-page.ts';

const app = document.querySelector<HTMLDivElement>('#app');
if (app) {
  // The loading card (src/ui/loading.ts) shows progress and, on failure, suggests
  // reloading; it resolves with the live rules or the saved copy the student chose.
  loadRulesWithCard(app, new Date().toISOString()).then((rules) => {
    app.textContent = '';
    renderCoursesPage(app, rules);
  });
}
