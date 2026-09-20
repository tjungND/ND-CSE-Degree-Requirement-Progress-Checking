# Scenario fixtures

One JSON file per student case: the student's input plus the expected status of every
requirement. `tests/scenarios.test.ts` runs them all; add one whenever an edge case or a bug is
found (file names describe the case, e.g. `phd-two-distinct-groups.json`). The keys are the
`ScenarioFile` interface in `tests/helpers.ts`:

| key | required | what it is |
|---|---|---|
| `name` | yes | The test's name in the runner's output. |
| `description` | yes | Why this case exists, for a human. |
| `today` | yes | The date the audit is run on (`YYYY-MM-DD`) — deadlines and "semester N" count from it. |
| `rules` | yes | `{ "base": "default" }` = the fixture CSVs in `tests/fixtures/rules/`; an optional `patch` edits them before parsing: `parameters` (key → value, or `null` to delete the row), `courses` (`course_id` + optional `rules_effective_term`, then `set` cells or `remove: true`), `external` (replaces the ExternalCourses tab with an array of row objects; `[]` = an empty tab). |
| `student` | yes | A full `Student` record (`src/engine/types.ts`) — program, entry term, prior study, courses, milestones, attestations. |
| `expect` | yes | requirement id → `{ status, detailIncludes?, detailExcludes? }`: the expected status, substrings the detail must contain and substrings it must not. Every id must be one of `REQUIREMENT_IDS` in `src/engine/audit.ts`, and every registered id must be asserted by at least one fixture. |
| `expectTracks` | no | The §3.5 / §3.6 track sections the report must carry, in order. |
| `expectAbsent` | no | Requirement ids that must not appear in the report at all. |
| `expectReviewEmpty` | no | `true` = the DGS review request has nothing to ask. |
| `expectCourseLines` | no | course id → substrings that one of that course's report lines must all contain. |

On a failure the runner prints the row's full detail next to the substring it expected, so a
pin can be shortened to the clause that distinguishes the row.

Run one fixture:

```
node --test --test-name-pattern=phd-fresh tests/scenarios.test.ts
```
