# Fix order — interface review of 2026-09-18

Work order for Claude Code. Every item below carries the DGS's recorded decision from the
review doc; the decisions are made, so implement them rather than re-opening them.

Source review: *Degree Audit App — Interface Review (Blue & Red Team)*, 18 Sep 2026,
against the live GitHub Pages build and `main` at `717c112`.

---

## Before you start

Follow the standing session protocol in `CLAUDE.md` ("Session protocol"). In short:

1. `npm ci` first — a Desktop session starts in a fresh worktree under
   `.claude/worktrees/<name>/` with no `node_modules`.
2. Read `docs/CLAUDE-HANDOFF.md`, `docs/STATE.md` and the newest rows of
   `docs/DECISIONS.md`. Never re-decide a recorded decision; append a row for every new
   one, and keep `STATE.md` and the handoff current as you go rather than at the end.
3. Verify the baseline before changing anything: `npx tsc --noEmit`, `npm test`,
   `npm run build`, `npm run e2e` — and look at the e2e screenshots.
4. Verify **every** change the same way before calling it done, and add
   `E2E_BROWSER=webkit npm run e2e` whenever layout changed. Chromium alone missed a
   Safari-only bug on 2026-09-06. Show the result before committing; the DGS may ask for
   revisions first.
5. Before each commit the DGS will ship, run `git fetch origin && git merge origin/main`
   — the sheet-sync Action commits to `main` every six hours — and re-run the checks if
   anything came in.
6. **Never run `git push`, open a PR, or use "Continue in → Claude Code on the Web."** The
   DGS merges and pushes himself. End every shippable commit with the exact line for him,
   with the real branch name from `git branch --show-current` filled in:
   `cd ~/degree-audit-app && git pull --ff-only && git merge --ff-only <branch> && git push`
   — and say what it deploys.
7. FERPA: never open a real transcript; sanitized copies only, kept outside the repo under
   neutral names, and no student's name in code, fixtures, docs or commit messages.

**A second session is running on this repo.** A Fable-tier session on branch
`claude/setup-handoff-review-c38220` is paused mid-way through a separate blue/red-team
review of the **course rules sheet** — not the app. It has changed no code. Leave that
branch and its worktree alone. This work touches `src/` and `docs/`; if that session resumes
and wants to write, it should merge `origin/main` first.

---

## Decisions already made — do not re-open

| Item | DGS decision |
|---|---|
| R1 numeric validation | Fix, and give an error for an out-of-bound GPA |
| R2 over-cap / pending approval reads "Met" | Fix. Pending approvals must **not** read "Met" — show conditional satisfaction. The dashboard must distinguish non-satisfaction from conditional satisfaction. Excluded credits get a warning and do not count toward that requirement |
| R3 `approvalDriven` missing on two caps | Fix as described |
| R4 ADGS inside handbook quotes | **Ignore — will not fix.** The handbook is being revised. Do not touch `first-mention.ts` for this |
| R5 example banner stays after real entries | Fix as described |
| R6 privacy claim overstated | Fix as described |
| R7 shared-machine persistence | Fix as described |
| B1–B9 (all blue-team) | Fix all as described |

Two further constraints settled on 2026-09-18:

- **Decision F1 (2026-09-12) stands.** The non-CSE 6xxxx allowance limits regular-course
  credit, not the total: credits over that cap still spill into the 60-credit total
  (`overCapToTotal` in `allocate.ts`). R2's "those credits not count toward the degree
  requirement" applies to the *capped* requirement, which is already how the code behaves.
  What is missing is the warning. Do not change the spill.
- **`needs_dgs_review` is the existing conditional-satisfaction status.** Do not add a new
  member to the `Status` union in `src/engine/types.ts:204`. The work is making that status
  read and render as conditional satisfaction.

---

## Task 1 — Validate numeric input (R1)

**What is wrong.** The `min`/`max` attributes on every number field are decorative. Nothing
reads `validity`, nothing clamps, and no value is refused. Reproduced on the live build:

- GPA `35` → stored as `35`, card renders *"Cumulative GPA 35.00 meets the 3.0 minimum"*
  with a green **Met** pill.
- GPA `-2` → stored, card renders *"Cumulative GPA -2.00 is below the 3.0 minimum — you
  cannot receive a degree or defend until it recovers (§2.2)"*.
- A course at `999` credits (field `max="15"`) → accepted, produced *"1005 pending
  review/approval"* on the 60-credit row.

No `aria-invalid` is ever set, and `grep ':invalid' src/style.css` returns nothing, so an
impossible value is visually identical to a good one.

**Changes.**

- `src/ui/app.ts` — the GPA input (see `field('Cumulative GPA (from your transcript, §2.2)', …)`,
  around line 1039), the add-course credits and year inputs, and the entry-term /
  bachelor's-awarded year inputs.
- Refuse the value on commit rather than storing it: keep the typed text in the field so the
  student can see and correct it, do not write it to `Student`, set `aria-invalid="true"`,
  render a visible inline message beside the field, and announce it through the existing
  `role="status"` region.
- Ranges, from the attributes already present: GPA 0–4.00 (step 0.01); credits 0–15
  (step 0.5); entry and course-term year 2000–2040; bachelor's-awarded year 1970–2040.
- Apply the same check on the two paths that bypass the field: `loadFile` in
  `src/ui/state.ts` and the transcript import's GPA prefill. A file or a transcript carrying
  an out-of-range GPA must land in the same refused state, not in `Student`.
- `src/style.css` — a visible invalid state (border plus the message), meeting the contrast
  floor the rest of the page holds (everything currently measures ≥ 5.36:1).

**Acceptance.**

- GPA `35`, `-2`, `4.01` → the GPA requirement row returns `cannot_evaluate`, with a detail
  naming the range, and never `met` or `unmet`.
- A refused value never reaches `localStorage`.
- The advisor summary and the Grad Admin request never carry an out-of-range figure.
- Unit tests in `tests/`: `gpa: 35` → `cannot_evaluate`; `gpa: -2` → `cannot_evaluate`;
  `gpa: 4.0` → `met`; `gpa: 2.99` → `unmet`; a 999-credit course is refused at entry.

---

## Task 2 — Conditional satisfaction (R2 + R3)

The largest item. Three parts; do them together, since they share the same rows.

### 2a. The two caps that ignore their own approval requirement (R3)

`src/engine/requirements/context.ts:161`:

```ts
status = args.approvalDriven && pending.length > 0 ? 'needs_dgs_review' : 'met';
```

`phd.cap.noncse` passes `approvalDriven: true` (`src/engine/requirements/phd.ts:130`).
These two do not, although the handbook text quoted in their own cards requires approval:

- `phd.cap.fourk` (`src/engine/requirements/phd.ts:102`) — *"Up to six (6) credits from CSE
  4xxxx may be used to satisfy the course requirement, subject to approval of the student's
  advisor and DGS."*
- `ms.cap.sharedbs` (`src/engine/requirements/mscse.ts:121`) — *"With approval of the
  instructor and DGS…"*

Add `approvalDriven: true` to both.

Leave `ms.cap.fourk` (`mscse.ts:107`) alone — §3.2's wording there mentions no approval, so
its absence is correct, not an oversight.

### 2b. Pending approval must not read "Met"

With 2a in place the two caps return `needs_dgs_review`. Check every other row that can
reach `met` while something is unapproved, and make it return `needs_dgs_review` too.
`thresholdStatus` in `src/engine/status.ts` already handles this correctly through the
certainty ladder — the gap was in `capRow`, so confirm rather than rewrite.

### 2c. Over-cap credits get a warning

`capRow` already builds `excludedLines`, and they currently render as ordinary body text
under a green **Met** pill. Reproduced: three CSE 4xxxx courses, 9 credits against a
6-credit cap →

> At most 6 credits from CSE courses below the 60000 level — **Met** — 6 of the 6 credits
> below the 60000 level used. needs approval: CSE 40243, CSE 40437, CSE 40554.
> CSE 40554: 3 credits not counted — over the cap.

Render those lines as a warning with its own class and treatment, not as prose, and carry
them into the advisor summary and the Grad Admin request. A row with excluded credits must
never present as an unqualified pass.

Keep the two exclusion kinds distinct, as `allocate.ts` already does: `excluded` earns
nothing anywhere; `overCapToTotal` still counts toward the 60-credit total under decision F1.

### 2d. The dashboard must distinguish non-satisfaction from conditional satisfaction

`src/ui/report.ts`:

- `dial()` (line 19) — the headline is built from `met`, `inProgress` and `open`, with
  conditional satisfaction buried as a parenthetical, *"(2 need a DGS decision)"*. Give it
  its own count in the headline, its own colour on the arc, and its own entry in the meters.
- The sticky footer currently reads *"7 of 17 met"* and hides the distinction entirely.
- `STATUS_LABEL` (line 13) — `needs_dgs_review` currently reads **Needs DGS review**.

**Wording needs the DGS's approval before it ships.** Proposed, for `docs/WORDING-REVIEW.md`
as item W-CS1: pill **Conditionally met**, with the existing sub-line naming who must
approve. The label applies to more than caps — a milestone passed after its deadline, a
transfer course, an unrecognised course all use `needs_dgs_review` — so check it reads
correctly in each before proposing. Write the proposal into `docs/WORDING-REVIEW.md` and
ship the mechanism with the current label if the DGS has not answered yet.

**Acceptance.**

- Three CSE 4xxxx courses totalling 9 credits → the cap row does not read Met; the three
  unapproved courses and the 3 discarded credits are both visible as warnings.
- A student with an unapproved non-CSE course and a student with an unapproved CSE 4xxxx
  course get the same verdict for the same situation.
- The dial, the headline, the meters and the sticky footer each separate met from
  conditionally met from not met.
- Unit tests covering both caps at, under and over the limit, with and without approval.

---

## Task 3 — The example banner stops telling the truth (R5)

**What is wrong.** `isExample` is sticky. Load the example, add one real course through the
normal form, and the banner still reads *"This is the example student, not your record.
Nothing here came from you. Clear it before entering your own coursework."* — while one of
the nine courses is the student's. Either they believe it and click **Clear the example**,
losing their own work, or they stop trusting the page's warnings.

Relevant code: `src/ui/app.ts:420` (banner), `:2483` (`isExample: true`),
`src/ui/state.ts:159`.

**Change.** Tag the example rows at load time rather than tagging the whole record — e.g. a
`fromExample` flag on each seeded course and milestone. Then:

- The banner counts them: *"8 of these 9 courses are the example student's."*
- The button becomes **Remove the example rows** and removes only those.
- When none remain, the banner and the flag both clear.

**Acceptance.** Load example → add a course → the banner must not claim nothing came from
the student; removing the example rows leaves that course untouched.

---

## Task 4 — Make the privacy claim match the behaviour (R6)

**What is wrong.** Two claims overstate what the page does.

- `src/ui/handbook.ts:52` — *"The page's only network request is the read-only fetch of the
  public course rules."*
- `src/ui/app.ts:2447` — *"Nothing is transmitted to the University or to any third party…"*

Measured on one load of the live build: **five** requests — four to
`docs.google.com/spreadsheets/d/e/2PACX-…/pub?…&output=csv` (one per tab) and one back to
`tjungnd.github.io` for the date probe. No student data is in any of them, and that part of
the claim is true and verified. But Google and GitHub each receive an IP, a user agent and a
referrer on every load, so "no third party" is not accurate, and "only network request" is
singular for five.

This is the claim students are asked to rely on *before* entering FERPA-protected data, and
it is the first thing anyone auditing the tool will check.

**Change.** Replace both strings with wording that is true and still reassuring. Proposed,
for `docs/WORDING-REVIEW.md` as item W-P1:

> Your coursework never leaves this browser. The page itself loads from GitHub and reads the
> course rules from Google Sheets, so those two services see that someone opened the page;
> they never see what you enter.

Keep the FERPA sentence. The DGS approves the final wording.

---

## Task 5 — Shared computers (R7)

State lives in `localStorage` under `cse-degree-audit/v1/student` with no expiry: GPA, every
course, every milestone date. On a lab or library machine the next person to open the page
sees the previous student's record. The page frames browser-local storage purely as a
benefit.

**Change.** Add a line to the *"Your data stays in this browser"* section saying so, and make
**Clear** reachable from the end of the report as well as from the top of the page.

---

## Task 6 — Blue-team items (B1–B9, all approved)

**B1. A full screen of preamble above the control labelled START HERE.** At 708×937 the
*1. Transcripts — START HERE* heading sits at y=944 and the first **Import from PDF** button
at y=1104. The first nineteen interactive elements include no data-entry control at all:
three reference links, three mailto links, the program buttons, Load example, Clear, another
mailto, a Details toggle, a repeated course-rules link, a third copy of the DGS's email, then
the report and footer links. Move the Who-to-contact card to the end (the report already
names people by role where they matter), collapse the alpha and privacy banners to one line
behind the Details disclosure that already exists, and give the first screen to the program
choice and the transcript import.

**B2. Ph.D. is a silent default.** `src/ui/state.ts:11` sets `program: 'phd'` with nothing
asking. An MSCSE student who misses the segmented control reads seventeen Ph.D. checks —
dissertation readers, OCE, the eight-year limit — and a footer reading *0 of 17 met*. Require
the choice before the report renders. The consent dialog (`src/ui/app.ts:73–116`) is already
a forced interaction that currently only collects an acknowledgement; putting the program
choice in it would give it a purpose and remove the whole failure class. Otherwise set the
program from the transcript import.

**B3. "X of Y" breaks once a minimum is passed.** Live: *At least 9 credits of regular
courses taken at Notre Dame — **Met** — 15 of 9 credits complete.* `thresholdRow`
(`src/engine/requirements/context.ts:71`) always formats `${definite} of ${required}`. When
`definite >= required`, change the sentence: *"15 credits at Notre Dame; the 9-credit minimum
is met."*

**B4. "Does not apply" is wrong for an unused allowance.** A cap with no relevant courses
renders *Does not apply — No courses touch this cap* (`context.ts:158`), which reads as an
exemption. Use *"Not used yet — 0 of 6 credits below the 60000 level used."* Keep *Does not
apply* for rows that genuinely cannot apply, such as MSCSE-along-the-way for a student who
already holds it.

**B5. "Needs your attention" is sorted by status, not urgency.** `attentionList`
(`src/ui/report.ts:324`) filters on `cannot_evaluate`, `needs_dgs_review`, `unmet`. For a
first-semester student it listed *Dissertation unanimously approved for defense by the
readers* and *Dissertation defense passed* — years away — while the research qualifier (due
mid-Spring 2028) and the qualifying examination sat outside it because they classify as
`in_progress`. Rank by deadline proximity; include `in_progress` rows whose deadline state is
`due_soon` or `overdue`; drop rows that are structurally unreachable this early — several
already say so in their own detail text (*"Not yet available: §4.5 requires all Ph.D.
coursework completed…"*).

**B6. The consent modal returns on every load and refuses Escape.** After accepting,
`localStorage`, `sessionStorage` and cookies are all empty; reloading brings it straight back.
Escape does not close it either — a native `<dialog>` with cancel suppressed. Remember the
acknowledgement (session, or 30 days) and let Escape close it. The alpha banner carries the
same message permanently anyway. If B2 puts the program choice in this dialog, keep that part
required and let only the acknowledgement be remembered.

**B7. Four buttons named "Import from PDF."** All four transcript rows expose a button whose
accessible name is exactly *Import from PDF*, with no `aria-label`, no `aria-describedby` and
no enclosing group label (`src/ui/external-upload.ts:578`, `src/ui/app.ts:1350`). Name each
for its row — *Import ND Ph.D. transcript*, *Import previous undergraduate transcript*, and
so on. The file inputs behind them are already named correctly.

**B8. The remove control is 28×32 px on a phone.** Below the 44×44 guideline for a
destructive control inside a list of course cards. Undo exists and is announced, so this is
polish, not correctness.

**B9. The footer is ~1,900 characters of unbroken prose.** Five distinct things — scope,
alpha warning, where the rules come from, the FERPA statement, the licence — in one grey
block. Give each a heading or a disclosure, and lift the privacy line to where the file-save
controls are.

---

## Suggested commits

Six, so the DGS can review and push them independently:

1. `Validate numeric input; out-of-range GPA cannot be evaluated (review R1)`
2. `Caps: approval-driven status on the CSE 4xxxx and 4+1 shared caps (review R3)`
3. `Conditional satisfaction: never "Met" while approval is pending; warn on over-cap credits (review R2)`
4. `Example data: per-row flag, honest banner, remove only the example rows (review R5)`
5. `Privacy wording matches measured network behaviour; shared-computer note (review R6, R7)`
6. `Blue-team usability pass B1–B9 (review 2026-09-18)`

Verify each the same way before shipping: `npx tsc --noEmit`, `npm test`, `npm run build`,
`npm run e2e`, plus `E2E_BROWSER=webkit npm run e2e` for anything that changed layout —
commits 3 and 6 both will. Append any new policy interpretation to `docs/DECISIONS.md`, keep
`docs/CLAUDE-HANDOFF.md` and `docs/STATE.md` current as you go, and put the two wording
proposals (W-CS1, W-P1) in `docs/WORDING-REVIEW.md` for the DGS to answer in his usual
numbered form.

---

## Not in scope

- **R4 (ADGS inside handbook quotes) — closed by the DGS, will not fix.** Do not add
  `.rule-quote` to the skip-list in `src/ui/first-mention.ts`.
- Decision F1 (2026-09-12) — the non-CSE over-cap spill to the total stays as it is.
- The transcript parser's accuracy against real PDFs, `courses.html`, and the print
  stylesheet were not reviewed on 2026-09-18.

## Verified working — do not regress

- No `innerHTML`, `outerHTML` or `insertAdjacentHTML` anywhere in `src/`; everything renders
  through `textContent` via `el()` in `src/ui/dom.ts`.
- The file loader rejects malformed input cleanly: a save file with a script-tag title,
  `credits: "abc"`, `season: "winter"` and `gpa: "four point oh"` was refused with *"This file
  has no valid entry term"*, left the existing courses untouched, and announced the refusal in
  a live region.
- Contrast passes WCAG AA on every pair measured; the lowest is the *Does not apply* pill at
  5.36:1.
- Status is never colour-only: text pill, coloured left border and a § citation.
- Remove has undo, announced as *"CSE 60641 removed. Undo"* along with *"Report updated: 6 of
  17 met · 5 in progress · 6 not yet."*
- Skip link, native `<dialog>` with `aria-labelledby`, correct implicit labels, `role="status"`
  regions, no horizontal page scroll at 375 px.
- `thresholdStatus` returns `cannot_evaluate` when a rules-sheet parameter is missing rather
  than passing silently.
