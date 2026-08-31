# First prompt to paste into Claude Code

Run `claude` inside the repo folder, press **Shift+Tab** twice to switch to *plan mode*, then paste
everything below the line. Review the plan it produces, edit anything you disagree with, and only
then let it start writing code.

---

Read CLAUDE.md, then read docs/CSE-Graduate-Handbook-July2026.pdf sections 3 and 4 carefully,
then data/README.md and the three data/*.sample.csv files, then skim reference/CSE-Degree-Audit.html
(it is an earlier prototype of this same app; treat its rule logic as a draft to check against the
handbook, not as truth).

Then produce a plan for building the app described in CLAUDE.md. The plan must include:

1. **Requirement inventory.** A table of every checkable requirement in §3 and §4 with: the
   handbook §, the exact sentence it comes from, what student input it needs, which Parameters
   key(s) and Courses columns it reads, and how it is evaluated as met / in progress / unmet /
   needs DGS review / cannot evaluate. Distinguish requirements the app can decide from
   coursework (credits, caps, core knowledge, specialization groups, seminars, GPA floor) from
   milestone requirements the student must self-report with a date (advisor identified, research
   qualifier passed, candidacy exam passed, dissertation approved for defense, defense passed,
   residency semesters) — for the latter the app checks deadlines against the student's entry
   term and today's date.

2. **Ambiguities.** A list of every place where the handbook is unclear or where the prototype
   made an interpretation, phrased as a question for the DGS. Do not resolve them yourself; I will
   answer and you will log the answers in docs/DECISIONS.md.

3. **Student data model** (TypeScript types): program (MSCSE / Ph.D.), entry term, prior M.S.
   yes/no and transfer courses, per-course rows (course id, title, credits, term, grade including
   "in progress", taken at ND / transferred, self-assigned specialization group when the sheet
   says `any`), milestone dates, GPA.

4. **Rules data model** built from the sheet (types for Courses, Parameters, Categories) and the
   validation errors it can raise.

5. **Test scenarios** you will write first, before the engine — at least: a fresh Ph.D. student
   with nothing done; a Ph.D. student in semester 4 who has all core areas but only two distinct
   specialization groups; one who over-used 4xxxx credits; one relying on Research Methods for
   a missing group; a Ph.D. student past the candidacy deadline; an MSCSE project-option student
   two courses short; an MSCSE thesis-option student who is complete; an MSCSE student with
   9 non-CSE credits plus a 10th; a student whose sheet lookup fails (course not in sheet).

6. **Build order**: engine + tests → sheet loader with validation and snapshot fallback → UI →
   GitHub Pages deploy workflow → weekly sheet-sync workflow → MAINTENANCE.md for the next DGS.
   Each step ends with `npm test` and `npm run build` passing.

7. **Anything you need from me** before starting (for example the published-CSV URLs for the
   sheet tabs, and the source of the 60-credit total for the Ph.D.).

Keep the plan concrete enough that I can review it in ten minutes.
