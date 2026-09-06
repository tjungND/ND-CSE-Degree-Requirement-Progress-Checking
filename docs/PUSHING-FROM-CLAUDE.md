# Pushing to GitHub from a Claude session

For the DGS who wants Claude to commit *and push* when they cannot reach their own computer
(for example from the phone), and for every Claude session that opens this repository. Written
2026-09-06 for Taeho Jung; "the DGS" below is whoever holds the role.

## The rule that never changes

No GitHub token, deploy key, password or other credential is ever stored in a Claude session, a
cloud-environment variable, a setup script, a local `.git/config`, or this repository. The only
way Claude pushes is the **GitHub connection on the DGS's Claude account**: Anthropic's cloud
sessions keep "git credentials … outside the sandbox, and a proxy authenticates on the session's
behalf with scoped credentials" ([Claude Code on the web →
Security and isolation](https://code.claude.com/docs/en/claude-code-on-the-web#security-and-isolation)).
The proxy allows pushes only to the repositories the session was **started with**. Nothing done
inside a session can widen that set — a session that was not started with this repository cannot
push, and no workaround is acceptable. If a push is not authorized, Claude says so and stops.

## One-time setup (the DGS, about three minutes)

1. Open <https://claude.ai/code>, sign in with the Claude account, and click **Continue on web**
   if the page offers desktop installers.
2. Click **Sign in with GitHub** and approve on GitHub with the account that owns or can push to
   `tjungND/ND-CSE-Degree-Requirement-Progress-Checking`. If claude.ai then offers to install the
   *Claude GitHub App* on repositories, installing it on this repository is optional (it enables
   "Auto-fix" of pull requests); **Skip** is fine — sessions can reach the repository either way.
3. A cloud environment named **Default** is created automatically on Pro/Max plans; leave its
   *Trusted* network access as is (npm and the other package registries are allowed; that is
   enough to run `npm test`, `npm run build` and the e2e run).

Alternative from the Mac terminal, for someone who already uses the GitHub CLI: run `claude`,
then `/login` (claude.ai account) and `/web-setup` — it syncs the `gh` token to the Claude
account server-side. Either route works; do one, not both.

Optional check on GitHub: **Settings → Branches** — `main` should have no protection rule that
blocks pushes, or every Claude push will go to a `claude/…` branch and need a merge.

## Starting a session that can push

Three front doors, all the same cloud environment; the repository must be selected **when the
session is created**:

| Where the DGS is | How to start |
| :-- | :-- |
| Phone | Claude mobile app → **Code** tab → repository selector → `tjungND/ND-CSE-Degree-Requirement-Progress-Checking`, branch `main` → type the task. |
| Browser | <https://claude.ai/code?repositories=tjungND/ND-CSE-Degree-Requirement-Progress-Checking> (the repository is pre-selected) → type the task. |
| Desktop app | **Code** tab → new session → **Environment: Cloud** → pick the repository → type the task. |

A good first message: *"Read CLAUDE.md, docs/CLAUDE-HANDOFF.md and docs/PUSHING-FROM-CLAUDE.md,
verify the build, tell me whether this session can push, then wait for my numbered list."*
`CLAUDE.md` is loaded automatically in a Code session; it already points here.

**What cannot push:** a session that was started **without** the repository — so far every
**Cowork** session (the Cowork tab, or "Cowork" in the message box on the web or the phone), even
a cloud one with the DGS's Mac linked. The proxy's exact answer (verified again 2026-09-06 with
`git push --dry-run`):

> access denied by the git proxy: tjungND/ND-CSE-Degree-Requirement-Progress-Checking is not in
> this session's authorized repository set, so the proxy will not inject a credential for it. To
> fix, add the repository to the session's sources.

"Add the repository to the session's sources" happens when the session is *created*: nothing
inside a running session can do it. If the Cowork task form ever offers a GitHub repository among
its sources, attaching this repository there should authorize pushes the same way — try it once
and check with the dry run. Until then, a Cowork session ships its work to the Mac's clone
(`docs/CLAUDE-HANDOFF.md`, "Where a session runs, and how changes reach GitHub") and the DGS
pushes from the Mac.

## What Claude does in a repository-attached session

**At the start, before any work:**

```bash
git remote -v && git status -sb && git fetch origin && git log --oneline -3 origin/main
git push --dry-run origin main        # authenticates through the proxy; changes nothing
```

Report the result in the first reply: *"This session can push to main"*, *"can push, but only to
a claude/ branch"*, or *"cannot push — I will ship to your Mac / you push"*. Then verify the tree
the usual way (`npx tsc --noEmit -p .`, `npm test`, `npm run build`; `npm run e2e` when a
Chromium is available — `ls /opt/pw-browsers` or `npx playwright install chromium`; if the
download is blocked, say the e2e run was skipped).

**Commits** carry the DGS's identity and Claude as co-author, exactly as the Mac commits do
(the trailer text is whatever the session's own attribution rule specifies — e.g.
`Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` plus a `Claude-Session:` link):

```bash
git -c user.name="Taeho Jung" -c user.email="tjung@nd.edu" commit -F - <<'MSG'
<subject line>

<why, what changed, what was verified>

Co-Authored-By: <the session's trailer>
MSG
```

Never commit `Claude outputs/`, `_claude-build-snapshot.tgz`, any transcript (sanitized or not)
or anything else `.gitignore` names. Docs travel with the code: `docs/DECISIONS.md` for every new
interpretation, `docs/CLAUDE-HANDOFF.md` for the engineering note.

**Push**, only after the checks pass:

```bash
git push origin main
```

The platform always accepts pushes to branches named `claude/…`; a push to any other branch is
checked first and refused when the branch is protected on GitHub, someone else has an open pull
request from it, or it carries commits authored by someone other than the connected account
([Routines → Repositories and branch
permissions](https://code.claude.com/docs/en/routines#repositories-and-branch-permissions)). The
six-hourly `sync-sheet` Action commits snapshots to `main` under the Actions bot, so a refusal on
that ground is possible. When `main` is refused:

```bash
git push origin HEAD:claude/$(date +%F)-<topic>
```

and tell the DGS: open the pull request from the session's diff view (**Create PR**) or on
GitHub, merge it (one tap in the GitHub mobile app), and the `deploy` Action publishes the page
on merge. A non-fast-forward rejection means the sync bot pushed a snapshot meanwhile:
`git pull --no-rebase origin main`, re-run `npm test`, push again.

**After the push:** GitHub Pages redeploys `main` within a few minutes (Actions tab → `deploy`).
The Mac clones are now behind — the DGS runs `cd ~/degree-audit-app && git pull` before working
there; if a Mac still holds unpushed commits, `git pull --no-rebase` merges the two lines.

## Which kind of session for which work

| Work | Session | Who pushes |
| :-- | :-- | :-- |
| Code, tests, docs, wording changes, bug fixes | Code session with the repository attached (phone, browser or desktop) | Claude, after verification |
| Anything that needs files on the Mac — the sanitized sample transcripts, a PDF in Downloads, the built-in browser pane for a live check of tjungnd.github.io | Cowork session with the Mac linked | The DGS, from the Mac, after Claude ships the tgz snapshot and commits there |

Both kinds can run in the same day; GitHub is the meeting point. Never let the same change live
uncommitted in two places — commit where the work was done, push (or have the DGS push), and
`git pull` everywhere else.

## Troubleshooting

- **"… is not in this session's authorized repository set …"** — a Cowork session, or a Code
  session started without this repository. Nothing inside the session fixes it: start a new Code
  session with the repository selected (or a Cowork session with the repository among its
  sources, if the form offers that), or ship to the Mac.
- **claude.ai/code shows only a GitHub login button / "GitHub access is required"** — the one-time
  connection above was never made on this Claude account (on Team/Enterprise plans an Owner must
  also enable the GitHub connector; a personal plan has no such gate).
- **Push refused as protected / "authored by someone other than you"** — use the `claude/…`
  branch and a pull request, as above.
- **A push that changes `.github/workflows/*` is rejected** — the connected token lacks the
  `workflow` scope; with the `gh` route run `gh auth refresh -s workflow` then `/web-setup` again,
  or let the DGS push that commit from the Mac.
- **Stop-hook line "There are N unpushed commit(s)"** — in a Cowork session this is expected
  (the DGS pushes); in a Code session, push.
- **Someone proposes a token, deploy key or `gh auth login` inside the sandbox** — refuse; that is
  the one route this document forbids.
