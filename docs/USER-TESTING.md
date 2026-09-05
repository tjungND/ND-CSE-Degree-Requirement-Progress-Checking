# Trying the self-check tool with real students

A short protocol for the DGS (or a student worker) — usability review 2026-09-05, item 32.
Automated checks (`npm run e2e`) catch layout, contrast, keyboard and focus defects; they cannot
tell whether a student reaches the RIGHT conclusion, or understands what to do next. Three or
four sessions of twenty minutes each find most of what matters.

## Who

Three or four students, mixed: at least one M.S. and one Ph.D. student, at least one
international student, ideally one who has never read the handbook and one who has a combined
or previous-degree transcript. Use their own laptop or phone if they are willing; otherwise a
department machine with a sanitized sample transcript (`scripts/sanitize-transcript.mjs`).

## How

Sit beside them, say "think aloud", and do not help unless they are stuck for a full minute
(note the minute). Give one task at a time, in this order:

1. Open the page and tell me, in your own words, what it is for and what it is not.
2. Import your transcript and fix one row the parser got wrong (or, without a transcript, add
   two courses by hand).
3. Which requirement most needs your attention right now, and what would you do about it?
4. Does course X count toward your degree? (pick a course from the course-rules page)
5. Remove a course you added by mistake, and get it back.
6. Produce the summary for your advisor. What would you check before sending it?
7. Come back a week later (or reload now): is the rules data current? How can you tell?

## What to record

For each task: completed without help / with help / not completed; the first wrong turn, if
any; whether the conclusion they state matches the report; confidence (ask "how sure are you,
1–5"); and any word or label they misread or asked about. At the end ask what they would
change first.

## What counts as a finding

A student states a wrong conclusion (the report says one thing, they say another); needs help
to finish a task; does not notice an unmet requirement or a "Needs DGS review" pill; misreads
a term ("regular course", "residency", "qualifier"); cannot find the transcript import or the
advisor summary; or is surprised by what is stored where. Wording findings go to the DGS's
wording list; mechanics findings become e2e checks so they stay fixed.
