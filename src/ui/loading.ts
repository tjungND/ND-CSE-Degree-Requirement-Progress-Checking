// The loading card shown while the course rules come from the sheet (DGS
// choice 2026-09-01, "Option A"): a step list that ticks as each tab arrives, a
// bar against the 15-second budget and an elapsed counter. When the load fails
// the same card explains why and suggests RELOADING first; the copy saved in
// the app is offered as a second choice and is never shown automatically.
import {
  FETCH_TIMEOUT_MS,
  RulesLoadError,
  SNAPSHOT_SAVED_ON,
  TAB_LABELS,
  loadLiveRules,
  rulesFromSnapshot,
  type LoadProgress,
  type TabName,
} from '../data/load.ts';
import type { Rules } from '../data/types.ts';
import { DGS, mailto } from './contacts.ts';
import { clear, el } from './dom.ts';

const BUDGET_S = FETCH_TIMEOUT_MS / 1000;

/** Render the loading card into `root`, load the rules, and resolve with them:
 * the live rules, or the saved copy if the student chooses it after a failure.
 * The caller clears `root` and renders the page when this resolves. */
export function loadRulesWithCard(root: HTMLElement, nowIso: string): Promise<Rules> {
  return new Promise((resolve) => {
    const spinner = () => el('span', { class: 'spin', 'aria-hidden': 'true' });
    const title = el('strong', {}, 'Loading the current course rules');
    const subtitle = el('div', { class: 'load-sub' }, `from the DGS’s Google Spreadsheet — usually a few seconds, up to ${BUDGET_S}`);
    const headSpin = spinner();

    type Step = { li: HTMLLIElement; dot: HTMLSpanElement; detail: HTMLSpanElement };
    const makeStep = (label: string): Step => {
      const dot = el('span', { class: 'dot' });
      const detail = el('span', { class: 'detail' });
      return { li: el('li', {}, dot, label, ' ', detail), dot, detail };
    };
    const steps = {
      connect: makeStep('Connecting to the spreadsheet'),
      courses: makeStep('Reading the course list'),
      parameters: makeStep('Reading the parameters'),
      categories: makeStep('Reading the categories'),
      check: makeStep('Checking when the rules were last updated'),
    };
    const setStep = (s: Step, state: 'pending' | 'active' | 'done' | 'failed', detail?: string) => {
      s.li.className = state;
      clear(s.dot);
      if (state === 'active') s.dot.append(el('span', { class: 'spin sm', 'aria-hidden': 'true' }));
      if (state === 'done') s.dot.textContent = '✓';
      if (state === 'failed') s.dot.textContent = '!';
      if (detail !== undefined) s.detail.textContent = detail;
    };

    const barFill = el('i');
    const bar = el('div', { class: 'bar load-bar' }, barFill);
    const elapsedNum = el('span', {}, '0.0');
    const elapsed = el('div', { class: 'elapsed' }, elapsedNum, ` s elapsed · up to ${BUDGET_S} s`);
    const card = el(
      'div',
      { class: 'load-card', role: 'status', 'aria-live': 'polite' },
      el('div', { class: 'load-head' }, headSpin, el('div', {}, title, subtitle)),
      el('ol', { class: 'steps' }, ...Object.values(steps).map((s) => s.li)),
      bar,
      elapsed,
    );
    clear(root);
    root.append(card);
    setStep(steps.connect, 'active');

    const started = performance.now();
    const timer = window.setInterval(() => {
      const t = (performance.now() - started) / 1000;
      elapsedNum.textContent = t.toFixed(1);
      barFill.style.width = `${Math.min(t / BUDGET_S, 1) * 100}%`;
    }, 100);
    const stop = () => {
      window.clearInterval(timer);
      headSpin.remove();
    };

    const onProgress = (p: LoadProgress) => {
      if (p.step === 'connect') return;
      if (p.step === 'tab') {
        // The first tab to arrive proves the connection works.
        if (steps.connect.li.className !== 'done') {
          setStep(steps.connect, 'done');
          for (const tab of ['courses', 'parameters', 'categories'] as const) if (steps[tab].li.className !== 'done') setStep(steps[tab], 'active');
        }
        setStep(steps[p.tab], 'done', `(${p.rows.toLocaleString('en-US')} rows)`);
      }
      if (p.step === 'check') setStep(steps.check, 'active');
    };

    const fail = (err: unknown) => {
      stop();
      const e = err instanceof RulesLoadError ? err : new RulesLoadError('unreachable', undefined, 'Something went wrong while loading the rules.', true);
      card.classList.add('failed');
      bar.classList.add('warn');
      barFill.style.width = '100%';
      title.textContent = e.retryable ? 'The course rules could not be loaded' : 'The spreadsheet has a problem';
      subtitle.textContent = e.kind === 'timeout' ? 'Google did not answer in time' : 'nothing was changed on your side';
      // Mark what was still pending: the tab that failed, or everything not yet done.
      const pendingTabs = (['courses', 'parameters', 'categories'] as const).filter((tab) => steps[tab].li.className !== 'done');
      const failedTabs: TabName[] = e.tab && pendingTabs.includes(e.tab) ? [e.tab] : pendingTabs;
      for (const tab of pendingTabs) setStep(steps[tab], failedTabs.includes(tab) ? 'failed' : 'pending', failedTabs.includes(tab) ? '— not received' : '');
      if (steps.connect.li.className !== 'done') setStep(steps.connect, e.kind === 'unreachable' ? 'failed' : 'done');
      if (e.kind === 'empty' && e.tab) setStep(steps[e.tab], 'failed', '— empty');

      const reload = el('button', { class: 'btn primary', type: 'button', onclick: () => location.reload() }, 'Reload the page');
      const useSaved = el(
        'button',
        { class: 'btn use-saved', type: 'button', onclick: () => resolve(rulesFromSnapshot()) },
        `Continue with the copy saved on ${SNAPSHOT_SAVED_ON}`,
      );
      const savedNote = ' — it may be missing recent DGS edits.';
      card.append(
        el(
          'div',
          { class: 'load-fail' },
          el(
            'p',
            {},
            el('strong', {}, e.message + ' '),
            e.retryable
              ? e.kind === 'timeout'
                ? `This is usually temporary — please reload the page to try again.`
                : 'Please reload the page to try again.'
              : 'Please let the DGS know.',
          ),
          e.retryable
            ? el('div', { class: 'load-actions' }, reload, el('span', { class: 'or' }, 'or'), useSaved, el('span', { class: 'load-note' }, savedNote))
            : el('div', { class: 'load-actions' }, useSaved, el('span', { class: 'load-note' }, savedNote), el('span', { class: 'or' }, 'or'), reload),
          el(
            'p',
            { class: 'load-note' },
            e.retryable ? 'If this keeps happening, please email the DGS (' : 'Please email the DGS (',
            mailto(DGS.email),
            ').',
          ),
        ),
      );
    };

    loadLiveRules(nowIso, onProgress).then(
      (rules) => {
        stop();
        setStep(steps.check, 'done');
        resolve(rules);
      },
      (err) => fail(err),
    );
  });
}
