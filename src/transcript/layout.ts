// Text runs → visual lines, with two-column pages read column by column.
// Pure (no pdfjs, no DOM) so it is unit-tested with synthetic runs; pdf.ts
// feeds it the runs pdfjs extracts from each page.
//
// Why columns matter (2026-09-05): Banner-style official transcripts (IIT,
// Notre Dame's own official PDF, many others) print TWO independent columns
// per page — left column top to bottom, then the right column. Grouping runs
// by y alone splices the columns into one line ("CS 445 … 0.00 TR   CS 525 …
// 3.00 A" — a Fall 2013 course and a Spring 2014 course on the same line, with
// the right column's term header trailing a left-column course), and the
// parsers then attach the wrong term to a course or lose the second course.

/** One positioned text run from a page. x/y in PDF user units, y up. */
export interface Run {
  x: number;
  y: number;
  text: string;
  width: number;
}

/** Group runs into visual lines: same y (2-unit tolerance), sorted
 * left-to-right, with wide horizontal gaps rendered as three spaces so column
 * boundaries survive into the text (the parsers split cells on 2+ spaces). */
export function groupLines(runs: Run[]): string[] {
  const lines: string[] = [];
  const sorted = [...runs].sort((a, b) => b.y - a.y || a.x - b.x);
  let current: Run[] = [];
  const flush = () => {
    if (current.length === 0) return;
    current.sort((a, b) => a.x - b.x);
    let text = '';
    let cursor = -Infinity;
    for (const r of current) {
      if (text !== '') text += r.x - cursor > 8 ? '   ' : ' ';
      text += r.text;
      cursor = r.x + r.width;
    }
    lines.push(text.trim());
    current = [];
  };
  for (const r of sorted) {
    if (current.length > 0 && Math.abs(current[0]!.y - r.y) > 2) flush();
    current.push(r);
  }
  flush();
  return lines;
}

/** Split a page's runs into its text columns — `[runs]` for an ordinary page,
 * `[left, right]` for a two-column layout. Deliberately conservative: every
 * test below must hold, so a single-column TABLE (course rows whose right
 * half is credits / grade / points) is never split:
 *   1. a vertical band near the middle (40–60% of the page width) that at most
 *      2% of the runs cross — full-width headers and footers are tolerated,
 *      but course titles that run past the middle are not;
 *   2. both sides hold at least 30% of the runs;
 *   3. the right column's left edge is WORDY: at least five runs starting
 *      there contain a four-letter word (term headers, "College of …",
 *      "Ehrs:", "Good Standing"). A table's right half starts with numbers
 *      ("3.000") or one-letter grades, so it fails this test.
 * Runs that cross the band (headers) stay with the left column, where they
 * were read first. */
export function splitColumns(runs: Run[], pageWidth: number): Run[][] {
  if (runs.length < 40 || !(pageWidth > 0)) return [runs];
  // Horizontal rules ("_____") and Banner's "CONTINUED ON NEXT COLUMN ****"
  // banners are drawn to the full column width and touch the gap; they say
  // nothing about the layout, so they do not count as crossings.
  const DECORATIVE_RE = /^[\W_]+$|CONTINUED ON/i;
  const measurable = runs.filter((r) => !DECORATIVE_RE.test(r.text));
  const tolerance = Math.max(2, runs.length * 0.02);
  // The gap is often only a few units wide, so every candidate position is
  // tried in turn and the first that passes all three tests wins.
  for (let x = pageWidth * 0.4; x <= pageWidth * 0.6; x += pageWidth / 200) {
    const crossing = measurable.filter((r) => r.x < x - 2 && r.x + r.width > x + 2).length;
    if (crossing > tolerance) continue;
    const right = runs.filter((r) => r.x >= x - 2);
    const left = runs.filter((r) => r.x < x - 2);
    if (right.length < runs.length * 0.3 || left.length < runs.length * 0.3) continue;
    const rightEdge = Math.min(...right.map((r) => r.x));
    const wordyAtEdge = right.filter((r) => r.x <= rightEdge + 6 && /[A-Za-z]{4}/.test(r.text)).length;
    if (wordyAtEdge < 5) continue;
    return repairStraddlers(left, right, x, rightEdge);
  }
  return [runs];
}

/** pdfjs occasionally merges a left column's last cell with the right
 * column's text on the same baseline into ONE run ("PTS R Fall 2013" — the
 * table header and the next column's term header). No split by position can
 * separate such a run, but when it ends with a term header that header is
 * the right column's: it is cut off and placed at the right column's edge, so
 * the right column's courses inherit the right term (2026-09-05). Other
 * straddlers stay with the left column, where they were read first. */
function repairStraddlers(left: Run[], right: Run[], gapX: number, rightEdge: number): Run[][] {
  const TERM_TAIL_RE = /\s+((?:Fall|Spring|Summer|Autumn|Winter)\s+(?:19|20)\d{2})\s*$/i;
  const repairedLeft: Run[] = [];
  const repairedRight = [...right];
  for (const r of left) {
    const m = r.x + r.width > gapX + 2 ? TERM_TAIL_RE.exec(r.text) : null;
    if (!m) {
      repairedLeft.push(r);
      continue;
    }
    const share = m[1]!.length / r.text.length;
    repairedLeft.push({ ...r, text: r.text.slice(0, m.index), width: r.width * (1 - share) });
    repairedRight.push({ x: rightEdge, y: r.y, text: m[1]!, width: r.width * share });
  }
  return [repairedLeft, repairedRight];
}

/** A page's runs → its lines, column by column when the page has two. */
export function runsToLines(runs: Run[], pageWidth: number): string[] {
  return splitColumns(runs, pageWidth).flatMap((column) => groupLines(column));
}
