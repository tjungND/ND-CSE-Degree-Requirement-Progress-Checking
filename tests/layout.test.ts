// Two-column page detection (src/transcript/layout.ts, 2026-09-05): a
// Banner-style page is read left column then right; an ordinary one-column
// table — even one whose right half is all numbers — is never split.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { dropWatermarks, groupLines, isRepeatedPhraseRun, repeatedPhrase, runsFromTextItems, runsToLines, splitColumns, watermarkInstitution, type Run } from '../src/transcript/layout.ts';

const W = 612;
const run = (x: number, y: number, text: string, width = text.length * 4): Run => ({ x, y, text, width });

/** A Banner-shaped page: 12 rows per column, subject / number / title /
 * credits / grade / points in separate runs, wordy headers in both columns,
 * a full-column rule and a "CONTINUED ON NEXT COLUMN" banner touching the gap,
 * one full-width header line crossing it. */
function twoColumnPage(): Run[] {
  const runs: Run[] = [run(33, 780, 'SSN: ***-**-0000   CWID 00000000   Date Issued: 01-SEP-2026', 330)];
  const column = (x0: number, label: string) => {
    let y = 760;
    const line = (text: string, width?: number) => runs.push(run(x0, (y -= 10), text, width));
    line(`${label} Fall 2019`);
    line('College of Science');
    line('Computer Science');
    for (let i = 0; i < 12; i++) {
      y -= 10;
      runs.push(run(x0, y, 'CS'), run(x0 + 27, y, `5${i}0`), run(x0 + 62, y, 'Course Title Words', 100), run(x0 + 182, y, '3.00'), run(x0 + 207, y, 'A'), run(x0 + 243, y, '12.00'));
    }
    line('Ehrs: 36.00 GPA-Hrs: 36.00 QPts: 144.00 GPA: 4.00', 200);
    line('Good Standing');
  };
  column(33, 'Left');
  runs.push(run(33, 500, '_______________________________________________', 270)); // rule touching the gap
  runs.push(run(60, 490, '****** CONTINUED ON NEXT COLUMN ******', 246)); // banner touching the gap
  column(310, 'Right');
  return runs;
}

/** A one-column table with the same cells laid across the full width. */
function oneColumnTable(titleWidth: number): Run[] {
  const runs: Run[] = [];
  let y = 760;
  for (let i = 0; i < 12; i++) {
    y -= 10;
    runs.push(run(40, y, 'CSE'), run(70, y, `6${i}641`), run(110, y, 'Graduate Operating Systems', titleWidth), run(380, y, '3.000'), run(430, y, 'A'), run(480, y, '12.000'));
  }
  return runs;
}

describe('two-column page detection', () => {
  it('splits a Banner-shaped page into left then right', () => {
    const cols = splitColumns(twoColumnPage(), W);
    assert.equal(cols.length, 2);
    const lines = runsToLines(twoColumnPage(), W);
    const left = lines.indexOf('Left Fall 2019');
    const right = lines.indexOf('Right Fall 2019');
    assert.ok(left >= 0 && right > left, 'left column precedes right column');
    // The right column's course rows stay whole and keep their column gaps.
    assert.ok(lines.some((l) => /^CS {3}5\d0 {3}Course Title Words {3}3\.00 {3}A {3}12\.00$/.test(l)), lines.join('\n'));
    // Nothing from the two columns was spliced into one line.
    assert.ok(!lines.some((l) => (l.match(/12\.00/g) ?? []).length > 1));
  });

  it('hands a straddling run\'s trailing term header to the right column', () => {
    // pdfjs merged "PTS R" (left table header) with "Fall 2013" (right column
    // term header) into one run spanning the gap.
    const runs = twoColumnPage();
    runs.push(run(285, 765, 'PTS R Fall 2013', 63));
    const lines = runsToLines(runs, W);
    const rightStart = lines.indexOf('Right Fall 2019');
    assert.ok(lines.slice(0, rightStart).includes('PTS R'), 'left keeps its header cell');
    // The header sits above the right column's first line, so it becomes that column's first line.
    assert.equal(lines.indexOf('Fall 2013'), rightStart - 1, 'right column gets the term header');
    assert.ok(!lines.some((l) => l.includes('PTS R Fall 2013')));
  });

  it('never splits a one-column table — titles cross the middle', () => {
    assert.equal(splitColumns(oneColumnTable(220), W).length, 1);
  });

  it('never splits a one-column table with short titles — its right half starts with numbers', () => {
    assert.equal(splitColumns(oneColumnTable(120), W).length, 1);
  });

  it('leaves small pages alone', () => {
    assert.equal(splitColumns(twoColumnPage().slice(0, 30), W).length, 1);
  });

  it('drops a tiled text watermark and a diagonal one, leaving the page as if clean', () => {
    const clean = twoColumnPage();
    const dirty = [...clean];
    // Horizontal tiles at three x positions on a grid that collides with lines.
    for (let y = 770; y > 300; y -= 37) {
      for (const x of [20, 220, 420]) dirty.push(run(x, y, 'University of Example Technology', 150));
    }
    // A diagonal banner across the page (rotated → never body text).
    for (let y = 700; y > 300; y -= 80) dirty.push({ ...run(100, y, 'UNIVERSITY OF EXAMPLE TECHNOLOGY', 400), rotated: true });
    assert.deepEqual(runsToLines(dirty, W), runsToLines(clean, W));
    assert.equal(dropWatermarks(dirty).length, clean.length);
  });

  it('keeps a phrase that merely repeats down one column (a thesis-credit title every term)', () => {
    const runs = twoColumnPage();
    for (let i = 0; i < 8; i++) runs.push(run(95, 300 - i * 10, 'Research and Thesis Ph.D.', 100));
    assert.equal(dropWatermarks(runs).length, runs.length);
  });

  it('groupLines renders wide gaps as three spaces and keeps reading order', () => {
    const lines = groupLines([run(200, 100, 'B'), run(40, 100, 'A'), run(40, 120, 'first'), run(46, 100, 'A2')]);
    assert.deepEqual(lines, ['first', 'A A2   B']);
  });
});

// Sideways pages and security bands (2026-09-05, from the DGS's de-identified
// samples): a landscape transcript stored with /Rotate 90 (Northeastern), a
// page whose content is drawn sideways with no /Rotate (a re-saved Parchment
// official PDF), a "DUKE UNIVERSITY ? DUKE UNIVERSITY ? …" band drawn as one
// run, and a "COPY COPY COPY" tile of short words.
describe('page orientation and watermark bands', () => {
  const item = (str: string, transform: number[], width = str.length * 4) => ({ str, transform, width });

  it('reads a /Rotate 90 page through the viewport transform: upright text, x left→right, y up', () => {
    // pdfjs viewport for a 612×792 portrait page rotated 90°: 792×612, transform [0, 1, 1, 0, 0, 0].
    const viewport = { transform: [0, 1, 1, 0, 0, 0], width: 792, height: 612 };
    // Text items of a rotated page carry [0, s, -s, 0, e, f]: e runs down the
    // reading page (line order), f runs across it (left→right).
    const { runs, width } = runsFromTextItems(
      [item('First line', [0, 8, -8, 0, 49, 100]), item('Second line', [0, 8, -8, 0, 60, 100]), item('right cell', [0, 8, -8, 0, 49, 400])],
      viewport,
    );
    assert.equal(width, 792);
    assert.ok(runs.every((r) => !r.rotated), 'upright in reading orientation');
    const [first, second, right] = runs;
    assert.ok(first!.y > second!.y, 'the earlier line sits higher (y up)');
    assert.ok(right!.x > first!.x, 'the cell further along the line sits further right');
    assert.ok(Math.abs(first!.y - right!.y) < 1, 'same baseline');
    assert.deepEqual(groupLines(runs), ['First line   right cell', 'Second line']);
  });

  it('turns a page whose every run is drawn sideways (no /Rotate) upright', () => {
    const viewport = { transform: [1, 0, 0, -1, 0, 792], width: 612, height: 792 };
    // Content rotated 90° counter-clockwise: [0, s, -s, 0, e, f] on an unrotated page.
    const items = [item('Name: Jane', [0, 9.4, -9.4, 0, 36, 18]), item('Date Issued', [0, 9.4, -9.4, 0, 36, 627]), item('CSE 60641   Title   3.000 A', [0, 9.4, -9.4, 0, 285, 24], 200)];
    const { runs, width } = runsFromTextItems(items, viewport);
    assert.equal(width, 792, 'the page is landscape once turned');
    assert.ok(runs.every((r) => !r.rotated));
    const lines = groupLines(runs);
    assert.deepEqual(lines, ['Name: Jane   Date Issued', 'CSE 60641   Title   3.000 A']);
  });

  it('keeps a lone diagonal watermark rotated on an otherwise upright page', () => {
    const viewport = { transform: [1, 0, 0, -1, 0, 792], width: 612, height: 792 };
    const s = Math.SQRT1_2 * 28;
    const { runs } = runsFromTextItems(
      [item('Fall 2026', [8, 0, 0, 8, 40, 700]), item('CSE 60641 Title 3.000 A', [8, 0, 0, 8, 40, 680], 150), item('EXAMPLE TECH', [s, s, -s, s, 100, 300])],
      viewport,
    );
    assert.deepEqual(runs.map((r) => r.rotated), [false, false, true]);
  });

  it('drops a run that repeats a phrase across the page, and names the institution it repeats', () => {
    const band = 'DUKE UNIVERSITY ? DUKE UNIVERSITY ? DUKE UNIVERSITY ? DUKE UNIVERSIT';
    const partial = 'LJFCQ ? UNIVERSITY OF CALIFORNIA, SAN DIEGO ? UNIVERSITY OF CALIFORNIA, SAN DIEGO ? QCA';
    assert.equal(isRepeatedPhraseRun(band), true);
    assert.equal(isRepeatedPhraseRun(partial), true);
    assert.equal(isRepeatedPhraseRun('Term GPA   3.000   Term Earned   9.000   6.000'), false);
    assert.equal(isRepeatedPhraseRun('Graduate Independent Study'), false);
    assert.equal(repeatedPhrase(band), 'DUKE UNIVERSITY');
    assert.equal(repeatedPhrase(partial), 'UNIVERSITY OF CALIFORNIA, SAN DIEGO');
    const runs = [run(33, 700, band, 500), run(33, 700, 'ECE 565   Title   3.000   A', 200), run(33, 690, partial, 500), run(33, 680, partial, 500)];
    assert.deepEqual(dropWatermarks(runs).map((r) => r.text), ['ECE 565   Title   3.000   A']);
    assert.equal(watermarkInstitution(runs), 'UNIVERSITY OF CALIFORNIA, SAN DIEGO', 'the phrase repeated on the most runs');
    assert.equal(runsToLines(runs, W)[0], 'UNIVERSITY OF CALIFORNIA, SAN DIEGO', 'the band names the institution at the top of the page');
  });

  it('drops a tile of a SHORT word repeated at four or more x positions, never a column header', () => {
    const runs: Run[] = [];
    for (let y = 700; y > 500; y -= 20) for (const x of [40, 190, 340, 490]) runs.push(run(x, y, 'COPY'));
    for (let y = 700; y > 500; y -= 20) runs.push(run(60, y, 'CSE')); // a subject column: one x
    runs.push(run(100, 720, 'HRS'), run(160, 720, 'HRS'), run(220, 720, 'HRS')); // three headers on one line
    const kept = dropWatermarks(runs).map((r) => r.text);
    assert.ok(!kept.includes('COPY'));
    assert.equal(kept.filter((t) => t === 'CSE').length, 10);
    assert.equal(kept.filter((t) => t === 'HRS').length, 3);
  });
});
