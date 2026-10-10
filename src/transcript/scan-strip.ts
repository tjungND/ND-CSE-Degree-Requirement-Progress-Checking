// The scanned line beside an OCR preview row (transcript accuracy program,
// Batch C — the DGS's answer (5) of 2026-10-09: "The OCR preview shows a crop of
// the scanned line beside the fields of flagged rows, behind a 'show the scanned
// line' toggle on the others; in memory only, never saved or exported").
//
// The pure half, DOM-free so it is tested on its own (tests/scan-strip.test.ts):
// which part of which page image a row's strip shows, and how small a copy of
// each page the browser keeps for it. ocr.ts keeps the copies; the preview
// (src/ui/scan-strips.ts) holds them in a Map beside the rows — never on a row,
// never in the student record, its export or localStorage — and drops them
// when the preview closes.
import type { OcrBox, OcrLine } from './ocr-lines.ts';

/** A part of a page image the engine read, in that image's pixels. */
export interface StripRegion {
  /** 1-based page. */
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Space kept around the row's words, as a share of its line height: above
 * and below (so ascenders, descenders and an underline show), and on each
 * side (so a cell's first and last letters are not cut). */
export const STRIP_PAD_Y_SHARE = 0.35;
export const STRIP_PAD_X_SHARE = 0.6;

/** The strip of a row read from `lines[span.from..span.to]` (the parser's
 * `sourceLines`): the boxes of those lines that sit on the first one's page,
 * together, padded and kept inside the page (`pageSize`, the image's pixel
 * size). Undefined when no line of the span has a box (a page break, a line
 * no engine word made) or the row has no span. */
export function stripRegion(
  lines: readonly Pick<OcrLine, 'box' | 'page'>[],
  span: { from: number; to: number } | undefined,
  pageSize: (page: number) => { width: number; height: number } | undefined,
): StripRegion | undefined {
  if (span === undefined || span.to < span.from) return undefined;
  let page: number | undefined;
  let box: OcrBox | undefined;
  let lineHeight = Infinity;
  for (let i = Math.max(0, span.from); i <= span.to && i < lines.length; i++) {
    const line = lines[i]!;
    if (line.box === undefined || line.page === undefined) continue;
    if (page === undefined) page = line.page;
    if (line.page !== page) continue; // a row carried over to the next page shows its first page's part
    const b = line.box;
    box = box === undefined ? { ...b } : { x0: Math.min(box.x0, b.x0), y0: Math.min(box.y0, b.y0), x1: Math.max(box.x1, b.x1), y1: Math.max(box.y1, b.y1) };
    lineHeight = Math.min(lineHeight, Math.max(1, b.y1 - b.y0));
  }
  if (page === undefined || box === undefined) return undefined;
  const padY = Math.round(lineHeight * STRIP_PAD_Y_SHARE);
  const padX = Math.round(lineHeight * STRIP_PAD_X_SHARE);
  const size = pageSize(page);
  const x0 = Math.max(0, Math.floor(box.x0 - padX));
  const y0 = Math.max(0, Math.floor(box.y0 - padY));
  const x1 = Math.min(size?.width ?? Infinity, Math.ceil(box.x1 + padX));
  const y1 = Math.min(size?.height ?? Infinity, Math.ceil(box.y1 + padY));
  if (!(x1 > x0 && y1 > y0)) return undefined;
  return { page, x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

/** The longest side, in pixels, of the copy of each page the browser keeps
 * for the strips while the preview is open: about 155 dpi on a letter page
 * (11 in), which keeps 8-point type legible in a strip, at under 9 MB a page
 * (ten pages ≈ 90 MB — the engine's full-resolution page, 17 MB at 216 dpi,
 * is released as soon as it is read). A page already smaller is kept as it is. */
export const STRIP_PAGE_MAX_SIDE_PX = 1700;

/** The kept copy's size and its scale against the page the engine read. */
export function stripPageSize(width: number, height: number, maxSide = STRIP_PAGE_MAX_SIDE_PX): { width: number; height: number; scale: number } {
  if (!(width > 0 && height > 0)) return { width: 0, height: 0, scale: 0 };
  const scale = Math.min(1, maxSide / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)), scale };
}

/** A region of the engine's page, in the kept copy's pixels (whole pixels,
 * inside the copy). */
export function scaledRegion(region: StripRegion, scale: number, copy: { width: number; height: number }): StripRegion {
  const x = Math.max(0, Math.floor(region.x * scale));
  const y = Math.max(0, Math.floor(region.y * scale));
  const x1 = Math.min(copy.width, Math.ceil((region.x + region.width) * scale));
  const y1 = Math.min(copy.height, Math.ceil((region.y + region.height) * scale));
  return { page: region.page, x, y, width: Math.max(1, x1 - x), height: Math.max(1, y1 - y) };
}
