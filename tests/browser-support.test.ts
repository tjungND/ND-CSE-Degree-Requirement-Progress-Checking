// What the shipped pages ask of a browser (cross-browser review, 2026-10-10).
// Vite builds for its default floor (Safari 14, Chrome 87, Firefox 78), but
// esbuild cannot lower a regex lookbehind for Safari before 16.4. It does not
// fail the build: it rewrites the literal as `new RegExp("…")`, which throws
// in that Safari when it runs. Two lookbehinds ran as the shared module
// loaded, so both pages were blank on Safari 14–16.3, on every iOS browser of
// those versions included. These tests keep lookbehinds out of src/ and pin
// the written-out checks that replaced them to the old patterns' answers.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { campusNamedAt, MULTI_CAMPUS_SYSTEMS } from '../src/transcript/campus.ts';
import { looksLikeNotreDameTranscript, namesOtherNotreDame, withoutOtherNotreDames } from '../src/transcript/nd-markers.ts';
import { browserTooOldForPdfs } from '../src/ui/pdf-support.ts';

const root = join(import.meta.dirname, '..');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? sourceFiles(join(dir, e.name)) : /\.(ts|mts)$/.test(e.name) ? [join(dir, e.name)] : [],
  );
}

// The old patterns, kept here as the oracle (Node has lookbehind).
const LOOKBEHIND = ['(?', '<=', '|', '(?', '<!'].join('').split('|');
const OLD_OTHER_NOTRE_DAMES = new RegExp(
  'university\\s+of\\s+notre\\s+dame,?\\s+australia|notre\\s+dame\\s+of\\s+maryland|notre\\s+dame\\s+de\\s+namur|' +
    LOOKBEHIND[1] + 'university\\s+of\\s+)notre\\s+dame\\s+college(?!\\s+of\\b)|college\\s+of\\s+notre\\s+dame|notre\\s+dame\\s+university|notre\\s+dame\\s+seishin|notre\\s+dame\\s+women',
  'i',
);
const OLD_CITY_COLLEGE = new RegExp(LOOKBEHIND[1] + 'York\\s)\\bCity College\\b(?!\\s+of\\s+Technology)|\\bCCNY\\b', 'i');
const OLD_YORK_COLLEGE = new RegExp(LOOKBEHIND[1] + 'New\\s)\\bYork College\\b', 'i');

/** Deterministic strings built from the words the patterns turn on. */
function* samples(words: readonly string[], n: number): Generator<string> {
  let seed = 20261010;
  const next = (k: number): number => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return Math.floor((seed / 2 ** 32) * k);
  };
  const gaps = [' ', '  ', '\n', ', ', ' \t'];
  for (let i = 0; i < n; i++) {
    const parts: string[] = [];
    for (let j = 1 + next(8); j > 0; j--) parts.push(words[next(words.length)]!, gaps[next(gaps.length)]!);
    yield parts.join('');
  }
}

describe('browser support: no regex lookbehind in src/', () => {
  it('src/ holds no lookbehind (Safari before 16.4 cannot compile one, and the build does not say so)', () => {
    const found = sourceFiles(join(root, 'src')).flatMap((f) =>
      readFileSync(f, 'utf8')
        .split('\n')
        .flatMap((line, i) => (LOOKBEHIND.some((l) => line.includes(l)) ? [`${f.slice(root.length + 1)}:${i + 1}`] : [])),
    );
    assert.deepEqual(found, [], 'write the check out in code instead: see otherNotreDameSpans in src/transcript/nd-markers.ts');
  });

  it('other Notre Dames: the written-out check answers as the lookbehind did', () => {
    const words = ['University', 'university', 'of', 'Notre', 'Dame', 'NOTRE', 'DAME', 'College', 'college', 'of Maryland', 'Australia', 'University of', 'Ohio', 'Women', 'de Namur', 'Notre Dame College', 'UNIVERSITY OF NOTRE DAME COLLEGE', 'University of  Notre Dame College', 'X'];
    let decided = 0;
    for (const s of samples(words, 20000)) {
      assert.equal(namesOtherNotreDame(s), OLD_OTHER_NOTRE_DAMES.test(s), JSON.stringify(s));
      assert.equal(withoutOtherNotreDames(s), s.replace(new RegExp(OLD_OTHER_NOTRE_DAMES.source, 'gi'), ' '), JSON.stringify(s));
      if (/university\s+of\s+notre\s+dame\s+college(?!\s+of\b)/i.test(s)) decided++;
    }
    assert.ok(decided > 100, `the samples must reach the refused case (${decided})`);
    assert.equal(namesOtherNotreDame('Notre Dame College, South Euclid, Ohio'), true);
    assert.equal(namesOtherNotreDame('University of Notre Dame College of Engineering'), false);
    assert.equal(namesOtherNotreDame('UNIVERSITY OF NOTRE DAME   Notre Dame College'), true, 'refused only right after "University of"');
    assert.equal(looksLikeNotreDameTranscript('Notre Dame of Maryland University\nOffice of the Registrar\nCSE 101 Intro 3 A'), false);
  });

  it('the written-out check stays linear on a long text with many refusals', () => {
    const long = 'UNIVERSITY OF NOTRE DAME\nCollege: Engineering   Major: Computer Science\n'.repeat(20000); // each “NOTRE DAME\nCollege” is refused
    const t0 = performance.now();
    withoutOtherNotreDames(long);
    const ms = performance.now() - t0;
    assert.ok(ms < 500, `${ms.toFixed(0)} ms for 20,000 refusals (the lookbehind took a few)`);
  });

  it('CUNY: "City College" and "York College" are found where the lookbehinds found them', () => {
    const cuny = MULTI_CAMPUS_SYSTEMS.find((s) => s.system === 'City University of New York')!;
    const city = cuny.campuses.find((cp) => cp.name === 'City College')!;
    const york = cuny.campuses.find((cp) => cp.name === 'York')!;
    const words = ['New', 'York', 'City', 'College', 'of', 'Technology', 'CCNY', 'The', 'york', 'NEW', 'CITY COLLEGE', 'Queens', 'New York City College', 'New York College', 'York College', 'NEW YORK CITY COLLEGE OF TECHNOLOGY'];
    let decided = 0;
    for (const s of samples(words, 20000)) {
      assert.equal(campusNamedAt(city, s), s.search(OLD_CITY_COLLEGE), JSON.stringify(s));
      assert.equal(campusNamedAt(york, s), s.search(OLD_YORK_COLLEGE), JSON.stringify(s));
      if (/York\sCity College\b(?!\s+of\s+Technology)|New\sYork College\b/i.test(s)) decided++;
    }
    assert.ok(decided > 100, `the samples must reach the refused case (${decided})`);
    assert.equal(campusNamedAt(city, 'NEW YORK CITY COLLEGE OF TECHNOLOGY'), -1);
    assert.equal(campusNamedAt(city, 'THE CITY COLLEGE OF NEW YORK'), 4);
    assert.equal(campusNamedAt(york, 'New York College of Health Professions'), -1);
  });

  it('transcript PDFs are read with pdf.js’s legacy build (the modern one needs Safari 17.4, Chrome 119, Firefox 121)', () => {
    // Every import of pdfjs-dist anywhere in src/: static, bare or dynamic, either quote.
    const found = sourceFiles(join(root, 'src')).flatMap((f) =>
      [...readFileSync(f, 'utf8').matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*)(['"])(pdfjs-dist(?:\/[^'"]*)?)\1/g)].map((m) => ({ file: f.slice(root.length + 1), spec: m[2]! })),
    );
    assert.ok(found.some((i) => i.file === 'src/transcript/pdf.ts') && found.some((i) => i.file === 'src/transcript/ocr.ts'), JSON.stringify(found));
    const modern = found.filter((i) => !/^pdfjs-dist\/(?:legacy\/build|types)\//.test(i.spec));
    assert.deepEqual(modern, [], 'import pdfjs-dist/legacy/build/… instead');
  });

  it('the old-browser probe says no in a browser that reads PDFs (Node here)', () => {
    assert.equal(browserTooOldForPdfs(), false);
  });

  it('the probe says yes only for a SyntaxError — a CSP’s EvalError is no sign of age', () => {
    const real = globalThis.Function;
    const throwing = (err: Error) =>
      new Proxy(real, {
        construct(target, args: unknown[]) {
          if (/static\s*\{/.test(String(args[args.length - 1]))) throw err;
          return Reflect.construct(target, args);
        },
      });
    try {
      globalThis.Function = throwing(new SyntaxError('Unexpected token'));
      assert.equal(browserTooOldForPdfs(), true);
      globalThis.Function = throwing(new EvalError('call to Function() blocked by CSP'));
      assert.equal(browserTooOldForPdfs(), false);
    } finally {
      globalThis.Function = real;
    }
  });
});
