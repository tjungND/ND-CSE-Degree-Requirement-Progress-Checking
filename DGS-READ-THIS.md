You have inherited the **CSE Graduate Degree Audit** app: a web page where our M.S. and Ph.D.
students self-check, requirement by requirement, where they stand against the Graduate Studies
Handbook (§3 MSCSE, §4 Ph.D.), with the handbook section cited on every line.

It was built so a DGS can run it **without being a programmer**: everything that changes year to
year — which courses count, their core/specialization tags, every numeric threshold — lives in a
Google Sheet you own. The code encodes only the handbook's *structure* and changes only when the
handbook does.

```
Google Sheet (you edit)  ──publish-to-web CSV──►  static web page (student's browser)
         │                                                ▲
         └── weekly GitHub Action ──► data/snapshot.json ─┘  (fallback if the fetch fails)
```

Three properties to never break: (1) **no student data ever leaves the student's browser** —
no server, no accounts; even uploaded transcript PDFs are parsed on the student's own computer
(this is the FERPA story, and the page promises it); (2) **policy lives in the sheet, structure
lives in code** — never hard-code a course number or threshold; (3) **the app never guesses** —
anything the sheet doesn't settle shows "needs DGS review".

## The yearly routine

1. **Store the latest grad handbook PDF under `docs/`** (keep the previous year's PDF too, so
   the diff is easy), and update the filename in `CLAUDE.md`. Then ask Claude Code:
   *"Diff §3 and §4 of the new handbook against the old one; list every rule that changed;
   propose Parameters/Courses edits and any code changes."* Numbers go in the sheet; changed
   rule *structure* goes in code (each with the handbook sentence quoted above it). Finally,
   search the repo for the old year string (e.g. "July 2026") and update the page texts.

2. **Update the spreadsheet**: https://docs.google.com/spreadsheets/d/1C8zYQvLN3gsOpjQHR1RMKdekB1VC_nv9rwSJ_RQCxVA/edit?usp=sharing

   This spreadsheet publicly posts three tabs — "Courses, Categories, Parameters" — which are
   downloaded and fed into the app for decision making. Students see your edits within ~5
   minutes of Google republishing. What you'll actually touch:

   - **Courses** (one row per course): `counts_toward_mscse` / `counts_toward_phd`
     (`yes` | `no` | `dgs_approval`; blank = the app says "needs DGS review");
     `course_type` (only `regular` counts toward the 24 regular-course credits — watch for
     research-ish courses mistyped `regular`); `core_area` (§4.4.1: `os`/`algorithms`/
     `architecture`); `category_group` (§4.4.2: `alg`/`hcc`/`arch`/`dsai`/`sys`, plus the
     reserved values `any` = student picks the group, and `ineligible` = can never satisfy
     the category requirement — all 40000-level courses are marked this way); `active` = `no`
     hides a retired course from the picker but keeps it recognized. **When a course's rules
     change, add a new row with a later `effective_term`** instead of editing the old one —
     the app applies to each student's course the newest row not after that course's term.
   - **Parameters** (every number the handbook states): edit the value, update
     `handbook_section`. Caution: changes apply to **every student immediately** — there is no
     per-cohort grandfathering (that would need a code change). Keep key names exactly as they
     are; a missing/blank key makes its requirement show "cannot evaluate", never a silent pass.
   - **Categories**: two lists side by side (core areas in columns A–B, specialization groups
     in D–E). If the handbook ever adds a group, add it here first. Leave the `any` and
     `ineligible` rows alone.

3. **Let the app check your work.** Open the app and expand **"Rules-sheet diagnostics"** at
   the bottom of the input column — every sheet mistake is listed there in plain English with
   its row number. As of Aug 2026 it still lists: seven Parameters rows to paste in (exact
   table in `MAINTENANCE.md` § "One-time setup") and three mistyped Courses rows
   (`CSE 98900`, `CSE 68900`, `CSE 87701` are `regular`+`yes` but are research/thesis courses).

4. **See what students see**: open the app, click **Load example** (or enter a test record).
   Nothing you enter is stored anywhere but that browser.

## When the app itself needs changing

The code lives in the GitHub repository **ND-CSE-Degree-Requirement-Progress-Checking**.
You need repo access, [Node.js](https://nodejs.org) ≥ 24, and ideally
[Claude Code](https://claude.com/claude-code) — the repo's `CLAUDE.md` teaches it this
project's rules, so plain-English requests work well. A fresh Claude session inherits the
project's full context automatically: it reads `CLAUDE.md`, which points it to
`docs/CLAUDE-HANDOFF.md` (every design decision and its why, plus recipes for the common
maintenance asks) and `docs/DECISIONS.md` (every policy interpretation). You never need to
re-explain the project — just describe what you want changed.

```bash
git clone <repo url> && cd <repo>
npm install
npm test          # 60+ tests — one per student scenario + engine/loader units
npm run dev       # live preview at http://localhost:5173
```

- **The two gates:** `npm test` and `npm run build` must pass before anything merges.
- **Deploys are automatic:** every push to `main` rebuilds GitHub Pages (see the Actions tab).
  A weekly Action snapshots the sheet into `data/snapshot.json`; run it by hand from the
  Actions tab or locally via `npm run sync-sheet`.
- **A student reports a wrong verdict** (the most valuable maintenance moment): reproduce it,
  have Claude Code add a scenario JSON in `tests/scenarios/` capturing the case and the correct
  expected verdict (with the handbook §), fix until green, and keep the scenario forever.
  If it's really a policy ambiguity, decide it and record it in `docs/DECISIONS.md` — that
  file is the memory of every interpretation ever made; **read it before overruling one.**
- **Transcript parsing degrades** (Registrar changed the PDF format): get one fresh unofficial
  transcript from a volunteer student and ask Claude Code to update
  `src/transcript/parse.ts` and its tests against it.

Where things live: `src/engine/` (rule engine — one pure function per requirement, handbook
sentence quoted above each) · `src/data/` (sheet fetch/parse/validate) · `src/ui/` (the page) ·
`src/transcript/` (in-browser PDF parsing) · `tests/scenarios/*.json` (the safety net) ·
`data/sheet-urls.json` (published-CSV links — only edit if the sheet is ever re-published) ·
`data/README.md` (the sheet schema, column by column) · `MAINTENANCE.md` (deeper technical
notes). One quirk: **never put a `:` (colon) in any folder name above the repo** — it breaks
Node tooling (it happened once; details in `MAINTENANCE.md`).

## Handoff checklist

1. Transfer the Google Sheet to the next DGS — or better, move it to a departmental Shared
   Drive — and add them as admin on the GitHub repo.
2. Walk them through one live edit: change a `Parameters` value, watch the app pick it up.
3. Point them at this file; everything else follows from it.
4. Nothing else — student data was never yours to hand over.
