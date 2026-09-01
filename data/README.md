# Rules data — the DGS-editable Google Sheet

Sheet: **CSE-Degree-Audit-Rules** (owner: the current DGS; lives in the shared "DGS things (CSE)"
Drive folder under "Degree Audit App (Claude Code starter kit)"). The app reads it read-only at page load through Google's
"Publish to web" CSV links, and a GitHub Action snapshots it into `data/snapshot.json` every six
hours (committing only when the content changed) so the app still works if the sheet is ever
unpublished — and so the pages can say when the rules last changed.

## How the app reads the sheet
In the sheet: **File → Share → Publish to web → Link → choose one tab → Comma-separated values
(.csv)**. Do this once per tab. Each tab gets a URL of the form

    https://docs.google.com/spreadsheets/d/e/<PUBLISHED_ID>/pub?gid=<TAB_GID>&single=true&output=csv

The current URLs are in `data/sheet-urls.json` (Courses gid 922680330, Parameters gid 1921993253,
Categories gid 298683565); the app reads that file. Note that Google serves these CSVs with the
numbers as plain integers (24, not 24.0) and blank cells as empty strings. Publishing makes the tab publicly readable by anyone
with the link — fine for course rules, which are already public policy. Nothing about students is
in the sheet.

Edits appear in the published CSV within about five minutes. Students see them on next page load.

## Tabs

### Tab `Courses` — one row per course the app knows about
Prefilled from the Banner sweep (`cse_courses.csv`, Aug 2026): every CSE 4xxxx–9xxxx catalog
entry, latest version per course number (371 rows). Informational columns come from Banner;
policy columns are the DGS's.

| column | allowed values | meaning |
|---|---|---|
| `course_id` | e.g. `CSE 60641` | Department code, space, five digits. Primary key. |
| `title` | text | Shown in the autocomplete. |
| `level` | 4–9 | First digit of the number (informational). |
| `credit_min`, `credit_max` | numbers | Banner credit range (informational). |
| `credits_default` | number or blank | What the app pre-fills; blank for variable-credit courses, the student enters the transcript value. |
| `course_type` | `regular` \| `seminar` \| `research` \| `independent` \| `project` | Only `regular` counts toward the 24 regular-course credits (§3.2, §4.2). |
| `counts_toward_mscse` | `yes` \| `no` \| `dgs_approval` | `dgs_approval` → the app counts it provisionally and tells the student to get sign-off. |
| `counts_toward_phd` | `yes` \| `no` \| `dgs_approval` | same |
| `core_area` | `os` \| `algorithms` \| `architecture` \| blank | Which §4.4.1 core-knowledge area the course satisfies. |
| `category_group` | `alg` \| `hcc` \| `arch` \| `dsai` \| `sys` \| `any` \| `ineligible` \| blank | Which §4.4.2 specialization group it belongs to. `any` = listed under all groups (the student picks one). `ineligible` = can never satisfy the category requirement — the DGS marks all 40000-level courses this way. Blank = not a category course. |
| `typically_offered` | `fall` \| `spring` \| `both` \| `varies` \| blank | Informational (planning hints). |
| `active` | `yes` \| `no` | `yes` → shown in the student's course picker. `no` → hidden from the picker but still recognised when typed (old courses). |
| `last_offered` | text | Last term listed in Banner (informational). |
| `effective_term` | e.g. `Fall 2026` | First term this row applies. Keep old rows; add a new row with a later `effective_term` when a rule changes. For each course a student took, the app applies the newest row whose `effective_term` is not after that course's term; if every row is later than the course (e.g. everything says Fall 2026 and the course was taken in 2024), the **oldest row applies retroactively**, so old coursework still resolves. |
| `dgs_reviewed` | `yes` \| `no` | DGS's own checklist. Shown on the public course-rules page (`courses.html`) as Confirmed (`yes`) or Pending (anything else); the audit engine ignores it. |
| `notes` | text | Free text shown to the student on hover. Cite the § when relevant. |

A blank `counts_toward_*` on an active course makes the app say "needs DGS review" for that
course. The earlier sheets ("CSE Course Catalog" and "CSE Degree Requirement Rules") are
superseded by the Google Sheet CSE-Degree-Audit-Rules (built from `CSE-Degree-Audit-Rules.xlsx`).
The `*.sample.csv` files here show this exact schema in miniature (they double as the base rules
for the test suite's fixtures in `tests/fixtures/rules/`).

### Tab `Parameters` — every number the handbook states, so a future DGS can change it without code
| `key` | `value` | `handbook_section` | `notes` |
|---|---|---|---|
| `ms_regular_credits_min` | 24 | §3.2 | |
| `ms_project_credits_min` | 6 | §3.2 | CSE 68901 / 68902 |
| `ms_4xxxx_credits_max` | 6 | §3.2 | |
| `ms_noncse_credits_max` | 9 | §3.2 | |
| `ms_time_limit_years` | 5 | §3.3 | |
| `ms_thesis_readers_min` | 2 | §3.4 | thesis option only |
| `phd_regular_credits_min` | 24 | §4.2 | 60000-level or higher |
| `phd_total_credits_min` | 60 | §4.2 | "The graduate school requires a total of sixty (60) credits of courses and research for the Ph.D." |
| `phd_seminar_courses` | `CSE 63801, CSE 63802` | §4.2 | required in year one |
| `phd_4xxxx_cse_credits_max` | 6 | §4.2 | |
| `phd_noncse_6xxxx_credits_max` | 9 | §4.2 | |
| `phd_transfer_window_years` | 5 | §4.2 | prior M.S. coursework |
| `phd_residency_semesters` | 4 | §4.3 | consecutive, full-time, excluding summer |
| `phd_time_limit_years` | 8 | §4.3 | |
| `qualifier_deadline_semesters` | 4 | §4.4 | DGS may extend |
| `category_courses_required` | 3 | §4.4.2 | |
| `category_distinct_groups_required` | 3 | §4.4.2 | |
| `category_min_grade` | `B` | §4.4.2 | |
| `research_qualifier_deadline_months` | 18 | §4.4.3 | |
| `candidacy_deadline_semester` | 8 | §4.5 | before the end of the eighth semester |
| `candidacy_committee_additional_members_min` | 3 | §4.5 | beyond advisor/co-advisor |
| `gpa_min` | 3.0 | §2.2 | |
| `ms_total_credits_min` | 30 | §3.2 | |
| `phd_nd_credits_min` | 9 | §4.2 | at least nine credits at Notre Dame |
| `ms_transfer_completed_ms_credits_max` | 9 | §5.2 | completed prior M.S./Ph.D. |
| `phd_transfer_completed_ms_credits_max` | 24 | §5.2 | completed prior M.S./Ph.D. |
| `transfer_unfinished_ms_credits_max` | 6 | §5.2 | unfinished prior M.S. |
| `transfer_min_grade` | B | §5.2 | |
| `fulltime_credits_min` | 9 | §2.1.2 | |
| `rules_effective_date` | 2026-09-01 | | **Display only, optional override.** Normally leave it out: the pages print "The course rules here are up-to-date as of <date>" automatically — the date the six-hourly sync first saw the current sheet content (see `snapshot.json` below). Add this row only when the rules should carry a different date than the last edit — e.g. a change decided today that takes effect next term; then the pages print "Rules effective as of <date>" instead, for as long as the row exists. YYYY-MM-DD preferred (other text is shown as written). |

Add rows freely; the app ignores keys it does not know and warns (in the diagnostics panel)
about known keys that are missing — the affected requirement then shows "cannot evaluate"
rather than silently passing.

### Tab `Categories` — two lists side by side
Columns A–B hold the §4.4.1 core-knowledge areas, columns D–E the §4.4.2 specialization groups
(column C is empty). The app reads each pair by its header name. The codes `any` and
`ineligible` are reserved: valid on Courses rows, but never real matchable groups.

| `core_area` | `core_area_name` | | `category_group` | `category_group_name` |
|---|---|---|---|---|
| `os` | Operating Systems | | `alg` | Algorithms |
| `algorithms` | Algorithms | | `hcc` | Human Centered Computing |
| `architecture` | Computer Architecture | | `arch` | Architecture |
| | | | `dsai` | Data Science and Artificial Intelligence |
| | | | `sys` | Systems and Software |
| | | | `any` | (listed under every group — student picks) |
| | | | `ineligible` | Courses ineligible for qualifying examination |

### Tab `Changelog` (optional, human-only) — date, who, what changed. The app does not read it.

### Note rows
A row whose key cell is a plain-English sentence (and whose other cells are empty) is treated as
a human note and skipped silently — the real tabs end with such notes. Anything else malformed
is reported, with its row number, in the app's diagnostics panel.

### `snapshot.json`
Written by `npm run sync-sheet` (and the six-hourly Action): `{ schemaVersion, syncedAt, csv:
{ courses, parameters, categories } }` — the **raw CSV text** of the three tabs, so the app's one
parser handles live and fallback data identically, and each commit diff reads as "what the DGS
changed". The script leaves the file **untouched while the sheet content is unchanged** (line
endings and trailing whitespace ignored), so `syncedAt` is the moment the current rules were first
seen — that is the date the pages print as "The course rules here are up-to-date as of …"; when
the live sheet differs from this file they print "as of <today>" until the next sync. Google sends no
`Last-Modified` header for published CSVs (verified 2026-09-01), which is why the date comes from
here (`src/data/rules-date.ts`).

## Validation the app must do on load
- unknown value in an enumerated column → row is skipped and reported ("Courses row 14, column
  `course_type`: 'lecture' is not one of regular|seminar|research|independent|project")
- duplicate `course_id` with the same `effective_term` → reported
- missing required parameter key → reported, and the requirement that needs it is shown as
  "cannot evaluate — rules sheet is missing `<key>`" rather than silently passing
- a `core_area` or `category_group` value not in the `Categories` tab → reported
