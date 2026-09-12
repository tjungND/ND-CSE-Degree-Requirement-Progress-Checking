// Prior-university transcript slots (feature decisions 2026-09-01; since
// 2026-09-03 part of the single "Transcripts" card composed in app.ts): up to
// three uploads — undergraduate, Master's, Ph.D., all optional — parsed
// entirely in the browser (system-generated PDFs read exactly; scans via the
// explicit opt-in English-only OCR), previewed for correction, then added as
// origin:'transfer' courses tagged with their degree level. The DGS's rulings
// from the ExternalCourses rules show on each course's line in the coursework
// table and in the report's §4.4.1 / §5.2 rows (the separate "What the DGS's
// rules say" block was removed as redundant, 2026-09-06); anything unruled is
// picked up by app.ts's single "Ask the DGS to review" card (the page itself
// transmits nothing — FERPA).
import { bachelorsPrefill, rowIsCompact } from '../transcript/preview-layout.ts';
import { canonicalCourseId, resolveRuleRow } from '../data/assemble.ts';
import { NOTRE_DAME, findExternalRule, isNotreDameInstitution } from '../data/external.ts';
import { CORE_TITLE_RE } from '../engine/core-title.ts';
import { priorNdUndergraduateCanCount } from '../engine/allocate.ts';
import type { Rules } from '../data/types.ts';
import { GRADES } from '../engine/grades.ts';
import { termIndex, termLabel, termOfDate, termShort } from '../engine/term.ts';
import type { CourseEntry, Grade, Program, Season, Student, Term } from '../engine/types.ts';
import type { ExternalCourseCandidate } from '../transcript/external.ts';
import { prefillLevelsByTerm } from '../transcript/level-prefill.ts';
import { reclassifyNotreDameCourses } from './prior-nd.ts';
import { canonicalUniversityName } from './university-name.ts';
import { confirmDialog, writeClipboard } from './copy-dialog.ts';
import { parseTranscript } from '../transcript/parse.ts';
import { clear, el, inactiveButton, option, PREVIEW_OPEN_NOTE } from './dom.ts';

/** Write a review request to the clipboard in BOTH flavors (2026-09-03):
 * text/plain keeps the tab-separated rows; text/html carries them as a real
 * table — HTML email flattens tabs to spaces, but a table survives Gmail and
 * pastes into Sheets as cells. Falls back to plain text where ClipboardItem
 * is unsupported. Used by the "Ask the DGS to review" card in app.ts. */
export function copyReviewRequest(built: { text: string; html: string }): Promise<void> {
  return writeClipboard(built); // the writer lives with the dialog since 2026-09-06 (copy-dialog.ts)
}

export type DegreeLevel = NonNullable<CourseEntry['degreeLevel']>;
/** What the Notre Dame row is called, which depends on the program the student
 * picked at the top (DGS 2026-09-11). A 4+1 student holds several Notre Dame
 * transcripts; the row wants the one for the program they are in now. */
export function ndRowLabel(student: Student): string {
  return student.program === 'mscse' ? 'ND Unofficial MSCSE Transcript' : 'ND Unofficial Ph.D. Transcript';
}

export const DEGREE_SLOTS: { level: DegreeLevel; label: string }[] = [
  { level: 'bachelors', label: 'Previous Undergraduate Transcript' },
  { level: 'masters', label: 'Previous Master’s Transcript' },
  { level: 'phd', label: 'Previous Ph.D. Transcript' },
];

interface PreviewRow {
  include: boolean;
  courseId: string;
  title: string;
  credits: number | undefined;
  grade: Grade | '';
  rawGrade?: string;
  season: Season;
  year: number | undefined;
  /** OCR read this row's line poorly — the preview marks it for checking. */
  lowConfidence?: boolean;
  /** The level the student was registered at for this row (2026-09-05 —
   * combined B.S.+M.S. / 4+1 transcripts): from the transcript when it says,
   * else the slot's level. Undergraduate rows can only satisfy §4.4.1 core
   * knowledge; graduate rows are §5.2 transfer candidates. */
  level: 'undergraduate' | 'graduate';
  /** Where the level came from (2026-09-06, so the preview can say):
   * `transcript` — a UG/GR cell, a level block or the bachelor's conferral
   * date on the transcript; `term` — the two-year rule below (a combined
   * transcript without markers); `slot` — nothing said, the row's level is
   * the slot's. */
  levelSource: 'transcript' | 'term' | 'slot' | 'award';
  /** Left out by the relevance filter (an undergraduate row that cannot
   * matter) but kept visible, unticked, on a MIXED-level transcript so the
   * student can still tick it or change its level (2026-09-05). */
  irrelevant?: boolean;
  /** Typed by the student ("+ Add a row by hand"): every field stays
   * editable. Imported rows keep the course id and title the transcript
   * printed (2026-09-06 — text-layer imports only; OCR rows stay editable). */
  manual?: boolean;
}

interface ExternalPreview {
  slot: DegreeLevel;
  university: string;
  rows: PreviewRow[];
  /** Rows came from OCR of a scan — approximate; the preview says so. */
  fromOcr?: boolean;
  /** The transcript carries a graduate-degree conferral line (2026-09-03) —
   * used to set "Prior graduate study" when the student has not chosen. */
  conferred?: boolean;
  /** Undergraduate imports only (2026-09-04): parsed rows left out because
   * neither the core-title keywords nor a DGS ruling made them relevant. */
  omitted?: number;
  /** Rows under Banner's "Transfer credit accepted by the institution" block —
   * courses from a THIRD school — left out by the parser (2026-09-05). */
  transferSkipped?: number;
  /** Rows of both levels were read (2026-09-05): the Taken-as column matters. */
  mixedLevels?: boolean;
  /** The two-year rule was applied (2026-09-06): rows in the last two years
   * of the record — from `graduateFrom` to `latest` — were marked Graduate,
   * earlier ones Undergraduate. The preview explains this and asks for a check. */
  termPrefill?: { graduateFrom: Term; latest: Term };
  /** A dated bachelor's conferral on the transcript (2026-09-06): pre-fills
   * the preview's "Bachelor's degree awarded" control. */
  bachelorsConferredOn?: string;
  /** The bachelor's award term shown in the preview (DGS 2026-09-06 evening):
   * pre-filled from the conferral date, editable, REQUIRED for a combined
   * bachelor's + master's record in the Master's row (`bachelorsRequired`).
   * Written to the student record on add; `bachelorsSource` says whether the
   * student touched it. */
  bachelorsAwarded?: Term;
  bachelorsRequired?: boolean;
  bachelorsSource?: 'transcript' | 'student';
  /** The university name came from the transcript (2026-09-06): shown, not
   * editable — the DGS's rules key on the name the transcript prints. */
  universityFromTranscript?: boolean;
  /** The name was recovered from an acronym, not read as text (2026-09-08). */
  universityGuessed?: true;
  /** A Notre Dame transcript in a previous-degree slot (2026-09-05): an
   * earlier Notre Dame degree. The preview reminds the student that the
   * Notre Dame row handles a transcript that also holds the current program. */
  notreDame?: boolean;
  /** The transcript announced quarter terms (2026-09-11); the student can
   * untick it in the preview if the parser misread. */
  quarterSystem?: boolean;
}

/** The preview's "Bachelor's degree awarded" (DGS 2026-09-06 evening): in the
 * Master's row a COMBINED record — rows of both levels, a bachelor's conferral
 * line, or the two-year rule firing — makes the term required; the conferral
 * date pre-fills it. Other rows: pre-filled when the transcript dates the
 * degree, never required. */
function bachelorsForPreview(
  slot: DegreeLevel,
  mixed: boolean,
  conferredOn: string | undefined,
  twoYearRule: boolean,
  /** What the student has already set under Your standing BY HAND. It wins:
   * importing a second transcript must not silently move a term the student
   * chose (DGS bug 2026-09-07 — a Master's import reset the year entered after
   * an undergraduate import). A term merely inferred from an earlier
   * transcript does not win; this transcript's own conferral date may replace
   * that, as before. */
  handSet?: Term,
): Pick<ExternalPreview, 'bachelorsAwarded' | 'bachelorsRequired' | 'bachelorsSource'> {
  const chosen = bachelorsPrefill(handSet, conferredOn !== undefined ? termOfDate(conferredOn) : undefined);
  const combined = slot === 'masters' && (mixed || conferredOn !== undefined || twoYearRule);
  return {
    ...(chosen ? { bachelorsAwarded: chosen.term, bachelorsSource: chosen.source } : {}),
    ...(combined ? { bachelorsRequired: true } : {}),
  };
}

/** The bachelor's term the student set themselves, if any — undefined when it
 * is unset or was only inferred from a transcript. */
function handSetBachelors(student: Student): Term | undefined {
  return student.bachelorsAwarded !== undefined && student.bachelorsAwardedInferred === undefined ? student.bachelorsAwarded : undefined;
}

/** Re-fill every dated row's level by the bachelor's award term the student
 * set (2026-09-06 evening): in or before it → undergraduate, later →
 * graduate; the relevance filter then decides the ticks as on import. */
function relevelByAward(p: ExternalPreview, rules: Rules, program: Program): void {
  const award = p.bachelorsAwarded;
  if (award === undefined) return;
  for (const r of p.rows) {
    if (r.year === undefined) continue;
    r.level = termIndex({ season: r.season, year: r.year }) <= termIndex(award) ? 'undergraduate' : 'graduate';
    r.levelSource = 'award';
    r.include = r.level === 'graduate' || isRelevantRow(p.university, rules, r, program);
    r.irrelevant = r.level === 'undergraduate' && !isRelevantRow(p.university, rules, r, program) ? true : undefined;
  }
  p.mixedLevels = new Set(p.rows.map((r) => r.level)).size > 1 || undefined;
}

/** The level a row is treated at: its own when the transcript said, else the slot's. */
function slotDefaultLevel(slot: DegreeLevel): PreviewRow['level'] {
  return slot === 'bachelors' ? 'undergraduate' : 'graduate';
}


/** A row's degree level on add (2026-09-05): undergraduate rows are
 * Bachelor's coursework whatever the slot; graduate rows take the slot's
 * degree (Master's, or Ph.D. in the Ph.D. slot; a graduate row on an
 * undergraduate transcript — a 4+1's fifth year — is Master's coursework). */
function degreeLevelFor(slot: DegreeLevel, level: PreviewRow['level']): DegreeLevel {
  if (level === 'undergraduate') return 'bachelors';
  return slot === 'phd' ? 'phd' : 'masters';
}

let preview: ExternalPreview | undefined;
/** An import that failed, or a preview-level problem (usability review
 * 2026-09-05, item 6): a persistent message under the slot row / inside the
 * preview instead of a 4-second toast. Cleared by the next import, Dismiss,
 * or (preview errors) the next attempt to add. */
let importError: { slot: DegreeLevel; message: string } | undefined;
let previewError: string | undefined;
/** A scan was uploaded and awaits the student's explicit OCR opt-in
 * (DGS decision 2026-09-02: never OCR without asking; English only). */
let pendingScan: { slot: DegreeLevel; buffer: ArrayBuffer; filename: string } | undefined;
/** OCR in flight — drives the progress line. */
let ocrBusy: { label: string; percent: number } | undefined;

export interface ExternalCardArgs {
  student: Student;
  rules: Rules;
  update: (fn: (s: Student) => void) => void;
  toast: (msg: string) => void;
  /** A toast with one action button (Undo) — app.ts supplies it; `ttlMs`
   * lengthens the window (20 s for a transcript-wide removal), `focusKey`
   * names the control to focus after the Undo's render. */
  toastWithAction?: (msg: string, actionLabel: string, action: () => void, opts?: { ttlMs?: number; focusKey?: string }) => void;
  render: () => void;
  /** One transcript at a time (2026-09-03): true while ANY preview is open,
   * disabling every import button until it is confirmed or cancelled. */
  blocked: boolean;
}

/** True while this module holds an unconfirmed import — an open preview, a
 * scan awaiting the OCR opt-in, or OCR in flight. app.ts combines it with its
 * own ND-preview state to block all import buttons. */
export function importsBusy(): boolean {
  return preview !== undefined || pendingScan !== undefined || ocrBusy !== undefined;
}

/** Undergraduate rows (DGS request 2026-09-04): undergraduate credits never
 * transfer (§5.2), so only rows that can matter are offered in the preview —
 * a title matching the §4.4.1 core keywords (algorithms, operating systems,
 * architecture), a course the DGS has already ruled on for this university,
 * or (Notre Dame) a course the Courses tab tags with a core area. On a
 * single-level undergraduate transcript everything else is left out (and
 * counted, for the note); on a MIXED-level transcript (2026-09-05) such rows
 * stay visible but unticked, since the student may need to change a level. */
/** Can this row matter? Graduate rows always (§5.2 transfer candidates);
 * undergraduate rows only for §4.4.1 core knowledge — a core-keyword title, a
 * DGS ruling, or (Notre Dame) a Courses-tab core area. Re-evaluated whenever
 * the student changes a row's "Taken as" (2026-09-06). */
function isRelevantRow(university: string, rules: Rules, r: PreviewRow, program: Program): boolean {
  if (r.level === 'graduate') return true;
  // Everything else an undergraduate row could do is the Ph.D. qualifying
  // examination's §4.4.1, which the MSCSE does not have (DGS 2026-09-11).
  const qualifier = program === 'phd';
  if (qualifier && (CORE_TITLE_RE.test(r.title) || findExternalRule(rules.external, university, r.courseId) !== undefined)) return true;
  if (!isNotreDameInstitution(university) || r.year === undefined) return false;
  const rule = resolveRuleRow(rules, r.courseId, { season: r.season, year: r.year });
  // Notre Dame's own undergraduate coursework can do more than demonstrate a
  // core area: 60000-level courses count in full, and a CSE course below that
  // may count inside §3.2's / §4.2's allowance (DGS 2026-09-11 — "they may
  // count, subject to all other constraints, so they should be listed"). The
  // engine decides which, so the row is offered and the report rules on it.
  return (qualifier && rule?.coreArea !== undefined) || priorNdUndergraduateCanCount({ courseId: r.courseId, credits: r.credits ?? 0, term: { season: r.season, year: r.year }, grade: 'A' } as CourseEntry, rule, program);
}

/** Why an undergraduate row that cannot matter is not selectable (DGS
 * request 2026-09-06): shown on hover and read to screen readers. */
const BLOCKED_ROW_NOTE =
  'Not selectable: this course is not related to the core-knowledge areas (Alg, OS, Comp Arch — §4.4.1), and undergraduate credits do not transfer (§5.2), so there is nothing to add. If you took it as a graduate student, change “Taken as” to Graduate and it becomes selectable.';

/** Notre Dame's own undergraduate coursework is blocked for a different
 * reason: it is not the transfer rule that stops it but the level (2026-09-11).
 * And an MSCSE student is told nothing about §4.4.1 core knowledge, which
 * belongs to the Ph.D. qualifying examination (DGS 2026-09-11). */
const BLOCKED_ND_ROW_NOTE =
  'Not selectable: this course is below the level your degree can count (60000 and above in full, CSE courses below it inside the allowance) and it is not related to the core-knowledge areas (Alg, OS, Comp Arch — §4.4.1), so there is nothing to add. If you took it as a graduate student, change “Taken as” to Graduate and it becomes selectable.';

const BLOCKED_MS_ROW_NOTE =
  'Not selectable: undergraduate credits do not transfer (§5.2), so there is nothing this course can count toward in the MSCSE. If you took it as a graduate student, change “Taken as” to Graduate and it becomes selectable.';

const BLOCKED_MS_ND_ROW_NOTE =
  'Not selectable: this course is below the level the MSCSE can count — 60000-level coursework counts in full, and CSE courses below that inside §3.2’s allowance. If you took it as a graduate student, change “Taken as” to Graduate and it becomes selectable.';

/** Which "why is this row locked?" note the preview shows, by transcript and
 * by degree. */
function blockedRowNote(notreDame: boolean, program: Program): string {
  if (program === 'mscse') return notreDame ? BLOCKED_MS_ND_ROW_NOTE : BLOCKED_MS_ROW_NOTE;
  return notreDame ? BLOCKED_ND_ROW_NOTE : BLOCKED_ROW_NOTE;
}

function keepRelevantRows(
  university: string,
  rules: Rules,
  rows: PreviewRow[],
  mixed: boolean,
  program: Program,
): { rows: PreviewRow[]; omitted: number } {
  const relevant = (r: PreviewRow) => isRelevantRow(university, rules, r, program);
  if (mixed) {
    for (const r of rows) {
      if (!relevant(r)) {
        r.include = false;
        r.irrelevant = true;
      }
    }
    return { rows, omitted: 0 };
  }
  const kept = rows.filter(relevant);
  return { rows: kept, omitted: rows.length - kept.length };
}

/** The prior-university slot rows, previews and per-course verdicts. Since
 * 2026-09-03 these are composed into the single "Transcripts" card by app.ts
 * (one upload home for all four transcripts) and the copy-ready review
 * request lives in app.ts's "Ask the DGS to review" card — ONE button for ND
 * and external courses together. */
export function priorTranscriptSection(args: ExternalCardArgs): (HTMLElement | null)[] {
  return [
    // A bachelor's and a master's from ONE university arrive in two shapes, and
    // the student has to be told which they have before they can file it
    // (DGS 2026-09-05, rewritten 2026-09-11 — Notre Dame's own 4+1 issues two
    // separate transcripts, one per career, and other universities do the
    // same, so "one combined PDF" is not the common case it was written as).
    // Two transcripts: one row each. One PDF covering both: the Master's row,
    // once, with each course's "Taken as" level read from it.
    el(
      'div',
      { class: 'combined-note', role: 'note' },
      el('strong', {}, 'A bachelor’s and a master’s from the same university'),
      ' — a 4+1 or 5+1 program, Notre Dame’s included — comes as either two transcripts or one. ',
      el('strong', {}, 'Two transcripts:'),
      ' upload each in its own row, the bachelor’s in the Undergraduate row and the master’s in the Master’s row. ',
      el('strong', {}, 'One transcript covering both degrees:'),
      ' upload it once, in the ',
      el('strong', {}, 'Previous Master’s Transcript'),
      ' row — never the same PDF twice. Either way, whether you took each course as an undergraduate or as a graduate student is read from the transcript and shown in a “Taken as” column you can correct before adding: it is your status at the time, not the course’s level, and it decides what the course can count toward.',
      el('br'),
      'Notre Dame’s own transcripts belong in these rows too, for a degree you have already finished. The ND row above is for the program you are in now.',
    ),
    ...DEGREE_SLOTS.map((slot) => slotRow(slot, args)),
    pendingScan ? scanOptInBlock(args) : null,
    ocrBusy ? ocrProgressBlock() : null,
    preview ? previewBlock(args) : null,
  ];
}

function coursesInSlot(student: Student, level: DegreeLevel): CourseEntry[] {
  return student.courses.filter((c) => c.origin === 'transfer' && c.degreeLevel === level);
}

function slotRow(slot: { level: DegreeLevel; label: string }, args: ExternalCardArgs): HTMLElement {
  const { student, rules, update, toast, render } = args;
  const have = coursesInSlot(student, slot.level);
  const fileInput = el('input', { type: 'file', accept: '.pdf,application/pdf', class: `hidden external-file-${slot.level}`, 'aria-label': `${slot.label} PDF` });
  const fail = (message: string): void => {
    importError = { slot: slot.level, message };
    render();
    document.querySelector<HTMLElement>(`[data-key="ext.error.${slot.level}"]`)?.focus();
  };
  fileInput.addEventListener('change', async () => {
    const file = (fileInput as HTMLInputElement).files?.[0];
    if (!file) return;
    importError = undefined;
    toast('Reading the transcript… (it never leaves this browser)');
    try {
      const { pdfToLines } = await import('../transcript/pdf.ts'); // pdfjs loads lazily
      // Keep the original bytes: pdfjs consumes the buffer it is given, and a
      // scan goes on to OCR (the student deciding) with the same file.
      const buffer = await file.arrayBuffer();
      const lines = await pdfToLines(buffer.slice(0));
      const { parseExternalTranscript } = await import('../transcript/external.ts');
      // A NOTRE DAME transcript in a previous-degree slot (2026-09-05): the
      // record of an earlier Notre Dame degree (undergraduate at Notre Dame
      // before a Ph.D. elsewhere-then-here, a prior Notre Dame M.S.). Read by
      // the Notre Dame parser — it knows the UG/GR column and the degrees
      // awarded — and filed under "University of Notre Dame". (A transcript
      // that ALSO holds the current program belongs in the Notre Dame row,
      // which separates the two by the entry term; the preview says so.)
      const nd = parseTranscript(lines);
      if (nd.isNotreDame) {
        const ndRows: PreviewRow[] = nd.courses
          .filter((c) => c.origin === 'nd')
          .map((c) => ({
            include: true,
            courseId: c.courseId,
            title: c.title ?? '',
            credits: c.credits,
            grade: c.grade,
            season: c.term.season,
            year: c.term.year,
            level: c.level ?? slotDefaultLevel(slot.level),
            levelSource: (c.level ? 'transcript' : 'slot') as PreviewRow['levelSource'],
          }));
        const levels = new Set(ndRows.map((r) => r.level));
        const kept = keepRelevantRows(NOTRE_DAME, rules, ndRows, levels.size > 1, args.student.program);
        const ndBachelors = nd.degreesAwarded.find((d) => d.level === 'bachelors' && d.date !== undefined)?.date;
        preview = {
          slot: slot.level,
          university: NOTRE_DAME,
          universityFromTranscript: true,
          conferred: nd.degreesAwarded.some((d) => d.level === 'masters' || d.level === 'phd'),
          bachelorsConferredOn: ndBachelors,
          ...bachelorsForPreview(slot.level, levels.size > 1, ndBachelors, false, handSetBachelors(args.student)),
          rows: kept.rows,
          omitted: kept.omitted,
          transferSkipped: nd.courses.filter((c) => c.origin === 'transfer').length || undefined,
          mixedLevels: levels.size > 1,
          notreDame: true,
        };
        if (ndRows.length === 0) previewError = 'This looks like an ND transcript, but no course lines could be read from it. Add the courses by hand below, and tell the DGS.';
        render();
        return;
      }
      const parsed = parseExternalTranscript(lines);
      if (!parsed.hasTextLayer) {
        // A scan or photo: never OCR silently — offer it (DGS decision 2026-09-02).
        pendingScan = { slot: slot.level, buffer, filename: file.name };
        render();
        return;
      }
      const mapped = parsed.courses.map((c: ExternalCourseCandidate) => ({
        include: true,
        courseId: c.courseId,
        title: c.title ?? '',
        credits: c.credits,
        grade: (c.grade ?? '') as Grade | '',
        rawGrade: c.rawGrade,
        season: c.season ?? ('fall' as Season),
        year: c.year,
        level: c.level ?? slotDefaultLevel(slot.level),
        levelSource: (c.level ? 'transcript' : 'slot') as PreviewRow['levelSource'],
      }));
      const termPrefill = prefillLevelsByTerm(mapped, slot.level, parsed.bachelorsNamed === true);
      const mixed = parsed.mixedLevels === true || new Set(mapped.map((r) => r.level)).size > 1;
      const kept = keepRelevantRows(parsed.university ?? '', rules, mapped, mixed, args.student.program);
      const bachelors = bachelorsForPreview(slot.level, mixed, parsed.bachelorsConferredOn, termPrefill !== undefined, handSetBachelors(args.student));
      preview = {
        slot: slot.level,
        university: parsed.university ?? '',
        // A name read from the transcript is locked; one recovered from an
        // acronym is pre-filled and editable (2026-09-08).
        universityFromTranscript: (parsed.university ?? '') !== '' && parsed.universityGuessed !== true,
        universityGuessed: parsed.universityGuessed,
        conferred: parsed.degreeConferred,
        quarterSystem: parsed.quarterSystem,
        bachelorsConferredOn: parsed.bachelorsConferredOn,
        ...bachelors,
        rows: kept.rows,
        omitted: kept.omitted,
        transferSkipped: parsed.transferRowsSkipped,
        mixedLevels: mixed || undefined,
        termPrefill,
      };
      if (mapped.length === 0) {
        previewError = 'No course-like lines could be read from this PDF — its layout is new to the parser. You can still add the courses by hand below (and please tell the DGS which university, so parsing can be improved).';
      } else if (kept.rows.length === 0) {
        previewError =
          args.student.program === 'phd'
            ? `All ${mapped.length} courses read from this transcript were left out — none matched the Alg / OS / Comp Arch core keywords, and none are in the DGS’s external-course rules. Courses taken as an undergraduate student do not transfer, whether or not the course itself is a graduate course (§5.2); if a course belongs to a core area under a different title, add it by hand below.`
            : `All ${mapped.length} courses read from this transcript were left out: every one of them was taken as an undergraduate student, and undergraduate credits do not transfer (§5.2), whether or not the course itself is a graduate course. If you took any of them after your bachelor’s degree was awarded, add it by hand below and set “Taken as” to Grad student.`;
      }
      render();
    } catch {
      fail('That PDF could not be read (is it a PDF?). Only system-generated PDFs are accepted.');
    } finally {
      (fileInput as HTMLInputElement).value = '';
    }
  });

  // While any preview is open, Import and Remove are inactive and say why on
  // hover / click (DGS request 2026-09-06) — `inactiveButton`, not `disabled`,
  // so the reason can be shown.
  const button = (attrs: Record<string, string | boolean | ((ev: Event) => void)>, label: string): HTMLButtonElement =>
    args.blocked ? inactiveButton(attrs, PREVIEW_OPEN_NOTE, toast, label) : el('button', attrs, label);
  const parts: (Node | string)[] = [el('span', { class: 'slot-label' }, slot.label)];
  if (have.length > 0) {
    const uni = have[0]!.institution ?? 'another university';
    parts.push(
      el('span', { class: 'slot-sep', 'aria-hidden': 'true' }, ' — '),
      el('span', {}, `${have.length} course${have.length === 1 ? '' : 's'} from ${uni} `),
      button(
        {
          class: 'btn tiny',
          'aria-label': `Remove the ${have.length} ${slot.label} course${have.length === 1 ? '' : 's'} from ${uni}`,
          'data-key': `ext.remove.${slot.level}`,
          onclick: () => {
            // Undo instead of a confirm dialog (usability review 2026-09-05,
            // item 25): everything removed can be put back with one click.
            // Index-preserving (2026-09-06 evening): Undo puts every row back where it was.
            const removed = student.courses.map((c, i) => ({ c, i })).filter(({ c }) => c.origin === 'transfer' && c.degreeLevel === slot.level);
            const priorBefore = { priorMs: student.priorMs, inferred: student.priorMsInferred };
            update((s) => {
              s.courses = s.courses.filter((c) => !(c.origin === 'transfer' && c.degreeLevel === slot.level));
              // If "Prior graduate study" was auto-set from a transcript and no
              // graduate transcript remains, undo the inference (2026-09-04).
              if (
                s.priorMsInferred === true &&
                !s.courses.some((c) => c.origin === 'transfer' && (c.degreeLevel === 'masters' || c.degreeLevel === 'phd'))
              ) {
                s.priorMs = 'none';
                s.priorMsInferred = undefined;
              }
            });
            args.toastWithAction?.(
              `${removed.length} ${slot.label} course${removed.length === 1 ? '' : 's'} removed.`,
              'Undo',
              () =>
                update((s) => {
                  for (const { c, i } of removed) s.courses.splice(Math.min(i, s.courses.length), 0, c);
                  s.priorMs = priorBefore.priorMs;
                  s.priorMsInferred = priorBefore.inferred;
                }),
              { ttlMs: 20000, focusKey: `ext.remove.${slot.level}` },
            );
          },
        },
        'Remove',
      ),
    );
  } else {
    parts.push(
      el('span', { class: 'slot-sep', 'aria-hidden': 'true' }, ' — '),
      button({ class: 'btn', 'data-key': `ext.import.${slot.level}`, onclick: () => (fileInput as HTMLInputElement).click() }, 'Import from PDF (alpha)'),
      fileInput,
    );
  }
  if (importError?.slot === slot.level) {
    parts.push(
      el(
        'div',
        { class: 'import-error', role: 'alert', tabindex: '-1', 'data-key': `ext.error.${slot.level}` },
        el('span', {}, importError.message),
        ' ',
        el(
          'button',
          {
            class: 'btn tiny',
            'aria-label': 'Dismiss this message',
            onclick: () => {
              importError = undefined;
              render();
              document.querySelector<HTMLElement>(`[data-key="ext.import.${slot.level}"]`)?.focus();
            },
          },
          'Dismiss',
        ),
      ),
    );
  }
  return el('div', { class: 'external-slot' }, ...parts);
}

/** The explicit OCR opt-in for a scanned PDF (DGS decision 2026-09-02):
 * system-generated PDFs stay the encouraged path; OCR is approximate,
 * ENGLISH-ONLY, and never runs without the student choosing it. */
function scanOptInBlock(args: ExternalCardArgs): HTMLElement {
  const { render, student } = args;
  const scan = pendingScan!;
  return el(
    'div',
    { class: 'ocr-optin', role: 'note' },
    el(
      'p',
      {},
      el('strong', {}, `“${scan.filename}” looks like a scanned or photographed transcript. `),
      'A scan cannot be read exactly — the reliable route is a system-generated PDF from your university’s portal. You can instead try the built-in text recognition (OCR): ',
      el('strong', {}, 'English-language transcripts only'),
      ', results are approximate, and you must check every field before adding. Either way the file never leaves your browser.',
    ),
    el(
      'div',
      { class: 'save-buttons' },
      el(
        'button',
        {
          class: 'btn primary',
          'data-key': 'ext.scan.ocr',
          onclick: () => {
            const { slot, buffer } = scan;
            pendingScan = undefined;
            ocrBusy = { label: 'Starting the text reader', percent: 0 };
            render();
            void (async () => {
              try {
                const { ocrPdfToLines } = await import('../transcript/ocr.ts');
                const { lines, pagesRead, pagesTotal } = await ocrPdfToLines(buffer, (progress) => {
                  ocrBusy = progress;
                  render();
                });
                const { parseExternalTranscript } = await import('../transcript/external.ts');
                const parsed = parseExternalTranscript(lines.map((l) => l.text), lines.map((l) => l.confidence));
                ocrBusy = undefined;
                if (parsed.looksLikeNotreDame) {
                  importError = { slot, message: `This looks like an ND transcript — use the “${ndRowLabel(student)}” row above, with the digital PDF from insideND (not a scan).` };
                  render();
                  document.querySelector<HTMLElement>(`[data-key="ext.error.${slot}"]`)?.focus();
                  return;
                }
                const mapped = parsed.courses.map((c) => ({
                  include: true,
                  courseId: c.courseId,
                  title: c.title ?? '',
                  credits: c.credits,
                  grade: (c.grade ?? '') as Grade | '',
                  rawGrade: c.rawGrade,
                  season: c.season ?? ('fall' as Season),
                  year: c.year,
                  lowConfidence: c.lowConfidence,
                  level: c.level ?? slotDefaultLevel(slot),
                  levelSource: (c.level ? 'transcript' : 'slot') as PreviewRow['levelSource'],
                }));
                const termPrefill = prefillLevelsByTerm(mapped, slot, parsed.bachelorsNamed === true);
                const mixed = parsed.mixedLevels === true || new Set(mapped.map((r) => r.level)).size > 1;
                const kept = keepRelevantRows(parsed.university ?? '', args.rules, mapped, mixed, args.student.program);
                const bachelors = bachelorsForPreview(slot, mixed, parsed.bachelorsConferredOn, termPrefill !== undefined, handSetBachelors(args.student));
                preview = {
                  slot,
                  university: parsed.university ?? '',
                  // OCR misreads names too — the field stays editable (2026-09-06).
                  fromOcr: true,
                  conferred: parsed.degreeConferred,
                  quarterSystem: parsed.quarterSystem,
                  bachelorsConferredOn: parsed.bachelorsConferredOn,
                  ...bachelors,
                  rows: kept.rows,
                  omitted: kept.omitted,
                  transferSkipped: parsed.transferRowsSkipped,
                  mixedLevels: mixed || undefined,
                  termPrefill,
                };
                if (parsed.courses.length === 0) {
                  previewError = `OCR finished but found no course-like lines (${pagesRead} of ${pagesTotal} pages read). You can add the courses by hand below.`;
                } else if (pagesTotal > pagesRead) {
                  previewError = `Read the first ${pagesRead} of ${pagesTotal} pages (the reader stops at ${pagesRead}) — later pages must be added by hand.`;
                }
                render();
              } catch (e) {
                // Leave a breadcrumb for debugging without surfacing internals.
                console.error('OCR failed:', e);
                ocrBusy = undefined;
                importError = { slot, message: 'The text reader could not run in this browser — please use a system-generated PDF instead.' };
                render();
                document.querySelector<HTMLElement>(`[data-key="ext.error.${slot}"]`)?.focus();
              }
            })();
          },
        },
        'Try OCR (English only)',
      ),
      el('button', { class: 'btn', 'data-key': 'ext.scan.cancel', onclick: () => { pendingScan = undefined; render(); } }, 'Cancel'),
    ),
  );
}

/** Progress line while OCR runs (model load, then page by page). */
function ocrProgressBlock(): HTMLElement {
  const busy = ocrBusy!;
  return el(
    'div',
    { class: 'ocr-progress', role: 'status', 'aria-live': 'polite' },
    el('span', { class: 'spin sm', 'aria-hidden': 'true' }),
    ` ${busy.label}… ${busy.percent}%`,
  );
}

/** One sentence on where the "Taken as" values came from (DGS request
 * 2026-09-06: say how Graduate/Undergraduate were pre-filled, and ask for a
 * check). Three sources, most specific first: the transcript's own markers,
 * the two-year rule (which runs only when the transcript states no level at
 * all — DGS 2026-09-06 evening), the slot. */
function levelNote(p: ExternalPreview): string {
  const fromTranscript = p.rows.filter((r) => r.levelSource === 'transcript').length;
  const byTerm = p.rows.filter((r) => r.levelSource === 'term').length;
  const byAward = p.rows.filter((r) => r.levelSource === 'award').length;
  const parts: string[] = [];
  if (fromTranscript > 0) {
    parts.push(
      `${fromTranscript === p.rows.length ? 'every row' : `${fromTranscript} row${fromTranscript === 1 ? '' : 's'}`} from the level the transcript itself states (a UG/GR column, a “Level” block, or the date your bachelor’s degree was awarded)`,
    );
  }
  if (byTerm > 0 && p.termPrefill) {
    parts.push(
      `${byTerm === p.rows.length ? 'every row' : `${byTerm} row${byTerm === 1 ? '' : 's'}`} by the two-year rule — the transcript does not label them, so courses from ${termLabel(p.termPrefill.graduateFrom)} on (the last two years of the record, ending ${termLabel(p.termPrefill.latest)}) are marked “Grad student” and earlier ones “UG student”`,
    );
  }
  if (byAward > 0 && p.bachelorsAwarded) {
    parts.push(
      `${byAward === p.rows.length ? 'every row' : `${byAward} row${byAward === 1 ? '' : 's'}`} by the bachelor’s award term you set (${termLabel(p.bachelorsAwarded)}) — dated in or before it → “UG student”, later → “Grad student”`,
    );
  }
  const bySlot = p.rows.length - fromTranscript - byTerm - byAward;
  if (bySlot > 0) {
    parts.push(`${bySlot === p.rows.length ? 'every row' : `${bySlot} row${bySlot === 1 ? '' : 's'}`} as “${p.slot === 'bachelors' ? 'UG student' : 'Grad student'}” because this is the ${DEGREE_SLOTS.find((sl) => sl.level === p.slot)!.label} row`);
  }
  const text = parts.join('; ');
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;
}

function previewBlock(args: ExternalCardArgs): HTMLElement {
  const { rules, update, toast, render, student } = args;
  const p = preview!;
  const slotLabel = DEGREE_SLOTS.find((s) => s.level === p.slot)!.label;
  const box = el('div', { class: 'transcript-preview' });
  // The university name is locked when the transcript supplied it (DGS
  // request 2026-09-06): the DGS's rules key on the name as printed. Only a
  // name the parser could not find (or an OCR guess) is typed by the student.
  const uniLocked = p.universityFromTranscript === true && !p.fromOcr;
  const uniInput = el('input', { value: p.university, list: 'known-universities', 'data-key': 'ext.preview.university', 'aria-describedby': 'ext-university-hint', ...(uniLocked ? { readonly: 'readonly', class: 'locked' } : {}) });
  if (!uniLocked) {
    uniInput.addEventListener('change', () => {
      // Title-Cased on leaving the box (DGS 2026-09-06 evening); matching ignores case.
      const v = canonicalUniversityName((uniInput as HTMLInputElement).value);
      (uniInput as HTMLInputElement).value = v;
      p.university = v;
    });
    uniInput.addEventListener('input', () => {
      if (previewError) {
        previewError = undefined;
        box.querySelector('.import-error')?.remove();
      }
    });
  }
  box.append(
    el('h3', {}, `${slotLabel} — check every line, fix what the parser got wrong, then add`),
    ...(previewError ? [el('div', { class: 'import-error', role: 'alert', tabindex: '-1', 'data-key': 'ext.preview.error' }, previewError)] : []),
    ...(p.fromOcr
      ? [
          el(
            'div',
            { class: 'ocr-banner', role: 'note' },
            el('strong', {}, 'Read by OCR from a scan — approximate. English transcripts only. '),
            'Check every field against your transcript before adding; rows marked ⚠ were hard to read.',
          ),
        ]
      : []),
    ...(p.quarterSystem !== undefined || (!p.notreDame && !p.fromOcr)
      ? [
          (() => {
            // The credit system, read from the transcript and correctable
            // here (2026-09-11): a quarter transcript's 4 credits are 2.67
            // Notre Dame credits (§5.2 pro-rata), and the DGS's row for the
            // university overrides whatever is ticked.
            const cb = el('input', { type: 'checkbox', 'data-key': 'ext.preview.quarter', ...(p.quarterSystem ? { checked: 'checked' } : {}) });
            cb.addEventListener('change', () => { p.quarterSystem = (cb as HTMLInputElement).checked; render(); });
            return el(
              'p',
              { class: `hint ${p.quarterSystem ? 'warn' : ''} quarter-note` },
              el('label', {}, cb, ' This transcript is on the quarter system'),
              p.quarterSystem
                ? ' — read from its term headers. Its credits will be converted at 2/3 (a 4-credit course counts 2.67 Notre Dame credits, §5.2 pro-rata). Untick this if the parser misread; the DGS’s ruling for the university overrides it either way.'
                : ' — tick this if your university counts in quarter hours and the parser did not notice; credits are then converted at 2/3 (§5.2 pro-rata).',
            );
          })(),
        ]
      : []),
    ...(p.notreDame
      ? [
          el(
            'p',
            { class: 'hint warn nd-prior-note' },
            `This is an ND transcript, read as the record of an EARLIER ND degree. If it also holds your current program’s terms, cancel and use the “${ndRowLabel(student)}” row instead — it separates the earlier degree from the program by your entry term.`,
          ),
        ]
      : []),
    ...(p.mixedLevels
      ? [
          el(
            'p',
            { class: 'hint warn mixed-note' },
            el('strong', {}, 'How “Taken as” was filled in: '),
            levelNote(p),
            ' “Taken as” is your status at the time, not the course’s level: a graduate-level course (for example a 500- or 600-level one) that you took before your bachelor’s degree was awarded was taken as an undergraduate student, so it counts as undergraduate coursework. Please double-check every row before adding — ',
            p.notreDame
              ? 'rows taken as an undergraduate student at Notre Dame may still count toward your degree — 60000-level coursework in full, and CSE courses below it inside the allowance your degree allows — so they are offered ticked, and the report says course by course what each one does; the ones that can count nothing at all start unticked. Rows taken as a graduate student are §5.2 transfer candidates.'
              : student.program === 'phd'
                ? 'rows taken as an undergraduate student can only satisfy §4.4.1 core knowledge (no transfer credit, §5.2) and the ones that cannot matter start unticked; rows taken as a graduate student are §5.2 transfer candidates.'
                : 'rows taken as an undergraduate student bring no transfer credit (§5.2) and satisfy nothing else in the MSCSE, so they are not offered; rows taken as a graduate student are §5.2 transfer candidates.',
          ),
        ]
      : p.slot === 'bachelors'
        ? [
            el(
              'p',
              { class: 'hint warn' },
              `Courses taken as an undergraduate student do not transfer, whether or not the course itself is a graduate course (§5.2), so ${
                student.program === 'phd'
                  ? 'only courses relevant to the Alg, OS, and Comp Arch core-knowledge areas (§4.4.1) — or already reviewed by the DGS — are shown and added'
                  : 'only Notre Dame coursework that can still count toward the MSCSE is shown and added'
              }${p.omitted ? ` (${p.omitted} other course${p.omitted === 1 ? ' was' : 's were'} read and left out)` : ''}.`,
            ),
          ]
        : [el('p', { class: 'hint level-note' }, el('strong', {}, 'How “Taken as” was filled in: '), levelNote(p), ' “Taken as” is your status at the time, not the course’s level. Please double-check the column before adding.')]),
    ...(p.transferSkipped
      ? [
          el(
            'p',
            { class: 'hint warn' },
            `${p.transferSkipped} row${p.transferSkipped === 1 ? '' : 's'} listed under “Transfer credit accepted by the institution” ${p.transferSkipped === 1 ? 'was' : 'were'} left out — those courses were taken at another school and belong on that school’s own transcript.`,
          ),
        ]
      : []),
    el(
      'p',
      { class: 'hint', id: 'ext-university-hint' },
      uniLocked
        ? 'The university name and each course’s number, title, credits, grade and term are taken from your transcript as printed and cannot be edited here; only “Taken as” can be changed. Anything the parser could not read (a grade, credits or a year) must be filled in by hand — rows without a grade are not added.'
        : p.universityGuessed
          ? // The name is nowhere in this transcript's text — it was worked out
            // from an abbreviation (2026-09-08). Say so, since the student is
            // the only one who can tell whether it is right.
            'This transcript does not print its university’s name as text, so the name above was worked out from an abbreviation in it — check it, and correct it if it is wrong. Grades the parser could not read must be chosen by hand (rows without a grade are not added).'
          : 'The university name is how the DGS’s rules find your courses — use the name as your transcript prints it (pick it from the list if it is there). Grades the parser could not read must be chosen by hand (rows without a grade are not added).',
    ),
    el('label', { class: 'field' }, el('span', { class: 'label' }, 'University'), uniInput),
    // On every graduate-slot preview, whether or not this transcript says
    // anything about the bachelor's (DGS 2026-09-09: also on the prior Ph.D.
    // upload). The term decides which of these courses were taken with
    // graduate student status, so §5.2 needs it here as much as on a Master's
    // transcript; the bachelor's slot is the degree itself and reads its own
    // conferral date.
    ...(p.slot !== 'bachelors' ? [bachelorsField(p, rules, render, student.program)] : []),
  );
  const table = el('table', { class: 'courses stack edit' });
  table.append(
    el(
      'tr',
      {},
      el('th', { scope: 'col' }, el('span', { class: 'visually-hidden' }, 'Add')),
      el('th', { scope: 'col' }, 'Course id'),
      el('th', { scope: 'col' }, 'Title'),
      el('th', { scope: 'col', abbr: 'Credits' }, 'Cr'),
      el('th', { scope: 'col' }, 'Grade'),
      el('th', { scope: 'col' }, 'Term'),
      el('th', { scope: 'col' }, 'Year'),
      // .level-head: the one header the compact preview shows (DGS 2026-09-07).
      el('th', { scope: 'col', class: 'level-head', title: `Your status when you took the course — not the course’s level. A graduate-level course taken before your bachelor’s degree was awarded still counts as undergraduate coursework${student.program === 'phd' ? ': §4.4.1 core knowledge only, no transfer credit (§5.2).' : ', which brings no transfer credit (§5.2).'}` }, 'Taken as'),
    ),
  );
  // Every control in a row names its row (usability review 2026-09-05, item
  // 5): a screen reader says "Credits for CS 25100", not just "spin button".
  const blockedNote = blockedRowNote(p.notreDame === true, student.program);
  const rowEls = p.rows.map((r, i) => {
    const who = () => (r.courseId.trim() ? r.courseId.trim() : `row ${i + 1}`);
    // An undergraduate row that cannot matter is not selectable (DGS request
    // 2026-09-06): the box is disabled and the row explains why on hover; a
    // change of "Taken as" re-renders, so the box follows the level.
    const blocked = r.level === 'undergraduate' && !isRelevantRow(p.university, rules, r, student.program);
    if (blocked) r.include = false;
    const noteId = `ext-row-${i}-note`;
    const cb = el('input', {
      type: 'checkbox',
      'aria-label': `Add ${who()}`,
      'data-key': `ext.row.${i}.include`,
      ...(blocked ? { disabled: 'disabled', 'aria-describedby': noteId, title: blockedNote } : {}),
      onchange: (e) => {
        r.include = (e.target as HTMLInputElement).checked;
        render(); // the Add button's count follows (item 13)
      },
    });
    cb.checked = r.include;
    // Course number and title as the transcript printed them (DGS request
    // 2026-09-06): fixed for a text-layer import; editable for OCR rows (the
    // reader misreads) and rows typed by hand.
    const locked = !p.fromOcr && !r.manual;
    const idIn = locked
      ? el('span', { class: 'course-id locked', 'data-key': `ext.row.${i}.id` }, r.courseId)
      : el('input', { value: r.courseId, class: 'course-id', 'aria-label': `Course id, ${who()}`, 'data-key': `ext.row.${i}.id` });
    if (!locked) idIn.addEventListener('change', () => (r.courseId = (idIn as HTMLInputElement).value));
    const titleIn = locked
      ? el('span', { class: 'course-title locked', 'data-key': `ext.row.${i}.title` }, r.title)
      : el('input', { value: r.title, class: 'course-title', 'aria-label': `Title for ${who()}`, 'data-key': `ext.row.${i}.title` });
    if (!locked) titleIn.addEventListener('change', () => (r.title = (titleIn as HTMLInputElement).value));
    // Credits, grade and term are locked too for a text-layer import (DGS
    // request 2026-09-06, second pass) — as printed on the transcript. A value
    // the parser could not read stays an input, or the row could never be
    // completed; OCR and hand-typed rows stay fully editable.
    const lockedText = (cls: string, key: string, text: string | HTMLElement): HTMLElement => el('span', { class: `${cls} locked`, 'data-key': `ext.row.${i}.${key}` }, text);
    let crIn: HTMLElement;
    if (locked && r.credits !== undefined) crIn = lockedText('course-credits', 'credits', `${r.credits} cr`);
    else {
      crIn = el('input', { type: 'number', min: '0', max: '30', step: '0.5', 'aria-label': `Credits for ${who()}`, 'data-key': `ext.row.${i}.credits`, value: r.credits !== undefined ? String(r.credits) : '' });
      crIn.addEventListener('change', () => {
        const v = Number((crIn as HTMLInputElement).value);
        r.credits = Number.isFinite(v) && v > 0 ? v : undefined;
      });
    }
    let gradeSel: HTMLElement;
    if (locked && r.grade !== '') gradeSel = lockedText('course-grade', 'grade', r.grade === 'IP' ? 'In progress' : r.grade);
    else {
      gradeSel = el('select', { 'aria-label': `Grade for ${who()}`, 'data-key': `ext.row.${i}.grade` });
      gradeSel.append(option('', r.rawGrade ? `choose… (transcript says “${r.rawGrade}”)` : 'choose…', r.grade === ''));
      for (const g of GRADES) gradeSel.append(option(g, g === 'IP' ? 'In progress' : g, r.grade === g));
      gradeSel.addEventListener('change', () => (r.grade = (gradeSel as HTMLSelectElement).value as Grade | ''));
    }
    // The term: one locked "Fall 2023" when the transcript gave both parts.
    const termLocked = locked && r.year !== undefined;
    // One line only when nothing is left to fill in (DGS bug 2026-09-07): a
    // text-layer row whose credits, grade or year the parser missed renders
    // full-size controls, and the one-line form cannot wrap around them.
    const compactRow = rowIsCompact({ locked, credits: r.credits, grade: r.grade, year: r.year });
    let seasonSel: HTMLElement;
    let yearIn: HTMLElement | null;
    if (termLocked) {
      // The short form in the cell, the full name as the tooltip (DGS 2026-09-07).
      seasonSel = lockedText('course-term', 'season', el('abbr', { class: 'term', title: termLabel({ season: r.season, year: r.year! }) }, termShort({ season: r.season, year: r.year! })));
      yearIn = null;
    } else {
      seasonSel = el('select', { 'aria-label': `Semester for ${who()}`, 'data-key': `ext.row.${i}.season` });
      for (const se of ['fall', 'spring', 'summer'] as Season[]) seasonSel.append(option(se, se[0]!.toUpperCase() + se.slice(1), r.season === se));
      seasonSel.addEventListener('change', () => (r.season = (seasonSel as HTMLSelectElement).value as Season));
      yearIn = el('input', { type: 'number', min: '1970', max: '2040', 'aria-label': `Year for ${who()}`, 'data-key': `ext.row.${i}.year`, value: r.year !== undefined ? String(r.year) : '' });
      yearIn.addEventListener('change', () => {
        const v = Number((yearIn as HTMLInputElement).value);
        r.year = Number.isFinite(v) && v > 1900 ? v : undefined;
      });
    }
    // Taken as (2026-09-05): the level decides Bachelor's vs graduate coursework on add.
    const levelSel = el('select', {
      class: 'row-level',
      'aria-label': `Taken as (level) for ${who()}`,
      title: `Taken as — your status when you took the course, not the course’s level: a graduate-level course taken before your bachelor’s degree was awarded counts as undergraduate coursework${student.program === 'phd' ? ' (§4.4.1 core knowledge only, no transfer credit — §5.2)' : ' (no transfer credit — §5.2)'}`,
      'data-key': `ext.row.${i}.level`,
    });
    // "UG student" / "Grad student" (DGS 2026-09-06 late evening, shortened
    // 2026-09-07): a bare "Undergraduate" next to a 500-level course read as
    // the course's level and confused students; the word "student" says whose
    // status it is.
    levelSel.append(option('undergraduate', 'UG student', r.level === 'undergraduate'), option('graduate', 'Grad student', r.level === 'graduate'));
    levelSel.addEventListener('change', () => {
      r.level = (levelSel as HTMLSelectElement).value as PreviewRow['level'];
      r.levelSource = 'slot'; // the student decided — no longer "by the rule"
      // A row that becomes relevant is offered ticked, like every other
      // relevant row; one that becomes irrelevant is unticked and locked.
      if (!(r.level === 'undergraduate' && !isRelevantRow(p.university, rules, r, student.program))) r.include = true;
      render();
    });
    // A locked (text-layer) row is COMPACT (DGS request 2026-09-06, second
    // pass): two lines — tick, number and title; then "4 cr · A · Fall 2023 ·
    // Taken as [level]" — no field labels (the values speak for themselves).
    // Editable rows (OCR, typed by hand) keep their labelled inputs.
    const tr = el(
      'tr',
      {
        class: [r.lowConfidence ? 'ocr-low' : '', blocked ? 'prior-row blocked-row' : '', compactRow ? 'compact' : 'editable'].join(' ').trim(),
        ...(blocked ? { title: blockedNote } : {}),
      },
      el(
        'td',
        { class: 'cell-check' },
        r.lowConfidence ? el('span', { title: 'OCR read this line poorly — check it carefully', 'aria-label': 'low OCR confidence' }, '⚠') : null,
        cb,
        blocked ? el('span', { id: noteId, class: 'visually-hidden' }, blockedNote) : null,
      ),
      el('td', { class: 'cell-course', 'data-label': 'Course id' }, idIn),
      // (The greyed row + disabled box are the visible cue; the reason is the
      // hover text and the box's aria-describedby — DGS 2026-09-06: no tag.)
      el('td', { class: 'cell-title', 'data-label': 'Title' }, titleIn),
      el('td', { class: `cell-meta${locked && r.credits !== undefined ? ' locked-cell' : ''}`, 'data-label': 'Credits' }, crIn),
      el('td', { class: `cell-meta${locked && r.grade !== '' ? ' locked-cell' : ''}`, 'data-label': 'Grade' }, gradeSel),
      el('td', { class: `cell-meta${termLocked ? ' locked-cell' : ''}`, 'data-label': 'Term' }, seasonSel),
      termLocked ? el('td', { class: 'cell-meta cell-empty', 'data-label': 'Year' }) : el('td', { class: 'cell-meta', 'data-label': 'Year' }, yearIn),
      el('td', { class: 'cell-meta level-cell', 'data-label': 'Taken as' }, levelSel),
    );
    return tr;
  });
  table.append(...rowEls);
  const selectAll = (on: boolean) => {
    for (const r of p.rows) r.include = on && !(r.level === 'undergraduate' && !isRelevantRow(p.university, rules, r, student.program));
    render();
  };
  box.append(
    el(
      'p',
      { class: 'select-links' },
      el('button', { class: 'btn tiny', 'data-key': 'ext.preview.all', onclick: () => selectAll(true) }, 'Select all'),
      ' ',
      el('button', { class: 'btn tiny', 'data-key': 'ext.preview.none', onclick: () => selectAll(false) }, 'Select none'),
    ),
    table,
  );
  box.append(
    el('button', {
      class: 'btn tiny',
      'data-key': 'ext.preview.addRow',
      onclick: () => {
        p.rows.push({ include: true, courseId: '', title: '', credits: 3, grade: '', season: 'fall', year: undefined, level: slotDefaultLevel(p.slot), levelSource: 'slot', manual: true });
        render();
        document.querySelector<HTMLElement>(`[data-key="ext.row.${p.rows.length - 1}.id"]`)?.focus();
      },
    }, '+ Add a row by hand'),
  );
  box.append(
    el(
      'div',
      { class: 'save-buttons' },
      el(
        'button',
        {
          class: 'btn primary',
          'data-key': 'ext.preview.add',
          onclick: async () => {
            const university = p.university.trim();
            // Problems stay on screen, next to what needs fixing (item 6).
            const problem = (message: string, focusKey: string): void => {
              previewError = message;
              render();
              document.querySelector<HTMLElement>(`[data-key="${focusKey}"]`)?.focus();
            };
            if (university === '') {
              problem('Enter the university name — the DGS’s rules match courses by university + course id.', 'ext.preview.university');
              return;
            }
            // A combined bachelor's + master's record needs the award term (DGS 2026-09-06 evening).
            if (p.bachelorsRequired && p.bachelorsAwarded === undefined) {
              problem('Enter the semester your bachelor’s degree was awarded — required for a combined bachelor’s + master’s transcript: courses dated in or before it count as undergraduate coursework (§5.2).', 'ext.preview.bachelors.year');
              return;
            }
            const ready = p.rows.filter((r) => r.include && r.courseId.trim() !== '' && r.grade !== '' && r.credits !== undefined && r.year !== undefined);
            const skipped = p.rows.filter((r) => r.include).length - ready.length;
            if (ready.length === 0) {
              problem('No rows are complete yet — every added row needs a course id, credits, a grade and a year.', 'ext.preview.error');
              return;
            }
            previewError = undefined;
            // A row whose credit-hours column came through blank is saved as 0
            // and counts toward nothing. The student is asked before it is
            // added, naming the rows (DGS 2026-09-11) — allowed, never silent.
            const zeroRows = ready.filter((r) => r.credits === 0);
            if (zeroRows.length > 0) {
              const which = zeroRows.map((r) => r.courseId.trim()).join(', ');
              const yes = await confirmDialog({
                title: `${zeroRows.length === 1 ? 'One course has' : `${zeroRows.length} courses have`} 0 credits`,
                body: [
                  `${which} ${zeroRows.length === 1 ? 'is' : 'are'} about to be added with 0 credits, which counts toward nothing — not the total credits, not the regular-course credits, not any cap.`,
                  'That usually means the credit-hours column could not be read. Cancel, type the credits from your transcript into those rows, and add them again.',
                ],
                confirmLabel: 'Add them anyway',
                cancelLabel: 'Go back and fix the credits',
                returnFocusKey: 'ext.preview.add',
              });
              if (!yes) return;
            }
            // (initializer cast: the assignment happens inside the update()
            // closure, which TS's flow analysis can't see from the use below)
            let priorAutoSet = false as 'completed' | 'unfinished' | false;
            let refiledToProgram = 0;
            let graduateRows = 0;
            let bachelorsSet: Term | undefined;
            let bachelorsFromTranscript = false;
            update((s) => {
              for (const r of ready) {
                const degreeLevel = degreeLevelFor(p.slot, r.level);
                if (degreeLevel !== 'bachelors') graduateRows += 1;
                s.courses.push({
                  courseId: canonicalCourseId(r.courseId),
                  title: r.title.trim() || undefined,
                  credits: r.credits!,
                  term: { season: r.season, year: r.year! },
                  grade: r.grade as Grade,
                  origin: 'transfer',
                  institution: university,
                  degreeLevel,
                  // Notre Dame rows keep their registered level so a later
                  // entry-term change can re-file them (prior-nd.ts).
                  registeredLevel: isNotreDameInstitution(university) ? r.level : undefined,
                  ...(p.quarterSystem && !isNotreDameInstitution(university) ? { creditSystem: 'quarter' as const } : {}),
                });
              }
              // "Prior graduate study" from the transcript (2026-09-03): a
              // graduate-degree conferral line → completed; a graduate
              // transcript WITHOUT one → "Prior M.S., not completed" plus the
              // standing card's warning (the transcript alone cannot prove
              // completion). Only the untouched default is upgraded — never a
              // student's own choice; touching the dropdown clears the flag.
              // Since 2026-09-05 any GRADUATE row triggers this, whatever the
              // slot (a 4+1's fifth year on an undergraduate transcript).
              if (graduateRows > 0 && s.priorMs === 'none') {
                s.priorMs = p.conferred === true ? 'completed' : 'unfinished';
                s.priorMsInferred = true;
                priorAutoSet = s.priorMs;
              }
              // The bachelor's award term: a value the student gave — here or
              // under Your standing — always applies; one read from this
              // transcript fills the field only while the student has not set
              // it by hand (2026-09-06). Since 2026-09-07 the preview is itself
              // pre-filled from a hand-set term, so this usually writes back
              // the same value: only a REAL change is announced, and only a
              // term that truly came from the transcript is described that way.
              if (p.bachelorsAwarded !== undefined && (p.bachelorsSource === 'student' || s.bachelorsAwarded === undefined || s.bachelorsAwardedInferred !== undefined)) {
                const changed = s.bachelorsAwarded === undefined || termIndex(s.bachelorsAwarded) !== termIndex(p.bachelorsAwarded);
                s.bachelorsAwarded = { ...p.bachelorsAwarded };
                s.bachelorsAwardedInferred = p.bachelorsSource === 'student' ? undefined : { how: `the bachelor’s degree conferred ${p.bachelorsConferredOn} on your ${university} transcript` };
                if (changed) {
                  bachelorsSet = s.bachelorsAwarded;
                  bachelorsFromTranscript = p.bachelorsSource === 'transcript';
                }
              }
              // A Notre Dame transcript can land in one of these slots as the
              // record of an EARLIER Notre Dame degree (2026-09-05), and such a
              // transcript often carries the current program too. The entry
              // term is what separates the two, so re-file by it here as the
              // Notre Dame slot does — otherwise the student's in-program
              // courses sit as §5.2 transfer candidates until they happen to
              // touch a term field (2026-09-09).
              if (isNotreDameInstitution(university)) {
                refiledToProgram = reclassifyNotreDameCourses(s).toProgram;
              }
            });
            const matched = ready.filter((r) => findExternalRule(rules.external, university, r.courseId)).length;
            const undergraduateRows = ready.length - graduateRows;
            preview = undefined;
            previewError = undefined;
            render();
            toast(
              `Added ${ready.length} course${ready.length === 1 ? '' : 's'} from ${university}` +
                (p.mixedLevels ? ` (${undergraduateRows} undergraduate, ${graduateRows} graduate${p.termPrefill ? ', by the two-year rule where the transcript did not say' : ''})` : '') +
                (matched > 0 ? ` — ${matched} already in the DGS’s external-course rules` : '') +
                (skipped > 0 ? `; ${skipped} skipped (incomplete — missing a grade, credits or year)` : '') +
                (refiledToProgram > 0
                  ? `; ${refiledToProgram} of them are dated from your entry term on, so they are filed as this program's coursework, not as transfer credit`
                  : '') +
                '.' +
                (priorAutoSet === 'completed'
                  ? ' Prior graduate study was set to “Completed prior M.S. or Ph.D.” from the conferral line on your transcript — adjust it under Your standing if that’s wrong.'
                  : priorAutoSet === 'unfinished'
                    ? ' Prior graduate study was set to “Prior M.S., not completed” — no degree-conferral line was found on your transcript; pick “Completed prior M.S. or Ph.D.” under Your standing if you did earn the degree.'
                    : '') +
                (bachelorsSet
                  ? ` “Bachelor’s degree awarded” was set to ${termLabel(bachelorsSet)}${bachelorsFromTranscript ? ' from the conferral date on your transcript' : ''} — check it under Your standing.`
                  : ''),
            );
          },
        },
        `Add ${p.rows.filter((r) => r.include).length} checked course${p.rows.filter((r) => r.include).length === 1 ? '' : 's'}`,
      ),
      el('button', { class: 'btn', 'data-key': 'ext.preview.cancel', onclick: () => { preview = undefined; previewError = undefined; render(); } }, 'Cancel'),
    ),
  );
  return box;
}


/** The preview's "Bachelor's degree awarded" control (DGS 2026-09-06 evening):
 * season + year, pre-filled from the transcript's conferral date, required for
 * a combined record. A change re-fills every row's "Taken as" by the term. */
function bachelorsField(p: ExternalPreview, rules: Rules, render: () => void, program: Program): HTMLElement {
  const yearInput = el('input', {
    type: 'number',
    min: '1970',
    max: '2040',
    'aria-label': 'Bachelor’s degree awarded — year',
    'aria-describedby': 'ext-bachelors-hint',
    'data-key': 'ext.preview.bachelors.year',
    value: p.bachelorsAwarded ? String(p.bachelorsAwarded.year) : '',
    ...(p.bachelorsRequired ? { required: 'required', 'aria-required': 'true' } : {}),
  });
  const seasonSel = el('select', { 'aria-label': 'Bachelor’s degree awarded — semester', 'data-key': 'ext.preview.bachelors.season' });
  for (const se of ['fall', 'spring', 'summer'] as const) seasonSel.append(option(se, se[0]!.toUpperCase() + se.slice(1), (p.bachelorsAwarded?.season ?? 'spring') === se));
  const apply = (): void => {
    const raw = (yearInput as HTMLInputElement).value;
    const year = Number(raw);
    p.bachelorsAwarded = raw !== '' && Number.isFinite(year) && year >= 1970 ? { season: (seasonSel as HTMLSelectElement).value as Season, year } : undefined;
    p.bachelorsSource = 'student';
    relevelByAward(p, rules, program);
    previewError = undefined;
    render();
  };
  yearInput.addEventListener('change', apply);
  seasonSel.addEventListener('change', () => {
    if ((yearInput as HTMLInputElement).value !== '') apply();
  });
  // What undergraduate coursework can still do, by degree: for a Ph.D.
  // student §4.4.1 core knowledge; for an MSCSE student nothing at all,
  // because the qualifying examination is not theirs (DGS 2026-09-11).
  const ugTail = program === 'phd' ? ': no transfer credit, core knowledge only (§5.2, §4.4.1).' : ', which brings no transfer credit (§5.2).';
  const hint =
    p.bachelorsAwarded && p.bachelorsSource === 'student'
      ? `Taken from “Bachelor’s degree awarded” under Your standing — importing this transcript does not change it.${p.bachelorsConferredOn ? ` This transcript says a bachelor’s degree was conferred ${p.bachelorsConferredOn}; correct it here only if that is the right term.` : ''} Courses dated in or before it count as undergraduate coursework${ugTail}`
      : p.bachelorsAwarded && p.bachelorsSource === 'transcript'
      ? `Read from your transcript (bachelor’s degree conferred ${p.bachelorsConferredOn}) — check it. Courses dated in or before this term count as undergraduate coursework${ugTail}`
      : p.bachelorsRequired
        ? `Required for a combined bachelor’s + master’s record: enter the semester your bachelor’s degree was awarded. Courses dated in or before it count as undergraduate coursework${ugTail.replace(/\.$/, '')}; changing it re-fills “Taken as” for every row.`
        : 'Required — the semester your bachelor’s degree was awarded; courses dated in or before it count as undergraduate coursework (§5.2).';
  return el(
    'div',
    { class: 'field bachelors-field' },
    // Required everywhere since 2026-09-07 (DGS); only the Add-blocking is
    // specific to a combined bachelor's + master's record.
    el('span', { class: 'label' }, 'Bachelor’s degree awarded (required)'),
    el('div', { class: 'pair' }, seasonSel, yearInput),
    el('p', { class: 'hint', id: 'ext-bachelors-hint' }, hint),
  );
}
