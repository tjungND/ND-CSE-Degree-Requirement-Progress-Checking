// De-identification rules shared by the two sanitizers (2026-09-05):
// scripts/sanitize-transcript.mjs (text PDFs) and scripts/sanitize-scan.py
// (scans — it calls the Node tool with --words so this file stays the ONE
// rule set). Pure: text runs with positions in, sanitized text out.
//
// Goal: keep every property the parsers react to — positions, widths, run
// boundaries, structural vocabulary, subject codes, credit values, the SHAPE
// of everything else — while removing what identifies a student or their
// record: names, ids, addresses, e-mail local parts, dates, grades, GPA,
// course numbers, titles (unless --keep-titles), and shifting every year by
// one document-wide offset so term structure survives but dates do not.
//
// The output is meant for parser work by people who must not see records.
// The DGS still reviews the result: the CLI lists every run kept verbatim.

/** Structural vocabulary kept as-is (compared on the token without punctuation,
 * case-insensitively). Generous on purpose: a kept word is harmless, a
 * scrambled structural word can hide a layout bug. */
const KEEP_WORDS = new Set(
  `fall spring summer winter autumn semester session term terms quarter trimester year years
   january february march april may june july august september october november december
   jan feb mar apr jun jul aug sep sept oct nov dec
   institution institutional credit credits transfer transferred accepted by the of and in for to at on or with from as an
   course courses coursework in progress work transcript transcripts totals total end continued next column page pages
   ehrs gpa gpa-hrs hrs qpts pts points quality earned attempted cum cumulative overall
   unofficial official academic record records student program programs plan college major minor degree degrees awarded conferred granted
   completed complete level graduate undergraduate doctor doctoral philosophy master masters science arts engineering bachelor bachelors
   subj no title cred grd r description units unit hours hour grade grades attempt
   good standing dean deans list honors honor probation warning dismissal satisfactory
   issued date printed from certified digital credential original has watermark copy
   this is not valid without seal signature registrar office university institute
   matriculated admitted admission expected graduation primary secondary concentration campus school department faculty
   information continued beginning record: term: course: pass fail audit withdrawn withdrawal incomplete repeat repeated excluded included
   type notes note remarks status enrolled enrollment thesis dissertation research seminar independent study internship practicum
   ssn cwid id refnum name birth dob issued to record of
   total institution transfer overall
   ph.d ph.d. m.s m.s. b.s b.s. m.sc b.sc ms bs ba ma phd msc bsc`
    .split(/\s+/)
    .filter(Boolean),
);

/** A run naming an institution (or a division of one) is kept whole:
 * university names, "College of Science", registrar boilerplate, and the
 * tiled watermarks that repeat the university's name. */
const INSTITUTION_RE = /universit|institute|college|school|polytechnic|academy|department|faculty|registrar/i;

/** Grade codes that are structural, not scores. */
const CODE_GRADES = new Set(['S', 'U', 'P', 'NP', 'CR', 'NC', 'W', 'WF', 'WP', 'I', 'IP', 'TR', 'NG', 'AU', 'X', 'E', 'R', 'PASS', 'FAIL', 'SAT', 'UNS']);
const LETTER_GRADE_RE = /^[A-D][+-]?$|^F$/;
const ONE_CHAR_GRADES = ['A', 'B', 'C', 'D'];
const TWO_CHAR_GRADES = ['A-', 'B+', 'B-', 'C+', 'C-', 'D+'];

const CREDIT_FRACTIONS = new Set(['0', '5', '00', '50', '000', '500', '25', '75', '250', '750', '33', '67', '330', '670']);

/** Seeded PRNG (mulberry32). */
function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * @param {{ seed?: number, keepTitles?: boolean, institutionalByLine?: boolean, columnGap?: (runs: object[], pageWidth: number) => number | undefined }} options
 * @returns {{ sanitizeRuns: (runs: {x:number,y:number,text:string}[]) => {text:string, changed:boolean}[], report: () => object }}
 */
export function createSanitizer(options = {}) {
  const seed = options.seed ?? Math.floor(Math.random() * 2 ** 31);
  const keepTitles = options.keepTitles === true;
  const rootRandom = prng(seed);
  // Every year moves by the same offset, never zero, so term order survives.
  const yearOffset = (Math.floor(rootRandom() * 8) + 1) * (rootRandom() < 0.5 ? -1 : 1);
  const wordCache = new Map();
  const stats = { runs: 0, changedRuns: 0, keptRuns: 0, scrambledWords: 0, grades: 0, numbers: 0, years: 0, emails: 0 };
  const keptVerbatim = new Map(); // text → count, for the DGS's review

  /** Deterministic per document: the same word always scrambles the same way. */
  const scrambleWord = (word) => {
    const key = word.toLowerCase();
    let out = wordCache.get(key);
    if (out === undefined) {
      const r = prng(seed ^ hashString(key));
      out = [...key].map((ch) => (/[a-z]/.test(ch) ? String.fromCharCode(97 + Math.floor(r() * 26)) : /[0-9]/.test(ch) ? String(Math.floor(r() * 10)) : ch)).join('');
      wordCache.set(key, out);
    }
    // Re-apply the original case pattern.
    return [...out].map((ch, i) => (/[A-Z]/.test(word[i] ?? '') ? ch.toUpperCase() : ch)).join('');
  };
  const randomDigits = (s) => {
    const r = prng(seed ^ hashString('#' + s + stats.numbers++));
    return s.replace(/\d/g, () => String(Math.floor(r() * 10)));
  };
  const shiftYear = (y) => {
    const n = Number(y);
    if (y.length === 4) return String(n + yearOffset);
    return String(((n + yearOffset) % 100 + 100) % 100).padStart(2, '0'); // 2-digit year
  };

  const split = (token) => {
    const m = /^([^A-Za-z0-9]*)(.*?)([^A-Za-z0-9]*)$/.exec(token);
    return { lead: m[1], core: m[2], tail: m[3] };
  };
  const isSubjectCode = (core) => /^[A-Z]{2,7}$/.test(core) && !KEEP_WORDS.has(core.toLowerCase());
  const isNumberish = (core) => /^\d/.test(core);

  /** Sanitize one token given its neighbours in the line. Returns the new token. */
  const sanitizeToken = (token, prev, next, ctx) => {
    const { lead, core, tail } = split(token);
    if (core === '') return token; // punctuation, rules, asterisks
    const lower = core.toLowerCase();
    if (ctx.institutional) return token;
    if (KEEP_WORDS.has(lower)) return token;
    // e-mail: keep the domain (an nd.edu address once broke detection).
    const email = /^([\w.+-]+)@((?:[\w-]+\.)+\w+)$/.exec(core);
    if (email) {
      stats.emails++;
      return `${lead}${scrambleWord(email[1])}@${email[2]}${tail}`;
    }
    if (/^(https?:\/\/|www\.)|\.(edu|org|com|ca|uk)\b/i.test(core)) return token; // URLs are public
    // Dates: 13-MAY-2017, 05/13/2017, 2017-05-13, 13.05.17
    let m = /^(\d{1,2})([-/.])([A-Za-z]{3,9}|\d{1,2})([-/.])(\d{2,4})$/.exec(core);
    if (m) {
      stats.years++;
      const day = String(1 + Math.floor(prng(seed ^ hashString(core))() * 28)).padStart(m[1].length, '0');
      const month = /^\d/.test(m[3]) ? String(1 + Math.floor(prng(seed ^ hashString('m' + core))() * 12)).padStart(m[3].length, '0') : m[3];
      return `${lead}${day}${m[2]}${month}${m[4]}${shiftYear(m[5])}${tail}`;
    }
    m = /^(\d{1,2})([-/.])([A-Za-z]{3,9})$/.exec(core); // "25-FEB" (day-month, no year)
    if (m) {
      const day = String(1 + Math.floor(prng(seed ^ hashString(core))() * 28)).padStart(m[1].length, '0');
      return `${lead}${day}${m[2]}${m[3]}${tail}`;
    }
    m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(core);
    if (m) {
      stats.years++;
      const r = prng(seed ^ hashString(core));
      return `${lead}${shiftYear(m[1])}-${String(1 + Math.floor(r() * 12)).padStart(2, '0')}-${String(1 + Math.floor(r() * 28)).padStart(2, '0')}${tail}`;
    }
    if (/^(19|20)\d{2}$/.test(core)) {
      stats.years++;
      return `${lead}${shiftYear(core)}${tail}`;
    }
    // Banner term codes 202010 → shift the year part.
    m = /^((?:19|20)\d{2})(00|10|20|30|40|50|60|70|80|90)$/.exec(core);
    if (m) {
      stats.years++;
      return `${lead}${shiftYear(m[1])}${m[2]}${tail}`;
    }
    // Decimal numbers: credit-like values are kept (the parser needs them),
    // GPA / quality points / anything else is randomized.
    m = /^(\d+)[.,](\d+)$/.exec(core);
    if (m) {
      const gpaContext = /gpa/i.test(prev ?? '') || /gpa/i.test(ctx.label ?? '');
      // Totals lines (earned hours, cumulative points, GPA) are part of the record.
      const creditLike = Number(m[1]) <= 20 && CREDIT_FRACTIONS.has(m[2]) && !gpaContext && !ctx.totals;
      if (creditLike) return token;
      return `${lead}${randomDigits(core)}${tail}`;
    }
    // Course numbers: after a subject code — keep the first digit (level), randomize the rest.
    if (/^\d{2,5}[A-Za-z]{0,2}$/.test(core) && prev !== undefined && isSubjectCode(split(prev).core)) {
      const digits = core.replace(/[A-Za-z]+$/, '');
      const letters = core.slice(digits.length);
      return `${lead}${digits[0]}${randomDigits(digits.slice(1))}${letters}${tail}`;
    }
    m = /^([A-Z]{2,7})-?(\d{2,5})([A-Z]{0,2})$/.exec(core); // "CS-5321", "COMP1521"
    if (m && !KEEP_WORDS.has(m[1].toLowerCase())) {
      return `${lead}${core.slice(0, core.length - m[2].length - m[3].length)}${m[2][0]}${randomDigits(m[2].slice(1))}${m[3]}${tail}`;
    }
    // Integers: ids / ZIPs / phone parts (5+ digits) randomized; percent-style
    // grades (2–3 digits next to a credit value) randomized into 60–99;
    // small counts and page numbers kept.
    if (/^\d+$/.test(core)) {
      // 4+ digits (ids, SSN tails, ZIPs, phone parts; years were handled above).
      if (core.length >= 4) return `${lead}${randomDigits(core)}${tail}`;
      const neighbourDecimal = /^\d+[.,]\d+$/.test(split(prev ?? '').core) || /^\d+[.,]\d+$/.test(split(next ?? '').core);
      if (core.length >= 2 && core.length <= 3 && neighbourDecimal) {
        stats.grades++;
        return `${lead}${60 + Math.floor(prng(seed ^ hashString('g' + core + stats.grades))() * 40)}${tail}`;
      }
      return token;
    }
    // Subject codes (all caps, followed by a number somewhere in the line) stay.
    if (isSubjectCode(core) && next !== undefined && isNumberish(split(next).core)) return token;
    // Grades.
    if (CODE_GRADES.has(core.toUpperCase()) && ctx.numeric) return token;
    if (LETTER_GRADE_RE.test(core.toUpperCase()) && ctx.numeric) {
      stats.grades++;
      const r = prng(seed ^ hashString('grade' + stats.grades));
      // Always a DIFFERENT grade — an unchanged grade would be a leak.
      const pool = (core.length === 1 ? ONE_CHAR_GRADES : TWO_CHAR_GRADES).filter((g) => g !== core.toUpperCase());
      return `${lead}${pool[Math.floor(r() * pool.length)]}${tail}`;
    }
    // Everything else — names, addresses, titles — is scrambled, unless titles are kept.
    if (keepTitles && ctx.titleZone) return token;
    stats.scrambledWords++;
    return `${lead}${scrambleWord(core)}${tail}`;
  };

  /** Sanitize a page's runs. Lines are formed the way layout.ts does (same y,
   * 2-unit tolerance, left to right) so neighbour context crosses run
   * boundaries — Banner prints "CS" and "455" in separate runs. */
  const sanitizeRuns = (runs, pageWidth) => {
    // Two-column pages are handled column by column (the app's own gap
    // detection — src/transcript/layout.ts findColumnGap), so a left-column
    // course row never borrows context from the right column's totals line
    // printed on the same baseline. `columnGap` is injected by the CLI because
    // this module must stay importable without the TypeScript loader.
    const gapX = pageWidth !== undefined && options.columnGap ? options.columnGap(runs, pageWidth) : undefined;
    const columns = gapX === undefined ? [runs.map((_, i) => i)] : [
      runs.map((_, i) => i).filter((i) => runs[i].x < gapX - 2),
      runs.map((_, i) => i).filter((i) => runs[i].x >= gapX - 2),
    ];
    const lines = [];
    for (const column of columns) {
      const order = [...column].sort((a, b) => runs[b].y - runs[a].y || runs[a].x - runs[b].x);
      let current = [];
      for (const i of order) {
        if (current.length > 0 && Math.abs(runs[current[0]].y - runs[i].y) > 2) {
          lines.push(current);
          current = [];
        }
        current.push(i);
      }
      if (current.length > 0) lines.push(current);
    }
    const out = runs.map((r) => ({ text: r.text, changed: false }));
    for (const lineIdx of lines) {
      lineIdx.sort((a, b) => runs[a].x - runs[b].x);
      // A run naming an institution is kept whole — decided PER RUN, because a
      // watermark tile on the same baseline must not shield the student's name
      // printed next to it. Its tokens also stay out of the line context.
      const institutionalRuns = options.institutionalByLine && INSTITUTION_RE.test(lineIdx.map((i) => runs[i].text).join(' '))
        ? new Set(lineIdx)
        : new Set(lineIdx.filter((i) => INSTITUTION_RE.test(runs[i].text)));
      // Tokens of the rest of the line, remembering which run each came from.
      const tokens = [];
      for (const i of lineIdx) {
        if (institutionalRuns.has(i)) continue;
        const parts = runs[i].text.split(/(\s+)/);
        for (const p of parts) if (p !== '') tokens.push({ run: i, text: p, ws: /^\s+$/.test(p) });
      }
      const words = tokens.filter((t) => !t.ws);
      const institutional = false;
      const totals = /\b(total|totals|overall|cumulative|cum)\b/i.test(words.map((w) => w.text).join(' '));
      const numeric = words.some((w) => /^\d+[.,]\d+$/.test(split(w.text).core) || /^\d{2,3}$/.test(split(w.text).core));
      // A course row: subject code, number, then a title zone until the first number.
      let titleZone = false;
      let sawCode = false;
      const perRun = new Map();
      for (let k = 0; k < words.length; k++) {
        const w = words[k];
        const prev = k > 0 ? words[k - 1].text : undefined;
        const next = k + 1 < words.length ? words[k + 1].text : undefined;
        const core = split(w.text).core;
        if (!sawCode && isSubjectCode(core) && next !== undefined && isNumberish(split(next).core)) sawCode = true;
        else if (sawCode && /^\d/.test(core) && !titleZone && k >= 1 && isSubjectCode(split(words[k - 1].text).core)) titleZone = true;
        else if (titleZone && /^\d+([.,]\d+)?$/.test(core)) titleZone = false;
        // A leading "Label:" of the run is kept as the label itself.
        const label = /^([A-Za-z][A-Za-z .'/&-]{0,24}):/.exec(runs[w.run].text)?.[1];
        const isLabelToken = label !== undefined && runs[w.run].text.indexOf(w.text) < label.length + 1;
        const replaced = isLabelToken ? w.text : sanitizeToken(w.text, prev, next, { institutional, numeric, totals, titleZone: titleZone && !/^\d/.test(core), label });
        w.text = replaced;
      }
      for (const t of tokens) perRun.set(t.run, (perRun.get(t.run) ?? '') + t.text);
      for (const [i, text] of perRun) {
        out[i] = { text, changed: text !== runs[i].text };
      }
    }
    for (const [i, r] of out.entries()) {
      stats.runs++;
      if (r.changed) stats.changedRuns++;
      else {
        stats.keptRuns++;
        const key = runs[i].text.trim();
        if (key !== '') keptVerbatim.set(key, (keptVerbatim.get(key) ?? 0) + 1);
      }
    }
    return out;
  };

  return {
    seed,
    yearOffset,
    sanitizeRuns,
    report: () => ({ ...stats, keptVerbatim: [...keptVerbatim.entries()].sort((a, b) => b[1] - a[1]) }),
  };
}
