// Two-column page detection (src/transcript/layout.ts, 2026-09-05): a
// Banner-style page is read left column then right; an ordinary one-column
// table — even one whose right half is all numbers — is never split.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { groupLines, runsToLines, splitColumns, type Run } from '../src/transcript/layout.ts';

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

  it('groupLines renders wide gaps as three spaces and keeps reading order', () => {
    const lines = groupLines([run(200, 100, 'B'), run(40, 100, 'A'), run(40, 120, 'first'), run(46, 100, 'A2')]);
    assert.deepEqual(lines, ['first', 'A A2   B']);
  });
});
