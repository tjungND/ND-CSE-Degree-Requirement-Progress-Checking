// The OCR benchmark's seed list (2026-10-09, transcript accuracy program,
// OCR step 9): every document the ladder degrades, with its ground truth.
//
//   generator-external / generator-nd   tests/fixtures/*.pdf made by
//       make-transcript-pdfs.mjs. Truth = the exact path's own reading of the
//       same PDF (pdfToLinesNode → parseExternalTranscript, or the ND parser),
//       so L0 (the clean raster) must reproduce it. A generator PDF that reads
//       no rows (other-transcript, no-lines-transcript) is a negative here.
//   generator-scan   tests/fixtures/external-transcript-scan.pdf (image-only,
//       from make-scan-fixture.py): its truth lines are the script's own text.
//   public-pdf   every `pdf` entry of tests/fixtures/public-transcripts/
//       sources.json, read from $TRANSCRIPT_SAMPLES/public-pdfs/<name>.pdf
//       (outside the repo). A missing one is rebuilt with --fetch from the
//       sources.json url and kept only when its SHA-256 and byte size match
//       (a mismatch or a dead link is a note, never a guess). Rows come from
//       expected.json; a negative (a key, legend, form) expects none — it
//       measures false rows under noise.
//   synthetic-render   a line-list fixture rendered to pages by
//       render-lines.py — a layout no registrar printed, so reported
//       separately, for regressions only.
//   private   --seeds-dir: the maintainer's own PDFs with an expected.json
//       beside them, named private-01… in every output; nothing about them
//       is ever written to a committed file.
//
// Pure of printing: notes come back to the caller.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { parseExternalTranscript, type ExternalCourseCandidate } from '../../../src/transcript/external.ts';
import { parseTranscript, type ParsedCourse } from '../../../src/transcript/parse.ts';
import { rowOf } from '../../../tests/helpers/row-of.ts';
import { pdfToLinesNode } from '../pdf-lines-node.mts';
import { HEADER_FIELDS, type ExpectedDocument, type ParsedDocument } from '../score.mts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const FIXTURES = join(root, 'tests', 'fixtures');
const PUBLIC_DIR = join(FIXTURES, 'public-transcripts');
const MS_DIR = join(FIXTURES, 'ms-transcripts');
const KNOWN_FAILING_FILE = join(FIXTURES, 'public-transcripts-known-failing.json');
const RENDER_SCRIPT = join(root, 'scripts', 'dev', 'ocr-bench', 'render-lines.py');

export type Family = 'generator-external' | 'generator-nd' | 'generator-scan' | 'public-pdf' | 'synthetic-render' | 'private';
export const FAMILIES: Family[] = ['generator-external', 'generator-nd', 'generator-scan', 'public-pdf', 'synthetic-render', 'private'];

export interface Seed {
  id: string;
  family: Family;
  parser: 'external' | 'nd';
  /** A PDF the bench renders at 300 dpi, or pages render-lines.py made. */
  source: { kind: 'pdf'; path: string } | { kind: 'pages'; paths: string[]; dpi: number };
  /** The exact path's reading of the same document (the parser's ceiling, the CER reference). */
  truthLines: string[];
  expected: ExpectedDocument;
  negative: boolean;
  /** L4's diagonal watermark: the university's name when known, else UNOFFICIAL. */
  watermark: string;
  separate: boolean;
  skin?: string;
  known?: string[];
  pages: number;
}

export interface SeedOptions {
  families: Family[];
  only?: string;
  /** One seed per family (public-pdf: one positive and one negative). */
  quick: boolean;
  publicPdfsDir: string;
  seedsDir?: string;
  fetch: boolean;
  /** Where render-lines.py writes its pages. */
  renderDir: string;
  skins: string[];
  renderDpi: number;
}

const readJson = <T,>(file: string): T => JSON.parse(readFileSync(file, 'utf8')) as T;

/** The generator's PDFs, by the parser that reads them. */
export const GENERATOR_PDFS: { name: string; parser: 'external' | 'nd' }[] = [
  { name: 'nd-transcript', parser: 'nd' },
  { name: 'nd-official-transcript', parser: 'nd' },
  { name: 'nd-undergrad-transcript', parser: 'nd' },
  { name: 'nd-undergrad-in-progress-transcript', parser: 'nd' },
  { name: 'nd-insidend-transcript', parser: 'nd' },
  { name: 'combined-transcript', parser: 'external' },
  { name: 'other-transcript', parser: 'external' },
  { name: 'external-transcript', parser: 'external' },
  { name: 'uc-system-transcript', parser: 'external' },
  { name: 'no-lines-transcript', parser: 'external' },
  { name: 'banner-transcript', parser: 'external' },
  { name: 'banner-watermarked-transcript', parser: 'external' },
];

/** tests/fixtures/make-scan-fixture.py's page, line for line (the PDF is image-only). */
export const SCAN_FIXTURE_LINES = [
  'Purdue University',
  'Office of the Registrar',
  'Official Transcript',
  'Student: John Q. Boilermaker',
  'Program: Master of Science, Computer Science',
  'Fall 2023',
  'CS 50300    Operating Systems              3.0    A',
  'CS 59000    Special Topics in Systems      3.0    A-',
  'Spring 2024',
  'CS 58000    Algorithm Design               3.0    B+',
  'Cumulative GPA: 3.83',
  '',
];

/** The quick set: one seed per family. */
export const QUICK_SEEDS: Record<Family, string[]> = {
  'generator-external': ['banner-transcript'],
  'generator-nd': ['nd-transcript'],
  'generator-scan': ['external-transcript-scan'],
  'public-pdf': ['pdf-vaasa-template', 'pdf-key-stanford'],
  'synthetic-render': ['pdf-vaasa-template'],
  private: [],
};

/** An ND parse in the scorer's shape: the ND rows as candidates (rowOf prints
 * them the same way) and the university as the one header field. */
export function ndAsParsed(lines: string[]): ParsedDocument {
  const t = parseTranscript(lines);
  const courses: ExternalCourseCandidate[] = t.courses.map((c: ParsedCourse) => ({ courseId: c.courseId, title: c.title, credits: c.credits, grade: c.grade, year: c.term.year, season: c.term.season, level: c.level }));
  return { university: t.isNotreDame ? 'University of Notre Dame' : undefined, courses };
}

/** An external parse → the expectation it would pin (header fields + rows). */
function expectedFromExternal(lines: string[]): ExpectedDocument {
  const p = parseExternalTranscript(lines);
  const e: ExpectedDocument = { courses: p.courses.map(rowOf) };
  for (const f of HEADER_FIELDS) (e as unknown as Record<string, unknown>)[f] = p[f] === undefined ? null : p[f];
  if (e.courses.length === 0) e.negative = true;
  return e;
}

function expectedFromNd(lines: string[]): ExpectedDocument {
  const p = ndAsParsed(lines);
  return { university: p.university ?? null, courses: p.courses.map(rowOf) };
}

const universityOf = (e: ExpectedDocument): string => (typeof e.university === 'string' && e.university !== '' ? e.university.toUpperCase() : 'UNOFFICIAL');

async function generatorSeeds(o: SeedOptions): Promise<Seed[]> {
  const seeds: Seed[] = [];
  for (const g of GENERATOR_PDFS) {
    const family: Family = g.parser === 'nd' ? 'generator-nd' : 'generator-external';
    if (!o.families.includes(family)) continue;
    if (o.quick && !QUICK_SEEDS[family].includes(g.name)) continue;
    if (o.only !== undefined && !g.name.includes(o.only)) continue;
    const path = join(FIXTURES, g.name + '.pdf');
    const truthLines = await pdfToLinesNode(path);
    const expected = g.parser === 'nd' ? expectedFromNd(truthLines) : expectedFromExternal(truthLines);
    seeds.push({ id: g.name, family, parser: g.parser, source: { kind: 'pdf', path }, truthLines, expected, negative: expected.negative === true, watermark: universityOf(expected), separate: false, pages: truthLines.filter((l) => l === '').length });
  }
  if (o.families.includes('generator-scan') && (!o.only || 'external-transcript-scan'.includes(o.only))) {
    const expected = expectedFromExternal(SCAN_FIXTURE_LINES);
    seeds.push({ id: 'external-transcript-scan', family: 'generator-scan', parser: 'external', source: { kind: 'pdf', path: join(FIXTURES, 'external-transcript-scan.pdf') }, truthLines: SCAN_FIXTURE_LINES, expected, negative: false, watermark: universityOf(expected), separate: false, pages: 1 });
  }
  return seeds;
}

interface SourceEntry {
  institution?: string;
  url: string;
  pdf?: { sha256: string; bytes: number };
}

const sha256Of = (file: string): string => createHash('sha256').update(readFileSync(file)).digest('hex');

/** Download one public registrar PDF and keep it only when it is the pinned
 * document (SHA-256 and byte size from sources.json). */
async function fetchPublicPdf(name: string, src: SourceEntry, dest: string, notes: string[]): Promise<boolean> {
  // A GitHub "blob" page is HTML; the file itself is at the raw URL.
  const url = src.url.replace(/^https:\/\/github\.com\/([^/]+\/[^/]+)\/blob\//, 'https://raw.githubusercontent.com/$1/');
  const tmp = join(tmpdir(), `ocr-bench-fetch-${process.pid}-${name}.pdf`);
  try {
    const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(45_000), headers: { 'user-agent': 'Mozilla/5.0 (degree-audit OCR bench; public registrar sample)' } });
    if (!res.ok) {
      notes.push(`  ${name}: fetch failed (HTTP ${res.status}) — skipped; download it in a browser to ${dest}`);
      return false;
    }
    writeFileSync(tmp, Buffer.from(await res.arrayBuffer()));
  } catch (e) {
    const cause = e instanceof Error && e.cause && typeof e.cause === 'object' && 'code' in e.cause ? ` (${String((e.cause as { code?: unknown }).code)})` : '';
    notes.push(`  ${name}: fetch failed (${e instanceof Error ? e.message : String(e)}${cause}) — skipped; download it in a browser to ${dest}`);
    return false;
  }
  const bytes = statSync(tmp).size;
  const sha = sha256Of(tmp);
  if (sha !== src.pdf!.sha256 || bytes !== src.pdf!.bytes) {
    notes.push(`  ${name}: downloaded file differs from the pinned one (sha256 ${sha.slice(0, 12)}…, ${bytes} bytes; pinned ${src.pdf!.sha256.slice(0, 12)}…, ${src.pdf!.bytes}) — skipped, not kept`);
    try {
      renameSync(tmp, tmp + '.mismatch');
    } catch {
      /* leave it */
    }
    return false;
  }
  mkdirSync(dirname(dest), { recursive: true });
  renameSync(tmp, dest);
  notes.push(`  ${name}: fetched and verified (${bytes} bytes)`);
  return true;
}

async function publicPdfSeeds(o: SeedOptions, notes: string[]): Promise<Seed[]> {
  if (!o.families.includes('public-pdf')) return [];
  const sources = readJson<Record<string, SourceEntry>>(join(PUBLIC_DIR, 'sources.json'));
  const expected = readJson<Record<string, ExpectedDocument>>(join(PUBLIC_DIR, 'expected.json'));
  const known = readJson<Record<string, string[]>>(KNOWN_FAILING_FILE);
  const seeds: Seed[] = [];
  let missing = 0;
  for (const [name, src] of Object.entries(sources)) {
    if (src.pdf === undefined) continue;
    if (o.quick && !QUICK_SEEDS['public-pdf'].includes(name)) continue;
    if (o.only !== undefined && !name.includes(o.only)) continue;
    const path = join(o.publicPdfsDir, name + '.pdf');
    if (!existsSync(path)) {
      if (!o.fetch) {
        missing += 1;
        continue;
      }
      if (!(await fetchPublicPdf(name, src, path, notes))) continue;
    } else {
      const bytes = statSync(path).size;
      const sha = sha256Of(path);
      if (sha !== src.pdf.sha256 || bytes !== src.pdf.bytes) {
        notes.push(`  ${name}: HASH MISMATCH against sources.json (sha256 ${sha.slice(0, 12)}…, ${bytes} bytes) — skipped`);
        continue;
      }
    }
    const want = expected[name];
    if (want === undefined) {
      notes.push(`  ${name}: no expected.json entry — skipped`);
      continue;
    }
    const truthLines = await pdfToLinesNode(path);
    const seed: Seed = { id: name, family: 'public-pdf', parser: 'external', source: { kind: 'pdf', path }, truthLines, expected: want, negative: want.negative === true, watermark: universityOf(want), separate: false, pages: truthLines.filter((l) => l === '').length };
    if (known[name] !== undefined) seed.known = known[name];
    seeds.push(seed);
  }
  if (missing > 0) notes.push(`  public-pdf: ${missing} pinned PDF(s) missing from ${o.publicPdfsDir} — run with --fetch to rebuild them from sources.json`);
  return seeds;
}

/** Render one fixture in one skin (cached: render-lines.py is skipped when
 * its meta file exists) and return the seed. */
function renderSeed(corpus: 'public' | 'ms', name: string, skin: string, want: ExpectedDocument, known: string[] | undefined, o: SeedOptions, notes: string[]): Seed | undefined {
  const dir = corpus === 'public' ? PUBLIC_DIR : MS_DIR;
  const outDir = join(o.renderDir, name);
  const meta = join(outDir, `${name}-${skin}.json`);
  if (!existsSync(meta)) {
    const r = spawnSync('python3', ['-I', RENDER_SCRIPT, '--lines', join(dir, name + '.json'), '--out', outDir, '--name', name, '--skin', skin, '--dpi', String(o.renderDpi)], { encoding: 'utf8' });
    if (r.status !== 0) {
      notes.push(`  render ${name} (${skin}) failed: ${(r.stderr || r.stdout || '').trim().split('\n').pop()}`);
      return undefined;
    }
  }
  const m = readJson<{ pages: string[]; truthLines: string[]; dpi: number }>(meta);
  return { id: `${name}~${skin}`, family: 'synthetic-render', parser: 'external', source: { kind: 'pages', paths: m.pages, dpi: m.dpi }, truthLines: m.truthLines, expected: want, negative: want.negative === true, watermark: universityOf(want), separate: true, skin, known, pages: m.pages.length };
}

function renderSeeds(o: SeedOptions, notes: string[]): Seed[] {
  if (!o.families.includes('synthetic-render')) return [];
  const seeds: Seed[] = [];
  const known = readJson<Record<string, string[]>>(KNOWN_FAILING_FILE);
  for (const corpus of ['public', 'ms'] as const) {
    const dir = corpus === 'public' ? PUBLIC_DIR : MS_DIR;
    const expected = readJson<Record<string, ExpectedDocument>>(join(dir, 'expected.json'));
    for (const file of readdirSync(dir).filter((n) => n.endsWith('.json') && n !== 'expected.json' && n !== 'sources.json').sort()) {
      const name = file.replace(/\.json$/, '');
      if (o.quick && !QUICK_SEEDS['synthetic-render'].includes(name)) continue;
      if (o.only !== undefined && !name.includes(o.only)) continue;
      const want = expected[name];
      if (want === undefined) continue;
      for (const skin of o.quick ? ['ruled'] : o.skins) {
        const s = renderSeed(corpus, name, skin, want, corpus === 'public' ? known[name] : undefined, o, notes);
        if (s) seeds.push(s);
      }
    }
  }
  return seeds;
}

/** --seeds-dir: PDFs with an expected.json beside them (the ExpectedDocument
 * shape, keyed by file stem, plus an optional `parser: "nd"`). Named
 * private-NN in every output; a PDF without an entry is skipped. */
async function privateSeeds(o: SeedOptions, notes: string[]): Promise<Seed[]> {
  if (!o.families.includes('private') || o.seedsDir === undefined) return [];
  const expectedFile = join(o.seedsDir, 'expected.json');
  if (!existsSync(expectedFile)) {
    notes.push(`  private: ${o.seedsDir} has no expected.json — nothing scored (see docs/OCR-BENCHMARK.md for its shape)`);
    return [];
  }
  const expected = readJson<Record<string, ExpectedDocument & { parser?: 'nd' | 'external' }>>(expectedFile);
  const seeds: Seed[] = [];
  let skipped = 0;
  let n = 0;
  for (const file of readdirSync(o.seedsDir).filter((f) => /\.pdf$/i.test(f)).sort()) {
    const stem = basename(file).replace(/\.pdf$/i, '');
    const want = expected[stem];
    if (want === undefined) {
      skipped += 1;
      continue;
    }
    if (o.quick && n >= 1) break;
    n += 1;
    const path = join(o.seedsDir, file);
    const parser = want.parser === 'nd' ? 'nd' : 'external';
    const { parser: _p, ...rest } = want;
    const truthLines = await pdfToLinesNode(path);
    seeds.push({ id: `private-${String(n).padStart(2, '0')}`, family: 'private', parser, source: { kind: 'pdf', path }, truthLines, expected: rest, negative: rest.negative === true, watermark: 'UNOFFICIAL', separate: true, pages: truthLines.filter((l) => l === '').length });
  }
  if (skipped > 0) notes.push(`  private: ${skipped} PDF(s) without an expected.json entry skipped`);
  return seeds;
}

export async function collectSeeds(o: SeedOptions): Promise<{ seeds: Seed[]; notes: string[] }> {
  const notes: string[] = [];
  const seeds = [...(await generatorSeeds(o)), ...(await publicPdfSeeds(o, notes)), ...renderSeeds(o, notes), ...(await privateSeeds(o, notes))];
  return { seeds, notes };
}
