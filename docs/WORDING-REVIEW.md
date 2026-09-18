# Wording review

Student-facing strings Claude drafts are put to the DGS here, numbered, before they ship
(CLAUDE.md, "Wording"). The first round — W1–W47, from the build and the usability review —
was approved in full and the file was removed on 2026-09-06; it lives in git history. This
file was recreated on 2026-09-18 for the two proposals the interface review of that day
raised, and it stays for the next round.

**Answered items are kept, not deleted.** The wording a student reads is a decision like any
other, and the next DGS should be able to see what was chosen and why without reading the diff.

---

## W-CS1 — the pill for a requirement that is satisfied except for an approval

**Raised by** the interface review of 2026-09-18, items R2/R3: a cap row read **Met** directly
above the sentence naming the courses still waiting for the approval its own handbook quote
requires.

**The problem with the old label.** `needs_dgs_review` rendered as **Needs DGS review**, which
names an errand rather than a position. A student cannot tell from it whether they have done
the work or not, and the dashboard could not count "satisfied, pending a signature" apart from
"not satisfied".

**Checked before proposing** (the review asked for this): thirteen distinct requirement rows can
reach this status across the 67 scenarios — the three §4.2/§3.2/§3.5 caps, the three §4.4.1
core-knowledge rows, both §5.2 transfer rows, three credit thresholds, the §4.5 OCE, the
approvals to-do row, and the §4.7 defense. Twelve read correctly as "conditionally met". One
does not: see W-CS2.

**Proposed.** Pill: **Conditionally met**. The sub-line naming who must approve is unchanged, so
nothing is lost by dropping the actor from the pill — and the pill no longer needs the
DGS→ADGS rewrite that `first-mention.ts` applies for MSCSE students.

> At most 6 credits from CSE courses below the 60000 level — **Conditionally met**
> §4.2 · 6 of the 6 credits below the 60000 level used. needs approval: CSE 40243.

**DGS answer (2026-09-18): approved — "Conditionally met".**

---

## W-CS2 — the one row where "Conditionally met" would be false

**Raised by** the check above. A dissertation defended after §4.3's eight-year limit reports:

> Defense passed 2036-01-15 — after the 8-year limit, which passed at the start of Fall 2034
> (approximate). §4.3 makes that a forfeiture of degree eligibility unless the Graduate School
> granted an extension …

"Conditionally met" would tell that student the degree is nearly theirs while their eligibility
may be gone. The pill is the part students read first.

**Proposed.** A per-row label override for this case: **Eligibility at risk**. The row keeps the
same `needs_dgs_review` status, so it still counts with the conditionally-met rows on the
dashboard and no new member joins the `Status` union (DGS constraint, 2026-09-18) — only the
word changes.

**DGS answer (2026-09-18): approved — "Eligibility at risk", as its own pill on that row.**

---

## W-P1 — the privacy claim, against the measured network behaviour

**Raised by** the interface review of 2026-09-18, item R6. Two strings overstated what the page
does:

- `src/ui/handbook.ts` — "The page's only network request is the read-only fetch of the public
  course rules."
- `src/ui/app.ts` — "Nothing is transmitted to the University or to any third party …"

**Measured** (from the code, 2026-09-18): **five requests on one load** — four to
`docs.google.com/spreadsheets/d/e/…/pub?…&output=csv`, one per published tab (Courses,
Parameters, Categories, ExternalCourses), and one `HEAD` back to `tjungnd.github.io` for the
current date at Notre Dame. No student data is in any of them, and that part of the claim is
true and verified. But Google and GitHub each receive an IP address, a user agent and a referrer
on every load, so "no third party" is not accurate and "only network request" is singular for
five.

This is the claim students are asked to rely on *before* entering FERPA-protected data, and the
first thing anyone auditing the tool will check.

**Proposed.**

> Your coursework never leaves this browser. The page itself loads from GitHub and reads the
> course rules from Google Sheets, so those two services see that someone opened the page; they
> never see what you enter.

The FERPA sentence stays.

**DGS answer (2026-09-18): approved as proposed.**
