// Entry point. Wires the data loader to the UI. Kept tiny on purpose:
// all rule logic lives in src/engine/ (pure, tested), all sheet handling in src/data/.
const app = document.querySelector<HTMLDivElement>('#app');
if (app) {
  app.textContent = 'Loading…';
}

// The real UI boot is added in the UI build step (src/ui/).
export {};
