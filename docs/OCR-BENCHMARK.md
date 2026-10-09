# OCR benchmark — method, seeds, baseline (2026-10-09)

The opt-in OCR path (`src/transcript/ocr.ts`: a scanned external transcript's PDF rendered by pdfjs,
read by the bundled Tesseract in `public/ocr/`, then `parseExternalTranscript`) had no accuracy
number before this bench (plan `docs/TRANSCRIPT-ACCURACY-PLAN.md` §2 step 9; the path then rendered
at a fixed scale 3.0 and fed the engine's own lines, whitespace collapsed — since steps 11 and 12 it
renders at the scan's own resolution and reads the engine's word boxes through the layout stage).
This file is the method, the seed sections, the baseline and the ladder so far, every measured
change with its verdict, and how to run it — written so the next maintainer can repeat a run, add
a seed, or judge an OCR change by its numbers rather than by one lucky scan.

Everything lives in `scripts/dev/ocr-bench/` and is dev-only: `npm run ocr-bench` never runs in
`npm test`, needs Python 3 with Pillow and numpy (the same two the scan sanitizer needs), and writes
only under `~/degree-audit-samples/bench-out/` (`$TRANSCRIPT_SAMPLES`), never under the repo.

## Method

1. **Seeds** (`seeds.mts`): a clean document plus its ground truth (below).
2. **Clean pages**: each seed is rendered once at 300 dpi (`scripts/dev/pdf-lines-node.mts`
   `pdfToPagePngs`, pdfjs + @napi-rs/canvas — the same renderer the app's OCR path uses, in node), or
   taken from `render-lines.py` for a line-list fixture. The app reads at most ten pages
   (`MAX_PAGES`), so the ladder stops there; the truth keeps every page and what the app never reads
   counts against it.
3. **The ladder** (`degrade.py`, Pillow + numpy, seeded — every drawn value is in the run's
   `manifest.json`):

   | level | what | dpi | file |
   |---|---|---|---|
   | L0 | clean raster | `--dpi` (200 in the baseline) | PNG |
   | L1 | good scan: Gaussian blur σ 0.6, JPEG q75 | 200 | JPEG |
   | L2 | office scan: skew ±0.5–1.5°, Gaussian noise σ 6, a lighting gradient, JPEG q60 | 150 | JPEG |
   | L3 | photocopy: skew 2–3°, a hard tone curve, salt-and-pepper 0.2 %, thin white streaks, a dark border band | 200 | PNG |
   | L4 | stamped: L1 + a DRAWN red seal (rings, star, invented text on a circle; alpha 0.5–0.7) over the table and a diagonal watermark (UNOFFICIAL or the university's name, alpha 0.15) | 200 | JPEG q75 |
   | L5 | phone photo: perspective (1–3 % corner offsets), shadow gradient and vignette, 1200–1600 px wide, JPEG q50 | ≈ width/8.5 | JPEG |
   | L6-90, L6-180 | L1 turned 90° and 180° | 200 | JPEG |
   | L7 | scanner text layer: the L2 image wrapped with a deliberately poor invisible text layer (the truth lines with seeded OCR-style confusions, some column gaps collapsed) | 150 | PDF only |

   Every level is re-wrapped as an image-only PDF by the bench's own writer (lossless FlateDecode for
   PNG levels, the level's own JPEG bytes for JPEG levels — Pillow's PDF writer would re-encode every
   page as JPEG q75), so the app's real path runs on it. L7 is the one level the app never OCRs: a
   PDF with a text layer takes the exact path (`hasTextLayer`), rows locked, no flags — so the bench
   reads L7 with `pdfToLinesNode` exactly as the app would.
4. **The engine** (`ocr-run.mjs`, grown from `scripts/dev/ocr-lines.mjs`): the same tesseract.js,
   core and English model as the app (`public/ocr/`, `cacheMethod: 'none'`), on the level's PDF
   rendered as the app renders it — since OCR step 12 at the scan's own resolution between 216 and
   300 dpi per page (`ocrRenderScale`; `--scale auto`), before it at a fixed 72 × 3.0 = 216 dpi
   (`--scale 3`). With no knob set it reproduces `ocr.ts` line for line (the header comment names
   each line) — that is the `baseline` config, and the orientation trial of step 12 is part of it.
   Knobs for the plan's experiments: `--scale`, `--psm`, `--dpi` (`user_defined_dpi`),
   `--interword` (preserve the spaces AND stop collapsing them), `--engine-lines`,
   `--line-confidence`, `--threshold`, `--invert`, `--rotate-auto`, `--border`,
   `--rotation-trial` / `--trial-always`, `--binary-dir` (the engine's own binarised page — proof
   that a thresholding parameter reached it), `--words`, `--max-pages`, or a `--config file.json`
   whose base name labels the results' `config` column. `results.json` keeps each page's render
   dpi, scan dpi, mean word confidence, rotation and trial figures (`pageFigures`).
5. **Parse and score** (`score.mts` here, over `scripts/dev/score.mts` — the replay's one scorer, so
   an OCR'd page and a text page are judged alike): the seed's parser (external, or the ND parser
   for ND generator PDFs) on the OCR lines and confidences; then per (seed, level, dpi, config):
   - `exact` — the corpus test's own pass criterion;
   - **row accuracy** = matched rows whose five cells (title, credits, grade, term, level) all
     agree / expected rows; **rows found** = matched / expected (the replay's recall);
     **precision** = matched / parsed;
   - **false rows** = rows read from a negative (a key, legend, form) + unmatched rows on a positive;
   - **field accuracy** = right cells / cells over the matched rows (pooled, and per field);
   - **line CER** = Levenshtein distance between the OCR line stream and the truth line stream,
     page by page (both whitespace-collapsed, empty lines dropped), / truth characters;
   - **flag precision / recall** = of the rows the parser flagged `lowConfidence`, how many were
     actually wrong / of the rows actually wrong, how many were flagged;
   - **s/page** = the engine's recognize time per page read (rendering excluded; node on an
     M-series Mac — the browser is slower).
   A `text` row per seed — the exact path on the source document — is the parser's own ceiling: an
   OCR level cannot beat it, and a known-failing public PDF is inexact there already.
6. **Boards** (`bench.mjs`): by level over the real seeds (generator + public PDFs), by family ×
   level, synthetic renders on their own board, private seeds as one aggregate line per level;
   `results.csv` has every row, `results.json` feeds `--baseline`, which prints per-level deltas
   and per-(seed, level) regressions first (exit 1 on any).

## Seeds

### Synthetic (generator PDFs and the scan fixture)

`tests/fixtures/*.pdf` from `make-transcript-pdfs.mjs` — five Notre Dame transcripts (read by the ND
parser; the expectation is the rows plus "is this Notre Dame"), seven external ones (the Banner
two-column pair among them), and `external-transcript-scan.pdf` (image-only, from
`make-scan-fixture.py`; its truth lines are the script's own text). Ground truth = the exact path's
reading of the same PDF, so L0 must reproduce it; `other-transcript` and `no-lines-transcript` read
no rows and are negatives. All identities are placeholders (Jane Q. Student, John Q. Boilermaker).

### Public registrar PDFs

Every `pdf` entry of `tests/fixtures/public-transcripts/sources.json` (54 on 2026-10-09: 15
positives, 39 negatives — keys, legends, forms and regulations, which measure false rows under
noise), kept outside the repo in `~/degree-audit-samples/public-pdfs/<name>.pdf`. A missing file is
rebuilt with `--fetch` from the entry's URL and kept only when its SHA-256 and byte size match the
pinned ones; a dead link or a changed file is logged and skipped — on 2026-10-09, UConn, Delaware,
Jadavpur and Chulalongkorn's regulations did not answer and Rice's key had changed upstream (not
kept), so 49 seed the bench. Rows come from `expected.json`; the known-failing list's entries are
marked † in the per-seed table (their `text` row is inexact by the parser's own doing).

### Synthetic renders (regression only)

`render-lines.py` draws any line-list fixture (public or master's corpus) to letter pages in three
skins — `mono` (Courier New), `ruled` (Arial with column rules), `banner` (two 7.5-pt halves) —
every three-space gap a tab stop, the type shrunk until a table fits, the truth stream carrying the
page breaks as rendered. These are layouts no registrar printed, twice removed from a real scan, so
they sit on their own board (`--full` or `--families synthetic-render`) and count for regressions
only. `--quick` renders one (the Vaasa template, `ruled`) beside its real PDF.

### Private seeds (aggregate only)

`--seeds-dir <dir>`: the maintainer's own PDFs (sanitized scans, synthetic records) with an
`expected.json` beside them keyed by file stem — the corpus shape (`courses` as
`code | title | credits | grade | season year[ | level]`, the seven header fields, `negative`,
plus an optional `"parser": "nd"`). They are `private-NN` in every output, one aggregate line per
level in `results.md`, and nothing about them — name, numbers, count — goes into a committed
file. This file reports numbers for the two public sections only.

## Pinned pages (`tests/fixtures/ocr-scans/`)

`pin-pages.mjs <bench-out-dir>` copies one generator page per level (nine: L0 … L7, placeholder
identities only — the script refuses any other family; ≤ 300 KB each, ≤ 3 MB together) with a
`.expected.json` (the page's truth lines, its expected rows, the ladder parameters it was drawn
with) and, for the OCR levels, a `.blocks.json` — the engine's `blocks` output captured once and
trimmed to lines and words with boxes and confidences. The pure stage of OCR step 2.1 (word boxes →
lines) unit-tests against those captures without the engine; `npm run ocr-bench -- --pinned` OCRs
the nine files as images (not through a PDF, so its numbers are not the ladder's) for a quick
check that the engine still reads what it read.

## How to run

    npm run ocr-bench -- --quick                       # one seed per family × L0/L2/L5 (about a minute)
    npm run ocr-bench -- --quick --config knobs.json --baseline ~/degree-audit-samples/bench-out/ocr-baseline-20261009
    npm run ocr-bench -- --families generator-external,generator-nd,generator-scan,public-pdf --levels L0,L1,L2,L3,L4,L5,L6,L7 --dpi 200
    npm run ocr-bench -- --full                        # prints the estimate; --yes runs it (hours; attended)
    npm run ocr-bench -- --pinned                      # the committed pages
    npm run ocr-bench -- --only banner --levels L2     # one seed, its diffs printed (public seeds only)
    node --experimental-strip-types scripts/dev/ocr-bench/ocr-run.mjs --interword --psm 4 scan.pdf   # the engine alone

`knobs.json` is any of `{scale, psm, dpi, engineLines, interword, lineConfidence, threshold, invert,
rotateAuto, border, rotationTrial, trialAlways, binaryDir, words, maxPages, params}`; `--seed` changes
the ladder's draws, `--dpi` L0's raster (300 makes L0 a true 300-dpi source — the resolution A/B of
step 12), `--skins` the renders, `--fetch` rebuilds missing public PDFs. A medium-set A/B —
`--families generator-external,generator-nd,generator-scan,public-pdf --levels L2,L5` (62 seeds,
151 pages, ~12 min) — is the one to trust over `--quick`: two step-12 verdicts reversed between them. The run folder holds every degraded page and PDF
(`<seed>/<level>/`), the 300-dpi masters, `results.csv`, `results.md` and `results.json`.

Adding a seed: a generator PDF is picked up by name in `seeds.mts` (`GENERATOR_PDFS`); a public PDF
needs its `sources.json` `pdf` entry (URL, SHA-256, bytes) and `expected.json` rows, as for the
replay; a line-list fixture is rendered automatically under `--families synthetic-render`.


## Baseline and the ladder so far (2026-10-09)

Four full-ladder runs exist under `~/degree-audit-samples/bench-out/` (62 seeds — the 13 generator
PDFs and the 49 public PDFs, 26 positives + 36 negatives, 151 pages, 620 rows each, ≈ 44 min):

| run | code | use |
|---|---|---|
| `ocr-baseline-20261009/` (11:05) | the step-9 pipeline — the engine's own lines, whitespace collapsed — on the parser BEFORE Batch B's F4–F6 | the pinned pages were cut from it; its `text` row is 49/62 exact against 60/62 today, so deltas against it are confounded (step 10's lesson) and it is kept as history, not as a baseline |
| `ocr-step10-before-20261009/` | the same pipeline on today's parser | the clean "before" of the OCR steps: every number below starts here |
| `ocr-step11-after-20261009/` | word boxes through the layout stage (step 11) | the ladder in force for L0–L5 after step 12 too: the source-aware scale renders the ladder's 150–200-dpi sources exactly as before (`--quick` and the medium set 0 / 0), and the orientation trial leaves every upright page its 0° reading |
| `ocr-full-20261009/` | the shipped pipeline (steps 11 + 12) | the sign-off run, started detached by the closing verification; read it with `--compare ~/degree-audit-samples/bench-out/ocr-full-20261009 --baseline ~/degree-audit-samples/bench-out/ocr-step11-after-20261009` — expected: L0–L5 within the trial's two junk pages of identical, L6-90 / L6-180 from 0 to about 65 % row accuracy |

By level, before (`ocr-step10-before`) → after (`ocr-step11-after`; the L6 figures from the step-12
medium-set trial run `ocr-step12-rotation-trial-medium/`, which read all four turns):

| level | exact | row acc | rows found | false rows (negatives with any) | field acc | CER | flag P/R | s/page |
|---|---|---|---|---|---|---|---|---|
| text | 60/62 | 93.0 % | 93.0 % | 1 (1/36) | 100 % | 0 | — | 0 |
| L0 | 34 → 35 | 50.0 → 65.2 % | 87.8 → 89.6 % | 19 (5) → 13 (6) | 81.7 → 87.3 % | 40.5 → 29.1 % | 76.9 / 8.3 → 70.0 / 53.2 % | 1.93 |
| L1 | 33 → 34 | 48.9 → 63.7 % | 88.5 → 90.7 % | 24 (6) → 15 (7) | 81.3 → 86.3 % | 40.4 → 29.5 % | 61.5 / 6.1 → 72.0 / 61.4 % | 1.96 |
| L2 | 34 → 32 | 46.3 → 54.1 % | 86.7 → 88.1 % | 24 (6) → 16 (7) | 80.3 → 80.9 % | 45.5 → 37.2 % | 86.4 / 14.3 → 70.8 / 63.0 % | 2.16 |
| L3 | 34 → 33 | 45.6 → 41.5 % | 83.7 → 81.9 % | 27 (6) → 19 (8) | 83.9 → 81.4 % | 42.6 → 42.2 % | 76.9 / 15.4 → 60.8 / 59.4 % | 1.87 |
| L4 | 32 → 29 | 38.1 → 41.5 % | 85.9 → 86.3 % | 22 (5) → 17 (8) | 76.1 → 73.1 % | 42.3 → 32.0 % | 81.8 / 23.8 → 88.1 / 69.6 % | 2.04 |
| L5 | 34 → 34 | 47.4 → 58.1 % | 87.0 → 89.6 % | 23 (4) → 21 (5) | 81.2 → 83.8 % | 42.3 → 35.8 % | 84.2 / 12.3 → 79.5 / 66.0 % | 1.79 |
| L6-90 | 7 → 34 | 0 → 65.2 % | 0 → 90.0 % | 221 (29) → 23 (7) | — → 87.4 % | 90.5 → 29.4 % | — → 69.9 / 56.7 % | 3.63 → ≈ 8 (four readings of page 1) |
| L6-180 | 15 → 33 | 0 → 64.4 % | 0 → 90.7 % | 54 (21) → 15 (8) | — → 86.4 % | 91.2 → 29.5 % | — → 70.3 / 52.3 % | 2.07 → ≈ 8 |
| L7 | 30 | 1.1 % | 38.1 % | 100 (6) | 56.7 % | 17.3 % | — | 0 (the text layer, never OCR'd) |

And on 300-dpi sources (L0 rendered at `--dpi 300`, 62 seeds): 216 dpi (`ocr-step12-before-l0-300/`)
→ the source-aware scale (`ocr-step12-shipped-l0-300/`): exact 36 → 40, row accuracy 66.3 → 70.0 %,
rows found 89.3 → 92.2 %, false rows 15 → 9, 1.18 × the time.

Where the losses sit (the step-11 verdict, unchanged by step 12): the parser's header-mapped cell
path on OCR'd cells — one misread header word unmaps a table (Alberta 19 → 3 rows right at L2),
a section cell left in the title (Minerva), junk cells taken for a code on 15 negative lines — and
one layout case (the insideND page at L4 split into two columns). Those are plan step 2.5's; the
two-pass deskew (keep `rotateAuto`'s reading only when the engine's own estimate is ≥ 1.5°) is the
next preprocessing candidate.

## OCR step 12 — the engine's parameters, the render scale, preprocessing (2026-10-09)

Plan steps 2.2–2.4, each an A/B on the same parser against a baseline made on the same code
(`bench-out/ocr-step12-before-quick/`, `-before-medium/` = 62 seeds, 151 pages at L2 and L5, and the
step-11 full ladder `ocr-step11-after-20261009/` for L3 and L6). `--quick` is 6 seeds (12 pages) at
L0 / L2 / L5. Row accuracy / rows found / false rows per level, then the verdict; the full per-run
boards are in each run folder's `results.md`.

| experiment (config) | L0 | L2 | L5 | medium set (62 seeds) | time | verdict |
|---|---|---|---|---|---|---|
| baseline (PSM 6, no dpi hint, scale 3.0 = 216 dpi) | 65.5 / 93.1 / 2 | 62.1 / 93.1 / 2 | 58.6 / 93.1 / 4 | L2 54.1 / 88.1 / 16; L5 58.1 / 89.6 / 21 | 1.8 s/page | — |
| 2.2 PSM 4 (one column) | 65.5 / 93.1 / 3 | 55.2 / 86.2 / 4 | 27.6 / 58.6 / 1 | — | 1.0 × | no: the phone-photo pages lose two thirds of their rows |
| 2.2 PSM 11 (sparse text) | 37.9 / 93.1 / 1 | 27.6 / 55.2 / 0 | 34.5 / 93.1 / 2 | — | 1.2 × | no: the words come back, the grade cells do not (grade accuracy 85 → 56 %) |
| 2.2 PSM 3 (automatic, extra) | 69.0 / 93.1 / 0 | 55.2 / 86.2 / 1 | 27.6 / 55.2 / 2 | — | 1.1 × | no: the Banner page exact and the Stanford key clean at L0, the same L5 collapse |
| 2.2 `user_defined_dpi` 216 | identical | identical | identical | 124 rows identical | 1.0 × | no-op for the LSTM engine; not set |
| 2.3 flat 300 dpi (scale 4.166) | 65.5 / 96.6 / 2 | 65.5 / 96.6 / 2 | 69.0 / 96.6 / 3 | L2 53.7 / 89.6 / 15; L5 52.2 / 90.7 / 14 | 1.2 × | not as a flat scale: the ladder's 150–200-dpi sources lose rows at L5 (upsampled past their own resolution; a misread header cell unmaps a Minerva table) |
| 2.3 300 dpi on 300-dpi sources (L0 at `--dpi 300`, 62 seeds) | 66.3 → 70.0 / 89.3 → 92.2 / 15 → 9; exact 36 → 40 | — | — | — | 1.18 × | **adopted as the source-aware scale**: a page renders at its scan's own resolution between 216 and 300 dpi (`ocrRenderScale(w, h, scanDpi)`), so every ladder level reads as before and a 300-dpi scan gains |
| 2.4 `rotateAuto` (the engine's skew) | — | 48.3 / 93.1 / 4 | 62.1 / 96.6 / 4 | L2 37.8 / 88.5 / 17; L3 41.5 → 58.9 / 81.9 → 86.7 / 19 → 15; L5 58.5 / 90.4 / 20; L6 unchanged | 1.25–1.3 × | no: photocopies (2–3°) gain 17 points, office scans (±0.5–1.5°) lose 16 — the small-angle re-rendering itself hurts (the angle estimate is accurate); the two-pass form is the next step's candidate |
| 2.4 `thresholding_method` 1 (Leptonica Otsu) | 65.5 / 93.1 / 1 | 0.0 / 0.0 / 5 | 17.2 / 34.5 / 4 | — | 10 × at L2 | no (proven to take effect: the engine's `imageBinary` differs under 0 / 1 / 2) |
| 2.4 `thresholding_method` 2 (Sauvola) | 75.9 / 100 / 0 | 55.2 / 96.6 / 0 | 55.2 / 100 / 2 | L2 41.1 / 88.9 / 14; L5 57.8 / 89.6 / 14 | 1.0 × | no: fewer false rows, far fewer rows right (the Minerva long record 47 → 10) |
| 2.4 `tessedit_do_invert` 0 | 72.4 / 100 / 1 | 62.1 / 96.6 / 2 | 62.1 / 96.6 / 4 | L2 55.6 / 88.5 / 17; L5 58.5 / 90.0 / 23 | 0.93–0.97 × | no: +1.5 / +0.4 points and faster, but false rows rise on the medium set (16 → 17, 21 → 23) |
| 2.4 10-px white border | 65.5 / 93.1 / 2 | 62.1 / 93.1 / 2 | 58.6 / 96.6 / 1 | — | 1.08 × | no: neutral on rows, scrambles a key page's reading order (Stanford CER 31 → 75 %) |
| 2.4 orientation trial (page 1 at 0 / 90 / 180 / 270°, the best mean word confidence kept) | 65.5 / 93.1 / 2 | 62.1 / 93.1 / 2 | 58.6 / 93.1 / 4 | L6-90 row accuracy 0 → 65.2 %, rows found 0 → 90.0 %, false rows 274 → 23, CER 90.4 → 29.4 %; L6-180 0 → 64.4 %, 0 → 90.7 %, 48 → 15, 91.0 → 29.5 % — the turned levels now read within a point or two of the upright ones (L2 54.1 %, L5 58.1 %); L2 and L5 themselves unchanged row for row but for the two junk pages a turn beat by 1.5 / 3.5 points (one false row each), which the margin keeps upright | 4 × page 1 without the early exit | **adopted with the early exit** — see below |

The orientation trial on `--quick` with L6 added (`bench-out/ocr-step12-rotation-trial-quick/` vs
`-before-quick-l6/`): L6-90 row accuracy 0 → 69.0 %, rows found 0 → 93.1 %, false rows 18 → 2;
L6-180 0 → 65.5 %, 0 → 96.6 %, 9 → 1; L0–L5 identical to the baseline (every upright page kept its
0° reading). `--pinned` under the shipped config (`bench-out/ocr-step12-shipped-pinned/`): the two
sideways pinned pages read as their upright selves — L6-180 external-transcript 0 → 2 of 3 rows right,
CER 85.7 → 0.3 %; L6-90 nd-undergrad 0 → 4 of 5, CER 94.7 → 0.2 % — the other seven unchanged. On the medium set with all four turns always read (`bench-out/ocr-step12-rotation-trial-medium/` vs the step-11 ladder): L6-90 row accuracy 0 → 65.2 %, rows found 0 → 90.0 %, false rows 274 → 23; L6-180 0 → 64.4 %, 0 → 90.7 %, 48 → 15 — the turned levels read within a point or two of L2 / L5 — and L2 / L5 unchanged row for row except two junk pages a turn "beat" by 1.5 and 3.5 points (one false row each; the shipped margin of 5 keeps them upright). The early exit and the margin come from the trial figures kept in that run's `results.json` (`pageFigures`): upright pages score 70 or more nine times in ten and never under 21; the wrong way round never over 54.6; the right turn won 123 of 124 turned pages, by a median of 45.8 points.


## Sign-off run of the shipped pipeline (2026-10-09, full ladder)

`npm run ocr-bench -- --compare ~/degree-audit-samples/bench-out/ocr-full-20261009 --baseline ~/degree-audit-samples/bench-out/ocr-step11-after-20261009`
(62 seeds: the generator PDFs and the public registrar PDFs; the shipped pipeline = word boxes through the layout
stage, each page rendered at its scan's own resolution between 216 and 300 dpi, the orientation trial on page 1):

| level | row accuracy | rows found | false rows (negatives) | CER | s/page |
|---|---|---|---|---|---|
| text (reference) | unchanged | | | | |
| L0–L5 (clean … phone photo) | unchanged from step 11 | unchanged | unchanged | unchanged | 1.9–2.2 → 2.4–3.0 (the resolution step) |
| L6-90 (sideways scan) | 0.0% → **65.2%** | 0% → 90.0% | 274 (30/36) → 23 (7/36) | 90.4% → 29.4% | 3.6 → 8.0 (the trial on page 1) |
| L6-180 (upside down) | 0.0% → **64.4%** | 0% → 90.7% | 48 (20/36) → 15 (8/36) | 91.0% → 29.5% | 2.1 → 7.9 |
| L7 (scanner text layer) | unchanged | | | | |

The ten "regressions" the compare lists are all at L6: pages that read nothing before now read, and a few key/legend
pages (Duke, Waterloo, UWO, HKU, the McGill course outline) yield one to six junk rows once turned — the same false
rows those pages produce upright at L2/L5, now reachable. 113 improvements. Private seeds: none in this run.
