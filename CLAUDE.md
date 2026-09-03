# CSE Graduate Degree Audit — project instructions for Claude Code

## What this is
A static, client-side web app for Notre Dame CSE graduate students. A student enters the
courses they have taken (or are taking), grades, and milestones — or uploads their ND
unofficial transcript PDF, parsed entirely in the browser — and the app reports, requirement
by requirement, whether they currently satisfy the **MSCSE** (Graduate Handbook §3) or **Ph.D.**
(Graduate Handbook §4) degree requirements, with the handbook section cited next to every line.

**The app is built, tested, and in maintenance.** Before changing rule logic or architecture,
read `docs/CLAUDE-HANDOFF.md` — the context capsule from the session that built it (non-obvious
design decisions, invariants, and recipes for common maintenance asks). The humans' guide is
`README.md` (Track A: sheet edits without code; Track B: changing the app with Claude Code or
Codex); deeper ops notes are in `MAINTENANCE.md`. `AGENTS.md` points Codex and other agents at
this file — keep the two consistent.

The Director of Graduate Studies (DGS) changes every few years. The next DGS must be able to
update which courses count, and the tunable numbers, by editing a Google Sheet — without
touching code and without the original author.

## Hard constraints (do not relax these without asking)
- **No backend, no database, no login.** Student data never leaves the browser (localStorage,
  plus export/import of a JSON file so a student can move between devices; transcript PDFs are
  parsed locally by bundled pdfjs). Nothing is sent to any server other than the read-only
  fetch of the rules sheet. The UI promises this explicitly (FERPA) — keep the promise true.
- **Static deployment.** `npm run build` must produce a `dist/` folder that works on GitHub
  Pages and also works if copied to any plain web host or embedded in an `<iframe>` on
  cse.nd.edu. Use relative asset paths.
- **Policy lives in the sheet, structure lives in code.** Which courses count, their core-area
  and specialization-group tags, and every numeric threshold come from the Google Sheet. The
  *shape* of the requirements comes from the handbook and is implemented in code with a comment
  quoting the handbook sentence and its § number.
- **Never guess.** If a course is not in the sheet, or the sheet says `dgs_approval`, tell the
  student "needs DGS review" rather than silently counting or rejecting it. A missing
  parameter renders "cannot evaluate", never a default.
- **Cite everything.** Every requirement row the student sees shows the § it comes from.
- **Maintainable by a stranger.** Plain, commented code; docs written for a future DGS.

## Sources of truth (read these before touching rule logic)
1. `docs/CSE-Graduate-Handbook-July2026.pdf` — §3 (MSCSE) and §4 (Ph.D.). When code and
   handbook disagree, the handbook wins; flag the discrepancy instead of silently choosing.
2. Google Sheet **CSE-Degree-Audit-Rules** — the DGS-editable data (tabs Courses, Parameters,
   Categories). Published-CSV URLs: `data/sheet-urls.json`. Schema: `data/README.md`.
3. `docs/DECISIONS.md` — every interpretation decision already made, with dates and reasons.
   Read it before re-deciding anything; append when a new call is made.
4. `docs/CLAUDE-HANDOFF.md` — engineering decisions, invariants, verification, recipes.

(`reference/CSE-Degree-Audit.html` is the pre-build prototype, kept for history only — its rule
logic is superseded and was found buggy; never treat it as truth. `START-HERE.md` and
`KICKOFF-PROMPT.md` are the original starter-kit notes, also historical. `DGS-READ-THIS.md` was
replaced by `README.md` on 2026-09-01.)

## Architecture (as built)
- Vite + TypeScript, vanilla UI, zero runtime dependencies except two lazily-loaded ones:
  `pdfjs-dist` (transcript PDFs) and `tesseract.js` (opt-in OCR of scanned external
  transcripts — self-hosted engine + English model in `public/ocr/`, ~7 MB, fetched
  same-origin only when a student explicitly chooses OCR).
- `src/engine/` — pure functions only: `audit(student, rules, today)`. No DOM, no fetch, no
  `Date.now()` ("today" is an argument so tests are deterministic). One function per
  requirement with its handbook sentence quoted above it; stable requirement ids in `audit.ts`.
- `src/data/` — published-CSV fetch → parse → validate → typed `Rules`. Validation reports bad
  rows in plain English (the person who broke it is a DGS editing a spreadsheet). On fetch
  failure: THROW a typed `RulesLoadError` — the loading card (`src/ui/loading.ts`) then suggests
  reloading first and offers `data/snapshot.json` (raw CSV text) as a student-chosen fallback,
  never automatically (DGS decision 2026-09-01). The rules are dated against that snapshot
  (`src/data/rules-date.ts`): Google sends no Last-Modified header, so "when did the rules last
  change" = when the six-hourly sync first saw the current content.
- `src/ui/` — form, course table with sheet-driven autocomplete, transcript upload + preview,
  report. All user-entered text rendered via `textContent`, never innerHTML. A second page,
  `courses.html` → `src/courses.ts` → `src/ui/courses-page.ts`, is the public course-rules list
  (read-only view of the Courses tab; no student data); both pages are built by Vite from
  `vite.config.ts` `rollupOptions.input`.
- `src/transcript/` — ND unofficial-transcript PDF → text → courses, all in-browser; plus
  `external.ts`, the best-effort parser for transcripts from OTHER universities (all four
  transcript imports live in the single "Transcripts" card: Notre Dame + Previous
  Undergraduate/Master's/Ph.D.; system-generated PDFs are read directly, scanned ones via the
  opt-in in-browser OCR, English-language transcripts only; everything previewed and
  student-corrected before it is added; every course still needing a DGS decision — ND or
  external — feeds ONE combined review request in the "Ask the DGS to review" card). Matched against the sheet's optional
  ExternalCourses tab (`src/data/external.ts`) for §4.4.1 core-knowledge confirmation and §5.2
  transferability — unmatched courses always show "not yet reviewed by the DGS".
- `tests/` — **node's built-in runner** (`node --test`; that's why relative imports carry `.ts`
  extensions). One JSON fixture per student scenario in `tests/scenarios/`; add a scenario for
  every bug fixed. `npm run e2e` drives real headless Chrome (see `.claude/skills/run-app/`).
- `scripts/sync-sheet.ts` + `.github/workflows/` — six-hourly sheet snapshot (rewritten, committed
  and redeployed only when the sheet content changed), CI tests, Pages deploy.

## Working rules
- Start non-trivial work in plan mode; show the plan before writing code.
- Before implementing or changing a requirement, quote the handbook sentence in a comment with
  its §, and check `docs/DECISIONS.md` for an existing interpretation.
- Ask before changing the sheet schema (column names, allowed values, parameter keys). The
  schema is a contract with humans; changes need matching updates to `data/README.md`,
  `MAINTENANCE.md`, `KNOWN_PARAMETER_KEYS` (engine inputs — missing = error) or
  `DISPLAY_PARAMETER_KEYS` (page text only, e.g. `rules_effective_date` — missing = warning),
  the sample CSVs, and the test fixtures.
- Record every new interpretation choice in `docs/DECISIONS.md` (date, question, decision, who).
- `npm test` and `npm run build` must pass before you say something is done; run `npm run e2e`
  for UI-visible changes and look at the screenshots.
- Do not add analytics, tracking, runtime network calls beyond the sheet fetch (same-origin
  loads of the app's own bundled assets, e.g. `public/ocr/`, are fine), or any dependency
  without saying why.
- Never let a `:` (colon) into any parent folder name — it breaks npm's PATH and vite's module
  loader (details in `MAINTENANCE.md`).
- The project is dual-licensed by the University of Notre Dame (free for non-commercial use,
  paid commercial license via the IDEA Center). Do not edit, remove, or add license files or the
  README's License section unless the DGS asks; do not add dependencies whose licenses conflict
  with redistribution.
