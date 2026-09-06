// The coloured mark that opens a per-course line (DGS request 2026-09-06):
// ✓ green "counts", ● amber "pending", ✕ red "does not count" — shared by the
// coursework table (app.ts) and the prior-university verdicts
// (external-upload.ts). A different shape per colour, plus a spoken word, so
// the meaning does not rest on colour alone (WCAG 1.4.1).
import type { CourseLine } from '../engine/types.ts';
import { el } from './dom.ts';

export type Mark = CourseLine['mark'];

export function statusMark(mark: Mark): HTMLElement {
  const word = mark === 'counts' ? 'counts' : mark === 'pending' ? 'pending' : 'does not count';
  const glyph = mark === 'counts' ? '✓' : mark === 'pending' ? '●' : '✕';
  return el('span', { class: `mark mark-${mark}` }, el('span', { 'aria-hidden': 'true' }, glyph), el('span', { class: 'visually-hidden' }, `${word}: `));
}
