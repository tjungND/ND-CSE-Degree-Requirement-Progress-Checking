# How to start the degree-audit app in Claude Code

This folder is a starter kit, not the app. You copy it into a new repository, drop in two source
files, and hand the repo to Claude Code. The plan below is written for the way the app will be
maintained for years: the code changes rarely, the Google Sheet changes every year.

## The shape of the thing (so the decisions below make sense)

    Google Sheet (DGS edits)  ──publish-to-web CSV──►  static web app (student's browser)
             │                                                 ▲
             └── weekly GitHub Action ──► data/snapshot.json ──┘ (fallback if the fetch fails)

- The app is **static files** — no server, no database, no accounts. It is hosted on GitHub Pages
  (free, automatic on every push) and can be linked from, or iframed into, cse.nd.edu.
- **Student data stays in the student's browser.** Nobody sees it, so there is no FERPA question
  and nothing to secure.
- **Everything a DGS might change lives in the sheet**: which courses count, their core/category
  tags, and every number (24 credits, 6-credit cap, B minimum, 4-semester qualifier window …).
  The handbook *structure* (what the requirements are) lives in code with the § quoted next to
  it, and only changes when the handbook does.

## Step 1 — Prepare the Google Sheet (15 minutes, once)
1. The sheet is **CSE-Degree-Audit-Rules** in this Drive folder (tabs README, Courses, Parameters,
   Categories, Changelog). Confirm the prefilled policy columns row by row over time; the app
   treats a blank verdict as "needs DGS review", so nothing breaks while rows are unreviewed.
2. **File → Share → Publish to web → Link**, pick the Courses, Parameters and Categories tabs in
   turn with *Comma-separated values*, click Publish, and copy the three URLs. (This makes the
   tabs readable by anyone with the link, which is fine: it is public policy, and no student
   data is in there.)
3. The two older sheets ("CSE Degree Requirement Rules (audit app source)" and "CSE Course
   Catalog (audit app source)") are superseded; re-share the new sheet with the same colleagues.
4. Sharing at handoff: transfer ownership to the next DGS or move the sheet to a departmental
   Shared Drive so it never depends on one person's account.

## Step 2 — Make the repo (10 minutes)
```bash
mkdir cse-degree-audit && cd cse-degree-audit
git init
# copy this whole starter folder in: CLAUDE.md, KICKOFF-PROMPT.md, data/, docs/, reference/, tests/
```
Then add the two source files the kit cannot include for you:
- `docs/CSE-Graduate-Handbook-July2026.pdf` — download from
  https://cse.nd.edu/wp-content/uploads/sites/7/2026/07/CSE-Graduate-Handbook-July2026.pdf
- `reference/CSE-Degree-Audit.html` — the prototype already in your DGS folder.

Create an empty repository on GitHub (github.com is fine; an nd.edu GitHub Enterprise org works too
if it offers Pages) and push. Turn on **Settings → Pages → Source: GitHub Actions**.

## Step 3 — Install and open Claude Code (5 minutes)
```bash
npm install -g @anthropic-ai/claude-code   # or: curl -fsSL https://claude.ai/install.sh | bash
cd cse-degree-audit
claude
```
Log in with your Anthropic account when prompted. Claude Code reads `CLAUDE.md` automatically at
the start of every session — that file is where the project's rules live, which is why the kit
puts the constraints there instead of in a chat message you would have to repeat.

## Step 4 — First session: plan, don't build
Press **Shift+Tab** twice (plan mode), paste the contents of `KICKOFF-PROMPT.md`, and read the
plan it comes back with. The plan asks you a list of interpretation questions (in-progress
courses, Research Methods counting for any group, the 60-credit total, …). **Answer those in
the chat** — this is the most valuable ten minutes of the whole project, because your answers
are the policy and Claude will write them into `docs/DECISIONS.md` for the next DGS.

Give it the three published-CSV URLs when it asks. Then approve the plan.

## Step 5 — Build sessions
Let Claude follow the build order in the plan. Useful prompts along the way:
- "Run the scenario tests and show me the report for tests/scenarios/phd-two-groups.json as a
  student would see it." — reading a rendered report catches misinterpretations faster than
  reading code.
- "Add a scenario for this case: …" — whenever a colleague or student finds an edge case.
- "Open the dev server and screenshot the Ph.D. report" — Claude can drive a browser to check
  layout.
- "Write MAINTENANCE.md for a future DGS who has never seen this repo" — do this before you stop.
- `/review` before merging anything you did not watch it write.

Commit after each step; GitHub Pages redeploys on every push to `main`.

## Step 6 — Ship it
- Test with two or three real students' transcripts (they enter their own data; you look over
  their shoulder).
- Link from the graduate-studies page on cse.nd.edu, or embed with
  `<iframe src="https://<org>.github.io/cse-degree-audit/" …>`.
- Announce the sheet as the single place to update course rules each term.

## Yearly handoff checklist (goes in MAINTENANCE.md too)
1. New handbook PDF → replace `docs/…pdf`, ask Claude Code: "Diff §3 and §4 of the new handbook
   against the old one and list every rule that changed; propose code or sheet changes."
2. New courses / retired courses → edit the `Courses` tab; nothing else.
3. Changed numbers → edit `Parameters`; nothing else.
4. Transfer the sheet and the GitHub repo to the next DGS.

## Decisions you may want to revisit
- **Live fetch + snapshot fallback** vs. **snapshot only** (Action re-syncs weekly, app never
  calls Google). Snapshot-only is simpler and works even if a future DGS unpublishes the sheet by
  accident, at the cost of up to a week's delay (or a manual "Run workflow" click). Either is fine;
  the kit defaults to live + fallback.
- **Vite + TypeScript** vs. the prototype's single HTML file. A single file is easy to upload
  anywhere but hard to test; the kit chooses a real project so the rule engine has unit tests
  the next DGS can run. `npm run build` still yields plain static files.
