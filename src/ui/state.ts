// Student state: localStorage autosave plus explicit save-to-file / load-file
// (DGS-requested, 2026-08-31) so a student can move between devices/browsers.
// Nothing ever leaves the browser (CLAUDE.md).
import type { Student } from '../engine/types.ts';

const LS_KEY = 'cse-degree-audit/v1/student';

export function emptyStudent(): Student {
  return {
    schemaVersion: 1,
    program: 'phd',
    entryTerm: { season: 'fall', year: new Date().getFullYear() },
    priorMs: 'none',
    courses: [],
    milestones: {},
    attestations: {},
  };
}

/** Structural check for imported files — plain-English error on mismatch. */
export function validateStudent(data: unknown): Student {
  const d = data as Partial<Student> & { state?: unknown };
  if (d && typeof d === 'object' && 'student' in (d as object)) {
    // accept { savedAt, student } wrapper from exportFile()
    return validateStudent((d as { student: unknown }).student);
  }
  if (!d || typeof d !== 'object') throw new Error('This file is not a saved audit (not a JSON object).');
  if (d.schemaVersion !== 1) {
    throw new Error(
      `This file has schemaVersion ${String((d as { schemaVersion?: unknown }).schemaVersion)} — this app reads version 1.`,
    );
  }
  if (d.program !== 'mscse' && d.program !== 'phd') throw new Error("This file has no program ('mscse' or 'phd').");
  if (!d.entryTerm || typeof d.entryTerm.year !== 'number') throw new Error('This file has no entry term.');
  if (!Array.isArray(d.courses)) throw new Error('This file has no course list.');
  return {
    ...emptyStudent(),
    ...d,
    milestones: d.milestones ?? {},
    attestations: d.attestations ?? {},
    courses: d.courses,
  } as Student;
}

export function loadLocal(): Student | undefined {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return undefined;
    return validateStudent(JSON.parse(raw));
  } catch {
    return undefined; // corrupted local state → start fresh rather than crash
  }
}

export function saveLocal(student: Student): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(student));
  } catch {
    // private mode / storage full — the explicit save-to-file still works
  }
}

export function clearLocal(): void {
  try {
    localStorage.removeItem(LS_KEY);
  } catch {
    /* ignore */
  }
}

export function exportFile(student: Student): void {
  const payload = { savedAt: new Date().toISOString(), student };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `cse-degree-audit-${student.program}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function importFile(file: File): Promise<Student> {
  return file.text().then((text) => validateStudent(JSON.parse(text)));
}
