# Maintenance guide — for the next DGS

> **Start with [`README.md`](README.md)** — the practical guide to running this app (Track A:
> sheet edits without code; Track B: changing the app with Claude Code or Codex). This file holds
> the deeper technical notes it refers to.

You inherited a small static web app that lets CSE graduate students self-check their standing
against the Graduate Handbook (§3 MSCSE, §4 Ph.D.). You should almost never need to touch code:
**policy lives in a Google Sheet you own; the handbook's structure lives in code.**

```
Google Sheet (you edit)  ──publish-to-web CSV──►  static web app (student's browser)
         │                                                ▲
         └── 6-hourly GitHub Action ─► data/snapshot.json ┘ (fallback if the fetch fails; also dates the rules)
```

Student data never leaves the student's browser (localStorage + a save-to-file button).
Nothing about students is stored anywhere you can see. There is no server.

## The three things you'll actually do

### 1. A course changes (new course, retired course, counts differently)
Open the Google Sheet **CSE-Degree-Audit-Rules** → `Courses` tab.
- New course: add a row. `counts_toward_mscse` / `counts_toward_phd` ∈ `yes | no | dgs_approval`
  (`dgs_approval` = counts provisionally, the app tells the student to get sign-off; blank = the
  app says "needs DGS review"). Tag `core_area` (§4.4.1) and `category_group` (§4.4.2) if it
  qualifies; `any` means listed under every group and the student picks.
- Retired course: set `active` to `no` (hides it from the picker; still recognized when typed,
  for students who took it years ago). Do not delete rows.
- A rule *changes* from some term: **add a new row** with the later `effective_term` instead of
  editing the old one. The app applies, per course a student took, the newest row whose
  `effective_term` is not after that course's term (the oldest row applies retroactively).
Students see edits on their next page load (~5 minutes for Google to republish).

### 2. A number in the handbook changes
`Parameters` tab: edit the value, update `handbook_section`. That's it.
**Caveat:** the app audits everyone with the current numbers — there is no per-cohort
grandfathering of Parameters. If a change must only apply to new students, that needs a code
change; ask for it.

### 3. A new handbook year
1. Put the new PDF in `docs/` (keep the old one) and update the path in `CLAUDE.md`.
2. Ask Claude Code: *"Diff §3 and §4 of the new handbook against the old one; list every rule
   that changed; propose Parameters/Courses edits and any code changes."*
3. Update the handbook edition and PDF link in `src/ui/handbook.ts` (one place — the page header,
   footer and copied summary read from it), then search the repo for the old edition string.
4. Record any interpretation calls in `docs/DECISIONS.md` (that file is the memory of every
   judgment call ever made — read it before overruling one).

## Sheet items still open (as of 2026-09-01)

The one-time setup is done: the seven Parameters rows the engine needs are in the sheet, and the
three mistyped `Courses` rows (`CSE 98900`, `CSE 68900`, `CSE 87701`) are fixed. Still open:
`CSE 44901 Undergraduate Research` has blank `counts_toward_*` (it surfaces as "needs DGS
review" rather than counting silently — pick final values), and a number of active rows still
have blank verdicts (shown as "Not yet decided" on the public course-rules page). The app's
diagnostics panel (bottom of the input column) lists every sheet problem whenever it loads.

The optional Parameters row `rules_effective_date` (`2026-09-01` format) overrides the automatic
"The course rules here are up-to-date as of <date>" line on both pages with "Rules effective as of
<date>"; add it only when the rules should carry a different date than the last edit (see "Sync"
below).

## Sync, deploy, test

- **Sync (every 6 hours)**: the `sync-sheet` GitHub Action fetches the published sheet and,
  only when its content has changed, rewrites `data/snapshot.json`, commits it, and starts the
  `deploy` workflow (by `workflow_dispatch` — a push made with the Action's own token never
  triggers `on: push`). Unchanged content leaves the file untouched on purpose: the snapshot's
  `syncedAt` is therefore the moment the current rules were first seen, and that is the date both
  pages print as "The course rules here are up-to-date as of …" (Google sends no Last-Modified
  header for published CSVs — verified 2026-09-01 — so this is the only zero-setup source). While
  the live sheet is newer than the deployed copy the pages say "as of <today>" (they have just
  read the live sheet) and the diagnostics panel explains; that state should last at most ~6
  hours. Run the sync by hand: repo → Actions →
  sync-sheet → Run workflow; locally `npm run sync-sheet` (then commit the snapshot if it changed).
  **GitHub pauses scheduled workflows in a public repository after 60 days without repository
  activity** and emails the owner — re-enable from the Actions tab (Actions → sync-sheet →
  "Enable workflow"). If a run fails at `npm run sync-sheet` with a timeout: the very first run
  (2026-09-01) did — Google left the runner's request hanging for 30 s — so the script now
  fetches the three tabs one at a time with three attempts and a 60 s timeout, and the workflow
  logs a `curl` reachability line per tab just before it. Look at those lines: an `HTTP 200` in
  a few seconds means the hang was transient (re-run the workflow: Actions → sync-sheet → Re-run,
  or `gh run rerun <run-id>`); a timeout there too means Google is not answering GitHub's
  runners at all, and the fallback is to run `npm run sync-sheet` on your own Mac and commit
  `data/snapshot.json` (the pages then date the rules from that commit).
- **Deploy**: every push to `main` rebuilds and redeploys GitHub Pages (`deploy` Action).
  One-time repo setting: Settings → Pages → Source: **GitHub Actions**.
- **Tests**: `npm test` (60+ tests: one JSON scenario per student case in `tests/scenarios/`
  plus engine/loader/transcript units). `npm run build` type-checks and bundles. Both must pass
  before merging anything; `npm run e2e` additionally drives the built app in headless Chrome
  (screenshots land in `.e2e-out/`, including the public course-rules page `courses.html`) — run
  it for UI-visible changes. When a student finds a
  wrong verdict: add a scenario JSON reproducing it, fix, keep the scenario forever.
- **For AI coding sessions**: `CLAUDE.md` holds the project rules (Claude Code reads it
  automatically; Codex reads `AGENTS.md`, which points to it); `docs/CLAUDE-HANDOFF.md` is the
  context capsule (design decisions, invariants, recipes); `.claude/skills/run-app/` teaches
  Claude Code to launch and screenshot the app.
- **Published-CSV URLs** live in `data/sheet-urls.json` (the only file to edit if the sheet is
  ever re-published or replaced).

## Repo peculiarities you should know

- Tests run on **node's built-in runner** (`node --test`; Node ≥ 24 runs the TypeScript
  directly) — no test-framework dependency. `npm run dev` gives a live-reload dev server;
  `npm run build && npm run preview` serves the production build.
- **Never put a `:` (colon) in any parent folder's name.** This repo once lived under
  `FY26-27 (DGS: Taeho Jung)` and the colon silently broke npm's script PATH and vite's module
  loader; the folder was renamed to fix it. The dependency-free test runner was kept.
- **Transcript upload** (`src/transcript/`): students can upload their ND unofficial transcript
  PDF; it is parsed **in the browser** (pdfjs-dist — the app's one runtime dependency, bundled,
  no network) and the parsed courses are shown for confirmation before anything is added.
  Non-ND transcripts are refused with a message pointing to manual DGS review. PDF parsing is
  best-effort against the Banner self-service transcript layout: if the Registrar changes the
  format, collect one fresh transcript PDF (any volunteer student), and ask Claude Code to
  update `src/transcript/parse.ts` and its tests against it. Nothing uploaded ever leaves the
  student's browser — the page says so explicitly next to the upload button, in the save card,
  and in the footer (FERPA: no education records are transmitted or stored anywhere; the app's
  only network request is the read-only fetch of the public course-rules sheet).
- The engine (`src/engine/`) is pure: every requirement function has the handbook sentence
  quoted above it, and `audit(student, rules, today)` takes "today" as an argument. If code and
  handbook disagree, the handbook wins — fix the code.
- Sheet-schema changes (column names, allowed values) are a contract with the humans who edit
  the sheet: update `data/README.md` and this file together with the loader.
- **The working copy lives in a Google Drive folder, `.git` included.** Drive syncs git's
  lock-and-rename writes imperfectly: on 2026-09-01 a commit made on one Mac arrived on the other
  with `.git/index` missing and a stale `.git/index.lock` in its place (`git status` then lists
  every file as deleted and untracked). Nothing is lost when that happens — HEAD, refs and objects
  were intact; the fix is `mv .git/index.lock /tmp/` (only once you are sure no git command is
  running) followed by `git reset -q` to rebuild the index from HEAD. Rules that avoid it: run
  git on one machine at a time, let Drive finish syncing before switching machines, and never
  run git on both. Drive's own shortcut files (`*.gsheet`, `*.gdoc`) are git-ignored.

## Handoff checklist

The canonical checklist is in [`README.md` § Handoff checklist](README.md#handoff-checklist)
(sheet ownership, repository access or transfer — which changes the live URL — one live edit
together, and pointing the next DGS at the README). Nothing else — students keep their own data.

## License

Dual-licensed by the University of Notre Dame: free for non-commercial (academic and research)
use, paid non-exclusive license for commercial use via the IDEA Center (softwarelicensing@nd.edu).
Full text in [`LICENSE.md`](LICENSE.md); summary in the README.
