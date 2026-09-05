// The transcript sanitizers (scripts/sanitize/, 2026-09-05): de-identify a
// transcript while keeping everything the parsers react to. Two layers:
//   1. token rules (rules.mjs) — what changes, what stays, determinism;
//   2. fidelity — sanitizing the watermarked Banner fixture PDF and reading the
//      result back through the app's own extraction gives the same structure.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { createSanitizer } from '../scripts/sanitize/rules.mjs';
import { readRuns, sanitizePdf, type PdfPage, type PdfRun } from '../scripts/sanitize/pdf-io.mjs';
import { runsToLines } from '../src/transcript/layout.ts';
import { parseExternalTranscript } from '../src/transcript/external.ts';

type Run = { x: number; y: number; text: string; width?: number };
const run = (x: number, y: number, text: string): Run => ({ x, y, text, width: text.length * 4 });

function sanitizeTexts(runs: Run[], options: Parameters<typeof createSanitizer>[0] = {}): string[] {
  return createSanitizer({ seed: 42, ...options }).sanitizeRuns(runs).map((r) => r.text);
}

describe('sanitizer rules', () => {
  it('scrambles names deterministically, keeps labels, e-mail domains and structural words', () => {
    const [record, issued, email, level] = sanitizeTexts([
      run(33, 700, 'Record of: Taeho Jung'),
      run(33, 690, 'Issued To: Taeho Jung'),
      run(33, 680, 'TJUNG@ND.EDU'),
      run(33, 670, 'Course Level: Graduate'),
    ]);
    assert.match(record!, /^Record of: [A-Z][a-z]{4} [A-Z][a-z]{3}$/);
    assert.notEqual(record, 'Record of: Taeho Jung');
    assert.equal(issued!.slice('Issued To: '.length), record!.slice('Record of: '.length), 'same name → same scramble');
    assert.match(email!, /^[A-Z]{5}@ND\.EDU$/);
    assert.notEqual(email, 'TJUNG@ND.EDU');
    assert.equal(level, 'Course Level: Graduate');
  });

  it('keeps subject codes and credit values, keeps the course number’s first digit, always changes letter grades', () => {
    const [subj, num, title, cr, pts] = sanitizeTexts([
      run(33, 700, 'CS'),
      run(60, 700, '455'),
      run(95, 700, 'Data Communication'),
      run(215, 700, '3.00 A'),
      run(276, 700, '12.00'),
    ]);
    assert.equal(subj, 'CS');
    assert.match(num!, /^4\d\d$/);
    assert.notEqual(title, 'Data Communication');
    assert.match(title!, /^[A-Z][a-z]{3} [A-Z][a-z]{12}$/);
    assert.match(cr!, /^3\.00 [BCD]$/); // grade changed, credits kept
    assert.equal(pts, '12.00');
  });

  it('shifts every year by one offset, randomizes ids, dates’ days, GPA and totals', () => {
    const s = createSanitizer({ seed: 42 });
    const out = s.sanitizeRuns([
      run(33, 700, 'Matriculated: Fall 2011'),
      run(33, 690, 'Degree Awarded Doctor of Philosophy 13-MAY-2017'),
      run(33, 680, 'SSN: ***-**-3238   CWID 20387654   Date of Birth: 25-FEB'),
      run(33, 670, 'Ehrs:   6.00 GPA-Hrs: 6.00   QPts:   24.00 GPA:   3.87'),
      run(33, 660, 'TOTAL INSTITUTION   19.00   15.00   57.99   3.87'),
    ]).map((r) => r.text);
    const y1 = Number(/Fall (\d{4})/.exec(out[0]!)![1]);
    const y2 = Number(/-MAY-(\d{4})$/.exec(out[1]!)![1]);
    assert.equal(y1 - 2011, s.yearOffset);
    assert.equal(y2 - 2017, s.yearOffset);
    assert.notEqual(s.yearOffset, 0);
    assert.match(out[1]!, /^Degree Awarded Doctor of Philosophy \d{2}-MAY-\d{4}$/);
    assert.doesNotMatch(out[2]!, /3238|20387654/);
    assert.match(out[2]!, /Date of Birth: \d{2}-FEB$/);
    assert.doesNotMatch(out[3]!, /3\.87/);
    assert.match(out[4]!, /^TOTAL INSTITUTION   \d\d\.\d\d   \d\d\.\d\d   \d\d\.\d\d   \d\.\d\d$/);
    assert.doesNotMatch(out[4]!, /19\.00   15\.00/);
  });

  it('keeps institution runs whole, but a watermark tile on the same baseline does not shield a name', () => {
    const [tile, name, college] = sanitizeTexts([
      run(215, 700, 'University of Massachusetts Amherst'),
      run(33, 700, 'Record of: Jane Q. Student'),
      run(33, 690, 'College of Science'),
    ]);
    assert.equal(tile, 'University of Massachusetts Amherst');
    assert.notEqual(name, 'Record of: Jane Q. Student');
    assert.equal(college, 'College of Science');
  });

  it('keeps titles only with keepTitles, and still scrambles names then', () => {
    const runs = [run(33, 700, 'CS   595   Econ & Priv Issues in Big Data   3.00 A-   12.00'), run(33, 690, 'Record of: Jane Q. Student')];
    const kept = sanitizeTexts(runs, { keepTitles: true });
    assert.match(kept[0]!, /^CS   5\d\d   Econ & Priv Issues in Big Data   3\.00 [BCD][+-]   12\.00$/);
    assert.notEqual(kept[1], 'Record of: Jane Q. Student');
    const scrambled = sanitizeTexts(runs);
    assert.doesNotMatch(scrambled[0]!, /Econ|Priv|Issues/);
  });

  it('randomizes percent-style grades next to a credit value and 4+ digit numbers', () => {
    const [row] = sanitizeTexts([run(33, 700, 'COMPSCI 9636A   Advanced Topics   0.50   85')]);
    assert.match(row!, /^COMPSCI 9\d{3}A   [A-Z][a-z]{7} [A-Z][a-z]{5}   0\.50   \d\d$/);
    assert.notEqual(/(\d\d)$/.exec(row!)![1], '85');
  });
});

describe('sanitized PDF fidelity', () => {
  it('the sanitized Banner fixture reads back with the same structure, different content', async () => {
    const original = readFileSync(new URL('./fixtures/banner-watermarked-transcript.pdf', import.meta.url));
    const { pdf, sanitizer } = await sanitizePdf(original, { seed: 7 });
    const before = await readRuns(original);
    const after = await readRuns(pdf);
    assert.equal(after.length, before.length, 'same page count');
    for (let p = 0; p < before.length; p++) {
      // Same geometry for every upright run: a run at the original position
      // with the original width (within 5%). Rotated runs (the diagonal
      // watermark) may come back split differently — pdfjs re-merges them —
      // and the app drops them anyway.
      const upright = (r: PdfRun) => Math.abs(r.b) < 0.01 && Math.abs(r.c) < 0.01;
      const afterUpright = after[p]!.runs.filter(upright);
      const beforeUpright = before[p]!.runs.filter(upright);
      // pdfjs may split a rebuilt multi-word cell at its space ("COURSE TITLE"
      // → "COURSE" + "TITLE"); the line grouping reunites them, so allow a
      // few extra runs but never a missing or moved one.
      assert.ok(afterUpright.length >= beforeUpright.length && afterUpright.length <= beforeUpright.length + 4, `page ${p + 1}: ${beforeUpright.length} → ${afterUpright.length} upright runs`);
      for (const b of beforeUpright) {
        const a = afterUpright.find((r) => Math.abs(r.x - b.x) < 0.6 && Math.abs(r.y - b.y) < 0.6);
        assert.ok(a, `no run at (${b.x}, ${b.y}) on page ${p + 1}`);
        assert.ok(a.text.length <= b.text.length, `text grew at (${b.x}, ${b.y})`);
        if (a.text.length === b.text.length && b.width > 0) {
          assert.ok(Math.abs(a.width - b.width) / b.width < 0.05, `width ${b.width} → ${a.width} at (${b.x}, ${b.y})`);
        }
      }
    }
    const lines = (pages: PdfPage[]) => pages.flatMap((page) => [...runsToLines(page.runs, page.width), '']);
    const parsedBefore = parseExternalTranscript(lines(before));
    const parsedAfter = parseExternalTranscript(lines(after));
    assert.equal(parsedAfter.courses.length, parsedBefore.courses.length);
    assert.equal(parsedAfter.transferRowsSkipped, parsedBefore.transferRowsSkipped);
    assert.equal(parsedAfter.university, 'Example Institute of Technology');
    assert.equal(parsedAfter.looksLikeNotreDame, false);
    assert.equal(parsedAfter.degreeConferred, true);
    // Content changed where it must: codes keep subject + first digit, grades and years differ.
    parsedAfter.courses.forEach((c, i) => {
      const o = parsedBefore.courses[i]!;
      assert.equal(c.courseId.slice(0, o.courseId.indexOf(' ') + 2), o.courseId.slice(0, o.courseId.indexOf(' ') + 2));
      assert.equal(c.year, o.year! + sanitizer.yearOffset);
      assert.equal(c.season, o.season);
      assert.equal(c.credits, o.credits);
      if (o.grade && /^[A-D]/.test(o.grade)) assert.notEqual(c.grade, o.grade);
    });
    // Nothing kept verbatim names a person.
    const kept = sanitizer.report().keptVerbatim.map(([t]) => t);
    assert.ok(!kept.some((t) => /Jane|Student:? Jane|STUDENT@/.test(t)), kept.join('\n'));
  });
});
