// E2E: the transcript-upload flow — reject a non-ND PDF with the right message,
// preview + add the courses from an ND PDF, prefill the GPA.
export async function driveTranscript(s, baseUrl, ndPdf, otherPdf) {
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
}
