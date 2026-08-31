# Maintenance guide — for the next DGS

> **Start with [`DGS-READ-THIS.md`](DGS-READ-THIS.md)** — the practical guide to running this
> app. This file holds the deeper technical notes it refers to.

You inherited a small static web app that lets CSE graduate students self-check their standing
against the Graduate Handbook (§3 MSCSE, §4 Ph.D.). You should almost never need to touch code:
**policy lives in a Google Sheet you own; the handbook's structure lives in code.**

```
Google Sheet (you edit)  ──publish-to-web CSV──►  static web app (student's browser)
         │                                                ▲
         └── weekly GitHub Action ──► data/snapshot.json ─┘ (fallback if the fetch fails)
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
3. Update the handbook-year strings (search the repo for "July 2026").
4. Record any interpretation calls in `docs/DECISIONS.md` (that file is the memory of every
   judgment call ever made — read it before overruling one).

## One-time setup still pending (as of 2026-08-31)

Paste these rows into the `Parameters` tab — until then the affected requirements honestly show
"cannot evaluate":

| key | value | handbook_section |
|---|---|---|
| ms_total_credits_min | 30 | §3.2 |
| phd_nd_credits_min | 9 | §4.2 |
| ms_transfer_completed_ms_credits_max | 9 | §5.2 |
| phd_transfer_completed_ms_credits_max | 24 | §5.2 |
| transfer_unfinished_ms_credits_max | 6 | §5.2 |
| transfer_min_grade | B | §5.2 |
| fulltime_credits_min | 9 | §2.1.2 |

Also fix these `Courses` rows, which are typed `regular` + `counts_toward = yes` and would
wrongly count toward the **24 regular credits**: `CSE 98900 Research and Dissertation`
(→ `research`), `CSE 68900 Thesis Direction` (→ `project` or `research`), and `CSE 87701`.
Two more just need a decision (they already surface as "needs DGS review"/provisional rather
than counting silently): `CSE 44901 Undergraduate Research` (blank `counts_toward_*`) and
`CSE 48900 Undergraduate Research` (`dgs_approval`) — pick final `counts_toward_*` and
`course_type` values. The app's diagnostics panel (bottom of the input column) lists these
same problems whenever it loads.

## Sync, deploy, test

- **Weekly snapshot**: the `sync-sheet` GitHub Action refreshes `data/snapshot.json` every Monday
  and commits if changed. Run it by hand: repo → Actions → sync-sheet → Run workflow. Locally:
  `npm run sync-sheet`.
- **Deploy**: every push to `main` rebuilds and redeploys GitHub Pages (`deploy` Action).
  One-time repo setting: Settings → Pages → Source: **GitHub Actions**.
- **Tests**: `npm test` (60+ tests: one JSON scenario per student case in `tests/scenarios/`
  plus engine/loader/transcript units). `npm run build` type-checks and bundles. Both must pass
  before merging anything; `npm run e2e` additionally drives the built app in headless Chrome
  (screenshots land in `.e2e-out/`) — run it for UI-visible changes. When a student finds a
  wrong verdict: add a scenario JSON reproducing it, fix, keep the scenario forever.
- **For Claude Code sessions**: `docs/CLAUDE-HANDOFF.md` is the context capsule (design
  decisions, invariants, recipes); `.claude/skills/run-app/` teaches it to launch and
  screenshot the app.
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

## Handoff checklist

1. Transfer the Google Sheet (or move it to a departmental Shared Drive) and the GitHub repo to
   the next DGS.
2. Point them at this file, `data/README.md`, and `docs/DECISIONS.md`.
3. Nothing else — students keep their own data.
