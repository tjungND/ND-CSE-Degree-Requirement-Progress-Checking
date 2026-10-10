// Can this browser run the PDF reader at all? (cross-browser review,
// 2026-10-10) pdf.js's legacy build — the one the app ships — needs Safari
// 16.4, Chrome 94 or Firefox 93: its worker holds a class static block, and the
// build copies the worker as it is, so nothing lowers it. Below that, every
// import failed with a message blaming the file, and a student would go and
// fetch another PDF for nothing. Asked only after a read has failed, so a
// browser that can read PDFs never sees the answer.

/** True when this browser cannot compile a class static block. The probe is
 * compiled, never run. Only a SyntaxError counts: a page served under a
 * Content-Security-Policy without 'unsafe-eval' refuses `new Function` with
 * an EvalError in every browser, which says nothing about its age. */
export function browserTooOldForPdfs(): boolean {
  try {
    new Function('class A { static {} }');
    return false;
  } catch (e) {
    return e instanceof SyntaxError;
  }
}

/** What the transcript rows say then (W-CL425). */
export const BROWSER_TOO_OLD_FOR_PDFS =
  'This browser is too old to read a PDF here. Update it (Safari 16.4, Chrome 94 or Firefox 93, or newer) and import again, or add your courses manually.';
