// The one Node-side PDF loader for the dev scripts (2026-10-09, transcript
// accuracy program, Batch A): pdfjs's legacy build run in node, through the
// SAME layout stage the browser uses (`runsFromTextItems` → `runsToLines` in
// src/transcript/layout.ts), so a line list made here is exactly what
// src/transcript/pdf.ts would hand the parser. scripts/dev/pdf-to-lines.mts,
// scripts/dev/replay.mts, scripts/diagnose-transcript.mjs and the OCR bench
// all call this instead of carrying their own pdfjs loop.
//
// FERPA: this module prints nothing and keeps nothing; what a caller does with
// the verbatim lines is the caller's rule (pdf-to-lines.mts: public documents
// only; diagnose-transcript.mjs: shapes only).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runsFromTextItems, runsToLines, type Run } from '../../src/transcript/layout.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** What the layout stage read from one page, for callers that report
 * structure (diagnose-transcript.mjs) as well as the lines. */
export interface PageRuns {
  /** 1-based. */
  page: number;
  /** In the page's reading orientation, as `runsFromTextItems` gives them. */
  runs: Run[];
  /** The page width in that orientation. */
  width: number;
  /** The page was turned upright (its content was drawn sideways). */
  turned: boolean;
  /** This page's lines, as `runsToLines` gives them (no page-break line). */
  lines: string[];
}

// pdfjs's legacy build is the one that runs in node; loaded by file URL so the
// package's browser entry is never resolved. Loaded once.
let pdfjsModule: Promise<any> | undefined;
function pdfjs(): Promise<any> {
  pdfjsModule ??= import(pathToFileURL(join(root, 'node_modules', 'pdfjs-dist', 'legacy', 'build', 'pdf.mjs')).href);
  return pdfjsModule;
}

/** Open a PDF the way every dev script should: no worker fetch, no eval, no
 * font faces (node has none), pdfjs's own warnings silenced (verbosity 0 —
 * pdfjs prints them through console.log, which would land in a script's JSON
 * output), and the standard-font folder named so PDFs set in the base-14
 * fonts do not complain. */
async function openDocument(file: string): Promise<any> {
  const lib = await pdfjs();
  const data = new Uint8Array(readFileSync(file));
  return lib.getDocument({
    data,
    useWorkerFetch: false,
    isEvalSupported: false,
    disableFontFace: true,
    verbosity: 0,
    standardFontDataUrl: join(root, 'node_modules', 'pdfjs-dist', 'standard_fonts') + '/',
  }).promise;
}

/** The text lines of a PDF, exactly as the browser's `pdfToLines` reads them:
 * each page's runs in reading orientation → lines, with an empty line after
 * every page (the page break the parser expects). `onPage` receives each
 * page's runs and lines as they are read. */
export async function pdfToLinesNode(file: string, onPage?: (page: PageRuns) => void): Promise<string[]> {
  const doc = await openDocument(file);
  const lines: string[] = [];
  try {
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      const viewport = page.getViewport({ scale: 1 });
      const { runs, width } = runsFromTextItems(content.items.filter((it: { str?: string }) => 'str' in it), viewport);
      const pageLines = runsToLines(runs, width);
      onPage?.({ page: p, runs, width, turned: width !== viewport.width, lines: pageLines });
      lines.push(...pageLines);
      lines.push('');
    }
  } finally {
    await doc.destroy();
  }
  return lines;
}

/** Render every page of a PDF to a PNG at `dpi` (72 = the page's own size),
 * named `<pdf base name>-p<page>.png` under `outDir` (created if missing);
 * returns the paths in page order. For the OCR bench: a line list rendered
 * back to pages, or a public PDF rendered for degradation. Uses pdfjs's legacy
 * build with @napi-rs/canvas, which pdfjs-dist installs as its optional
 * dependency — when that package is missing (an `npm ci --omit=optional`, an
 * unsupported platform) the error says so instead of failing inside pdfjs. */
export async function pdfToPagePngs(file: string, dpi: number, outDir: string): Promise<string[]> {
  let canvasLib: { createCanvas: (w: number, h: number) => any };
  try {
    canvasLib = await import('@napi-rs/canvas');
  } catch (e) {
    throw new Error(`pdfToPagePngs: @napi-rs/canvas is not available (${e instanceof Error ? e.message : String(e)}); it is pdfjs-dist's optional dependency — reinstall with \`npm ci\` without --omit=optional.`);
  }
  if (!(dpi > 0)) throw new Error(`pdfToPagePngs: dpi must be positive, got ${dpi}`);
  mkdirSync(outDir, { recursive: true });
  const stem = basename(file).replace(/\.pdf$/i, '');
  const doc = await openDocument(file);
  const out: string[] = [];
  try {
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const viewport = page.getViewport({ scale: dpi / 72 });
      const canvas = canvasLib.createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      const ctx = canvas.getContext('2d');
      // Paper is white; pdfjs paints only what the page draws.
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport }).promise;
      const path = join(outDir, `${stem}-p${p}.png`);
      writeFileSync(path, canvas.toBuffer('image/png'));
      out.push(path);
    }
  } finally {
    await doc.destroy();
  }
  return out;
}
