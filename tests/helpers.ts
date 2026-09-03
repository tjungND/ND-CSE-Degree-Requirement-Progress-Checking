// Test helpers: load the fixture rules CSVs, apply a scenario's inline patch,
// and build a Rules object through the SAME parse/validate pipeline the app uses.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCsv, serializeCsv } from '../src/data/csv.ts';
import { rulesFromCsvTexts } from '../src/data/assemble.ts';
import type { Rules } from '../src/data/types.ts';
import type { Student } from '../src/engine/types.ts';

const here = dirname(fileURLToPath(import.meta.url));
const fixtureDir = join(here, 'fixtures', 'rules');

export interface ScenarioFile {
  name: string;
  description: string;
  today: string;
  rules: { base: 'default'; patch?: RulesPatch };
  student: Student;
  expect: Record<string, { status: string; detailIncludes?: string[] }>;
  expectCourseLines?: Record<string, string[]>;
}

export interface RulesPatch {
  /** key → new value, or null to delete the row (tests "missing parameter"). */
  parameters?: Record<string, string | null>;
  courses?: {
    course_id: string;
    effective_term?: string;
    set?: Record<string, string>;
    remove?: boolean;
  }[];
  /** Replace the ExternalCourses tab entirely: an array of row objects keyed by
   * column name ([] = an empty tab); undefined leaves the fixture rows. */
  external?: Record<string, string>[];
}

export function fixtureCsvTexts(): { courses: string; parameters: string; categories: string; external: string } {
  return {
    courses: readFileSync(join(fixtureDir, 'courses.csv'), 'utf8'),
    parameters: readFileSync(join(fixtureDir, 'parameters.csv'), 'utf8'),
    categories: readFileSync(join(fixtureDir, 'categories.csv'), 'utf8'),
    external: readFileSync(join(fixtureDir, 'external.csv'), 'utf8'),
  };
}

/** Apply a scenario's inline patch at the CSV level, so patched rules still go
 * through the one true parse/validate pipeline. */
export function applyPatch(
  texts: { courses: string; parameters: string; categories: string; external?: string },
  patch?: RulesPatch,
): { courses: string; parameters: string; categories: string; external?: string } {
  if (!patch) return texts;
  let parameters = texts.parameters;
  let courses = texts.courses;

  if (patch.parameters) {
    const rows = parseCsv(parameters);
    const header = rows[0] ?? [];
    let body = rows.slice(1);
    for (const [key, value] of Object.entries(patch.parameters)) {
      if (value === null) {
        body = body.filter((r) => r[0] !== key);
      } else {
        const row = body.find((r) => r[0] === key);
        if (row) row[1] = value;
        else body.push([key, value, '', '']);
      }
    }
    parameters = serializeCsv([header, ...body]);
  }

  if (patch.courses) {
    const rows = parseCsv(courses);
    const header = rows[0] ?? [];
    const col = (name: string) => header.indexOf(name);
    let body = rows.slice(1);
    for (const op of patch.courses) {
      const matches = (r: string[]) =>
        r[col('course_id')] === op.course_id &&
        (op.effective_term === undefined || r[col('effective_term')] === op.effective_term);
      if (op.remove) {
        body = body.filter((r) => !matches(r));
      } else if (op.set) {
        for (const r of body) {
          if (!matches(r)) continue;
          for (const [k, v] of Object.entries(op.set)) {
            const i = col(k);
            if (i >= 0) r[i] = v;
          }
        }
      }
    }
    courses = serializeCsv([header, ...body]);
  }

  let external = texts.external;
  if (patch.external) {
    const header = ['university', 'university_aliases', 'course_id', 'course_title', 'satisfies_core_area', 'transferable', 'nd_credits', 'decided_on', 'notes'];
    external = serializeCsv([header, ...patch.external.map((row) => header.map((h) => row[h] ?? ''))]);
  }
  return { courses, parameters, categories: texts.categories, ...(external !== undefined ? { external } : {}) };
}

export function buildRules(patch?: RulesPatch): Rules {
  const texts = applyPatch(fixtureCsvTexts(), patch);
  return rulesFromCsvTexts(texts, { source: 'snapshot', syncedAt: '2026-08-31T00:00:00Z' });
}
