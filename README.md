# ND CSE Degree Requirement Progress Checking

A web page where Notre Dame CSE graduate students self-check, requirement by requirement, where
they stand against the Graduate Studies Handbook (§3 MSCSE, §4 Ph.D.), with the handbook section
cited on every line. It is a self-check, not an official audit.

- **Live app (self-check tool):** https://tjungnd.github.io/ND-CSE-Degree-Requirement-Progress-Checking/
  (the address is shown under the repository's *Settings → Pages*; it changes if the repository is
  ever transferred to another account — see the handoff checklist)
- **Public course-rules list:** https://tjungnd.github.io/ND-CSE-Degree-Requirement-Progress-Checking/courses.html
  — which courses count toward each degree, their core area and specialization category, when
  they are typically offered, and whether the DGS has confirmed the row. Generated live from the
  same sheet; safe to link from cse.nd.edu and to send to students.
- **Rules sheet (the DGS edits this):** Google Sheet **CSE-Degree-Audit-Rules** —
  https://docs.google.com/spreadsheets/d/1C8zYQvLN3gsOpjQHR1RMKdekB1VC_nv9rwSJ_RQCxVA/edit
- **Code:** this repository, https://github.com/tjungND/ND-CSE-Degree-Requirement-Progress-Checking

The app was built so that a Director of Graduate Studies (DGS) can run it **without being a
programmer**. Everything that changes from year to year — which courses count, their
core/specialization tags, every numeric threshold — lives in the Google Sheet. The code encodes
only the handbook's *structure* and changes only when the handbook does.

```
Google Sheet (you edit)  ──publish-to-web CSV──►  static web page (student's browser)
         │                                                ▲
         └── 6-hourly GitHub Action ─► data/snapshot.json ┘  (fallback if the fetch fails; also dates the rules)
```

## Which instructions do you need?

| You want to… | Read | Needs |
|---|---|---|
| Change which courses count, their tags, or a number in the handbook | **[Track A](#track-a--updating-the-rules-no-programming)** | Edit access to the Google Sheet. Nothing else — no GitHub, no code. |
| Change what the app *does* (a new requirement, new handbook structure, UI, transcript parsing, a re-published sheet) | **[Track B](#track-b--changing-the-app-with-claude-code-or-codex)** | Access to this repository, Node.js, and an AI coding agent (Claude Code or Codex). |

Both tracks share the [yearly routine](#the-yearly-routine-both-tracks), [where things
live](#where-things-live), the [handoff checklist](#handoff-checklist) and the three properties
below.

## Three properties to never break

1. **No student data ever leaves the student's browser.** No server, no accounts; even uploaded
   transcript PDFs are parsed on the student's own computer. This is the FERPA story, and the page
   promises it to students.
2. **Policy lives in the sheet, structure lives in code.** Never hard-code a course number or a
   threshold.
3. **The app never guesses.** Anything the sheet does not settle shows "needs DGS review"; a
   missing number shows "cannot evaluate", never a silent pass.

---

## Track A — Updating the rules (no programming)

Everything in this track happens in the Google Sheet. Students see your edits on their next page
load, about five minutes after you make them. Nothing needs to be deployed.

### A0. One-time: get edit access to the sheet

1. Ask the previous DGS to open the sheet, click **Share**, and either add you as an **Editor** or
   (better) **transfer ownership** to you or move the sheet into a departmental **Shared Drive** so
   it never depends on one person's account. The app's links are tied to the sheet itself, not to
   its owner, so they should survive either change — verify with A7 afterwards.
2. Open the sheet and read its **README** tab once. It explains every column and the color coding
   (light-yellow cells are yours to decide; grey columns are informational copies from Banner).
3. The app reads three tabs — **Courses**, **Parameters**, **Categories** — and ignores the rest.
   **Changelog** is for humans: log every edit there.

### A1. Know the columns you will touch (Courses tab)

One row per course. Choose values from the dropdowns; anything outside the allowed set makes the
app skip that row and report it.

| Column | Allowed values | What it means |
|---|---|---|
| `course_id` | e.g. `CSE 60641` | Department code, one space, five digits. The key. |
| `course_type` | `regular` / `seminar` / `research` / `independent` / `project` | Only `regular` counts toward the 24 regular-course credits (§3.2, §4.2). Watch for research or thesis courses mistyped `regular`. |
| `counts_toward_mscse`, `counts_toward_phd` | `yes` / `no` / `dgs_approval` | `dgs_approval` counts provisionally and tells the student to get sign-off. **Blank** makes the app say "needs DGS review". |
| `core_area` | `os` / `algorithms` / `architecture` / blank | Which §4.4.1 core-knowledge area the course satisfies. |
| `category_group` | `alg` / `hcc` / `arch` / `dsai` / `sys` / `any` / `ineligible` / blank | Which §4.4.2 specialization group it belongs to. `any` = listed under every group, the student picks one (Research Methods). `ineligible` = can never satisfy the category requirement — all 40000-level courses are marked this way. |
| `active` | `yes` / `no` | `no` hides a retired course from the student's picker but keeps it recognized for students who took it. |
| `effective_term` | e.g. `Fall 2026` | First term this row applies. See A3. |
| `dgs_reviewed` | `yes` / `no` | `yes` shows the row as **Confirmed** on the public course-rules page; anything else shows **Pending**. The audit engine ignores it — an unreviewed `yes` in `counts_toward_*` still counts. |
| `notes` | text | Shown to the student on hover. Cite the § when relevant. |

The other columns (`title`, `level`, `credit_min`, `credit_max`, `credits_default`,
`typically_offered`, `last_offered`) are informational. `credits_default` is what the app
pre-fills; leave it blank for variable-credit courses. Full schema: `data/README.md`.

### A2. Add a new course

1. Confirm the exact number and title in Banner / class search.
2. In the **Courses** tab, right-click the row number of a similar course → **Insert 1 row below**,
   then copy the similar row into it (or simply add a row at the bottom — order does not matter).
3. Fill in: `course_id` in the exact `CSE 60641` format; `title`; `level` (first digit of the
   number); `credit_min` / `credit_max` / `credits_default` (3 / 3 / 3 for a normal course);
   `course_type`; `counts_toward_mscse` and `counts_toward_phd`; `core_area` and `category_group`
   if it qualifies, otherwise blank (`ineligible` for any 40000-level course); `active` = `yes`;
   `effective_term` = the first term the course may be counted (for example `Fall 2026`);
   `dgs_reviewed` = `yes`; a short `notes` citing the §.
4. Log it (A6) and verify (A7).

### A3. Change how an existing course counts

Rules change from a term onward, and students who took the course earlier keep the old rule. So:

1. **Do not edit the old row.** Copy it and paste the copy directly below.
2. In the copy, change the policy columns and set `effective_term` to the first term the new rule
   applies.
3. The app picks, for each course a student took, the newest row whose `effective_term` is not
   after the term the student took it. If every row is later than the student's term, the oldest
   row applies.

Exception: a plain mistake (a typo, a tag that was never right) is fixed in place — the wrong
value was never policy.

### A4. Retire a course

Set `active` to `no`. Never delete rows — students who took the course years ago must still be
recognized.

### A5. Change a number from the handbook

1. Open the **Parameters** tab and find the key (for example `phd_regular_credits_min`).
2. Change `value`; update `handbook_section` to the § that states the new number.
3. Keep the key names exactly as they are — the app reads them by name. A missing or blank key
   makes its requirement show "cannot evaluate", never a silent pass.
4. **Caution:** a Parameters change applies to **every student immediately**; there is no
   per-cohort grandfathering. If a new number must apply only to new students, that is a code
   change — Track B.

### A6. Log the change and date it

Add a row to the **Changelog** tab: date, your name, what changed, why (handbook §, faculty
decision, correction). The next DGS will thank you. Both pages date the rules automatically, so
nothing else is needed: a GitHub Action checks the published sheet every six hours, and when its
content has changed it records the date, saves the new copy in the repository, and redeploys —
within a few hours of your edit the pages say "The course rules here were last updated on <date
of your edit>, and are up-to-date as of <the day the student opened the page>" (until then the
first half says "were updated after <previous date>"). Only if the rules should carry a different
date than the last edit (a change decided today that takes effect next term, say) add a
**Parameters** row `rules_effective_date` with that date (`2026-09-01` format); the first half
then reads "are effective as of <date>" instead — and keeps doing so until you remove the row.

### A6b. A student asks about a course from another university

Students import prior coursework (Previous Undergraduate / Master's / Ph.D. transcripts) and the app
checks them against the **ExternalCourses** tab. When a student emails you a
review request (the app writes ONE request covering their Notre Dame and
external courses together), the email states their prior-graduate-study choice
(§5.2 caps), notes that their transcript PDFs are attached, and everything
below its "(DO NOT MODIFY ANYTHING BELOW THIS LINE)" divider is
machine-readable — one tab-separated table per sheet tab, plus course details
grouped per transcript. Paste the ExternalCourses table straight into that tab
at a new row's `university` cell, then fill in your rulings: which core area each
satisfies (`satisfies_core_area`, if any), whether its credits can transfer
(`transferable`), and — for quarter/ECTS systems — the ND-equivalent
`nd_credits` (§5.2 pro-rata). The student's page
updates within minutes; anything without a row honestly shows "not yet reviewed
by the DGS". Bachelor's-level courses can satisfy core knowledge (§4.4.1) but
never transfer credit (§5.2). Schema and one-time setup: `data/README.md`.

### A6c. A student asks about a Notre Dame course the sheet hasn't decided

Notre Dame courses that are not in the **Courses** tab (typically non-CSE), are
marked `dgs_approval`, or have blank verdicts show "needs DGS review", and the
"Ask the DGS to review" card writes ONE review request for the student —
covering their Notre Dame and external courses together — which they must
email to you and the Graduate Program Administrator. For courses that are not
in the sheet at all, the email contains paste-ready rows (`course_id`,
`title`) — paste them into the **Courses** tab at a new row's `course_id`
cell, fill in the remaining columns, and the student's page updates within
minutes. For `dgs_approval` courses your decision is by email; the student
then ticks the matching box under "Approvals you already have".

### A7. Verify in the app (five minutes later)

1. Wait about five minutes for Google to republish, then open the live app and reload it.
2. Expand **"Rules-sheet diagnostics"** at the bottom of the input column. Every sheet problem is
   listed there in plain English with its row number. Your rows should not appear; if one does, the
   message says which column and why (usually a value outside the dropdown set).
3. Click **Load example**, or type the course you added into the course table (it autocompletes
   when `active` = `yes`), and read the report as a student would. Open `courses.html` too — the
   public course-rules list should show your row with the right core area, category, and
   Confirmed/Pending mark.
4. If the page cannot load the rules, a card explains why and suggests reloading; a visitor can
   also choose to continue with the app's saved copy (a banner then says so). If the card says
   the spreadsheet is not published, check in the sheet that **File → Share → Publish to web**
   is still on for the three tabs. If the sheet was replaced by a new file, see A9.

Nothing you enter in the app is stored anywhere but that browser.

### A8. Things never to do in the sheet

- Do not rename tabs, column headers, or Parameters keys; do not delete rows; do not unpublish.
- Do not type a value that is not in the dropdown.
- Do not put anything about individual students in the sheet — it is public by design.
- Do not "fix" the app by making a second sheet; the app knows only this one.

### A9. If the sheet is ever re-created, replaced, or its publishing is reset

The published-CSV links change, and the three links in `data/sheet-urls.json` in this repository
must be updated — that is a ten-minute Track B job (recipe in B4). Until then the app tells
visitors the sheet has a problem and offers its last saved copy; it recovers by itself once the
links are fixed.

---

## Track B — Changing the app with Claude Code or Codex

This track is for a DGS who wants to change what the app *does*: a new or changed requirement
after a handbook revision, new UI text, a transcript-format change, a re-published sheet, or a bug
a student found. You do not need to write code yourself: an AI coding agent does the coding, the
repository teaches it this project's rules, and the test suite plus GitHub Actions keep it honest.
Your job is to describe the change, answer policy questions, review, and approve.

Two agents are supported and the workflow is identical: **Claude Code** (Anthropic) reads
`CLAUDE.md` automatically; **Codex** (OpenAI, part of ChatGPT) reads `AGENTS.md`, which points to
the same instructions.

### B0. What you need

1. **A GitHub account with access to this repository.** Ask the previous DGS to add you under
   *Settings → Collaborators* with the **Admin** role, or to transfer the repository to you
   (*Settings → General → Transfer ownership*; note this changes the live URL — see the handoff
   checklist).
2. **A computer with Git and Node.js 24 or newer.** Install Node.js from https://nodejs.org (the
   LTS installer includes `npm`); `git` comes with Xcode command-line tools on macOS or from
   https://git-scm.com. Check with `node --version` and `git --version` in a terminal.
3. **An AI coding agent account**, one of:
   - **Claude Code** — a paid Claude plan or Anthropic API key. Install:
     `npm install -g @anthropic-ai/claude-code` (docs: https://docs.claude.com/en/docs/claude-code).
   - **Codex** — a ChatGPT plan that includes Codex, or an OpenAI API key. Install the CLI:
     `npm install -g @openai/codex` (docs: https://developers.openai.com/codex).
   Both also run inside VS Code and as desktop apps; the prompts below are the same there.
4. About an hour the first time; fifteen minutes for a typical change afterwards.

### B1. One-time: get a working copy that runs

Open a terminal and run, one line at a time:

```bash
cd ~/Documents            # any folder that is NOT inside Google Drive / OneDrive / Dropbox sync
                          # and has no ":" (colon) anywhere in its path — both break the tooling
git clone https://github.com/tjungND/ND-CSE-Degree-Requirement-Progress-Checking.git
cd ND-CSE-Degree-Requirement-Progress-Checking
npm install               # installs the packages the app needs (about a minute)
npm test                  # expect: every test passes — the summary ends with "fail 0"
npm run dev               # local copy of the app at http://localhost:5173 — Ctrl+C to stop
```

If `npm test` fails on a fresh clone, the usual cause is an old Node.js (`node --version` must
be 24 or newer). If the dev server shows the "rules last synced" banner, your network blocked the
Google fetch; that is fine for development.

### B2. Start your agent inside the repository folder

**Claude Code**

```bash
cd ND-CSE-Degree-Requirement-Progress-Checking
claude                    # first run: log in with your Claude account in the browser window it opens
```

Claude Code reads `CLAUDE.md` on its own. Press **Shift+Tab** twice to enter *plan mode*, which
makes it propose a plan before touching files — use it for every non-trivial change.

**Codex**

```bash
cd ND-CSE-Degree-Requirement-Progress-Checking
codex                     # first run: choose "Sign in with ChatGPT"
```

Codex reads `AGENTS.md` on its own. Start every session with:
*"Read AGENTS.md and every file it points to before doing anything, then tell me you are ready."*
Approve the commands it proposes (`npm test`, `npm run build`, …) when it asks.

### B3. The change loop — one change at a time

1. **Start from the latest code:** in the terminal, `git pull`.
2. **Describe the change in plain English, cite the handbook, and ask for a plan first.** For
   example:

   > The July 2027 handbook changed §4.4.2: students now need four category courses instead of
   > three, and "Human Centered Computing" was renamed "Human-Computer Interaction". Plan the
   > change before writing any code. Tell me which parts are sheet edits (Parameters/Categories)
   > and which are code, list every policy question you cannot decide from the handbook, and do
   > not resolve those yourself.

3. **Read the plan and answer its questions.** The agent must ask about anything the handbook
   leaves ambiguous rather than guess. Your answers *are* the policy: tell it to record each one
   in `docs/DECISIONS.md` (date, question, decision, who). Read `docs/DECISIONS.md` yourself before
   overruling an earlier interpretation — that file is the memory of every judgment call made.
4. **Let it implement.** The repository's rules (in `CLAUDE.md`) require it to: quote the handbook
   sentence and § above every requirement it touches; add or update a scenario in
   `tests/scenarios/` for the case; keep `npm test` and `npm run build` green; run `npm run e2e`
   and look at the screenshots in `.e2e-out/` for anything visible. If it skips one of these, ask
   for it.
5. **Check it yourself.** Run `npm run dev`, open http://localhost:5173, click **Load example**,
   and read the report as a student would; exercise the case you changed. A wrong verdict is far
   easier to spot in the rendered report than in code.
6. **Commit and push.** Either tell the agent *"commit with a message that explains why, then
   push"*, or do it yourself:

   ```bash
   git add -A
   git commit -m "§4.4.2: four category courses required from Fall 2027 (DGS decision 2027-08-01)"
   git push
   ```

7. **Watch it go live.** On GitHub, open the **Actions** tab: `test` and `deploy` should turn
   green within a few minutes, and the live page updates automatically. Reload the live app and
   repeat step 5 there.
8. **Tell the sheet side of the story.** If the change added a Parameters key or a Categories
   row, paste it into the sheet now (the agent tells you the exact row); until you do, the new
   requirement honestly shows "cannot evaluate".

### B4. Prompts for the asks you will actually get

- **New handbook year.** Put the new PDF in `docs/` (keep the old one) and update the file name in
  `CLAUDE.md`. Then: *"Diff §3 and §4 of docs/CSE-Graduate-Handbook-July2027.pdf against the
  July 2026 PDF. List every rule that changed. Propose Parameters/Courses/Categories edits for
  the numbers and lists, and code changes only for changed structure. Then update the edition
  and PDF link in src/ui/handbook.ts and search the repo for 'July 2026'."*
- **"Course X should count for Y."** That is a sheet edit (Track A), not code. Any agent that
  proposes to hard-code a course number is wrong; say so.
- **A student reports a wrong verdict.** *"Here is the student's situation: … The correct verdict
  per §… is …. Add a scenario JSON in tests/scenarios/ that reproduces it, then fix the engine
  until it passes. If this is a policy ambiguity rather than a bug, stop and ask me first."* Keep
  the scenario forever.
- **Add a checkable requirement.** *"Implement the new §… requirement: quote the sentence, add it
  to the requirement registry, wire its number through a Parameters key, add a scenario, and tell
  me the exact Parameters row to paste into the sheet."*
- **Transcript upload stopped recognizing courses.** Get one fresh unofficial transcript PDF from a
  volunteer student. *"The Registrar changed the transcript layout; here is a fresh sample.
  Update src/transcript/parse.ts and its tests so this file parses, without breaking the existing
  fixtures. Do not commit the sample."*
- **The sheet was re-published or replaced.** In the sheet, *File → Share → Publish to web →
  Link*, pick Courses, Parameters, Categories in turn as *Comma-separated values*, copy the three
  URLs. Then: *"Replace the three URLs in data/sheet-urls.json with these, run npm run
  sync-sheet, and confirm the diagnostics are clean."*
- **A number should apply only to new students.** *"Parameters have no effective_term. Plan how
  to grandfather `<key>` by entry term, mirroring the Courses-row versioning, and tell me the
  sheet-schema change before implementing."* This one is nontrivial — expect a real discussion.
- **Wording on the page.** *"Change the footer text to … . UI change only; run npm run e2e and
  show me the screenshot."*

### B5. What you are checking for as the reviewer

- The three properties above still hold — no new network calls, no analytics, no data leaving the
  browser, no hard-coded course numbers or thresholds, no silent defaults.
- Every new interpretation is in `docs/DECISIONS.md`, and none of the existing rows were changed
  without your say-so.
- The agent did not change the **sheet schema** (column names, allowed values, key names) without
  asking. A schema change is a contract with the humans editing the sheet and must be made in the
  sheet, `data/README.md`, `MAINTENANCE.md`, the sample CSVs and the test fixtures together.
- `npm test` and `npm run build` pass; for anything visible, you looked at the `.e2e-out/`
  screenshots.

### B6. If a deploy goes wrong

Undo the last commit and push; GitHub Pages redeploys the previous version in a few minutes:

```bash
git revert HEAD
git push
```

Or tell the agent: *"Revert the last commit and push; then explain what went wrong."* The
`sync-sheet` Action never changes code, only `data/snapshot.json`.

### B7. Without an agent

Everything above also works by hand: the code is plain TypeScript with a comment quoting the
handbook above each rule, `npm test` runs the scenarios, and `MAINTENANCE.md` plus
`docs/CLAUDE-HANDOFF.md` explain every design decision. Any student developer or IT colleague can
follow them.

---

## The yearly routine (both tracks)

1. **New handbook.** Numbers → **Parameters** tab (Track A). New or retired courses → **Courses**
   tab (Track A). Changed *structure* of a requirement → Track B, recipe "New handbook year".
2. **Let the app check your work.** Open the app → **Rules-sheet diagnostics** (A7).
3. **Log it** on the sheet's Changelog tab.
4. Nothing else — the app picks the sheet up automatically.

## Where things live

`src/engine/` — rule engine, one pure function per requirement with the handbook sentence quoted
above it · `src/data/` — sheet fetch, parse, validate · `src/ui/` — the pages (`app.ts` the
self-check tool, `courses-page.ts` the public course-rules list served as `courses.html`) · `src/transcript/` —
in-browser PDF parsing · `tests/scenarios/*.json` — one student case per file, the safety net ·
`data/sheet-urls.json` — the published-CSV links (edit only if the sheet is re-published) ·
`data/README.md` — the sheet schema, column by column · `docs/DECISIONS.md` — every policy
interpretation ever made · `docs/CLAUDE-HANDOFF.md` — engineering decisions and recipes for AI
sessions · `MAINTENANCE.md` — deeper technical notes and the list of one-time setup still pending ·
`src/ui/handbook.ts` — handbook edition + PDF link · `src/ui/contacts.ts` — who to contact ·
`CLAUDE.md` / `AGENTS.md` — the instructions AI agents read · `START-HERE.md`, `KICKOFF-PROMPT.md`,
`reference/` — the original build-time starter kit, historical only.

Automation: every push to `main` runs the tests and redeploys GitHub Pages (`deploy` Action); every
push or pull request runs `test`; every six hours `sync-sheet` checks the sheet and, when its
content has changed, commits the new `data/snapshot.json` and redeploys — that commit is also how
the pages know when the rules were last updated (run it by hand from the Actions tab or with
`npm run sync-sheet`). GitHub pauses scheduled Actions after 60 days without repository activity
and emails you; re-enable it from the Actions tab.
One quirk: **never put a `:` (colon) in any folder name above the repository** — it breaks Node
tooling (details in `MAINTENANCE.md`).

## Handoff checklist

1. **Sheet:** transfer ownership of CSE-Degree-Audit-Rules to the next DGS, or move it to a
   departmental Shared Drive. Confirm *File → Share → Publish to web* is still on afterwards.
2. **Repository:** add the next DGS as **Admin** (*Settings → Collaborators*), or transfer the
   repository (*Settings → General → Transfer ownership*). A transfer changes the live URL to
   `https://<new-owner>.github.io/ND-CSE-Degree-Requirement-Progress-Checking/` — then re-enable
   *Settings → Pages → Source: GitHub Actions*, update the link or iframe on cse.nd.edu, and
   update the URL at the top of this file.
3. **Update the people on the page:** names and e-mail addresses of the DGS, Assistant DGS and
   Graduate Program Administrator live in `src/ui/contacts.ts` (the footer, the feedback notes
   and the error-report address all read from it). Edit, commit, push — Track B, five minutes.
4. **Walk through one live edit together:** change a Parameters value, wait five minutes, watch the
   app pick it up, change it back, log both in the Changelog.
5. **Point them at this file.** Everything else follows from it.
6. Nothing else — student data was never yours to hand over.

## Status and open items

See `MAINTENANCE.md` § "One-time setup still pending" for the sheet rows that still need pasting;
the app's **Rules-sheet diagnostics** panel is the live truth.

## License

Copyright © 2026 University of Notre Dame du Lac.

**ND CSE Degree Requirement Progress Checking** is freely available without a fee for
non-commercial use (academic and research use), and may be redistributed under these conditions.
For commercial use, a non-exclusive commercial license is required, which carries a
non-refundable annual fee. For commercial use queries, please contact Notre Dame's IDEA Center at
softwarelicensing@nd.edu. Full terms: [`LICENSE.md`](LICENSE.md).
