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
  /** Drawn rotated (a diagonal watermark) — never body text. */
  rotated?: boolean;
}

/** A page's pdfjs text items → Runs in the page's READING orientation, plus
 * the page width in that orientation (2026-09-05).
 *
 * Two kinds of sideways pages exist. (1) Landscape transcripts stored with
 * /Rotate 90 (Northeastern): every item carries a rotated transform although
 * the reader sees upright text, and raw x/y are the un-rotated page's —
 * composing the item transform with the viewport's (which applies /Rotate)
 * gives device space, where upright text is upright again. (2) Pages whose
 * CONTENT is drawn sideways with no /Rotate (a Parchment official transcript
 * after re-saving; the sanitizer's output): every run then shares one 90°
 * direction in device space. So the dominant text direction is measured per
 * page and, when it is not left→right, the whole page is turned to make it
 * so. Either way y is flipped back to "up", so the rest of this module is
 * unchanged, and only text at odds with the page (a diagonal watermark, a
 * vertical label) keeps `rotated`. */
export function runsFromTextItems(
  items: readonly { str: string; transform: number[]; width?: number }[],
  viewport: { transform: number[]; width: number; height: number },
): { runs: Run[]; width: number } {
  const [m0, m1, m2, m3, m4, m5] = viewport.transform as [number, number, number, number, number, number];
  const placed: { x: number; y: number; text: string; width: number; ux: number; uy: number; axisAligned: boolean }[] = [];
  for (const item of items) {
    if (item.str.trim() === '') continue;
    const [a, b, c, d, e, f] = item.transform as [number, number, number, number, number, number];
    // device ← text  =  (device ← user) ∘ (user ← text)
    const da = a * m0 + b * m2;
    const db = a * m1 + b * m3;
    const dc = c * m0 + d * m2;
    const dd = c * m1 + d * m3;
    const dx = e * m0 + f * m2 + m4;
    const dy = e * m1 + f * m3 + m5;
    const len = Math.hypot(da, db) || 1;
    const ux = da / len; // unit text direction in device space (y down)
    const uy = db / len;
    // Axis-aligned = a multiple of 90°, with the up vector perpendicular (no shear/flip).
    const axisAligned = (Math.abs(ux) > 0.999 || Math.abs(uy) > 0.999) && Math.abs(dc * da + dd * db) < 0.01 * (len * Math.hypot(dc, dd) || 1);
    placed.push({ x: dx, y: dy, text: item.str, width: item.width ?? 0, ux, uy, axisAligned });
  }
  // Dominant direction: the 90° quadrant most runs share (0 = left→right).
  const quadrant = (r: { ux: number; uy: number }) => ((Math.round(Math.atan2(r.uy, r.ux) / (Math.PI / 2)) % 4) + 4) % 4;
  const counts = [0, 0, 0, 0];
  for (const r of placed) if (r.axisAligned) counts[quadrant(r)] = (counts[quadrant(r)] ?? 0) + 1;
  const dominant = counts.indexOf(Math.max(...counts));
  const total = counts.reduce((s, n) => s + n, 0);
  const turn = dominant !== 0 && total > 0 && counts[dominant]! >= 0.9 * total ? dominant : 0;
  // Rotate device coordinates so the dominant direction becomes left→right:
  // R = [[tx, ty], [-ty, tx]] for the dominant unit vector t.
  const tx = [1, 0, -1, 0][turn]!;
  const ty = [0, 1, 0, -1][turn]!;
  const width = turn % 2 === 0 ? viewport.width : viewport.height;
  const height = turn % 2 === 0 ? viewport.height : viewport.width;
  // The turned frame's origin: shift so coordinates stay within [0, width] × [0, height].
  const shiftX = turn === 1 ? 0 : turn === 2 ? viewport.width : turn === 3 ? viewport.height : 0;
  const shiftY = turn === 1 ? viewport.width : turn === 2 ? viewport.height : 0;
  const runs: Run[] = placed.map((r) => {
    const x = tx * r.x + ty * r.y + shiftX;
    const yDown = -ty * r.x + tx * r.y + shiftY;
    const rotated = !r.axisAligned || quadrant(r) !== turn;
    return { x, y: height - yDown, text: r.text, width: r.width, rotated };
  });
  return { runs, width };
}

/** Drop text watermarks before any line grouping (2026-09-05; a UMass
 * transcript whose background repeats "University of Massachusetts Amherst"
 * read only 6 courses — the tiles merged into course lines and broke the
 * column split). Two signals, both position-based so no wording is assumed:
 *   1. rotated runs — diagonal watermarks; transcript text is never rotated;
 *   2. a phrase (≥ 6 letters) repeated ≥ 6 times on the page at ≥ 3 different
 *      x positions — a tiled background. Real repeats (a thesis-credit title
 *      every term, "Good Standing") sit in ONE column, i.e. at one or two x
 *      positions, so they survive. */
export function dropWatermarks(runs: Run[]): Run[] {
  // Signal 3 (2026-09-05, Duke / UC San Diego): a security band drawn as ONE
  // run that repeats a phrase across the page ("DUKE UNIVERSITY ? DUKE
  // UNIVERSITY ? DUKE …"). Such a run merges with whatever real line shares
  // its baseline, so it is dropped outright.
  const upright = runs.filter((r) => !r.rotated && !isRepeatedPhraseRun(r.text));
  const norm = (r: Run) => r.text.replace(/\s+/g, ' ').trim().toLowerCase();
  const bucket = (r: Run) => Math.round(r.x / 4);
  // phrase → x bucket → how many times it sits there
  const grid = new Map<string, Map<number, number>>();
  for (const r of upright) {
    const key = norm(r);
    if ((key.match(/[a-z]/g) ?? []).length < 3) continue;
    const at = grid.get(key) ?? new Map<number, number>();
    at.set(bucket(r), (at.get(bucket(r)) ?? 0) + 1);
    grid.set(key, at);
  }
  const tiled = new Set<string>();
  for (const [key, at] of grid) {
    const total = [...at.values()].reduce((s, n) => s + n, 0);
    const letters = (key.match(/[a-z]/g) ?? []).length;
    // Six-letter phrases tile at ≥ 3 x positions; a SHORT word ("COPY",
    // 2026-09-05) must repeat more, at ≥ 4 positions — column headers ("HRS")
    // and subject codes sit at one or two x positions and survive.
    if ((letters >= 6 && total >= 6 && at.size >= 3) || (total >= 8 && at.size >= 4)) tiled.add(key);
  }
  if (tiled.size === 0) return upright;
  // A tiled phrase is dropped only where it repeats down the page; a lone
  // occurrence at its own x — the genuine header naming the university — stays.
  return upright.filter((r) => {
    const key = norm(r);
    if (!tiled.has(key)) return true;
    return (grid.get(key)?.get(bucket(r)) ?? 0) < 2;
  });
}

/** The phrase a run repeats (≥ 8 letters, at least twice), or undefined.
 * Any 12-character window that recurs later in the run defines the unit —
 * a band cut at the page edge may start mid-phrase ("… SAN DIEGO ? UNIVERSITY
 * OF CALIFORNIA, SAN DIEGO ? UNIVERSITY OF CALIF"). */
export function repeatedPhrase(text: string): string | undefined {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length < 24) return undefined;
  const starts = [0, ...[...t.matchAll(/ /g)].map((m) => m.index + 1)].filter((i) => i < t.length / 2);
  for (const i of starts) {
    const head = t.slice(i, i + 12);
    if (head.length < 12) break;
    const j = t.indexOf(head, i + 6);
    if (j === -1) continue;
    const unit = t.slice(i, j);
    if ((unit.match(/[A-Za-z]/g) ?? []).length < 8) continue;
    return unit.replace(/^[\s?•·*|,-]+|[\s?•·*|,-]+$/g, '').trim();
  }
  return undefined;
}

/** True for a run whose text is a phrase repeated across it — a watermark
 * band, never a transcript line. */
export function isRepeatedPhraseRun(text: string): boolean {
  return repeatedPhrase(text) !== undefined;
}

/** The institution a page's watermark names, when its repeated phrase (a
 * band) contains an institution word — so a transcript whose only clean
 * mention of the university is the watermark (UC San Diego) still gets a
 * university guess (2026-09-05). */
export function watermarkInstitution(runs: Run[]): string | undefined {
  const INSTITUTION_RE = /universit|institute of technology|polytechnic|college/i;
  const seen = new Map<string, number>();
  for (const r of runs) {
    const unit = repeatedPhrase(r.text);
    if (!unit || !INSTITUTION_RE.test(unit)) continue;
    seen.set(unit, (seen.get(unit) ?? 0) + 1);
  }
  let best: string | undefined;
  for (const [unit, n] of seen) if (best === undefined || n > (seen.get(best) ?? 0)) best = unit;
  return best;
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
  const gapX = findColumnGap(runs, pageWidth);
  if (gapX === undefined) return [runs];
  const right = runs.filter((r) => r.x >= gapX - 2);
  const left = runs.filter((r) => r.x < gapX - 2);
  return repairStraddlers(left, right, gapX, Math.min(...right.map((r) => r.x)));
}

/** The x of the vertical gap between a two-column page's columns (runs at
 * x ≥ gap − 2 belong to the right column), or undefined for a one-column
 * page. The three tests are described on `splitColumns`. Exported so the
 * transcript sanitizer (scripts/sanitize/) can de-identify column by column. */
export function findColumnGap(runs: Run[], pageWidth: number): number | undefined {
  if (runs.length < 40 || !(pageWidth > 0)) return undefined;
  // Horizontal rules ("_____") and Banner's "CONTINUED ON NEXT COLUMN ****"
  // banners are drawn to the full column width and touch the gap; they say
  // nothing about the layout, so they do not count as crossings.
  const DECORATIVE_RE = /^[\W_]+$|CONTINUED ON/i; // covers "_____", "-----", "*****" boxes
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
    // The column's left edge: the leftmost x where a SUBSTANTIAL share of
    // the right-hand runs start (2026-09-05) — not the single leftmost run (a
    // page number or letterhead), and not the busiest x (the title column).
    const buckets = new Map<number, number>();
    for (const r of right) buckets.set(Math.round(r.x / 4), (buckets.get(Math.round(r.x / 4)) ?? 0) + 1);
    const maxCount = Math.max(...buckets.values());
    const edgeBucket = Math.min(...[...buckets.entries()].filter(([, n]) => n >= Math.max(3, 0.2 * maxCount)).map(([b]) => b));
    const rightEdge = edgeBucket * 4;
    // The band between the candidate and that edge must be (nearly) empty —
    // otherwise the candidate sits inside the left column's last cells.
    if (right.filter((r) => r.x < rightEdge - 12).length > tolerance) continue;
    const wordyAtEdge = right.filter((r) => r.x >= rightEdge - 6 && r.x <= rightEdge + 12 && /[A-Za-z]{4}/.test(r.text)).length;
    if (wordyAtEdge < 5) continue;
    return x;
  }
  return undefined;
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

/** A page's runs → its lines: watermarks dropped, then column by column when
 * the page has two. */
export function runsToLines(runs: Run[], pageWidth: number): string[] {
  const lines = splitColumns(dropWatermarks(runs), pageWidth).flatMap((column) => groupLines(column));
  // A watermark that names the institution is worth one clean line at the
  // top of the page for the university guess (2026-09-05).
  const named = watermarkInstitution(runs);
  return named ? [named, ...lines] : lines;
}
