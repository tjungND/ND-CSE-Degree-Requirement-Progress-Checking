// Entry point for courses.html — the public "which courses count" list. Same
// rules loader as the audit page (live sheet → snapshot fallback); no student
// data is involved on this page at all.
import './style.css';
import { loadRules } from './data/load.ts';
import { renderCoursesPage } from './ui/courses-page.ts';

const app = document.querySelector<HTMLDivElement>('#app');
if (app) {
  app.textContent = 'Loading the current course rules from the latest Google Spreadsheet… it may take up to 15 seconds';
  loadRules(new Date().toISOString()).then((rules) => {
    app.textContent = '';
    renderCoursesPage(app, rules);
  });
}
