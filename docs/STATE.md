# Where things stand (kept current by every session — read after CLAUDE.md and docs/CLAUDE-HANDOFF.md)

Last updated: 2026-09-06, ~18:30 UTC (the first Claude Code Desktop session on the DGS's Mac,
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

Nothing pending: the DGS answered the six items listed here on 2026-09-06 (evening) — see the
DECISIONS rows of that evening — and the wording review (W1–W47) is closed. A student-facing string
Claude drafts is now listed, numbered, in the reply that delivers it, for the DGS to edit.

## Open work (optional)

- Parser samples: any transcript layout that misreads in practice → `npm run diagnose`, sanitize with
  `npm run sanitize` / `scripts/sanitize-scan.py`, then pin it with an INVENTED fixture (never a
  sanitized real file; sanitized files carry neutral names and never enter the repo).
- Hands-on full pass in real Safari and on a phone; email round-trips (review request and advisor
  summary pasted into Gmail — tables, red bold names/deadlines).
- First ExternalCourses rulings as review requests arrive.
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
