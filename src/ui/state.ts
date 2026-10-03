// Student state: localStorage autosave plus explicit save-to-file / load-file
// (DGS-requested, 2026-08-31) so a student can move between devices/browsers.
// Nothing ever leaves the browser (CLAUDE.md).
import { COURSE_CREDITS_RANGE, GPA_RANGE, inRange, rangeRefusal } from '../engine/ranges.ts';
import type { Season, Student, Term } from '../engine/types.ts';

const LS_KEY = 'cse-degree-audit/v1/student';

/** The name of the file "Save to a file" writes (exportFile below). */
export function selfCheckFileName(program: Student['program']): string {
  return `cse-degree-audit-${program}.json`;
}

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

/** The three semesters, in the order every season dropdown lists them. */
export const SEASONS: readonly Season[] = ['fall', 'spring', 'summer'];

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

/** "Bachelor's degree awarded" (2026-09-06): a term when well-formed, else
 * unknown; its inferred-from-a-transcript flag never survives without it. */
function validBachelors(v: unknown): Student['entryTerm'] | undefined {
  return validTerm(v) ? { season: v.season, year: v.year } : undefined;
}
function validBachelorsInferred(v: unknown, term: Student['entryTerm'] | undefined): Student['bachelorsAwardedInferred'] {
  const f = v as Record<string, unknown> | undefined;
  if (!(term && f && typeof f === 'object' && typeof f['how'] === 'string')) return undefined;
  const before = validTerm(f['before']) ? { season: (f['before'] as Term).season, year: (f['before'] as Term).year } : undefined;
  return { how: f['how'], ...(before ? { before } : {}) };
}

/** An earlier Notre Dame master's degree (2026-09-09). Presence is the fact
 * ("this student already holds the MSCSE"); the term is optional, since a
 * student may tick the box without one. A malformed term is dropped rather
 * than throwing — the fact still stands. */
/** The earlier-degrees answer (2026-09-22): both questions well-formed, else unanswered. */
function validBackground(v: unknown): Student['background'] {
  if (!v || typeof v !== 'object') return undefined;
  const o = v as Record<string, unknown>;
  const bachelors = o['bachelors'];
  const graduate = o['graduate'];
  if (bachelors !== 'nd-cse' && bachelors !== 'nd-other' && bachelors !== 'elsewhere') return undefined;
  if (graduate !== 'none' && graduate !== 'nd-mscse' && graduate !== 'nd-4plus1' && graduate !== 'nd-mscse-transfer' && graduate !== 'nd-other' && graduate !== 'elsewhere') return undefined;
  return {
    bachelors,
    ...(bachelors === 'nd-cse' && typeof o['ndIntegrated'] === 'boolean' ? { ndIntegrated: o['ndIntegrated'] as boolean } : {}),
    graduate,
    ...(graduate === 'elsewhere' ? { samePlace: o['samePlace'] === true, finished: o['finished'] === true } : {}),
    // A degree at Notre Dame in another department asks "finished?" since
    // 2026-10-03; a file from before then has no answer, and the dialog asks.
    ...(graduate === 'nd-other' && typeof o['finished'] === 'boolean' ? { finished: o['finished'] as boolean } : {}),
    // The transfer term (2026-09-28): kept when well-formed, dropped otherwise — the answer stands without it.
    ...(graduate === 'nd-mscse-transfer' && validTerm(o['transferredTerm']) ? { transferredTerm: { season: (o['transferredTerm'] as Term).season, year: (o['transferredTerm'] as Term).year } } : {}),
  };
}
function validNdMasters(v: unknown): Student['ndMasters'] {
  if (!v || typeof v !== 'object') return undefined;
  const o = v as Record<string, unknown>;
  const term = validTerm(o['term']) ? { season: (o['term'] as Student['entryTerm']).season, year: (o['term'] as Student['entryTerm']).year } : undefined;
  const inf = o['inferred'] as Record<string, unknown> | undefined;
  return {
    ...(term ? { term } : {}),
    ...(inf && typeof inf === 'object' && typeof inf['how'] === 'string' ? { inferred: { how: inf['how'] } } : {}),
  };
}

/** The Notre Dame transcript's dated degree conferrals (2026-09-10). Malformed
 * entries are dropped, not thrown on: they are a convenience for re-reading
 * ndMasters, never the student's own answer. */
function validNdDegrees(v: unknown): Student['ndDegrees'] {
  if (!Array.isArray(v)) return undefined;
  const out = v.flatMap((raw) => {
    const d = raw as Record<string, unknown> | undefined;
    const level = d?.['level'];
    const date = d?.['date'];
    return d && typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) && (level === 'bachelors' || level === 'masters' || level === 'phd')
      ? [{ level: level as 'bachelors' | 'masters' | 'phd', date }]
      : [];
  });
  return out.length > 0 ? out : undefined;
}

/** A value a saved record carried that the app will not keep: the field it
 * belongs to (its `data-key` in the form), the text as it stood, and the
 * sentence the student is shown. */
export type Refusal = { key: string; text: string; message: string };

/** Structural check for imported files — plain-English error on mismatch.
 *
 * `refusals` collects the values this file carried that the app will not keep
 * but that are not worth refusing the whole record over (interface review R1,
 * 2026-09-18): the caller shows each sentence to the student and puts the
 * value back in its own field to be corrected. A file is the student's own
 * work, so one impossible number drops out of it rather than taking the other
 * ninety with it — and `loadLocal()` reads the same code, where throwing would
 * silently discard everything already on the device. */
/** Files from before 2026-09-27 recorded the DGS's approvals as three
 * record-level boxes. Each ticked box is mapped onto every course it covered
 * (the engine honours the mark only on a course the sheet decides case by
 * case, so nothing counts that did not before) and the box is cleared. */
function migrateApprovalBoxes(d: { courses: Record<string, unknown>[]; attestations?: Record<string, unknown> }): void {
  const old = d.attestations;
  if (!old) return;
  const fourk = old['dgsApproved4xxxx'] === true;
  const noncse = old['dgsApprovedNonCse'] === true;
  const transfer = old['transferApproved'] === true;
  if (!fourk && !noncse && !transfer) return;
  for (const c of d.courses) {
    const id = String(c['courseId'] ?? '');
    const level = Number(/\b(\d)\d{4}\b/.exec(id)?.[1]);
    const cse = /^CSE\b/.test(id);
    const fromNd = c['origin'] === 'nd' || /notre dame/i.test(String(c['institution'] ?? ''));
    const graduateTransfer = c['origin'] === 'transfer' && c['degreeLevel'] !== 'bachelors';
    if ((fourk && fromNd && cse && (level === 4 || level === 5)) || (noncse && !cse) || (transfer && graduateTransfer)) c['dgsApproved'] = true;
  }
  delete old['dgsApproved4xxxx'];
  delete old['dgsApprovedNonCse'];
  delete old['transferApproved'];
}

/** The §4.4 extension became a NUMBER of semesters on 2026-10-03 (DGS: "DGS may
 * give any number of semesters as extensions"); a ticked box from before
 * reads as one semester. */
function migrateExtensionBox(attestations: Record<string, unknown> | undefined): void {
  if (!attestations) return;
  if (attestations['qualifierExtensionGranted'] === true && typeof attestations['qualifierExtensionSemesters'] !== 'number') {
    attestations['qualifierExtensionSemesters'] = 1;
  }
  delete attestations['qualifierExtensionGranted'];
  const n = attestations['qualifierExtensionSemesters'];
  if (n !== undefined && !(typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= 20)) delete attestations['qualifierExtensionSemesters'];
  if (attestations['transferRecorded'] !== undefined && typeof attestations['transferRecorded'] !== 'boolean') delete attestations['transferRecorded'];
}

/** A small whole number of semesters (leaves, accommodations), or undefined. */
function validSemesterCount(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 20 ? v : undefined;
}

export function validateStudent(data: unknown, refusals: Refusal[] = []): Student {
  const d = data as Partial<Student> & { state?: unknown };
  if (d && typeof d === 'object' && 'student' in (d as object)) {
    // accept { savedAt, student } wrapper from exportFile()
    return validateStudent((d as { student: unknown }).student, refusals);
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
  // Admissions are in fall and spring only (DGS 2026-10-03): a summer entry
  // term in an older record is an early start whose official matriculation is
  // that year's fall, so it is read as the fall — the engine's own
  // normalisation, applied to the stored value so the form shows what counts.
  if (d.entryTerm.season === 'summer') d.entryTerm = { season: 'fall', year: d.entryTerm.year };
  if (!Array.isArray(d.courses)) throw new Error('This file has no course list.');
  // Which degrees a course has already counted toward (2026-09-10). A value
  // the app does not know is dropped, never thrown on — an unanswered course
  // simply counts nothing until the student answers.
  const COUNTED_TOWARD = ['bs', 'mscse', 'both', 'neither'];
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
    // Fifteen credits is the most any single course may be worth (DGS
    // 2026-09-18), so a record carrying more than that — which the pre-R1
    // build accepted, and which put "1005 pending review/approval" on the
    // 60-credit row — is corrected on load rather than refused: the course
    // stays, its credits go to 0, and the student is told. Zero is already the
    // app's own "counts toward nothing" state, with its own warning on the
    // course line, so the row says what is wrong where the student can fix it.
    if (!inRange(e['credits'], COURSE_CREDITS_RANGE)) {
      refusals.push({
        key: `course.${String(e['courseId'])}.credits`,
        text: String(e['credits']),
        message: `${String(e['courseId'])}: ${rangeRefusal(e['credits'], COURSE_CREDITS_RANGE, 'loaded')} It is on your list with 0 credits until you enter them.`,
      });
      e['credits'] = 0;
    }
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
    if (e['fromNdTranscript'] !== undefined && e['fromNdTranscript'] !== true)
      delete e['fromNdTranscript']; // likewise a hint (which rows the transcript import added)
    if (e['fromExample'] !== undefined && e['fromExample'] !== true) delete e['fromExample']; // and which came from "Load example"
    if (e['fromUnofficialTranscript'] !== undefined && e['fromUnofficialTranscript'] !== true) delete e['fromUnofficialTranscript']; // and which came from an unofficial transcript
    if (e['transcriptMark'] !== undefined && (typeof e['transcriptMark'] !== 'string' || e['transcriptMark'].trim() === '')) delete e['transcriptMark']; // the mark as the transcript printed it
    if (e['countedToward'] !== undefined && !COUNTED_TOWARD.includes(e['countedToward'] as string)) delete e['countedToward'];
    if (e['dgsApproved'] !== undefined && e['dgsApproved'] !== true) delete e['dgsApproved']; // the DGS's approval of this course (2026-09-27)
  });
  migrateApprovalBoxes(d as unknown as { courses: Record<string, unknown>[]; attestations?: Record<string, unknown> });
  migrateExtensionBox((d as { attestations?: Record<string, unknown> }).attestations);
  // The cumulative GPA is the one number in a file the engine reads straight
  // through to a verdict, so it is range-checked here as well as in the form
  // (R1, 2026-09-18): a hand-edited 35 used to render "35.00 meets the 3.0
  // minimum", and a hand-edited "four point oh" threw on `.toFixed()`. An
  // impossible figure is dropped and reported; the rest of the record loads.
  const rawGpa = (d as Record<string, unknown>)['gpa'];
  // `null` means "not entered", not a figure: an older file can carry one, and
  // a null passed every `gpa !== undefined` test downstream and then threw on
  // `.toFixed()` in the §4.5 candidacy gate. It becomes undefined, silently —
  // nothing was refused, there was nothing there.
  const hasGpa = rawGpa !== undefined && rawGpa !== null;
  const gpaRefused = hasGpa && !inRange(rawGpa, GPA_RANGE);
  if (gpaRefused) refusals.push({ key: 'courses.gpa', text: String(rawGpa), message: rangeRefusal(rawGpa, GPA_RANGE, 'loaded') });
  const gpa = hasGpa && !gpaRefused ? (rawGpa as number) : undefined;
  // gpaSource (2026-09-05) is a display hint — drop a malformed one, keep the file.
  const gs = (d as Record<string, unknown>)['gpaSource'] as Record<string, unknown> | undefined;
  const gpaSource =
    gpaRefused || !(gs && typeof gs === 'object' && (gs['basis'] === 'transcript-graduate' || gs['basis'] === 'program-only'))
      ? undefined
      : (gs as Student['gpaSource']);
  const raw = d as Record<string, unknown>;
  const bachelorsAwarded = validBachelors(raw['bachelorsAwarded']);
  return {
    ...emptyStudent(),
    ...d,
    ...(gpa === undefined ? { gpa: undefined } : { gpa }),
    gpaSource,
    entryTermInferred: validInferred(raw['entryTermInferred']),
    bachelorsAwarded,
    bachelorsAwardedInferred: validBachelorsInferred(raw['bachelorsAwardedInferred'], bachelorsAwarded),
    background: validBackground(raw['background']),
    ndMasters: validNdMasters(raw['ndMasters']),
    ...(typeof raw['integratedBsMs'] === 'boolean' ? { integratedBsMs: raw['integratedBsMs'] as boolean } : {}),
    ...(typeof raw['integratedBsMs'] === 'boolean' && raw['integratedBsMsInferred'] && typeof (raw['integratedBsMsInferred'] as Record<string, unknown>)['how'] === 'string'
      ? { integratedBsMsInferred: { how: (raw['integratedBsMsInferred'] as { how: string }).how } }
      : {}),
    ndDegrees: validNdDegrees(raw['ndDegrees']),
    // The policy review's standing facts (2026-10-03): leaves and
    // accommodations (semester counts), a readmission term, the non-degree
    // answer — each kept only when well-formed.
    leaveSemesters: validSemesterCount(raw['leaveSemesters']),
    accommodationSemesters: validSemesterCount(raw['accommodationSemesters']),
    readmittedTerm: validTerm(raw['readmittedTerm']) ? { season: (raw['readmittedTerm'] as Term).season, year: (raw['readmittedTerm'] as Term).year } : undefined,
    ...(typeof raw['ndNonDegree'] === 'boolean' ? { ndNonDegree: raw['ndNonDegree'] as boolean } : { ndNonDegree: undefined }),
    milestones: d.milestones ?? {},
    attestations: d.attestations ?? {},
    courses: d.courses,
    // A file the student loads is THEIR record, whatever it was saved from
    // (2026-09-08) — the example marker never rides in on an import.
    isExample: undefined,
  } as Student;
}

export function loadLocal(refusals: Refusal[] = []): Student | undefined {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return undefined;
    return validateStudent(JSON.parse(raw), refusals);
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
  a.download = selfCheckFileName(student.program);
  a.click();
  URL.revokeObjectURL(a.href);
}

export function importFile(file: File, refusals: Refusal[] = []): Promise<Student> {
  return file.text().then((text) => validateStudent(JSON.parse(text), refusals));
}
