# Student-facing wording to review (copied from the DGS's Cowork project doc on 2026-09-06; kept here so a Claude Code session can read it — reply with a numbered list such as "W3: say … instead")


Every student-facing string that Claude wrote or changed in the usability-review commits (81373a2, 6a85bf6, a52ea3e), the advisor-summary redesigns (d686ab8 and 665333b, Sep 6), the Sep 6 evening batch (665333b: transcript preview, course-line marks, review request) and the Sep 6 night batch (load time, preview layout, blocked rows, transfer candidates, Notre Dame Remove — section J), with the previous text where one existed and the reason. Nothing here is a DGS decision yet: reply with a numbered list of edits ("W3: say … instead") and Claude will apply them and re-run the checks. Where each string lives in the code is noted so a future session can find it.

Your own earlier sentences (BETA_NOTICE, RULES_ACCURACY_NOTICE, BETA_SCOPE_NOTICE, the privacy paragraph, the opening notice's two sentences) are unchanged and still appear in full — in the strip's *Details* expander and the footer. (Since Sep 6 the copied advisor summary carries only BETA_NOTICE — see W32.)

Applied since this doc was first written: your Sep 6 instruction that the Graduate Program Administrator is "Grad Admin" — W19, W24 (DGS entry) and W25 below now read "Grad Admin"; and your Sep 6 decision that the review request goes to the DGS alone (W36). The transfer lines in W35 were superseded the same night by the candidate wording (W40).

## A. The notice strip at the top of the self-check page (item 8)

**W1 — alpha line** (`src/ui/handbook.ts`, `ALPHA_LINE`, shown after the bold "Alpha — under testing.")
New: *Informational only, no warranty — every final decision rests with the Director of Graduate Studies (DGS). The course rules are accurate; only this tool's application of them is still being tested. Feedback: tjung@nd.edu.*
Replaces, at the top of the page only: the 128-word alpha banner (your BETA_NOTICE + RULES_ACCURACY_NOTICE + BETA_SCOPE_NOTICE + feedback sentence), which now sits under *Details* and in the footer, unchanged.
Why: one glance instead of seven sentences before the first control; spells out DGS on first use.

**W2 — privacy line** (`PRIVACY_LINE`, after the bold "Private by design.")
New: *Everything you enter — and any transcript PDF — stays in your own browser; nothing is uploaded. The page's only network request is the read-only fetch of the public course rules.*
Replaces, at the top only: *Everything you enter — and any transcript PDF you import — is processed and stored entirely locally, within your own browser; the optional text recognition (OCR) for scanned transcripts is also computed in your browser. Nothing is uploaded, transmitted, or stored anywhere else. The page's only network request is the read-only fetch of the public course rules.* (kept under *Details* and in the footer.)
Note: the OCR clause was dropped from the short line; it is still in the full paragraph and in the Transcripts card.

**W3 — the expander's label**: *Details*. Alternatives: "Read the full notice", "More".

## B. The opening notice (item 9)

**W4 — button**: *I understand — continue* (was *Agree*). `src/ui/app.ts`, `agreeButton`.
Why: the notice is informational, not a consent; nothing is stored either way. The notice itself still appears on every visit (your Sep 3 decision) and its two sentences are unchanged. Open question for you: remember the acknowledgment for 30 days per browser?

## C. Card intros and hints (items 10, 11, 31)

**W5 — Transcripts intro** (`app.ts`, `transcriptsCard()`)
New: *Start here: import your transcripts, and most of the page below fills itself in. **System-generated PDFs are read exactly.** A scanned or photographed transcript can be read with built-in text recognition (OCR) — English only — after you agree. Everything is read on your own computer and nothing is uploaded, and you check every field before it is added.*
Was: *The easiest way to start: import your transcripts, and most of the page below fills itself in. **System-generated PDFs are read exactly; a scanned or photographed transcript can be read with built-in text recognition (OCR) — English-language transcripts only** — after you agree, and with every field checked by you. Like everything here, files are read on your own computer and never uploaded.*

**W6 — unofficial-transcript note** (same card)
New: ***Prefer unofficial transcripts** — the web (self-service) PDF from your university's portal reads best: one column, no watermark. Official transcripts (two columns, security patterns, e-transcript covers) are read too; check their previews more carefully.*
Was: *… is recognized best: it is usually one column with no watermark. Official transcripts (…) are read too, but check their previews more carefully.*

**W7 — combined BS+MS callout** (`src/ui/external-upload.ts`)
New: ***One transcript for both your BS and MS** (a 4+1 / 5+1 program, or both degrees at one university)? Import it **once, in the Previous Master's Transcript row**. Each course's level (undergraduate or graduate) is read from it and shown in a "Taken as" column you can correct before adding. The Undergraduate row works too — never import the same PDF twice.*
Was: *… at the same university)? Import it once, in the Previous Master's Transcript row — each course's level … before adding. The Undergraduate row works too; do not import the same PDF twice.*

**W8 — Coursework intro**
New: *Everything you have taken or are taking belongs here. Importing your transcripts above fills it in, non-CSE and other-university courses included; you can also add or fix courses by hand. Anything the course rules have not decided yet goes into the review request below.*
Was: *Everything you have taken or are taking belongs here — importing your transcripts above fills it in automatically, non-CSE and other-university courses included; …* (one 40-word sentence split in two.)

**W9 — hint under "Entered the program"** (new): *Every deadline and the residency count are counted from this term.* Shown only while the longer "read from your transcript / assumed" note is not showing.

**W10 — Milestones hint** (new): *Enter each date once it has happened; leave the rest blank — every date here is optional.*

**W11 — course-form labels** (new, replacing placeholders): *Course number (e.g. CSE 60641)*, *Title (filled automatically for listed courses)*, *University*, *Level*, *Specialization group (§4.4.2)*. Validation message when the number is empty: *Enter a course number, such as CSE 60641.*

**W12 — card titles numbered**: *1. Transcripts*, *2. Your standing*, *3. Coursework*, *4. Milestones* ("Ask the DGS to review" and "Your data stays in this browser" are not numbered — the first is situational, the second is not a step).

**W13 — auto-counted full-time term** (item 11): *✓ Spring 2028 — counted automatically (9+ credits entered)* as text, replacing a ticked, disabled checkbox labelled *Spring 2028 (9+ credits entered)*.

**W14 — import buttons** (item 14): *Import from PDF (alpha)* (was *Import Courses from PDF (alpha)*). "alpha" kept per your Sep 4 decision.

**W15 — preview controls** (item 13): *Select all* / *Select none*; the Add buttons now read *Add 4 selected courses* (Notre Dame preview) and *Add 3 checked courses* (previous-university preview), counting the ticked rows.

**W16 — Remove and Undo** (item 25): the row button is named *Remove CSE 60641 (Fall 2026)* for screen readers; the toast after removal reads *CSE 60641 removed.* with an *Undo* button; a previous-transcript slot's Remove reads *3 Previous Master's Transcript courses removed.* + *Undo*.

**W17 — inline error messages** (item 6): the import failures keep your existing sentences (e.g. *Only Notre Dame's unofficial transcript is accepted here — for courses from other universities, use the Previous-Transcript rows below.*) but now stay on screen with a *Dismiss* button; the preview's *Enter the university name — the DGS's rules match courses by university + course id.* (was *Please fill in the university name — …*); *No rows are complete yet — every added row needs a course id, credits, a grade and a year.* (unchanged).

## D. The report (items 15, 16, 17, 27, 28, 29)

**W18 — status words** (`src/ui/report.ts`, `STATUS_LABEL`), now sentence case: *Met*, *In progress*, *Not yet*, *Needs DGS review* (was *Needs review*), *Cannot evaluate*, *Does not apply* (was *N/A*).

**W19 — headline**: *7 of 17 met · 6 in progress · 4 not yet* — with *(2 need a DGS decision)* appended to the "not yet" part when some rows need a DGS ruling. Was: *10 requirements to go* (and *Getting started* when nothing is met yet — kept). When every scored row is met: *All automatically checkable items are currently satisfied* (was *All requirements met*), with the subline *Final confirmation by the DGS is still required — confirm with the Grad Admin before you file.* (was *Confirm with the Graduate Program Coordinator before you file.*).

**W20 — meters past their target**: *12 (9 needed) ✓* (was *12/9*); below target *12 of 24* (was *12/24*).

**W21 — deadline lines**: a lead word *Deadline:* (or *Deadline passed:* once overdue) before your existing semester phrases, e.g. *Deadline: Due before Fall 2034 — 8 years after entry (approximate)*.

**W22 — "Needs your attention (N)"** (new block at the top of the report): each entry is the requirement's title, its status word, *— deadline passed* when applicable, and the first sentence of the card's detail as the next step.

**W23 — links to the course list** (new): *See the courses for this area →* (core-knowledge rows), *See the specialization categories →* (the §4.4.2 row), *See the courses that count →* (the regular-course rows).

**W24 — glossary, "Terms used here"** (new, closed by default at the end of the report; paraphrases of the handbook sentences the engine quotes — please read these with care):
- *Cumulative GPA (§2.2)* — The grade-point average over all your graduate coursework at Notre Dame, as the registrar computes it; continuation, candidacy and graduation require at least 3.0.
- *Regular course (§3.2 / §4.2)* — A lecture-style course. Only regular courses count toward the 24 regular-course credits; seminars, research, independent study and project credits count toward the total only.
- *Full-time (§2.1.2)* — A semester in which you are registered for the full-time credit load (9 or more credits, or research-heavy terms you mark yourself).
- *Residency (§3.3, M.S.)* — Registration in full-time status for one semester during the academic year, or for one summer session.
- *Residency (§4.3, Ph.D.)* — Full-time status for four consecutive semesters, not counting summer sessions, counted from the term you entered the program.
- *Qualifying examination (qualifier) (§4.4)* — Three components — core knowledge, category specialization and the research component — all to be completed within four semesters of starting; the DGS may extend the deadline case by case.
- *Core knowledge (§4.4.1)* — An Operating Systems course, an Algorithms course and a Computer Architecture course, passed at Notre Dame or at a previous institution (undergraduate or graduate; a previous-institution course counts once the DGS confirms it).
- *Specialization (category specialization) (§4.4.2)* — Three courses from three distinct specialization groups, each passed with a B or higher. A course may count for both core knowledge and specialization.
- *Research qualifier (§4.4.3)* — Within 18 months of entering the program, your research advisor determines whether you have passed the research component and files the form.
- *Candidacy exam (§4.5)* — The dissertation proposal exam; it must be taken before the end of your eighth semester in the program.
- *Transfer credit (§5.2, Ph.D.)* — Courses from an M.S. earned at Notre Dame or elsewhere within the five years before admission may count toward the course requirement, with the DGS's recommendation and the Graduate School's approval.
- *Project or thesis (§3.2, §3.4, M.S.)* — Six credits of Master's project (CSE 68902) or Master's thesis direction (CSE 68901), in addition to the 24 regular-course credits.
- *Transfer credit (§5.2, M.S.)* — Graduate courses from another program may count toward the course requirement within the handbook's caps, with the DGS's recommendation and the Graduate School's approval.
- *DGS (§1)* — The Director of Graduate Studies — the faculty member who makes the final call on every requirement here; the Graduate Program Administrator (Grad Admin) handles the paperwork.
- Closing line: *Short forms of the handbook's wording — the section numbers link the full text through each requirement's § button above.*
Two entries are the least certain: "Full-time" (the 9-credit floor is the sheet's `fulltime_credits_min`, described in words here) and "Candidacy exam" (described as the dissertation proposal exam — confirm that is how §4.5 should be summarised).

## E. Footer and print (items 20, 21)

**W25 — footer self-check paragraph**
New: ***This is a self-check, not an official audit.** It applies Sections 3 and 4 of the CSE Graduate Studies Handbook (July 2026). Some requirements depend on approvals this page cannot see: advisor and DGS sign-off, transfer-credit recommendations, and Graduate School deadlines. Deadlines are shown by semester and are approximate; the registrar's calendar sets the exact dates. Confirm your standing with the Grad Admin and the DGS before you rely on it.*
Was: *… It applies the rules in Sections 3 and 4 of the … Several requirements turn on approvals this page cannot see — advisor and DGS sign-off, transfer-credit recommendations, and Graduate School deadlines. Deadline dates shown are approximate; the registrar sets the real calendar. Confirm your standing with the Graduate Program Coordinator and the Director of Graduate Studies before you rely on it.*
(The "Coordinator" → "Grad Admin" change follows your Sep 6 instruction.)

**W26 — print header** (print only): *Self-check printed on 2026-09-05 — Ph.D. (§4), entered Fall 2026 — not an official audit; confirm with the DGS office.*

## F. Course-rules page (items 24, 26, 30)

**W27 — filter labels** (now visible above each control): *What are you checking?* with the options *Everything* / *Whether a course counts toward the M.S. (MSCSE)* / *Whether a course counts toward the Ph.D.* / *Whether a course satisfies a Ph.D. qualifier area*; *Search by course number or title*; *Program*; *Core knowledge area*; *Specialization category*; *Course type*; *Sort by* (phones only) with *Descending*; a *Clear filters* button.

**W28 — count line**: *176 of 176 courses shown.* plus *Filters are active.* and *View: whether a course counts toward the M.S. (MSCSE).* when applicable (was *… courses shown. Hover a row for the DGS's notes.*). (Sep 6: the label's case is now kept — it briefly printed "m.s. (mscse)".)

**W29 — notes**: a *Notes* button per row opens a line starting *DGS notes:* (the hover tooltip is retired); the legend gained *Notes — the DGS's notes on a course, and older rule versions — open with the Notes button on its row.*

**W30 — key line above the table** (new): *Key: Yes counts · With DGS approval counts only with approval · No does not count · Not yet decided ask first · Pending row not yet confirmed by the DGS.* and the disclosure *How to read the columns* (the former legend, unchanged inside).

**W31 — sort-button names** (screen readers): *Course — press to sort by it* / *Course — sorted ascending; press to reverse*.

## G. Accessibility names (heard, not seen)

Screen-reader-only text added in Phase 0: *Skip to the report* / *Skip to the course list*; the dialog is titled by its heading *Before you continue*; table headers *Add*, *Note*, *Remove*; per-row names such as *Add CSE 60641 (Fall 2026)*, *Credits for CS 25100*, *Specialization group for CSE 60876*; the § buttons *§4.2 — show the handbook rule behind this check*; the scrolling table region *Course rules table (scrolls sideways on narrow screens)*; the announcement after each change *Report updated: 7 of 17 met · …*.

## H. The "Copy summary for advisor" email (Sep 6, third design — `src/ui/advisor-summary.ts`)

**W32 — the whole email.** Your request of Sep 6 (evening): list the requirements by section number, show each component as met (green), in progress (amber) or not started (red), and end with what the student, the advisor and the DGS need to do. The text flavor for a realistic Ph.D. record now reads (the HTML flavor has the same words as one table per section — Status · Requirement · § · Why · Deadline — with the status word and the requirement name in the status color, a passed deadline in red, and the three lists as bullet lists):

> Subject: Degree self-check — Ph.D., entered Fall 2026 — 6 requirements not yet met, 1 deadline passed
>
> Dear Advisor,
>
> Here is my current standing from the CSE degree self-check tool, as of March 1, 2028.
> Ph.D. (Handbook §4); entered Fall 2026; no prior graduate degree; cumulative GPA 3.50.
> 7 of 18 requirements met · 4 in progress · 6 not yet met · 1 needs DGS review.
>
> BASIC REQUIREMENTS — §2.2–2.3
>   [MET] Cumulative GPA of at least 3.0 (§2.2)
>   [MET] Under continuous advisor supervision (§2.3)
>
> COURSEWORK — §4.2
>   [NOT YET] 60 total credits of courses and research (§4.2) — 14 of 60 credits complete. 9 in progress. 3 pending review/approval.
>   [NOT YET] 24 credit hours of regular courses at the 60000 level or higher (§4.2) — 12 of 24 credits complete. 3 in progress. 3 pending review/approval.
>   [MET] 2 credits of Research Seminar in year one (§4.2)
>   [NEEDS DGS REVIEW] At most 9 credits at 6xxxx from outside CSE (§4.2) — 3 of the 9 non-CSE cap credits used. Needs approval: MATH 60610.
>   [MET] At least 9 credits taken at Notre Dame (§4.2)
>
> RESIDENCE AND TIME — §4.3
>   [IN PROGRESS] Four consecutive full-time semesters of residence (§4.3) — Longest consecutive full-time run so far: 1 of 4 semesters.
>   [IN PROGRESS] All requirements complete within 8 years (§4.3) — Due before Fall 2034.
>
> QUALIFYING EXAMINATION — §4.4
>   [NOT YET] Qualifying examination — all three components (§4.4) — Three components: core knowledge (§4.4.1), category specialization (§4.4.2), research (§4.4.3). Due by the end of Spring 2028.
>   [MET] Core knowledge: Operating Systems (§4.4.1)
>   [MET] Core knowledge: Algorithms (§4.4.1)
>   [MET] Core knowledge: Computer Architecture (§4.4.1)
>   [IN PROGRESS] Three specialization courses from three distinct groups, each B or higher (§4.4.2) — 3 done (2 distinct groups) with 1 in progress — on track for 3 distinct groups. Below the B floor: CSE 60111 (B-) — I may retake the course to replace the grade or take another course (§4.4.2).
>   [NOT YET] Research component: a significant research contribution (§4.4.3) — Deadline passed (was due during Spring 2028).
>
> CANDIDACY EXAMINATION — §4.5
>   [IN PROGRESS] Candidacy examination (dissertation proposal) passed (§4.5) — Due by the end of Spring 2030.
>
> DISSERTATION AND DEFENSE — §4.6–4.7
>   [NOT YET] Dissertation unanimously approved for defense by the readers (§4.6) — Not yet approved.
>   [NOT YET] Dissertation defense passed (§4.7) — Not yet: three votes of four (or four of five) are required to pass (§4.7).
>
> WHAT I NEED TO DO
> - Complete 46 more credits toward the total-credit requirement (9 of them in progress) (§4.2).
> - Complete 12 more credits of regular courses (3 of them in progress) (§4.2).
> - Register full-time for 3 more consecutive semesters (§4.3).
> - Complete all requirements before Fall 2034 (§4.3).
> - Complete all three qualifier components by the end of Spring 2028 (§4.4).
> - Retake or replace CSE 60111 (B-) — a specialization course below the grade floor (§4.4.2).
> - Pass the research component of the qualifier — the deadline (Spring 2028) has passed (§4.4.3).
> - Take the candidacy exam by the end of Spring 2030 (§4.5).
> - Send the DGS the review request for MATH 60610 (with my transcripts attached).
>
> WHAT I NEED FROM YOU, MY ADVISOR
> - Determine whether I have passed the research component and file the Research-Qualifier form (§4.4.3).
> - Approve MATH 60610 — non-CSE course (§3.2/§4.2).
>
> WHAT THE DGS NEEDS TO DO
> - Decide whether to extend the research-component deadline (§4.4.3).
> - Decide on MATH 60610 — non-CSE course — needs advisor + DGS approval (§3.2/§4.2).
>
> Deadlines are counted from Fall 2026 and given by semester; they are approximate — the registrar's calendar sets the exact dates.
> Alpha version under testing. Informational only, no warranty — not an official degree audit; every final decision rests with the Director of Graduate Studies. Checked against the CSE Graduate Studies Handbook, July 2026 (link).
>
> Thank you!

Choices you may want to change:
- **W32a — status tags and colors**: *MET* green, *IN PROGRESS* and *NEEDS DGS REVIEW* amber, *NOT YET* and *CANNOT EVALUATE* red — the page's own status words and palette. "Does not apply" rows are left out, as is the per-course sign-off list (it feeds the to-do lists instead).
- **W32b — the three headings**: *What I need to do* / *What I need from you, my advisor* / *What the DGS needs to do* (first person, since the student is writing to the advisor). An empty list reads *Nothing at the moment.*
- **W32c — the to-do sentences** (each ends with its §): *Complete N more credits toward the total-credit requirement (K of them in progress)*, *Complete N more credits of regular courses*, *Complete N more credits at Notre Dame*, *Complete N more credits of project or thesis work*, *Take CSE 63802 — the research seminar*, *Register full-time for N more consecutive semesters* (M.S.: *for one semester (or one summer session)*), *Complete all requirements before Fall 2034*, *Complete all three qualifier components by the end of Spring 2028*, *Complete the remaining qualifier components — the deadline (…) has passed; ask the DGS about an extension*, *Pass a course that covers Algorithms — core knowledge*, *Retake or replace CSE 60111 (B-) — a specialization course below the grade floor*, *Complete three specialization courses from three distinct groups, each B or higher*, *Pass the research component of the qualifier by …*, *Take the candidacy exam by …*, *Get the dissertation approved for defense by all readers*, *Defend the dissertation* (the two dissertation items appear only once candidacy is passed), *Defend the thesis*, *Complete the project report and deliverables*, *Report my cumulative GPA*, *Raise my cumulative GPA to the minimum*, *Identify a thesis or project advisor*, *Send the DGS the review request for … (with my transcripts attached)*. Advisor: *Determine whether I have passed the research component and file the Research-Qualifier form*, *Approve my plan of study*, *Accept and approve the project report and deliverables*, *Approve <course> — <reason>*. DGS: *Decide on <course> — <reason>*, *Confirm the <area> core-knowledge course named in the review request*, *Decide whether to extend the qualifier deadline* / *the research-component deadline*, *Decide how to handle the passed candidacy deadline* / *time limit*, *Confirm the late candidacy exam* / *research-component result*, *Add the missing parameter '…' to the rules sheet so … can be checked*.
- **W32d — deadline phrases**: *Due by the end of Spring 2028* / *Due during Spring 2028* / *Due before Fall 2034* / *Deadline passed (was due during Spring 2028)* — your semester wording of Sep 5, with *(approximate)* said once in the footnote.
- **W32e — re-voicing of the engine's sentences** (unchanged from the morning): page instructions are left out (*The attestation checkboxes record approvals you already have*, *The approved course list is on the course rules page*, *Talk to your advisor and the DGS*); two are restated as facts (*Advisor approval of my plan of study (§3.2/§4.2) is not yet recorded*, *Cumulative GPA not entered yet*); "you/your" becomes "I/my".
- **W32f — the closing notice**: *Alpha version under testing.* + your BETA_NOTICE + *Checked against the CSE Graduate Studies Handbook, July 2026 (URL).* The RULES_ACCURACY sentence and the PDF/coverage caveats stay out (they address the student).

## I. Transcript preview, course lines and the review request (Sep 6 evening batch)

**W33 — "How “Taken as” was filled in"** (`src/ui/external-upload.ts`, `levelNote`), shown above the preview table, always: *How "Taken as" was filled in: Every row from the level the transcript itself states (a UG/GR column, a "Level" block, or the date your bachelor's degree was awarded).* / *… 5 rows by the two-year rule — the transcript does not label them, so courses from Fall 2022 on (the last two years of the record, ending Spring 2024) are marked Graduate and earlier ones Undergraduate* / *… every row as Graduate because this is the Previous Master's Transcript row.* — followed, on a mixed transcript, by *Please double-check every row before adding — rows taken as an undergraduate can only satisfy §4.4.1 core knowledge (no transfer credit, §5.2) and the ones that cannot matter start unticked; rows taken as a graduate student are §5.2 transfer candidates.*, otherwise by *Please double-check the column before adding.* The added-courses toast adds *(2 undergraduate, 3 graduate, by the two-year rule where the transcript did not say)*.

**W34 — locked-fields hint** (replaces the university hint when the transcript supplied the name): *The university name and each course's number and title are taken from your transcript as printed — they cannot be edited here (the DGS's rules key on them). Credits, grades, terms and "Taken as" can be corrected; grades the parser could not read must be chosen by hand (rows without a grade are not added).*

**W35 — per-course lines** (`src/engine/allocate.ts`, shown in the coursework table with a ✓ / ● / ✕ mark): *counts toward regular courses (3 cr)*; *in progress — will count toward regular courses (3 cr) when passed*; *pending DGS review — would count toward regular courses (4 cr) once approved; transfer — not yet reviewed by the DGS; needs DGS + Graduate School approval (§5.2)* (superseded the same night for unreviewed transfer courses — see W40); *pending DGS review — would count 2 of 3 credits toward regular courses once approved; 1 not counted — over the transfer-credit cap (§5.2)*; *not counted — over the transfer-credit cap (§5.2)*. Undergraduate rows: *satisfies the Operating Systems core-knowledge requirement (§4.4.1) — confirmed by the DGS* / *… — a Notre Dame course listed in the course rules* / *may satisfy the Computer Architecture core-knowledge requirement (§4.4.1) — pending DGS review; send the review request* / *not relevant to the core knowledge requirement (§4.4.1)*. The screen-reader words behind the marks: *counts:* / *pending:* / *does not count:*.

**W36 — the review card and request**: the card now reads *Decisions are made only by email: copy the review request and send it to the DGS (email). Attach your transcript PDFs … to the same email. It includes rows the DGS can paste straight into the rules sheet; the page itself sends nothing.*; toasts *Review request copied — email it to the DGS and attach your transcript PDFs. (Nothing is sent by this page.)* / *Could not copy automatically — please email the DGS your course ids, credits, grades and terms.*; the request opens *Dear DGS,* and its course details are tables headed *Course · Title · Credits · Grade · Term · Why it needs a decision*, one per transcript (*Notre Dame:*, *Previous Master's Transcript — PURDUE UNIVERSITY:*).

**W37 — removed**: the Transcripts card's *What the DGS's rules say* block (its facts are on the course lines and in the report).

## J. Blocked rows, transfer candidates and the Notre Dame Remove (Sep 6 night batch)

**W38 — the blocked undergraduate row** (`src/ui/external-upload.ts`, `BLOCKED_ROW_NOTE`; shown on hover over the row or its disabled box, and read aloud to screen readers): *Not selectable: this course is not related to the core-knowledge areas (Algorithms, Operating Systems, Computer Architecture — §4.4.1), and undergraduate credits do not transfer (§5.2), so there is nothing to add. If you took it as a graduate student, change "Taken as" to Graduate and it becomes selectable.* (The visible *not selectable — hover for why* tag was removed at your request the same afternoon; the greyed row and disabled box are the cue.) Your words were "not related and not transferrable, so it doesn't need to be selected" and "can be selectable if 'Taken as' is changed to 'Graduate'".

**W39 — the transfer-group hint** (`src/ui/app.ts`, `coursesCard`, once above each previous-university graduate group that still holds a candidate): *Transfer credit (§5.2) is decided by the DGS course by course — only CSE-related courses transfer, at most 24 credits in total, and the Graduate School confirms the DGS's recommendation. Until the DGS has ruled, every graduate course here is a candidate; the review request below asks for those rulings.* (The figure follows the student's program and prior-degree answer: 6, 9 or 24. "The Graduate School confirms the DGS's recommendation" is §5.2's "recommended by the DGS and approved by the Graduate School".)

**W40 — the candidate lines** (`src/engine/allocate.ts`, replacing the first W35 transfer line for every unreviewed graduate transfer course, amber ● in all three forms): *pending DGS review — candidate for transfer credit (§5.2); would count toward regular courses (3 cr) if the DGS approves it* / *… would count 2 of 3 credits toward regular courses if the DGS approves it (the 6-credit transfer cap limits the rest)* / *… counts only if the DGS picks it — the candidates together exceed the 6-credit transfer cap*; a DGS-confirmed core area still follows (*; the same review can confirm the Operating Systems core-knowledge requirement (§4.4.1)*). Courses the DGS has already ruled transferable, and attested transfers, keep the W35 wording; a course the handbook itself rules out (grade below B, outside the five-year window) keeps its red *not counted — …* line.

**W41 — the Notre Dame row after an import** (`src/ui/app.ts`, `transcriptUpload`): *Notre Dame Unofficial Transcript — 7 courses from your transcript [Remove] · [Import again] — after new grades post, remove these and import the updated PDF; courses you typed in by hand are kept.* Screen-reader name of the button: *Remove the 7 courses imported from your Notre Dame transcript*. Before any import the row is unchanged (*Import from PDF (alpha) — the system-generated PDF from insideND; fills the coursework table and GPA below. …*).

**W42 — the Remove toast**: *7 courses from your Notre Dame transcript removed, and the GPA it filled in.* + *Undo* (without the GPA clause when the GPA had been typed by hand).

**W43 — the loading card** (`src/ui/loading.ts`, changed later the same day with the retrying loader): subtitle *from the DGS's Google Spreadsheet — usually a few seconds; a slow answer is asked for again, up to about 30 s in all* (was *… usually a few seconds, up to 15*); the elapsed line *4.9 s elapsed · up to about 30 s*; a step being hedged (a second request after 2 s) reads *Reading the course list — Google is slow; asking again*, a fresh attempt *— still nothing; asking again (attempt 2 of 3)*; the failure after three attempts: *Google did not send the course list — 3 attempts, 30 seconds in all, went unanswered. This is usually temporary — please reload the page to try again.*

## K. Transcript rows: inactive buttons, locked values, one-line rows (Sep 6 afternoon batch)

**W44 — inactive Import / Remove buttons** (`src/ui/dom.ts`, `PREVIEW_OPEN_NOTE`; the tooltip on hover, the toast on click, and what a screen reader hears): *Not available while a transcript preview is open: finish selecting and adding those courses ("Add …"), or cancel the preview, and this button becomes active again.* Your words: "the course selection & addition need to be finished before these buttons become active".

**W45 — the locked-fields hint** (replaces W34 when the transcript supplied the values): *The university name and each course's number, title, credits, grade and term are taken from your transcript as printed and cannot be edited here; only "Taken as" can be changed. Anything the parser could not read (a grade, credits or a year) must be filled in by hand — rows without a grade are not added.*

**W46 — the one-line row and the level dropdown's hover text**: a row reads *☐ CS 25100  Data Structures and Algorithms  4 cr  A  Fall 2023  [Undergraduate ▾]* (credits as *4 cr*; an in-progress grade as *In progress*); on phones the values move to a second line as *4 cr · A · Fall 2023 · TAKEN AS [Undergraduate]*. Because the dropdown shows no label on the one-line form, hovering it says *Taken as — the level you were registered at when you took it: undergraduate rows can only satisfy §4.4.1 core knowledge; graduate rows may transfer (§5.2)* (the same sentence the table's hidden "Taken as" header carried).

**W47 — the review request's editable marker** (`src/transcript/external.ts`, your wording): *(You may edit anything above this line)* directly above the divider, mirroring *(DO NOT MODIFY ANYTHING BELOW THIS LINE)* below it, in both the text and the HTML flavour.
