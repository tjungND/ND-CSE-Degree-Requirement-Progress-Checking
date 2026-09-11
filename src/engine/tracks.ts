// The two tracks this audit does not model (§3.5 Integrated B.S. + M.S., §3.6
// Transition to Computing), and the note a student on one of them is shown.
//
// Decided 2026-08-31: "v1 audits the standard MSCSE and Ph.D. programs;
// students on those tracks see a clearly-worded 'talk to the DGS' note." The
// note was never built — a §3.6 student saw the ordinary report with nothing to
// say why a required twelve-credit year counted toward almost nothing (DGS
// asked for it 2026-09-10).
//
// The app does not ask which track a student is on: it recognises the two from
// the coursework they have already entered, so nobody has to know the section
// number to be told about it. Neither note changes a single verdict — every
// requirement is still decided by the handbook and the rules sheet. What the
// note does is name the thing the page cannot decide, and send them to the one
// person who can.
import type { ClassifiedCourse } from './allocate.ts';
import { compareTerm } from './term.ts';
import type { Student } from './types.ts';

export interface SpecialTrack {
  /** §3.6 bridge courses, or §3.5's graduate courses taken as an undergraduate. */
  id: 'transition' | 'integrated';
  section: string;
  title: string;
  text: string;
}

const deptOf = (id: string) => id.split(' ')[0] ?? '';
const levelOf = (c: ClassifiedCourse): number => {
  if (c.rule?.level !== undefined) return c.rule.level;
  const m = /(\d)\d{4}\b/.exec(c.entry.courseId);
  return m ? Number(m[1]) : NaN;
};

/** Which of the two tracks this student's coursework shows, and what to tell
 * them. Pure; both notes are program-specific, because the handbook says
 * different things to an MSCSE and a Ph.D. student about the same course. */
export function specialTracks(student: Student, classified: ClassifiedCourse[]): SpecialTrack[] {
  const notes: SpecialTrack[] = [];
  const phd = student.program === 'phd';

  // §3.6: a 50000-level CSE course exists for one reason — the Transition to
  // Computing bridge set (§3.6.1's three courses). Listed in the rules sheet
  // or not, entering one is the signal.
  if (classified.some((c) => deptOf(c.entry.courseId) === 'CSE' && levelOf(c) === 5)) {
    notes.push({
      id: 'transition',
      section: '§3.6',
      title: 'Transition to Computing',
      text: phd
        ? 'You have entered a 50000-level bridge course. These are preparatory courses, and this page counts each one only as the course rules say — most of them count toward no requirement at all, and the one that can needs the DGS’s approval first. Nothing here plans your bridge year or says what it means for your deadlines: that is the DGS’s call, so ask them.'
        : 'You have entered a 50000-level bridge course. The handbook is explicit that these are preparatory and “do not count toward the MSCSE degree requirements” (§3.6.1), so this page counts them toward nothing — which is correct, and is not a problem with your record. Ask the DGS how the bridge courses fit the rest of your plan.',
    });
  }

  // §3.5: a graduate-level Notre Dame course taken in or before the term the
  // bachelor's degree was awarded — the Integrated B.S. + M.S. signature. It
  // needs the award term, which is required of every student since 2026-09-07.
  const awarded = student.bachelorsAwarded;
  if (
    awarded !== undefined &&
    classified.some(
      (c) =>
        levelOf(c) >= 6 &&
        compareTerm(c.entry.term, awarded) <= 0 &&
        (c.entry.origin === 'nd' || c.entry.institution === undefined || /notre\s*dame/i.test(c.entry.institution)),
    )
  ) {
    notes.push({
      id: 'integrated',
      section: '§3.5',
      title: 'Integrated B.S. + M.S.',
      // Rewritten 2026-09-11: both notes described the rule the app followed
      // BEFORE the Graduate School answered (2026-09-10) — "counts toward no
      // credit", "does not count the courses toward the MSCSE". It counts them
      // now, so the note that sits above the report had to stop contradicting
      // the lines below it.
      text: phd
        ? 'One or more of your graduate courses was taken in or before the term your bachelor’s degree was awarded. The Graduate School has confirmed that 60000-level coursework you took as an undergraduate and did not use for your bachelor’s degree comes with you: it counts here in full, on top of the credits §5.2 lets you transfer, and up to 6 credits of coursework below that level may count inside §4.2’s allowance. No course may count toward three degrees, so this page asks, next to each course, which degrees it has already counted toward — and the DGS still decides anything the course rules leave open.'
        : 'One or more of your graduate courses was taken in or before the term your bachelor’s degree was awarded. §3.5 allows that for an Integrated B.S. + M.S. student, with the instructor’s and the DGS’s approval, for courses taken in the second semester of the junior year and the senior year — a graduate course from earlier than that counts toward nothing here, and its line says so. Within that window this page counts the coursework as the course rules say: 60000-level courses in full, CSE courses below that inside §3.2’s allowance, with at most 6 credits in all shared with your bachelor’s degree (§3.5). Anything that still needs an approval is counted only provisionally and listed in the review request below, so ask the DGS to confirm it.',
    });
  }

  return notes;
}
