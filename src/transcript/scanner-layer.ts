// Is this PDF a SCAN whose scanner embedded its own text? (transcript accuracy
// program, Batch C — the DGS's answer (6) of 2026-10-09: "A scan whose pages are
// all image-backed with an embedded text layer is treated as OCR-grade: rows
// editable and flagged, OCR offered — reverses the 2026-09-06 lock for that
// case only".)
//
// Scanner software, Acrobat's "searchable image", ABBYY, macOS and phone
// scanner apps, ocrmypdf and Tesseract's own PDF output all make the same
// shape: each page is ONE image covering the page, and the recognised text is
// laid over it invisibly (text rendering mode 3) — or drawn first and covered
// by the image. That text is another engine's guess, as fallible as ours (the
// bench's L7 level), and until now it took the exact path: rows locked as
// "printed", no flag, no OCR offer.
//
// The test reads only pdfjs's operator list (the drawing instructions; nothing
// is rendered or decoded here), DOM-free, so the browser (pdf.ts), the dev
// scripts (scripts/dev/pdf-lines-node.mts) and the tests run the same code:
//  - a page is IMAGE-BACKED when an image it paints covers at least
//    `FULL_PAGE_IMAGE_SHARE` of the page, and no text is VISIBLE over it —
//    every text drawn after that image is invisible (mode 3, or 7: clip only);
//  - the PDF is a scanned text layer when EVERY page is image-backed (and the
//    parser finds a text layer at all — the caller's test).
// A system-generated transcript printed over a security-paper background
// image draws its text visibly ON the image, so it keeps the exact path; so
// does a PDF with one born-digital page among scanned ones.

/** The structural slice of a pdfjs `PDFPageProxy` read here: its view box
 * (`[x0, y0, x1, y1]`, PDF units) and its operator list. */
export interface PdfLayerPage {
  view: readonly number[];
  getOperatorList(): Promise<{ fnArray: number[]; argsArray: unknown[] }>;
}

/** The pdfjs operator codes read here (`pdfjs.OPS`). */
export interface PdfLayerOps {
  save: number;
  restore: number;
  transform: number;
  paintFormXObjectBegin: number;
  paintFormXObjectEnd: number;
  paintImageXObject: number;
  paintInlineImageXObject: number;
  paintImageMaskXObject: number;
  setTextRenderingMode: number;
  showText: number;
  showSpacedText: number;
  nextLineShowText: number;
  nextLineSetSpacingShowText: number;
}

/** The confidence every line of a scanner's embedded text is read with: a
 * line no engine of ours read is vouched for by nobody, so it sits under the
 * parser's floor (OCR_CONFIDENCE_FLOOR, 80) — every row it gives is flagged,
 * and the parser's scan-only repairs (OCR plan step 2.5, the numeric
 * corrections of Batch C answer (4)) apply, as they do to our own OCR's lines.
 * ocr-lines.ts gives a line with no engine word the same 0. */
export const SCANNER_LAYER_CONFIDENCE = 0;

/** The share of the page an image must cover to be the page's scan — a
 * scanner's image is the whole page (1.0); 0.9 allows a cropped margin. A
 * logo, a seal, a signature or a photo is far smaller. */
export const FULL_PAGE_IMAGE_SHARE = 0.9;

/** What one page's operator list shows. */
export interface PageLayerFigures {
  /** The largest share of the page one painted image covers (0–1). */
  imageShare: number;
  /** Text-drawing operations on the page. */
  textShown: number;
  /** …of them, drawn visibly after the full-page image (over it). */
  textOverImage: number;
  /** A full-page image with no visible text over it. */
  imageBacked: boolean;
}

type Matrix = [number, number, number, number, number, number];
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];
/** `m` applied first, then `ctm` (PDF's `cm`: CTM' = m × CTM). */
const times = (m: Matrix, c: Matrix): Matrix => [m[0] * c[0] + m[1] * c[2], m[0] * c[1] + m[1] * c[3], m[2] * c[0] + m[3] * c[2], m[2] * c[1] + m[3] * c[3], m[4] * c[0] + m[5] * c[2] + c[4], m[4] * c[1] + m[5] * c[3] + c[5]];
const asMatrix = (v: unknown): Matrix | undefined => (Array.isArray(v) && v.length === 6 && v.every((n) => typeof n === 'number' && Number.isFinite(n)) ? (v as Matrix) : undefined);
/** Text rendering modes that draw nothing: 3 invisible, 7 clip only. */
const INVISIBLE_TEXT_MODES = new Set([3, 7]);

/** The figures of one page from its operator list (pure — the tests feed it
 * composed lists): every image is the unit square through the current
 * transformation matrix, which `save` / `restore`, `transform` and a form
 * XObject's own matrix move; the text rendering mode is saved and restored
 * with the rest of the graphics state. */
export function pageLayerFigures(list: { fnArray: number[]; argsArray: unknown[] }, ops: PdfLayerOps, view: readonly number[]): PageLayerFigures {
  const [vx0 = 0, vy0 = 0, vx1 = 0, vy1 = 0] = view;
  const pageArea = Math.abs((vx1 - vx0) * (vy1 - vy0));
  let ctm: Matrix = IDENTITY;
  let mode = 0;
  const stack: { ctm: Matrix; mode: number }[] = [];
  let imageShare = 0;
  let fullPageAt = -1;
  let textShown = 0;
  let textOverImage = 0;
  const textOps = new Set([ops.showText, ops.showSpacedText, ops.nextLineShowText, ops.nextLineSetSpacingShowText]);
  const imageOps = new Set([ops.paintImageXObject, ops.paintInlineImageXObject, ops.paintImageMaskXObject]);
  for (let i = 0; i < list.fnArray.length; i++) {
    const fn = list.fnArray[i];
    const args = list.argsArray[i] as unknown[] | null | undefined;
    if (fn === ops.save) stack.push({ ctm, mode });
    else if (fn === ops.restore) ({ ctm, mode } = stack.pop() ?? { ctm, mode });
    else if (fn === ops.transform) {
      const m = asMatrix(args);
      if (m) ctm = times(m, ctm);
    } else if (fn === ops.paintFormXObjectBegin) {
      stack.push({ ctm, mode });
      const m = asMatrix(args?.[0]);
      if (m) ctm = times(m, ctm);
    } else if (fn === ops.paintFormXObjectEnd) ({ ctm, mode } = stack.pop() ?? { ctm, mode });
    else if (fn === ops.setTextRenderingMode) {
      const m = args?.[0];
      if (typeof m === 'number') mode = m;
    } else if (fn !== undefined && textOps.has(fn)) {
      textShown += 1;
      if (fullPageAt >= 0 && !INVISIBLE_TEXT_MODES.has(mode)) textOverImage += 1;
    } else if (fn !== undefined && imageOps.has(fn) && pageArea > 0) {
      const xs = [ctm[4], ctm[0] + ctm[4], ctm[2] + ctm[4], ctm[0] + ctm[2] + ctm[4]];
      const ys = [ctm[5], ctm[1] + ctm[5], ctm[3] + ctm[5], ctm[1] + ctm[3] + ctm[5]];
      const w = Math.max(0, Math.min(Math.max(...xs), Math.max(vx0, vx1)) - Math.max(Math.min(...xs), Math.min(vx0, vx1)));
      const h = Math.max(0, Math.min(Math.max(...ys), Math.max(vy0, vy1)) - Math.max(Math.min(...ys), Math.min(vy0, vy1)));
      const share = (w * h) / pageArea;
      imageShare = Math.max(imageShare, share);
      if (share >= FULL_PAGE_IMAGE_SHARE && fullPageAt < 0) fullPageAt = i;
    }
  }
  return { imageShare, textShown, textOverImage, imageBacked: fullPageAt >= 0 && textOverImage === 0 };
}

/** One page's figures, from pdfjs. */
export async function pageScanLayer(page: PdfLayerPage, ops: PdfLayerOps): Promise<PageLayerFigures> {
  return pageLayerFigures(await page.getOperatorList(), ops, page.view);
}
