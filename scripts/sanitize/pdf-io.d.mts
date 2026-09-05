// Types for pdf-io.mjs (kept next to the JavaScript so tests type-check).
import type { Sanitizer, SanitizerOptions } from './rules.mjs';
export interface PdfRun {
  x: number;
  y: number;
  text: string;
  width: number;
  height: number;
  a: number;
  b: number;
  c: number;
  d: number;
  rotated: boolean;
}
export interface PdfPage {
  width: number;
  height: number;
  x0: number;
  y0: number;
  /** The page's /Rotate (0, 90, 180, 270), kept in the rebuilt PDF (2026-09-05). */
  rotate: number;
  runs: PdfRun[];
}
export function readRuns(bytes: Uint8Array | Buffer): Promise<PdfPage[]>;
export function sanitizePdf(bytes: Uint8Array | Buffer, options?: SanitizerOptions): Promise<{ pdf: Buffer; sanitizer: Sanitizer; pages: PdfPage[] }>;
export function buildPdf(pages: PdfPage[]): Buffer;
