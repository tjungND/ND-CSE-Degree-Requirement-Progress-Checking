# Instructions for AI coding agents (Codex, Claude Code, and others)

This repository's agent instructions live in **`CLAUDE.md`** — read it in full before doing
anything. Then read `docs/CLAUDE-HANDOFF.md` (design decisions, invariants, recipes) and
`docs/DECISIONS.md` (every policy interpretation already made). The guide for the humans you are
working with is `README.md`; its Track B describes the workflow they expect from you.

The non-negotiables, spelled out in `CLAUDE.md`:

- No backend, database, login, analytics, or runtime network call other than the read-only fetch
  of the rules sheet. Student data — including uploaded transcript PDFs — never leaves the browser.
- Policy lives in the Google Sheet, structure lives in code. Never hard-code a course number or a
  threshold; quote the handbook sentence and its § above every requirement.
- Never guess: unknown course, missing parameter, or unapproved item ⇒ "needs DGS review" or
  "cannot evaluate", never a silent default.
- Plan before non-trivial changes and ask the DGS every policy question you cannot settle from the
  handbook; record each answer in `docs/DECISIONS.md` (date, question, decision, who).
- Ask before changing the sheet schema (column names, allowed values, parameter keys).
- `npm test` and `npm run build` must pass before you call anything done; run `npm run e2e` for
  UI-visible changes and look at the screenshots. Add a scenario in `tests/scenarios/` for every
  bug fixed.
