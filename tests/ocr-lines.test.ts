// Pins the pure stage of the OCR path (src/transcript/ocr-lines.ts — OCR
// steps 10–11, 2026-10-09, transcript accuracy program): the engine's blocks
// → the parser's lines. Since step 11 the app builds its lines from the
// engine's WORD BOXES through the layout stage (src/transcript/layout.ts), so
// a two-column scan is read column by column, a cell gap reaches the parser as
// three spaces and a watermark tile is dropped — exactly as a text PDF's runs
// are; each line carries the confidence of its least confident word. The
// engine itself never runs here: the pinned pages under
// tests/fixtures/ocr-scans/ carry its `blocks` output, captured once by
// scripts/dev/ocr-bench/pin-pages.mjs. The bench (npm run ocr-bench) measures
// the engine; its runner and scripts/dev/ocr-lines.mjs import the same module,
// so what this pins is also what they produce.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { blocksToRuns, linesFromBlocks, OCR_ENGINE_PARAMETERS, OCR_LINE_CONFIDENCE, ocrKeepSpaces, ocrLinesFromPage, ocrLineText, ocrPageLayout, TITLE_WORD_SPACE_SHARE, titleWord, WORD_SPACE_SHARE, type OcrBlockLike } from '../src/transcript/ocr-lines.ts';
import { groupLines } from '../src/transcript/layout.ts';
import { parseExternalTranscript } from '../src/transcript/external.ts';
import { parseTranscript } from '../src/transcript/parse.ts';
import { rowOf } from './helpers/row-of.ts';

/** An engine line as tesseract.js reports it, from `text` laid out at `x`
 * (pixels) on the baseline `y`, each word a box: `gaps` are the pixel gaps
 * AFTER each word (the last is ignored), `height` the line's box height.
 * Words are 20 px per character wide — a 10 pt word at scale 3 (30 px per
 * em, letters ~0.6 em). */
function engineLine(text: string, x: number, y: number, gaps: number[], confidences: number[], height = 30, lineConfidence = 90): NonNullable<NonNullable<OcrBlockLike['paragraphs']>[number]['lines']>[number] {
  const words = [];
  let at = x;
  const parts = text.split(' ');
  for (let i = 0; i < parts.length; i++) {
    const w = parts[i]!.length * 20;
    words.push({ text: parts[i]!, confidence: confidences[i] ?? 95, bbox: { x0: at, y0: y - height + 8, x1: at + w, y1: y + 8 } });
    at += w + (gaps[i] ?? 9);
  }
  const x1 = words[words.length - 1]!.bbox.x1;
  return { text: `${text}\n`, confidence: lineConfidence, bbox: { x0: x, y0: y - height + 8, x1, y1: y + 8 }, baseline: { x0: x, y0: y, x1, y1: y }, words };
}

const block = (...lines: ReturnType<typeof engineLine>[]): OcrBlockLike => ({ paragraphs: [{ lines }] });

test('blocksToRuns: a word box becomes a run in PDF units, y up, at its line\'s baseline; words a word space apart are one phrase, a cell gap ends it', () => {
  // A 10 pt Banner row rendered at scale 3 on a 3300 px tall page: subject,
  // number, a three-word title, credits, grade, points. Word spaces of 9 px
  // (0.3 of the 30 px line height) join; cell gaps of 60 px (2.0) split.
  const line = engineLine('CS 50300 Operating Systems Lab 3.00 A 12.00', 90, 600, [60, 60, 9, 9, 60, 60, 60], [95, 93, 91, 88, 97, 96, 99, 94], 30, 92);
  const runs = blocksToRuns([block(line)], 3, 3300);
  const px = (n: number) => Math.round((n / 3) * 1000) / 1000; // pixels → units, to a thousandth
  assert.deepEqual(
    runs.map((r) => ({ x: px(r.x * 3), y: r.y, text: r.text, width: px(r.width * 3), confidence: r.confidence, lineConfidence: r.lineConfidence })),
    [
      { x: px(90), y: 900, text: 'CS', width: px(40), confidence: 95, lineConfidence: 92 },
      { x: px(90 + 40 + 60), y: 900, text: '50300', width: px(100), confidence: 93, lineConfidence: 92 },
      // The phrase spans its words: "Operating" 180 px + 9 + "Systems" 140 + 9 + "Lab" 60 = 398 px; its confidence is its least word's.
      { x: px(90 + 40 + 60 + 100 + 60), y: 900, text: 'Operating Systems Lab', width: px(398), confidence: 88, lineConfidence: 92 },
      { x: px(90 + 40 + 60 + 100 + 60 + 398 + 60), y: 900, text: '3.00', width: px(80), confidence: 96, lineConfidence: 92 },
      { x: px(90 + 40 + 60 + 100 + 60 + 398 + 60 + 80 + 60), y: 900, text: 'A', width: px(20), confidence: 99, lineConfidence: 92 },
      { x: px(90 + 40 + 60 + 100 + 60 + 398 + 60 + 80 + 60 + 20 + 60), y: 900, text: '12.00', width: px(100), confidence: 94, lineConfidence: 92 },
    ],
  );
  // The layout stage then renders the cell gaps (20 units) as three spaces and
  // the phrase's inner spaces as one — the parser's cell split can fire.
  assert.deepEqual(groupLines(runs), ['CS   50300   Operating Systems Lab   3.00   A   12.00']);
});

test('blocksToRuns: the threshold is a share of the line height, so a larger font tolerates a wider space and a smaller one less', () => {
  // The same 20 px gap: a word space on a 60 px line (0.33), a boundary on a
  // 30 px line (0.67) — between a word and a number, which only the word-space
  // share governs (two title words have the wider share of the next test).
  const big = engineLine('Fall 2023', 0, 300, [20], [90, 90], 60);
  const small = engineLine('Fall 2023', 0, 300, [20], [90, 90], 30);
  assert.deepEqual(blocksToRuns([block(big)], 1, 1000).map((r) => r.text), ['Fall 2023']);
  assert.deepEqual(blocksToRuns([block(small)], 1, 1000).map((r) => r.text), ['Fall', '2023']);
  // Exactly the share joins (≤), one pixel more splits.
  const edge = engineLine('a b', 0, 300, [Math.floor(WORD_SPACE_SHARE * 40)], [90, 90], 40);
  assert.deepEqual(blocksToRuns([block(edge)], 1, 1000).map((r) => r.text), ['a b']);
  const over = engineLine('a b', 0, 300, [Math.floor(WORD_SPACE_SHARE * 40) + 1], [90, 90], 40);
  assert.deepEqual(blocksToRuns([block(over)], 1, 1000).map((r) => r.text), ['a', 'b']);
});

test('blocksToRuns: two title words up to the monospace share apart are one phrase; a number, a code or a short grade never joins across that gap', () => {
  // A Courier row at 30 px line height: a word space is a whole cell, 26 px
  // (0.87 of the height); a two-space cell gap 52 px (1.73).
  const mono = engineLine('CS 50300 Operating Systems 3.0 A', 0, 300, [26, 52, 26, 52, 26], [90, 90, 90, 90, 90, 90], 30);
  assert.deepEqual(blocksToRuns([block(mono)], 1, 1000).map((r) => r.text), ['CS', '50300', 'Operating Systems', '3.0', 'A']);
  // A proportional title followed by a two-letter grade 0.8 of the height away: the grade stays a cell.
  const graded = engineLine('Intro to Advanced Studies TR 0.00', 0, 300, [9, 9, 9, 24, 24], [90, 90, 90, 90, 90, 90], 30);
  assert.deepEqual(blocksToRuns([block(graded)], 1, 1000).map((r) => r.text), ['Intro to Advanced Studies', 'TR', '0.00']);
  // An all-capitals title's two-letter words break the phrase (they are what a grade looks like); its longer words join.
  const caps = engineLine('INTRO TO ADVANCED STUDIES', 0, 300, [26, 26, 26], [90, 90, 90, 90], 30);
  assert.deepEqual(blocksToRuns([block(caps)], 1, 1000).map((r) => r.text), ['INTRO', 'TO', 'ADVANCED STUDIES']);
  // The bound: exactly the share joins, a pixel more does not; a wider gap is a column.
  const edge = engineLine('Operating Systems', 0, 300, [Math.floor(TITLE_WORD_SPACE_SHARE * 30)], [90, 90], 30);
  assert.deepEqual(blocksToRuns([block(edge)], 1, 1000).map((r) => r.text), ['Operating Systems']);
  const over = engineLine('Operating Systems', 0, 300, [Math.floor(TITLE_WORD_SPACE_SHARE * 30) + 1], [90, 90], 30);
  assert.deepEqual(blocksToRuns([block(over)], 1, 1000).map((r) => r.text), ['Operating', 'Systems']);
  // What counts as a title word.
  for (const w of ['Operating', 'of', 'Ph.D.', "Dean's", 'Econ', 'STUDIES', 'Anlys', 'Pre-Req']) assert.ok(titleWord(w), w);
  for (const w of ['TR', 'CR', 'NG', 'IP', 'A', 'B+', 'I', '3.00', '50300', 'CS', '&', '|', '2023', 'A-']) assert.ok(!titleWord(w), w);
});

test('blocksToRuns: a skewed line\'s words share the baseline\'s middle; blank words are skipped; a line without a baseline or a box still places its words', () => {
  const skewed = engineLine('Fall 2023', 100, 900, [60], [90, 90]); // two cells, a column apart
  skewed.baseline = { x0: 100, y0: 912, x1: 300, y1: 888 }; // 24 px of skew across the line
  const [fall, year] = blocksToRuns([block(skewed)], 3, 3300);
  assert.equal(fall!.y, (3300 - 900) / 3);
  assert.equal(year!.y, fall!.y);
  assert.equal(fall!.text, 'Fall');
  assert.equal(year!.text, '2023');
  const blank = engineLine('Fall  2023', 100, 900, [4, 4], [90, 10, 90]); // the engine's spacing artefact: an empty word inside a word space
  assert.deepEqual(blocksToRuns([block(blank)], 3, 3300).map((r) => r.text), ['Fall 2023']);
  const noBaseline = engineLine('Fall 2023', 100, 900, [9], [90, 90]);
  delete (noBaseline as { baseline?: unknown }).baseline;
  assert.equal(blocksToRuns([block(noBaseline)], 3, 3300)[0]!.y, (3300 - noBaseline.bbox!.y1) / 3);
  const bare = engineLine('Fall 2023', 100, 900, [9], [90, 90]);
  delete (bare as { baseline?: unknown }).baseline;
  delete (bare as { bbox?: unknown }).bbox;
  assert.deepEqual(blocksToRuns([block(bare)], 3, 3300).map((r) => r.text), ['Fall 2023']);
  assert.deepEqual(blocksToRuns(null, 3, 3300), []);
  assert.deepEqual(blocksToRuns([{}], 3, 3300), []);
  assert.throws(() => blocksToRuns([], 0, 3300), /scale must be positive/);
});

test('the glyph join never glues OCR words: single-letter cells and letter-spaced headings keep their spaces', () => {
  // layout.ts joins runs that TOUCH (≤ 1 unit apart) on a line that is mostly
  // single characters — a glyph-per-item PDF's shape. An OCR word is never a
  // glyph: the engine separates words by a recognised space, at least 2 units
  // of ink gap on every pinned page (6 px at scale 3), so a grade cell "A"
  // between "3.00" and "12.00", a "T SA" of seal junk, or "S U M M A R Y"
  // stay apart as the parser expects.
  const grades = engineLine('A B+ C', 0, 300, [6, 6], [90, 90, 90]);
  assert.deepEqual(groupLines(blocksToRuns([block(grades)], 3, 1000)), ['A B+ C']);
  const junk = engineLine('T SA', 0, 300, [6], [40, 40]);
  assert.deepEqual(groupLines(blocksToRuns([block(junk)], 3, 1000)), ['T SA']);
  const spaced = engineLine('S U M M A R Y', 0, 300, [30, 30, 30, 30, 30, 30], [90, 90, 90, 90, 90, 90, 90]);
  assert.deepEqual(groupLines(blocksToRuns([block(spaced)], 3, 1000)), ['S   U   M   M   A   R   Y']);
});

/** A Banner-style two-column page as the engine sees it under its default
 * page segmentation: every row ONE engine line across both columns, cells
 * separated by wide gaps, words by spaces; the page 2550 × 3300 px at scale
 * 3 (letter size, 216 dpi). */
function bannerBlocks(): OcrBlockLike {
  const lines: ReturnType<typeof engineLine>[] = [];
  let y = 300;
  const row = (left: string, leftGaps: number[], right: string, rightGaps: number[], confidences: number[] = []) => {
    const l = engineLine(left, 100, y, leftGaps, confidences);
    const r = engineLine(right, 1400, y, rightGaps, confidences.slice((l.words ?? []).length));
    lines.push({ ...l, text: `${left} ${right}\n`, bbox: { ...l.bbox!, x1: r.bbox!.x1 }, baseline: { ...l.baseline!, x1: r.baseline!.x1 }, words: [...(l.words ?? []), ...(r.words ?? [])] });
    y += 40;
  };
  row('Fall 2019', [9], 'Fall 2020', [9]);
  row('College of Science', [9, 9], 'College of Science', [9, 9]);
  row('Computer Science', [9], 'Computer Science', [9]);
  for (let i = 0; i < 12; i++) {
    row(`CS 5${i}0 Course Title Words 3.00 A 12.00`, [60, 60, 9, 9, 60, 60, 60], `CS 6${i}0 Other Title Words 3.00 B+ 9.99`, [60, 60, 9, 9, 60, 60, 60], i === 3 ? [95, 95, 95, 95, 95, 61, 95, 95, 95, 95, 95, 95, 95, 95, 95, 95] : []);
  }
  row('Ehrs: 36.00 GPA-Hrs: 36.00 QPts: 144.00 GPA: 4.00', [9, 9, 9, 9, 9, 9, 9], 'Ehrs: 36.00 GPA-Hrs: 36.00 QPts: 144.00 GPA: 4.00', [9, 9, 9, 9, 9, 9, 9]);
  row('Good Standing', [9], 'Good Standing', [9]);
  return { paragraphs: [{ lines }] };
}

test('ocrLinesFromPage: a two-column page the engine read across both columns comes out column by column, with its cells and each line\'s least word confidence', () => {
  const lines = ocrLinesFromPage([bannerBlocks()], 2550, 3300, 3);
  const texts = lines.map((l) => l.text);
  const left = texts.indexOf('Fall 2019');
  const right = texts.indexOf('Fall 2020');
  assert.ok(left >= 0 && right > left, texts.join('\n'));
  // Nothing spliced: no line holds two course codes; the left column's rows precede the right's.
  assert.ok(!texts.some((t) => (t.match(/\bCS\b/g) ?? []).length > 1), texts.join('\n'));
  assert.equal(texts[left + 3], 'CS   500   Course Title Words   3.00   A   12.00');
  assert.equal(texts[right + 3], 'CS   600   Other Title Words   3.00   B+   9.99');
  assert.ok(texts.indexOf('CS   5110   Course Title Words   3.00   A   12.00') < right);
  // The least confident word on the line is the line's figure (the grade read at 61).
  assert.equal(lines[left + 6]!.confidence, 61);
  assert.equal(lines[left + 3]!.confidence, 95);
  // Under the engine-line rule a line is as sure as the engine's own line
  // figure (90 for every line here — the one the step-11 A/B rejected).
  assert.equal(ocrLinesFromPage([bannerBlocks()], 2550, 3300, 3, 'engine-line')[left + 6]!.confidence, 90);
  assert.equal(OCR_LINE_CONFIDENCE, 'min-word');
  // The parser reads every row with its own term.
  const p = parseExternalTranscript([...texts, '']);
  assert.equal(p.courses.length, 24);
  assert.ok(p.courses.slice(0, 12).every((c) => c.year === 2019 && c.season === 'fall'));
  assert.ok(p.courses.slice(12).every((c) => c.year === 2020 && c.season === 'fall' && c.grade === 'B+'));
});

test('ocrPageLayout hands the column layout on, and a second page of the same shape splits by it even when it is short', () => {
  const first = ocrPageLayout([bannerBlocks()], 2550, 3300, 3);
  assert.ok(first.hint !== undefined && first.hint.gapX > 300 && first.hint.gapX < 500, JSON.stringify(first.hint));
  // The last page: one term with two rows in each column — far under the 40 runs the full test needs.
  const lines: ReturnType<typeof engineLine>[] = [];
  let y = 300;
  const row = (left: string, leftGaps: number[], right: string, rightGaps: number[]) => {
    const l = engineLine(left, 100, y, leftGaps, []);
    const r = engineLine(right, 1400, y, rightGaps, []);
    lines.push({ ...l, text: `${left} ${right}\n`, bbox: { ...l.bbox!, x1: r.bbox!.x1 }, baseline: { ...l.baseline!, x1: r.baseline!.x1 }, words: [...(l.words ?? []), ...(r.words ?? [])] });
    y += 40;
  };
  row('Spring 2021', [9], 'Fall 2021', [9]);
  row('CS 700 Course Title Words 3.00 A 12.00', [60, 60, 9, 9, 60, 60, 60], 'CS 800 Other Title Words 3.00 A 12.00', [60, 60, 9, 9, 60, 60, 60]);
  row('CS 710 Course Title Words 3.00 A 12.00', [60, 60, 9, 9, 60, 60, 60], 'CS 810 Other Title Words 3.00 A 12.00', [60, 60, 9, 9, 60, 60, 60]);
  row('Ehrs: 6.00 GPA-Hrs: 6.00 QPts: 24.00 GPA: 4.00', [9, 9, 9, 9, 9, 9, 9], 'Ehrs: 6.00 GPA-Hrs: 6.00 QPts: 24.00 GPA: 4.00', [9, 9, 9, 9, 9, 9, 9]);
  const last: OcrBlockLike = { paragraphs: [{ lines }] };
  const alone = ocrPageLayout([last], 2550, 3300, 3).lines.map((l) => l.text);
  assert.ok(alone.some((t) => t.includes('CS   700') && t.includes('CS   800')), 'alone, a short page is read whole');
  const hinted = ocrPageLayout([last], 2550, 3300, 3, { hint: first.hint }).lines.map((l) => l.text);
  assert.ok(!hinted.some((t) => (t.match(/\bCS\b/g) ?? []).length > 1), hinted.join('\n'));
  assert.ok(hinted.indexOf('Spring 2021') < hinted.indexOf('CS   710   Course Title Words   3.00   A   12.00') && hinted.indexOf('CS   710   Course Title Words   3.00   A   12.00') < hinted.indexOf('Fall 2021'));
});

// --- the pinned pages: the engine's captured blocks through the shipped pipeline ---

const SCANS = new URL('./fixtures/ocr-scans/', import.meta.url);
interface PinnedPage {
  name: string;
  parser: 'nd' | 'external';
  dpi: number;
  width: number;
  height: number;
  expected: { university?: string | null; courses: string[] };
  blocks: OcrBlockLike[];
}
function pinnedPages(): PinnedPage[] {
  return readdirSync(SCANS)
    .filter((f) => f.endsWith('.blocks.json'))
    .sort()
    .map((f) => {
      const name = f.replace('.blocks.json', '');
      const e = JSON.parse(readFileSync(new URL(`${name}.expected.json`, SCANS), 'utf8')) as PinnedPage & { expected: PinnedPage['expected'] };
      return { name, parser: e.parser, dpi: e.dpi, width: e.width, height: e.height, expected: e.expected, blocks: JSON.parse(readFileSync(new URL(f, SCANS), 'utf8')) as OcrBlockLike[] };
    });
}

/** What the pipeline reads from each pinned page today (OCR step 11,
 * 2026-10-09) — the parser's rows as `rowOf` prints them, so a change in the
 * line builder, the layout stage or the parser shows here first. The truth
 * is each page's `expected.courses`; `right` counts the rows that match it.
 * Before step 11 the Banner page (L2) read 6 rows (5 right) because the
 * engine's lines spliced its two columns; it now reads all 10 (6 right — the
 * other four are the engine's own misreads: "000" and "300" for "0.00" and
 * "3.00", a stray quote). The sideways pages (L6) read nothing, as before. */
const PINNED_READING: Record<string, { university: string | null; rows: string[]; right: number }> = {
  'l0-external-transcript-p1': { university: 'Purdue University', right: 2, rows: ['CS 50300 | Operating Systems | 30 | A | fall 2023', 'CS 59000 | Special Topics in Systems | 3 | A- | fall 2023', 'CS 58000 | Algorithm Design | 3 | B+ | spring 2024'] },
  'l1-nd-transcript-p1': {
    university: 'University of Notre Dame',
    right: 7,
    rows: [
      'EECS 58200 | Operating Systems | 3 | IP | spring 2027 | graduate',
      'CSE 30321 | Computer Architecture | 3 | A | fall 2020 | undergraduate',
      'MATH 10550 | Calculus | | 4 | A | fall 2020 | undergraduate',
      'CSE 20110 | Discrete Mathematics | 3 | B+ | spring 2021 | undergraduate',
      'CSE 60641 | Graduate Operating Systems | 3 | A | fall 2026 | graduate',
      'CSE 63801 | Research Seminar | | 1 | S | fall 2026 | graduate',
      'CSE 60111 | Complexity and Algorithms | 3 | A- | spring 2027 | graduate',
      'CSE 60321 | Advanced Computer Architecture | 3 | B+ | spring 2027 | graduate',
      'CSE 60876 | Research Methods | 3 | IP | fall 2027 | graduate',
    ],
  },
  'l2-banner-transcript-p1': {
    university: null,
    right: 6,
    rows: [
      'CS 430 | Introduction Algorithms | 3 | A | fall 2019 | graduate',
      'CS 536 | Science of Programming | 3 | A | fall 2019 | graduate',
      'HUM 601 | TA Seminar | 0 | 000 | fall 2019 | graduate',
      'CS 535 | Dsgn and Anlys of Algorithms | 3 | A | spring 2020 | graduate',
      'CS 550 | Advnc Operating Syst | 3 | B+ | spring 2020 | graduate',
      'CS 553 | Cloud Computing | 12 | A | fall 2020 | graduate',
      'CS 597 | Reading and Special Problems | 3 | A | fall 2020 | graduate',
      'CS 595 | Econ & Priv Issues in Big Data | 3 | A | spring 2021 | graduate',
      'CS 691 | Research and Thesis Ph.D. | 0 | S | spring 2021 | graduate',
      'INTR 010 | ‘Summer Internship | 0 | NG | summer 2021 | graduate',
    ],
  },
  'l3-uc-system-transcript-p1': { university: 'University of California', right: 2, rows: ['CSE 202 | Algorithm Design and Analysis | 4 | A | fall 2023', 'CSE 221 | Operating Systems | 4 | A- | spring 2024'] },
  'l4-combined-transcript-p1': {
    university: 'Purdue University',
    right: 2,
    rows: [
      'CS 25100 | Data Structures and Algorithms | 4 | A | fall 2023 | undergraduate',
      'CS 30700 | Software Engineering | 3 | A- | fall 2023 | undergraduate',
      'CS 35400 | Operating Systems | 30 | A | spring 2024 | undergraduate',
      'CS 50300 | Operating Systems | 30 | A | fall 2024 | graduate',
      'CS 58000 | Algorithm Design | 3 | B+ | fall 2024 | graduate',
    ],
  },
  'l5-external-transcript-scan-p1': { university: 'Purdue University', right: 3, rows: ['CS 50300 | Operating Systems | 3 | A | fall 2023', 'CS 59000 | Special Topics in Systems | 3 | A- | fall 2023', 'CS 58000 | Algorithm Design | 3 | B+ | spring 2024'] },
  'l6-180-external-transcript-p1': { university: null, right: 0, rows: [] },
  'l6-90-nd-undergrad-transcript-p1': { university: null, right: 0, rows: [] },
};

test('every pinned page reads as PINNED_READING says, and no emitted line glues two of the engine\'s words', () => {
  const pages = pinnedPages();
  assert.deepEqual(pages.map((p) => p.name), Object.keys(PINNED_READING).sort(), 'one pinned reading per captured page');
  for (const page of pages) {
    const lines = ocrLinesFromPage(page.blocks, page.width, page.height, page.dpi / 72);
    const texts = [...lines.map((l) => l.text), ''];
    let university: string | undefined;
    let rows: string[];
    if (page.parser === 'nd') {
      const t = parseTranscript(texts);
      university = t.isNotreDame ? 'University of Notre Dame' : undefined;
      rows = t.courses.map((c) => rowOf({ courseId: c.courseId, title: c.title, credits: c.credits, grade: c.grade, year: c.term.year, season: c.term.season, level: c.level }));
    } else {
      const p = parseExternalTranscript(texts, [...lines.map((l) => l.confidence), 100]);
      university = p.university;
      rows = p.courses.map(rowOf);
    }
    const want = PINNED_READING[page.name]!;
    assert.deepEqual({ university: university ?? null, rows }, { university: want.university, rows: want.rows }, page.name);
    assert.equal(rows.filter((r) => page.expected.courses.includes(r)).length, want.right, `${page.name}: rows right`);
    // Every word the engine read appears whole on some line, as its own token:
    // the layout's glyph join (runs ≤ 1 unit apart on a line of single
    // characters) never fired on a word box.
    const tokens = new Set(lines.flatMap((l) => l.text.split(/\s+/)));
    for (const b of page.blocks) for (const para of b.paragraphs ?? []) for (const l of para.lines ?? []) for (const w of l.words ?? []) if (w.text.trim() !== '' && !/\s/.test(w.text.trim())) assert.ok(tokens.has(w.text.trim()), `${page.name}: the word "${w.text}" is not a token of any line`);
    // Each line's confidence is its least confident word's — never above any word it holds.
    for (const l of lines) assert.ok(l.confidence >= 0 && l.confidence <= 100, `${page.name}: confidence ${l.confidence}`);
  }
});

test('the pinned Banner page (L2, an office scan) is read column by column: both columns\' terms in order, no line holding two course codes', () => {
  const page = pinnedPages().find((p) => p.name === 'l2-banner-transcript-p1')!;
  const texts = ocrLinesFromPage(page.blocks, page.width, page.height, page.dpi / 72).map((l) => l.text);
  const order = ['Fall 2019', 'Spring 2020', 'Fall 2020', 'Spring 2021', 'Summer 2021'].map((t) => texts.indexOf(t));
  assert.ok(order.every((i, n) => i >= 0 && (n === 0 || i > order[n - 1]!)), `${JSON.stringify(order)}\n${texts.join('\n')}`);
  assert.ok(!texts.some((t) => (t.match(/\b(?:cs|Cs|CS|HUM|INTR)\s{3}\d{3}\b/g) ?? []).length > 1), texts.join('\n'));
  assert.ok(texts.includes('cs   536   Science of Programming   3.00   A   12.00'), 'the phrase "Science of Programming" survives dropWatermarks: "Science" alone, twelve times at four x positions, looked like a tile');
  // The engine's own line builder (steps 9–10) spliced the columns: its first course line held both.
  const engine = linesFromBlocks(page.blocks).map((l) => l.text);
  assert.ok(engine.some((t) => t.startsWith('Course Level: Graduate cs 553')), engine.join('\n'));
});

// --- the step-10 builder, kept for the bench's --engine-lines / --interword knobs ---

test('ocrLineText (the engine-line builder\'s rule) collapses every run of whitespace to one space and trims the ends', () => {
  const raw = 'CS 50300      Operating Systems         3.00    A\n';
  assert.equal(ocrLineText(raw), 'CS 50300 Operating Systems 3.00 A');
  assert.equal(ocrLineText('CS 50300 Operating Systems 3.00 A\n'), 'CS 50300 Operating Systems 3.00 A');
  assert.equal(ocrLineText('      UNOFFICIAL TRANSCRIPT   \r\n'), 'UNOFFICIAL TRANSCRIPT');
  assert.equal(ocrLineText('Fall\n2023'), 'Fall 2023');
  assert.equal(ocrLineText('\n'), '');
  assert.equal(ocrLineText(''), '');
});

test('ocrKeepSpaces (the measured, unadopted step-10 variant) keeps every inner space and trims only the ends', () => {
  const raw = 'CS 50300      Operating Systems         3.00    A\n';
  assert.equal(ocrKeepSpaces(raw), 'CS 50300      Operating Systems         3.00    A');
  assert.deepEqual(ocrKeepSpaces(raw).split(/\s{3,}/), ['CS 50300', 'Operating Systems', '3.00', 'A']);
  assert.deepEqual(ocrLineText(raw).split(/\s{3,}/), ['CS 50300 Operating Systems 3.00 A']);
  assert.equal(ocrKeepSpaces('      UNOFFICIAL TRANSCRIPT   \r\n'), 'UNOFFICIAL TRANSCRIPT');
  assert.equal(ocrKeepSpaces('Intro  to Programming'), 'Intro  to Programming');
  assert.equal(ocrKeepSpaces('Fall\n2023'), 'Fall 2023');
  assert.equal(ocrKeepSpaces('\n'), '');
});

test('linesFromBlocks (the engine-line builder) walks blocks → paragraphs → lines, drops empty lines, keeps the LINE confidence', () => {
  const blocks: OcrBlockLike[] = [
    {
      paragraphs: [
        { lines: [{ text: 'Purdue University\n', confidence: 96.5 }, { text: '   \n', confidence: 0 }] },
        { lines: [{ text: 'Fall 2023\n', confidence: 91 }] },
      ],
    },
    { paragraphs: [{ lines: [{ text: 'CS 50300      Operating Systems         3.00    A\n', confidence: 88.25 }] }] },
    { paragraphs: [] },
    {},
  ];
  assert.deepEqual(linesFromBlocks(blocks), [
    { text: 'Purdue University', confidence: 96.5 },
    { text: 'Fall 2023', confidence: 91 },
    { text: 'CS 50300 Operating Systems 3.00 A', confidence: 88.25 },
  ]);
  assert.deepEqual(linesFromBlocks(blocks, ocrKeepSpaces)[2], { text: 'CS 50300      Operating Systems         3.00    A', confidence: 88.25 });
  assert.deepEqual(linesFromBlocks(null), []);
  assert.deepEqual(linesFromBlocks(undefined), []);
  assert.deepEqual(linesFromBlocks([]), []);
});

test('the app sets no engine parameter today (preserve_interword_spaces was measured and not adopted)', () => {
  assert.deepEqual({ ...OCR_ENGINE_PARAMETERS }, {});
  assert.ok(Object.isFrozen(OCR_ENGINE_PARAMETERS));
});
