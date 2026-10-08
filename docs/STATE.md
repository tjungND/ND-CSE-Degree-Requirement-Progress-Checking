# Where things stand (kept current by every session — read after CLAUDE.md and docs/CLAUDE-HANDOFF.md)

Last updated: 2026-10-08 (this session, branch `claude/policy-compliance-degree-engine-44a431`).

2026-10-08 (DGS — the graduate-degree options): each now says whether it means a finished degree (“Yes — I finished the MSCSE at Notre Dame …” / “I started the MSCSE at Notre Dame but did not finish it — I transferred into the Ph.D.” / “… — finished or not”); wording W-CL352.

2026-10-08 (DGS — “make the UI simpler or more intuitive”): a captured walk through six student states and five review lenses; 14 changes made (DECISIONS 2026-10-08, UI review): the 4+1 reading shows under its question; focus lands in view and survives follow-up answers; report cards are headings; courses that wait for the student say “need your answer” with a Next step; the which-degrees question is labelled and its rule said once; reasons shared by a course group are said once in the group intro; MSCSE undergraduate-time courses sit under undergraduate coursework; the non-degree question is asked only where the answer can change something; the entry-term note shows only the case that applies; “Looks right” buttons confirm read terms; until the earlier degrees are answered the review card and earlier-coursework intros say so; the “one university” fold hides beside a Notre Dame bachelor’s; MSCSE final steps leave Next steps while far; the preview has Add at the top and tucks unticked rows; phone tap targets, footer margin, contact card first in the footer on phones. Also a 4+1 MSCSE course before entry with no bachelor’s term asks for that term (P3-fourplusone-1). **Open — ten questions for the DGS** (each would reverse a recorded UI decision): the one-program sentence on Your standing; folding the earlier-degrees questions before an import; shorter process prose on the request cards; START HERE after an import; the candidacy checklist line; “pending” on the credit cards; where the MSCSE project/thesis radios sit; three phone layout changes; the “one university” fold after a “No”; (and Q10, done as a code fix). Wording W-CL340–W-CL351.

2026-10-08 (DGS — blue/red-team review of Option 1): seven teams ran 273 browser scenarios on invented transcripts of every kind (insideND, the older Notre Dame layouts, Banner, other universities’; Notre Dame CSE/other-department bachelor’s, 4+1 in the MSCSE and on to the Ph.D., the one-semester MSCSE → Ph.D. move, master’s / Ph.D. elsewhere finished or not, combined B.S.+M.S., non-degree terms). 73 findings, 50 confirmed by both verifiers; all fixed (DECISIONS 2026-10-08, “blue/red-team review”). The big ones: a reading never applies the answer (the student confirms with Done); forecasts and the level word “Graduate” no longer count as a conferral; the §5.2 cap follows a read “finished” while the answer is a draft; placeholder majors read nothing; insideND’s entry term is the first graduate CSE term and its bachelor’s term the last undergraduate one; Notre Dame’s own courses no longer fill a Previous row. Open: a single line conferring B.S. and M.S. together levels the M.S. courses as undergraduate (the student corrects “Taken as”); a Notre Dame MSCSE graduate sets the Ph.D. start by hand; another university’s transcript with a transfer line from Notre Dame is still taken as Notre Dame’s. Wording W-CL332–W-CL339. The harness (scratchpad, not in the repo) drove the real app per scenario.

2026-10-08 (DGS — **Option 1**, the earlier degrees): the opening dialog asks only the program; the earlier-degrees questions are asked on the page, in the Transcripts card (`#earlier-degrees`), until answered — with a Next-steps item and the standing card’s line pointing there. Imports fill in what a transcript can tell, marked “Read from your transcripts: …”: from a Notre Dame transcript, whether the bachelor’s is Notre Dame’s and its department (the last undergraduate major) and a graduate program in another department; from a previous transcript, a degree elsewhere. Answering on the page keeps the questions open until “Done”; the review of the change also closed eight gaps (DECISIONS 2026-10-08). The MSCSE, the 4+1, a move into the Ph.D. and whether a program was finished are not on insideND’s transcript, so the student answers them. Until the answer is complete, the record behaves as an unanswered one (`backgroundDraft` is never read by the engine). Found on the way and fixed (8ddaaed): both redacted transcripts were REJECTED as not Notre Dame’s (one text item per letter), the Transcript Totals’ “( Undergraduate )” relabelled the last term, and each term’s college and major are now read. (A read value staying after its import is removed was fixed by the blue/red-team review above.) Wording W-CL319–W-CL331.

2026-10-07 (DGS — the recommended choices, late evening): **P3-dh-4-5-1 (A)** the cohort’s tuition and funding notes follow the eight years; **P3-cse-5-6-2 (A)** the §5.1 Incomplete pattern counts fall and spring only; **P3-cse-5-6-4 (b)** the cohort’s Incomplete keeps 30 + 14 days with Appendix A.1 named; **P3-cse-4a-3 (a)** the qualifier completion form is due once the course components are complete; **P3-emails-4 (a)** Next steps lists the thesis topic; **P3-prior-programs-6 (a)** an MSCSE holder’s outside course taken in no program waits for the DGS; **P3-import-4 (b)** the transfer request window is named by the graduation semester; **P3-sheet-5 / P3-sheet-6 (a)** the six shared credits live in code (`BS_SHARED_CREDITS_MAX`) — **delete Parameters row 37 (`ms_bs_double_count_credits_max`) after this deploys.** Also: the earlier-degrees follow-ups sit under the answer that asks each one (DGS request). Wording W-CL314–W-CL318. Every round-3 decision box is now answered.

2026-10-07 (DGS — ruling): **P3-cse-3-2.** The self-check IS §3.1’s DGS review of the MSCSE along the way: met goes straight to the Grad Admin, as since 2026-09-06; the card, the processing request and the advisor summary now say so and cite §3.1. Wording W-CL312–W-CL313; HANDBOOK-REVISIONS 30.

2026-10-07 (DGS — department policy, graduate studies committee 2026-10-07): **P3-cross-doc-2, (a) with a change.** A non-tenure-track advisor cannot advise a student alone — a tenured or tenure-track co-advisor is required, no exception; the DGS’s §2.3 exception is for a tenured or tenure-track advisor from another Notre Dame department. The advisor card, review request and admission card now say the two cases apart (Ph.D. and MSCSE thesis). No verdict changes. Open: no input records the DGS’s approval of an advisor from another department. Wording W-CL309–W-CL311; HANDBOOK-REVISIONS 29.

2026-10-07 (DGS — the recommended choices, evening): **P3-ac-6.2-app-3 (b)** the cohort’s candidacy note says one semester (A.4); **P3-ac-5a-4 (a)** the leave warning names Appendix A.2’s three for the cohort; **P3-ac-6.2-app-2 (a)** Notre Dame graduate enrollment in Spring 2020 puts a later Ph.D. entrant in the cohort; **P3-ac-5b-6.1-4 (a)** a sheet row looser than a Graduate School floor reads as the floor; **P3-prior-programs-1 (a)/(a)** and **P3-prior-programs-4 (b)** the degree-elsewhere follow-up under the MSCSE-held answers too, and §5.2’s window from the MSCSE admission. **P3-prior-programs-3 (3)** transfer credit from two earlier programs waits for the DGS; **P3-ac-5a-5 (a)/(a)** transcript gaps beyond the leave count are warned about in the audit, with a review line, and the selector stays open. Wording W-CL295–W-CL308.

2026-10-07 (DGS — page and engine): **P3-prior-programs-2, option (a).** The transfer-from-the-MSCSE answer now asks “Did you also hold, or start, a graduate degree at another university?” (then “Did you finish that degree?”): a yes sets the §5.2 cap (24 / 6) and opens the Master’s and Ph.D. transcript rows, and the transfer clocks stay as they were. P3-prior-programs-1 (the same question under the two MSCSE-held answers) is still open. Wording W-CL291–W-CL294.

2026-10-07 (DGS — rulings, no code change): **P3-hidden-inputs-1, option (3)** (after first choosing (2)): a student who passed the OCE while credits wait for the DGS gets no date box until the DGS rules; the review request carries the rows to the sheet. A test pins the finding’s case. **P3-import-2, option (a):** duplicate transfer rows are warned about and both count until the student removes one.

2026-10-07 (DGS — engine): **P3-fourplusone-2, option (2).** When a 4+1 student’s answered admission is after the bachelor’s but the Notre Dame transcript registers an unshared pre-bachelor’s graduate course GR (moved UG→GR, which happens only before the bachelor’s), the course is held for the ADGS instead of refused, a warning asks the student to recheck the term, and the review request asks the ADGS to confirm. UG and unlevelled rows are still refused. Wording W-CL288–W-CL290.

2026-10-07 (DGS — engine): **P3-fourplusone-1.** A 4+1’s graduate course the bachelor’s did not use counts toward the MSCSE from any undergraduate term — the junior year or earlier, before the Integrated-program admission (4+1 matriculation is in the senior fall or spring), with no ADGS approval step — on the Graduate School’s email answer (4+1 students only). §3.5’s window now limits only the six credits shared with the bachelor’s (the app’s choice of them, bsShared). Gone: the 2026-10-04 admission-term refusal and hold, P3-fourplusone-3’s warning, the junior-spring approval. Kept, as Claude’s readings for the DGS to confirm: the non-CSE approval, and an admission after the bachelor’s keeps only the six shared credits. New: the three-degree warning on a 4+1 MSCSE record with a graduate course from before the bachelor’s (audit.ts). Wording W-CL283–W-CL287.

2026-10-07 (DGS — ruling): **P3-dh-front-1-2-3 (2), option (a).** The import keeps the earlier admission term as the entry term by default; the entry-term note added that day is how a non-degree student corrects it. No code change (DECISIONS).

2026-10-07 (DGS — efficiency, “without changing the engine logic or the UI”): measured first (engine ~0.2–0.5 ms per audit; a page re-render ~8.7 ms in Chrome, most of it the forced layout after the full rebuild), searched through seven lenses with a judge, then applied five behaviour-preserving changes: one Grad Admin request per render instead of two; cached long-date formatters; memoized `normalizeUniversity` and `canonicalCourseId`; an early exit in `looksLikeNotreDameTranscript`. Proven byte-identical by an engine golden (165 scenarios + examples, every report, review request and email) and a page golden (13 page states, the copy dialogs and the copied text); two reviewers confirmed. Results: audit with 22 transfer rows 1.11 → 0.36 ms; a re-render 8.4 → 8.0 ms (Chrome, median of three runs of 40); a 1,500-line transcript’s Notre Dame check 27.5 → 4.7 ms. A sixth change — the transcript reader as a lazy chunk, −45 KB at start-up — was reverted after review: it added a PDF-read failure the page never had (see the handoff). **Open for the DGS:** loading the page code in parallel with the Google fetch (about 0.2 s faster on phones) was held back — on slow links it can leave the finished loading card on screen briefly, a state the page never shows today.

2026-10-07 (DGS — a rule): ExternalCourses university names are never altered, by an agent or the DGS — they are what the import read from official transcripts, and future transcripts must read the same (CLAUDE.md and AGENTS.md hard constraint; DECISIONS; data/README, README § A6b, MAINTENANCE).

2026-10-07 (DGS — P3-sheet-1 reverted): “That GATech’s name was read directly from an official transcript. Future transcripts will carry that exact name too.” ExternalCourses rows 23–32 are back to “GEORGIA INSTITUTE OF TECHNOLOGY OFFICIAL DOCUMENT INFORMATION” on the live sheet; the transcript reader keeps that name as printed and matching compares it as before (c66da07’s parser and matcher lines removed). tests/external-transcript.test.ts pins the name. Review report: P3-sheet-1 ruled.

2026-10-07 (DGS — a shorter page): the always-visible text was cut where it repeated itself or explained at length (W-CL273–W-CL282); report.ts drops a fact that only repeats the card’s pill. The review report (v77) now lays out the 26 items still waiting for the DGS as options with a recommendation each.

2026-10-07 (DGS — engine; policy review round 3, the no-decision items, batch D2): P3-prior-programs-5, P3-import-2 (the warning; its preview half was P3-import-1 (c)); P3-sheet-1 was applied and then reverted the same day (see the paragraph above). New: `AuditReport.transferCredits` / `transferCap`; `ProcessingItems.transfersOverCap` and `ProcessingTransfer.cappedCredits`; the cross-term duplicate-transfer warning (allocate.ts, beside the same-term one). Wording W-CL271–W-CL272.

2026-10-07 (DGS — engine; policy review round 3, the no-decision items, batch D1): P3-ac-5b-6.1-4 (warnings), P3-ac-6.2-app-4, P3-dh-3.21-3.24-2, P3-fourplusone-3, -5, -7, P3-text-engine-2, P3-sheet-6 (a)(b), P3-import-5. New: params.ts `GRADUATE_SCHOOL_FLOORS` (looser-than-the-Graduate-School warnings) and the blank `cse_subject_codes` error; audit.ts reads `mergedInto` rows for the eight-year check; the RCR row is `cannot_evaluate` when admitted without a date; ClassifiedCourse `ugToGrIfAdmitted`; review.ts treats `notTransferCredit` pre-bachelor’s rows as the undergraduate career; a missing `ms_bs_double_count_credits_max` routes the MSCSE’s shareable courses to the unknown `sharedbs` cap. Wording W-CL263–W-CL270. Open for the DGS: whether the engine should hold a Graduate School floor when the sheet is looser (P3-ac-5b-6.1-4’s option).

2026-10-07 (DGS — emails; policy review round 3, the no-decision items, batch C): P3-cse-1-2-3, P3-text-ui-3, P3-text-ui-7, P3-emails-4 (1)(2), P3-emails-5, P3-emails-6, P3-emails-7, P3-prior-programs-6 (1)(3). New: the OCE row’s `passedLate` flag; advisor-summary.ts `withoutPageForm` (page instructions out of emails) and `approvalItems(…).incomplete`; external.ts `buildCombinedReviewRequest({ decider })`; program-history.ts `PRIOR_LABELS` (moved from app.ts) and `priorStudyLabel`; the scenario runner’s `expectEmailItems`. Wording W-CL255–W-CL262. Open: P3-prior-programs-6 (2) (the §5.2 cap’s wording for a Notre Dame MSCSE holder) and P3-emails-4’s optional Next-steps topic step.

2026-10-07 (DGS — page text; policy review round 3, the no-decision items, batch B): P3-ac-5b-6.1-3, P3-dh-front-1-2-4, P3-dh-front-1-2-3 (1), P3-dh-3.21-3.24-1 (MSCSE only), P3-dh-6-9-1, P3-dh-6-9-2, P3-dh-10-1, P3-fourplusone-4 (a), P3-fourplusone-6, P3-cse-4a-4, P3-cse-4a-5, P3-text-engine-3, P3-text-engine-4, P3-text-ui-5, P3-text-ui-6, P3-text-ui-8, P3-ac-6.2-app-3 (a)(c) and the citation part of P3-cse-5-6-4. New plumbing: `others.mastersApplicationOpen` (audit.ts → timeLimitRow), `AuditReport.summerFullTimeCredits` (the glossary’s MSCSE summer clause), `msCandidacyApplicationRow({ thesis })`, decider.ts `DECIDER_DGS` / `DECIDER_DGS_ALL` (shared by the engine and first-mention.ts), AdvisorSummaryOptions `qualifierFrom`, and the scenario runner’s `deadlineLabelIncludes`. The Ph.D. 4+1 review flag is gone. Wording W-CL240–W-CL254.

2026-10-06 (DGS — citations and docs; policy review round 3, the no-decision items, batch A): P3-dh-3.1-3.13-4, P3-text-ui-4, P3-emails-3, P3-emails-8, P3-text-engine-5, P3-cse-3-3, P3-cross-doc-6 and the documentation parts of P3-fourplusone-2, -4 and P3-import-4. email-html.ts `upperHeading` keeps document names in capitals headings. tests/email-heading-labels.test.ts runs the label check over every scenario’s processing request. Wording W-CL236–W-CL239; HANDBOOK-REVISIONS §2, §4, §7, items 17 and 27.

2026-10-06 (DGS — emails; policy review round 3): **P3-emails-2.** The review request’s A / B lists split on a tag, not on “for me”: review.ts tags every ask (`ReviewAsk.rulings` — anything outside the sheet’s own questions), transcript/external.ts puts rulings only in B. tests/review-request-rulings.test.ts. Wording W-CL235.

2026-10-06 (DGS — emails; policy review round 3): **P3-emails-1.** The advisor email’s transfer items come from the processing request’s list (AdvisorSummaryOptions `transfers`, passed by app.ts; `actionItems(report, transfers)`), so a decided transfer is named for the student and the Grad Admin and “Nothing is pending” is true. tests/advisor-transfer-processing.test.ts. Wording W-CL233–W-CL234.

2026-10-06 (DGS — engine and page; policy review round 3): **P3-dh-front-1-2-2.** The dual-degree plan’s wait is the Graduate School’s: shared.ts `signOffActors` routes it to a `graduateSchool` actor (`DUAL_PLAN_REASON`), review.ts skips `dualPlanOnly`, advisor-summary.ts and next-steps.ts word the student’s errand. tests/dual-plan-routing.test.ts; scenario phd-dual-degree-plan-pending pins the Approvals row and an empty review request. Wording W-CL230–W-CL232.

2026-10-06 (DGS — import; policy review round 3): **P3-dh-front-1-2-1.** A Notre Dame degree conferred in January belongs to the fall before (term.ts `conferralTerm`), in the entry-term inference (parse.ts, `inferEntryTerm` now exported for tests), the MSCSE award (prior-nd.ts), the bachelor’s award (nd-upload.ts `bachelorsAwardFrom`, exported) and the program history. tests/conferral-term.test.ts.

2026-10-06 (DGS — engine; policy review round 3): **P3-dh-3.14-3.20-4, (b).** The “first semester complete” test for the transfer processing request is one helper (allocate.ts `firstSemesterComplete`): the entry term’s end, or any finished earlier Notre Dame graduate program. tests/first-semester-complete.test.ts; scenario phd-spring-entrant-transfer-in-june. Wording W-CL229.

2026-10-06 (DGS — engine and page; policy review round 3): **P3-dh-3.14-3.20-3, option (c).** Notre Dame graduate courses before admission on a record whose earlier program was elsewhere: allocate.ts `ndBeforeAdmission` (provisional, not transfer credit, no §5.2 projection), review.ts names the twelve, app.ts words the group (“graduate coursework”, its own paragraph). The DGS will ask the Graduate School when such a student appears. tests/nd-before-admission-master-elsewhere.test.ts; scenario phd-nd-courses-before-admission-master-elsewhere. Wording W-CL226–W-CL228.

2026-10-06 (DGS — engine; policy review round 3): **P3-dh-3.14-3.20-2.** The probation and dismissal GPA warnings (audit.ts `gpaTerms`) read only semesters from the entry term on. Scenarios phd-low-gpa-semesters-before-entry and phd-low-gpa-semester-in-program; the scenario runner gained `expectWarnings` / `expectNoWarnings`.

2026-10-06 (DGS — page text; policy review round 3): **P3-dh-3.14-3.20-1.** An unfinished program in another Notre Dame department: the standing card (app.ts `ndOtherUnfinishedSentence`) and the dialog’s “Did you finish that degree?” (background.ts) describe a program transfer (DGS Handbook §3.15) instead of §5.2’s six, unless the record holds Notre Dame graduate courses from before the entry term. No counting changed. Wording W-CL224–W-CL225.

2026-10-06 (DGS — engine and page; policy review round 3): **P3-dh-3.1-3.13-3, with the optional (3).** An I in the named graduation semester: `report.graduation.incompletes` (audit.ts) feeds a warning, the graduation next step (next-steps.ts) and the processing request (grad-admin-request.ts); the course line carries the clause (allocate.ts `incompleteInGraduationTerm`). Both programs. tests/graduation-incomplete.test.ts; scenario mscse-incomplete-in-graduation-semester. Wording W-CL220–W-CL223.

2026-10-06 (DGS — page; policy review round 3): **P3-dh-3.1-3.13-2, option (b).** The transcript’s empty semesters run through the current one (src/ui/withdrawals.ts `transcriptGapSemesters`, moved out of app.ts), so a medical leave this semester is asked; the medical-leave count is always in Your standing’s selector (closed unless a transcript sign needs an answer), so a leave approved for a coming semester can be entered. tests/transcript-gaps.test.ts; scenario phd-leave-current-semester-after-import. Wording W-CL219.

2026-10-06 (DGS — engine and request; policy review round 3): **P3-dh-10-2** (“Apply the suggested handling”). A graduate course from an earlier Notre Dame master’s in another department: the review request asks for a paste-ready ExternalCourses row under UNIVERSITY OF NOTRE DAME (review.ts `transferRow`; transcript/external.ts `reviewRequestCourses`, moved out of app.ts), the row’s `dgs_approval` offers the per-course tick (allocate.ts `decidedCaseByCase`), the lookup also tries UNIVERSITY OF NOTRE DAME (data/external.ts `NOTRE_DAME_ROW_UNIVERSITY`), and the waiting reason reads “no transfer decision recorded yet”. tests/prior-nd-program-transfer.test.ts; scenario phd-prior-nd-other-department-transfer. Wording W-CL216–W-CL218.

2026-10-06 (DGS — page; policy review round 3): **P3-dh-3.1-3.13-1** (“Apply the suggested handling”). An all-W (or all-F) fall or spring on the Notre Dame transcript, with a later semester after it, now asks the readmission question under Your standing and opens that selector until a readmission is entered (src/ui/withdrawals.ts `withdrawalSemesters`, `withdrawalQuestion`; app.ts `clockFields`). The all-W full-time tick and the residency cards’ note point at it. tests/withdrawal-semesters.test.ts; scenario mscse-withdrawn-semester-then-return. Wording W-CL213–W-CL215.

2026-10-06 (DGS — engine and page; policy review round 3): **P3-cse-5-6-3, with the DGS’s caveat.** The glossary’s “Transfer credit” and the paragraph above the MSCSE’s courses now say a Ph.D. student’s own Notre Dame MSCSE is Ph.D. coursework, not transfer credit (app.ts `ownMscseSentence`, `holdsOwnMscse`; report.ts glossary). The caveat: an MSCSE that ended five years or more before the Ph.D. (allocate.ts `mscseSeparation`, `isOwnMscseCoursework`) makes every MSCSE course provisional and `interrupted` + `mscseSeparated` — it waits for the DGS and the Graduate School (Academic Code §5.5), with the core areas and specialization it satisfies, a warning, a review-request item for the whole MSCSE and one per course. tests/mscse-separation.test.ts; scenario phd-nd-mscse-five-years-before. Wording W-CL208–W-CL212.

2026-10-06 (DGS — wording; policy review round 3): **P3-cse-5-6-1** (“apply the suggested handling”). With no earlier graduate program (or after an unfinished Ph.D.) no document states a transfer limit, so the page calls its 6 a working limit and says the DGS decides: the transfer row’s note (transfer.ts `capNote`, keyed on the courses’ `noPriorProgram` flag so a finished Notre Dame MSCSE is not told it has no earlier program), the standing card’s earlier-degrees sentence and the Transcripts card’s transfer hint (app.ts `transferLimitStated`). No counting changed. tests/transfer-limit-wording.test.ts. Wording W-CL204–W-CL207.

2026-10-06 (DGS — engine; policy review round 3): **P3-cse-4b-3** (“Apply the suggested handling”). A dated defense or submission with a blank OCE date is a missing date: the OCE reads Cannot evaluate and asks for it (phd.ts `candidacyRow`’s guard; milestone-deadlines gives its box no state), and the admission card asks for both dates. A submission with no defense date makes the defense row ask for its date. A defense dated before the OCE, or a submission before the defense, goes to the DGS with “check both dates”. tests/dissertation-date-order.test.ts; scenario phd-defense-dated-without-oce-date. Wording W-CL200–W-CL203.

2026-10-06 (DGS — engine; policy review round 3): **P3-cse-4a-2, option A.** A core-knowledge area or the specialization completed after §4.4’s four semesters is Conditionally met until the DGS confirms an extension; inside the DGS’s extension it stays Met and says so. Lateness is judged by the semester the component was first complete (`completedIn`, set by `coreRows` / `categoriesRow`; read in `withQualifierDeadline`). The qualifier card waits too (`completedLate`): no “Complete”, no form reminder, no Grad Admin form request, a waiting Milestones line, and a DGS line in the advisor email. Judgment calls in the DECISIONS row: the OCE gate counts a late component as done coursework, and a late research pass makes the qualifier wait instead of reading Overdue. tests/qualifier-late-component.test.ts; scenario phd-qualifier-specialization-after-four-semesters. HANDBOOK-REVISIONS item 26. Wording W-CL195–W-CL199.

2026-10-06 (DGS — tests; policy review round 3): **P3-cse-4b-2** (“Apply the suggested handling”). Already fixed by the DGS’s “Treat both as not done” ruling the same day (commit d953ca2; its DECISIONS row is the one the finding asked for): a core area waiting for the DGS keeps the OCE gate closed and the card names the decision. Its follow-up, the dated-OCE coursework check, is P3-cse-4b-1. Added the finding’s own case, an unreviewed undergraduate CS 380 for Algorithms, as scenario phd-oce-gate-core-pending-undergrad. No engine change.

2026-10-06 (DGS — engine; policy review round 3): **P3-cse-4b-1, Decision 1 “the exam’s semester”, Decision 2 (a).** A dated OCE’s coursework is checked as the record stood at the exam (audit.ts builds `ctx.atOce`: the courses up to the exam’s semester, that semester’s as in progress, re-classified and re-allocated as of the exam date): the 24 regular-course credits, the core-knowledge areas and the specialization (phd.ts `courseworkAtExam`). A shortfall sends the OCE to Needs DGS review with `courseworkReview` naming it; the admission card’s OCE condition then waits (● “but the DGS has to confirm your coursework at the exam”, the DGS’s wording), so “apply now” is held, and the advisor email asks the DGS to confirm. The overdue card of an OCE not yet taken lists all the coursework still needed. tests/oce-dated-coursework.test.ts; scenario phd-oce-dated-without-core-course; the fixtures whose OCE predated their last courses had those courses moved earlier. HANDBOOK-REVISIONS item 25. Wording W-CL191–W-CL194.

2026-10-06 (DGS — engine and page; policy review round 3): **P3-cross-doc-1, option A.** The leave input reads “Semesters on approved medical leave”: only an approved medical leave (or a childbirth/adoption accommodation) moves the Ph.D. and MSCSE time limits and the eighth-semester deadlines (Academic Code §6.2.6); a leave for another reason is not entered and moves no clock. Every leave sentence names medical leave. HANDBOOK-REVISIONS item 24. Wording W-CL189–W-CL190.

2026-10-06 (DGS — engine; policy review round 3): **P3-cse-4a-1.** The specialization row’s needed courses in progress are chosen in term order by re-running the group matching (phd.ts `categoriesRow`), so a course opening an extra group is neither counted in the lead nor allowed to hold the OCE gate back a semester. Scenarios phd-specialization-extra-group-same-term and -next-semester; tests/specialization-needed.test.ts.

2026-10-06 (DGS — page): **Condition marks on the candidacy card.** Each condition is marked ✓ met, ◐ in progress, ● waiting for the DGS or ✕ not yet, in the bullet’s place, with the course table’s colours (types.ts `ConditionMark`; phd.ts marks the admission conditions and `oceReadiness`’s items; report.ts draws them via marks.ts `conditionMark`). tests/condition-marks.test.ts; the app suite checks the marks and shoots `app-condition-marks`. Wording W-CL188.

2026-10-06 (DGS — engine wording; policy review round 3): **P3-chg-phd-1.** The Not-started candidacy card names regular-course credits waiting for the DGS’s decision (“3 waiting for a DGS decision (CSE 40625) — 3 more needed unless the DGS approves them”; “still needed: the DGS’s decision on CSE 40625, or 3 more regular-course credits”) instead of asking for them as courses to take. Applied together with the DGS’s gate ruling. tests/oce-gate-pending.test.ts. Wording W-CL187.

2026-10-06 (DGS — engine): **The OCE gate waits for the DGS on a core area too.** A core area or the specialization met only by a course awaiting the DGS’s ruling no longer opens the gate (phd.ts `oceReadiness`): the candidacy card stays Not started and names the decision. DGS: “Treat both as not done” (the question raised with P3-chg-phd-1). tests/oce-gate-pending.test.ts. Wording W-CL186.

2026-10-06 (DGS — page): **Group headings spell out the OCE.** The report’s group headings are exempt from the first-mention rule (first-mention.ts skips `.group-head`), so the heading over the candidacy cards reads “Oral Candidacy Exam (OCE) and candidacy”. The app suite’s first-mention check counts the heading separately. Wording W-CL185.

2026-10-06 (DGS — engine; policy review round 3): **P3-cse-3-1, and the Ph.D. for symmetry.** The time-limit rows count coursework: each credit requirement is complete at the end of the term its counted courses first reached the minimum (context.ts `creditsReachedAt`, `lastCompletion`), so a course that completed one after the limit makes the row Eligibility at risk and is named; surplus courses after the limit are not flagged. MSCSE: 30 total, 24 regular, 6 project/thesis; Ph.D.: 60 total, 24 regular, 9 at Notre Dame. Scenario mscse-last-course-after-the-limit; tests/time-limit-coursework.test.ts. Wording W-CL184.

2026-10-06 (DGS — page; policy review round 3): **P3-cse-1-2-2.** The Next steps advisor step follows the advisor card: enter the name, answer the faculty-status question, or — for No or Not sure — send the review request. The review-request step also counts the request’s non-course items and says everything once (next-steps.ts). tests/next-steps.test.ts. Wording W-CL181–W-CL183.

2026-10-06 (DGS — page; policy review round 3): **P3-cse-1-2-1.** The advisor summary and the Grad Admin request print the cumulative GPA with the card’s `gpaText`, so 2.996 is never “3.00” in an email (standing lines and the GPA evidence row); the import preview’s graduate cumulative GPA labels too. tests/email-gpa.test.ts.

2026-10-06 (DGS — page; policy review round 3): **P3-chg-phd-2.** The Next steps list names an OCE that is overdue or due this or next semester (the merged OCE row was dropped as unscored), and no longer lists the final dissertation or thesis submission before its defense is dated. The list’s row choice is now the pure `attentionRows` in report.ts; tests/next-steps-attention.test.ts.

2026-10-06 (DGS — engine; policy review round 3): **P3-chg-other-2.** A retake is a registration in its own semester for the semester-of-graduation check and the candidacy card’s “Registered this semester” line too, as the full-time record already had it: all three use residency.ts `sameTermDuplicate` (only a same-term duplicate is dropped). Scenario mscse-retake-in-graduation-semester (the scenario runner gained `expectGraduation`); tests/retake-registration.test.ts.

2026-10-06 (DGS — wording; policy review round 3): **P3-cross-doc-4.** An open Incomplete’s course line states Academic Code §4.4’s rule — finish the work within 30 calendar days of the date grades were due, then 14 days for the instructor to report — instead of “complete the work by about” the instructor’s 44-day date (allocate.ts). The 44-day status is unchanged. Wording W-CL180 (replaces W-CL71’s Incomplete line); fixture phd-incomplete-open updated.

2026-10-06 (DGS — engine; policy review round 3): **P3-ac-6.2-app-1.** A readmitted Ph.D. student’s eighth semester for the OCE and admission to candidacy keeps counting calendar semesters from the original entry, the time away included (DGS: “The clock counts by calendar semesters regardless of the gap. However, exceptions can be approved by the graduate school when requested by the DGS.”). No count changed. Both candidacy rows say so while open, the review request asks the DGS whether to request the Graduate School’s exception while the OCE or admission is still to come (phd.ts `readmissionGapCounted`), and the readmission warning and hint say the time away is counted. Fixture phd-readmitted-candidacy-calendar; tests/readmission-candidacy-clock.test.ts. HANDBOOK-REVISIONS item 23. Wording W-CL176–W-CL179.

2026-10-05 (DGS — engine and page; policy review round 3): **P3-chg-other-1, option (a).** An early start’s summer courses — the Notre Dame courses of the summer just before a fall entry — are the program’s own coursework: counted, never refused with “check the entry term”, never filed as an earlier program’s (`src/engine/early-start.ts`; prior-nd.ts `isPriorNd`, the import preview, the hand-add toast, the audit warning, the §3.8 summer cap). The clocks, the §5.2 window and residency still run from the fall. Claude’s guard rails, open for the DGS: the summer stays earlier coursework when the record ties it to an earlier Notre Dame degree (undergraduate registration, an August bachelor’s, a Notre Dame degree awarded that summer, a held Notre Dame master’s with no award term). Saved records are re-filed on load (`refileEarlyStartCourses`). Also: `derivePriorMs` no longer runs past an answered earlier-degrees question, and a saved record’s leftover inferred value takes the answer back (`settleAnsweredPriorMs`). Fixture mscse-early-start-summer; tests/early-start.test.ts. HANDBOOK-REVISIONS item 22. Wording W-CL174–W-CL175.

2026-10-05 (DGS — engine; policy review round 3): **P3-ac-5a-3.** After a readmission following five years or more away, the examinations from before it wait for the DGS too (Academic Code §5.5), not only the courses: the research qualifier, the OCE, a qualifier passed under the earlier rules, the MSCSE defense or project report, and the core-area, specialization and seminar rows met only by courses from before the gap (context.ts `beforeForfeiture`; result flag `forfeitReview`). The qualifier card says the parts were done before the gap and waits for the DGS; the review request names the examinations. Fixture phd-readmitted-exams-before-gap. Wording W-CL173.

2026-10-05 (DGS — engine; policy review round 3): **P3-ac-5a-2.** Academic Code §5.5’s five years are counted as the time actually away — from the end of the last Notre Dame term before the readmission to the start of the readmission term (allocate.ts `ACADEMIC_CODE_FORFEIT_YEARS`), not by subtracting year numbers. Open for the DGS to confirm: fall to fall (or spring to spring) five years apart counts as a shorter gap (DGS Handbook §3.3). Fixtures phd-readmitted-after-four-years and phd-readmitted-after-five-years-to-the-semester.

2026-10-05 (DGS — engine; policy review round 3): **P3-ac-5a-1, option (a) with option 1.** Only a leave before the end of the eighth semester of enrollment, or an accommodation for a birth or adoption in or before it (even taken the semester after), moves the Ph.D.’s OCE and admission-to-candidacy deadline (phd.ts `eighthSemester`); every leave and accommodation still moves the eight-year limit. Ph.D. students give each leave’s semester and each birth or adoption’s semester under Your standing (`leaveTerms`, `accommodationEventTerms`); one not given yet is not counted, the card says so and the selector opens. The fixture phd-leave-shifts-clocks was rewritten (leaves before the eighth); new: phd-leave-after-eighth-semester, phd-accommodation-birth-in-eighth-semester. HANDBOOK-REVISIONS item 21. Wording W-CL170–W-CL172.

2026-10-05 (DGS — engine; policy review round 3): **P3-ac-4-1.** Notre Dame’s Incomplete clock (Academic Code §4.4) applies to Notre Dame courses only; an Incomplete from another university is held for the DGS until it is graded (DGS: “an outside I should be held for DGS review”; allocate.ts `outsideIncomplete`), and another university’s W no longer claims a Notre Dame semester’s full-time status. The review request no longer repeats “not in the course rules yet” for a held unlisted course, and a held transfer line says “waiting for the DGS” once (W-CL169). Wording W-CL167–W-CL169.

2026-10-05 (DGS — engine; policy review round 3): **P3-import-1, Option 1 with (a)–(c) and the three conditions.** Graduate transfer credit on the Notre Dame transcript’s accepted-transfer block counts as posted (CourseEntry `ndPosted`; allocate.ts `classifyPosted`; src/engine/nd-posting.ts), at the hours Notre Dame recorded, with no review or processing request, and the transfer card reads Met without the tick when all counted transfer credit is such credit. Undergraduate block credit is bachelor’s coursework (the reader keeps each block row’s level); credit of unknown level, or posted before the entry term, waits for the DGS, whose answer is the tick on the course. One course, one row, whichever transcript is imported first (src/ui/nd-posted.ts); records saved with both rows count it once. Wording W-CL159–W-CL166. **P3-ac-5b-6.1-1:** a GPA figure over zero GPA hours (research-only or withdrawn-only semesters) is no GPA — the reader skips it, and saved 0.00 figures for semesters with no graded Notre Dame course are ignored. The e2e Notre Dame fixture’s transfer row is now Michigan EECS 58200, posted Spring 2027 (counted as posted). Open: the DGS to confirm the implementation choices recorded in DECISIONS (the tick as the answer on waiting credit; the core-area question kept).

2026-10-05 (DGS — display): “Semester you plan to graduate in (optional)” is asked only once graduation is in sight (`graduationInSight`, audit.ts). For a Ph.D. student that is once the OCE is passed (or a later milestone is dated); for an MSCSE student, once the credits complete or in progress reach 30. It is always shown when a semester is on file. No new wording.

2026-10-05 (DGS — display): the student’s warnings float in the window’s corner while scrolling (`.warnings.floating`, report.ts), open until folded; folded stays folded until the warnings change. Embedded and printed, the box stays in the page.

2026-10-05 (DGS — display): the “CSE §” chips beside card and section headings on both pages show the handbook’s own text on hover, click or Enter (`sectionRef`, src/ui/section-ref.ts). The text is generated from the PDF by `npm run handbook-text` into src/ui/handbook-text.ts, and the tests check it against the PDF’s SHA-256. Wording W-CL158.

2026-10-05 (DGS — engine): the OCE and admission also wait for a tenured or tenure-track advisor or co-advisor (`oceReadiness`). With none, or the question unanswered, they read Not started and the card names it (W-CL157). Open question: how to record a DGS-approved exception for a sole non-TTT advisor.

2026-10-05 (DGS — display): the Not-started candidacy card lists the coursework that puts it in progress, with each piece’s standing, and when the OCE can be scheduled (W-CL156). “Does not apply” rows (`doesNotApply`, report.ts) and the milestone fields that do not apply are hidden; the counts already left them out. The advisor summary prints one line for the merged candidacy card.

2026-10-05 (DGS — engine): the OCE gate reads only the courses the coursework needs (`oceCourseworkStatus`; `completingCourses` on the core and specialization rows), and the Not-started cards say why (W-CL155). Tests in tests/candidacy-admission.test.ts (“why the OCE is not started yet”).

2026-10-05 (DGS — engine): the admission-to-candidacy card lists every condition, from a verified sweep of the three documents. Not started: they sit under Relevant Policies (page-only notes, `pageOnly` on DetailPart, dropped by whyFor). In progress: facts, including the new advisor faculty-status condition and an informational “Registered this semester” line. The RCR field in Milestones waits for the card to be under way. HANDBOOK-REVISIONS 19–20. Tests in tests/candidacy-admission.test.ts. Wording W-CL154.

2026-10-05 (DGS — display): Your standing’s policy text behind “Relevant Policies” (`policyFold`).

2026-10-05 (DGS — engine, correcting 2026-10-04): the OCE waits for the coursework, not the whole qualifier: the 24 regular-course credits (transfer credit counts) and the qualifier’s core-knowledge and specialization courses, done or finishing this semester (`oceCourseworkReady`). The research component no longer gates it. The admission card’s coursework line says transferred credits count. Tests in tests/candidacy-admission.test.ts. Wording W-CL153.

2026-10-04 (DGS — wording): the alpha notice lost its coverage caveat. The footer’s self-check paragraph now names the Graduate School’s Academic Code, DGS Handbook and 4+1 guidance, and what is routed to the DGS (W-CL152).

2026-10-04 (DGS — engine): the OCE and admission to candidacy read Not started until the qualifier is complete or due to complete this semester, with the research component passed (qualifierReadyForOce, phd.ts). The Milestones fields appear only once their step is under way. Scenarios gpa-floor, phd-fresh, phd-nd-undergrad-before-entry and phd-oce-clock-after-completed-mscse now expect Not started; tests in tests/candidacy-admission.test.ts. Wording W-CL151.

2026-10-04 (DGS — display): Your standing’s four selectors stay closed unless they need attention: a part-time semester warning, or an unanswered transcript gap. An answer on file shows in the summary line. Wording W-CL150.

2026-10-04 (policy review, DGS — notes): P2-dh-6-9-5 applied. A dated defense in a semester with nothing entered points to confirming registration (DGS Handbook §8.2.5; Academic Code §3.7), with no status change. With it, every finding of the 2026-10-02 policy-compliance review is fixed, ruled or out of scope; none is open. Scenario phd-defense-term-not-registered. Wording W-CL149.

2026-10-04 (policy review, DGS — notes): P2-dh-4-5-3 applied. The Ph.D. eight-year row tells a transfer from the MSCSE that funding does not reset (years count from the MSCSE start). It tells a finished-MSCSE student that a separate Ph.D. program gets full support, and that whether CSE’s counts as separate is the Graduate School’s call (DGS Handbook §4.1). Scenario phd-mscse-transfer-funding-clock. Wording W-CL148; W-CL139 extended.

2026-10-04 (DGS — display): Your standing’s full-time and leave selectors follow the Notre Dame transcript when one is imported (a missed semester is named; otherwise only the accommodation is asked). Cards’ “Details” is now “Relevant Policies”. The specialization card folds its course list while open. The OCE and RCR are merged into the admission-to-candidacy card (`mergedInto`, unscored). P2-ac-5b-6.1-1 and P2-ac-5a-5 ignored (DGS: handled outside the app). Tests in tests/candidacy-admission.test.ts. Wording W-CL144–W-CL147.

2026-10-04 (policy review, DGS — engine): P2-ac-5a-3 (a leave note on the Ph.D. residency row, plus a review-request line), P2-ac-5b-6.1-15 and P2-dh-3.21-3.24-23 (MSCSE `ms.thesis.submitted` row and `thesisSubmitted` milestone, Academic Code §6.1.8), P2-ac-5b-6.1-2 (`shared.goodStanding` while on probation, Academic Code §5.7.1). Scenarios phd-leave-inside-residency-run and mscse-on-probation-good-standing; the thesis fixtures now carry a submission date. Wording W-CL140–W-CL143.

2026-10-04 (policy review, DGS — notes): P2-dh-4-5-1 applied with the DGS’s change. The Ph.D. eight-year row names the funding consequence, “graduate enrollment at Notre Dame of fewer than eight years” (DGS Handbook §4.1), once the limit is due soon or past. For a record with a Notre Dame MSCSE it always says whether those years count is the Graduate School’s call. No status changes. Scenario phd-nd-mscse-funding-years; tests in tests/readers-summer-tuition.test.ts. Wording W-CL138–W-CL139.

2026-10-04 (policy review, DGS — engine): P2-dh-10-5 applied. An MSCSE student on the thesis option is asked whether the thesis advisor (and any co-advisor) is tenured or tenure-track CSE faculty (DGS Handbook §10.3.2, §10.3.8; CSE §2.3), as the Ph.D. is. A no or not sure for every advisor goes to the ADGS; unanswered cannot be evaluated. The project option is not asked (HANDBOOK-REVISIONS 18). Scenario mscse-thesis-advisor-not-ttt; tests in tests/ms-examination-and-advisor.test.ts. Wording W-CL135–W-CL137.

2026-10-04 (policy review, DGS — engine): P2-dh-3.1-3.13-3/-4/-9 applied. The readmission input now covers a missed fall or spring semester as well as a withdrawal. Under five years, the program courses from before the readmission count provisionally and go to the review request (DGS Handbook §3.3), and any readmission adds a review-request line (DGS Handbook §3.1, §3.3, §3.8). Five years or more is unchanged (Academic Code §5.5). Scenario mscse-readmitted-after-missed-semester; unit tests in tests/graduate-school-steps.test.ts. Wording W-CL131–W-CL134.

2026-10-04 (DGS — display): night mode on both pages. An Auto · Light · Dark switch at the top right of the masthead (src/ui/theme.ts); Auto follows the device’s light/dark setting the way Claude Desktop does (so a Mac on Appearance “Auto” switches at nightfall). Embedded, Auto stays light. Every colour in src/style.css is a token (light values unchanged; dark ones under `:root[data-theme="dark"]`, screen only). Tests: tests/theme.test.ts; the a11y e2e runs axe in Dark on both pages and saves app-dark.png / courses-dark.png. Wording W-CL130.

2026-10-04 (policy review, DGS — engine): P2-ac-1-3-2 applied — a student enrolled in a second Notre Dame program at the same time says so under Your standing (rare fold), ticks “Also counts toward my other degree” on the shared Notre Dame courses, and at most nine of those credits count (Academic Code §2.2; `DUAL_DEGREE_SHARED_CREDITS_MAX` in code, cap `otherdegree`, rows `ms.cap.otherdegree` / `phd.cap.otherdegree`); until “The Graduate School approved my dual-degree plan of study” is ticked under Approvals, they wait for the Graduate School (DGS Handbook §2.9). Shared rows stay registrations for residency (Academic Code §3.5). This also closes P2-dh-front-1-2-7 (case b; case a was fixed earlier) and P2-ac-1-3-12. Tests: tests/dual-degree.test.ts, scenarios mscse-dual-degree-shared-nine and phd-dual-degree-plan-pending. Wording W-CL125–W-CL129.

2026-10-04 (policy review, DGS — wording): P1-page-text-engine-11 (the Ph.D. 4+1 track note names the UG→GR condition), P1-page-text-ui-3 (transfers are “recommended by the DGS”; the processing request asks the Grad Admin to submit the Transfer of Credits request, and to check the record only after the student ticks the Graduate School’s approval), P1-page-text-ui-5 (DGS: the official transcript goes directly from the registrar to the Graduate School; the student attaches copies). Wording W-CL122–W-CL124.

2026-10-04 (policy review batch, DGS — engine): applied P2-ac-1-3-6/P2-ac-4-10 (V, the audit grade, earns nothing and is no registration; the import keeps V/AU rows), P2-dh-3.21-3.24-2/-4 and P2-dh-front-1-2-2 (the Application for Admission to Master’s Degree Candidacy: milestone date `msCandidacyApplied`, uncounted step `shared.msCandidacy`, processing-request item, next step, advisor-summary line), P2-dh-3.21-3.24-24 (an optional graduation term; registration in it checked), P2-ac-6.2-app-7/P2-dh-3.14-3.20-27/P2-dh-10-10 (a Graduate School time-limit extension under Approvals), P2-fourplusone-1 (the 4+1 admission term in the opening questions; extras beyond the shared six depend on it — existing 4+1 records with extras must answer it), P2-dh-front-1-2-6 (a warning for pre-entry program coursework). Ignored P2-dh-10-17 and P2-dh-front-1-2-1. Wording W-CL116–W-CL121.

2026-10-04 (policy review, DGS — engine): asked what was left, the re-read found 39 rows labelled “updated by a related fix” whose suggestion was still partly unapplied and unruled; they are now “still open” in the report (v46+, the renderer keeps an open merged duplicate as its own row). The DGS then ruled four: P1-page-text-engine-15 no change (the sheet decides 50000-level courses; stricter than the Graduate School is fine); P1-page-text-ui-9 — new required Parameters key `summer_fulltime_credits_min` (6, DGS Handbook §10.3.2; live sheet row 29): an MSCSE summer of six or more registered credits counts as the residency session on its own; P1-sheet-33 — the bachelor's-sharing row cites Academic Code §4.6 and says the 40000-level part rests on the Graduate School's email; P1-sheet-40 — the DGS set CSE 63801/63802 to adgs_approval on the MSCSE (they count toward the 30, never the 24, once approved), and seminar course lines no longer claim “the research seminar requirement” outside the Ph.D.'s two seminars. 32 rows remain open for the DGS (see the report's to-review view).

2026-10-04 (the sheet’s own documentation, DGS: “Bring all of them up to date”): the live sheet’s README tab now matches the app — what the sheet holds (department numbers; the Graduate School’s live in code), the grey-header columns (level and last_offered are read), `dgs_approval` vs `adgs_approval` (the cell names who signs off), the retired `any` group code, Notre Dame courses filling a §4.4.2 group whenever taken, `dgs_reviewed` (shown as Confirmed/Pending on the course page), the schedule columns dated by a new `last_offered` entry, the yearly routine, the transfer columns’ undergraduate-number flag, `cse_subject_codes` (ECE; blank holds a transfer for the DGS), `is_cse` (column H), the Ph.D.’s share of the six bachelor’s credits; the `phd_senior_grad_credits_max` and `current_semester` entries are gone, and the Parameters tab’s explanation note (F5) says department numbers only. The repo’s README A1 table and data/README.md had three of the same stale lines (`notes` “shown on hover”, `any`, “the Ph.D. has no equivalent cap”), fixed with the sample/fixture notes.

2026-10-04 (Parameters tab, DGS: “remove any rows that are not needed any more”): five rows deleted from the live sheet — the two retired credit factors (old rows 41–42) and the three parked rows (`ms_thesis_readers_min`, `candidacy_committee_additional_members_min`, `phd_senior_grad_credits_max`). 36 rows remain, every one read by the app; the live sheet validates with no Parameters issue. In the code all five are `RETIRED_PARAMETER_KEYS` (the parked list is gone), and the sample/fixture sheets lost their two parked rows. `data/snapshot.json` keeps the old rows until the next six-hourly sync.

2026-10-04 (policy-review batch, DGS — engine): P2-dh-10-19 — an MSCSE thesis student answers whether both readers are tenured or tenure-track CSE faculty and neither is the advisor (behind “Have your two thesis readers been nominated?”); “no”/“not sure” goes into the review request, and a passed defense reads Conditionally met until the ADGS confirms (before the defense the row stays In progress). P2-dh-3.14-3.20-23 — the unmet Ph.D. advisor row notes that a student without an advisor may be dismissed (§2.3; DGS Handbook §3.17). P2-dh-4-5-4 — the time-limit row notes the Graduate School’s tuition scholarships through the 8th/5th year once the limit is near or past. P2-dh-3.21-3.24-3 — a record whose every Notre Dame term is a summer session gets the seven years of Academic Code §6.1.4 named on the five-year row; past five and inside seven it reads In progress against the seven and the review request asks the ADGS. Two Graduate School numbers added to README § A5b; HANDBOOK-REVISIONS items 14–15; wording W-CL110–W-CL113. Ignored: P2-dh-6-9-3 (immigration documents), P2-dh-3.21-3.24-27, P2-dh-6-9-4, P2-dh-4-5-6.

2026-10-04 (thesis topic, DGS): P2-ac-5b-6.1-14 applied — an MSCSE thesis student records the date the thesis topic was approved (Academic Code §6.1.7); an uncounted step “Thesis topic approved” sits before the defense row, “Not started” until dated. P2-dh-3.21-3.24-8 ignored (the readers are not tracked).

2026-10-04 (policy-review batch, DGS): applied P2-ac-6.2-app-8 (the Ph.D. advisor’s tenured/tenure-track question), P2-ac-5b-6.1-11 (§6.1.5 timing note), P2-ac-4-11 (NR imported as in progress), P2-ac-1-3-15 (zero-credit summer research), P2-ac-5b-6.1-4/-6/-7 (probation and dismissal grounds from the transcript’s per-term GPAs and research U grades), P2-ac-5b-6.1-12 (thesis-defense retake); ruled P2-ac-6.2-app-11, P2-dh-front-1-2-4, P2-dh-4-5-2, P2-dh-3.21-3.24-15; parked `candidacy_committee_additional_members_min` (live sheet D22 says PARKED). Note for the next session: every Ph.D. record with an advisor reads “cannot evaluate” on the advisor row until the student answers the new question.

2026-10-04 (readers’ approval removed, DGS): the Ph.D. row “Dissertation unanimously approved for defense by the readers” (§4.6) and its date are gone — the committee approves the dissertation and passes the defense at the same time, so the defense row (§4.7) stands for both; a saved file with the old date loads without it. The same for the MSCSE’s “Thesis approved by both readers (§3.4)” (DGS: “Apply the same to MSCSE thesis”): the thesis defense stands for both.

2026-10-04 (opening notice, DGS): Enter clicks “Continue” once it is live (the notice ticked and every question answered); a typed transfer year is taken first; links, buttons, drop-downs keep their own Enter.

2026-10-04 (Milestones deadlines and the sheet’s scope, DGS): every date box in the Milestones card shows its deadline beside it (`AuditReport.milestoneDeadlines`, computed by the engine from the rows’ own helpers; DECISIONS row lists which deadline each date has). An adversarial review (19 confirmed findings) was fixed before the commit; one is a verdict change implementing the 2026-10-03 reading: a research-qualifier pass recorded after a fail is measured against the committee’s six months, not the 18 (scenario `phd-research-pass-after-fail`; Changelog row 47). README states that the sheet governs only department-level numbers: a new § A5b lists every Graduate School number kept in code (source, constant) and says changing one is Track B; CLAUDE.md, AGENTS.md and data/README.md match. The DGS then ruled (same day): the quarter/trimester credit factors (DGS Handbook §3.14) move into code (`QUARTER_CREDIT_FACTOR` / `TRIMESTER_CREDIT_FACTOR`; the Parameters keys retired with a “no longer read” warning) — OPEN: delete Parameters rows 41–42 on the live sheet once this update is deployed (their notes say RETIRED; the deployed app still reads them until then) — done 2026-10-04, with the three parked rows. And the Spring 2020 cohort’s admission: the ninth semester with the probation named (option C, treating Appendix A.4’s silence about admission as an oversight).

2026-10-04 (P2-dh-3.21-3.24-16, DGS — engine): the Oral Candidacy Exam and admission to doctoral candidacy are two rows (“OCE and doctoral candidacy are two different things … Passing OCE is one of the requirements of doctoral candidacy”). `phd.candidacy` is the exam only (§4.5: eighth semester, coursework before the exam, probation for a late or missing exam); the new `phd.candidacyAdmission` “Admitted to doctoral candidacy” (Academic Code §6.2.9; DGS Handbook §3.22.3) lists its conditions as facts — OCE passed, four consecutive full-time semesters, coursework complete, cumulative GPA ≥ 3.0, RCR training — and is due by the end of the eighth semester (probation, §5.7.3). New milestone date `candidacyAdmitted` (Milestones card, after the OCE date); the processing request asks the Grad Admin to initiate the application when every condition is met; the eight-year row needs the admission too. An adversarial review of the split (three lenses, 14 confirmed findings) was fixed before the commit: the GPA gate stays on a dated admission, missing dates read “cannot evaluate” instead of Overdue/probation (dissertation dated without an admission; admission dated without an OCE), a late but complete OCE/admission no longer blocks the eight-year row (`completedLate`), the admission to-dos follow a dated OCE on every surface, the emails no longer read “admits I”, milestone dates in a loaded file are checked, and the OCE first-mention shortener matches whole words only (it turned the §6.2.9 quote’s “doctoral candidacy examination” into “doctOCEination”). Committed as b2e1050; the sheet’s Changelog tab records it on row 46. Then a third reconciliation pass (DGS: “revisit the policy compliance review and update any others that need to be updated”): eight reviewers re-checked all 509 findings against the code after the split — 71 resolutions changed (26 fixed, 26 updated, 13 ruled, 6 still for the DGS, none contradicting a ruling); the report is version 39 of the same artifact (now 180 fixed, 147 ruled, 133 updated, 49 open for the DGS). Two page sentences the day’s changes had left stale were fixed with it: the entry-term hint and the MSCSE-transfer clock sentences now name the first-year seminars and admission to candidacy (W-CL103).

2026-10-04 (P2-ac-5b-6.1-3 and the Full-time terms, DGS): a probation letter’s deadline is a rare-case date under Your standing (selector “On probation, with a deadline in the letter?”), said at the top of the report, no row recomputed; the Full-time terms selector opens by itself when a semester with courses was not full-time, and shows each such semester highlighted with why. Wording W-CL101; next free W-CL102. No rule behaviour changes (no Changelog row). Committed. From here on (DGS 2026-10-04) a verified batch is committed at once and the reply ends with the merge line — CLAUDE.md, Session protocol.

2026-10-04 (P1-sheet-6, -43, -c8, DGS): `ms_thesis_readers_min` moved to the parked keys (no longer required; live sheet D7 says PARKED); P1-sheet-43 and -c8 ruled fine. Then IIT CS 455: the DGS set the Ph.D. cell to no and asked for warnings on every undergraduate-looking course from another institution — the number check now covers `yes`, case-by-case and unlisted courses (the live sheet flags IIT CS 430 and CS 455, case by case for the MSCSE). Answered the DGS’s question on P2-ac-5b-6.1-3 (an OCE date before semester 8 comes only from a probation letter; no change). Wording W-CL100; next free W-CL101. No rule behaviour changes (no Changelog row). Approved by the DGS and committed (with the P1-sheet-6 parking).

2026-10-04 (DGS batch — engine): the research seminars are due by the end of the first year (P1-sheet-9: Overdue after it, a late pass to the DGS); a `yes` ExternalCourses row with an undergraduate-looking number or a non-regular-looking title draws a sheet-check warning and, for a student who has the course, a note in the review request and a “Please check before processing” section in the processing request (P1-sheet-48, -c2; src/data/course-checks.ts); the non-CSE below-60000 refusal cites §3.2/§4.2; the course-rules page says the DGS decides and the Grad Admin processes (closing the 2026-09-01 open item); the advisor summary’s DGS to-dos advise on the Graduate School’s consequences; the pro-rata table is DGS Handbook §3.14 (live sheet D41/D42 and repo); `cse_subject_codes` cites §3.2, §4.2 with the “outside computing” reading recorded (live sheet C37/D37). Leftovers: the review card now carries the audit’s review flags (the §4.1 note reached only the page before), and the processing request no longer prints “()” after an Academic Code heading. Eleven findings ruled fine. Asked the DGS: IIT CS 455 (ExternalCourses row 75) still says `yes` for the Ph.D. Wording W-CL99; next free W-CL100. Approved by the DGS and committed as 83c4a02 (`origin/main` had nothing new); the sheet’s Changelog tab records the seminar deadline and the new ExternalCourses warnings on row 45. Still open: IIT CS 455 (row 75) says `yes` for the Ph.D. — asked the DGS.

2026-10-03 (P1-page-text-engine-5, -17, -7, DGS): §3.2’s quote keeps “earned at Notre Dame”; “credits count once” cites nothing (§4.4.2 only for a specialization course’s grade replacement); the qualifier passed under the earlier rules quotes nothing and says the new rules do not apply. Wording W-CL97. Then the second reconciliation pass (DECISIONS row of the same evening): 296 findings re-checked — 25 fixed, 53 ruled, 141 updated, 76 still for the DGS, 1 contradicts (P1-page-text-ui-10); four leftovers fixed (MSCSE unlisted 5xxxx line, glossary “Full-time”, unlisted below-40000 citation, the live sheet’s ms_transfer_window_years section). Report version 34. Wording W-CL98; next free W-CL99. Approved by the DGS and committed; no Changelog row (no rule behaviour changed). Eight points await the DGS’s rulings (listed in the DECISIONS row of the pass and the reply).

2026-10-03 (P1-page-text-engine-23 and -3, DGS): the MSCSE’s refusal of a transferred project/thesis course cites §3.2 (the “earned at Notre Dame” clause), not §3.4; the DGS restated the 4+1 rule — a pre-bachelor’s 68901/68902 counts toward the MSCSE when the bachelor’s did not use it — which the engine already applies (MSCSE-only, UG→GR move). The §4.2 nine-credit comments quote the September text. No rule behaviour changes (no Changelog row). Wording W-CL96; next free W-CL97. The DGS declined a tick for the ADGS’s confirmation of a UG→GR move (a re-imported transcript showing GR is what settles it) and approved the commit.

2026-10-03 (P1-residency-enrollment batch, DGS — engine): a semester’s countable credits are capped at Academic Code §3.8’s maximum — 15 credits of graduate courses in a fall or spring, 10 in a summer — with a warning and an overload tick (Claude’s reading of the DGS Handbook §3.10.1’s credit overload eForm, confirmed by the DGS with the other judgement calls); a full-time semester with fewer than 3 credits at the 60000 level or higher (Academic Code §4.1) is named on the residency rows and sent to the DGS; the semester-of-graduation step (Academic Code §3.7) once everything is met; the Ph.D. residency row’s “normally” note; no built-in full-time floor on the page. Six findings ruled fine. Wording W-CL95; next free W-CL97 (W-CL96 used the same evening; W-CL97 since). Approved by the DGS and committed as 89891b3 (`origin/main` had nothing new); the sheet’s Changelog tab records the cap and the §4.1 routing on row 44.

2026-10-03 (P1-deadlines-20, DGS — engine): the along-the-way MSCSE is open to a student who already holds a master’s from another university when the credits earned at Notre Dame are enough (the 2026-09-27 (b) “does not apply” is reversed). The card shows “Earned at Notre Dame: X of 24 regular-course credits and Y of 6 research credits” in every state; the rule and the transferred-credit explanation sit in its Details, with the 40000-level allowance (DGS follow-up: “the 40xxx allowance can be used”) and, where it explains a gap, “A course in progress joins the count once it is graded”. Wording W-CL94. Answered the same evening (DGS): an approved 50000-level course counts toward the along-the-way 24 where the sheet says dgs_approval — the dated rows decide (CSE 50502: Fall 2026 dgs_approval, from Spring 2027 no); no code change, pinned by tests/along-the-way-dated-rows.test.ts. P1-deadlines-1 ruled fine (a summer completion is late for a spring deadline). Approved by the DGS and committed as c3fbb00 (`origin/main` had nothing new); the sheet’s Changelog tab records it on row 43.

2026-10-03 (P1-deadlines-18 and P1-gpa-9, DGS): the DGS corrected the CSE handbook — §2.5.2 now asks for the MSCSE advisor “by the end of the first semester of the program”, matching §2.3 and the engine (no code change; the advisor row’s comment quotes both). The corrected PDF is the live copy on the department’s shared drive (replaced 2026-10-03, 20:16); At the DGS’s yes the same evening it replaced `policy-sources/CSE-Graduate-Handbook-live.pdf` in the repository (byte-identical; the only other change from the previous copy is a comma in §1). Report version 27 records the ruling. P1-gpa-9 (the candidacy GPA “in approved coursework”) ruled fine the same evening: the cumulative GPA stays the candidacy figure (report version 28).

2026-10-03 (display, DGS): result cards show only what is satisfied by what — the rule, reasons, next steps and the rule quote sit behind one “Details” selector per card (engine `{ note }` parts); uncommon inputs sit behind one-line question selectors (`rareFold`); every section names its document (“CSE §”, “Academic Code §”, “DGS Handbook §”; `src/ui/citations.ts`). A standing rule in CLAUDE.md. Also P1-gpa-8 (exam vs admission conditions), -13 (handbook item), -c4 (“graduate-level”); -12, -14, -2, -3, -c5 fine; P1-deadlines-24, -25 fine. Approved by the DGS and committed as 18cf4a2 (`origin/main` had nothing new). No Changelog-tab row: no rule behaviour changed — no expected status moved in any scenario — and the tab takes engine-logic changes only (DGS 2026-09-23).

2026-10-03 (merge): this branch merged `origin/main`, which had the other session's specialization-row change (2026-10-02 evening, below). Both sessions had numbered a new wording row W-CL67; the specialization row is now W-CL89 in `docs/WORDING-REVIEW.md` (the policy-review rows W-CL67–W-CL88 kept the numbers given to the DGS). Next free number: W-CL102.

2026-10-03 (later, defense GPA gate): a Ph.D. or MSCSE thesis defense dated while the cumulative GPA is below 3.0 goes to the DGS instead of reading Met, mirroring the candidacy row (P1-gpa-10, DGS); the project route is not gated.

2026-10-03 (later, yes = pre-approval): on the MSCSE tab a `yes` row below the 60000 level counts outright with no tick, as on the Ph.D. tab (DGS, P1-levels-grades-credits-8, revising 2026-10-02 (2)); `adgs_approval` keeps the tick.

2026-10-03 (later, §3.6.1 guard): a CSE 5xxxx course is refused on the MSCSE tab whatever the sheet cell says, and the diagnostics warn about such a cell (P1-levels-grades-credits-4, DGS); -25, -28, -29, -3 fine.

2026-10-03 (later, ticks): a course whose tick settled a case-by-case approval keeps saying so on its line, on the allowance row and on the Approvals row (P1-levels-grades-credits-30, DGS); flag `tickApproved`.

2026-10-03 (later, credits as printed): the “credits shown as your transcript prints them” note appears on every course from another university whose credit system is unknown (no row, a blank or rejected `credit_system`), unless `nd_credits` fixes the number — not only when the row is missing (DGS, P1-units-4plus1-c7); flag `creditsAsPrinted`, test `tests/credit-system-note.test.ts`.

2026-10-03 (later, 68901/68902): a 4+1’s pre-bachelor’s CSE 68901/68902 counts toward the MSCSE project/thesis six (DGS, P1-units-4plus1-17, reversing 2026-09-12); fixture renamed `mscse-4plus1-thesis-course-counts`.

2026-10-03 (later, reconciliation): every unaddressed finding of the policy review re-read against the day’s decisions (six agents; no contradictions; 174 rows marked fixed / updated / ruled by a related change) and the code leftovers it found fixed — two handbook quotes brought to the September text, the below-40000 refusal citing Academic Code §4.1, the rule-quote prefix, the standing card’s 4+1 sentence, three live-sheet notes.

2026-10-03 (later, two more): the 40000-level sharing with the bachelor’s degree is cited to the Graduate School’s written answer to the DGS (email, 2026-09-10) on the allowance row and the course lines (P1-units-4plus1-12, DGS); P1-transfer-eligibility-c8 consistent.

2026-10-03 (later, six more): P1-transfer-eligibility-24 (the sheet’s yes declared the Code’s advance approval, said on the line), -3 (the window parameter cites §5.2), -7 (a student-chosen letter for an unmapped mark is said on the line), -c7 (HANDBOOK-REVISIONS §4), -5 and -9 consistent.

2026-10-03 (later, emails): the three generated emails warn which imported external transcripts were unofficial copies (P1-transfer-eligibility-16, DGS); c6, 1 and 10 confirmed as fine. The report's revision note is a daily list behind a selector.

2026-10-03 (later again): a transferred course the sheet cannot place inside or outside CSE (no `is_cse` cell, no `cse_subject_codes` list) is held for the DGS instead of counting as CSE by default (P1-transfer-eligibility-23); P1-transfer-eligibility-21 confirmed as fine. The report folds the Fix-first list and prints ids as plain text.

2026-10-03 (later still): the §5.2 row names the gap for an unfinished Ph.D. elsewhere (the Code states the six for an unfinished master’s only); the flat 60 is recorded as the department’s own rule in HANDBOOK-REVISIONS (P1-transfer-eligibility-c4 and -20, DGS: as suggested).

2026-10-03 (later): a transfer course on the record of a student with no earlier graduate program is held for the DGS (P1-transfer-eligibility-11, DGS: “route such courses to DGS review”); fixture `phd-transfer-no-prior-program`.

2026-10-03: the policy-compliance review's fixes (DGS: the 8 fix-first and the 53 conflict findings, 20 of them with his own ruling — `docs/DECISIONS.md` 2026-10-03 rows). The engine now knows grades I and W; the Graduate School's RCR training (`phd.rcr`) and the dissertation's official submission (`phd.dissertation.submitted`) are rows; the §5.2 row is met only once the Graduate School approved and the Grad Admin recorded the transfer; leaves, accommodations, a readmission term, the COVID cohort (from the entry term) and a qualifier extension in semesters move the clocks; MSCSE → Ph.D. transfers run the qualifier clocks from the transfer; the MSCSE and Ph.D. are one graduate program (another ND department's master's is not); summer entry is gone (early start → that fall); a non-4+1's undergraduate 6xxxx course goes to the DGS on the Ph.D. tab; the UG→GR move and the bachelor's + Ph.D. six are confirmed by the DGS; the Full-time terms fieldset lists every semester. 17 new scenario fixtures. The report (artifact “Policy Compliance Review”, https://claude.ai/artifact/1mPvEVFWcigpbwgyy9EQbJ) carries a resolution per finding and a view of what is still open; its data is under `policy-sources/.review/` (git-excluded). Committed on 2026-10-03 as 90e469b (merged with origin/main in fe0d4fc); the sheet's Changelog tab has six 2026-10-03 rows for it.


2026-10-02 (evening): the specialization row lists which course fills which group, and which course in progress may fill which (DGS).

2026-10-02 (later): a course below §4.4.2's B floor says so on its Qualifier line (DGS: the specialization outcome was missing from the line).

2026-10-02: the handbook's September 2026 edition replaces the July 2026 PDF as the source of truth, at `policy-sources/CSE-Graduate-Handbook-live.pdf` (the DGS replaces that file in place for future editions). A sentence-level diff of §2.3, §3, §4 and §5.2 found three rule changes the 2026-09-12 review did not cover — the MSCSE advisor deadline (end of the first semester, ADGS exception), §3.2's 4xxxx credits now subject to advisor + ADGS approval, and §3.2's non-CSE allowance limited to the 60000 level or higher — put to the DGS, who said “Make all three changes” — done the same day: the MSCSE advisor deadline is the end of the first semester, every MSCSE credit below the 60000 level needs the advisor’s and the ADGS’s approval (tick on the course), and the non-CSE allowance row quotes the 60000-level floor the engine already applied.

2026-09-30 (night, later): embedded cross-links between the two pages go to the ND pages that frame them (defaults in sibling-links.ts; the iframe query parameter still overrides).

2026-09-30 (night): the course rules page's paragraphs reach the edge in both modes — the 70ch cap of P-17 is gone (DGS).

2026-09-30 (later still): the blank band under the inputs on a wide window is gone (the footer's grid row is the flexible one); the Who-to-contact card sits top right at desk width on the self-check page too; the opening dialog's hint says to acknowledge the notice at the top (DGS items 1–3).

2026-09-30 (later): the handbook title names no edition any more (DGS: the version is in the document).

2026-09-30: the handbook link is the DGS's permanent Google Drive link (new editions become new versions of the same file).

2026-09-29 (evening, later): the acknowledgement is a tick box inside the notice and the button reads “Continue” (DGS: the old button did not read as the answer to the warning).

2026-09-29 (evening): the opening dialog redesigned — numbered steps, option rows with a bold head and a lighter note, the notice as a note box, a hint beside the waiting button (DGS: ugly and not intuitive) — and a real bug fixed on the way: “Did you finish that degree?” never appeared after “same university?”, so the button never came alive for a degree elsewhere.

2026-09-29 (later still): an undergraduate course from another university reads ✕ no transfer credit on its Credit line and carries its DGS-confirmed core area on the Qualifier line alone (DGS bug report: the core clause led a green credit line and was repeated).

2026-09-29 (later): the course-rules page's schedule tables fit their card at every width above the phone layout — no 980 px floor, wrapping titles (DGS: all columns without a horizontal scroll, like All courses).

2026-09-29: a qualifier component still open after the §4.4 deadline reads Overdue like its umbrella (DGS bug report; the components share the umbrella's deadline).

2026-09-28 (night, later): every requirement in the advisor summary and the Grad Admin request is one block — a bordered card in its colour in HTML, the tag line with its lines indented beneath in text (DGS: which text belongs to which requirement).

2026-09-28 (night): the three emails rebuilt on one skeleton (student line, action list first, programs on the subject — with a new transfer-term question for MSCSE→Ph.D. transfers), the DGS request split into no-reply / reply-needed, the Grad Admin request with a checklist and one course table, the advisor summary stacked with its actions first, the core rows collapsed, the allowance as a meter, and the to-do voice bug fixed (DGS: all 13 suggestions).

2026-09-28 (evening, later): the advisor summary takes the Grad Admin request's style — badges / [WORD] tags in the page's colours, the deadline on its own highlighted line — from one set of helpers in email-html.ts (DGS).

2026-09-28 (evening): the deadline alert — a deadline in this semester or the next colours the row's pill and names the semester ("In progress · due next semester"), replacing the 120-day rule; the Grad Admin request lists every requirement (met / in progress / not started, coloured) and highlights near or passed deadlines (DGS items 1–2 of 2026-09-28).

2026-09-28 (later): a Rensselaer transcript names its school (the wordmark is vector art; the registrar's ZIP+4 / phone now stand in for it, as a guess the student can edit).

2026-09-28: every course with a core or specialization role shows it on a Qualifier line of its own (DGS: a plain ✓ course had lost it to the folded link row).

2026-09-27 (night): **4g done as the DGS specified** — the DGS's approval lives on the course
(`CourseEntry.dgsApproved`), offered only where the sheet decides the course case by case; a
sheet `yes` counts outright (no tick), a course not in the sheet goes to the DGS through the
review request first (no tick settles it), then the student revisits the page, which reads the
latest rules, ticks the courses the DGS approved for them and sends the processing request. The
three record-level boxes are gone (old files migrate on load). The review card states the process.
**Nothing open** from the clarity review now.

2026-09-27 (later still): **clarity proposal 1 done** — a "Next steps" block under the dial (the
coursework sentence, the numbered record-level steps, then the rows that need an action; the
former "Needs your attention" refiltered from status to action), `src/ui/next-steps.ts`. **Still
open:** 4g (a per-course approval control) — the DGS asked for examples; they were given.

2026-09-27 (later): **clarity proposals 4a–4f and 5 done, 6 fixed in the sheet, 7 refused** — the
transfer row's pill is "Waiting for the DGS" with the action first; the along-the-way MSCSE reads
"Not started" (or "Does not apply" for a master's from elsewhere); the MSCSE advisor row has §2.3's
deadline; the 24-credit title is short; the qualifier umbrella states "N of 5 parts done"; the
headline counts the qualifier once and the allowances are meters in their own group (12 checks,
plus 3 allowances); the MSCSE-transfer sentence shows only for a student who came through the
MSCSE. The §3.5 note's 6 stays in the code (DGS: the Graduate School's number; the qualifier's group count was already a sheet key). **Still open at that point:** proposals 1 and 4g.

2026-09-27: **clarity proposals 2 and 3 approved by the DGS and done** — a course cell shows
Credit and Qualifier on two lines with their own marks, and the report column opens with the
score: the warnings and the §3.5/§3.6 note are closed folds under the meters, a plain ✓ course's
"Counts toward" links sit behind a toggle. The collapse policy is in the handoff. Still waiting:
proposals 1 (Next steps), 4 (seven pill questions), 5 (gating the MSCSE-transfer sentence), the
`CSE 30321` sheet cell and the two typed numbers.

2026-09-26 (late): **the clarity pass** — the DGS asked whether the post-import screens could be made
easier to understand and then said to make the recommended changes. Seven reviewers, verified and
consolidated into twelve proposals; the wording and structure items that need no decision are in
(course lines lead with their status — “waiting for the DGS”, “approved by the DGS” — one word per
concept, the §5.2 rule stated once above every prior-graduate group with the sheet’s numbers, the
previews and toast in the student’s words, the Approvals row saying each reason once, a key line
and glossary definitions, a dozen row sentences, one display bug); the strings are W-CL1–W-CL30 in
`docs/WORDING-REVIEW.md`. **Waiting on the DGS** (DECISIONS row of the same evening): a Next-steps
list under the dial, Credit/Qualifier sub-lines, the report column’s order and folds, seven pill
questions, gating the MSCSE-transfer sentence, and one sheet cell (`CSE 30321` level 6).

2026-09-26 (evening): **whose eighth semester** — the DGS's rule for §4.5: a finished Notre Dame
MSCSE does not count (the OCE clock starts at the Ph.D. entry); a transfer into the Ph.D. from an
unfinished MSCSE keeps the MSCSE's clock. The engine already counted from the entry term; what was
missing was the case itself: a Ph.D.-only dialog answer (`nd-mscse-transfer`), the OCE row saying
whose clock it counts, the standing card's hint, and the transcript inference taking the EARLIER
of two admit terms unless a master's was awarded between them. The DGS confirmed that every §4
clock (residency, eight years, qualifier, eighteen months) starts at the MSCSE for the transfer
student — which is what one entry term already does (DECISIONS 2026-09-26; HANDBOOK-REVISIONS §10).

2026-09-26: **the transcript import was checked against 93 public sample transcripts** (registrar
keys, templates, credential-evaluator samples from 39 countries) and the parser rewritten where
they broke it: a column-header reader, a legend reader, term headers in a dozen calendars, new
course-code shapes, day-first dates, more degree wording, PeopleSoft transfer blocks. 88 of 93
fixtures read as expected; the other five wait on **seven questions for the DGS** listed in the
2026-09-26 DECISIONS rows (code-less Chinese transcripts, Thailand's calendar, unit-based credits,
per-row quarter conversions, Extension credit, adjacent-line conferral, grade scales beyond the
legend). **Later the same day the DGS said to download the public PDFs**: 50 of the 60 on the
plan's list were fetched and run through the app's own pdfjs layout stage (the ten others have
moved, sit behind bot walls or are not PDFs); the real geometry found a column-split bug on the
ANU sample and 55 false course rows from transcript KEYS (the back pages inside real transcript
PDFs), both fixed; Australian HD/D/CR/P/N bands stay raw beside their mark, and every mark-plus-band
row now shows the band (“78 DI”). 34 `pdf-*` fixtures (2 samples pinned, 32 keys pinned as
negatives) join the 93; 122 of 127 pass, the five known-failing unchanged. The PDFs are not in the
repo — `sources.json` has each one's URL, SHA-256 and size; `scripts/dev/pdf-to-lines.mts` and
`scripts/dev/ocr-lines.mjs` regenerate a fixture from a downloaded copy.


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
promoted into docs/ yet; docs/CSE-Graduate-Handbook-July2026.pdf stays the coded-against source of [superseded 2026-10-02: the September 2026 edition is now `policy-sources/CSE-Graduate-Handbook-live.pdf`, the source of truth — see that day's entries]
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
2. (Closed 2026-10-06, policy review round 3, P3-text-ui-6: the alpha notice now reads "exactly the rules
   the DGS uses to decide requirement satisfaction; the Grad Admin processes what is decided", as the
   course rules page has since 2026-10-04.)
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
   awards. `phd_senior_grad_credits_max` was withdrawn with the reversal; its parked row was deleted
   from the sheet on 2026-10-04.
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
  `cd ~/degree-audit-app && git pull --ff-only && git merge --no-edit <branch> && git push`
  (no `--ff-only` on the second merge since 2026-09-28 — the snapshot commits kept blocking it).
  GitHub Pages deploys `main` within a minute or two.
- Claude never pushes; "Continue in → Claude Code on the Web" and "Create PR" would push a branch, so
  they are not used for this repo.

## FERPA reminders that survive every session

- No real transcript is ever read by Claude (Cowork, Claude Code or otherwise): sanitized copies only,
  under neutral names; their original file names carry student names and must not appear in code,
  fixtures, docs or commit messages.
- The app itself sends nothing anywhere but the read-only rules fetch — keep the page's promise true.
