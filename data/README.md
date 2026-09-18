# Rules data — the DGS-editable Google Sheet

Sheet: **CSE-Degree-Checking-Rules** (named CSE-Degree-Audit-Rules until 2026-09-05; owner: the current DGS; lives in the shared "DGS things (CSE)"
Drive folder under "Degree Audit App (Claude Code starter kit)"). The app reads it read-only at page load through Google's
"Publish to web" CSV links, and a GitHub Action snapshots it into `data/snapshot.json` every six
hours (committing only when the content changed) so the app still works if the sheet is ever
unpublished — and so the pages can say when the rules last changed.

## How the app reads the sheet
In the sheet: **File → Share → Publish to web → Link → choose one tab → Comma-separated values
(.csv)**. Do this once per tab. Each tab gets a URL of the form

    https://docs.google.com/spreadsheets/d/e/<PUBLISHED_ID>/pub?gid=<TAB_GID>&single=true&output=csv

The current URLs are in `data/sheet-urls.json` (Courses gid 922680330, Parameters gid 1921993253,
Categories gid 298683565); the app reads that file. The same file's `sheet_edit_url` is the
spreadsheet's ordinary (edit/view) link — since 2026-09-04 both pages show it in the masthead and
footer, labelled as accessible by faculty only (`src/ui/sheet-source.ts`), so if the sheet is ever
replaced, update that entry too. Note that Google serves these CSVs with the
numbers as plain integers (24, not 24.0) and blank cells as empty strings. Publishing makes the tab publicly readable by anyone
with the link — fine for course rules, which are already public policy. Nothing about students is
in the sheet.

Edits appear in the published CSV within about five minutes. Students see them on next page load.

## Tabs

### Tab `Courses` — one row per course the app knows about
Prefilled from the Banner sweep (`cse_courses.csv`, Aug 2026 — removed from the repo 2026-09-14, in git history): every CSE 4xxxx–9xxxx catalog
entry, latest version per course number (371 rows). Informational columns come from Banner;
policy columns are the DGS's.

| column | allowed values | meaning |
|---|---|---|
| `course_id` | e.g. `CSE 60641` | Department code, space, five digits. Primary key. |
| `title` | text | Shown in the autocomplete. |
| `level` | 4–9 | First digit of the number. **Not informational** — the app reads this cell in preference to the number itself, and it decides whether a course is refused outright (50000-level, unless the row permits it), whether it draws on §4.2's six-credit allowance for courses below the 60000 level, and whether a non-CSE course counts at all. A mistyped level silently changes the audit. |
| `credit_min`, `credit_max` | numbers | Banner credit range (informational). |
| `credits_default` | number or blank | What the app pre-fills; blank for variable-credit courses, the student enters the transcript value. |
| `course_type` | `regular` \| `seminar` \| `research` \| `independent` \| `project` | Only `regular` counts toward the 24 regular-course credits (§3.2, §4.2). Case and separators are forgiven (`Regular`, `Independent Study`), as in the verdict columns (2026-09-18). |
| `counts_toward_mscse` | `yes` \| `no` \| `dgs_approval` \| `adgs_approval` | The approval values name WHO signs off (2026-09-12): `adgs_approval` → the ADGS, `dgs_approval` → the DGS. Either way the app counts the course provisionally and tells the student to get that person's sign-off. Today MSCSE approvals are the ADGS's, but the cell — not the program — decides, so authority can move back course by course. |
| `counts_toward_phd` | `yes` \| `no` \| `dgs_approval` \| `adgs_approval` | same; today Ph.D. approvals are the DGS's. |
| `core_area` | `os` \| `algorithms` \| `architecture` \| blank | Which §4.4.1 core-knowledge area the course satisfies. |
| `category_group` | one or more of `alg` \| `hcc` \| `arch` \| `dsai` \| `sys`, or `ineligible` \| blank | Which §4.4.2 specialization group(s) the course belongs to. **Several are allowed** (2026-09-08): separate them with a semicolon — `hcc;dsai` means the course may fill EITHER group and the student picks which, so it can be worth a choice of two or three groups and not only one or all five. A course that belongs in EVERY group names all five (`alg, hcc, arch, dsai, sys`) — the old `any` shorthand was retired on 2026-09-18, and a cell that still says it is reported as a code the Categories tab does not define. `ineligible` = it can never satisfy §4.4.2; blank = not decided. Commas, slashes or spaces work as separators too, and the codes are case-insensitive. |
| `offered_now` | `yes` / `no` / blank | Is the course on the schedule THIS semester? Shown only while this row's `last_offered` names this semester — a course running now was last offered now (DGS, 2026-09-18). A row dated any other semester, or undated, shows nothing and is counted with its reason in the line under the cards (before 2026-09-18 a row dated LAST semester had its `offered_next` shifted onto this one, which could tag a spring-only course as a fall offering). The current semester comes from Notre Dame's date. The course-rules page shows it as a CARD at the top of the page, "Offered this semester — Fall 2026", listing those courses with their attributes, and as a filter on the table below. Blank means the sheet does not say — the course is simply not listed there, which is not a statement that it will not run. No column is added to the table; nothing outside that page reads it |
| `offered_next` | `yes` / `no` / blank | The same for the NEXT fall or spring |
| `typically_offered` | `fall` \| `spring` \| `both` \| `varies` \| blank | Informational (planning hints). Any other value is reported and ignored, rather than printed verbatim in the column (2026-09-18). |
| `active` | `yes` \| `no` | `yes` → shown in the student's course picker. `no` → hidden from the picker but still recognised when typed (old courses). Case does not matter (`No` is `no`, 2026-09-18). A retired course still appears in the qualifying-examination cards on the course-rules page, marked Retired, because it still counts for the students who took it (DGS, 2026-09-18) — but never on the schedule cards, and a row that is retired AND marked as offered is reported. |
| `last_offered` | a term: `Fall 2026` or `FA26` | **The last term this course was actually offered** (DGS, 2026-09-18) — prefilled from Banner, and **not informational**: it dates this row's `offered_now` / `offered_next`, which are shown only while it names the current semester. Set it in the same edit as those two cells. A row whose schedule cells are filled while this one is blank or unreadable is reported in the diagnostics. |
| `rules_effective_term` | e.g. `Fall 2026` or `FA26` | First term this row's RULES apply (renamed from `effective_term` 2026-09-14; the old header is still read). First term this row applies. Keep old rows; add a new row with a later `rules_effective_term` when a rule changes. For each course a student took, the app applies the newest row whose `rules_effective_term` is not after that course's term; if every row is later than the course (e.g. everything says Fall 2026 and the course was taken in 2024), the **oldest row applies retroactively**, so old coursework still resolves. |
| `dgs_reviewed` | `yes` \| `no` | DGS's own checklist. Shown on the public course-rules page (`courses.html`) as Confirmed (`yes`) or Pending (anything else); the audit engine ignores it. |
| `notes` | text | Free text shown to the student on hover. Cite the § when relevant. |

A blank `counts_toward_*` on an active course makes the app say "needs DGS review" for that
course. The earlier sheets ("CSE Course Catalog" and "CSE Degree Requirement Rules") are
superseded by the Google Sheet CSE-Degree-Checking-Rules (built from the seed spreadsheet `CSE-Degree-Audit-Rules.xlsx`, under its original name — removed from the repo 2026-09-14, in git history).
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
| `quarter_credit_factor` | 0.66 | §5.2 | quarter hours → semester hours — the DGS Handbook's §5.2 pro-rata table (quarter × .66; DGS 2026-09-12) |
| `trimester_credit_factor` | 0.88 | §5.2 | trimester hours → semester hours — the same table (trimester × .88) |
| `ms_transfer_window_years` | 5 | §3.2 | prior graduate coursework — §5.2's five-year window applies to the MSCSE too (DGS 2026-09-11) |
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
| `phd_senior_grad_credits_max` | 6 | §3.5 | **Parked — the app does not read this today.** It sized §3.5's transfer allowance for a 4+1's junior/senior-year 6xxxx courses, withdrawn on 2026-09-10 when the DGS took the question to the Graduate School (§5.2 criterion 2 is their rule). The row is kept so the value survives if they allow it; see the top of `docs/STATE.md`. Delete the row if they refuse |
| `ms_bs_double_count_credits_max` | 6 | §3.5 | how much of an MSCSE student's coursework may ALSO have counted toward their bachelor's degree — §3.5's "one or two 3-credit CSE courses", or their 40000-level equivalent (Graduate School via the DGS, 2026-09-10). The Ph.D. has no equivalent cap: its limit is that no course counts toward all three degrees |
| `cse_subject_codes` | `CS; CSCI; COMPSCI; CSE; CMSC; EECS; CSYE` | §4.2 | the subject codes that mean a CSE course on **another university's** transcript. §4.2 caps credits from outside CSE at nine wherever they were taken, and other schools spell the department every way there is. A code this list does not name counts against the allowance; an ExternalCourses `is_cse` cell overrides it for one course. Notre Dame's own courses are decided by their own subject, never by this list. With the key missing **or its cell blank**, no transferred course is placed inside or outside CSE and the allowance is not applied to any of them |
| `ms_transfer_completed_ms_credits_max` | 9 | §5.2 | completed prior M.S./Ph.D. |
| `phd_transfer_completed_ms_credits_max` | 24 | §5.2 | completed prior M.S./Ph.D. |
| `transfer_unfinished_ms_credits_max` | 6 | §5.2 | unfinished prior M.S. |
| `transfer_min_grade` | B | §5.2 | |
| `fulltime_credits_min` | 9 | §2.1.2 | |
| `rules_effective_date` | 2026-09-01 | | **Display only, optional override.** Normally leave it out: the pages print "The course rules here were last updated on <date>, and are up-to-date as of <day of reading>" automatically — the first date is when the six-hourly sync first saw the current sheet content (see `snapshot.json` below). Add this row only when the rules should carry a different date than the last edit — e.g. a change decided today that takes effect next term; then the pages print "Rules effective as of <date>" instead, for as long as the row exists. YYYY-MM-DD preferred (other text is shown as written). |
| `current_semester` | — | | **Deleted from the live sheet 2026-09-14** — each Courses row's `last_offered` dates its schedule columns instead. Not read if re-added. The semester this sheet as a whole is current for, written as the code the pages print — `FA26`, `SP27` (case and a space or hyphen do not matter, and the old `Fall 2026` form still reads). Fall or spring only: a summer code cannot date the schedule. The course-rules page reads `offered_now` / `offered_next` against it — so **when you move it forward, check those two columns**, or last semester's schedule is republished under this semester's name. A value that is neither is reported in the sheet diagnostics — the self-check page's diagnostics card and `npm run sync-sheet` — so a typo never passes silently. (It was called `offered_semester` for a few hours on 2026-09-09; that name is still read.) The course-rules page's two schedule cards name their semesters from today's date, so this is what tells it whether those columns are still current: the same semester → shown as recorded; the semester BEFORE this one → what was recorded as "next" is shown as this semester, and next reads "Not released yet."; missing, older or ahead → both cards say "Not released yet." Update it in the same edit as the columns. |
| `contact_dgs_name` | Taeho Jung | | **Display only, optional (2026-09-04).** The six `contact_*` rows are how a DGS handoff updates the pages without touching code: they set the names and addresses shown in the "Who to contact" card, the opening notice, and the review-request emails. A missing or blank row keeps the fallback baked into `src/ui/contacts.ts`. |
| `contact_dgs_email` | tjung@nd.edu | | Where error reports, feedback, and course review requests go. |
| `contact_adgs_name` | Aaron Dingler | | The Assistant DGS (MSCSE policies). |
| `contact_adgs_email` | adingler@nd.edu | | |
| `contact_grad_admin_name` | Cari White | | The Graduate Program Administrator ("Grad Admin" on the pages) — review requests are emailed to this person AND the DGS. |
| `contact_grad_admin_email` | csalmons@nd.edu | | |

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
seen — that is the date the pages print as "The course rules here were last updated on …"; when
the live sheet differs from this file they print "were updated after …" until the next sync. Google sends no
`Last-Modified` header for published CSVs (verified 2026-09-01), which is why the date comes from
here (`src/data/rules-date.ts`).

### `ExternalCourses` tab (optional — courses from other universities)
One row per course at ANOTHER university that the DGS has ruled on (feature
2026-09-01; sample: `external.sample.csv`). The app matches a student's uploaded
external courses against it by university + course id (case, punctuation,
diacritics and spacing are ignored). Enter the university's name in CAPITAL
ENGLISH exactly as its transcripts print it (decision 2026-09-03) — the
review-request emails students send contain tab-separated rows in this tab's
column order, ready to paste straight into the sheet.

| column | values | meaning |
|---|---|---|
| `university` | text | the institution's name in capital English, exactly as its transcripts print it |
| `course_id` | text | as printed there ("CS 50300", "30240233"); spaces/hyphens don't matter |
| `course_title` | text | for humans reading the sheet |
| `satisfies_core_area` | a `core_area` code, `none`, or blank | §4.4.1 core area the course covers — a match makes the student's core row **met**. `none` = decided, no core area (a core-sounding title then stops appearing in the review request); blank = not decided yet (the course stays in the review request) |
| `transferable_PhD` | `yes` / `no` / `dgs_approval` / `adgs_approval` / blank | §5.2, for a **Ph.D.** student. `yes` = pre-approved, though each student still makes the formal request (DGS recommendation + Graduate School approval). `no` = never transfers. `dgs_approval` / `adgs_approval` = this one needs an approval, so the app keeps it in the review request as an open decision and tells the student "needs DGS approval"; it does not ask them to argue the case, which is between the advisor and the DGS. Blank = not looked at for that program |
| `transferable_MSCSE` | the same four values, or blank | The same question for an **MSCSE** student, answered separately (2026-09-09). The app reads whichever column matches the student's own program. The two approval words mean the same thing for now and both read as "needs DGS approval"; the sheet's own word is kept, so the MSCSE message can name the ADGS later without another sheet change |
| `is_cse` | `yes` / `no` / blank | Is this a **CSE course**, for §4.2's nine-credit allowance for courses "taken from a department other than CSE"? Fill it in only where the subject code cannot settle it — `ECE` is a computing department at one university and a circuits department at another. Blank = the `cse_subject_codes` parameter decides; this cell wins over it (2026-09-09) |
| `nd_credits` | number or blank | A **fixed** Notre Dame credit value for this one course (§5.2 pro-rata). Overrides everything. Use it only when one number is right every time — it cannot describe a course that is worth 2 credits one term and 4 the next; `credit_system` handles those. Blank = credits as printed, unless `credit_system` says otherwise |
| `credit_system` | `quarter` / `trimester` / `semester` / blank | The system this **university** awards in. `quarter` / `trimester` convert whatever the student's own transcript prints by the Parameters tab's `quarter_credit_factor` / `trimester_credit_factor` (§5.2 pro-rata), so a course whose credits vary converts correctly every time. Set it on any one row of a university and it applies to every course from that university, listed here or not. Blank = credits count as printed |
| `decided_on`, `notes` | text | for the record |

Anything a student uploads that has NO row here shows "not yet reviewed by the
DGS" (never guessed), and the student gets a copy-ready email request — that is
how this tab grows.

**Notre Dame coursework from an EARLIER Notre Dame degree** (2026-09-05 — a
combined transcript: a Notre Dame B.S. or a prior Notre Dame M.S. before the
current program) is filed under the university name `UNIVERSITY OF NOTRE DAME`.
Its §4.4.1 core area comes from the **Courses tab** (the course's `core_area`
applies whenever the course was taken — add the course there if it is missing),
so no row is needed here for core knowledge; a row here is only for
pre-approving the §5.2 transfer of a prior Notre Dame graduate course
(`transferable`), which the handbook treats like any other prior-program transfer.

**Two rows for the same university + course** (say, a decided row pasted below an older blank
one): the **last** row wins — it replaces the earlier one — and the diagnostics warn so the older
row can be deleted (DGS decision 2026-09-06). Blank verdict cells mean "not decided yet"; the
course stays in the students' review request until `transferable` and, for a core-sounding title,
`satisfies_core_area` (a core area or `none`) are filled in. A `dgs_approval` row is a decision
about the COURSE, not about the student, so it keeps the course in the review request — that is the
point of the value: the DGS wants to see each student's case for it.

**One-time setup:** create the tab, publish it to the web as
CSV (File → Share → Publish to web → ExternalCourses → CSV) and paste the URL
into `sheet-urls.json` as `external`. Until then the app runs without it.

## Validation the app must do on load
- unknown value in an enumerated column → row is skipped and reported ("Courses row 14, column
  `course_type`: 'lecture' is not one of regular|seminar|research|independent|project")
- duplicate `course_id` with the same `rules_effective_term` → reported
- missing required parameter key → reported, and the requirement that needs it is shown as
  "cannot evaluate — rules sheet is missing `<key>`" rather than silently passing
- a `core_area` or `category_group` value not in the `Categories` tab → reported
- **a Courses COLUMN that has been renamed or deleted → reported, naming the column and the headers
  that are there** (2026-09-18). Before that, renaming `counts_toward_phd` made every course read
  "Not yet decided" and renaming `active` brought every retired course back, both silently. Extra
  columns are still fine and the order still does not matter — only a missing expected name is
  reported.
- `category_group` saying `ineligible` AND naming a group → reported (`ineligible` wins)
- a row marked `active = no` whose `offered_now` / `offered_next` says `yes` → reported
- two `core_area` or `category_group` codes sharing a NAME → reported (two identical headings and
  two identical filter choices otherwise)
- a `Categories` tab with no core areas, or no specialization groups, fails the load like an empty
  tab instead of rendering a page whose §4.4.1 section is silently empty (2026-09-18)
