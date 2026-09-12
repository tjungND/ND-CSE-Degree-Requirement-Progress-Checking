# Handbook revisions suggested by the degree audit

Started 2026-09-09, by the DGS (Taeho Jung), while making the self-check handle a Ph.D.
student who earned an earlier Notre Dame degree.

Building an audit that must decide every case forces questions the handbook does not answer.
Where a question had to be answered to make the app work, the DGS answered it, and the answer
is recorded in `docs/DECISIONS.md`. **This file is the other half: the places where the answer
belongs in the handbook rather than in a spreadsheet or in code.** Each item says what the
handbook says today, what the app now does, and the sentence that would settle it.

Nothing here is a change to the handbook. It is a list for the next revision, for the CSE
graduate committee and, where the Graduate School's own rules are involved, for them.

---

## 1. §4.4.2 — may a specialization course have been taken before the program?

**Today.** §4.4.2 says: "Students are required to take three category specialization courses
from three distinct groups and pass them with a grade of B or higher." It names no institution
and no term. The neighbouring §4.4.1 does the opposite, explicitly: "All PhD students are
required to pass (**or have previously passed**) an Operating Systems course, an Algorithms
course, and a Computer Architecture course, **either at Notre Dame or at their previous
institution**."

**Why it comes up.** A student who earned the MSCSE at Notre Dame arrives having already passed
three or more CSE 6xxxx courses that the department itself lists as category specialization
courses.

**What the app does (DGS, 2026-09-09).** Those courses count toward §4.4.2 once the credit
actually transfers into the Ph.D. under §5.2 — that is, once the DGS has recommended the
transfer and the Graduate School has approved it. Until then the report names them and counts
none of them. Coursework from another university cannot count, because only Notre Dame's own
course list carries the §4.4.2 group tags.

**Suggested sentence.** In §4.4.2, after the first sentence: *"Courses taken before entering
the Ph.D. program may satisfy this requirement only if their credits are transferred into the
Ph.D. under Section 5.2."* Or, if the committee means the opposite: *"These three courses must
be taken while enrolled in the Ph.D. program."* Either sentence ends the ambiguity; the
contrast with §4.4.1 is currently the only evidence either way.

---

## 2. §4.2 and §5.2 disagree about the five-year window

**Today.** Two sentences, both binding, do not say the same thing.

- §5.2, criterion 3: credits transfer if "the courses were completed within a five-year period
  prior to admission to a graduate degree program at Notre Dame **or while enrolled in a
  graduate degree program at Notre Dame**".
- §4.2: "Courses from a M.S. degree earned at Notre Dame or another institution **within the
  last five years prior to admission** may be used to satisfy the course requirement."

**Why it comes up.** A student who finished the Notre Dame MSCSE more than five years before
entering the Ph.D. — a returning student, or one who worked in industry first. §5.2's second
clause appears to admit their coursework; §4.2's clause appears to refuse it.

**What the app does (DGS, 2026-09-09).** The five-year window applies to everyone, Notre Dame's
own programs included: the stricter reading, chosen deliberately rather than letting the app
pick the generous one.

**Suggested revision.** Make the two sections agree. If §5.2's "or while enrolled" clause is
meant to cover a Notre Dame student's own earlier program, §4.2's sentence should say so:
*"Courses from a M.S. degree earned at Notre Dame, or from another institution within the last
five years prior to admission, may be used…"*. If the five-year limit is meant to apply to
everyone, §5.2's clause should be narrowed to say what it is for. The Graduate School owns
§5.2's text, so this one may have to go to them.

---

## 3. §4.5 — the student who already holds the MSCSE

**Today.** §4.5 says the candidacy exam "can be used by Ph.D. students to satisfy both the M.S.
thesis requirement and the Ph.D. candidacy exam simultaneously, thus earning the MSCSE degree on
successfully passing the candidacy exam." §3.1 notes that Ph.D. students "are also awarded an
MSCSE degree". Neither contemplates a student who earned the MSCSE at Notre Dame first — which
is the normal path out of the Integrated B.S. + M.S. programme in §3.5.

**What the app does (DGS, 2026-09-09).** The along-the-way row is left out of that student's
report entirely.

**Suggested sentence.** In §4.5: *"A student who already holds the MSCSE from Notre Dame is not
awarded it a second time."* Worth pairing with a note on what such a student's candidacy exam
does have to satisfy, since the M.S. thesis requirement is already behind them.

---

## 4. §3.5 and §5.2 — the 4+1 student's senior-year graduate courses

**Today.** §3.5 lets an Integrated B.S. + M.S. student take "one or two 3-credit CSE courses at
the 6xxxx level" in the second semester of the junior year and the senior year and "count these
both as undergraduate CSE electives/Tech electives and as course requirements for the MSCSE
degree", plus further 6xxxx courses in the senior year not used for the B.S. But §5.2's
criterion 2 requires that "the student had graduate student status when they took these
courses".

**Why it comes up.** Those senior-year courses are genuinely part of an awarded Notre Dame
MSCSE. When that student goes on to the Ph.D., §5.2 appears to bar exactly the courses §3.5
allowed.

**ANSWERED by the Graduate School (through the DGS, 2026-09-10, evening) — and the answer is much
broader than the question.** Verbatim: *"Any 60000-level and above coursework taken as an
undergraduate, not being used to fulfill undergraduate degree requirements can be used to satisfy
both the master's and the PhD. Notably, such credits are counted towards the PhD, even those above
and beyond the usual 24 allowed for transfer. The only hard constraint is that the same course's
credits cannot count towards three degrees (BS, MSCSE, PhD) at the same time. … up to two 40000-level
courses taken by ND undergraduates can count towards both BS and MSCSE. … an ND 4+1 student can have
up to 6 credits (whether 40xxx or 60xxx courses) counted towards both degrees. … up to 6 credits from
40xxx courses can count towards PhD."*

So §5.2 criterion 2 does not bar this coursework, and the credits do not pass through §5.2 at all.
The app implements it.

**What the handbook should now say**, because none of this is in it:

- In §3.5 or §4.2: *"Coursework at the 60000 level or above taken while an undergraduate at Notre
  Dame may be counted toward both the MSCSE and the Ph.D., in addition to the transfer credit allowed
  by Section 5.2. Up to six credits of 40000-level coursework taken as an undergraduate may count
  toward the Ph.D. course requirement."*
- And the constraint, which belongs somewhere prominent: *"No course's credits may count toward three
  degrees. A course counted toward both the bachelor's degree and the MSCSE cannot also be counted
  toward the Ph.D."*
- In §3.5, the department's own limit: *"At most six credits may be counted toward both the bachelor's
  degree and the MSCSE."*
- And the WINDOW's edges, which §3.5 leaves to the reader (DGS 2026-09-11): its sentence names "the
  second semester of the junior year and the senior year", which the app reads as the three
  fall/spring semesters ending with the term the bachelor's degree was awarded. Two cases the
  sentence does not decide — a student who graduates in December, whose three semesters end in the
  fall, and a course taken in the summer between the junior and senior years (the app counts it).
  Worth a clause: *"…in the second semester of the junior year and the senior year, counted as the
  three semesters preceding the conferral of the bachelor's degree."* Note also that the window is
  the MSCSE's alone: the Graduate School's rule for the Ph.D. names no term, so the same course can
  be outside §3.5 for the master's and inside the Ph.D.'s allowance.
- And the approval, which only the rules spreadsheet records today (2026-09-11): the Courses tab marks
  almost every 40000-level course `counts_toward_mscse = dgs_approval`, so the app counts such a course
  toward the MSCSE only provisionally and keeps it in the review request until the student records the
  approval. §3.2 should say so in its own words: *"A 40000-level course counts toward the MSCSE course
  requirement only with the approval of the student's advisor and the DGS."* The handbook currently
  leaves the reader to infer it from §3.2's silence.

Until those sentences exist, this file is the only written record of a rule that decides how much
credit every 4+1 student arrives with.

---

## 5. §4.2 — courses below the 60000 level

**Today.** §4.2 allows "Up to six (6) credits from CSE 4xxxx". It says nothing about the 50000
level, where the §3.6 Transition to Computing bridge courses live (CSE 50501–50503).

**What the app does (DGS, 2026-09-09).** A CSE course below the 60000 level counts only if the
rules spreadsheet says it may, and then only inside the same six credits — 40000- and
50000-level courses share one cap. A sheet entry is a permission, not an exemption.

**Suggested sentence.** In §4.2: *"Up to six (6) credits from CSE courses below the 60000 level,
including bridge courses, may be used to satisfy the course requirement, subject to approval of
the student's advisor and the DGS."* §3.2 needs the matching change for the MSCSE.

---

## 6. §3.6 — the Ph.D. student on the Transition to Computing track

**Today.** §3.6 defines the bridge courses as "a set of bridge courses for students admitted to
the **MSCSE** who require additional background", and §3.6.1 requires twelve concurrent credits —
three CSE 50xxx courses plus a CSE 60xxx Integrative Computing Studio — adding that "CSE 50xxx
courses are preparatory and do not count toward the **MSCSE** degree requirements in §3.1–3.5".
Every sentence is about the MSCSE. §4 says nothing about bridge courses at all.

**Why it comes up.** The DGS requires some Ph.D. students to take them (2026-09-10). The handbook
neither authorises that nor says what those credits do toward the Ph.D.

**What the app does.** Whatever the rules spreadsheet says, course by course: today CSE 50502 may
count toward the Ph.D. with the DGS's approval, inside §4.2's six-credit allowance for courses
below the 60000 level, and CSE 50501 and CSE 50503 count nothing. None of the three counts toward
the Graduate School's sixty credits of "courses and research", so a student who has just finished a
required twelve-credit bridge year reads "0 of 60 credits complete".

**Suggested sentences.** In §3.6, after the first paragraph: *"The DGS may also require a student
admitted to the Ph.D. program to complete the Transition to Computing courses."* And in §3.6.1,
alongside the sentence about the MSCSE: *"For a Ph.D. student, CSE 50xxx credits count toward the
sixty credits required by the Graduate School but not toward the twenty-four credit hours of
regular courses in §4.2."* — or whatever the department decides those credits do; the app can
express either answer, but only once someone has decided. Worth saying too whether the bridge year
extends the §4.4 four-semester qualifier deadline, which today rests on the DGS granting an
extension case by case.

## 9. §4.4.3's eighteen months for a summer entrant

**Today.** §4.4.3 counts "18 months" from entering the program; §4.2's semester counts start, by
the department's own convention (decision Q17c), with the fall for a student admitted in a summer
session. The app runs the 18-month clock from that fall too (DGS 2026-09-11: "PhD students entering
in the summer semester is considered entering in the subsequent fall semester"), which for a June
entrant is about ten weeks later than the words "18 months" read.

**Suggested sentence.** In §4.4.3 or §2.1: *"For a student first enrolled in a summer session, the
program is deemed to begin in the following fall semester for every deadline in this handbook."*

---

## 7. Smaller wording points

- **§4.4 "three components".** The qualifying examination has three components, but §4.4.1 alone
  produces three separate requirements (one core area each), so students read "three" as
  "three things to do" and count five. The audit calls the row "all components" for that reason.
  A parenthesis in §4.4 would do it.
- **§4.2's nine credits at Notre Dame.** "Regardless of any credits transferred, all Ph.D.
  students must take at least nine (9) credits at Notre Dame" — for a student who did their
  master's at Notre Dame, "at Notre Dame" has to mean "in the Ph.D. programme", which the
  sentence does not say. The audit reads it that way.
- **§5.2's timing rule.** "A request for credit transfer is considered only after a student has
  completed one semester in a Notre Dame graduate degree program and before the semester in
  which the graduate degree is conferred." The audit does not enforce this window, so a
  first-semester student may be told to send the request early. Worth a line in the student
  handbook about when to file rather than a change to §5.2.
- **Where the transfer request goes.** §5.2 says "the Graduate Program Coordinator"; the
  department calls the role the Graduate Program Administrator, and the app says "Grad Admin".
  Worth making the title consistent.

---

## 8. §4.2's six credits: credits, or two courses?

**Today.** §4.2 allows "Up to six (6) credits from CSE 4xxxx". The Graduate School's 2026-09-10
answer to the department used both units in one breath — "up to **two** 40000-level courses … up to
**6 credits**" — which are the same thing only while every such course is worth three credits.

**Why it comes up.** The Courses tab is not all 3-credit rows. Among CSE courses below the 60000
level that may count toward the Ph.D.: CSE 40151 and CSE 40152 are 1.5 credits, CSE 40881 and
CSE 40986 are 1 credit, CSE 44622 and CSE 40322 are 4, CSE 44793 is 5. So six credits can be
**four or more courses**, and a single 4- or 5-credit course is split — three of its credits count
and the rest do not.

**What the app does.** Six credits, the handbook's own unit (`phd_4xxxx_cse_credits_max`,
`ms_4xxxx_credits_max`), at credit granularity.

**Suggested sentence.** Whichever the committee means, say it once: *"At most six credits, and at
most two courses, from CSE courses below the 60000 level may count toward the course requirement."*
— or drop the course count from the Graduate School's phrasing and keep credits alone. The app can
express either; a second Parameters key would carry the course limit.
