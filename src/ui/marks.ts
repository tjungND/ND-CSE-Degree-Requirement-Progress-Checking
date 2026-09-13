// The coloured mark that opens a per-course line (DGS request 2026-09-06):
// ✓ green "counts", ◐ blue "in progress", ● amber "pending approval",
// ✕ red "does not count" — shared by the coursework table (app.ts) and the
// prior-university verdicts (external-upload.ts). A different shape per
// colour, plus a spoken word, so the meaning does not rest on colour alone
// (WCAG 1.4.1).
//
// "In progress" and "pending approval" were one amber ● until 2026-09-13, when
// the DGS asked for the three live states to be told apart: a course the
// student is TAKING and a course waiting on someone's signature are different
// things, and only one of them is theirs to act on.
import type { CourseLine } from '../engine/types.ts';
import { el } from './dom.ts';

export type Mark = CourseLine['mark'];

const WORD: Record<Mark, string> = {
  counts: 'counts',
  in_progress: 'in progress',
  pending: 'pending approval',
  excluded: 'does not count',
};

const GLYPH: Record<Mark, string> = {
  counts: '✓',
  in_progress: '◐',
  pending: '●',
  excluded: '✕',
};

export function statusMark(mark: Mark): HTMLElement {
  return el(
    'span',
    { class: `mark mark-${mark}`, title: WORD[mark] },
    el('span', { 'aria-hidden': 'true' }, GLYPH[mark]),
    el('span', { class: 'visually-hidden' }, `${WORD[mark]}: `),
  );
}
