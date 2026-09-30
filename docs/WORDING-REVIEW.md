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


---

## W-CL1 – W-CL30 — the clarity pass of 2026-09-26 (evening)

**Raised by** the DGS (“Is there any way we can make it more easily understandable?” → “make the changes that you recommend”). Each string below ships; the DGS edits by number. The § and every fact of the earlier wording are kept; what changed is the order (verdict first), one fact per sentence, and one word per concept.

| # | Where | Now reads |
|---|---|---|
| W-CL1 | course line, unreviewed transfer | waiting for the DGS — would count toward regular courses (3 cr) if approved (§5.2) |
| W-CL2 | course line, transfer partly over the allowance | waiting for the DGS — would count 1 of 4 credits toward regular courses if approved (the 24-credit transfer allowance limits the rest) (§5.2) |
| W-CL3 | course line, transfer wholly over the allowance | waiting for the DGS — counts only if the DGS picks it — together the candidates exceed the 24-credit transfer allowance (§5.2) |
| W-CL4 | course line, earlier Notre Dame program | … — a course from your earlier Notre Dame program (§5.2) |
| W-CL5 | course line, sheet says transferable | approved by the DGS — will count toward regular courses (3 cr) as transfer credit once the Grad Admin has recorded it; send the Grad Admin the processing request (§5.2) |
| W-CL6 | course line, sheet says dgs_approval | waiting for the DGS — this course needs the DGS’s approval, decided case by case (§5.2) |
| W-CL7 | course line, listed with a blank verdict | waiting for the DGS — listed in the course rules, decision still open (§5.2) |
| W-CL8 | course line, not in the sheet | waiting for the DGS — not yet reviewed; an external course counts only once the DGS has approved it (§5.2) |
| W-CL9 | course line, box ticked but course unreviewed | ; the box “The DGS explicitly approved my transfer credit” cannot cover this course — the DGS has not reviewed it |
| W-CL10 | course line, sheet says no | not counted — the DGS decided this Purdue University course does not transfer (course rules, §5.2) |
| W-CL11 | course line, five-year window | not counted — completed more than 5 years before you entered (before Fall 2021; §5.2) |
| W-CL12 | course line, pre-entry Notre Dame course with no earlier program | not counted — dated before your entry term (Fall 2026) with no earlier graduate program on your record, so it is not §5.2 transfer credit either. To fix: check the entry term under Your standing (it starts out as the coming fall), or change your earlier degrees there |
| W-CL13 | allowance rows | 3 credits not counted — beyond the allowance / 3 credits beyond the allowance — count toward the total-credit requirement only |
| W-CL14 | transfer row bullets | Approved by the DGS: … — final once the Grad Admin has recorded the transfer; send the Grad Admin the processing request (§5.2) · Waiting for the DGS’s approval, decided case by case: … · Listed in the course rules, decision still open: … · Waiting for the DGS: … — send the review request from the Transcripts card |
| W-CL15 | transfer row, nothing to decide | Nothing here needs a decision by the DGS — none of the courses you entered can transfer under §5.2, for the reason on each course’s line |
| W-CL16 | transfer row, Notre Dame MSCSE courses | Your Notre Dame MSCSE courses (…) are not transfer credit, so they are not counted here. The Graduate School counts all of a Notre Dame master’s credits toward a Ph.D. in the same discipline — outside this allowance and with no transfer approval. Each course’s own line shows how it counts |
| W-CL17 | §5.2 paragraph above every prior-graduate group | Transfer credit (§5.2): a graduate course from another university can count toward this degree if you took it after your bachelor’s degree, within 5 years before you entered (Fall 2021 or later), and with a grade of B or better — this page checks those three. Which courses transfer (normally CSE-related ones, up to 24 credits) is the DGS’s decision, and the Graduate School confirms it. Until the DGS decides, every graduate course here is a candidate: the review request in the Transcripts card asks for the decisions, and the processing request below the milestones then has the Grad Admin record the credit. |
| W-CL18 | key line above the ND table | Key: ✓ counts · ◐ in progress · ● pending approval · ✕ does not count. A regular course is a lecture course — one the course rules list as regular; seminars, research and project credits count toward the 60 total but not toward the 24 regular-course credits (§4.2). |
| W-CL19 | glossary, the pill words | Met — Satisfied by what you have entered. · In progress — Not satisfied yet; nothing is late. · Conditionally met — Satisfied once the approval the row names is recorded. · Overdue — The handbook’s deadline has passed — talk to the DGS. · Not started — A stage that begins after an earlier one, such as the dissertation after the candidacy exam. · Not used yet · Does not apply — An allowance you have not drawn on, or a row that is not part of your score. |
| W-CL20 | ND preview heading | Found 9 courses — check the rows, untick any that are wrong, then add |
| W-CL21 | ND preview, entry-term checkbox (read from the transcript) | Your first semester in the program looks like Fall 2026 (the first graduate-level term on your transcript). Every deadline is counted from it — untick this if you started in a different semester. |
| W-CL22 | ND preview, bachelor’s line | Your transcript shows a Bachelor of Science awarded 2021-05-16, so Spring 2021 will be recorded as the semester you finished your bachelor’s — change it under Your standing if that is wrong. |
| W-CL23 | ND preview, prior-coursework note | 3 courses dated before Fall 2026 are listed separately as coursework from before you entered (no residency counts). Each can still do one of these: • satisfy a core-knowledge area (§4.4.1) • count toward your credits, if you took it at Notre Dame as an undergraduate (§4.2) • transfer, if you took it as a graduate student elsewhere (§5.2). A course that can do none of these starts unticked. |
| W-CL24 | ND preview, row notes | listed as transfer credit on your ND transcript · taken before Fall 2026, as an undergraduate / as an MSCSE student / as a graduate student |
| W-CL25 | post-import toast | Added 7 courses from the transcript (1 from before you entered). Two things were read from your transcript — your first semester (Fall 2026) and your bachelor’s semester (Spring 2021) — please confirm them under Your standing. |
| W-CL26 | external preview, mixed levels | “Taken as” is your status when you took the course, not the course’s level: a graduate-level course (a 500- or 600-level one, say) taken before your bachelor’s degree was awarded still counts as undergraduate coursework. Check every row before adding. Undergraduate rows: no transfer credit (§5.2); they can only satisfy a core-knowledge area (§4.4.1), and the ones that cannot start unticked. Graduate rows: transfer candidates (§5.2). |
| W-CL27 | OCE row | You can take the exam once your 24 regular-course credits are complete or in progress — you have 9 of 24 (§4.5), and once your cumulative GPA is 3.0 or higher — it is 2.90 (§2.2) · (date entered) You show 3 of 24 regular credits and a 2.40 GPA — §4.5 and §2.2 require both before the exam; confirm with the DGS that it could be taken |
| W-CL28 | specialization, along-the-way, defense, MSCSE residency rows | 2 of 3 done, in 2 different groups; the 1 in progress would complete it · CSE 60111 (B-) is below the B floor — retake it or take another course (§4.4.2) · Pass the Oral Candidacy Exam (OCE) and you can also receive the MSCSE (§4.5). Needed first, at Notre Dame: 24 regular-course credits (9 so far) and 6 research credits (0 so far). · Not started — the defense comes after the Oral Candidacy Exam (§4.5) and the readers’ approval (§4.6). · No full-time semester yet. A semester counts once the courses you entered for it add up to 9 credits (§2.1.2); if you were full-time on research, tick that semester under Your standing (Full-time terms). |
| W-CL29 | Your standing | Came into the Ph.D. from an unfinished Notre Dame MSCSE? Then this is the semester you started the MSCSE. Finished the MSCSE first? Then it is the semester you started the Ph.D. (§4.5). · Earlier degrees … You finished a graduate degree elsewhere, so up to 24 credits from it may transfer (§5.2); it would be 6 if that program were unfinished. (one sentence per answer) |
| W-CL30 | group intros and the §3.5 note | Notre Dame courses you took as an undergraduate appear here when they can do something for the Ph.D.: earn credit (60000-level courses in full; up to 6 credits of CSE courses below that, §4.2), or show you already know a core area — Algorithms, Operating Systems, Computer Architecture (§4.4.1). Where a course could earn credit, say next to it whether your bachelor’s degree already used it — no course may count toward three degrees. · (§3.5 note) One or more of your graduate courses was taken in or before the term your bachelor’s degree was awarded. Your 60000-level courses from before your bachelor’s degree count here in full if that degree did not use them (Graduate School) — on top of what §5.2 lets you transfer. Up to 6 credits of courses below 60000 may count inside §4.2’s allowance. No course may count toward three degrees: if you also hold a Notre Dame master’s, say next to each course which degrees it has already counted toward. The DGS decides anything the course rules leave open. |

| W-CL31 | course cell, two lines (DGS 2026-09-27) | Credit: ✕ not counted — taken before your bachelor’s degree was awarded (Spring 2021), so not as a graduate student (§5.2) · Qualifier: ● may still satisfy the Operating Systems core-knowledge requirement (§4.4.1) after DGS review |
| W-CL32 | report column folds (DGS 2026-09-27) | ⚠ 2 things to check — a course dated after this semester ▸ · Integrated B.S. + M.S. (§3.5) — how your courses are counted here ▸ · Show which requirements each course feeds (toggle above the coursework table) |
| W-CL33 | transfer row (DGS 2026-09-27, 4a) | pill: Waiting for the DGS · Waiting for the DGS: CS 50300, CS 59000 (6 credits) — send the review request from the Transcripts card · 0 of the 24 credits you may transfer are counted (§5.2 allowance for a completed prior degree) |
| W-CL34 | along-the-way MSCSE (4b) | pill: Not started · (master’s from elsewhere) You already hold a master’s degree, so the MSCSE along the way does not apply (§4.5). |
| W-CL35 | MSCSE advisor row (4c) | Overdue — was expected by the start of Fall 2026 · Due by the start of Fall 2026 · No advisor entered yet — talk to the ADGS. |
| W-CL36 | 24-credit row (4d) | At least 24 credits of regular courses at the 60000 level or higher · Up to 6 approved CSE 4xxxx credits may count inside these (§4.2) |
| W-CL37 | qualifier umbrella (4e) | 3 of 5 parts done — still open: specialization (§4.4.2), the research component (§4.4.3) (one card per part below) |
| W-CL38 | allowances (4f) | group heading “Allowances — §4.2”; meter “3 of 9 used”; fold “What this degree requires — 12 checks, plus 3 allowances” |
| W-CL39 | under the dial (DGS 2026-09-27, proposal 1) | Your coursework: 5 courses count now, 1 is in progress, 4 are waiting for the DGS (CS 50300, CS 59000, CS 58000, MATH 60610), 1 does not count (CS 50300 — taken before your bachelor’s degree was awarded (Spring 2021), so not as a graduate student (§5.2)). |
| W-CL40 | Next steps (proposal 1) | Next steps (N) · 1. Check what your transcript set — first semester Fall 2026, bachelor’s degree Spring 2021 (Your standing). · 2. Send the review request for 4 courses — the DGS decides. · 3. Enter your advisor’s name under Milestones. · 4. Confirm your advisor approved your plan of study and tick the box under Approvals. · 5. When the DGS answers, tick the approvals, then send the processing request — the Grad Admin records it. · 6. Send the processing request (2 items) — the Grad Admin records it. · 7. Send the summary to your advisor whenever you like. · Nothing to do right now — your next deadline is … |
| W-CL41 | course row, case-by-case course (DGS 2026-09-27, 4g) | ☐ The DGS approved this course for me |
| W-CL42 | course lines, unlisted (4g) | waiting for the DGS — would count toward regular courses (3 cr) once the DGS has added it to the course rules; not in the course rules yet — send the review request so the DGS can enter it · (non-CSE) …; a course from outside CSE also needs your advisor’s approval (§4.2) |
| W-CL43 | course line, sheet says yes (4g) | counts toward regular courses (3 cr); approved by the DGS in the course rules — send the Grad Admin the processing request to have it recorded (§5.2) |
| W-CL44 | review card (4g) | A course that is not in the course rules yet goes to the DGS through this request; the DGS enters it — yes, no, or case by case — and this page reads the updated rules the next time you open it. A course marked case by case needs the DGS’s answer for you: send this request, then tick the box next to the course once it is approved. · lines: not in the course rules yet — the DGS enters it · listed as case by case — needs the DGS’s approval for you (§5.2) · listed in the course rules, decision still open (§5.2) |
| W-CL45 | Next steps (4g) | Send the review request: 2 courses are not in the course rules yet, and 1 needs the DGS’s approval for you. · When the DGS answers, come back to this page — it reads the latest course rules — and tick the box next to each course approved for you; then send the processing request, and the Grad Admin records it. · Approvals row: When the DGS answers, tick the box next to each course it approved for you |
| W-CL46 | course cell, in-program course (DGS 2026-09-28) | Credit: ✓ counts toward regular courses (3 cr) · Qualifier: ✓ Computer Architecture core knowledge (§4.4.1) · specialization course (§4.4.2) |
| W-CL47 | requirement pill, deadline alert (DGS 2026-09-28) | In progress · due next semester · Not started · due next semester · In progress · due this semester |
| W-CL48 | glossary (2026-09-28) | Due this semester · Due next semester — The handbook’s deadline for that row falls in the current semester or the one after — plan for it now. |
| W-CL49 | Grad Admin card line (2026-09-28) | 4 requirements met, 6 in progress, 2 not started — the request lists every requirement with its standing, what meets it so far and its deadline (1 deadline in this semester or the next, highlighted), for the record |
| W-CL50 | Grad Admin request, standing block (2026-09-28) | MY STANDING, REQUIREMENT BY REQUIREMENT · - 4 requirements met, 6 in progress, 2 not started. · - 1 deadline in this semester or the next — highlighted below. · [MET] / [IN PROGRESS] / [NOT STARTED] / [OVERDUE] / [CONDITIONALLY MET] / [CANNOT EVALUATE] before each heading · !! DEADLINE NEXT SEMESTER: Due by the end of Spring 2027 (approximate) · !! DEADLINE THIS SEMESTER: … · !! DEADLINE PASSED: Overdue — … · Deadline: Due before Fall 2033 — 8 years after entry (approximate) · column “Progress” (an open row) beside “Evidence” (a met row) |
| W-CL51 | Grad Admin request, HTML (2026-09-28) | badge Met / In progress / Not started / Overdue / Conditionally met · box “Deadline next semester: …” / “Deadline this semester: …” / “Deadline passed: …” |
| W-CL52 | advisor summary rows (DGS 2026-09-28: the Grad Admin style) | [IN PROGRESS] Qualifying examination — all components (§4.4) — 3 of 5 parts done … · (next line) !! DEADLINE NEXT SEMESTER: Due by the end of Spring 2027 · !! DEADLINE PASSED: was due during Spring 2028 · Deadline: Due before Fall 2033 · headline “… · 1 deadline in this semester or the next.” · HTML Status cell = badge, Deadline cell = the orange/red box “Deadline next semester: …” |
| W-CL53 | all three emails (DGS 2026-09-28) | Student: [your name, netID and NDID] · dialog step: Fill in your name, netID and NDID on the "Student:" line. · Action requested (heading) · Earlier Notre Dame programs: MSCSE at Notre Dame, Fall 2023–Spring 2025; B.S. at Notre Dame CSE, awarded Spring 2021. |
| W-CL54 | subjects (DGS 2026-09-28) | Course review request (degree self-check) — Ph.D., entered Fall 2025; MSCSE at Notre Dame, Fall 2023–Spring 2025 · Processing request (degree self-check) — Ph.D. (transferred Spring 2025 from the Notre Dame MSCSE, entered Fall 2023) · Degree self-check — Ph.D., entered Fall 2025; B.S. at Notre Dame CSE, awarded Spring 2021 — 6 requirements in progress · “term not entered” when the transfer term is blank |
| W-CL55 | earlier-degrees dialog (DGS 2026-09-28) | When did you transfer into the Ph.D.? (Your entry term stays the MSCSE’s — every deadline counts from it; the transfer term is named on the emails you send.) · standing line: … transferred into the Ph.D. from the Notre Dame MSCSE in Spring 2025 (deadlines count from the MSCSE start) |
| W-CL56 | DGS request, action list (DGS 2026-09-28) | A. Please enter or complete these in the course rules — no reply needed; the self-check reads the rules the next time I open it: · B. Please decide these for me — a reply is needed: · 1. MATH 60610 Basic Linear Algebra (Notre Dame, Fall 2026) — new row: counts toward the Ph.D.: yes / no / case by case; core area (§4.4.1), if any; specialization group (§4.4.2), if any · … — complete the row: transferable to the Ph.D. (§5.2): yes / no / case by case — the row is blank · … — approve the transfer for me — the course rules say case by case (§5.2) · … — approve it for me (the allowance for courses below the 60000 level) · … — recommend the transfer credit for me (§5.2) · details columns: Please decide · Why |
| W-CL57 | Grad Admin request, actions (DGS 2026-09-28) | 1. Process the transfer credit for CS 50300 Operating Systems (Purdue University, Fall 2024, 3 credits) — approved by the DGS in the course rules (§5.2). · Check that the transfer credit is on my record for … — approved by the DGS for my case (§5.2). · Record the milestone: Advisor identified, 2026-09-10 (§2.3). · Tell me what you need for the qualifier completion form — every component is complete and the form is not filed yet (§4.4). · Process the MSCSE along the way — the self-check shows its requirements met (§4.5). · Keep my standing below on file: 4 requirements met, 6 in progress, 2 not started. |
| W-CL58 | Grad Admin request, evidence (DGS 2026-09-28) | COURSES COUNTED SO FAR (columns Course · Title · Credits · Grade · Term · Where · Counts toward: 60 total credits (§4.2); 24 regular-course credits (§4.2)) · Evidence: cumulative GPA 3.50. · Evidence: advisor Prof. Example; date 2026-09-10. · Evidence: CSE 60641, CSE 60111, CSE 60321 (in the course table above). · Progress: 9 of 24 credits complete. 6 in progress. CSE 60641, … (in the course table above). |
| W-CL59 | advisor summary (DGS 2026-09-28) | ACTION REQUESTED — WHAT I NEED FROM YOU, MY ADVISOR (numbered; “Nothing at the moment.”) · Next deadline: Qualifying examination — all components (§4.4) — Due by the end of Spring 2027 (next semester). · MY STANDING, REQUIREMENT BY REQUIREMENT · [MET] Core knowledge: all three areas (§4.4.1) — Operating Systems: CSE 60641; Algorithms: CSE 60111; Computer Architecture: CSE 60321. · [3 OF 9 USED] At most 9 credits at 6xxxx from outside CSE (§4.2) — Needs approval: MATH 60610. |
| W-CL60 | advisor summary to-dos, per reader (DGS 2026-09-28, the voice bug) | advisor: Approve MATH 60610 — a course from outside CSE, for my plan of study (§4.2). · Approve CSE 40567 — a course below the 60000 level, for my plan of study (§4.2). · DGS: Enter MATH 60610 in the course rules — it is not listed yet; a course from outside CSE also needs my advisor’s approval (§4.2). · Decide on STAT 51200 for me — the course rules say case by case (§5.2). · Recommend the transfer credit for CS 50300 (§5.2). · Approve CSE 40567 for me — a course below the 60000 level (§4.2). |
| W-CL61 | both emails, one block per requirement (DGS 2026-09-28, night) | text: `  [IN PROGRESS] Qualifying examination — all components (§4.4)` / `      !! DEADLINE NEXT SEMESTER: Due by the end of Spring 2027` / `      Why: 3 of 5 parts done …` (advisor) · `[MET] Cumulative GPA of at least 3.0 (§2.2)` / `    Evidence: cumulative GPA 3.50.` (Grad Admin) · HTML: a card with a left rule in the row’s colour, badge + title, the deadline box, the explanation |
| W-CL62 | course cell, undergraduate course from another university (DGS 2026-09-29) | Credit: ✕ not counted — taken as an undergraduate student, so it brings no transfer credit (§5.2) · Qualifier: ✓ satisfies the Algorithms core-knowledge requirement (§4.4.1) — confirmed by the DGS · Qualifier: ⏳ may still satisfy the Algorithms core-knowledge requirement (§4.4.1) — pending DGS review, send the review request · (no core title) Credit: ✕ not counted — …; not relevant to the core knowledge requirement (§4.4.1) |
| W-CL63 | opening dialog, option rows (DGS 2026-09-29) | Ph.D. in Computer Science and Engineering / Handbook §4 · M.S. in Computer Science and Engineering (MSCSE) / Handbook §3 · No · Yes, at another university / a master’s, or Ph.D. study · Yes, the MSCSE at Notre Dame / as a regular master’s student · Yes, the MSCSE at Notre Dame, through the Integrated 4+1 / the Integrated B.S. + M.S. program · I transferred into the Ph.D. from the Notre Dame MSCSE / not a degree — you started in the MSCSE and moved into the Ph.D. before finishing it · Yes, at Notre Dame in another department · hint: Answer the questions above to continue. |
| W-CL64 | opening dialog, acknowledgement (DGS 2026-09-29) | tick box in the notice: I understand — this tool is under testing and not yet approved by the department. · button: Continue · hints: Tick the box under the notice and answer the questions to continue. / Tick the box under the notice to continue. / Answer the questions above to continue. |
