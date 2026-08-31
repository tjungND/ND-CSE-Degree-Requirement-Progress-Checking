// Typed accessors over the Parameters tab. A missing or malformed value returns
// undefined AND records a SheetIssue; the engine turns undefined into
// "cannot evaluate — rules sheet is missing <key>" (never a silent pass).
import type { Parameters, SheetIssue } from './types.ts';
import { KNOWN_PARAMETER_KEYS } from './types.ts';

export function makeParameters(
  raw: Map<string, { value: string; section: string; row: number }>,
  issues: SheetIssue[],
): Parameters {
  const known = new Set<string>(KNOWN_PARAMETER_KEYS);

  for (const key of known) {
    if (!raw.has(key)) {
      issues.push({
        severity: 'error',
        tab: 'Parameters',
        message: `The Parameters tab is missing the key '${key}' — every requirement that needs it will show "cannot evaluate" until it is added.`,
      });
    }
  }
  for (const [key, entry] of raw) {
    if (!known.has(key)) {
      issues.push({
        severity: 'warning',
        tab: 'Parameters',
        row: entry.row,
        message: `Parameters row ${entry.row}: the app does not know the key '${key}' — ignored (fine if it is for humans).`,
      });
    }
  }

  const reported = new Set<string>();
  const badValue = (key: string, want: string) => {
    if (reported.has(key)) return;
    reported.add(key);
    const entry = raw.get(key);
    issues.push({
      severity: 'error',
      tab: 'Parameters',
      row: entry?.row,
      column: 'value',
      message: `Parameters key '${key}': value '${entry?.value}' is not ${want} — the requirements that need it show "cannot evaluate".`,
    });
  };

  return {
    raw,
    has: (key) => raw.has(key),
    section: (key) => raw.get(key)?.section,
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
      return n;
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
