# Where things stand (kept current by every session — read after CLAUDE.md and docs/CLAUDE-HANDOFF.md)

Last updated: 2026-09-06, ~15:00 UTC (end of the Cowork session that ran Sep 4–6; work continues in
Claude Code Desktop on the DGS's Mac from here — see "Session protocol" in `CLAUDE.md`).

## Deployed

`origin/main` on GitHub deploys to https://tjungnd.github.io/ND-CSE-Degree-Requirement-Progress-Checking/
(self-check) and `/courses.html` (course rules). Everything below `07888ee` is live or awaiting the DGS's
push; the DGS pushes every commit himself. Recent commits, newest first:

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
  axe) before it was committed. Chromium screenshots only: **Safari cannot be run in the Cowork
  container** — the subgrid incident above is why. In Claude Code on the Mac, Safari's engine can be
  checked directly (Playwright WebKit, or `open -a Safari`).
- Pending the DGS's eye: the one-line preview rows in Safari after `db9e0a0` (report if anything overlaps
  or overflows).
- Live loads measured from the DGS's Mac after `aa8f29d`: 0.4 s, 0.4 s, 0.8 s, 1.5 s typical; a stalled
  tab costs ~2 s (hedge); a tab whose request AND hedge both stall costs ~7 s (fresh attempt). A second
  hedge at ~4 s would trim that last case — only worth doing if students report waits.

## Open for the DGS (decisions, not code)

1. **Wording review** — `docs/WORDING-REVIEW.md` lists every student-facing string Claude drafted
   (W1–W47) with where it lives. Reply with a numbered list ("W3: say … instead"); Claude applies and
   re-runs the checks.
2. The two-year "Taken as" rule runs only in the Previous Master's row and will mis-prefill a part-time
   M.S. spanning more than two years (the preview asks students to check) — confirm or change.
3. The Sep 6 request about undergraduate rows was cut off after "If it is relevant," — current behaviour
   (name the core area it may satisfy / satisfies) was kept; say if something else was meant.
4. Whether the opening notice should remember the acknowledgment for 30 days per browser (W4).
5. Two glossary entries flagged as least certain: "Full-time" and "Candidacy exam" (W24).

## Open work (optional)

- Parser samples: any transcript layout that misreads in practice → `npm run diagnose`, sanitize with
  `npm run sanitize` / `scripts/sanitize-scan.py`, then pin it with an INVENTED fixture (never a
  sanitized real file; sanitized files carry neutral names and never enter the repo).
- Hands-on full pass in Safari and on a phone; email round-trips (review request and advisor summary
  pasted into Gmail — tables, red bold names/deadlines).
- First ExternalCourses rulings as review requests arrive.
- Link both pages from cse.nd.edu; remove the alpha banner when ready (the opening notice is separate).
- Housekeeping: `.git/stale-locks/` and `.git/objects/*/tmp_obj_*` litter in the Mac clone came from the
  Cowork VM (it could not delete files) — safe to remove; `START-HERE.md` / `KICKOFF-PROMPT.md` could
  move to `docs/history/`.

## Working in Claude Code Desktop (the Code tab)

- One long-lived session for this repo, never archived. Desktop runs it in its own git worktree under
  `.claude/worktrees/<name>/` on the branch `worktree-<name>`, created from `origin/main` — so the DGS
  pushes `main` before starting the session, and the session runs `npm ci` first.
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
