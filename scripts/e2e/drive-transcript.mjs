// E2E: the transcript-upload flow — reject a non-ND PDF with the right message,
// preview + add the courses from an ND PDF, prefill the GPA. Then the
// external-transcripts card: upload another university's PDF into the Master's
// slot, correct/confirm the preview, and check the DGS-verdict lines (in the
// sandbox the ExternalCourses tab is unconfigured, so everything is honestly
// "not yet reviewed" and the copy-ready review request appears).
export async function driveTranscript(s, baseUrl, ndPdf, otherPdf, externalPdf, scanPdf, bannerPdf) {
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

  // 2b) An unlisted (typically non-CSE) ND course typed by hand → the single
  // "Ask the DGS to review" card offers a copy-ready request addressed to the
  // DGS + Graduate Program Administrator (2026-09-03).
  await s.evalJs(`(() => {
    const form = document.querySelector('.course-form');
    form.querySelector('input[placeholder="CSE 60641"]').value = 'MATH 60610';
    [...form.querySelectorAll('button')].find((b) => b.textContent === 'Add course').click();
  })()`);
  await s.waitFor(`document.querySelector('.dgs-review')`);
  const ndReview = await s.evalJs(`document.querySelector('.dgs-review').textContent`);
  // 2 pending: the typed MATH 60610, plus the ND transcript's transfer-credit
  // line CS 50300 "Operating Systems" — no §5.2 credit, but its core-keyword
  // title joins the request for §4.4.1 review (DGS rule 2026-09-04).
  if (!ndReview.includes('Copy review request for 2 courses') || !ndReview.includes('Graduate Program Administrator')) {
    throw new Error('review card wrong: ' + ndReview.slice(0, 140));
  }
  console.log('  unlisted ND course → review request offered');
  await s.shot('nd-review');

  // 3) External transcript (Master's slot) → editable preview → add → verdicts.
  await s.setFileInput('.external-file-masters', externalPdf);
  await s.waitFor(`[...document.querySelectorAll('.external-card h3')].some(h => h.textContent.includes('Previous Master’s Transcript'))`);
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
  // ONE combined request: the MATH course from 2b + the 3 external courses.
  const copyBtn = await s.evalJs(
    `[...document.querySelectorAll('.dgs-review button')].some(b => b.textContent.includes('Copy review request for 5 courses'))`,
  );
  if (!copyBtn) throw new Error('the combined review request button is missing/wrong');
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
  // Undergrad relevance filter (2026-09-04): OCR reads 3 courses, but only
  // the two whose titles match the core keywords are offered — 'Special
  // Topics in Systems' is left out (undergraduate credits never transfer).
  if (ocrRows !== 2) throw new Error(`expected 2 core-relevant OCR courses in the preview, got ${ocrRows}`);
  const bachNote = await s.evalJs(`document.querySelector('.external-card .transcript-preview .hint.warn')?.textContent ?? ''`);
  if (!bachNote.includes('do not transfer') || !bachNote.includes('1 other course was read and left out')) {
    throw new Error('bachelors preview note missing/wrong: ' + bachNote.slice(0, 160));
  }
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
  await s.waitFor(`document.querySelectorAll('.external-verdict').length === 5`);
  console.log('  5 external courses (3 typed + 2 core-relevant OCR) in the verdicts block');
  // Undergrad core-title rule (2026-09-03; relevance filter 2026-09-04): only
  // the two keyword-matching bachelors courses were added, and both join the
  // request — MATH (1) + masters slot (3) + those two = 6 pending.
  const combined6 = await s.evalJs(`document.querySelector('.dgs-review')?.textContent ?? ''`);
  if (!combined6.includes('Copy review request for 7 courses')) {
    throw new Error('expected 7 pending after OCR (undergrad core-title rule): ' + combined6.slice(0, 140));
  }
  console.log('  undergrad core-title courses joined the review request (7 pending)');
  await s.shot('external-ocr-added');

  // 5) Banner two-column official transcript (Ph.D. slot, 2026-09-05): read
  // column by column through real pdfjs; the student's nd.edu e-mail in its
  // header must NOT redirect it to the ND row; the transfer-credit block is
  // left out with a note; the institution comes from the legend page.
  await s.setFileInput('.external-file-phd', bannerPdf);
  await s.waitFor(`[...document.querySelectorAll('.external-card h3')].some(h => h.textContent.includes('Previous Ph.D. Transcript'))`);
  const redirected = await s.evalJs(`document.querySelector('.toast')?.textContent.includes('looks like a Notre Dame transcript') ?? false`);
  if (redirected) throw new Error('the Banner transcript was redirected to the ND row because of an nd.edu e-mail');
  const bannerUni = await s.evalJs(`[...document.querySelectorAll('.external-card .field input')].map(i => i.value)[0]`);
  const bannerRows = await s.evalJs(`document.querySelectorAll('.external-card .transcript-preview table tr').length - 1`);
  const bannerIds = await s.evalJs(
    `[...document.querySelectorAll('.external-card .transcript-preview table tr')].slice(1).map(tr => tr.querySelectorAll('input')[1]?.value ?? tr.cells[1]?.textContent)`,
  );
  const transferNote = await s.evalJs(`[...document.querySelectorAll('.external-card .transcript-preview .hint.warn')].map(e => e.textContent).join(' | ')`);
  console.log('  Banner two-column transcript:', bannerUni, '|', bannerRows, 'rows |', JSON.stringify(bannerIds));
  if (bannerUni !== 'Example Institute of Technology') throw new Error('Banner institution not found on the legend page: ' + bannerUni);
  if (bannerRows !== 10) throw new Error(`expected 10 institution-credit rows from the Banner transcript, got ${bannerRows}`);
  if (!/2 rows listed under .Transfer credit accepted by the institution. were left out/.test(transferNote)) {
    throw new Error('transfer-credit block note missing: ' + transferNote);
  }
  await s.shot('banner-preview');
  await s.evalJs(`[...document.querySelectorAll('.external-card button')].find(b => b.textContent === 'Cancel').click()`);
}
