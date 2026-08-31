# CSE Graduate Degree Audit — project instructions for Claude Code

## What this is
A static, client-side web app for Notre Dame CSE graduate students. A student enters the
courses they have taken (or are taking), grades, and milestones; the app reports, requirement
by requirement, whether they currently satisfy the **MSCSE** (Graduate Handbook §3) or **Ph.D.**
(Graduate Handbook §4) degree requirements, with the handbook section cited next to every line.

The Director of Graduate Studies (DGS) changes every few years. The next DGS must be able to
update which courses count, and the tunable numbers, by editing a Google Sheet — without
touching code and without the original author.

## Hard constraints (do not relax these without asking)
- **No backend, no database, no login.** Student data never leaves the browser (localStorage,
  plus export/import of a JSON file so a student can move between devices). Nothing is sent to
  any server other than the read-only fetch of the rules sheet.
- **Static deployment.** `npm run build` must produce a `dist/` folder that works on GitHub Pages
  and also works if copied to any plain web host or embedded in an `<iframe>` on cse.nd.edu.
  Use relative asset paths.
- **Policy lives in the sheet, structure lives in code.** Which courses count, their core-area and
  specialization-group tags, and every numeric threshold (credit minimums, caps, GPA floor, grade
  floor, semester deadlines) come from the Google Sheet. The *shape* of the requirements
  (e.g. "three specialization courses from three distinct groups") comes from the handbook and is
  implemented in code with a comment quoting the handbook sentence and its § number.
- **Never guess.** If a course is not in the sheet, or the sheet says `dgs_approval`, tell the
  student "needs DGS review" rather than silently counting or rejecting it.
- **Cite everything.** Every requirement row the student sees shows the § it comes from.
- **Maintainable by a stranger.** Plain, commented code; a `MAINTENANCE.md` written for a future
  DGS (how to edit the sheet, how to re-sync, how to redeploy, how to update the handbook year).

## Sources of truth (read these before touching rule logic)
1. `docs/CSE-Graduate-Handbook-July2026.pdf` — §3 (MSCSE) and §4 (Ph.D.). When code and handbook
   disagree, the handbook wins; flag the discrepancy to me instead of silently choosing.
2. Google Sheet **"CSE-Degree-Audit-Rules"** (Drive folder "Degree Audit App (Claude Code starter
   kit)") — the DGS-editable data: tabs Courses, Parameters, Categories. Schema and published-CSV
   URLs are in `data/README.md`. Sample exports: `data/*.sample.csv`.
3. `reference/CSE-Degree-Audit.html` — an earlier single-file prototype built in a chat session.
   Reuse its rule interpretations and UI ideas where they are sound, and its wording where it is
   clear. Do **not** reuse its data-loading design (manual CSV paste + self-republish); the new app
   fetches the published sheet automatically.

## Architecture
- Vite + TypeScript. Keep the rule engine framework-free; the UI may be vanilla TS or a small
  framework if the plan justifies it.
- `src/engine/` — pure functions only. `audit(student, rules): AuditReport`. No DOM, no fetch,
  no Date.now() (pass "today" in as an argument so tests are deterministic). Unit-tested.
- `src/data/` — load the sheet: fetch published CSV → parse → validate → typed `Rules` object.
  Validation must report bad rows in plain English (row number, column, what is wrong) because
  the person who broke it is a DGS editing a spreadsheet, not a developer. If the fetch fails,
  fall back to `data/snapshot.json` and show a visible "rules last synced on <date>" notice.
- `src/ui/` — student form, course table with autocomplete from the sheet, and the report.
- `tests/` — node's built-in runner (`node --test`; vitest can't run here — a parent folder's
  name contains a colon, which breaks vite-node). One fixture per student scenario in `tests/scenarios/` (a JSON student +
  the expected verdict per requirement). Add a scenario for every bug fixed.
- `scripts/sync-sheet.ts` — pulls the published CSVs and rewrites `data/snapshot.json`. Run by a
  GitHub Action on a weekly schedule and via `workflow_dispatch`, committing if changed.
- `.github/workflows/` — `test.yml` (on PR/push), `deploy.yml` (build → GitHub Pages),
  `sync-sheet.yml`.

## Working rules
- Start non-trivial work in plan mode; show me the plan before writing code.
- Before implementing a requirement, quote the handbook sentence in a comment with its §.
- Ask before changing the sheet schema (column names, allowed values). The schema is a contract
  with humans who edit the sheet by hand; changes need a matching update to `data/README.md`
  and `MAINTENANCE.md`.
- Record every interpretation choice where the handbook is ambiguous in `docs/DECISIONS.md`
  (date, question, decision, who decided). Examples that will come up: how in-progress courses
  count toward "currently satisfies"; whether a course listed under all five specialization
  groups (Research Methods) can fill whichever group the student lacks; whether the 6-credit
  4xxxx cap and 9-credit non-CSE cap overlap; how transfer credit from a prior M.S. is entered.
- `npm test` and `npm run build` must pass before you say something is done.
- Do not add analytics, tracking, fonts from third parties that require network calls at runtime
  beyond what is needed, or any dependency without saying why.
