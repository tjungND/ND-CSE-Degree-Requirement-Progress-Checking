// E2E: the transcript-upload flow — reject a non-ND PDF with the right message,
// preview + add the courses from an ND PDF, prefill the GPA. Then the
// external-transcripts card: upload another university's PDF into the Master's
// slot, correct/confirm the preview, and check the DGS-verdict lines (in the
// sandbox the ExternalCourses tab is unconfigured, so everything is honestly
// "not yet reviewed" and the copy-ready review request appears).
export async function driveTranscript(s, baseUrl, ndPdf, otherPdf, externalPdf, scanPdf, bannerPdf, watermarkedPdf, combinedPdf, ndUgPdf) {
  await s.open(baseUrl, '.transcript-upload');
  await s.evalJs(`localStorage.clear()`);
  await s.open(baseUrl, '.transcript-upload');

  // 1) Non-ND transcript → rejection message, no preview.
  await s.setFileInput('.transcript-upload input[type=file]', otherPdf);
  // The rejection is a persistent inline message under the row (2026-09-05,
  // usability review item 6), not a vanishing toast — and it has focus.
  await s.waitFor(
    `document.querySelector('.transcript-upload .import-error')?.textContent.includes("Only ND's unofficial transcript")`,
  );
  if (await s.evalJs(`!!document.querySelector('.transcript-preview')`)) {
    throw new Error('preview must NOT appear for a non-ND transcript');
  }
  if (!(await s.evalJs(`document.activeElement?.classList.contains('import-error')`))) {
    throw new Error('the rejection message must receive focus (role=alert, tabindex=-1)');
  }
  console.log('  non-ND transcript rejected with the required message (inline, focused)');
  await s.shot('transcript-rejected');
  await s.evalJs(`document.querySelector('.transcript-upload .import-error button').click()`);
  await s.waitFor(`!document.querySelector('.transcript-upload .import-error')`);

  // 2) ND transcript (COMBINED since 2026-09-05: a B.S. before the Ph.D.) →
  //    preview reads the entry term (Fall 2026, the first graduate-level term),
  //    files the two undergraduate terms as prior coursework, unticks the
  //    undergraduate course that cannot matter (Calculus) → add.
  await s.setFileInput('.transcript-upload input[type=file]', ndPdf);
  await s.waitFor(`document.querySelector('.transcript-preview')`);
  const rows = await s.evalJs(
    `document.querySelectorAll('.transcript-preview table tr').length - 1`,
  );
  console.log('  preview rows:', rows);
  if (rows !== 9) throw new Error(`expected 9 parsed courses (1 transfer + 3 undergraduate + 5 graduate), got ${rows}`);
  const entryLine = await s.evalJs(`document.querySelector('.transcript-preview .entry-term-line')?.textContent ?? ''`);
  const entryTicked = await s.evalJs(`document.querySelector('.transcript-preview .use-entry-term')?.checked`);
  console.log('  entry-term line:', entryLine.slice(0, 120), '| ticked:', entryTicked);
  if (!entryLine.includes('Set your entry term to Fall 2026') || !entryLine.includes('first graduate-level term') || entryTicked !== true) {
    throw new Error('the preview must offer the entry term read from the transcript, ticked');
  }
  const priorNote = await s.evalJs(`document.querySelector('.transcript-preview .prior-note')?.textContent ?? ''`);
  if (!priorNote.startsWith('3 courses dated before Fall 2026')) throw new Error('prior-coursework note missing/wrong: ' + priorNote.slice(0, 120));
  const ticks = await s.evalJs(
    `[...document.querySelectorAll('.transcript-preview table tr')].slice(1).map(tr => tr.querySelector('.cid').textContent + ':' + (tr.querySelector('input[type=checkbox]').checked ? 'on' : 'off') + ':' + tr.cells[5].textContent)`,
  );
  console.log('  preview ticks:', JSON.stringify(ticks));
  if (!ticks.includes('MATH 10550:off:before entry — prior undergraduate coursework')) throw new Error('an irrelevant undergraduate course must start unticked');
  if (!ticks.includes('CSE 30321:on:before entry — prior undergraduate coursework')) throw new Error('a core-title undergraduate course must start ticked');
  if (!ticks.includes('CSE 60641:on:')) throw new Error('a program course must start ticked without a prior note');
  // The dated bachelor's award (2026-09-06) fills "Bachelor's degree awarded" on add; the preview says so.
  const bsLine = await s.evalJs(`document.querySelector('.transcript-preview .bachelors-line')?.textContent ?? ''`);
  console.log('  bachelor’s line:', bsLine.slice(0, 140));
  if (!bsLine.includes('Bachelor of Science awarded 2021-05-16') || !bsLine.includes('will be set to Spring 2021')) throw new Error('the preview must announce the bachelor’s award term: ' + bsLine.slice(0, 160));
  await s.shot('transcript-preview');

  await s.evalJs(
    `[...document.querySelectorAll('.transcript-preview button')].find(b => /^Add \\d+ selected course/.test(b.textContent)).click()`,
  );
  await s.waitFor(
    `document.querySelectorAll('table.courses tr').length > 4 && !document.querySelector('.transcript-preview')`,
  );
  const added = await s.evalJs(
    `[...document.querySelectorAll('table.courses .cid')].map(e => e.textContent)`,
  );
  console.log('  course table now has:', JSON.stringify(added));
  if (added.includes('MATH 10550')) throw new Error('the unticked undergraduate course was added');
  const gpa = await s.evalJs(`document.querySelector('input[step="0.01"]')?.value`);
  console.log('  GPA prefilled from transcript:', gpa);
  if (!gpa) throw new Error('cumulative GPA was not prefilled');
  // "Bachelor's degree awarded" was filled from the transcript (2026-09-06): the toast says so and the standing card shows it, flagged.
  const addToast = await s.evalJs(`document.querySelector('.toast')?.textContent ?? ''`);
  const bsYear = await s.evalJs(`document.querySelector('[data-key="standing.bachelors.year"]')?.value`);
  const bsSeason = await s.evalJs(`document.querySelector('[data-key="standing.bachelors.season"]')?.value`);
  const bsNote = await s.evalJs(`document.querySelector('.bachelors-note')?.textContent ?? ''`);
  console.log('  bachelor’s award from the transcript:', bsSeason, bsYear, '|', bsNote.slice(0, 90));
  if (!addToast.includes('“Bachelor’s degree awarded” set to Spring 2021')) throw new Error('the add toast must say the award term was set: ' + addToast.slice(0, 220));
  if (bsYear !== '2021' || bsSeason !== 'spring' || !bsNote.startsWith('Spring 2021 was read from your transcript')) throw new Error(`standing card: bachelor’s award ${bsSeason} ${bsYear} — ${bsNote.slice(0, 100)}`);
  // The Notre Dame row now names what it added and offers Remove (2026-09-06),
  // like a previous-university slot — and the import stays available.
  const ndRow = await s.evalJs(`document.querySelector('.transcript-upload')?.textContent ?? ''`);
  if (!ndRow.includes('7 courses from your transcript') || !ndRow.includes('Import again') || !(await s.evalJs(`!!document.querySelector('[data-key="import.nd.remove"]')`))) {
    throw new Error('the Notre Dame row must show the imported count, Remove and Import again: ' + ndRow.slice(0, 160));
  }
  // The standing card now shows the term read from the transcript, flagged.
  const entryNote = await s.evalJs(`document.querySelector('.entry-note')?.textContent ?? ''`);
  const entryYear = await s.evalJs(`document.querySelector('.card input[type=number][max="2040"]')?.value`);
  console.log('  standing card entry term:', entryYear, '|', entryNote.slice(0, 100));
  if (entryYear !== '2026' || !entryNote.startsWith('Fall 2026 was read from your transcript')) {
    throw new Error('the standing card must show the transcript entry term, flagged as read from the transcript');
  }
  const priorHeading = await s.evalJs(`[...document.querySelectorAll('h3.subhead')].map(h => h.textContent).find(t => t.includes('before entering the program')) ?? ''`);
  if (!priorHeading.includes('undergraduate coursework')) throw new Error('prior Notre Dame coursework heading missing: ' + priorHeading);
  // Residence is counted from the entry term: the full-time checkboxes list
  // the program terms only (never the undergraduate Fall 2024 / Spring 2025).
  // (A term counted automatically reads "✓ Fall 2027 — counted automatically (9+ credits entered)" since 2026-09-05.)
  const ftTerms = await s.evalJs(`[...document.querySelectorAll('.ft-term')].map(e => e.textContent.trim().replace(/^✓\\s*/, '').replace(/\\s[—(].*$/, ''))`);
  console.log('  full-time term checkboxes:', JSON.stringify(ftTerms));
  if (JSON.stringify(ftTerms) !== JSON.stringify(['Fall 2026', 'Spring 2027', 'Fall 2027'])) {
    throw new Error('residency terms must start at the entry term');
  }
  await s.shot('transcript-added');

  // 2b) An unlisted (typically non-CSE) ND course typed by hand → the single
  // "Ask the DGS to review" card offers a copy-ready request addressed to the
  // DGS alone (2026-09-06: the Grad Admin is not part of the review).
  await s.evalJs(`(() => {
    const form = document.querySelector('.course-form');
    form.querySelector('input.course-id').value = 'MATH 60610'; // labelled "Course number" since 2026-09-05 (no placeholder)
    [...form.querySelectorAll('button')].find((b) => b.textContent === 'Add course').click();
  })()`);
  await s.waitFor(`document.querySelector('.dgs-review')`);
  const ndReview = await s.evalJs(`document.querySelector('.dgs-review').textContent`);
  // 3 pending: the typed MATH 60610, the ND transcript's transfer-credit
  // line CS 50300 "Operating Systems" — no §5.2 credit, but its core-keyword
  // title joins the request for §4.4.1 review (DGS rule 2026-09-04) — and
  // the undergraduate CSE 30321 "Computer Architecture" taken before entry
  // (2026-09-05: prior Notre Dame coursework not in the Courses tab).
  if (!ndReview.includes('Copy review request for 3 courses') || ndReview.includes('Grad Admin') || !ndReview.includes('send it to the DGS')) {
    throw new Error('review card wrong: ' + ndReview.slice(0, 140));
  }
  console.log('  unlisted ND course → review request offered');
  // The Grad Admin button is active on met requirements alone (DGS 2026-09-06, late evening):
  // nothing to transfer and no milestone yet, but the GPA and Notre Dame-credit rows are met.
  const gaState = JSON.parse(await s.evalJs(`JSON.stringify((() => { const card = document.querySelector('.grad-admin-request'); const b = card?.querySelector('[data-key="gradadmin.copy"]'); return { inactive: b?.getAttribute('aria-disabled'), chip: card?.querySelector('.chip-note')?.textContent, line: [...(card?.querySelectorAll('.review-line') ?? [])].map(e => e.textContent).find(t => / met so far — /.test(t)) ?? '' }; })())`));
  console.log('  Grad Admin card after the ND import:', JSON.stringify(gaState));
  if (gaState.inactive === 'true' || !/^\d+ requirements? met so far — /.test(gaState.line)) throw new Error('the Grad Admin button must be active on met requirements alone: ' + JSON.stringify(gaState));
  await s.shotElement('grad-admin-met-only', '.grad-admin-request');
  await s.shot('nd-review');
  // Copy → the check-before-you-send dialog (2026-09-06 evening): the DGS by
  // name and address, the subject, the message; OK closes it, focus returns.
  await s.evalJs(`document.querySelector('[data-key="review.copy"]').click()`);
  await s.waitFor(`document.querySelector('dialog.copy-check[open]')`);
  const dlg = JSON.parse(await s.evalJs(`JSON.stringify((() => {
    const d = document.querySelector('dialog.copy-check');
    const dgs = [...document.querySelectorAll('.contact-card li')].find(li => li.textContent.startsWith('Director of Graduate Studies'));
    const lead = d.querySelector('.copy-lead');
    return { title: d.querySelector('h2').textContent, to: d.querySelector('.copy-to').textContent, subject: d.querySelector('.copy-subject').textContent, text: d.querySelector('textarea').value.slice(0, 60), dgsEmail: dgs?.querySelector('a')?.textContent ?? '', lead: lead?.querySelector('strong')?.textContent ?? '', leadBeforeMessage: !!lead && !!(lead.compareDocumentPosition(d.querySelector('textarea')) & Node.DOCUMENT_POSITION_FOLLOWING) };
  })())`));
  console.log('  copy dialog:', dlg.title, '|', dlg.to, '|', dlg.subject);
  if (!/^Review request (copied — check it before you send|— copy it yourself \(the clipboard was blocked\))$/.test(dlg.title)) throw new Error('copy dialog title: ' + dlg.title);
  if (dlg.dgsEmail === '' || !dlg.to.startsWith('To: Director of Graduate Studies') || !dlg.to.includes(dlg.dgsEmail)) throw new Error('copy dialog recipient: ' + dlg.to);
  if (dlg.subject !== 'Subject: Course review request (degree self-check)' || !dlg.text.startsWith('Subject: Course review request')) throw new Error('copy dialog subject/text: ' + dlg.subject + ' | ' + dlg.text);
  // The emphasised lead line (DGS request 2026-09-06, late evening) sits right above the message and says it is on the clipboard.
  if (!/^(✓ The following message has been copied to your clipboard\.|The following message was NOT copied — your browser blocked the clipboard\.)$/.test(dlg.lead) || !dlg.leadBeforeMessage) throw new Error('copy dialog lead line: ' + JSON.stringify(dlg.lead) + ' before message: ' + dlg.leadBeforeMessage);
  // Numbered steps (2026-09-06 evening): paste, attach the ORIGINAL transcripts (emphasised), send.
  await s.shot('copy-dialog');
  await s.evalJs(`document.querySelector('[data-key="copy.ok"]').click()`);
  await s.waitFor(`!document.querySelector('dialog.copy-check')`);
  if ((await s.evalJs(`document.activeElement?.dataset?.key ?? ''`)) !== 'review.copy') throw new Error('focus must return to the copy button after OK');
  console.log('  copy dialog names the DGS, shows subject and message; OK closes it, focus back on the button');

  // The guidance above the four rows (DGS 2026-09-11): a bachelor's and a
  // master's from one university arrive as TWO transcripts as often as one —
  // Notre Dame's own 4+1 issues two — so the note has to name both shapes and
  // say where each goes before the student picks a file.
  const combined = await s.evalJs(`document.querySelector('.combined-note')?.textContent ?? ''`);
  for (const needed of ['Two transcripts:', 'One transcript covering both degrees:', 'Previous Master’s Transcript', 'Notre Dame’s own transcripts belong in these rows']) {
    if (!combined.includes(needed)) throw new Error('the transcript-shape note must say ' + JSON.stringify(needed) + ' — got: ' + combined);
  }
  console.log('  transcript-shape note covers two transcripts, one combined, and where ND’s own go');
  await s.evalJs(`(() => { const c = [...document.querySelectorAll('.card')].find(c => c.querySelector('h2')?.textContent.includes('Transcripts')); if (c) c.id = 'shot-transcripts'; })()`);
  await s.shotElement('transcript-shapes', '#shot-transcripts');

  // 3) External transcript (Master's slot) → editable preview → add → verdicts.
  await s.setFileInput('.external-file-masters', externalPdf);
  await s.waitFor(`[...document.querySelectorAll('.external-card h3')].some(h => h.textContent.includes('Previous Master’s Transcript'))`);
  const uni = await s.evalJs(`[...document.querySelectorAll('.external-card .field input')].map(i => i.value)[0]`);
  console.log('  external university guessed:', uni);
  if (uni !== 'Purdue University') throw new Error(`university not guessed from the PDF header: '${uni}'`);
  const extRows = await s.evalJs(`document.querySelectorAll('.external-card .transcript-preview table tr').length - 1`);
  console.log('  external preview rows:', extRows);
  if (extRows !== 3) throw new Error(`expected 3 parsed external courses, got ${extRows}`);
  // A text-layer import is COMPACT and locked (2026-09-06, second pass):
  // number, title, credits, grade and term as printed — only "Taken as" is a
  // control; and while the preview is open every transcript-row button is
  // inactive, explaining itself on click instead of acting.
  const compact = await s.evalJs(`[...document.querySelectorAll('.external-card .transcript-preview tr.compact')].map(tr => tr.querySelectorAll('input:not([type=checkbox]), select').length + ':' + [...tr.querySelectorAll('td.locked-cell')].map(td => td.textContent.trim()).join('/'))`);
  console.log('  compact rows (controls:locked cells):', JSON.stringify(compact));
  // The term cell shows the short form "FA23" (DGS 2026-09-07); its tooltip is the full name.
  if (compact.length !== 3 || !compact.every((c) => /^1:\d+(\.\d+)? cr\/[A-Z][+-]?\/(FA|SP|SU)\d{2}$/.test(c))) {
    throw new Error('text-layer rows must be compact: only the level select editable, credits/grade/term locked, the term in its short form');
  }
  const termTip = await s.evalJs(`document.querySelector('.external-card .transcript-preview tr.compact td.locked-cell abbr.term')?.title ?? ''`);
  if (!/^(Fall|Spring|Summer) \d{4}$/.test(termTip)) {
    throw new Error('the short term must carry the full name as its tooltip: ' + termTip);
  }
  const inactive = await s.evalJs(`[...document.querySelectorAll('.transcript-upload button, .external-slot button')].map(b => b.textContent.trim() + ':' + b.getAttribute('aria-disabled'))`);
  console.log('  transcript-row buttons while the preview is open:', JSON.stringify(inactive));
  if (inactive.length < 4 || !inactive.every((b) => b.endsWith(':true'))) throw new Error('every Import/Remove button must be inactive while a preview is open');
  const ndBefore = await s.evalJs(`document.querySelectorAll('table.courses .cid').length`);
  await s.evalJs(`document.querySelector('[data-key="import.nd.remove"]').click()`);
  const inactiveToast = await s.evalJs(`document.querySelector('.toast')?.textContent ?? ''`);
  if (!inactiveToast.startsWith('Not available while a transcript preview is open') || (await s.evalJs(`document.querySelectorAll('table.courses .cid').length`)) !== ndBefore || !(await s.evalJs(`!!document.querySelector('.external-card .transcript-preview')`))) {
    throw new Error('an inactive Remove must explain itself and do nothing: ' + inactiveToast.slice(0, 100));
  }
  console.log('  inactive Remove explained itself, nothing removed');
  await s.shot('external-preview');
  await s.evalJs(
    `[...document.querySelectorAll('.external-card button')].find(b => /^Add \\d+ checked course/.test(b.textContent)).click()`,
  );
  await s.waitFor(`!document.querySelector('.external-card .transcript-preview') && [...document.querySelectorAll('h3.subhead')].some(h => h.textContent.includes('Purdue University'))`);
  // The DGS's rulings live on each course's line in the coursework table
  // (2026-09-06 — the separate verdicts block was removed as redundant): the
  // 3 Purdue courses are unreviewed §5.2 transfer CANDIDATES, amber (later
  // the same day: only CSE-related courses transfer, the DGS decides, so
  // every unreviewed graduate course is a candidate, never "would count");
  // the prior Notre Dame undergraduate course (CSE 30321, filed under the
  // Bachelor's slot by the combined import) may satisfy a core area, amber too.
  // Rows of the table under a coursework heading (the coursework card groups
  // courses by university + transcript).
  const groupLines = (heading) => s.evalJs(`(() => {
    const h = [...document.querySelectorAll('h3.subhead')].find(h => h.textContent.includes(${JSON.stringify(heading)}));
    const table = h?.nextElementSibling?.matches('.table-scroll') ? h.nextElementSibling : h?.nextElementSibling?.nextElementSibling;
    return [...(table?.querySelectorAll('tr') ?? [])].slice(1).map(tr => tr.querySelector('.cid').textContent + ' [' + (tr.querySelector('.mark')?.className ?? 'no mark') + '] ' + tr.querySelector('.cell-note').textContent);
  })()`);
  const purdueLines = await groupLines('Purdue University — Previous Master’s Transcript');
  console.log('  Purdue transfer lines:', JSON.stringify(purdueLines));
  const candidates = purdueLines.filter((l) => l.includes('mark-pending') && l.includes('pending DGS review — candidate for transfer credit (§5.2)'));
  const wouldCount = candidates.filter((l) => l.includes('would count toward regular courses'));
  if (purdueLines.length !== 3 || candidates.length !== 3 || wouldCount.length < 2) {
    throw new Error('expected the 3 Purdue lines to be amber transfer candidates, at least two "would count toward regular courses … if the DGS approves it" (the sandbox has no ExternalCourses tab)');
  }
  const groupHint = await s.evalJs(`(() => {
    const h = [...document.querySelectorAll('h3.subhead')].find(h => h.textContent.includes('Purdue University — Previous Master’s Transcript'));
    return h?.nextElementSibling?.matches('p.hint') ? h.nextElementSibling.textContent : '';
  })()`);
  if (!groupHint.includes('only CSE-related courses transfer') || !groupHint.includes('every graduate course here is a candidate')) {
    throw new Error('the transfer group must explain the candidate rule once above the table: ' + groupHint.slice(0, 160));
  }

  // 3c) The graduate-status rule (DGS 2026-09-06): set the bachelor's award to
  //     Spring 2024 by hand — every Purdue row (Fall 2023 / Spring 2024) is then
  //     "not counted — taken before / in the term your bachelor's degree was
  //     awarded", the candidate hint disappears, and only the core-sounding
  //     titles stay in the review request. Then back to 2021.
  const setBachelorsYear = async (year) => {
    await s.evalJs(`(() => { const y = document.querySelector('[data-key="standing.bachelors.year"]'); y.value = '${year}'; y.dispatchEvent(new Event('change')); })()`);
    await s.waitFor(`document.querySelector('[data-key="standing.bachelors.year"]')?.value === '${year}'`);
  };
  await setBachelorsYear('2024');
  const ruleLines = await groupLines('Purdue University — Previous Master’s Transcript');
  console.log('  with the bachelor’s awarded Spring 2024:', JSON.stringify(ruleLines));
  if (ruleLines.length !== 3 || ruleLines.some((l) => l.includes('mark-counts'))) throw new Error('rule lines: ' + JSON.stringify(ruleLines));
  if (!ruleLines.some((l) => l.startsWith('CS 50300') && l.includes('not counted — taken before your bachelor’s degree was awarded (Spring 2024)'))) throw new Error('CS 50300 (Fall 2023) must be excluded by the award term');
  if (!ruleLines.some((l) => l.startsWith('CS 58000') && l.includes('taken in the term your bachelor’s degree was awarded (Spring 2024)'))) throw new Error('CS 58000 (Spring 2024) must be excluded as taken in the award term');
  const hintGone = await s.evalJs(`(() => { const h = [...document.querySelectorAll('h3.subhead')].find(h => h.textContent.includes('Purdue University — Previous Master’s Transcript')); return !(h?.nextElementSibling?.matches('p.hint')); })()`);
  if (!hintGone) throw new Error('the candidate hint must disappear when no row is a candidate');
  const bsNoteChosen = await s.evalJs(`document.querySelector('.bachelors-note')?.textContent ?? ''`);
  if (bsNoteChosen.includes('read from your transcript')) throw new Error('a hand-set award term is no longer "read from your transcript"');
  const reviewAfterRule = await s.evalJs(`document.querySelector('.dgs-review')?.textContent ?? ''`);
  if (!reviewAfterRule.includes('Copy review request for 5 courses')) throw new Error('two excluded Purdue rows with core-sounding titles stay, one leaves — 5 expected: ' + reviewAfterRule.slice(0, 140));
  await s.evalJs(`(() => { const c = [...document.querySelectorAll('.card')].find(c => c.querySelector('h2')?.textContent.includes('Coursework')); c.id = 'shot-coursework'; })()`);
  await s.shotElement('bachelors-rule', '#shot-coursework');
  await setBachelorsYear('2021');
  const candidatesBack = await groupLines('Purdue University — Previous Master’s Transcript');
  if (!candidatesBack.every((l) => l.includes('candidate for transfer credit'))) throw new Error('back to 2021: the rows must be candidates again: ' + JSON.stringify(candidatesBack));
  if (!(await s.evalJs(`document.querySelector('.dgs-review')?.textContent ?? ''`)).includes('Copy review request for 6 courses')) throw new Error('back to 2021: 6 courses expected in the request');
  console.log('  bachelor’s award Spring 2024 → all three Purdue rows excluded (§5.2 status), 5 in the request; back to 2021 → candidates again');
  const priorNdLines = await groupLines('ND, before entering the program — undergraduate coursework');
  if (!priorNdLines.some((l) => l.startsWith('CSE 30321') && l.includes('mark-pending') && l.includes('may satisfy the Computer Architecture core-knowledge requirement'))) {
    throw new Error('the prior Notre Dame undergraduate course should carry an amber "may satisfy" line: ' + JSON.stringify(priorNdLines));
  }
  // ONE combined request: the 3 from 2b + the 3 external courses.
  const copyBtn = await s.evalJs(
    `[...document.querySelectorAll('.dgs-review button')].some(b => b.textContent.includes('Copy review request for 6 courses'))`,
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

  // 3b) The combined ND import filled the Bachelor's slot with the prior Notre
  // Dame undergraduate course; its Remove button frees the slot (and drops
  // that course from the request: 6 → 5 pending).
  await s.evalJs(`(() => {
    const slot = [...document.querySelectorAll('.external-slot')].find((e) => e.textContent.includes('Previous Undergraduate Transcript'));
    [...slot.querySelectorAll('button')].find((b) => b.textContent === 'Remove').click();
  })()`);
  await s.waitFor(`document.querySelector('.external-file-bachelors')`);
  const afterRemove = await s.evalJs(`document.querySelector('.dgs-review')?.textContent ?? ''`);
  if (!afterRemove.includes('Copy review request for 5 courses')) throw new Error('removing the prior ND undergraduate course should leave 5 pending: ' + afterRemove.slice(0, 140));
  console.log('  prior ND undergraduate course removed via the Bachelor’s slot (5 pending)');

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
    `[...document.querySelectorAll('.external-card button')].find(b => /^Add \\d+ checked course/.test(b.textContent)).click()`,
  );
  await s.waitFor(`[...document.querySelectorAll('h3.subhead')].some(h => h.textContent.includes('Purdue University — Previous Undergraduate Transcript'))`);
  const ocrLines = (await groupLines('Purdue University — Previous Master’s Transcript')).length + (await groupLines('Purdue University — Previous Undergraduate Transcript')).length;
  if (ocrLines !== 5) throw new Error(`expected 5 external course lines (3 typed + 2 core-relevant OCR), got ${ocrLines}`);
  console.log('  5 external courses (3 typed + 2 core-relevant OCR) in the coursework table');
  // Undergrad core-title rule (2026-09-03; relevance filter 2026-09-04): only
  // the two keyword-matching bachelors courses were added, and both join the
  // request — MATH + CS 50300 (2) + masters slot (3) + those two = 7 pending.
  const combined7 = await s.evalJs(`document.querySelector('.dgs-review')?.textContent ?? ''`);
  if (!combined7.includes('Copy review request for 7 courses')) {
    throw new Error('expected 7 pending after OCR (undergrad core-title rule): ' + combined7.slice(0, 140));
  }
  console.log('  undergrad core-title courses joined the review request (7 pending)');
  await s.shot('external-ocr-added');

  // 5) Banner two-column official transcript (Ph.D. slot, 2026-09-05): read
  // column by column through real pdfjs; the student's nd.edu e-mail in its
  // header must NOT redirect it to the ND row; the transfer-credit block is
  // left out with a note; the institution comes from the legend page.
  await s.setFileInput('.external-file-phd', bannerPdf);
  await s.waitFor(`[...document.querySelectorAll('.external-card h3')].some(h => h.textContent.includes('Previous Ph.D. Transcript'))`);
  const redirected = await s.evalJs(`[...document.querySelectorAll('.import-error, .hint.warn.nd-prior-note')].some(e => e.textContent.includes('looks like an ND transcript') || e.textContent.includes('is an ND transcript'))`);
  if (redirected) throw new Error('the Banner transcript was redirected to the ND row because of an nd.edu e-mail');
  const bannerUni = await s.evalJs(`[...document.querySelectorAll('.external-card .field input')].map(i => i.value)[0]`);
  const bannerRows = await s.evalJs(`document.querySelectorAll('.external-card .transcript-preview table tr').length - 1`);
  const bannerIds = await s.evalJs(
    `[...document.querySelectorAll('.external-card .transcript-preview table tr')].slice(1).map(tr => tr.querySelector('.cell-course input')?.value ?? tr.querySelector('.cell-course .course-id')?.textContent)`,
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
  await s.waitFor(`!document.querySelector('.external-card .transcript-preview')`);

  // 6) The same transcript over a text watermark (tiled institution name +
  // a diagonal banner, 2026-09-05): must read exactly like the clean one.
  await s.setFileInput('.external-file-phd', watermarkedPdf);
  await s.waitFor(`[...document.querySelectorAll('.external-card h3')].some(h => h.textContent.includes('Previous Ph.D. Transcript'))`);
  const wmUni = await s.evalJs(`[...document.querySelectorAll('.external-card .field input')].map(i => i.value)[0]`);
  const wmIds = await s.evalJs(
    `[...document.querySelectorAll('.external-card .transcript-preview table tr')].slice(1).map(tr => tr.querySelector('.cell-course input')?.value ?? tr.querySelector('.cell-course .course-id')?.textContent)`,
  );
  console.log('  watermarked Banner transcript:', wmUni, '|', JSON.stringify(wmIds));
  if (wmUni !== bannerUni || JSON.stringify(wmIds) !== JSON.stringify(bannerIds)) {
    throw new Error('the watermarked transcript did not read like the clean one');
  }
  await s.shot('banner-watermarked-preview');
  await s.evalJs(`[...document.querySelectorAll('.external-card button')].find(b => b.textContent === 'Cancel').click()`);
  await s.waitFor(`!document.querySelector('.external-card .transcript-preview')`);

  // 7) A COMBINED B.S.+M.S. transcript from one university (2026-09-05): the
  //    Master's slot is freed, then the PDF's bachelor's conferral line splits
  //    the rows — undergraduate rows can only serve §4.4.1 (the irrelevant one
  //    starts unticked), graduate rows are §5.2 transfer candidates — and the
  //    M.S. conferral marks the prior degree completed.
  await s.evalJs(`(() => {
    const slot = [...document.querySelectorAll('.external-slot')].find((e) => e.textContent.includes('Previous Master’s Transcript'));
    [...slot.querySelectorAll('button')].find((b) => b.textContent === 'Remove').click();
  })()`);
  await s.waitFor(`document.querySelector('.external-file-masters')`);
  await s.setFileInput('.external-file-masters', combinedPdf);
  await s.waitFor(`document.querySelector('.external-card .transcript-preview .mixed-note')`);
  const combinedRows = await s.evalJs(
    `[...document.querySelectorAll('.external-card .transcript-preview table tr')].slice(1).map(tr => (tr.querySelector('.cell-course input')?.value ?? tr.querySelector('.cell-course .course-id')?.textContent) + ':' + tr.querySelector('select.row-level').value + ':' + (tr.querySelector('input[type=checkbox]').checked ? 'on' : 'off'))`,
  );
  console.log('  combined transcript rows:', JSON.stringify(combinedRows));
  const expectedCombined = ['CS 25100:undergraduate:on', 'CS 30700:undergraduate:off', 'CS 35400:undergraduate:on', 'CS 50300:graduate:on', 'CS 58000:graduate:on'];
  if (JSON.stringify(combinedRows) !== JSON.stringify(expectedCombined)) throw new Error('combined transcript levels/ticks wrong');
  // A combined record makes "Bachelor's degree awarded" required in the preview. What it is
  // pre-filled WITH depends on whether the student has already answered (DGS bug 2026-09-07):
  // a term they set by hand — step 3c above set Spring 2021 — must survive this import, and the
  // transcript's own conferral line (May 2024) must not overwrite it.
  const bsCtl = JSON.parse(await s.evalJs(`JSON.stringify((() => { const y = document.querySelector('[data-key="ext.preview.bachelors.year"]'); return { year: y?.value, required: y?.required, season: document.querySelector('[data-key="ext.preview.bachelors.season"]')?.value, hint: document.querySelector('#ext-bachelors-hint')?.textContent.slice(0, 70) }; })())`));
  console.log('  preview bachelor’s control:', JSON.stringify(bsCtl));
  if (bsCtl.year !== '2021' || bsCtl.season !== 'spring' || bsCtl.required !== true || !bsCtl.hint.startsWith('Taken from “Bachelor’s degree awarded” under Your standing')) throw new Error('the combined preview must keep the term the student set by hand: ' + JSON.stringify(bsCtl));
  await s.shot('combined-preview');
  // The compact (text-layer) rows at the two desktop widths the DGS checks in
  // Safari (2026-09-06): one line per course, the small columns aligned across
  // rows, nothing spilling out of the card — measured, and a cropped screenshot
  // of the preview for the eye (combined-preview-1400.png / -1100.png).
  for (const width of [1400, 1100]) await checkCompactPreview(s, width);
  await s.send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 1900, deviceScaleFactor: 1, mobile: false });
  await s.evalJs('new Promise(r => requestAnimationFrame(() => setTimeout(r, 150)))');
  await s.evalJs(
    `[...document.querySelectorAll('.external-card button')].find(b => /^Add \\d+ checked course/.test(b.textContent)).click()`,
  );
  await s.waitFor(`!document.querySelector('.external-card .transcript-preview')`);
  const combinedToast = await s.evalJs(`document.querySelector('.toast')?.textContent ?? ''`);
  console.log('  combined toast:', combinedToast.slice(0, 160));
  if (!combinedToast.includes('(2 undergraduate, 2 graduate)') || !combinedToast.includes('Completed prior M.S. or Ph.D.')) {
    throw new Error('combined import must report the level split and set prior study from the M.S. conferral');
  }
  // The hand-set award term (3c) is kept — an import only replaces an inferred one (2026-09-06).
  if (combinedToast.includes('Bachelor’s degree awarded')) throw new Error('a hand-set award term must not be replaced by an import');
  if ((await s.evalJs(`document.querySelector('[data-key="standing.bachelors.year"]')?.value`)) !== '2021') throw new Error('the hand-set award term must survive the combined import');
  const headings = await s.evalJs(`[...document.querySelectorAll('h3.subhead')].map(h => h.textContent)`);
  console.log('  coursework headings:', JSON.stringify(headings));
  if (!headings.includes('Purdue University — Previous Undergraduate Transcript') || !headings.includes('Purdue University — Previous Master’s Transcript')) {
    throw new Error('the combined transcript must split into undergraduate and Master’s coursework groups');
  }
  // "Prior graduate study" is a radio group since 2026-09-05 (item 12).
  const priorSel = await s.evalJs(`[...document.querySelectorAll('input[type=radio][data-key^="standing.prior."]')].find(r => r.checked)?.value`);
  if (priorSel !== 'completed') throw new Error('prior study should be "completed" from the M.S. conferral line, got ' + priorSel);
  await s.shot('combined-added');

  // 8) A Notre Dame transcript in a previous-degree slot (2026-09-05) is
  //    accepted as the record of an earlier Notre Dame degree — read by the
  //    Notre Dame parser, filed under "University of Notre Dame", with the
  //    reminder that a transcript holding the current program belongs in the
  //    Notre Dame row.
  await s.setFileInput('.external-file-phd', ndPdf);
  await s.waitFor(`document.querySelector('.external-card .transcript-preview .nd-prior-note')`);
  const ndUni = await s.evalJs(`[...document.querySelectorAll('.external-card .field input')].map(i => i.value)[0]`);
  const ndSlotRows = await s.evalJs(
    `[...document.querySelectorAll('.external-card .transcript-preview table tr')].slice(1).map(tr => (tr.querySelector('.cell-course input')?.value ?? tr.querySelector('.cell-course .course-id')?.textContent) + ':' + tr.querySelector('select.row-level').value)`,
  );
  const ndTransferNote = await s.evalJs(`[...document.querySelectorAll('.external-card .transcript-preview .hint.warn')].map(e => e.textContent).join(' | ')`);
  // "Bachelor's degree awarded (required)" belongs on the Ph.D.-slot preview
  // too (DGS 2026-09-09): the award term decides which of these courses were
  // taken with graduate student status. Its year box must fit four digits AND
  // the spinner — at 58 px the last digit sat under the arrows.
  const bach = JSON.parse(await s.evalJs(`JSON.stringify((() => {
    const f = document.querySelector('.external-card .transcript-preview .bachelors-field');
    if (!f) return { present: false };
    const y = f.querySelector('input[type="number"]');
    return { present: true, label: f.querySelector('.label')?.textContent, w: Math.round(y.getBoundingClientRect().width), clientW: y.clientWidth, scrollW: y.scrollWidth };
  })())`));
  if (!bach.present) throw new Error('the Ph.D.-slot preview must show the bachelor’s award term');
  if (!/Bachelor.s degree awarded \(required\)/.test(bach.label ?? '')) throw new Error('bachelor’s field label: ' + bach.label);
  if (bach.clientW < 70) throw new Error('the year box is too narrow for four digits and the spinner: ' + JSON.stringify(bach));
  console.log('  Ph.D. slot shows the bachelor’s award term; its year box is', bach.w + 'px');
  console.log('  ND transcript in the Ph.D. slot:', ndUni, '|', JSON.stringify(ndSlotRows));
  if (ndUni !== 'University of Notre Dame') throw new Error('a Notre Dame transcript in a previous slot must be filed under University of Notre Dame: ' + ndUni);
  if (ndSlotRows.length !== 8 || !ndSlotRows.includes('CSE 30321:undergraduate') || !ndSlotRows.includes('CSE 60641:graduate')) {
    throw new Error('ND rows/levels wrong in the previous slot');
  }
  if (!/1 row listed under .Transfer credit accepted by the institution. was left out/.test(ndTransferNote)) throw new Error('ND transfer-block note missing: ' + ndTransferNote);
  await s.shot('nd-in-previous-slot');
  await s.evalJs(`[...document.querySelectorAll('.external-card button')].find(b => b.textContent === 'Cancel').click()`);
  await s.waitFor(`!document.querySelector('.external-card .transcript-preview')`);

  // 9) The Notre Dame transcript is removable like the others (2026-09-06):
  //    Remove takes back exactly what the import added — the 5 program
  //    courses and the transcript's own transfer-credit line (the prior
  //    undergraduate row went with the Bachelor's slot in 3b) — plus the GPA
  //    it filled in; the hand-typed MATH 60610 and the external courses stay.
  //    Undo puts everything back.
  const gpaBefore = await s.evalJs(`document.querySelector('input[step="0.01"]')?.value`);
  const idsBefore = await s.evalJs(`[...document.querySelectorAll('table.courses .cid')].map(e => e.textContent)`);
  const ndRowBefore = await s.evalJs(`document.querySelector('.transcript-upload')?.textContent ?? ''`);
  if (!ndRowBefore.includes('6 courses from your transcript')) throw new Error('ND row count before Remove: ' + ndRowBefore.slice(0, 120));
  const dgsBefore = await s.evalJs(`document.querySelector('.dgs-review')?.textContent ?? ''`);
  await s.evalJs(`document.querySelector('[data-key="import.nd.remove"]').click()`);
  await s.waitFor(`!document.querySelector('[data-key="import.nd.remove"]')`);
  const idsAfterRemove = await s.evalJs(`[...document.querySelectorAll('table.courses .cid')].map(e => e.textContent)`);
  const headingsAfterRemove = await s.evalJs(`[...document.querySelectorAll('h3.subhead')].map(h => h.textContent)`);
  const gpaAfterRemove = await s.evalJs(`document.querySelector('input[step="0.01"]')?.value`);
  const removeToast = await s.evalJs(`document.querySelector('.toast')?.textContent ?? ''`);
  console.log('  after ND Remove:', JSON.stringify(idsAfterRemove), '| GPA:', JSON.stringify(gpaAfterRemove), '|', removeToast.slice(0, 120));
  // The transcript's transfer-credit line (CS 50300 from Purdue, no degree
  // slot) had its own "graduate coursework (§5.2)" group — gone with it.
  if (idsAfterRemove.length !== idsBefore.length - 6 || idsAfterRemove.some((id) => /^CSE 6/.test(id)) || headingsAfterRemove.includes('Purdue University — graduate coursework (§5.2)')) {
    throw new Error('ND Remove must take back exactly the 6 transcript rows: ' + JSON.stringify(headingsAfterRemove));
  }
  if (!idsAfterRemove.includes('MATH 60610') || !idsAfterRemove.includes('CS 58000')) throw new Error('ND Remove must keep hand-typed and external rows');
  if (gpaAfterRemove !== '') throw new Error('ND Remove must clear the GPA the transcript filled in');
  if (!removeToast.startsWith('6 courses from your ND transcript removed, and the GPA it filled in.')) throw new Error('ND Remove toast wrong: ' + removeToast.slice(0, 120));
  const ndRowAfter = await s.evalJs(`document.querySelector('.transcript-upload')?.textContent ?? ''`);
  if (!ndRowAfter.includes('Import from PDF (alpha)') || ndRowAfter.includes('from your transcript')) throw new Error('ND row after Remove: ' + ndRowAfter.slice(0, 120));
  await s.shot('nd-removed');
  if ((await s.evalJs(`document.querySelector('[data-key="standing.bachelors.year"]')?.value`)) !== '2021') throw new Error('Remove must leave the bachelor’s award term alone');
  // The Undo must survive a re-render (2026-09-06 evening: it used to die with
  // the first keystroke, checkbox or toast after a Remove) — commit an
  // unrelated change, then Undo.
  await s.evalJs(`(() => { const g = document.querySelector('input[step="0.01"]'); g.value = '3.4'; g.dispatchEvent(new Event('change')); })()`);
  await s.waitFor(`document.querySelector('input[step="0.01"]')?.value === '3.4'`);
  if (!(await s.evalJs(`!!document.querySelector('.toast .toast-action')`))) throw new Error('the Undo toast must survive a re-render');
  await s.evalJs(`document.querySelector('.toast .toast-action').click()`);
  await s.waitFor(`document.querySelector('[data-key="import.nd.remove"]')`);
  const idsAfterUndo = await s.evalJs(`[...document.querySelectorAll('table.courses .cid')].map(e => e.textContent)`);
  const gpaAfterUndo = await s.evalJs(`document.querySelector('input[step="0.01"]')?.value`);
  if (JSON.stringify(idsAfterUndo) !== JSON.stringify(idsBefore) || gpaAfterUndo !== gpaBefore) {
    throw new Error(`Undo must restore the rows in their original order and the GPA (${gpaBefore} → ${gpaAfterUndo}; ${JSON.stringify(idsBefore)} → ${JSON.stringify(idsAfterUndo)})`);
  }
  const dgsAfterUndo = await s.evalJs(`document.querySelector('.dgs-review')?.textContent ?? ''`);
  if (dgsAfterUndo !== dgsBefore) throw new Error('the review card must come back exactly as it was: ' + dgsAfterUndo.slice(0, 120));
  if ((await s.evalJs(`document.activeElement?.dataset?.key ?? ''`)) !== 'import.nd.remove') throw new Error('focus must land on the Remove button after Undo');
  console.log('  ND transcript removed (rows + GPA) and restored with Undo — same order, same review card, Undo survived a re-render');

  // 10) The MSCSE side of the same card (DGS 2026-09-11). Notre Dame's 4+1
  //     issues two transcripts, so an MSCSE student's own bachelor's record
  //     arrives by itself in the Previous Undergraduate row. Its 40000-level
  //     CSE courses MAY count — "subject to all other constraints" — so they
  //     must be OFFERED, not dropped, and must end up in the review request
  //     rather than counted silently. The Notre Dame row is named for the
  //     program the student picked at the top.
  await s.evalJs(`localStorage.clear()`);
  await s.open(baseUrl, '.transcript-upload');
  await s.evalJs(`document.querySelector('[data-key="program.mscse"]').click()`);
  await s.waitFor(`document.querySelector('.transcript-upload')?.textContent.includes('ND Unofficial MSCSE Transcript')`);
  const phdLabel = await s.evalJs(`(() => { document.querySelector('[data-key="program.phd"]').click(); return document.querySelector('.transcript-upload')?.textContent ?? ''; })()`);
  if (!phdLabel.includes('ND Unofficial Ph.D. Transcript')) throw new Error('the Ph.D. tab must name the row "ND Unofficial Ph.D. Transcript": ' + phdLabel.slice(0, 120));
  await s.evalJs(`document.querySelector('[data-key="program.mscse"]').click()`);
  await s.waitFor(`document.querySelector('.transcript-upload')?.textContent.includes('ND Unofficial MSCSE Transcript')`);
  console.log('  the Notre Dame row follows the program tab: MSCSE → "ND Unofficial MSCSE Transcript", Ph.D. → "ND Unofficial Ph.D. Transcript"');

  await s.setFileInput('.external-file-bachelors', ndUgPdf);
  await s.waitFor(`document.querySelector('.external-card .transcript-preview table tr:nth-child(2)')`);
  const ugRows = await s.evalJs(
    `[...document.querySelectorAll('.external-card .transcript-preview table tr')].slice(1).map(tr => (tr.querySelector('.cell-course input')?.value ?? tr.querySelector('.cell-course .course-id')?.textContent) + ':' + (tr.querySelector('.cell-check input').checked ? 'ticked' : 'unticked'))`,
  );
  console.log('  ND undergraduate transcript in the Undergraduate row:', JSON.stringify(ugRows));
  // The 40000-level courses are the point: before today CSE 40166 (no core
  // keyword in its title) was dropped from the preview altogether.
  for (const want of ['CSE 40113:ticked', 'CSE 40166:ticked', 'CSE 60641:ticked']) {
    if (!ugRows.includes(want)) throw new Error('the preview must offer ' + want + ': ' + JSON.stringify(ugRows));
  }
  if (ugRows.some((r) => /^(MATH 10550|CSE 20110)/.test(r))) throw new Error('coursework that can count nothing must stay out: ' + JSON.stringify(ugRows));
  await s.shot('nd-undergrad-preview');
  await s.evalJs(`[...document.querySelectorAll('.external-card button')].find(b => /^Add \\d+ checked/.test(b.textContent)).click()`);
  await s.waitFor(`[...document.querySelectorAll('table.courses .cid')].map(e => e.textContent).includes('CSE 40166')`);

  // The student is never asked (DGS 2026-09-11): the app applies the two
  // 40000-level CSE courses to both degrees and saves the 60000-level one for
  // the MSCSE, and every line says which. No dropdown exists on this tab.
  const lineOf = (id) => `[...document.querySelectorAll('table.courses tr')].find(tr => tr.querySelector('.cid')?.textContent === '${id}')?.textContent ?? ''`;
  if (await s.evalJs(`document.querySelectorAll('[data-key^="course."][data-key$=".countedToward"]').length`)) throw new Error('the MSCSE tab must not ask which degrees a course counted toward');
  await s.waitFor(`/pending DGS review/.test(${lineOf('CSE 40113')})`);
  const after40113 = await s.evalJs(lineOf('CSE 40113'));
  const after40166 = await s.evalJs(lineOf('CSE 40166'));
  console.log('  CSE 40113:', after40113.replace(/\s+/g, ' ').slice(0, 190));
  console.log('  CSE 40166:', after40166.replace(/\s+/g, ' ').slice(0, 190));
  for (const [id, text] of [['CSE 40113', after40113], ['CSE 40166', after40166]]) {
    if (!/pending DGS review — would count toward regular courses \(3 cr\) once approved/.test(text)) throw new Error(id + ' must be counted only provisionally: ' + text.slice(0, 200));
    if (!/uses the 40000-level allowance \(6 credits, §3\.2\)/.test(text)) throw new Error(id + ' must cite the MSCSE allowance: ' + text.slice(0, 200));
  }
  const after60641 = await s.evalJs(lineOf('CSE 60641'));
  console.log('  CSE 60641:', after60641.replace(/\s+/g, ' ').slice(0, 190));
  // §3.5's senior-year graduate course: saved for the graduate degree and
  // said so; the two 40000-level courses are the ones applied to both.
  if (!/counts toward regular courses \(3 cr\)/.test(after60641) || !/will apply to your MSCSE only/.test(after60641)) {
    throw new Error('a 60000-level senior-year course must count in full, for the MSCSE only: ' + after60641.slice(0, 200));
  }
  for (const [id, text] of [['CSE 40113', after40113], ['CSE 40166', after40166]]) {
    if (!/will apply to both your bachelor’s degree and your MSCSE/.test(text)) throw new Error(id + ' must say it applies to both degrees: ' + text.slice(0, 200));
  }
  const dgsCard = await s.evalJs(`document.querySelector('.dgs-review')?.textContent ?? ''`);
  for (const id of ['CSE 40113', 'CSE 40166']) {
    if (!dgsCard.includes(id)) throw new Error(id + ' must be listed for the DGS: ' + dgsCard.slice(0, 300));
  }
  if (!/may count toward the MSCSE \(§3\.2\) inside the allowance for courses below the 60000 level/.test(dgsCard)) {
    throw new Error('the review card must say what the 40000-level courses may do: ' + dgsCard.slice(0, 400));
  }
  await s.shot('mscse-prior-undergrad');
  console.log('  MSCSE + ND undergraduate transcript: 40000-level courses offered, asked about, counted provisionally and listed for the DGS');

  // 11) The MSCSE has no qualifying examination, so nothing about §4.4.1 core
  //     knowledge or §4.4.2 specialization may reach a student on this tab
  //     (DGS 2026-09-11). Asserted over the whole page, and over the preview
  //     of an external transcript — where the undergraduate notes used to say
  //     "core knowledge only" whichever degree the student was in.
  const FORBIDDEN = /§4\.4(\.[123])?|core.knowledge|core area|core-area|core keyword|specialization|qualifying examination|qualifier/i;
  const pageText = await s.evalJs(`document.querySelector('#app').innerText`);
  const offending = pageText.split('\n').filter((line) => FORBIDDEN.test(line));
  if (offending.length > 0) throw new Error('the MSCSE tab must not mention the qualifying examination:\n  ' + offending.slice(0, 6).join('\n  '));
  console.log('  MSCSE tab: no §4.4.1 / §4.4.2 anywhere on the page (' + pageText.length + ' characters checked)');

  await s.setFileInput('.external-file-masters', combinedPdf);
  await s.waitFor(`document.querySelector('.external-card .transcript-preview table tr:nth-child(2)')`);
  const previewText = await s.evalJs(
    `(() => { const b = document.querySelector('.external-card .transcript-preview'); return b.innerText + ' || ' + [...b.querySelectorAll('[title]')].map(e => e.title).join(' || '); })()`,
  );
  const previewOffending = previewText.split(/\n|\|\|/).filter((line) => FORBIDDEN.test(line));
  if (previewOffending.length > 0) throw new Error('the MSCSE preview must not mention the qualifying examination:\n  ' + previewOffending.slice(0, 6).join('\n  '));
  const ugOffered = await s.evalJs(
    `[...document.querySelectorAll('.external-card .transcript-preview table tr')].slice(1).map(tr => (tr.querySelector('.cell-course input')?.value ?? tr.querySelector('.cell-course .course-id')?.textContent) + ':' + (tr.querySelector('.cell-check input').checked ? 'ticked' : 'unticked') + ':' + tr.querySelector('select.row-level').value)`,
  );
  console.log('  MSCSE + a combined external transcript:', JSON.stringify(ugOffered));
  // CS 35400 "Operating Systems" is undergraduate on that transcript: a core
  // keyword is no reason to offer it to an MSCSE student.
  if (ugOffered.some((r) => /^CS 35400/.test(r) && /:ticked/.test(r))) throw new Error('an undergraduate row must not be offered to an MSCSE student: ' + JSON.stringify(ugOffered));
  await s.shot('mscse-external-preview');
  await s.evalJs(`[...document.querySelectorAll('.external-card button')].find(b => b.textContent === 'Cancel').click()`);
  await s.waitFor(`!document.querySelector('.external-card .transcript-preview')`);
  console.log('  MSCSE preview: undergraduate rows are not offered on a core-sounding title, and no note names the qualifier');
}

// The Master's-slot preview of a text-layer transcript at a given window width
// (DGS check 2026-09-06, Safari + Chrome). Rows are `tr.compact`; from a
// 560 px preview up (the recorded decision) every cell of a row sits on its
// first line, the credits / grade / term / level columns start at the same x
// in every row, and nothing reaches past the row or scrolls the preview
// sideways. The cropped screenshot is what to look at when a number is off.
async function checkCompactPreview(s, width) {
  await s.send('Emulation.setDeviceMetricsOverride', { width, height: 1900, deviceScaleFactor: 1, mobile: false });
  await s.evalJs('new Promise(r => requestAnimationFrame(() => setTimeout(r, 200)))');
  const m = JSON.parse(
    await s.evalJs(`JSON.stringify((() => {
      const box = document.querySelector('.external-card .transcript-preview');
      const r = (e) => e.getBoundingClientRect();
      const rows = [...box.querySelectorAll('tr.compact')].map((tr) => {
        const cells = [...tr.querySelectorAll('td')].filter((td) => r(td).width > 0);
        return {
          id: tr.querySelector('.course-id')?.textContent ?? tr.querySelector('.cell-course input')?.value ?? '?',
          height: Math.round(r(tr).height),
          secondLine: cells.filter((td) => r(td).top - r(tr).top > 18).length,
          spill: Math.round(Math.max(0, ...cells.map((td) => r(td).right - r(tr).right), r(tr).right - r(box).right)),
          columns: [...tr.querySelectorAll('td.locked-cell, td.level-cell')].map((td) => Math.round(r(td).left)).join(','),
        };
      });
      const cs = getComputedStyle(box);
      // The one visible header, "Taken as", sits over the dropdown column (DGS 2026-09-07).
      const ths = [...box.querySelectorAll('tr:first-child th')].filter((th) => r(th).width > 2);
      const sel = box.querySelector('tr.compact select.row-level');
      const header = { labels: ths.map((th) => th.textContent), right: ths[0] ? Math.round(r(ths[0]).right) : null, left: ths[0] ? Math.round(r(ths[0]).left) : null, selectRight: sel ? Math.round(r(sel).right) : null, selectLeft: sel ? Math.round(r(sel).left) : null, above: !!(ths[0] && sel) && r(ths[0]).bottom <= r(sel).top };
      return { previewWidth: Math.round(box.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)), sideways: box.scrollWidth - box.clientWidth, rows, header };
    })())`),
  );
  await s.shotElement(`combined-preview-${width}`, '.external-card .transcript-preview');
  const problems = [];
  if (m.rows.length === 0) problems.push('no compact rows');
  if (m.sideways > 0) problems.push(`the preview scrolls sideways by ${m.sideways} px`);
  for (const row of m.rows) {
    if (row.secondLine > 0) problems.push(`${row.id}: ${row.secondLine} cell(s) on a second line`);
    if (row.spill > 0) problems.push(`${row.id}: content reaches ${row.spill} px past its row/card`);
  }
  const columnSets = new Set(m.rows.map((row) => row.columns));
  if (columnSets.size > 1) problems.push(`columns start at different x across rows: ${[...columnSets].join(' | ')}`);
  const h = m.header;
  if (h.labels.join('|') !== 'Taken as') problems.push(`visible headers must be exactly "Taken as": ${JSON.stringify(h.labels)}`);
  if (h.right === null || Math.abs(h.right - h.selectRight) > 2 || Math.abs(h.left - h.selectLeft) > 2 || !h.above) problems.push(`the "Taken as" header must sit over the dropdown column: ${JSON.stringify(h)}`);
  console.log(`  compact preview at ${width} px: content box ${m.previewWidth} px, ${m.rows.length} rows of ${m.rows.map((row) => row.height).join('/')} px, columns at x=${m.rows[0]?.columns}; header ${JSON.stringify(m.header.labels)} at x=${m.header.left}–${m.header.right} over the dropdown at ${m.header.selectLeft}–${m.header.selectRight}`);
  if (problems.length) throw new Error(`compact preview at ${width} px (content box ${m.previewWidth} px): ${problems.join('; ')}`);
}
