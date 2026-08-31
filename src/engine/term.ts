// Term arithmetic (decision Q17): fall + spring semesters only, semester 1 = the
// entry term, approximate end-of-semester dates always labeled "(approximate)".
// §4.3: "full-time status for four (4) consecutive semesters (not including the
// summer session)" — summers are skipped without breaking a consecutive run.
import type { ApproxDate, Season, Term } from './types.ts';

const SEASON_ORDER: Record<Season, number> = { spring: 0, summer: 1, fall: 2 };

/** Total order over terms: Spring 2026 < Summer 2026 < Fall 2026 < Spring 2027 … */
export function termIndex(t: Term): number {
  return t.year * 3 + SEASON_ORDER[t.season];
}

export function compareTerm(a: Term, b: Term): number {
  return termIndex(a) - termIndex(b);
}

export function termLabel(t: Term): string {
  const season = t.season.charAt(0).toUpperCase() + t.season.slice(1);
  return `${season} ${t.year}`;
}

/** "Fall 2026" → Term. Returns undefined for anything else. */
export function parseTermLabel(s: string): Term | undefined {
  const m = /^\s*(spring|summer|fall)\s+(\d{4})\s*$/i.exec(s);
  if (!m || !m[1] || !m[2]) return undefined;
  return { season: m[1].toLowerCase() as Season, year: Number(m[2]) };
}

/** Which term a calendar date falls in: Jan–May spring, Jun 1–Aug 14 summer,
 * Aug 15–Dec 31 fall (nominal semester boundaries; approximate by design). */
export function termOfDate(iso: string): Term {
  const year = Number(iso.slice(0, 4));
  const month = Number(iso.slice(5, 7));
  const day = Number(iso.slice(8, 10));
  if (month <= 5) return { season: 'spring', year };
  if (month < 8 || (month === 8 && day < 15)) return { season: 'summer', year };
  return { season: 'fall', year };
}

/** Sequential index over fall/spring terms only (summer maps to the preceding spring). */
function semesterSeq(t: Term): number {
  if (t.season === 'fall') return t.year * 2 + 1;
  return t.year * 2; // spring and summer both map to the year's spring slot
}

/** A summer entry term is normalized to the following fall (decision Q17c). */
export function normalizeEntryTerm(entry: Term): { term: Term; normalized: boolean } {
  if (entry.season === 'summer') return { term: { season: 'fall', year: entry.year }, normalized: true };
  return { term: entry, normalized: false };
}

/** 1-based semester number of term `t` for a student who entered at `entry`.
 * Counts fall/spring only; a summer `t` reports the preceding semester's number. */
export function semesterNumber(entry: Term, t: Term): number {
  const e = normalizeEntryTerm(entry).term;
  return semesterSeq(t) - semesterSeq(e) + 1;
}

/** The fall/spring term that is semester `n` (1-based) for `entry`. */
export function nthSemester(entry: Term, n: number): Term {
  const e = normalizeEntryTerm(entry).term;
  let seq = semesterSeq(e) + (n - 1);
  const year = Math.floor(seq / 2);
  const season: Season = seq % 2 === 1 ? 'fall' : 'spring';
  return { season, year };
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Nominal first day of classes: spring Jan 10, summer Jun 1, fall Aug 15. */
export function startOfTerm(t: Term): ApproxDate {
  const md = t.season === 'spring' ? '01-10' : t.season === 'summer' ? '06-01' : '08-15';
  return { date: `${t.year}-${md}`, approx: true };
}

/** Nominal last day of the term: spring May 31, summer Aug 14, fall Dec 31. */
export function endOfTerm(t: Term): ApproxDate {
  const md = t.season === 'spring' ? '05-31' : t.season === 'summer' ? '08-14' : '12-31';
  return { date: `${t.year}-${md}`, approx: true };
}

export function addMonthsIso(iso: string, months: number): string {
  const year = Number(iso.slice(0, 4));
  const month = Number(iso.slice(5, 7));
  const day = Number(iso.slice(8, 10));
  const total = year * 12 + (month - 1) + months;
  const y = Math.floor(total / 12);
  const m = (total % 12) + 1;
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${y}-${pad(m)}-${pad(Math.min(day, daysInMonth))}`;
}

export function addYearsIso(iso: string, years: number): string {
  return addMonthsIso(iso, years * 12);
}

/** Shift a term by whole years (for the §5.2 five-year transfer window). */
export function shiftTermYears(t: Term, years: number): Term {
  return { season: t.season, year: t.year + years };
}

/** Longest run of consecutive full-time fall/spring semesters. Summers are
 * skipped and do not break the run (§4.3); a fall/spring gap does. */
export function maxConsecutiveFullTime(terms: { term: Term; fullTime: boolean }[]): number {
  const fullTimeSeqs = new Set(
    terms.filter((t) => t.fullTime && t.term.season !== 'summer').map((t) => semesterSeq(t.term)),
  );
  let best = 0;
  for (const seq of fullTimeSeqs) {
    if (fullTimeSeqs.has(seq - 1)) continue; // not the start of a run
    let len = 1;
    while (fullTimeSeqs.has(seq + len)) len++;
    best = Math.max(best, len);
  }
  return best;
}
