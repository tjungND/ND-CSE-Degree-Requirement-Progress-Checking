// Typed accessors over the Parameters tab. A missing or malformed value returns
// undefined AND records a SheetIssue; the engine turns undefined into
// "cannot evaluate — rules sheet is missing <key>" (never a silent pass).
import type { Parameters, SheetIssue } from './types.ts';
import { DISPLAY_PARAMETER_KEYS, KNOWN_PARAMETER_KEYS, RETIRED_PARAMETER_KEYS } from './types.ts';

/** Parameters rows whose number is also the Graduate School's minimum, with
 * no constant in the code behind them (README § A5b): each with the Graduate
 * School's value, its test for "looser" and the Graduate School's sentence.
 * A looser row reads as the Graduate School's value (policy review round 3,
 * P3-ac-5b-6.1-4; DGS 2026-10-07: option (a), "Yes — hold the Graduate
 * School's floor"), as the Courses tab's §4.1 level guard already works. */
const GRADUATE_SCHOOL_FLOORS: { key: string; floor: number; looser: (n: number) => boolean; limit: string; source: string }[] = [
  { key: 'ms_time_limit_years', floor: 5, looser: (n) => n > 5, limit: 'at most 5 years', source: 'Academic Code §6.1.4: “All requirements for the master’s degree must be completed within five years.”' },
  { key: 'ms_total_credits_min', floor: 30, looser: (n) => n < 30, limit: 'at least 30 credits', source: 'Academic Code §6.1.1: “At least thirty (30) credit hours are required for the master’s degree.”' },
  { key: 'gpa_min', floor: 3, looser: (n) => n < 3, limit: 'at least 3.0', source: 'Academic Code §4.5: “Continuation in a graduate degree program, admission to degree candidacy, and graduation require maintenance of at least a 3.0 (B) cumulative grade point average”' },
  { key: 'fulltime_credits_min', floor: 9, looser: (n) => n < 9, limit: 'at least 9 credits', source: 'Academic Code §3.3: “A full-time student is one who registers for at least nine credit hours per semester.”' },
  { key: 'summer_fulltime_credits_min', floor: 6, looser: (n) => n < 6, limit: 'at least 6 credits', source: 'DGS Handbook §10.3.2: “may include summer session if the student is registered for six or more credits” — the DGS kept this row on the sheet on 2026-10-04, never to be set below six' },
  { key: 'phd_time_limit_years', floor: 8, looser: (n) => n > 8, limit: 'at most 8 years', source: 'Academic Code §6.2.6: “The student must fulfill all doctoral requirements, including the dissertation, its defense, and the official submission within eight years from the time of matriculation”' },
];
const FLOOR_OF = new Map(GRADUATE_SCHOOL_FLOORS.map((f) => [f.key, f]));

export function makeParameters(
  raw: Map<string, { value: string; section: string; row: number }>,
  issues: SheetIssue[],
): Parameters {
  const known = new Set<string>(KNOWN_PARAMETER_KEYS);
  const display = new Set<string>(DISPLAY_PARAMETER_KEYS);

  // What a missing key actually costs. The general answer is "the requirement
  // cannot be evaluated"; a key whose absence does something else says so,
  // rather than sending the DGS looking for a row that never turns amber
  // (2026-09-09).
  const MISSING_CONSEQUENCE: Record<string, string> = {
    summer_fulltime_credits_min:
      'the MSCSE residency row cannot count a summer session by its credits — it reads "cannot evaluate" for a student whose only registration that could count is a summer (a summer beside a full-time spring or fall still counts)',
    // What the engine does since 2026-10-03 (policy review round 3,
    // P3-sheet-6 (a)): it holds the course, it does not skip the limit.
    cse_subject_codes:
      'a course transferred from another university can be placed inside or outside CSE (for the nine-credit limit on courses "taken from a department other than CSE", §3.2/§4.2) only by its ExternalCourses row’s is_cse cell, so every such course without one is held for the DGS instead of counting — today that is nearly all of them, including courses the sheet already approves',
  };
  for (const key of known) {
    if (!raw.has(key)) {
      const consequence = MISSING_CONSEQUENCE[key] ?? 'every requirement that needs it will show "cannot evaluate"';
      issues.push({
        severity: 'error',
        tab: 'Parameters',
        message: `The Parameters tab is missing the key '${key}' — ${consequence} until it is added.`,
      });
    }
  }
  // A blank subject-code cell reads as a missing key (codeList), with the same
  // cost, and used to raise nothing (P3-sheet-6 (a)).
  const codes = raw.get('cse_subject_codes');
  if (codes !== undefined && codes.value.split(/[;,/]/).every((x) => x.trim() === '')) {
    issues.push({
      severity: 'error',
      tab: 'Parameters',
      row: codes.row,
      column: 'value',
      message: `Parameters row ${codes.row}: 'cse_subject_codes' is blank — ${MISSING_CONSEQUENCE.cse_subject_codes} until the codes are filled in.`,
    });
  }
  for (const [key, entry] of raw) {
    // A key moved into the code (README § A5b): changing the row changes
    // nothing, so the DGS is told to delete it (2026-10-04).
    const retired = RETIRED_PARAMETER_KEYS[key];
    if (retired !== undefined) {
      issues.push({
        severity: 'warning',
        tab: 'Parameters',
        row: entry.row,
        message: `Parameters row ${entry.row}: '${key}' is no longer read — ${retired}. Changing the row changes nothing; delete it.`,
      });
      continue;
    }
    if (!known.has(key) && !display.has(key)) {
      issues.push({
        severity: 'warning',
        tab: 'Parameters',
        row: entry.row,
        message: `Parameters row ${entry.row}: the app does not know the key '${key}' — ignored (fine if it is for humans).`,
      });
    }
  }

  // The Graduate School's own minimums that live only on this tab (policy
  // review round 3, P3-ac-5b-6.1-4; DGS 2026-10-07: "apply the suggested
  // handling"). The Academic Code: "The following information represents the
  // minimum standards established by the Graduate School. Individual programs
  // may require higher standards." Such a row may be tightened, never
  // loosened. A looser one is warned about, and the app holds the Graduate
  // School's value (number(), below; DGS 2026-10-07, P3-ac-5b-6.1-4 (a)).
  // The warning names the value the app uses, so the next DGS sees why.
  for (const floor of GRADUATE_SCHOOL_FLOORS) {
    const entry = raw.get(floor.key);
    if (!entry || entry.value.trim() === '') continue;
    const n = Number(entry.value);
    if (!Number.isFinite(n) || !floor.looser(n)) continue;
    issues.push({
      severity: 'warning',
      tab: 'Parameters',
      row: entry.row,
      column: 'value',
      message: `Parameters row ${entry.row}: '${floor.key}' is ${entry.value.trim()}, looser than the Graduate School allows — ${floor.limit} (${floor.source}). The app uses the Graduate School’s ${floor.floor} instead: a program may set a higher standard, never a lower one. Set the row to ${floor.floor} or stricter.`,
    });
  }

  const reported = new Set<string>();
  /** `consequence` names what the reader loses, since a display-only key does
   * not make any requirement "cannot evaluate" (2026-09-09). */
  const badValue = (key: string, want: string, consequence = 'the requirements that need it show "cannot evaluate"') => {
    if (reported.has(key)) return;
    reported.add(key);
    const entry = raw.get(key);
    issues.push({
      severity: 'error',
      tab: 'Parameters',
      row: entry?.row,
      column: 'value',
      message: `Parameters key '${key}': value '${entry?.value}' is not ${want} — ${consequence}.`,
    });
  };

  return {
    raw,
    number: (key) => {
      const entry = raw.get(key);
      if (!entry) return undefined;
      // Number('') is 0 — a blank cell must read as missing, never as zero.
      if (entry.value.trim() === '') {
        badValue(key, 'a number (the cell is blank)');
        return undefined;
      }
      const n = Number(entry.value);
      if (!Number.isFinite(n)) {
        badValue(key, 'a number');
        return undefined;
      }
      // A Graduate School floor set looser reads as the floor (P3-ac-5b-6.1-4 (a)).
      const floor = FLOOR_OF.get(key);
      return floor !== undefined && floor.looser(n) ? floor.floor : n;
    },
    gradeLetter: (key) => {
      const entry = raw.get(key);
      if (!entry) return undefined;
      const v = entry.value.trim().toUpperCase();
      if (!/^[A-D][+-]?$/.test(v)) {
        badValue(key, "a letter grade like 'B'");
        return undefined;
      }
      return v;
    },
    // A list of SUBJECT codes — "CS; CSCI; COMPSCI" (2026-09-09). Forgiving
    // about the separator (; , /) and about case, like the Courses tab's
    // category_group cell. A BLANK cell reads the same as a missing key —
    // undefined, "the sheet has not said" — never as an empty list: an empty
    // list would mean "no subject code anywhere means CSE", which would put
    // every transferred course inside the non-CSE allowance on the strength
    // of an empty cell.
    codeList: (key) => {
      const entry = raw.get(key);
      if (!entry) return undefined;
      const list = entry.value
        .split(/[;,/]/)
        .map((s) => s.trim().toUpperCase())
        .filter((s) => s !== '');
      return list.length > 0 ? list : undefined;
    },
    courseList: (key) => {
      const entry = raw.get(key);
      if (!entry) return undefined;
      const list = entry.value
        .split(',')
        .map((s) => s.trim().toUpperCase().replace(/\s+/g, ' '))
        .filter((s) => s !== '');
      if (list.length === 0) {
        badValue(key, "a comma-separated course list like 'CSE 63801, CSE 63802'");
        return undefined;
      }
      return list;
    },
  };
}
