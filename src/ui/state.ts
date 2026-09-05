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
    // A guess until the student sets it or a transcript import reads it
    // (2026-09-05) — the standing card says so while the flag is set.
    entryTermInferred: { how: 'assumed' },
    priorMs: 'none',
    courses: [],
    milestones: {},
    attestations: {},
  };
}

const SEASONS = ['fall', 'spring', 'summer'];

function validTerm(t: unknown): t is Student['entryTerm'] {
  const term = t as Record<string, unknown> | undefined;
  return !!term && typeof term['year'] === 'number' && SEASONS.includes(term['season'] as never);
}

/** The entryTermInferred flag of a saved file, when well-formed; otherwise
 * undefined — a file that carries no flag was saved by a student who set (or
 * accepted) the term, so it must NOT inherit emptyStudent()'s "assumed". */
function validInferred(v: unknown): Student['entryTermInferred'] {
  const f = v as Record<string, unknown> | undefined;
  if (!f || typeof f !== 'object' || typeof f['how'] !== 'string') return undefined;
  const alt = f['alternative'] as Record<string, unknown> | undefined;
  if (alt && typeof alt === 'object' && validTerm(alt['term']) && typeof alt['why'] === 'string') {
    return { how: f['how'], alternative: { term: alt['term'], why: alt['why'] } };
  }
  return { how: f['how'] };
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
  if (!validTerm(d.entryTerm)) {
    throw new Error('This file has no valid entry term.');
  }
  if (!Array.isArray(d.courses)) throw new Error('This file has no course list.');
  // Deep-check each course — a malformed entry accepted here would crash every
  // later page load, since the file is saved to localStorage.
  d.courses.forEach((c: unknown, i: number) => {
    const e = c as Record<string, unknown>;
    const where = `Course ${i + 1} in the file`;
    if (!e || typeof e !== 'object') throw new Error(`${where} is not an object.`);
    if (typeof e['courseId'] !== 'string' || e['courseId'].trim() === '')
      throw new Error(`${where} has no course number.`);
    if (typeof e['credits'] !== 'number' || !Number.isFinite(e['credits']))
      throw new Error(`${where} (${String(e['courseId'])}) has no numeric credits value.`);
    const term = e['term'] as Record<string, unknown> | undefined;
    if (!term || typeof term['year'] !== 'number' || !SEASONS.includes(term['season'] as never))
      throw new Error(`${where} (${String(e['courseId'])}) has no valid term.`);
    if (typeof e['grade'] !== 'string') throw new Error(`${where} (${String(e['courseId'])}) has no grade.`);
    if (e['origin'] !== 'nd' && e['origin'] !== 'transfer')
      throw new Error(`${where} (${String(e['courseId'])}) has no origin ('nd' or 'transfer').`);
    if (e['degreeLevel'] !== undefined && !['bachelors', 'masters', 'phd'].includes(e['degreeLevel'] as string))
      throw new Error(`${where} (${String(e['courseId'])}) has an unrecognized degreeLevel.`);
    if (e['registeredLevel'] !== undefined && !['undergraduate', 'graduate'].includes(e['registeredLevel'] as string))
      delete e['registeredLevel']; // a hint only — drop a malformed one rather than refuse the file
  });
  return {
    ...emptyStudent(),
    ...d,
    entryTermInferred: validInferred((d as Record<string, unknown>)['entryTermInferred']),
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
