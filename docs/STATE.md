# Where things stand (kept current by every session — read after CLAUDE.md and docs/CLAUDE-HANDOFF.md)

Last updated: 2026-09-08 (the first Claude Code Desktop session on the DGS's Mac, still running,
branch `claude/setup-handoff-review-c38220`; the Cowork session that ran Sep 4–6 ended at ~15:00 UTC —
see "Session protocol" in `CLAUDE.md`).

## Deployed

`origin/main` on GitHub deploys to https://tjungnd.github.io/ND-CSE-Degree-Requirement-Progress-Checking/
(self-check) and `/courses.html` (course rules). Everything below `58044dc` is live or awaiting the DGS's
push; the DGS pushes every commit himself. Recent commits, newest first:

- branch `claude/setup-handoff-review-c38220` (this session, awaiting the DGS's merge-and-push):
  Safari's engine in the e2e run — `E2E_BROWSER=webkit npm run e2e` (Playwright's WebKit build, the
  same four drivers, screenshots in `.e2e-out/webkit/`); the one-line preview rows keyed on the
  recorded 560 px (they were keyed on 600 px, so 1100 px windows showed two-line rows);
  `checkCompactPreview` measures the Master's-slot preview at 1400 and 1100 px in both browsers.
  Then the DGS's answers to the six open items: wording review closed (file removed), the two-year
  "Taken as" rule only for transcripts that state no level, the opening notice keeps asking, the
  §4.5 examination is "Oral Candidacy Exam (OCE)" everywhere the wording is ours.
  Then the evening batch (DECISIONS rows of 2026-09-06 evening; details in the handoff): the OCE name in
  full once per surface, then "OCE"; the §5.2 graduate-status rule with the new "Bachelor's degree
  awarded" term; the manual form's university list, Title Case and two Level choices; the DGS/Grad Admin
  split (a "Ask the Grad Admin to process" card + processing request, a fourth advisor-summary list);
  "Qualifying examination — all components"; a check-before-you-send dialog on every copy button; the
  vanishing review card fixed (undecided ExternalCourses rows, `none`, Undo survives re-renders).
  Second pass after the DGS's review: the bachelor's term is required (pre-filled) in the Master's-row
  preview of a combined record; the award term is absolute (no `transferable = yes` override); the
  processing request carries the edit markers, an attachments line, one table per met requirement
  (from the engine's `satisfiedBy`), and its button saves the self-check file; the copy dialogs walk
  through numbered steps and lead with an emphasised "the following message has been copied to your
  clipboard" line above the message. ExternalCourses duplicates: the last row wins.
  Late evening (four more DGS items): the Grad Admin button is active on met requirements alone (they
  count as items); "Taken as" reads "Undergraduate student" / "Graduate student" — the student's status,
  not the course's level — in the preview, the manual form and the notes; the review request and the
  engine keep university names as the record spells them (no upper-casing); the bachelor's date is also
  read from "Degree Completion Date" / "Conferral Date" / "Date Conferred" lines, before or after the
  degree name, and from "05/2024" (both parsers). 2026-09-07: "UG student" / "Grad student"; semesters
  in table cells read "FA26" / "SP25" / "SU25" (`termShort`, tooltip = full name); prose unchanged;
  the compact preview shows one header, "Taken as", over the dropdown column. A pre-approved transfer's
  line no longer says "pending DGS review"; its card is "In progress" until the Grad Admin has processed it.
  Undergraduate wording: "Courses taken as an undergraduate student do not transfer, whether or not the
  course itself is a graduate course (§5.2)", and every undergraduate course line now carries that reason.
  `category_group` may name several §4.4.2 groups (`hcc;dsai`), so a course can be worth a choice of
  two or three and not only one or all five; both pages follow, and referenced requirement names are
  short ("24 regular-course credits") with the full title on hover.
  Each course now lists every requirement it counts toward (and what it will count toward once
  passed), and a course that can fill any §4.4.2 group says which group is still needed.
  Usability pass 2026-09-08 (six reviews, 51 findings): twelve fixed — see the DECISIONS row. Still
  open for the DGS, in rough value order: collapse the "Who to contact" card into a `<details>` on
  phones (it costs 1.6 screens before "Transcripts — start here" on both pages); move the
  `max-width: 900px` breakpoint to 1077 px and `1120px` to 1157 px (at 901 px the inputs column
  collapses to 443 px, and 1121 px is genuinely narrower than 1120 px); deep links from an attention
  row to the field that fixes it; a sticky column header on the course-rules table (needs a nested
  scroll region — the Safari class that regressed on 2026-09-06); `inputmode` on the numeric fields;
  a spoken expansion beside "FA26"; hiding the 363 "—" placeholder lines on the phone course cards;
  and folding the Grad Admin card when it has nothing to process.
  Institution names are spelled out everywhere a person reads them ("Georgia Inst. of Technology" →
  "Georgia Institute of Technology"), and the sheet matches either spelling.
  2026-09-08, second batch: "ID" courses (Georgia Tech industrial design) and "Georgia Inst. of
  Technology" now parse; a Master's that took three years is no longer split as a 4+1 (the two-year
  rule needs a bachelor's named on the transcript); and ExternalCourses gained `credit_system`
  (quarter/semester) so quarter credits convert from the student's own transcript, exactly, with
  `nd_credits` kept as a fixed per-course override.
  Two bugs the DGS found on 2026-09-08: a preview row whose year the parser missed was forced onto one
  line and spilled out of the card, cutting off "Taken as" (compact is now only for fully-read rows);
  and importing a Master's transcript reset a bachelor's term the student had entered (a hand-set term
  now wins, and the preview says where its value came from).
  Today's date now comes from the site's own server (same-origin `Date` header) and is read in Notre
  Dame's time zone, established as the first step on the loading card; the device clock is the
  fallback and the card says when it was used.
  Prior Notre Dame rows are re-levelled whenever the bachelor's award term changes, so importing the
  transcript and setting that term now give the same result in either order. Standing card: the chip says
  "current semester", the entry-term legend names the program, and "Bachelor's degree awarded" is required.
  The sign-off row is "Courses still to be approved or processed", grouped by who must act, and says
  "Needs DGS review" only when the DGS actually has a course to decide.
  The Courses tab's `offered_now` / `offered_next` columns drive two cards, "On the schedule", each
  listing its courses with every attribute but "Typically offered", "DGS reviewed" and the notes,
  plus a filter on the table; both say/hide themselves while the sheet is blank ("Not released
  yet."). Overview cards size to their content, so one course fits on one line (2026-09-09).
  The page is fluid: it fills the window at any width, both columns grow, and paragraphs keep a
  100-character measure (2026-09-09). The 1120/900/600 px breakpoints are unchanged.
  "Bachelor's degree awarded (required)" is on the Ph.D.-slot preview too, and its year box fits
  four digits beside the spinner (2026-09-09).
  Johns Hopkins is recognised from "JHU" and UC San Diego from "UCSD" when the transcript shows the
  name only as an image; the JHU dotted course code ("EN.601.433") is read, a page watermark no
  longer supplies the name, and such a guess is editable in the preview (2026-09-08, 2026-09-09).
  Three parser faults found while reviewing that: a degree heading on its own line did not open the
  degree block (a completed Master's read as not completed, halving the §5.2 cap), a section number
  was read as the credits, and a Winter or Intersession term inherited the previous season.
  ExternalCourses `transferable` takes `dgs_approval` beside `yes`/`no` (2026-09-08): a course
  outside the usual CSE ground that transfers when it serves the student's dissertation. It stays a
  candidate — in the review request, out of the Grad Admin's processing request. The rule is
  named and never explained at the student: whether the course serves their research is settled
  between the advisor and the DGS, so every surface says only that the decision is open. The §5.2
  card now also names the fourth kind of pending course, a listed row whose cell is still blank,
  which it used to leave silent.
  Short forms in the dense places (ten spots the DGS approved from screenshots): the category names
  through `src/engine/short-names.ts` (OS, Alg, Comp Arch, HCC, Arch, DS/AI, Sys/Soft), and
  "Notre Dame" → "ND" as hand-edited literals, in the "Counts
  toward" chips, the §4.4.2 row's lists, the group picker, the report's credit meters, the
  previous-transcript preview notes, the coursework group headings and the "ND Unofficial Transcript"
  row. Course titles, requirement card titles, handbook quotes, the glossary, the whole course-rules
  page and every copied e-mail keep the full names — the DGS decided those three explicitly.
  The course-rules page no longer carries "Listed under every category" as a sixth category: a course
  the sheet marks `any` sits in each of the five real cards, and a note says a course listed under
  several categories can fill only one of them.
- `58044dc` docs: the session protocol for Claude Code Desktop (one session, Claude commits, the
  DGS merges and pushes); `4a346db` rules-sheet snapshot (the sheet changed 2026-09-06);
  `a7a2669`, `1f16935` docs: STATE.md, WORDING-REVIEW.md, `.claude/worktrees/` ignored.
- `07888ee` review request: "(You may edit anything above this line)" above the divider
- `db9e0a0` preview rows: flexbox instead of subgrid (Safari mis-rendered the subgrid)
- `ecab4db` transcript rows: inactive Import/Remove buttons while a preview is open; credits/grade/term
  locked for text-layer imports; one-line preview rows
- `aa8f29d` rules load: all four sheet tabs at once, each request hedged after 2 s and retried
  (Google's publish-to-web endpoint stalls ~17% of requests at any concurrency — measured)
- `1ef501f`, `e57db89` (earlier loader versions), `665333b` (transcript preview, per-course marks,
  review request to the DGS only, advisor summary v3), `4043cf7`, `d686ab8`, `15984d5` — see
  `docs/DECISIONS.md` (newest first) and `docs/CLAUDE-HANDOFF.md`.

## Verified so far / still to look at

- Everything above passed `tsc`, `npm test` (192), `npm run build` and `npm run e2e` (Chromium, with
  axe) before it was committed. Since this session the e2e run also passes on **Safari's engine**
  (`E2E_BROWSER=webkit npm run e2e`, WebKit 26.6 through Playwright) on the DGS's Mac: all four
  drivers — pdfjs, the OCR leg, file inputs, the modal dialog, axe-core, the 390 / 820 px layouts.
  Chromium and WebKit differ by 1–2 px in row heights and column positions, nothing else.
- The one-line preview rows after `db9e0a0`: verified in WebKit AND Chrome at 1400 px (preview
  content box 642 px) and at 1100 px (582 px) — once the CSS threshold was aligned to the recorded
  560 px (it was 600 px). Cropped screenshots: `.e2e-out/webkit/combined-preview-1400.png` and
  `-1100.png` after a run. A look in real Safari is still welcome — Playwright's WebKit build is
  Safari's engine, not Safari's window (fonts, scrollbars and form controls can differ slightly).
- Live loads measured from the DGS's Mac after `aa8f29d`: 0.4 s, 0.4 s, 0.8 s, 1.5 s typical; a stalled
  tab costs ~2 s (hedge); a tab whose request AND hedge both stall costs ~7 s (fresh attempt). A second
  hedge at ~4 s would trim that last case — only worth doing if students report waits.

## Open for the DGS (decisions, not code)

1. The evening batch's wording (listed, numbered, in the reply that delivered it): the Grad Admin card
   and processing request, the copy dialog, the bachelor's-award notes, the two Level labels, the
   rewordings around the two roles. Say "Sn: …" to change any of them.
2. Two 2026-09-01 notices still say the rules are "exactly the rules the DGS and the Grad Admin use to
   determine requirement satisfaction" (handbook.ts RULES_ACCURACY_NOTICE, courses-page.ts) — under
   the two-roles split the DGS alone determines; keep or reword?
3. The Courses tab keeps the FIRST of two rows with the same course_id + effective_term (the
   ExternalCourses tab now keeps the LAST, DGS 2026-09-06) — should the Courses tab follow?

## Open items for the DGS

4. `docs/HANDBOOK-REVISIONS.md` (new, 2026-09-09) lists the places where the answer belongs in the
   handbook rather than in the app: §4.4.2's silence about when a specialization course may be taken,
   the §4.2 / §5.2 disagreement about the five-year window, §4.5 and a student who already holds the
   MSCSE, §3.5's senior-year 6xxxx courses against §5.2's graduate-status rule, and §4.2 and courses
   below the 60000 level. For the CSE graduate committee; the §5.2 items may have to go to the
   Graduate School.
5. The Courses tab is now 321 rows, not 371 — the DGS deleted 50 courses on 2026-09-09 that "never
   appear in the class list in any term from Summer 2005 to Fall 2026, including the 49xxx elective
   placeholders, CSE 48100 and CSE 60801" (Changelog row 19; a CSV copy of the deleted rows was
   kept), and set `active = no` on 169 courses last offered Fall 2021 or earlier (row 20). Nothing to
   do; noted because a deleted row is normally the thing NOT to do — a student who took the course
   would read "not in the rules sheet". These 50 were never taught, so no student can have taken one.
   The committed `data/snapshot.json` lags the sheet by up to six hours, so a fetch and the snapshot
   can disagree for a while; the deployed page always reads the live sheet.

## Open work (optional)

- Parser samples: any transcript layout that misreads in practice → `npm run diagnose`, sanitize with
  `npm run sanitize` / `scripts/sanitize-scan.py`, then pin it with an INVENTED fixture (never a
  sanitized real file; sanitized files carry neutral names and never enter the repo).
- Hands-on full pass in real Safari and on a phone; email round-trips (review request and advisor
  summary pasted into Gmail — tables, red bold names/deadlines).
- First ExternalCourses rulings as review requests arrive.
- Chrome e2e flake (2026-09-06/07, three times in one night, never on WebKit): a driver's FIRST page load
  times out — even at the 60 s wait now in session-common.mjs — and the same driver passes on a
  re-run (`E2E_ONLY=<name>`). Nothing in the page; look at cdp.mjs's session start (a fresh target
  per session, no wait for the load event after `Page.navigate`) before trusting a red run.
- Link both pages from cse.nd.edu; remove the alpha banner when ready (the opening notice is separate).
- Housekeeping: `.git/stale-locks/` and `.git/objects/*/tmp_obj_*` litter in the Mac clone came from the
  Cowork VM (it could not delete files) — safe to remove; `START-HERE.md` / `KICKOFF-PROMPT.md` could
  move to `docs/history/`.

## Working in Claude Code Desktop (the Code tab)

- One long-lived session for this repo, never archived. Desktop runs it in its own git worktree under
  `.claude/worktrees/<name>/` on the branch `claude/<name>`, created from `origin/main` — so the DGS
  pushes `main` before starting the session, and the session runs `npm ci` first (a worktree starts
  without `node_modules`; the WebKit build for `E2E_BROWSER=webkit` is outside the repo, one-time
  `npx playwright-core install webkit` per Mac).
- The cycle: the DGS asks → Claude changes, verifies, shows the result → revisions → Claude commits on
  the branch (fetching and merging `origin/main` first, since the sheet-sync Action commits there) →
  Claude ends with the one Terminal line the DGS pastes to merge and push:
  `cd ~/degree-audit-app && git pull --ff-only && git merge --ff-only <branch> && git push`.
  GitHub Pages deploys `main` within a minute or two.
- Claude never pushes; "Continue in → Claude Code on the Web" and "Create PR" would push a branch, so
  they are not used for this repo.

## FERPA reminders that survive every session

- No real transcript is ever read by Claude (Cowork, Claude Code or otherwise): sanitized copies only,
  under neutral names; their original file names carry student names and must not appear in code,
  fixtures, docs or commit messages.
- The app itself sends nothing anywhere but the read-only rules fetch — keep the page's promise true.
