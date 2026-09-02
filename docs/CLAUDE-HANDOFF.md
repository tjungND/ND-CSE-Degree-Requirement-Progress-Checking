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
  `CSE 87701`) were fixed by the DGS on 2026-09-01 (verified against the live CSV). Still open:
  `CSE 44901` has blank `counts_toward_*`; a number of active rows have blank verdicts.
- GitHub Pages is live at https://tjungnd.github.io/ND-CSE-Degree-Requirement-Progress-Checking/
  (Settings → Pages → Source: GitHub Actions; deploy green since 2026-09-01) — link it, and
  `courses.html`, from cse.nd.edu.
- The sheet's own README tab still says the CSV links go in `src/data/sheet-urls.ts`; the real
  file is `data/sheet-urls.json` (sheet-side fix for the DGS).
- Google's published-CSV endpoint intermittently HANGS (no response at all): seen 2026-09-01
  from a GitHub runner (the first sync-sheet run timed out at 30 s) and from a browser (one
  request hung past 20 s, the next three took ~300 ms). `scripts/sync-sheet.ts` therefore fetches
  sequentially with 3 attempts × 60 s and the workflow logs a curl reachability line per tab;
  the browser loader keeps its single 12 s attempt and falls back to the snapshot with the banner
  — by design, since the snapshot is now at most ~6 h behind. The DGS ran `npm run sync-sheet`
  locally and committed the snapshot that day (2c13949).
- Working copy in Google Drive: on 2026-09-01 Drive delivered a commit to the other Mac with
  `.git/index` missing and a stale `.git/index.lock`; repaired with `git reset -q` after moving
  the lock away (`MAINTENANCE.md` § repo peculiarities). Nothing was lost, but expect it again.

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
- **Alpha disclaimer + handbook link** (2026-09-01, DGS decision): `src/ui/handbook.ts` holds
  the edition, the official PDF URL, `handbookLink()` and the `ALPHA_NOTICE` wording; rendered as
  the `.banner.alpha` under the masthead, the `.legal-alpha` footer paragraph, and two lines in
  the copied summary. Remove the banner (not the footer) when the DGS declares the app out of alpha.
- **Contacts, feedback address, license line, "untested upload" note** (2026-09-01, DGS
  decision): `src/ui/contacts.ts` holds the DGS / Assistant DGS / Graduate Program Administrator
  entries, the repo + LICENSE URLs, `reportToDgs()` and `contactCard()`; rendered as the
  "Who to contact" card at the top right of the masthead on BOTH pages (the masthead is a
  two-column grid: text | card; tools row spans below; single column under 900px), the footer
  "License" line, the feedback sentence in the alpha banner + footer, and the `.untested-note`
  under the transcript-upload button. The alpha banner also states in bold that every verdict is
  computed from the published course rules (linking to `courses.html`). Update `contacts.ts` at every DGS handoff;
  drop the untested note once a real transcript has been run through the parser (by a human, locally — FERPA: never paste a student's transcript into an AI tool).
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
  labelled alpha (only the self-check tool is). It also says not every listed course is offered.
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
- **Alpha ≠ inaccurate rules** (`RULES_ACCURACY_NOTICE` + `ALPHA_SCOPE_NOTICE` in
  `src/ui/handbook.ts`, DGS wording 2026-09-01): the banner, footer and copied summary now state
  in bold that the course rules are accurate — exactly the rules the DGS and the Graduate
  Program Administrator use to determine requirement satisfaction — and that what is in alpha is
  the TOOL's application of them. Don't reintroduce wording that hedges on the rules themselves. **Google sends NO Last-Modified (and no ETag) for published CSVs** — verified
  2026-09-01 by fetching all three tabs from the deployed page's own origin (exposed headers:
  cache-control `private, max-age=300`, content-disposition, content-type, date, expires, server)
  — so the sync's own record is the only zero-setup date source; the earlier header-reading
  code was removed. Tests: `tests/rules-date.test.ts`.
- **External transcripts** (branch `feature/external-transcripts`, 2026-09-01): three optional
  uploads (Bachelor's/Master's/Ph.D.) on the self-check page → `src/transcript/external.ts`
  (best-effort candidates; no text layer → rejected as a scan, "system-generated PDFs only"; ND
  detected → redirected to the ND button; unmappable grades kept raw and the student MUST choose)
  → editable preview (`src/ui/external-upload.ts`) → `origin:'transfer'` entries tagged
  `degreeLevel`. The DGS's rulings live in the optional ExternalCourses tab (parse:
  `parseExternalTab`; match: `src/data/external.ts` — normalized university + aliases, ids ignore
  spaces/hyphens; native script works). Engine: Bachelor's never transfers but still satisfies
  §4.4.1; sheet-confirmed core → met; transferable yes/no/blank → pre-approved wording / excluded
  with the ruling named / "not yet decided"; nd_credits replaces transcript credits (§5.2
  pro-rata) — all in `classify()` (the `external` field rides on ClassifiedCourse so core sees
  DGS rulings even for zero-credit courses). Unreviewed courses: pending verdict + copy-ready
  email request in the card. The tab is OPTIONAL at every seam (urls/loader/sync/snapshot/
  rules-date/loading card); its lone failure degrades to "not yet reviewed", never a dead page.
  Tests: `tests/external-rules.test.ts`, `tests/external-transcript.test.ts`, scenario patch key
  `external`; e2e uploads `tests/fixtures/external-transcript.pdf` into the Master's slot.
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
- **"Transcript parsing broke"**: get one real PDF, run it through
  `pdfToLines` in a scratch script, adjust `src/transcript/parse.ts` patterns, extend
  `tests/transcript.test.ts` with the (anonymized) line shapes.
- **"Grandfather a parameter change"**: Parameters have no effective_term — that's a real code
  change (mirror the Courses-row versioning); warn the DGS it's nontrivial.
