# Handoff for future Claude Code sessions

You are working on a built, tested, deployed app — not a greenfield project. This file is the
context capsule from the session that built it (Aug 2026, with DGS Taeho Jung answering the
policy questions). Read `CLAUDE.md` first (constraints), then this, before changing rule logic.
The git log is narrative — commit messages explain each step's reasoning.

## State of the world (as of 2026-09-01)

Complete and verified: engine (§2/§3/§4 requirements, 31 requirement rows), sheet loader with
plain-English diagnostics + a student-chosen snapshot fallback, UI (loading card, form, course
table, transcript upload, report), 70+ tests, GitHub workflows (test/deploy/sync-sheet), docs (README, MAINTENANCE,
data/README, DECISIONS, LICENSE). An adversarial multi-agent review confirmed 25 defects; all
fixed with regression tests.

Repo is pushed and public: https://github.com/tjungND/ND-CSE-Degree-Requirement-Progress-Checking.
CI note: the first two pushes (2026-08-31, 2026-09-01) FAILED in the `build` job because the test
script was `node --test tests/` — Node 24's runner does not accept a directory ("Cannot find
module …/tests"). Fixed 2026-09-01 to `node --test "tests/**/*.test.ts"` (60/60 pass on Node 24
and 22). Nothing was deployed to Pages until that fix landed.

2026-09-01 doc changes (no code): `DGS-READ-THIS.md` was replaced by a root `README.md` written
for two kinds of DGS — Track A (sheet edits, no code) and Track B (changing the app with Claude
Code or Codex, step by step); `LICENSE.md` added (University of Notre Dame dual license: free
non-commercial, paid commercial via the IDEA Center — leave it alone unless the DGS asks);
`AGENTS.md` added so Codex reads the same rules as `CLAUDE.md`. Keep `CLAUDE.md` and `AGENTS.md`
consistent when either changes.

Known-pending (the app's diagnostics panel is the live truth):
- Sheet: the 7 Parameters rows and the 3 mistyped Courses rows (`CSE 98900`, `CSE 68900`,
  `CSE 87701`) were fixed by the DGS on 2026-09-01, `CSE 44901` (now dgs_approval for both
  degrees, inactive) and the last blank verdicts on 2026-09-03 (all verified against the live CSV).
- GitHub Pages is live at https://tjungnd.github.io/ND-CSE-Degree-Requirement-Progress-Checking/
  (Settings → Pages → Source: GitHub Actions; deploy green since 2026-09-01) — link it, and
  `courses.html`, from cse.nd.edu.
- The sheet's own README tab pointed to `src/data/sheet-urls.ts`; fixed by the DGS 2026-09-03 —
  it now says `data/sheet-urls.json` and lists ExternalCourses among the tabs to publish.
- Google's published-CSV endpoint intermittently HANGS (no response at all): seen 2026-09-01
  from a GitHub runner (the first sync-sheet run timed out at 30 s) and from a browser (one
  request hung past 20 s, the next three took ~300 ms). `scripts/sync-sheet.ts` therefore fetches
  sequentially with 3 attempts × 60 s and the workflow logs a curl reachability line per tab;
  the browser loader keeps its single 12 s attempt and falls back to the snapshot with the banner
  — by design, since the snapshot is now at most ~6 h behind. The DGS ran `npm run sync-sheet`
  locally and committed the snapshot that day (2c13949).
- Working copies are ordinary git clones OUTSIDE any Drive/OneDrive/Dropbox folder (since
  2026-09-02; e.g. `~/degree-audit-app`), with GitHub as the sync between machines. The repo
  previously lived in a Drive-synced folder and Drive damaged `.git` four ways in two days —
  the war story and the repair commands are in `MAINTENANCE.md` § repo peculiarities. The old
  Drive folder is retired; never run git or npm in it.

## Non-obvious engineering decisions (and why — don't undo these casually)

- **Tests run on `node --test`, not vitest.** The repo once lived under a folder named
  `FY26-27 (DGS: Taeho Jung)`; the colon corrupted npm's PATH and broke vite-node's module
  URLs. The folder was renamed, but the dependency-free runner was kept. Node ≥ 24 runs the
  `.ts` files directly — hence the explicit `.ts` extensions on all relative imports
  (`allowImportingTsExtensions`). Vite still does dev/build.
- **`data/snapshot.json` stores raw CSV text**, not parsed JSON: one parse/validate path for
  live and fallback data, and each sync commit diff reads as "what the DGS changed". Since
  2026-09-01 the sync (every 6 hours) leaves the file untouched while the content is unchanged
  — that is what makes `syncedAt` mean "when the current rules were first seen" (next bullet
  but one) — and commits + `gh workflow run deploy.yml` only on a real change (a `GITHUB_TOKEN`
  push never triggers `on: push`; `workflow_dispatch` is GitHub's documented exception).
- **Status algebra** (`src/engine/status.ts`): every credit has a certainty tier —
  `definite` (passed + sheet says yes/attested) > `in_progress` (IP) > `provisional`
  (dgs_approval / unknown / non-CSE / transfer). A threshold row's status is the certainty of
  the worst credit actually needed; missing parameter ⇒ `cannot_evaluate` via typed accessors
  returning `undefined` (never a guessed default — a blank cell is NOT zero).
- **Cap allocator** (`src/engine/allocate.ts`) works at CREDIT granularity and is
  order-independent (the prototype's worst bug was entry-order-dependent verdicts — pinned by
  a permutation test). Greedy fill is provably optimal while every course touches ≤ 1 cap
  (true since the DGS ruled non-CSE 4xxxx counts nothing); a tiny exact search handles any
  future multi-cap case.
- **§4.4.2 distinct groups** use Kuhn's bipartite matching (`matching.ts`) so an `any`-group
  course (Research Methods) lands on the group the student is missing; a student's pinned
  choice is honored and a suggestion is emitted if suboptimal.
- **`effective_term` resolution**: newest Courses row not after the COURSE'S term; if every
  row is later (all 371 live rows say Fall 2026), the OLDEST row applies retroactively —
  without that fallback every pre-2026 course would resolve to nothing.
- **Reserved `category_group` codes**: `any` and `ineligible` (`RESERVED_GROUP_CODES` in
  `src/data/types.ts`) are valid on Courses rows but never matchable groups. The DGS marks all
  40000-level courses `ineligible`. If you see a sixth "group" appear in matching, this broke.
- **Retakes** (§4.4.2): only ND rows dedupe (foreign transfer ids can collide); the counted
  attempt is the last PASSING final, else a live IP retake, else the last failed one (which
  earns nothing — F/U earn zero credit by DGS decision).
- **Transcript upload** (`src/transcript/`): pdfjs-dist is the ONLY runtime dependency,
  lazy-loaded as its own chunk so the main bundle stays ~170KB. The parser handles Banner 8
  ("INSTITUTION CREDIT") and Banner 9 ("Institutional Credit") wording, ND's official-PDF
  layout (credits BEFORE grade: `BIOS 60574 Title 3.000 B+ 9.999`), Banner term codes
  (YYYY00=Summer, YYYY10=Fall, YYYY20=Spring of YYYY+1), and ND markers that may exist only
  in the browser print footer (an nd.edu URL). Image-only screenshot PDFs (students are
  literally instructed to screenshot by some ND offices) get a "print to PDF instead"
  message, NOT the not-ND rejection. **Never built against a real ND transcript** — parsed
  courses always preview for student confirmation, so format drift degrades safely; with a
  real sample, tighten `parse.ts` + its tests.
- **UI safety**: all user text renders via `textContent` (the old prototype had an innerHTML
  XSS); imports are deep-validated and a failed render never persists (no localStorage brick);
  "today" is computed in LOCAL time (UTC audited evening users as tomorrow).
- **Beta disclaimer + handbook link** (2026-09-01, DGS decision): `src/ui/handbook.ts` holds
  the edition, the official PDF URL, `handbookLink()` and the `BETA_NOTICE` wording; rendered as
  the `.banner.beta` under the masthead, the `.legal-beta` footer paragraph, and two lines in
  the copied summary. Remove the banner (not the footer) when the DGS declares the app out of beta (renamed from alpha: DGS, 2026-09-03).
- **Contacts, feedback address, license line, "untested upload" note** (2026-09-01, DGS
  decision): `src/ui/contacts.ts` holds the DGS / Assistant DGS / Graduate Program Administrator
  entries, the repo + LICENSE URLs, `reportToDgs()` and `contactCard()`; rendered as the
  "Who to contact" card at the top right of the masthead on BOTH pages (the masthead is a
  two-column grid: text | card; tools row spans below; single column under 900px), the footer
  "License" line, the feedback sentence in the beta banner + footer, and the `.untested-note`
  under the transcript-upload button. The beta banner also states in bold that every verdict is
  computed from the published course rules (linking to `courses.html`). Update `contacts.ts` at every DGS handoff;
  the untested note was RETIRED 2026-09-03 (the import buttons carry the version tag — "(alpha)" since 2026-09-04 — and the
  page-level privacy banner sits right under the beta notice); real-ND-transcript testing is
  still worth doing (by a human, locally — FERPA: never paste a student's transcript into an AI tool).
- **Public course-rules page** (`courses.html`, 2026-09-01, DGS request): `src/ui/courses-page.ts`
  renders the Courses tab for students — overview cards per §4.4.1 core area and §4.4.2 category,
  then a filterable/sortable table (id, title, type, counts toward MSCSE/Ph.D., core area,
  category, typically offered, DGS reviewed). It uses the SAME loader (`loadLiveRules` via
  `loadRulesWithCard`) and shows, per
  course, the row in effect this term (`resolveRuleRow` with `termOfDate(today)`); retired rows are
  hidden unless the visitor ticks "Include retired courses". `dgs_reviewed` is now parsed into
  `RuleCourse.dgsReviewed` for this page only — the engine still ignores it. E2E suite
  "course rules list" screenshots it and checks a filter. Add columns here, never new policy.
  Its banner is the OFFICIAL wording (DGS, 2026-09-01): the mappings are set by the DGS with
  faculty input and are what the DGS and the Graduate Program Administrator use; it is not
  labelled beta (only the self-check tool is). It also says not every listed course is offered.
- **Dated line under each title** (`rulesDateLine()` in `src/ui/handbook.ts`, 2026-09-01):
  precedence (1) optional Parameters row `rules_effective_date` (a `DISPLAY_PARAMETER_KEYS`
  entry: known, optional, silent when missing, never an engine input) → "Rules effective as
  of …"; (2) `Rules.rulesDate` from `src/data/rules-date.ts` — the live CSV texts are compared
  (line endings / trailing whitespace ignored) with the bundled `data/snapshot.json`: identical →
  `{kind:'known', at: snapshot.syncedAt}` → "The course rules here were last updated on <that
  date>, …"; different → `{kind:'after', …}` → "… were updated after <that date>, …" plus a
  diagnostics warning that explains the ~6-hour window and what to check if it persists; the
  snapshot fallback is always `known`; (3) nothing dated (rules built without a snapshot, i.e.
  tests) → "… are those in effect for <term>, …". Every variant ends ", and are up-to-date as of
  <Y>." where Y = today (local calendar date) when `rules.source` is `live`, else the snapshot's
  `syncedAt` day. DGS wording decision 2026-09-01 (final form after two rounds): exactly this
  sentence, no course counts on that line.
- **Loading card + reload-first failure handling** (`src/ui/loading.ts`, DGS decisions
  2026-09-01): while rules load, both pages show a card — step list (connect / course list /
  parameters / categories / dating), each step ticking with its row count, a bar against the
  15-second budget (`FETCH_TIMEOUT_MS` in `src/data/load.ts` — keep the card's wording and this
  constant in step) and an elapsed counter. On failure `loadLiveRules` throws `RulesLoadError`
  (kinds: timeout / unreachable / http / unpublished / empty; `retryable` says whether reloading
  can help). The card then explains in plain words and suggests RELOAD first; the saved copy
  (`rulesFromSnapshot`) is a second-choice button, never automatic — the DGS chose "suggest
  reloading instead of showing the saved copy". For non-retryable kinds (unpublished/empty —
  reloading cannot help) the saved-copy button comes first. The snapshot banner now says "You
  chose to continue with the copy saved on …". E2E: the sandbox has no network, so every run
  exercises this path — `cdp.mjs`'s `open()` waits for the masthead OR the failed card, requires
  the card to mention reloading, screenshots it once (`loading-failed.png`) and clicks through.
- **Beta ≠ inaccurate rules** (`RULES_ACCURACY_NOTICE` + `BETA_SCOPE_NOTICE` in
  `src/ui/handbook.ts`, DGS wording 2026-09-01): the banner, footer and copied summary now state
  in bold that the course rules are accurate — exactly the rules the DGS and the Graduate
  Program Administrator use to determine requirement satisfaction — and that what is in beta is
  the TOOL's application of them. Don't reintroduce wording that hedges on the rules themselves.
- **Approval gate + detail philosophy + along-the-way gate** (2026-09-03, DGS): `.consent-overlay`
  in `startApp()` shows on EVERY visit until Agree (not stored; cdp.mjs `open()` auto-dismisses it
  in e2e). Detail philosophy: MET rows explain how, unsatisfied rows show only progress (rules
  live behind the § chips). `msAlongTheWayRow` needs candidacy passed AND
  `ms_regular_credits_min` regular credits at ND (`alloc.ndRegular.definite`; scenario
  phd-ms-along-the-way). Unreviewed undergrad courses whose titles match `CORE_TITLE_RE` in
  app.ts (algorithm/operating/architect — DGS keywords) join the review request. A graduate
  conferral line on a Master's/Ph.D. transcript (`degreeConferred` in
  `parseExternalTranscript`, positive evidence only) sets priorMs='none'→'completed' on add.
- **Combined transcripts + Notre Dame as a previous institution** (2026-09-05, the corner cases
  the DGS listed): `parseExternalTranscript` now returns a per-row `level` ('undergraduate' |
  'graduate') from a `UG|UGRD|GR|GRAD` cell right after the code (stripped before tokenizing),
  a level block (`LEVEL_BLOCK_RE`: "Level:", "Term Totals (…)", a bare "(Undergraduate)" line,
  "College: Graduate School" — never a line that merely starts with "Graduate …"), or a DATED
  bachelor's conferral (`bachelorsConferredOn`; rows in terms ≤ that term are undergraduate);
  `mixedLevels` when both appear. `external-upload.ts`: `PreviewRow.level` (default =
  `slotDefaultLevel(slot)`), a "Taken as" `select.row-level` per row, `degreeLevelFor(slot,
  level)` on add (undergraduate → bachelors whatever the slot; graduate → masters, or phd in the
  Ph.D. slot), `registeredLevel` kept on Notre Dame rows, prior-study inference on ANY graduate
  row; `keepRelevantRows(university, rules, rows, mixed)` unticks-but-keeps (`irrelevant`) on a
  mixed transcript and omits on a single-level undergraduate one; a Notre Dame course counts as
  relevant when the Courses tab tags it with a core area. A Notre Dame transcript in a previous
  slot is parsed by `parseTranscript` (university `NOTRE_DAME`, `notreDame: true` → the
  `.nd-prior-note`; the OCR path still redirects). `verdictsBlock` shows the Courses-tab core
  area for prior ND rows ("(course rules)"); app.ts's review request lists prior ND courses under
  Notre Dame ("Notre Dame, before entry") as Courses-tab rows when unlisted. CSS: `.layout`'s
  first column is `minmax(0, 1fr)` and `.transcript-preview` scrolls horizontally, with per-field
  widths so the eight preview columns fit at 1400px. Fixture `combined-transcript.pdf`
  (Purdue B.S. conferred May 2024 + M.S. May 2025); e2e steps 7 (combined into the freed
  Master's slot: levels/ticks, toast "(2 undergraduate, 2 graduate)", prior study completed,
  two Purdue groups) and 8 (the ND fixture in the Ph.D. slot). COVERAGE_NOTICE re-worded.
- **Entry term read from the transcript; prior Notre Dame coursework** (2026-09-05, student
  bug report: a combined ND transcript — eight undergraduate semesters — showed 13 consecutive
  semesters and deadlines 8 years from "this fall"). Root cause: `Student.entryTerm` defaulted
  to the current fall and nothing ever set it; residency counted every `origin:'nd'` term.
  Now `parseTranscript` returns `entryTerm: EntryTermInference` (`inferEntryTerm`, exported:
  stated admit term → latest graduate-level "Student Type: New" term → first graduate-level
  term → after the last awarded degree → earliest; `how` is the plain-English source shown on
  the standing card; `alternative` names the other reading when a degree is awarded between
  graduate-level terms — earlier term kept, earlier deadlines being the safe error),
  `degreesAwarded` (name/level/date; "Sought"/"Current Program" never count) and a per-row
  `level` (UG → undergraduate; GR/PR/LW/EM/GB → graduate; else the term's "Term Totals
  (Graduate)"/"College: Graduate School"/"Level:" block; else the course number, 5xxxx unknown).
  The ND preview offers the term as a ticked checkbox (`.use-entry-term`); on add, app.ts sets
  `entryTerm` + `entryTermInferred: {how, alternative}` (also `{how:'assumed'}` on a fresh
  record — `validateStudent` never lets a saved file inherit it) and the standing card shows
  the `.entry-note` warning until the dropdown is touched (`setEntry` clears the flag and calls
  `reclassifyNotreDameCourses`). `src/ui/prior-nd.ts` (pure): a Notre Dame course dated before
  the entry term becomes origin 'transfer' / institution `NOTRE_DAME` ("University of Notre
  Dame", `src/data/external.ts`, with `isNotreDameInstitution`) / `degreeLevel` from
  `registeredLevel` (new CourseEntry field) or the number — and back to 'nd' when the entry
  term moves earlier. Engine: `residency.ts` counts only terms ≥ `student.entryTerm`
  (overrides too); `allocate.ts` + `coreRows` let a prior ND course satisfy §4.4.1 through the
  Courses tab's core_area with no ExternalCourses ruling (line "a Notre Dame course listed in
  the course rules"); prior ND graduate courses are ordinary §5.2 transfers (rulings under
  UNIVERSITY OF NOTRE DAME). The coursework card heads them "Notre Dame, before entering the
  program — undergraduate/graduate coursework"; the Bachelor's/Master's slot rows show and
  Remove them. `advisorSummary` adds a DEADLINES block (date order, "counted from <entry
  term>") and "Due by <date>" / "overdue — was due by <date>" per requirement line, with a
  Deadline column in the HTML tables. Tests: transcript.test.ts (COMBINED fixture),
  prior-nd.test.ts, scenario phd-nd-undergrad-before-entry, advisor-summary.test.ts,
  engine-units (residency guard); the e2e ND fixture is now a combined transcript (B.S. awarded
  May 2026, two UG terms) and step 2 checks the checkbox, the prior-row ticks, the standing-card
  note and the full-time term list; step 3b removes the prior ND course via the Bachelor's slot.
- **Transcript sanitizers** (2026-09-05, DGS request — he has many sample transcripts to share
  once de-identified): `scripts/sanitize/rules.mjs` is the ONE rule set (deterministic per
  document via a seeded PRNG: same word → same scramble; year offset ±1..8; grades always
  change; credit-like decimals kept unless on a GPA/totals line; subject code + first digit of a
  course number kept; institution runs kept whole — decided PER RUN for PDFs so a watermark tile
  on the same baseline cannot shield a name, per OCR line for scans). `sanitizeRuns(runs,
  pageWidth)` first splits two-column pages with the app's own `findColumnGap` (exported from
  layout.ts; watermarks dropped before locating the gap) so a left row never borrows a
  right-column totals context. `pdf-io.mjs` reads pdfjs runs (`rotated` set like pdf.ts) and
  rebuilds a Courier PDF with each run at its position, horizontally scaled (`Tz`) to the
  measured width, same rotation; `.d.mts` files type both modules for the tests.
  `scripts/sanitize-transcript.mjs` (`npm run sanitize`) is the CLI, also `--words in.json
  out.json` for the scan tool; `scripts/sanitize/ocr-words.mjs` OCRs a page image with
  tesseract.js + public/ocr (cacheMethod none — never writes the model into the repo);
  `scripts/sanitize-scan.py` (Pillow; PyMuPDF for PDF input) paints changed words over the
  local background and redraws them. `tests/sanitize.test.ts` locks the rules and proves
  fidelity: the sanitized watermarked fixture re-reads with the same upright-run geometry
  (pdfjs may split a rebuilt two-word cell — tolerated), same 10 rows, same columns and
  transfer count, shifted years, changed grades. Outputs are git-ignored.
- **Text watermarks** (2026-09-05; UMass Amherst / Western Ontario transcripts repeat the
  university's name across the page and read 6 / 0 courses): `dropWatermarks()` in layout.ts
  runs BEFORE `splitColumns` (tiles also broke the column split). Signals: `Run.rotated` (pdf.ts
  sets it from the transform's b/c) and a ≥6-letter phrase repeated ≥6× on the page at ≥3 x
  buckets (4 units) — dropped only at x buckets where it occurs ≥2×, so a lone genuine header
  with the same words stays. `tests/fixtures/banner-watermarked-transcript.pdf` (tiles at three
  x's every 37 units, gray 0.85, plus a 28pt 30° banner) must extract byte-identically to the
  clean fixture — the e2e asserts the same ids. `npm run diagnose -- file.pdf`
  (`scripts/diagnose-transcript.mjs`) is the FERPA-safe way to see a real transcript's shape.
- **Banner two-column transcripts + Notre Dame markers** (2026-09-05, from the DGS's own IIT
  transcript): `src/transcript/layout.ts` (pure, unit-tested) turns pdfjs runs into lines —
  `splitColumns()` detects a two-text-column page (a ≤2%-crossing vertical band at 40–60% of
  the width, both sides ≥30% of the runs, and a WORDY right edge: ≥5 runs with a four-letter
  word — a one-column table's right half is numbers/grades, so it never qualifies; decorative
  rules and "CONTINUED ON NEXT COLUMN" banners are ignored when counting crossings) and reads
  left column then right; `repairStraddlers()` handles pdfjs merging a left cell with the right
  column's text into ONE run ("PTS R Fall 2013") by handing a trailing term header to the right
  column. `pdf.ts` now passes the page width and calls `runsToLines`. `nd-markers.ts`
  `looksLikeNotreDameTranscript()` is shared by parse.ts (reject) and external.ts (redirect):
  e-mails are stripped first, "Notre Dame, IN" addresses don't count. external.ts: `leadCode`
  joins split SUBJ / NO. cells ("CS   455"), the "TRANSFER CREDIT ACCEPTED BY" block is skipped
  and counted (`transferRowsSkipped` → preview note), `asCredits` accepts 0, connector tokens
  ("&") stay in titles, candidates carry `season`, and `guessUniversity` scans cells of every
  line (header first, strong words first, Banner "College :" labels and "College of …"
  divisions excluded). Fixture `tests/fixtures/banner-transcript.pdf` (positioned runs,
  invented "Example Institute of Technology", an nd.edu e-mail in the header) drives an e2e leg
  (Ph.D. slot: 10 rows, transfer note, institution from the legend page); the same lines are
  locked in `tests/banner-transcript.test.ts`. On the real transcript: 26/26 rows, every term
  right, 7 transfer rows skipped. To extract lines in Node for such a diagnosis, mirror
  `pdfToLines` with `pdfjs-dist/legacy/build/pdf.mjs` (pdf.ts itself has a Vite `?url` import)
  and feed `runsToLines` — never commit the transcript.
- **Advisor summary: unmet names in red bold** (2026-09-04, DGS): in `advisorSummary()`
  (report.ts) the HTML `table()` helper now takes cells that are either plain strings (escaped)
  or `{ html }` (pre-escaped markup); `titleCell(r)` wraps a status-`unmet` title in
  `<strong style="color:#a81e14;font-weight:bold">` (inline — email clients drop stylesheets;
  the hex is the page's `--bad`), and the text flavor's `line()` wraps the same titles in `**…**`.
  Only `unmet` qualifies (DGS: needs-review / cannot-evaluate / in-progress are not "not met").
  Locked by `tests/advisor-summary.test.ts` (hand-built AuditReport — advisorSummary is pure
  string building, so no rules or DOM are needed).
- **Rules-spreadsheet link, faculty-only note** (2026-09-04, DGS): `src/ui/sheet-source.ts`
  exports `SHEET_NAME`, `SHEET_EDIT_URL` (read from `data/sheet-urls.json` `sheet_edit_url` via a
  JSON import WITH `with { type: 'json' }` — required because `node --test` also loads the module;
  `src/data/load.ts` imports the same file without the attribute and is only ever bundled by
  Vite), `sheetLink()`, `sheetSourceLine()` (the `p.effective.sheet-source` line under each
  masthead's dated line — the dated sentence itself is untouched per the 2026-09-01 decision) and
  `sheetSourceNote(page)` (footer paragraph children — SHORT by DGS decision the same day: the data
  come from the DGS's rules spreadsheet (link), created based on the handbook (`handbookLink()`),
  bold "accessible by faculty only", and a cross-link to the course rules page / "this page shows
  the same rules"; the four-tab description was dropped — don't bring it back).
  app.ts wraps it in `div.legal-source` ("Where the rules come from."); courses-page.ts splices
  it into its existing "Source." paragraph. `tests/sheet-source.test.ts` pins the URL to the JSON
  and rejects published-CSV shapes; e2e `checkSheetLink()` in drive-app.mjs asserts exactly one
  masthead + one footer link per page, sheet-name text, "faculty only" nearby, new-tab rel.
- **Sheet-driven contacts + nested detail bullets + PDF caveat** (2026-09-04, DGS): the six
  `contact_*` DISPLAY_PARAMETER_KEYS (data/README.md) feed `applyContactOverrides()` in
  contacts.ts — called at the TOP of startApp() and renderCoursesPage(), before anything renders
  (the consent notice shows `Prof. ${DGS.name}`); it mutates the CONTACTS objects in place so the
  DGS/GRAD_ADMIN references stay valid, and missing/blank keys keep the baked-in fallback (a DGS
  handoff = sheet edit; refresh the fallback occasionally). `DetailPart` may be
  `{lead, items}` — joinedDetail flattens it to "lead: a; b; c" for `detail` (test-stable) and
  report.ts renders it as a two-layer list (`.detail-sublist`, one sub-bullet per item); used by
  approvalsRow and categoriesRow. BETA_SCOPE_NOTICE now carries the "transcript-PDF import …
  highly inaccurate" caveat, and since 2026-09-05 ends with `COVERAGE_NOTICE` ("Not all cases are
  covered yet — for example, …"; the examples were the 5+1 / same-institution cases until those
  were handled later that day — now unseen layouts and combined records that do not tell the
  levels apart), which the consent overlay shows as its own paragraph; the feedback line on the
  self-check page says error reports, suggestions and feedback are all welcome. tests/contacts.test.ts locks the key names.
- **Alpha label, undergrad relevance filter, ndResearch gate, bulleted details** (2026-09-04, DGS):
  the banner and import buttons say ALPHA again. `CORE_TITLE_RE` moved to
  `src/engine/core-title.ts` (plus `coreTitleSuggestion` naming the suggested area); the classifier's
  bachelors line now leads with the core-knowledge story ("satisfies the X core-knowledge
  requirement… — confirmed by the DGS" / "title suggests…" / plain "not counted — undergraduate
  credits never transfer"). Undergraduate imports are FILTERED at the preview
  (`keepRelevantRows` in external-upload.ts: core-title match or ExternalCourses ruling; the note
  counts what was left out), and the coursework card hides non-relevant bachelors rows the same
  way (old saved files keep them in data). The transfer card ignores bachelors entirely
  (transferRow filter). `alloc.ndResearch` (rule.courseType research|project, ND origin) feeds the
  along-the-way MSCSE: candidacy + ms_regular_credits_min ND regular + ms_project_credits_min ND
  research credits (research = research/dissertation + thesis-project direction; independent study
  excluded). `RequirementResult.detailParts` + `joinedDetail()` (context.ts) let report.ts render
  long multi-part details as a bulleted list (>120 chars, >1 part); `detail` stays the joined
  prose for the advisor summary and tests. External parser (2026-09-04): lowercase codes accepted
  (with a term/summary stopword guard), numeric grades (85, 9.5) kept as rawGrade, and two-line
  rows (code+title / numbers) merged; conferral wording also accepts "complet…" with a
  not-completed/incomplete guard.
- **Inferred prior study + deadline dedupe + free-flowing report** (2026-09-04, DGS): a graduate
  transcript WITHOUT a conferral line now sets priorMs='none'→'unfinished' on add (conservative
  §5.2 cap) and flags `Student.priorMsInferred`; the standing card shows a warning while
  inferred-unfinished ("pick Completed if you earned it"), the dropdown's onchange clears the
  flag (student's choice wins), and the slot Remove handler resets priorMs→'none' when the flag
  is set and no masters/phd transfer courses remain. Rows with a deadline chip keep their
  in-progress detail EMPTY (candidacy, qualifier umbrella, both time limits — the chip carries
  the when); overdue says "Overdue — talk to the DGS" with no policy prose. "MSCSE awarded
  along the way" has no "(information)" suffix (still `informational: true`). `.audit-col` is
  plain `min-width: 0` — no sticky/max-height/inner scrollbar; don't reintroduce them. The
  courses page's offered-note says active ≠ currently offered.
- **Rules on the output side + advisor summary** (2026-09-03, DGS): every requirement card's §
  chip is a button revealing `.rule-quote` — the handbook sentence from `citation.quote`; the
  input-card intros stay lean (no policy prose). `advisorSummary()` in report.ts replaces
  `summaryText()`: {text, html} clipboard flavors via `copyReviewRequest`, subject + greeting,
  standing line (program/entry/prior study/GPA), requirements grouped attention-first with
  details, courses as counted, notices. Button: "Copy summary for your advisor". **Google sends NO Last-Modified (and no ETag) for published CSVs** — verified
  2026-09-01 by fetching all three tabs from the deployed page's own origin (exposed headers:
  cache-control `private, max-age=300`, content-disposition, content-type, date, expires, server)
  — so the sync's own record is the only zero-setup date source; the earlier header-reading
  code was removed. Tests: `tests/rules-date.test.ts`.
- **External transcripts** (2026-09-01; since 2026-09-03 all four imports live in the single
  "Transcripts" card composed by `transcriptsCard()` in app.ts — ND row + the three
  prior-university rows from `priorTranscriptSection()`; the card is FIRST on the page, "start
  here", and imports are one-at-a-time: while any preview is open, `importsBusy()` +
  the ND-preview state disable every import button until it is confirmed or cancelled. The
  "Coursework" card (retitled from "Coursework at Notre Dame" 2026-09-03) groups the list by
  university AND degree — "Notre Dame" first, then one `h3.subhead` + table per
  (university — transcript slot); the manual form's "From another university" entries carry a
  degree-level select (graduate §5.2 / undergraduate = core-knowledge-only / Master's / Ph.D.)
  so undergrad courses can be added for §4.4.1; a Previous Master's/Ph.D. import while
  priorMs='none' shows a reconcile warning in the standing card — never an automatic flip): →
  `src/transcript/external.ts`
  (best-effort candidates; no text layer → explicit OCR opt-in, English only; ND
  detected → redirected to the ND row; unmappable grades kept raw and the student MUST choose)
  → editable preview (`src/ui/external-upload.ts`) → `origin:'transfer'` entries tagged
  `degreeLevel`. The DGS's rulings live in the optional ExternalCourses tab (parse:
  `parseExternalTab`; match: `src/data/external.ts` — the normalized university name alone (aliases retired 2026-09-03; capital-English-as-printed convention), ids ignore
  spaces/hyphens). Engine: Bachelor's never transfers but still satisfies
  §4.4.1; sheet-confirmed core → met; transferable yes/no/blank → pre-approved wording / excluded
  with the ruling named / "not yet decided"; nd_credits replaces transcript credits (§5.2
  pro-rata) — all in `classify()` (the `external` field rides on ClassifiedCourse so core sees
  DGS rulings even for zero-credit courses). Per-course verdicts render in the Transcripts card
  (`verdictsBlock`); everything still needing a DGS decision — ND courses that are unknown,
  unattested dgs_approval, or blank-verdict, plus external courses without a ruling (or with
  transferability undecided) — feeds ONE combined request in the "Ask the DGS to review" card
  (`askDgsCard` in app.ts + `buildCombinedReviewRequest` in `src/transcript/external.ts`;
  consolidation 2026-09-03 — students found two buttons/two emails confusing). The request keeps
  the human half (greeting, prior graduate study, "transcripts are attached", sign-off) above one
  divider + "(DO NOT MODIFY ANYTHING BELOW THIS LINE)"; below it, one tab-separated section per
  sheet tab (Courses: course_id, title; ExternalCourses: UNIVERSITY, course_id, course_title),
  rows only for courses needing a NEW sheet row, then details grouped per transcript;
  engine-ineligible courses (outside the §5.2 window etc.) are excluded as not worth the DGS's
  time. The copy writes text/plain (tabs) AND text/html (real `<table>`s): HTML email flattens
  tabs to spaces, a table survives Gmail and pastes as cells. (A paste while a cell is in EDIT
  mode still lands in one cell — click the target cell once, don't double-click.) All requests
  are addressed to the DGS AND the Graduate Program Administrator (policy 2026-09-03) —
  `GRAD_ADMIN` in `contacts.ts`, clipboard writer `copyReviewRequest` in `external-upload.ts`.
  RETIRED 2026-09-03: the
  per-course core-area claim dropdown and the per-area "previously passed elsewhere"
  attestations (both predated the ExternalCourses tab; Q12 superseded). The type fields
  `claimedCoreArea` / `corePassedElsewhere` remain, deprecated, so old saves still import —
  the engine ignores them. The tab is OPTIONAL at every seam (urls/loader/sync/snapshot/
  rules-date/loading card); its lone failure degrades to "not yet reviewed", never a dead page.
  Tests: `tests/external-rules.test.ts`, `tests/external-transcript.test.ts`, scenario patch key
  `external`; e2e uploads `tests/fixtures/external-transcript.pdf` into the Master's slot.
- **Opt-in OCR for scanned external transcripts** (2026-09-02, DGS decision): a PDF with no
  text layer now offers `.ocr-optin` instead of a flat rejection — explicit button, wording
  states ENGLISH-LANGUAGE TRANSCRIPTS ONLY and that results are approximate. Engine:
  `tesseract.js` v7 (`src/transcript/ocr.ts`), entirely in-browser with SELF-HOSTED assets in
  `public/ocr/` (worker.min.js, tesseract-core-simd-lstm.wasm.js single-file SIMD+LSTM core,
  eng.traineddata.gz best_int) — never the CDN defaults, or the no-external-calls rule breaks.
  Requires WASM SIMD (2021+ browsers); failure → plain message to use a system-generated PDF.
  SAFARI LESSON (2026-09-03): pdfjs-dist is PINNED TO THE v4 LINE (^4.10.38) on purpose — v6
  freely uses 2025 builtins (Map.getOrInsertComputed, Promise.try, URL.parse,
  Uint8Array.fromBase64, Float16Array) in its main AND worker code, which Safari lacks, so on
  Safari every PDF read failed (system-generated ones then looked like scans). Before ever
  upgrading pdfjs, grep the new build + pdf.worker.min.mjs for those identifiers and check
  they are guarded, then test in real Safari.
  Pages render via pdfjs at scale 2.5, max 10 pages; per-line confidences flow through
  `parseExternalTranscript(lines, confidences)` and rows under 80 get `lowConfidence` → ⚠ +
  amber row in the preview (`.ocr-low`), plus the `.ocr-banner` warning. The ND uploader still
  takes NO scans (digital insideND PDF only; OCR'd ND text redirects there). The e2e OCR leg
  runs the real engine in headless Chrome (~15-60 s; 120 s waitFor).
- Updating the OCR assets: bump `tesseract.js` in package.json, `npm install`, re-copy
  `node_modules/tesseract.js/dist/worker.min.js` and
  `node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js` into `public/ocr/`, and
  fetch the matching `@tesseract.js-data/eng` best_int `eng.traineddata.gz`; the scan fixture
  regenerates with `python3 tests/fixtures/make-scan-fixture.py`.
- **Attestations**: DGS-approval checkboxes upgrade matching courses' certainty tier;
  `advisorApprovedPlan` only feeds the advisory approvals row. A CSE non-4xxxx `dgs_approval`
  course has no clearing checkbox by design (stays provisional).

## Invariants — keep these true

1. `npm test` and `npm run build` green before anything merges; `npm run e2e` for UI changes.
2. No network calls at runtime except the sheet fetch. No analytics ever. Student data —
   including uploaded PDFs — never leaves the browser (the page PROMISES this for FERPA;
   see the footer and MAINTENANCE.md).
3. Engine purity: no DOM/fetch/`Date.now()` in `src/engine/` — "today" is an argument.
4. Never guess: unknown course / missing parameter / unapproved thing ⇒ needs-review or
   cannot-evaluate, with the sheet problem named in plain English.
5. Every requirement function keeps its handbook sentence quoted above it; the requirement-id
   registry and fixtures must stay in sync (a meta-test enforces both directions).
6. Sheet schema is a human contract: changes need DGS sign-off + `data/README.md` +
   `MAINTENANCE.md` + fixtures/samples updated together.
7. Handbook beats code; DGS decisions live in `docs/DECISIONS.md` — read before overruling,
   append when a new call is made (date, question, decision, who).

## How to verify like the original session did

- `npm test` — scenario fixtures in `tests/scenarios/*.json` (schema: student + pinned
  `today` + rules patch + expected status/detail substrings per requirement id). Add one per
  bug, forever.
- `npm run e2e` — real headless-Chrome pass (see `.claude/skills/run-app/SKILL.md`).
- `npm run sync-sheet` — fetches the live sheet, prints its diagnostics, and rewrites the
  snapshot only if the sheet content changed (it says which tabs).
- Read screenshots you take. A wrong verdict is easier to spot in the rendered report than in
  JSON.

## Recipes for the asks you'll probably get

- **"New handbook year"**: new PDF in `docs/` (keep old), update `CLAUDE.md` filename, diff
  §3/§4 old-vs-new, route numbers→Parameters tab, course lists→Courses tab, structure→code
  (quote the new sentence), update `HANDBOOK_EDITION` and `HANDBOOK_URL` in `src/ui/handbook.ts`
  (the masthead, footer and copied summary all read from there), then grep for the old edition
  string to catch stragglers, log decisions.
- **"Course X should count for Y"**: that's a SHEET edit, not code. Say so.
- **"Add a checkable requirement"**: implement in `src/engine/requirements/{shared,mscse,phd}.ts`
  with the quoted sentence; register the id in `audit.ts` REQUIREMENT_IDS; add a scenario
  asserting it (the registry meta-test fails until you do); wire any new number through a
  Parameters key (add to `KNOWN_PARAMETER_KEYS`, `data/README.md`, samples, fixtures, and tell
  the DGS the row to paste).
- **"Transcript parsing broke"**: never ask for the PDF (FERPA). Have the DGS run
  `npm run diagnose -- file.pdf` and paste the output: per-page counts (runs, rotated, dropped
  as watermark, columns) and every line's shape (letters→a/A, digits→9, `|` = column gap).
  From the shapes adjust `src/transcript/layout.ts` (columns, watermarks) or the row patterns in
  `external.ts` / `parse.ts`, then add invented lines of the same shape to the tests and, for a
  new layout, a positioned-run fixture in `tests/fixtures/make-transcript-pdfs.mjs` plus an e2e
  leg. If the DGS shares his OWN transcript, use it only in the scratchpad and delete it.
- **"Grandfather a parameter change"**: Parameters have no effective_term — that's a real code
  change (mirror the Courses-row versioning); warn the DGS it's nontrivial.
