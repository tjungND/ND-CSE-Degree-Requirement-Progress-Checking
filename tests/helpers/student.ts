// Shared test factories for a Student record and its course entries, so a
// unit test states only what it is about (the program, the prior degree, one
// course) and not the whole record. Every field can be overridden; the
// defaults are the ones most tests shared before this file existed
// (2026-09-20): a Ph.D. student entering Fall 2026 with no prior master's,
// no GPA, no courses; a Notre Dame course of 3 credits, grade A, Fall 2026; a
// transfer course from Purdue, 3 credits, grade A, Fall 2024.
import type { CourseEntry, Student } from '../../src/engine/types.ts';

export function phdStudent(overrides: Partial<Student> = {}): Student {
  return {
    schemaVersion: 1,
    program: 'phd',
    entryTerm: { season: 'fall', year: 2026 },
    priorMs: 'none',
    courses: [],
    milestones: {},
    attestations: {},
    ...overrides,
  };
}

export function ndCourse(courseId: string, extra: Partial<CourseEntry> = {}): CourseEntry {
  return {
    courseId,
    credits: 3,
    term: { season: 'fall', year: 2026 },
    grade: 'A',
    origin: 'nd',
    ...extra,
  };
}

export function transferCourse(courseId: string, title?: string, extra: Partial<CourseEntry> = {}): CourseEntry {
  return {
    courseId,
    ...(title === undefined ? {} : { title }),
    credits: 3,
    term: { season: 'fall', year: 2024 },
    grade: 'A',
    origin: 'transfer',
    institution: 'Purdue University',
    ...extra,
  };
}
