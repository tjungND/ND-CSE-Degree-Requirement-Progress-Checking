// E2E: the transcript-upload flow — reject a non-ND PDF with the right message,
// preview + add the courses from an ND PDF, prefill the GPA. Then the
// external-transcripts card: upload another university's PDF into the Master's
// slot, correct/confirm the preview, and check the DGS-verdict lines (in the
// sandbox the ExternalCourses tab is unconfigured, so everything is honestly
// "not yet reviewed" and the copy-ready review request appears).
export async function driveTranscript(s, baseUrl, ndPdf, otherPdf, externalPdf, scanPdf) {
  await s.open(baseUrl, '.transcript-upload');
  await s.evalJs(`localStorage.clear()`);
  await s.open(baseUrl, '.transcript-upload');

  // 1) Non-ND transcript → rejection message, no preview.
  await s.setFileInput('.transcript-upload input[type=file]', otherPdf);
  await s.waitFor(
    `document.querySelector('.toast')?.textContent.includes("Only Notre Dame's unofficial transcript")`,
  );
  if (await s.evalJs(`!!document.querySelector('.transcript-preview')`)) {
    throw new Error('preview must NOT appear for a non-ND transcript');
  }
  console.log('  non-ND transcript rejected with the required message');
  await s.shot('transcript-rejected');

  // 2) ND transcript → preview → add all.
  await s.setFileInput('.transcript-upload input[type=file]', ndPdf);
  await s.waitFor(`document.querySelector('.transcript-preview')`);
  const rows = await s.evalJs(
    `document.querySelectorAll('.transcript-preview table tr').length - 1`,
  );
  console.log('  preview rows:', rows);
  if (rows < 4) throw new Error(`expected >=4 parsed courses, got ${rows}`);
  await s.shot('transcript-preview');

  await s.evalJs(
    `[...document.querySelectorAll('.transcript-preview button')].find(b => b.textContent === 'Add selected courses').click()`,
  );
  await s.waitFor(
    `document.querySelectorAll('table.courses tr').length > 4 && !document.querySelector('.transcript-preview')`,
  );
  const added = await s.evalJs(
    `[...document.querySelectorAll('table.courses .cid')].map(e => e.textContent)`,
  );
  console.log('  course table now has:', JSON.stringify(added));
  const gpa = await s.evalJs(`document.querySelector('input[step="0.01"]')?.value`);
  console.log('  GPA prefilled from transcript:', gpa);
  if (!gpa) throw new Error('cumulative GPA was not prefilled');
  await s.shot('transcript-added');

  // 3) External transcript (Master's slot) → editable preview → add → verdicts.
  await s.setFileInput('.external-file-masters', externalPdf);
  await s.waitFor(`[...document.querySelectorAll('.external-card h3')].some(h => h.textContent.includes('Master’s transcript'))`);
  const uni = await s.evalJs(`[...document.querySelectorAll('.external-card .field input')].map(i => i.value)[0]`);
  console.log('  external university guessed:', uni);
  if (uni !== 'Purdue University') throw new Error(`university not guessed from the PDF header: '${uni}'`);
  const extRows = await s.evalJs(`document.querySelectorAll('.external-card .transcript-preview table tr').length - 1`);
  console.log('  external preview rows:', extRows);
  if (extRows !== 3) throw new Error(`expected 3 parsed external courses, got ${extRows}`);
  await s.shot('external-preview');
  await s.evalJs(
    `[...document.querySelectorAll('.external-card button')].find(b => b.textContent === 'Add checked courses').click()`,
  );
  await s.waitFor(`document.querySelector('.external-verdicts')`);
  const verdicts = await s.evalJs(
    `[...document.querySelectorAll('.external-verdict')].map(e => e.textContent)`,
  );
  console.log('  external verdicts:', JSON.stringify(verdicts));
  if (verdicts.length !== 3 || !verdicts.every((v) => v.includes('not yet reviewed by the DGS'))) {
    throw new Error('expected 3 pending external verdicts (the sandbox has no ExternalCourses tab)');
  }
  const copyBtn = await s.evalJs(
    `[...document.querySelectorAll('.external-verdicts button')].some(b => b.textContent.includes('Copy review request for 3 courses'))`,
  );
  if (!copyBtn) throw new Error('the copy-ready review request button is missing');
  const transferDetail = await s.evalJs(
    `[...document.querySelectorAll('.req')].map(e => e.textContent).find(t => t.includes('transfer credits counted')) ?? ''`,
  );
  console.log('  transfer row mentions:', transferDetail.slice(0, 140));
  if (!transferDetail.includes('Not yet reviewed by the DGS')) {
    throw new Error('the §5.2 transfer row does not mention the unreviewed external courses');
  }
  await s.shot('external-added');

  // 4) Scanned transcript (Bachelor's slot) → explicit OCR opt-in (English only)
  //    → OCR in the browser (self-hosted WASM) → flagged preview → add.
  await s.setFileInput('.external-file-bachelors', scanPdf);
  await s.waitFor(`document.querySelector('.ocr-optin')`);
  const optinText = await s.evalJs(`document.querySelector('.ocr-optin')?.textContent`);
  if (!optinText.includes('English-language transcripts only')) {
    throw new Error('the OCR opt-in must state English-only');
  }
  await s.shot('external-ocr-optin');
  await s.evalJs(
    `[...document.querySelectorAll('.ocr-optin button')].find(b => b.textContent === 'Try OCR (English only)').click()`,
  );
  // Model load + three-page-equivalent OCR takes a while in headless Chrome.
  await s.waitFor(`document.querySelector('.external-card .transcript-preview')`, 120000);
  const ocrBanner = await s.evalJs(`document.querySelector('.ocr-banner')?.textContent ?? ''`);
  if (!ocrBanner.includes('English transcripts only')) throw new Error('OCR preview banner missing');
  const ocrUni = await s.evalJs(`[...document.querySelectorAll('.external-card .field input')].map(i => i.value)[0]`);
  const ocrRows = await s.evalJs(`document.querySelectorAll('.external-card .transcript-preview table tr').length - 1`);
  console.log('  OCR university:', ocrUni, '| rows:', ocrRows);
  if (ocrUni !== 'Purdue University') throw new Error(`OCR university guess wrong: '${ocrUni}'`);
  if (ocrRows !== 3) throw new Error(`expected 3 OCR-parsed courses, got ${ocrRows}`);
  await s.shot('external-ocr-preview');
  // Do what the preview tells every student to do: check the fields and fix
  // what OCR got wrong (an empty credits box blocks that row from being added).
  const fixed = await s.evalJs(`(() => {
    let n = 0;
    for (const tr of [...document.querySelectorAll('.external-card .transcript-preview table tr')].slice(1)) {
      const credits = tr.querySelector('input[type=number][max="30"]');
      if (credits && credits.value === '') { credits.value = '3'; credits.dispatchEvent(new Event('change')); n++; }
      const year = tr.querySelector('input[type=number][max="2040"]');
      if (year && year.value === '') { year.value = '2023'; year.dispatchEvent(new Event('change')); n++; }
    }
    return n;
  })()`);
  console.log('  OCR fields fixed by hand in the preview:', fixed);
  await s.evalJs(
    `[...document.querySelectorAll('.external-card button')].find(b => b.textContent === 'Add checked courses').click()`,
  );
  await s.waitFor(`document.querySelectorAll('.external-verdict').length === 6`);
  console.log('  6 external courses (3 typed + 3 OCR) in the verdicts block');
  await s.shot('external-ocr-added');
}
