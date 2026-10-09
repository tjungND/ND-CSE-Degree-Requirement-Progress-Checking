// The one-line form of a parsed course row — `id | title | credits | grade |
// season year[ | level]` — that both transcript corpora are pinned against
// (`tests/fixtures/public-transcripts/expected.json`,
// `tests/fixtures/ms-transcripts/expected.json`) and that the dev scripts
// print. One definition, imported everywhere (2026-10-09, transcript accuracy
// program, Batch A): the scorer in scripts/dev/score.mts reads the expected
// rows back through the same shape, so the test's pass criterion and the
// replay's `exact` cannot drift apart. Nothing imports it from a `*.test.ts`
// file — importing a test file runs its suite.
//
// Missing credits and a missing grade print as `?`; the term cell is the
// season and year with a space between (either may be empty); the level is
// appended only when the transcript said one.
import type { ExternalCourseCandidate } from '../../src/transcript/external.ts';

export const rowOf = (c: ExternalCourseCandidate): string =>
  `${c.courseId} | ${c.title ?? ''} | ${c.credits ?? '?'} | ${c.grade ?? c.rawGrade ?? '?'} | ${c.season ?? ''} ${c.year ?? ''}${c.level ? ' | ' + c.level : ''}`;
