// The OCR benchmark's orchestrator (2026-10-09, transcript accuracy program,
// OCR step 9): seeds (seeds.mts) → clean 300-dpi pages (pdfToPagePngs, or
// render-lines.py's pages) → the degradation ladder (degrade.py) → the app's
// OCR path on each level's image-only PDF (ocr-run.mjs: pdfjs at the app's
// per-page scale — the scan's own resolution between 216 and 300 dpi since OCR
// step 12; --config {"scale": 3} is the fixed 216 dpi before it — the bundled
// Tesseract, ocr-lines.ts's line builder) → the app's parser → the one
// scorer plus CER, flags and seconds (score.mts here) → results.csv,
// results.md, results.json, and deltas against an earlier run.
//
//   npm run ocr-bench -- --quick                 # one seed per family × L0/L2/L5, minutes
//   npm run ocr-bench -- --full                  # prints the estimate; add --yes to run it
//   npm run ocr-bench -- --pinned                # the committed pages (tests/fixtures/ocr-scans)
//   npm run ocr-bench -- --levels L0,L1,L2,L4,L5 --families generator-external,generator-nd,generator-scan,public-pdf
//   npm run ocr-bench -- --quick --config x.json --baseline ~/degree-audit-samples/bench-out/ocr-baseline-20261009
//
// Options
//   --quick | --full | --pinned   the preset (see above); without one, --levels/--families say what runs
//   --levels L0,L2,…    the ladder levels (L6 = L6-90 and L6-180; 'text' — the exact path on the
//                       source — is always added as the reference row)
//   --families a,b      generator-external, generator-nd, generator-scan, public-pdf,
//                       synthetic-render, private (default: all but synthetic-render and private)
//   --only <substring>  seeds whose id contains it; prints their diffs (public seeds only — they quote rows)
//   --dpi 200           L0's raster dpi (the other levels fix their own)
//   --seed 7            the ladder's random seed
//   --config file.json  engine knobs (ocr-run.mjs's keys); its base name names the config column
//   --seeds-dir <dir>   private PDFs + expected.json (named private-NN everywhere)
//   --skins mono,ruled,banner   for synthetic renders (default all three; --quick: ruled)
//   --fetch             rebuild missing public PDFs from sources.json (verified by SHA-256)
//   --out <dir>         default $TRANSCRIPT_SAMPLES/bench-out/ocr-<date>/ (never under the repo)
//   --baseline <dir>    an earlier --out dir; prints per-level deltas, regressions first; exit 1 if any
//   --compare <dir>     no run: print the deltas of that finished --out dir against --baseline
//                       (two runs made separately — a before and an after on the same code)
//   --yes               run --full without stopping at the estimate
//   --l7 app|exact|flag-only   how L7 (a scan with its scanner's own text layer) is read: `app`
//                       (the default) as the app reads it since Batch C answer (6), 2026-10-09 —
//                       every page a scan → the text OCR-grade (each line at
//                       SCANNER_LAYER_CONFIDENCE: flagged, the scan-only repairs on, the
//                       junk-code guard off since the 2026-10-10 review fix); `exact` as
//                       before it (the 2026-09-06 lock: the exact path, nothing flagged);
//                       `flag-only` the exact parse with every row flagged (the alternative measured)
//   --reparse <dir>     no engine: re-parse and re-score the OCR lines an earlier run saved
//                       (<dir>/<seed>/<level>/ocr-lines.json — every run writes them since plan
//                       step 2.5) with TODAY's parser — a parser-only A/B in seconds, exact
//                       because the engine is deterministic; --levels/--families/--only filter
//                       as usual, and the config is the saved run's
//
// Output (all under --out): <seed>/master/ (300-dpi pages), <seed>/<level>/
// (the level's images + PDF, manifest.json, render/ = what pdfjs gave the
// engine, ocr-lines.json = the lines the parser read, for --reparse),
// results.csv (one row per seed × level), results.md (the boards),
// results.json (rows + boards, for --baseline).
//
// FERPA: public and synthetic seeds are named; private seeds are private-NN
// and appear in results.md as ONE aggregate line. Nothing here writes into
// the repository.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseExternalTranscript } from '../../../src/transcript/external.ts';
import { pdfScanPagesNode, pdfToLinesNode, pdfToPagePngs } from '../pdf-lines-node.mts';
import { SCANNER_LAYER_CONFIDENCE } from '../../../src/transcript/scanner-layer.ts';
import { collectSeeds, FAMILIES, ndAsParsed } from './seeds.mts';
import { BASELINE_CONFIG, createOcrWorker, mergeConfig, ocrDocument, recognizePage, rotationTrial } from './ocr-run.mjs';
import { aggregate, aggregateFigures, pct, scoreBench } from './score.mts';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..', '..');
const DEGRADE = join(here, 'degrade.py');
const PINNED_DIR = join(root, 'tests', 'fixtures', 'ocr-scans');
const ALL_LEVELS = ['L0', 'L1', 'L2', 'L3', 'L4', 'L5', 'L6-90', 'L6-180', 'L7'];
const QUICK_LEVELS = ['L0', 'L2', 'L5'];
/** s/page assumed for the estimate when no run has measured one yet (node, M-series laptop). */
const DEFAULT_SECONDS_PER_PAGE = 1.6;
/** degrade.py + rendering, per page × level. */
const PREP_SECONDS_PER_PAGE = 0.6;

function parseArgs(argv) {
  const o = { preset: undefined, levels: undefined, families: undefined, only: undefined, dpi: 200, seed: 7, config: undefined, seedsDir: undefined, skins: ['mono', 'ruled', 'banner'], fetch: false, out: undefined, baseline: undefined, compare: undefined, reparse: undefined, yes: false, l7: 'app' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${a} needs a value`);
      return v;
    };
    if (a === '--quick' || a === '--full' || a === '--pinned') o.preset = a.slice(2);
    else if (a === '--levels') o.levels = next().split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--families') o.families = next().split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--only') o.only = next();
    else if (a === '--dpi') o.dpi = Number(next());
    else if (a === '--seed') o.seed = Number(next());
    else if (a === '--config') o.config = resolve(next());
    else if (a === '--seeds-dir') o.seedsDir = resolve(next());
    else if (a === '--skins') o.skins = next().split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--fetch') o.fetch = true;
    else if (a === '--out') o.out = resolve(next());
    else if (a === '--baseline') o.baseline = resolve(next());
    else if (a === '--compare') o.compare = resolve(next());
    else if (a === '--reparse') o.reparse = resolve(next());
    else if (a === '--l7') {
      o.l7 = next();
      if (!['app', 'exact', 'flag-only'].includes(o.l7)) throw new Error(`--l7 takes app, exact or flag-only (got ${o.l7})`);
    }
    else if (a === '--yes') o.yes = true;
    else throw new Error(`unknown option ${a} (see the header of scripts/dev/ocr-bench/bench.mjs)`);
  }
  const samples = process.env['TRANSCRIPT_SAMPLES'] ?? join(homedir(), 'degree-audit-samples');
  if (o.out === undefined) o.out = join(samples, 'bench-out', `ocr-${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '').replace(/^(\d{8})(\d{4})$/, '$1-$2')}`);
  o.publicPdfsDir = join(samples, 'public-pdfs');
  if (o.preset === 'quick') {
    o.levels ??= QUICK_LEVELS;
    o.families ??= FAMILIES;
  } else if (o.preset === 'full') {
    o.levels ??= ALL_LEVELS;
    o.families ??= FAMILIES;
  } else {
    o.levels ??= ALL_LEVELS;
    o.families ??= FAMILIES.filter((f) => f !== 'synthetic-render' && f !== 'private');
  }
  if (o.seedsDir !== undefined && !o.families.includes('private')) o.families = [...o.families, 'private'];
  if (o.seedsDir === undefined) o.families = o.families.filter((f) => f !== 'private');
  o.levels = o.levels.flatMap((l) => (l === 'L6' ? ['L6-90', 'L6-180'] : [l]));
  // 'text' alone = no ladder: collect (and --fetch) the seeds and score the exact path only.
  for (const l of o.levels) if (l !== 'text' && !ALL_LEVELS.includes(l)) throw new Error(`unknown level ${l} (known: ${ALL_LEVELS.join(', ')})`);
  for (const f of o.families) if (!FAMILIES.includes(f)) throw new Error(`unknown family ${f} (known: ${FAMILIES.join(', ')})`);
  return o;
}

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));

/** The parser the seed names, on OCR lines (text + confidence) or plain lines.
 * `flagAll`: every row flagged after an exact parse (`--l7 flag-only`).
 * `scannerLayer`: the lines are a scanner's own embedded text read OCR-grade
 * (L7 under `--l7 app`) — parsed as src/ui/external-upload.ts parses them, with
 * `{ scannerLayer: true }` (review fix 2026-10-10: no junk-code guard). */
function parseLines(parser, lines, flagAll = false, scannerLayer = false) {
  const texts = lines.map((l) => (typeof l === 'string' ? l : l.text));
  if (parser === 'nd') return ndAsParsed(texts);
  const confidences = lines.length > 0 && typeof lines[0] !== 'string' ? lines.map((l) => l.confidence) : undefined;
  const p = parseExternalTranscript(texts, confidences, confidences !== undefined && scannerLayer ? { scannerLayer: true } : {});
  const courses = flagAll ? p.courses.map((c) => ({ ...c, lowConfidence: true })) : p.courses;
  return { university: p.university, campusSystem: p.campusSystem, campus: p.campus, degreeConferred: p.degreeConferred, bachelorsConferredOn: p.bachelorsConferredOn, quarterSystem: p.quarterSystem, trimesterSystem: p.trimesterSystem, courses };
}

/** Clean 300-dpi pages of a seed (rendered once, cached in <out>/<seed>/master). */
async function masterPages(seed, seedDir) {
  if (seed.source.kind === 'pages') return { paths: seed.source.paths, dpi: seed.source.dpi };
  const dir = join(seedDir, 'master');
  const existing = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.png')).sort((a, b) => Number(/-p(\d+)\.png$/.exec(a)[1]) - Number(/-p(\d+)\.png$/.exec(b)[1])).map((f) => join(dir, f)) : [];
  if (existing.length === seed.pages && seed.pages > 0) return { paths: existing, dpi: 300 };
  return { paths: await pdfToPagePngs(seed.source.path, 300, dir), dpi: 300 };
}

/** degrade.py on a seed's master pages; returns the manifest. */
function degrade(seed, master, levels, o, seedDir) {
  const truthFile = join(seedDir, 'truth-lines.json');
  writeFileSync(truthFile, JSON.stringify(seed.truthLines));
  const ladder = levels.filter((l) => l !== 'text');
  const manifestFile = join(seedDir, 'manifest.json');
  // Cached when every wanted level is already there with the same dpi/seed.
  if (existsSync(manifestFile)) {
    const m = readJson(manifestFile);
    if (m.seed === o.seed && ladder.every((l) => m.levels[l] && (l !== 'L0' || m.levels[l].dpi === o.dpi) && existsSync(m.levels[l].pdf))) return m;
  }
  const r = spawnSync('python3', ['-I', DEGRADE, '--name', seed.id.replace(/[^A-Za-z0-9._-]/g, '_'), '--out', seedDir, '--levels', ladder.join(','), '--dpi', String(o.dpi), '--seed', String(o.seed), '--source-dpi', String(master.dpi), '--text-lines', truthFile, '--watermark', seed.watermark, ...master.paths], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`degrade.py failed for ${seed.id}: ${(r.stderr || r.stdout || '').trim()}`);
  return readJson(manifestFile);
}

const csvCell = (v) => {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const CSV_COLUMNS = ['seed', 'family', 'parser', 'level', 'dpi', 'config', 'pages', 'pagesRead', 'negative', 'separate', 'known', 'exact', 'headerOk', 'expectedRows', 'parsedRows', 'matched', 'rightRows', 'missing', 'extra', 'title', 'credits', 'grade', 'term', 'levelCells', 'cerDistance', 'cerTruthChars', 'cerPct', 'flagged', 'wrong', 'flaggedWrong', 'seconds', 'secondsPerPage'];

function csvRow(r) {
  const cell = (c) => `${c.right}/${c.total}`;
  return [r.seed, r.family, r.parser, r.level, r.dpi, r.config, r.pages, r.pagesRead, r.negative, r.separate, (r.known ?? []).map((k) => k.split(' ')[0]).join(' '), r.exact, r.headerOk, r.expectedRows, r.parsedRows, r.matched, r.rightRows, r.missing, r.extra, cell(r.cells.title), cell(r.cells.credits), cell(r.cells.grade), cell(r.cells.term), cell(r.cells.level), r.cer.distance, r.cer.truthChars, r.cer.truthChars ? ((100 * r.cer.distance) / r.cer.truthChars).toFixed(2) : '', r.flags.flagged, r.flags.wrong, r.flags.flaggedWrong, r.seconds.toFixed(2), r.pagesRead ? (r.seconds / r.pagesRead).toFixed(2) : ''].map(csvCell).join(',');
}

const levelOrder = (l) => (l === 'text' ? -1 : ALL_LEVELS.indexOf(l));
const byLevel = (a, b) => levelOrder(a) - levelOrder(b);

/** A markdown table of aggregates, one line per group. */
function boardTable(title, groups) {
  const keys = Object.keys(aggregateFigures(aggregate([])));
  const out = [`### ${title}`, '', `| group | ${keys.join(' | ')} |`, `|---|${keys.map(() => '---').join('|')}|`];
  for (const [label, rows] of groups) {
    const f = aggregateFigures(aggregate(rows));
    out.push(`| ${label} | ${keys.map((k) => f[k]).join(' | ')} |`);
  }
  return out;
}

function groupBy(rows, key) {
  const m = new Map();
  for (const r of rows) m.set(key(r), [...(m.get(key(r)) ?? []), r]);
  return [...m];
}

/** results.md: the per-level board over the real seeds (generator + public),
 * the family × level board, the synthetic renders' own board, the private
 * aggregate (one line per level, no names), and per-seed rows for the named seeds. */
function resultsMarkdown(rows, o, meta) {
  const named = rows.filter((r) => r.family !== 'private');
  const main = named.filter((r) => !r.separate);
  const synthetic = named.filter((r) => r.family === 'synthetic-render');
  const priv = rows.filter((r) => r.family === 'private');
  const md = [`# OCR bench results — ${meta.generatedAt}`, '', `config: ${meta.config.name}; levels: ${o.levels.join(', ')}; L0 dpi ${o.dpi}; ladder seed ${o.seed}; seeds: ${meta.seeds} (${meta.pages} pages); engine ${meta.engine}; args: \`${meta.args.join(' ')}\``, ''];
  if (main.length) {
    md.push(...boardTable('By level (generator PDFs + public registrar PDFs)', groupBy(main, (r) => r.level).sort((a, b) => byLevel(a[0], b[0]))), '');
    md.push(...boardTable('By family × level', groupBy(main, (r) => `${r.family} ${r.level}`).sort((a, b) => a[0].split(' ')[0].localeCompare(b[0].split(' ')[0]) || byLevel(a[0].split(' ')[1], b[0].split(' ')[1]))), '');
  }
  if (synthetic.length) md.push(...boardTable('Synthetic renders by level (regression only — a layout no registrar printed)', groupBy(synthetic, (r) => r.level).sort((a, b) => byLevel(a[0], b[0]))), '');
  if (priv.length) md.push(...boardTable('Private seeds by level (aggregate only)', groupBy(priv, (r) => r.level).sort((a, b) => byLevel(a[0], b[0]))), '');
  if (named.length) {
    md.push('### Per seed', '', '| seed | family | level | exact | rows right/found/expected | parsed | false | field acc | CER | flags flagged/wrong/both | s/page |', '|---|---|---|---|---|---|---|---|---|---|---|');
    for (const r of [...named].sort((a, b) => a.seed.localeCompare(b.seed) || byLevel(a.level, b.level))) {
      const cells = Object.values(r.cells).reduce((acc, c) => ({ right: acc.right + c.right, total: acc.total + c.total }), { right: 0, total: 0 });
      md.push(`| ${r.seed}${r.known ? ' †' : ''} | ${r.family} | ${r.level} | ${r.exact ? 'yes' : 'no'} | ${r.negative ? `neg` : `${r.rightRows}/${r.matched}/${r.expectedRows}`} | ${r.parsedRows} | ${r.negative ? r.parsedRows : r.extra} | ${r.negative ? '—' : pct(cells.right, cells.total)} | ${pct(r.cer.distance, r.cer.truthChars)} | ${r.flags.flagged}/${r.flags.wrong}/${r.flags.flaggedWrong} | ${r.pagesRead ? (r.seconds / r.pagesRead).toFixed(2) : '—'} |`);
    }
    md.push('', '† on tests/fixtures/public-transcripts-known-failing.json: the exact text path itself is inexact for this document (see its `text` row).');
  }
  return md.join('\n') + '\n';
}

/** Deltas against an earlier results.json: per level (boards), then per
 * (seed, level) — regressions first. */
function deltas(baseline, current) {
  const lines = [];
  let regressions = 0;
  const key = (r) => `${r.seed} @ ${r.level}`;
  const was = new Map(baseline.rows.map((r) => [key(r), r]));
  const worse = [];
  const better = [];
  for (const now of current.rows) {
    const b = was.get(key(now));
    if (!b) continue;
    const w = [];
    const g = [];
    const chg = (label, a, c, higherIsBetter) => {
      if (a === c) return;
      (higherIsBetter === c > a ? g : w).push(`${label} ${a} → ${c}`);
    };
    if (b.exact !== now.exact) (now.exact ? g : w).push(`exact ${b.exact} → ${now.exact}`);
    chg('rows right', b.rightRows, now.rightRows, true);
    chg('rows found', b.matched, now.matched, true);
    chg(now.negative ? 'false rows' : 'extra', now.negative ? b.parsedRows : b.extra, now.negative ? now.parsedRows : now.extra, false);
    const cerA = b.cer.truthChars ? (100 * b.cer.distance) / b.cer.truthChars : 0;
    const cerB = now.cer.truthChars ? (100 * now.cer.distance) / now.cer.truthChars : 0;
    if (Math.abs(cerA - cerB) >= 1) (cerB < cerA ? g : w).push(`CER ${cerA.toFixed(1)}% → ${cerB.toFixed(1)}%`);
    if (w.length) worse.push(`  ${key(now)}: ${[...w, ...g].join('; ')}`);
    else if (g.length) better.push(`  ${key(now)}: ${g.join('; ')}`);
  }
  regressions = worse.length;
  const boardOf = (rows) => Object.fromEntries(groupBy(rows.filter((r) => !r.separate && r.family !== 'private'), (r) => r.level).map(([l, rs]) => [l, aggregateFigures(aggregate(rs))]));
  const bb = boardOf(baseline.rows);
  const cb = boardOf(current.rows);
  lines.push('== per level (generator + public seeds) ==');
  for (const level of Object.keys(cb).sort(byLevel)) {
    if (!bb[level]) continue;
    const parts = [];
    for (const k of ['row acc', 'rows found', 'false rows', 'field acc', 'CER', 'flag P/R', 's/page']) if (bb[level][k] !== cb[level][k]) parts.push(`${k} ${bb[level][k]} → ${cb[level][k]}`);
    lines.push(`  ${level}: ${parts.length ? parts.join('; ') : 'unchanged'}`);
  }
  lines.push(`REGRESSIONS (${worse.length})${worse.length ? ':' : ''}`, ...worse);
  lines.push(`IMPROVEMENTS (${better.length})${better.length ? ':' : ''}`, ...better);
  const onlyNow = current.rows.filter((r) => !was.has(key(r))).length;
  if (onlyNow) lines.push(`  (${onlyNow} row(s) not in the baseline)`);
  return { lines, regressions };
}

/** --pinned: the committed pages, OCR'd as images (the unit test's material). */
async function pinnedSeeds() {
  if (!existsSync(PINNED_DIR)) throw new Error(`${PINNED_DIR} does not exist — nothing is pinned yet (scripts/dev/ocr-bench/pin-pages.mjs)`);
  const seeds = [];
  for (const f of readdirSync(PINNED_DIR).filter((n) => n.endsWith('.expected.json')).sort()) {
    const e = readJson(join(PINNED_DIR, f));
    seeds.push({ id: e.name, family: e.family, parser: e.parser, level: e.level, dpi: e.dpi, file: join(PINNED_DIR, e.file), truthLines: e.truthLines, expected: e.expected, negative: e.expected.negative === true, separate: false, pages: 1 });
  }
  return seeds;
}

/** --compare: the deltas between two finished runs, printed as a run's own
 * --baseline block would be (regressions first; exit 1 if any). */
function compareRuns(baselineDir, currentDir, say) {
  for (const dir of [baselineDir, currentDir]) if (!existsSync(join(dir, 'results.json'))) throw new Error(`${join(dir, 'results.json')} not found`);
  const { lines, regressions } = deltas(readJson(join(baselineDir, 'results.json')), readJson(join(currentDir, 'results.json')));
  say(`== deltas: ${currentDir} vs ${baselineDir} ==`);
  for (const l of lines) say(l);
  return regressions > 0 ? 1 : 0;
}

export async function runBench(argv) {
  const o = parseArgs(argv);
  const say = (s = '') => console.log(s);
  if (o.compare !== undefined) {
    if (o.baseline === undefined) throw new Error('--compare needs --baseline <dir> (the run to compare against)');
    return compareRuns(o.baseline, o.compare, say);
  }
  const configFile = o.config ? readJson(o.config) : undefined;
  // --reparse scores lines another run read: its config is the one that made them.
  const reparsedConfig = o.reparse !== undefined && existsSync(join(o.reparse, 'results.json')) ? readJson(join(o.reparse, 'results.json')).meta.config : undefined;
  const config = mergeConfig(reparsedConfig, configFile);
  if (o.config && configFile?.name === undefined) config.name = basename(o.config).replace(/\.json$/, '');
  const engine = `tesseract.js ${readJson(join(root, 'node_modules', 'tesseract.js', 'package.json')).version}, public/ocr`;
  mkdirSync(o.out, { recursive: true });
  const rows = [];
  const t0 = Date.now();

  if (o.preset === 'pinned') {
    const seeds = await pinnedSeeds();
    say(`pinned pages: ${seeds.length} (${PINNED_DIR})`);
    const worker = await createOcrWorker(config);
    try {
      for (const s of seeds) {
        let lines;
        let seconds = 0;
        if (/\.pdf$/i.test(s.file)) lines = await pdfToLinesNode(s.file);
        else {
          // A page image at its own dpi; page 1 of a document, so the app's orientation trial applies.
          const page = config.rotationTrial ? await rotationTrial(worker, s.file, config, { dpi: s.dpi }) : await recognizePage(worker, s.file, config, { dpi: s.dpi });
          lines = [...page.lines, { text: '', confidence: 100 }];
          seconds = page.seconds;
        }
        const row = scoreBench({ seed: s, level: s.level, dpi: s.dpi, config: config.name, parsed: parseLines(s.parser, lines), ocrLines: lines.map((l) => (typeof l === 'string' ? l : l.text)), seconds, pagesRead: 1 });
        rows.push(row);
        say(`  ${s.id} (${s.level}): ${row.exact ? 'exact' : `rows ${row.rightRows}/${row.matched}/${row.expectedRows}, extra ${row.extra}`}, CER ${pct(row.cer.distance, row.cer.truthChars)}, ${seconds.toFixed(2)} s`);
      }
    } finally {
      await worker.terminate();
    }
  } else {
    const { seeds, notes } = await collectSeeds({ families: o.families, only: o.only, quick: o.preset === 'quick', publicPdfsDir: o.publicPdfsDir, seedsDir: o.seedsDir, fetch: o.fetch, renderDir: join(o.out, 'render'), skins: o.skins, renderDpi: 300 });
    for (const n of notes) say(n);
    const ladder = o.levels.filter((l) => l !== 'text');
    const pages = seeds.reduce((n, s) => n + s.pages, 0);
    const sPerPage = o.baseline && existsSync(join(o.baseline, 'results.json')) ? (readJson(join(o.baseline, 'results.json')).meta.secondsPerPage ?? DEFAULT_SECONDS_PER_PAGE) : DEFAULT_SECONDS_PER_PAGE;
    const estimate = pages * ladder.length * (sPerPage + PREP_SECONDS_PER_PAGE);
    say(`seeds: ${seeds.length} (${pages} pages) × levels ${ladder.join(', ')} → ~${(estimate / 60).toFixed(0)} min at ${sPerPage.toFixed(1)} s/page OCR + prep; config ${config.name}; out ${o.out}`);
    for (const [family, group] of groupBy(seeds, (s) => s.family)) say(`  ${family}: ${group.length} seed(s), ${group.reduce((n, s) => n + s.pages, 0)} page(s)`);
    if (o.preset === 'full' && !o.yes && o.reparse === undefined) {
      say('--full is never run unattended: re-run with --yes to start it.');
      return 0;
    }
    if (seeds.length === 0) {
      say('nothing to run');
      return 0;
    }
    // --reparse: the engine is not started; each level's saved lines are read back.
    const worker = o.reparse === undefined ? await createOcrWorker(config) : { terminate: async () => {} };
    try {
      for (const seed of seeds) {
        const seedDir = join(o.out, seed.id.replace(/[^A-Za-z0-9._-]/g, '_'));
        mkdirSync(seedDir, { recursive: true });
        // The reference row: the exact path on the source document.
        rows.push(scoreBench({ seed, level: 'text', dpi: 0, config: config.name, parsed: parseLines(seed.parser, seed.truthLines), ocrLines: seed.truthLines, seconds: 0, pagesRead: seed.pages }));
        if (ladder.length === 0) continue;
        if (o.reparse !== undefined) {
          for (const level of ladder) {
            const file = join(o.reparse, basename(seedDir), level, 'ocr-lines.json');
            if (!existsSync(file)) {
              say(`  ${seed.id} @ ${level}: skipped (no ${file})`);
              continue;
            }
            const saved = readJson(file);
            const row = scoreBench({ seed, level, dpi: saved.dpi, config: config.name, parsed: parseLines(seed.parser, saved.lines, false, level === 'L7'), ocrLines: saved.lines.map((l) => (typeof l === 'string' ? l : l.text)), seconds: saved.seconds, pagesRead: saved.pagesRead });
            if (saved.pageFigures !== undefined) row.pageFigures = saved.pageFigures;
            rows.push(row);
            if (o.only !== undefined && !row.exact) for (const d of row.diffs.slice(0, 12)) say(`  ${seed.id} @ ${level}:  ${d}`);
          }
          continue;
        }
        const master = await masterPages(seed, seedDir);
        // The app reads at most MAX_PAGES (ocr.ts:44) — the ladder stops there too; the
        // truth keeps every page, so what the app never reads counts against it.
        master.paths = master.paths.slice(0, config.maxPages);
        const manifest = degrade(seed, master, ladder, o, seedDir);
        for (const level of ladder) {
          const entry = manifest.levels[level];
          if (!entry || entry.skipped) {
            say(`  ${seed.id} @ ${level}: skipped (${entry?.skipped ?? 'not produced'})`);
            continue;
          }
          let lines;
          let seconds = 0;
          let pagesRead;
          let pageFigures;
          let flagAll = false;
          if (level === 'L7') {
            // A PDF with a text layer takes the text path; since Batch C answer (6) (DGS
            // 2026-10-09) one whose every page is a scan has that layer read OCR-grade —
            // each line at SCANNER_LAYER_CONFIDENCE, so every row is flagged and the
            // scan-only repairs apply (`--l7 app`, as src/ui/external-upload.ts does; the
            // junk-code guard does not — `parseLines`' scannerLayer, review fix 2026-10-10).
            // The ND parser's seeds are read as the ND upload reads them (exact).
            const text = await pdfToLinesNode(entry.pdf);
            const scanned = o.l7 !== 'exact' && seed.parser !== 'nd' && text.some((l) => /\S/.test(l)) && (await pdfScanPagesNode(entry.pdf)).everyPageScanned;
            lines = scanned && o.l7 === 'app' ? text.map((t) => ({ text: t, confidence: SCANNER_LAYER_CONFIDENCE })) : text;
            flagAll = scanned && o.l7 === 'flag-only';
            pagesRead = manifest.pages;
          } else {
            const doc = await ocrDocument(worker, entry.pdf, config, join(seedDir, level, 'render'));
            lines = doc.lines;
            seconds = doc.seconds;
            pagesRead = doc.pagesRead;
            pageFigures = doc.pages.map(({ file: _f, blocks: _b, ...figures }) => figures);
          }
          // The lines the parser read, kept for --reparse (a parser-only A/B without the engine).
          mkdirSync(join(seedDir, level), { recursive: true });
          writeFileSync(join(seedDir, level, 'ocr-lines.json'), JSON.stringify({ config: config.name, dpi: entry.dpi, seconds, pagesRead, pageFigures, lines }));
          const row = scoreBench({ seed, level, dpi: entry.dpi, config: config.name, parsed: parseLines(seed.parser, lines, flagAll, level === 'L7'), ocrLines: lines.map((l) => (typeof l === 'string' ? l : l.text)), seconds, pagesRead });
          // What the runner knew per page (OCR step 12): the render dpi, the engine's mean word
          // confidence, the rotation the trial chose and its four figures — results.json keeps
          // them so a knob's effect can be read page by page without a second run.
          if (pageFigures !== undefined) row.pageFigures = pageFigures;
          rows.push(row);
          say(`  ${seed.id} @ ${level}: ${row.negative ? `${row.parsedRows} false row(s)` : `rows right/found/expected ${row.rightRows}/${row.matched}/${row.expectedRows}, extra ${row.extra}`}, CER ${pct(row.cer.distance, row.cer.truthChars)}, ${pagesRead} page(s) in ${seconds.toFixed(1)} s`);
          if (o.only !== undefined && !row.exact) for (const d of row.diffs.slice(0, 12)) say('     ' + d);
        }
      }
    } finally {
      await worker.terminate();
    }
  }

  const ocrRows = rows.filter((r) => r.level !== 'text' && r.level !== 'L7');
  const secondsPerPage = ocrRows.reduce((n, r) => n + r.pagesRead, 0) ? ocrRows.reduce((n, r) => n + r.seconds, 0) / ocrRows.reduce((n, r) => n + r.pagesRead, 0) : undefined;
  const meta = { generatedAt: new Date().toISOString(), args: argv, config, engine, ...(o.reparse !== undefined ? { reparsedFrom: o.reparse } : {}), seeds: new Set(rows.map((r) => r.seed)).size, pages: rows.filter((r) => r.level === 'text').reduce((n, r) => n + r.pages, 0), secondsPerPage, wallSeconds: (Date.now() - t0) / 1000 };
  writeFileSync(join(o.out, 'results.csv'), [CSV_COLUMNS.join(','), ...rows.map(csvRow)].join('\n') + '\n');
  writeFileSync(join(o.out, 'results.md'), resultsMarkdown(rows, o, meta));
  writeFileSync(join(o.out, 'results.json'), JSON.stringify({ meta, rows: rows.map(({ diffs: _d, ...r }) => r) }, null, 1));
  say();
  const main = rows.filter((r) => !r.separate && r.family !== 'private');
  const print = (title, groups) => {
    for (const line of boardTable(title, groups)) say(line);
    say();
  };
  if (main.length) print('By level', groupBy(main, (r) => r.level).sort((a, b) => byLevel(a[0], b[0])));
  const synthetic = rows.filter((r) => r.family === 'synthetic-render');
  if (synthetic.length) print('Synthetic renders by level', groupBy(synthetic, (r) => r.level).sort((a, b) => byLevel(a[0], b[0])));
  const priv = rows.filter((r) => r.family === 'private');
  if (priv.length) print('Private seeds by level (aggregate only)', groupBy(priv, (r) => r.level).sort((a, b) => byLevel(a[0], b[0])));
  say(`wrote ${o.out}/results.{csv,md,json} — ${rows.length} rows, ${(meta.wallSeconds / 60).toFixed(1)} min wall, ${secondsPerPage !== undefined ? secondsPerPage.toFixed(2) : '—'} s/page OCR`);

  let code = 0;
  if (o.baseline !== undefined) {
    const file = join(o.baseline, 'results.json');
    if (!existsSync(file)) throw new Error(`--baseline: ${file} not found`);
    const { lines, regressions } = deltas(readJson(file), { rows });
    say(`== deltas vs ${o.baseline} ==`);
    for (const l of lines) say(l);
    if (regressions > 0) code = 1;
  }
  return code;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = await runBench(process.argv.slice(2));
}
