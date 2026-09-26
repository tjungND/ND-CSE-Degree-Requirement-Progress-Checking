# Where things stand (kept current by every session — read after CLAUDE.md and docs/CLAUDE-HANDOFF.md)

Last updated: 2026-09-26 (this session, branch `claude/setup-handoff-review-c38220`).

2026-09-26: **the transcript import was checked against 93 public sample transcripts** (registrar
keys, templates, credential-evaluator samples from 39 countries) and the parser rewritten where
they broke it: a column-header reader, a legend reader, term headers in a dozen calendars, new
course-code shapes, day-first dates, more degree wording, PeopleSoft transfer blocks. 88 of 93
fixtures read as expected; the other five wait on **seven questions for the DGS** listed in the
2026-09-26 DECISIONS rows (code-less Chinese transcripts, Thailand's calendar, unit-based credits,
per-row quarter conversions, Extension credit, adjacent-line conferral, grade scales beyond the
legend). Real sample PDFs were NOT downloaded (the rule needs the DGS's yes per file); the research
plan's needs-download list names 40-odd registrar PDFs worth fetching for end-to-end layout tests.


2026-09-22: **the Graduate School's two rules are in** (DECISIONS rows of 2026-09-22, both marked
"relaying the Graduate School"): at most six credits may count toward two degrees, with the
bachelor's-and-MSCSE courses using the allowance first (`phd.cap.sharedbs`, every Ph.D. student now
answers "Already counted toward…"); and a Notre Dame MSCSE's coursework counts toward the Ph.D. in
full, without transfer approval and outside §5.2's 24 (no longer on the §5.2 row or in the review
request). **Open, for the DGS to confirm:** the app applies neither §5.2's five-year window nor its
B floor to that MSCSE coursework, and treats only the MSCSE (not another department's Notre Dame
master's) as "the same discipline" — both flagged in `docs/HANDBOOK-REVISIONS.md` §4. The
pre-entry Notre Dame heading now says MSCSE / Ph.D. coursework rather than "graduate".

2026-09-22 (later): five more DGS items — the advisor summary's Why column lists the courses
counted; "Not yet" and "In progress" merged into "In progress" (an unmet row past its deadline
reads "Overdue"); the Notre Dame MSCSE's regular courses count toward §4.2's nine at Notre Dame;
a second advisor box; the opening dialog's testing sentence in red. DECISIONS rows of the same date.


2026-09-21: **the rules sheet moved into a shared drive — no code change was needed.**
`CSE-Degree-Checking-Rules` now lives at the top level of the shared drive **"CSE Department
Adminstration: Graduate Programs"**; before that it sat in the DGS's own "DGS things (CSE)" folder
in My Drive. A move keeps the file id, the published `/d/e/…` token and every tab gid, so all four
URLs in `data/sheet-urls.json` still resolve — checked anonymously the same day: each
`/pub?…&output=csv` still answers with Google's 302 to its CSV download host, on all four tabs.
What did change is ownership and access: the drive owns the file (no individual owner, so it no
longer leaves with the DGS), and access is now that drive's membership — the DGS, the Grad Admin
and one more staff member as Managers, the Assistant DGS as Content manager, and the **CSE
Faculty** group plus one staff member as Viewers. Docs corrected for the new location:
`data/README.md`, the `_comment` in `data/sheet-urls.json`, `README.md` (intro bullet and handoff
item 1, which asked for exactly this move) and `MAINTENANCE.md` (which said the sheet is one "you
own"). **Open, for the DGS to decide:** both pages call the sheet "accessible by faculty only"
(`src/ui/sheet-source.ts`, and `tests/sheet-source.test.ts` locks the footer's promise), which is
now slightly narrow — grad-program staff on the drive can open it too. Wording change, so it waits
for approval. Also still true and unrelated to the move: the sheet's Drive title now carries an
"ADD ONLY" warning after the name, while `SHEET_NAME` is the short name the pages print.

2026-09-20: **code tidy for readers and agents** — see the 2026-09-20 bullet in
`docs/CLAUDE-HANDOFF.md` for what moved where (app.ts is a third shorter; seven new `src/ui`
modules; engine helpers shared between the two programs; per-render caches on the course-rules
page). Behaviour unchanged except the add-a-course year default (Notre Dame date, not the device).
The three items the review left open were decided on 2026-09-20 (DECISIONS row).

2026-09-18 (evening): **two trim reviews, both applied.** The course-rules page first: a blue/red-team
review (66 confirmed findings, 55 fixed in `6921402`/`4c1d577`, the DGS's rulings on `last_offered`,
retired courses and the banner in `952ad24`), then a trim (`c9ca730`: 1,131 → 916 words, one column
and one control fewer; "Ineligible" for 4xxxx/5xxxx specialization in `5230694`; Load example follows
the tab in `8e0fe7f`). Then the self-check page and its three emails: 363 strings inventoried, 93
proposals, 87 accepted by two checkers each, and the DGS said "I will follow your suggestions" — the
75 that were not "keep" findings are applied (DECISIONS row "2026-09-18 (nineteenth)" lists the shape:
about 1,150 words off the page, the §4.6/§4.7 date fields hidden until candidacy, the prior-degree
controls and the 4+1 note folded, the advisor button on the finish card, the status key inside the
headline, the § cite inside the title, the sticky score bar hidden while the headline is on screen).
**The four proposals the checkers split on were decided on 2026-09-19 (P-3, P-52, P-63 applied; P-46 kept as is)**:
P-3 (drop the footer's "What is still being tested" fold, a duplicate of the strip's Details), P-46
(leave met caps out of the Grad Admin email), P-52 (drop the "Start here:" lead in the transcripts
callout), P-63 ("Clear everything" → "Clear"). The review's decision sheet (an artifact, link in the
session) marks every card Applied or Your call.

2026-09-18 (day): the interface review below (`docs/REVIEW-FIXES-2026-09-18.md`) is done except B6's
storage half.

2026-09-18: **the interface review of 2026-09-18** (blue/red team against the live Pages build at
`717c112`). The work order is `docs/REVIEW-FIXES-2026-09-18.md`, six commits; the DGS asked for commits
1 and 2 first. DONE so far:

- **R1 — numbers outside their own box's range are refused** (commit 1). `min`/`max` were decorative:
  nothing read `validity`, nothing clamped, and a GPA of 35 went to localStorage and came back as
  "Cumulative GPA 35.00 meets the 3.0 minimum" under a green Met pill; -2 read as a real deficiency; a
  course at 999 credits (box max 15) put "1005 pending review/approval" on the 60-credit row. One range
  table now lives in `src/engine/ranges.ts` (GPA 0–4.00, course credits 0–15, term year 2000–2040,
  bachelor's-awarded year 1970–2040) and is read by the form, the save-file loader, the transcript
  import and the engine. A refused value keeps its place in the box (`aria-invalid`, a `.field-error`
  message beside it, announced through the toast live region) and never reaches `Student`; the refusal
  survives re-renders through a `refusedValues` map keyed by `data-key`, since `render()` rebuilds the
  page from the record on every change. The §2.2 row returns `cannot_evaluate` for a GPA off the scale —
  the floor under a hand-edited file, which used to throw on `.toFixed()` for `"four point oh"`. A file's
  bad GPA is DROPPED and reported, not thrown on: `loadLocal()` shares that code and a throw there
  discards the whole record silently. Tests: `tests/ranges.test.ts`, `tests/scenarios/gpa-off-scale.json`,
  and an e2e block in `scripts/e2e/drive-app.mjs` (both engines).

  An adversarial pass over the finished change found six more, all fixed in the same commit:
  `gpa: null` in a record bypassed the guard and then threw in the §4.5 candidacy gate, taking the
  page down on load (it is now "not entered"); the three OTHER rows that compare the GPA to §2.2's
  minimum — §4.5 candidacy, §4.7 defense, §3.4's M.S. defense — still read the raw figure, so one
  report said both "cannot be checked" and "yours is -2.00" (they now read `usableGpa()`);
  `formatValue` ROUNDED the refused value, so 15.5 credits came back as "16 was not added" and a GPA
  of 4.001 as "4.00 was not saved" — a figure inside the range the same sentence demands; a refusal
  survived a transcript import and sat in red beside a row reading the transcript's own figure; the
  bachelor's SEASON select became a silent no-op while its year was refused; and the SECOND
  "Bachelor's degree awarded — year" box — the one in the transcript preview
  (`external-upload.ts`) — still ran the `>= 1970`, no-upper-bound guard, which accepted 9999 and
  thereby re-levelled every imported row to undergraduate.

  NOT fixed, deliberately, and put to the DGS: the external-transcript preview's per-row **credits**
  (box max 30, guard `v > 0`) and **year** (box min 1970, guard `v > 1900`) boxes are still
  decorative, and `validateStudent` range-checks only the GPA — a record written by the pre-fix
  build keeps its 999-credit course. Each needs a bound only the DGS can set (is 30 the real
  ceiling for an imported course; may an external course predate 2000?).
- **R3 — two cap rows ignored their own approval requirement** (commit 2). `phd.cap.fourk` (§4.2) and
  `ms.cap.sharedbs` (§3.5) now pass `approvalDriven: true`, so they read `needs_dgs_review` while a
  course is still waiting for the approval their own quoted sentence requires, instead of Met directly
  above the sentence naming those courses. `ms.cap.fourk` is deliberately untouched (§3.2 names no
  approval). Tests: `tests/scenarios/phd-caps-unapproved.json` (new), `mscse-prior-nd-undergrad-4xxxx`
  (expectation updated).

- **The DGS's bounds ruling** (same commit as R1). “Cap per-row credit at 15. That will be the maximum
  credit of any single course” — so 15 is the APP's bound, not the add-course form's: it holds in the
  transcript-preview rows (the box advertised 30 and enforced `v > 0`) and in a saved record, where a
  course carrying more loads with 0 credits and is reported. “Change the min of year to 2000. Do not
  have a maximum bound for the year” — one rule for every year, the bachelor's-award year included;
  no `max` attribute anywhere, so a student may record a term as far ahead as they plan. A stored TERM
  year is deliberately not corrected on load: unlike credits it has no safe fallback.
- **§3.5's shared-credit row** — DGS decision A: leave it. `approvalDriven` stays on `ms.cap.sharedbs`
  (it is correct where it fires) but it is INERT for the courses §3.5 describes, because `capRow` reads
  the sheet's per-course verdict while §3.5's approval is about the double-counting, and 123 of the
  live sheet's 129 CSE 6xxxx rows say a plain `yes`. Not worth an attestation while the sharing itself
  may leave the handbook — written up for the committee as `docs/HANDBOOK-REVISIONS.md` §9.
- **The rules fixture now mirrors the live sheet** (DGS: “the live sheet always wins”). All three tabs
  re-pointed at `data/snapshot.json`; five invented course ids gone (four swapped for the real live
  course with the same shape, CSE 50110 deleted outright); nineteen tests moved with it, every one
  re-pointed rather than deleted. CSE 60999 (blank verdict) is the one fixture-only row left, and its
  `notes` cell says so. **When a scenario turns on a sheet cell, check `data/snapshot.json` first** —
  three tests here were PASSING on premises the live sheet had falsified.
- **`any` is retired** (DGS 2026-09-18). The old shorthand for “listed under every §4.4.2 group” is out
  of `RESERVED_GROUP_CODES`, out of the parser and out of the three call sites that read it as “every
  group”; a course that belongs everywhere names all five, as the live sheet does. A leftover `any` is
  now reported as an undefined code and fills no group.

- **R2 — conditional satisfaction** (commit 3). The `needs_dgs_review` pill reads **“Conditionally
  met”** (W-CS1), except on a dissertation defended past §4.3's limit, which reads **“Eligibility at
  risk”** through a per-row `statusLabel` override — same status, same count, no new `Status` member
  (W-CS2). Credits a cap DISCARDS are `{ warn }` detail parts rendered as their own amber line rather
  than grey prose under a green pill; `detail` is untouched, so the copied messages and every fixture
  read as before. The dashboard gained `summary.conditional`: its own band on the ring, its own count
  in the headline (it was a parenthetical on “not yet”), its own place in the sticky bar, and a status
  key under the credit meters. 2b was CONFIRMED, not rewritten — `thresholdStatus` was already right,
  and `tests/conditional-satisfaction.test.ts` now pins the invariant across every scenario with
  `ms.cap.fourk` as the one documented exception.

- **R5 — the example banner tells the truth** (commit 4). `isExample` was a flag on the WHOLE record
  and sticky with it: load the example, add one real course, and the banner still read “Nothing here
  came from you” while its button offered to clear the lot. Every seeded row now carries
  `fromExample`, the banner counts them (“8 of these 9 courses are the example student's”), and
  **Remove the example rows** takes back exactly those — plus the milestones and attestations the
  example filled in, but only where the student has not since changed them, since an edited value is
  theirs. With nothing of the example left, the banner and the flag both go. Undo covers it (20 s).

- **R6/R7 — the privacy claim matches the measured behaviour, and shared computers are named**
  (commit 5). Two strings overstated what the page does: “The page's only network request is the
  read-only fetch of the public course rules” (singular, for five) and “Nothing is transmitted to the
  University or to any third party” (Google and GitHub each get an IP, a user agent and a referrer).
  Both now carry the DGS's approved W-P1 wording, the FERPA sentence stays, and `clock.ts`'s comment
  no longer cites the old promise. R7: the save card says what browser-local storage costs on a lab
  machine, and **Clear** is reachable from the END of the report as well as the top of the page,
  beside “Save to a file” so nobody clears work they meant to keep.

- **B1–B9 — the blue-team usability pass** (commit 6). B1 (first screen: contacts to the end, notices
  to one line, no empty summary above the inputs — the first import control moved from y=1104 to
  y=585 at 708×937, the first data-entry control from 20th in the tab order to 3rd), B2 (the program
  is asked in the opening notice, not defaulted to `phd` in silence), B3 (“15 of 9” became “15
  credits — the 9-credit minimum is met”, and the meters read `row.progress` instead of re-parsing
  the prose), B4 (an unused allowance is “Not used yet”, not “Does not apply”), B5 (“Needs your
  attention” ranks by deadline and drops what cannot be acted on yet), B7 (four import buttons, four
  names), B8 (44×44 Remove on a phone), B9 (the footer is five headed things, two of them
  disclosures). **B6 was NOT done and the reason matters**: Escape already closes the opening notice
  (drive-a11y.mjs has asserted it since 2026-09-05), and “remember the acknowledgement” reverses the
  DGS's recorded decision of 2026-09-03 that the gate shows on every visit. Put to him.

Everything in `docs/REVIEW-FIXES-2026-09-18.md` is now done except B6's storage half (above) and R4,
which the DGS closed. Two things the review did not cover are still open for him: §3.5's shared-credit
row is satisfied-looking for the courses §3.5 actually describes (decision A, `HANDBOOK-REVISIONS.md`
§9), and the advisor email still says “needs DGS review” where the page now says “Conditionally
met” — a different audience, so it was left alone rather than changed unasked.

2026-09-16 (hotfix): `bestMultiOrder` in allocate.ts was factorial — a Ph.D. student importing a

master's transcript of ten-plus courses (each `transfer`+`noncse`) froze the page at load. Now a

memoized depth-first search with a bound; same first-best order; tests/allocator-blowup.test.ts.

2026-09-16 (later): the courses.html **print stylesheet**, three defects found while mapping the
page for the embed work and deliberately left out of that change. `th:last-child { display: none }`
in the page's `@media print` block was written when the last column was the DGS's notes — it was
half of a pair (`.notes-cell` hid the cells, `th:last-child` the header) that removed the Notes
column from print. The notes left this page on 2026-09-09, so `.notes-cell` matched nothing and
`th:last-child` had moved on to hiding the LAST header of every table here: "DGS reviewed" on the
all-courses table and "Specialization" on each schedule card, while the cells under them still
printed. It only shows on paper wider than the 860 px card breakpoint — A4 portrait prints as
cards, where `thead` is clipped anyway, so it took a landscape PDF to see it. Both selectors are
gone, along with the rest of the dead `tr.note-row` / `.notes-cell` rules in the base and 860 px
blocks (nothing in `courses-page.ts` has generated a note row since 2026-09-09; the `:not(.note-row)`
guards in the TS and the e2e are harmless and were left alone). The contact card was the third:
printing strips its border and padding through `.masthead .contact-card`, which embed mode's
`html.embed .contact-card` outranks, so a framed page printed a bordered card where the standalone
page printed none — the print override now sits at the end of the file, after the embed rules,
because the two selectors carry equal specificity and only source order settles it. Verified by
printing to PDF before and after and by computed styles under emulated print media; the e2e
"course rules list" driver now runs that check on both the plain and the embedded page, which
needed a new `Emulation.setEmulatedMedia` translation in `scripts/e2e/webkit.mjs`. Still open and
NOT fixed: on wide paper the course table runs past the right edge of the page — pre-existing,
separate from these three, and a real fix means deciding which columns a printed page should drop.

2026-09-16: **embed mode (`?embed=1`) so both pages can sit inside a page on ND's WordPress**
(`sites.nd.edu`), from a spec the DGS brought in from a Cowork session that had already tested the
live site. The constraint that shapes everything: a site Administrator on ND's multisite has no
`unfiltered_html`, so WordPress strips `<iframe>`, `<script>` and `<style>` out of post content —
the page goes in through the active `iframe` shortcode plugin, and the resizing script through the
"Head, Footer and Post Injections" plugin's footer field. `src/ui/embed.ts` is the whole page side:
the mode is an explicit parameter (never sniffed from `window.top`), it trims the chrome the host
already supplies, and on `courses.html` it broadcasts the page height so the frame grows and
shrinks with the content. `index.html` takes the same trim but deliberately does NOT broadcast —
a frame stretched to its content height has no viewport, so the consent dialog would centre itself
thousands of pixels down and the toasts and sticky score would land below the fold; it keeps a
fixed frame with its own scrollbar, and tells the student that an embedded page's saved work lives
in the frame's storage (Safari blocks it entirely). Three things were found by measuring rather
than reading: **`requestAnimationFrame` never runs in a hidden tab**, so the first coalescer sent
nothing at all for a WordPress page opened in a background tab and latched `pending` so nothing
later was sent either (now rAF *and* a 100 ms timer, whichever comes first, plus a
`visibilitychange` re-measure); the spec's **20 000 px height cap would have hidden more than half
the course list** (117 courses measure 42 290 px at a 700 px column, where the table becomes one
card per course — the cap is now 100 000, and the parent trusts the number in a frame that cannot
scroll); and the page's own `#CSE-60641` links are dead in a frame that cannot scroll, so there is
a second, optional message asking the parent to scroll instead. Two pre-existing narrow-width
defects came out of the same work and are fixed: `.ov-item { white-space: nowrap }` had its
wrap-back keyed to 600 px while the card layout it pairs with starts at 860 px, so the overview
cards dragged the page sideways anywhere in the 601–860 px band (exactly a WordPress content
column), and `#app { padding-bottom: 76px }` was adding 76 px of blank page to `courses.html`,
which never renders the `.sticky-score` bar it makes room for. Verified end to end against a fake
WordPress host on a second origin using the snippet verbatim: frame grew 442 → 12 985 px, no inner
scrollbar, no trailing space. `tests/embed.test.ts` (10 assertions, the CI-enforceable half) and
new e2e legs in both engines, including one proving a parent origin outside the allowlist receives
nothing at all.

2026-09-13: a red-team pass over the engine, weighted to the Ph.D. side at the DGS's request. Forty
agents ran 108 invented Ph.D. scenarios through the real engine (not code-reading — every finding was
reproduced by executing `audit()`), then re-checked each other adversarially; a completeness critic
opened a second round on four gaps it could ground in the code. Thirteen confirmed bugs and eight
open questions came out; the DGS ruled on all eight (DECISIONS rows of this date) and everything is
fixed. The bugs, by area: **institution matching** — `isNotreDameInstitution` refused any hyphenated
spelling ("Notre-Dame"), silently zeroing a 4+1's credit and dropping their coursework out of the
review request, and two ad hoc copies of the same regex (transfer.ts, tracks.ts) drifted from it, one
of them also reading a BLANK university as Notre Dame so the §3.5 note promised credit the report did
not give; **ADGS/DGS wording** — literal `{{DGS}}` braces reached a Ph.D. student's screen, the
blanket rewrite defeated the per-course override the sheet is meant to carry, and the F8 §3.5 note
said "DGS" to MSCSE students on the page and in the e-mail they send; **§4.4.1** — an unlisted course
at the 50000 level or below 40000 was invisible to core knowledge, because two credit-side branches
never set the flag the knowledge side reads; **deadlines** — a granted extension had no time bound
(now one semester, the DGS's ruling), a dissertation defended years past the 8-year limit read "met"
on both its own row and the time-limit row, and a blank rules-sheet cell plus a passed deadline
produced "Overdue — forfeiture" for a student who had finished everything; **credit** — an unreviewed
§5.2 candidate's over-cap credits inflated the 60-credit total against that course's own line, cap
rows printed raw floating-point ("2.666666668 of the 9"), and a C- beat its own live retake in the
§4.4.2 tie-break, throwing the in-progress credit away. The DGS's eight rulings added: warnings for a
cross-origin same-term duplicate and for a future-dated final grade; a review request that stops
asking about courses no ruling can change; the one-semester extension; the confirmation that a 4+1's
pre-entry ND coursework does NOT count toward §4.2's nine credits "earned at Notre Dame during the
degree program" (the nine-credit row now says so); and four-way course marks — green ✓ counts, blue ◐
in progress, amber ● pending approval, red ✕ does not count.

2026-09-12: a deep-review session, asked to check the engine against the documents in the DGS's
separate rules folder (outside the repo) — a September revision draft of the CSE handbook, the
Grad School's Academic Code, the DGS Handbook, and the 4+1 guidance memo. None of the four is
promoted into docs/ yet; docs/CSE-Graduate-Handbook-July2026.pdf stays the coded-against source of
truth (**remind the DGS, next time he says the handbook has been revised, that this still needs a
docs/DECISIONS.md / docs/HANDBOOK-REVISIONS.md entry and the PDF swapped in**). A 20-agent workflow
diffed the two handbooks line by line and extracted the other two documents, then paired a
code-mapping check against every finding with an independent adversarial re-check before reporting.
Three findings, all approved and shipped (`6477ca0`): the Academic Code §4.3 grade floor (a passed
grade below C no longer counts toward any credit-hour requirement, though it still satisfies §4.4.1
core knowledge — `grades.ts:passesCreditFloor()`); §3.4's new "…earned at Notre Dame" (a master's
project/thesis now fails to transfer into the MSCSE the same way it already failed to transfer into
the Ph.D., on both the ordinary §5.2 path and a 4+1's asUndergraduate path); and §3.5's new "…CSE
REGULAR courses…" (the bachelor's-and-MSCSE shared-credit selection now requires
`courseType === 'regular'`). A fourth finding — §4.5/§4.7's "second failure results in forfeiture of
degree eligibility," untracked by the engine — is recorded as explicitly deferred: candidacy and
defense outcomes are handled outside the app. Six new test fixtures, one edited assertion.
Also fixed (`0a15566`), flagged by the DGS mid-session from a separate red-team report: the "Ask the
DGS to review" card's copy button read "Copy review request for 0 courses" when the only pending
item was F8's plain-language note (no course line at all) — the button and the header chip now share
one phrase (`review.ts:reviewRequestSummary()`).

Last updated before this: 2026-09-11 (the first Claude Code Desktop session on the DGS's Mac, still
running, branch `claude/setup-handoff-review-c38220`; the Cowork session that ran Sep 4–6 ended at
~15:00 UTC — see "Session protocol" in `CLAUDE.md`).

## Answered by the Graduate School (2026-09-10, evening) — closed

The question the DGS put to them: does §5.2 criterion 2 bar a 4+1 student's §3.5 coursework from
following them into the Ph.D.? Their answer went much further than the question, and the app now
implements it (DECISIONS row of that date):

- **60000-level and above taken as an undergraduate counts toward the Ph.D. in full**, "even those
  above and beyond the usual 24 allowed for transfer" — so it is not transfer credit at all and never
  touches §5.2's cap.
- **Below the 60000 level**, up to six credits, inside §4.2's own allowance.
- **The one hard limit:** no course counts toward three degrees. A course already spent on the B.S.
  and the MSCSE counts nothing in the Ph.D.
- **On the MSCSE side**, coursework shared with the bachelor's is capped at six credits (§3.5).

The app cannot know which degrees a course was spent on, so it asks the student, per course — and
only where the answer can change something: Notre Dame undergraduate coursework, for a student who
holds a Notre Dame master's. Nothing counts until they answer.

## Deployed

`origin/main` on GitHub deploys to https://tjungnd.github.io/ND-CSE-Degree-Requirement-Progress-Checking/
(self-check) and `/courses.html` (course rules). Everything described below is merged and live as of
`fb77d20` (2026-09-13); the DGS pushes every commit himself, so a branch named here is history, not a
queue. Recent commits, newest first:

- branch `claude/setup-handoff-review-c38220` (merged):
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
  2026-09-11: the Notre Dame upload row is named for the tab the student picked — "ND Unofficial
  MSCSE Transcript" / "ND Unofficial Ph.D. Transcript" (`ndRowLabel()`; "Current ND Unofficial …" since later that day); the note above the four
  rows covers both 4+1 transcript shapes; and an MSCSE student's own undergraduate transcript is
  handled end to end. Its 40000-level CSE courses MAY count (DGS: "they 'may' count, subject to all
  other constraints, so they should be listed … for further decisions & review"), so they are
  offered in the preview, asked about — the MSCSE's question is about two degrees, not three —
  counted only provisionally inside §3.2's allowance and §3.5's shared six credits, and listed in
  the review request until the "DGS approved my course(s) below the 60000 level" attestation is
  ticked. `priorNdShape()` reads the sheet's `dgs_approval` for prior Notre Dame coursework in BOTH
  programs now. Three surfaces (preview, coursework table, review card) each had their own copy of
  "can this undergraduate row matter?" and all three hid coursework the report was counting; they
  share one engine predicate, `priorNdUndergraduateCanCount()`. The §3.5 track note, which still
  described the rule the Graduate School replaced on 2026-09-10, was rewritten for both programs.
  Also 2026-09-11: the MSCSE tab says nothing about the Ph.D. qualifying examination. §4.4.1 core
  knowledge and §4.4.2 specialization are §4.4's, and the MSCSE has no §4.4 — so for an MSCSE
  student the course lines carry no core note, the review request asks no core question, a
  core-sounding TITLE no longer keeps an undergraduate row in the preview or the coursework table,
  and every note that explained undergraduate coursework by what §4.4.1 allows has an MSCSE
  wording. The sweep also caught two Ph.D.-only paragraphs an MSCSE student was being shown: the
  Grad Admin card's list of forms, and the entry-term hint's deadlines (§4.3, §4.4, §4.4.3, §4.5).
  Guarded by tests/mscse-no-qualifier.test.ts (engine, review request and both e-mails — with a
  clause that fails if the Ph.D. ever stops matching, so the guard cannot go vacuous) and by step 11
  of scripts/e2e/drive-transcript.mjs (the whole rendered page, and an external transcript preview).
  And §3.5's window, the same evening: for an MSCSE student a 60000-level course taken as an
  undergraduate counts only from the second semester of the junior year on — the three fall/spring
  semesters ending with the bachelor's award term. The Ph.D. keeps every term, and 40000-level
  coursework has no window; both are deliberate (DECISIONS row of 2026-09-11, fourth).
  Then sixty-eight invented MSCSE corner cases (8 families: the ND 4+1, arrivals from other
  universities, a gap year, non-CSE and EE Notre Dame bachelor's degrees, a prior M.S. in another
  field, transcript shapes, arithmetic boundaries) were run through the engine against the published
  sheet. Four defects came out and all four are fixed (DECISIONS row of 2026-09-11, fifth): CSE 68901
  never satisfied §3.2's six project/thesis credits because the sheet types it `research` — the two
  course IDs now decide the project pool for the MSCSE, whatever the cell says; a 0-credit course is
  allowed but warned about and confirmed before it is added; the MSCSE gained the §5.2 transfer row
  the Ph.D. always had (`ms.transfer`, shared builder in requirements/transfer.ts); and two sentences
  were fixed — a met row no longer tells the student what to register for, and a same-term duplicate
  no longer identifies itself by the term both rows share. The fixture CSV now mirrors the live sheet
  for CSE 68901, so the thesis scenario passes only because of the new rule.
  And §5.2's five-year window now binds the MSCSE as well as the Ph.D. — new Parameters key
  `ms_transfer_window_years` = 5, added to the live sheet (Changelog row 33) and to the fixture, the
  sample CSV and data/README.md. Until then the check did not run for a master's student at all.
  Then sixty-eight invented Ph.D. students (the same eight-family shape as the MSCSE run): seven
  defects fixed and five §4 readings ruled (DECISIONS rows of 2026-09-11, seventh and eighth) — the
  review request honouring a recorded transfer approval, the non-CSE cap on undergraduate ND
  coursework, residency reading the classified list, case-/space-insensitive course ids, the
  over-cap line naming the binding cap, quarter credits flagged until the DGS's row exists, a set of
  wording fixes; and the rulings: nine regular credits at ND, §4.4.2 satisfied by any ND course,
  the transfer checkbox settling only reviewed courses, a master's project never transferring, and
  summer entry read as the following fall.
  2026-09-12: the Courses tab's `adgs_approval` value names the reviewer per course (the parser was
  skipping those rows — the vanished 40xxx courses); the program default covers the rest.
  2026-09-14: schedule freshness per row by `last_offered`; `current_semester` retired.
  2026-09-13: copy dialogs open the email app (mailto: To/Cc/Subject, body when short).
  2026-09-12 (eleventh): quarter × .66, trimester × .88 — the DGS Handbook's table, on the sheet.
  2026-09-12 (tenth): multi-campus systems — the campus is a required, pre-filled choice in the
  preview (`src/transcript/campus.ts`).
  2026-09-12 (ninth): UC San Diego's tiled watermark now names the school in full (`watermarkName`).
  2026-09-12 (eighth): the wording table — everything fixed except the two §3.2 citations the DGS
  kept (handbook ambiguity, HANDBOOK-REVISIONS §7). The red-team page is closed.
  2026-09-12 (seventh): F8 — the 40000 floor, the candidacy row's §4.5/§2.2 conditions, the
  4+1 "more than two" note for the DGS (`reviewFlags`); items 1 and 3 recorded as not errors.
  Only the wording table remains from the red-team page.
  2026-09-12 (sixth): F7 — only a 4+1's undergraduate 60000-level coursework earns credit
  (`integratedBsMs`, asked/pre-filled under Your standing); a pre-entry ND course with no prior
  program opens no §5.2 row. F8 and the wording table remain.
  2026-09-12 (fifth): the §5.2 pro-rata factors are sheet parameters (`quarter_credit_factor`,
  `trimester_credit_factor`; live rows 42–43).
  2026-09-12 (fourth): F5 (the §5.2 box shown only when it can act, the explicit-approval rule
  stated beside it) and F6 (trimester credits × 0.88, three-way credit-system select in the
  preview). F7, F8 and the wording table remain.
  2026-09-12 (third): the red-team page's F1–F4 — over-cap non-CSE credit counts toward the total,
  a group pin is a preference (the matcher covers the most groups and the page pre-fills the
  group), nine regular ND credits condition the §4.4 umbrella, the §3.4 route is read off the
  record and both rows are alternatives while undecided — plus the general rule: choices the
  record can settle are pre-filled with a toast (`autoSelect`). F5–F8 and the wording table remain.
  2026-09-12: the ADGS decides everything for MSCSE students. One boundary rewrite
  (`decisionWording`, `applyDeciderRule`) turns every standalone “DGS” into “ADGS” on the MSCSE
  tab — engine text, page, both e-mails — and the review request goes to adingler@nd.edu; the
  Ph.D. is untouched. The course-rules page says whose approval per column; the sheet keeps
  `dgs_approval` (README row explains it means the ADGS in the MSCSE column).
  The mirror rule too: the Ph.D. tab cites §3 only in the §3.5/§3.6 notes and the along-the-way row
  (the e2e sweeps for it).
  The Previous Undergraduate row refuses a transcript with ungraded courses (a completed bachelor's
  is required), and nothing on the MSCSE tab cites any part of §4 (the guards forbid it).
  The transcript's own “Quarter” in a term header now sets the credit system: the preview shows it
  as a checkbox, rows carry `creditSystem`, and credits convert at 2/3 unless the DGS's
  `credit_system` cell says otherwise (DECISIONS row, twelfth).
  And on the MSCSE tab the 4+1 question is gone: the app applies the top two 40000-level CSE
  courses to both degrees (best grade first), saves 60000-level coursework for the MSCSE, and each
  line says what it WILL apply to (DECISIONS row, tenth — superseding the ninth).
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
3. The Courses tab keeps the FIRST of two rows with the same course_id + rules_effective_term (the
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
6. The 4+1 questions are settled (DECISIONS rows of 2026-09-10 and 2026-09-11): the Graduate School's
   own answer replaced the department's reading — undergraduate Notre Dame coursework is not §5.2
   transfer credit at all — and a 4+1 transcript's entry term is the term after the last degree it
   awards. `phd_senior_grad_credits_max` was withdrawn with the reversal and is parked in the sheet.
   Nothing is open upward any more; what is left is the HANDBOOK's silence, in
   docs/HANDBOOK-REVISIONS.md §4, which now carries the Graduate School's wording verbatim and the
   three sentences the handbook needs. Add to it, when §3.2 is next revised, that a 40000-level
   course counted toward the MSCSE needs the advisor's and the DGS's approval — the app enforces it
   from the sheet's `counts_toward_mscse = dgs_approval`, and the handbook says nothing.

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
  Embedding is now supported as well (`?embed=1`) — README § "Embedding these pages in a WordPress page".
- **Waiting on the DGS:** paste `docs/wordpress-footer-snippet.html` into sites.nd.edu → Settings → Header and
  Footer (the plugin needs activating first), switch page 2960's shortcode to `?embed=1` with `scrolling="no"`,
  and confirm it looks right on the real theme. Until then the fixed-height shortcode still works.
- Housekeeping: `.git/stale-locks/` and `.git/objects/*/tmp_obj_*` litter in the Mac clone came from the
  Cowork VM (it could not delete files) — safe to remove. (The starter kit — `START-HERE.md`,
  `KICKOFF-PROMPT.md`, `reference/`, the seed xlsx, `cse_courses.csv` — was removed 2026-09-14.)

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
