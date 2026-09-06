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
import { resolveRuleRow } from '../data/assemble.ts';
import { NOTRE_DAME, findExternalRule, isNotreDameInstitution } from '../data/external.ts';
import { CORE_TITLE_RE } from '../engine/core-title.ts';
import type { Rules } from '../data/types.ts';
import { GRADES } from '../engine/grades.ts';
import { termIndex, termLabel } from '../engine/term.ts';
import type { CourseEntry, Grade, Season, Student, Term } from '../engine/types.ts';
import type { ExternalCourseCandidate } from '../transcript/external.ts';
import { prefillLevelsByTerm } from '../transcript/level-prefill.ts';
import { parseTranscript } from '../transcript/parse.ts';
import { clear, el, option } from './dom.ts';

/** Write a review request to the clipboard in BOTH flavors (2026-09-03):
 * text/plain keeps the tab-separated rows; text/html carries them as a real
 * table — HTML email flattens tabs to spaces, but a table survives Gmail and
 * pastes into Sheets as cells. Falls back to plain text where ClipboardItem
 * is unsupported. Used by the "Ask the DGS to review" card in app.ts. */
export function copyReviewRequest(built: { text: string; html: string }): Promise<void> {
  return (async () => {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/plain': new Blob([built.text], { type: 'text/plain' }),
          'text/html': new Blob([built.html], { type: 'text/html' }),
        }),
      ]);
    } catch {
      await navigator.clipboard.writeText(built.text);
    }
  })();
}

export type DegreeLevel = NonNullable<CourseEntry['degreeLevel']>;
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
  levelSource: 'transcript' | 'term' | 'slot';
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
  /** The university name came from the transcript (2026-09-06): shown, not
   * editable — the DGS's rules key on the name the transcript prints. */
  universityFromTranscript?: boolean;
  /** A Notre Dame transcript in a previous-degree slot (2026-09-05): an
   * earlier Notre Dame degree. The preview reminds the student that the
   * Notre Dame row handles a transcript that also holds the current program. */
  notreDame?: boolean;
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
  /** A toast with one action button (Undo) — app.ts supplies it. */
  toastWithAction?: (msg: string, actionLabel: string, action: () => void) => void;
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
function keepRelevantRows(
  university: string,
  rules: Rules,
  rows: PreviewRow[],
  mixed: boolean,
): { rows: PreviewRow[]; omitted: number } {
  const relevant = (r: PreviewRow) =>
    r.level === 'graduate' ||
    CORE_TITLE_RE.test(r.title) ||
    findExternalRule(rules.external, university, r.courseId) !== undefined ||
    (isNotreDameInstitution(university) && r.year !== undefined && resolveRuleRow(rules, r.courseId, { season: r.season, year: r.year })?.coreArea !== undefined);
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
    // Where a COMBINED transcript goes (DGS request 2026-09-05: make it easy
    // to notice): one PDF covering both a BS and an MS is imported once, in
    // the Master's row; each row's level is read and shown for correction.
    el(
      'div',
      { class: 'combined-note', role: 'note' },
      el('strong', {}, 'One transcript for both your BS and MS'),
      ' (a 4+1 / 5+1 program, or both degrees at one university)? Import it ',
      el('strong', {}, 'once, in the Previous Master’s Transcript row'),
      '. Each course’s level (undergraduate or graduate) is read from it and shown in a “Taken as” column you can correct before adding. The Undergraduate row works too — never import the same PDF twice.',
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
        const kept = keepRelevantRows(NOTRE_DAME, rules, ndRows, levels.size > 1);
        preview = {
          slot: slot.level,
          university: NOTRE_DAME,
          universityFromTranscript: true,
          conferred: nd.degreesAwarded.some((d) => d.level === 'masters' || d.level === 'phd'),
          rows: kept.rows,
          omitted: kept.omitted,
          transferSkipped: nd.courses.filter((c) => c.origin === 'transfer').length || undefined,
          mixedLevels: levels.size > 1,
          notreDame: true,
        };
        if (ndRows.length === 0) previewError = 'This looks like a Notre Dame transcript, but no course lines could be read from it. Add the courses by hand below, and tell the DGS.';
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
      const termPrefill = prefillLevelsByTerm(mapped, slot.level);
      const mixed = parsed.mixedLevels === true || new Set(mapped.map((r) => r.level)).size > 1;
      const kept = keepRelevantRows(parsed.university ?? '', rules, mapped, mixed);
      preview = {
        slot: slot.level,
        university: parsed.university ?? '',
        universityFromTranscript: (parsed.university ?? '') !== '',
        conferred: parsed.degreeConferred,
        rows: kept.rows,
        omitted: kept.omitted,
        transferSkipped: parsed.transferRowsSkipped,
        mixedLevels: mixed || undefined,
        termPrefill,
      };
      if (mapped.length === 0) {
        previewError = 'No course-like lines could be read from this PDF — its layout is new to the parser. You can still add the courses by hand below (and please tell the DGS which university, so parsing can be improved).';
      } else if (kept.rows.length === 0) {
        previewError = `All ${mapped.length} courses read from this transcript were left out — none matched the Algorithms / Operating Systems / Architecture core keywords, and none are in the DGS’s external-course rules. Undergraduate credits do not transfer (§5.2); if a course belongs to a core area under a different title, add it by hand below.`;
      }
      render();
    } catch {
      fail('That PDF could not be read (is it a PDF?). Only system-generated PDFs are accepted.');
    } finally {
      (fileInput as HTMLInputElement).value = '';
    }
  });

  const parts: (Node | string)[] = [el('span', { class: 'slot-label' }, slot.label)];
  if (have.length > 0) {
    const uni = have[0]!.institution ?? 'another university';
    parts.push(
      el('span', { class: 'slot-sep', 'aria-hidden': 'true' }, ' — '),
      el('span', {}, `${have.length} course${have.length === 1 ? '' : 's'} from ${uni} `),
      el(
        'button',
        {
          class: 'btn tiny',
          'aria-label': `Remove the ${have.length} ${slot.label} course${have.length === 1 ? '' : 's'} from ${uni}`,
          'data-key': `ext.remove.${slot.level}`,
          onclick: () => {
            // Undo instead of a confirm dialog (usability review 2026-09-05,
            // item 25): everything removed can be put back with one click.
            const removed = student.courses.filter((c) => c.origin === 'transfer' && c.degreeLevel === slot.level);
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
            args.toastWithAction?.(`${removed.length} ${slot.label} course${removed.length === 1 ? '' : 's'} removed.`, 'Undo', () =>
              update((s) => {
                s.courses.push(...removed);
                s.priorMs = priorBefore.priorMs;
                s.priorMsInferred = priorBefore.inferred;
              }),
            );
          },
        },
        'Remove',
      ),
    );
  } else {
    parts.push(
      el('span', { class: 'slot-sep', 'aria-hidden': 'true' }, ' — '),
      el('button', { class: 'btn tiny', disabled: args.blocked, 'data-key': `ext.import.${slot.level}`, onclick: () => (fileInput as HTMLInputElement).click() }, 'Import from PDF (alpha)'),
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
  const { render } = args;
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
                  importError = { slot, message: 'This looks like a Notre Dame transcript — use the “Notre Dame Unofficial Transcript” row above, with the digital PDF from insideND (not a scan).' };
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
                const termPrefill = prefillLevelsByTerm(mapped, slot);
                const mixed = parsed.mixedLevels === true || new Set(mapped.map((r) => r.level)).size > 1;
                const kept = keepRelevantRows(parsed.university ?? '', args.rules, mapped, mixed);
                preview = {
                  slot,
                  university: parsed.university ?? '',
                  // OCR misreads names too — the field stays editable (2026-09-06).
                  fromOcr: true,
                  conferred: parsed.degreeConferred,
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
 * the two-year rule, the slot. */
function levelNote(p: ExternalPreview): string {
  const fromTranscript = p.rows.filter((r) => r.levelSource === 'transcript').length;
  const byTerm = p.rows.filter((r) => r.levelSource === 'term').length;
  const parts: string[] = [];
  if (fromTranscript > 0) {
    parts.push(
      `${fromTranscript === p.rows.length ? 'every row' : `${fromTranscript} row${fromTranscript === 1 ? '' : 's'}`} from the level the transcript itself states (a UG/GR column, a “Level” block, or the date your bachelor’s degree was awarded)`,
    );
  }
  if (byTerm > 0 && p.termPrefill) {
    parts.push(
      `${byTerm === p.rows.length ? 'every row' : `${byTerm} row${byTerm === 1 ? '' : 's'}`} by the two-year rule — the transcript does not label them, so courses from ${termLabel(p.termPrefill.graduateFrom)} on (the last two years of the record, ending ${termLabel(p.termPrefill.latest)}) are marked Graduate and earlier ones Undergraduate`,
    );
  }
  const bySlot = p.rows.length - fromTranscript - byTerm;
  if (bySlot > 0) {
    parts.push(`${bySlot === p.rows.length ? 'every row' : `${bySlot} row${bySlot === 1 ? '' : 's'}`} as ${p.slot === 'bachelors' ? 'Undergraduate' : 'Graduate'} because this is the ${DEGREE_SLOTS.find((sl) => sl.level === p.slot)!.label} row`);
  }
  const text = parts.join('; ');
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;
}

function previewBlock(args: ExternalCardArgs): HTMLElement {
  const { rules, update, toast, render } = args;
  const p = preview!;
  const slotLabel = DEGREE_SLOTS.find((s) => s.level === p.slot)!.label;
  const box = el('div', { class: 'transcript-preview' });
  // The university name is locked when the transcript supplied it (DGS
  // request 2026-09-06): the DGS's rules key on the name as printed. Only a
  // name the parser could not find (or an OCR guess) is typed by the student.
  const uniLocked = p.universityFromTranscript === true && !p.fromOcr;
  const uniInput = el('input', { value: p.university, 'data-key': 'ext.preview.university', 'aria-describedby': 'ext-university-hint', ...(uniLocked ? { readonly: 'readonly', class: 'locked' } : {}) });
  if (!uniLocked) {
    uniInput.addEventListener('change', () => (p.university = (uniInput as HTMLInputElement).value));
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
    ...(p.notreDame
      ? [
          el(
            'p',
            { class: 'hint warn nd-prior-note' },
            'This is a Notre Dame transcript, read as the record of an EARLIER Notre Dame degree. If it also holds your current program’s terms, cancel and use the “Notre Dame Unofficial Transcript” row instead — it separates the earlier degree from the program by your entry term.',
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
            ' Please double-check every row before adding — rows taken as an undergraduate can only satisfy §4.4.1 core knowledge (no transfer credit, §5.2) and the ones that cannot matter start unticked; rows taken as a graduate student are §5.2 transfer candidates.',
          ),
        ]
      : p.slot === 'bachelors'
        ? [
            el(
              'p',
              { class: 'hint warn' },
              `Undergraduate credits do not transfer (§5.2), so only courses relevant to the Algorithms, Operating Systems, and Computer Architecture core-knowledge areas (§4.4.1) — or already reviewed by the DGS — are shown and added${p.omitted ? ` (${p.omitted} other course${p.omitted === 1 ? ' was' : 's were'} read and left out)` : ''}.`,
            ),
          ]
        : [el('p', { class: 'hint level-note' }, el('strong', {}, 'How “Taken as” was filled in: '), levelNote(p), ' Please double-check the column before adding.')]),
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
        ? 'The university name and each course’s number and title are taken from your transcript as printed — they cannot be edited here (the DGS’s rules key on them). Credits, grades, terms and “Taken as” can be corrected; grades the parser could not read must be chosen by hand (rows without a grade are not added).'
        : 'The university name is how the DGS’s rules find your courses — use the name as your transcript prints it. Grades the parser could not read must be chosen by hand (rows without a grade are not added).',
    ),
    el('label', { class: 'field' }, el('span', { class: 'label' }, 'University'), uniInput),
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
      el('th', { scope: 'col', title: 'The level you were registered at when you took it — undergraduate rows can only satisfy §4.4.1 core knowledge; graduate rows may transfer (§5.2)' }, 'Taken as'),
    ),
  );
  // Every control in a row names its row (usability review 2026-09-05, item
  // 5): a screen reader says "Credits for CS 25100", not just "spin button".
  const rowEls = p.rows.map((r, i) => {
    const who = () => (r.courseId.trim() ? r.courseId.trim() : `row ${i + 1}`);
    const cb = el('input', {
      type: 'checkbox',
      'aria-label': `Add ${who()}`,
      'data-key': `ext.row.${i}.include`,
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
    const crIn = el('input', { type: 'number', min: '0', max: '30', step: '0.5', 'aria-label': `Credits for ${who()}`, 'data-key': `ext.row.${i}.credits`, value: r.credits !== undefined ? String(r.credits) : '' });
    crIn.addEventListener('change', () => {
      const v = Number((crIn as HTMLInputElement).value);
      r.credits = Number.isFinite(v) && v > 0 ? v : undefined;
    });
    const gradeSel = el('select', { 'aria-label': `Grade for ${who()}`, 'data-key': `ext.row.${i}.grade` });
    gradeSel.append(option('', r.rawGrade ? `choose… (transcript says “${r.rawGrade}”)` : 'choose…', r.grade === ''));
    for (const g of GRADES) gradeSel.append(option(g, g === 'IP' ? 'In progress' : g, r.grade === g));
    gradeSel.addEventListener('change', () => (r.grade = (gradeSel as HTMLSelectElement).value as Grade | ''));
    const seasonSel = el('select', { 'aria-label': `Semester for ${who()}`, 'data-key': `ext.row.${i}.season` });
    for (const se of ['fall', 'spring', 'summer'] as Season[]) seasonSel.append(option(se, se[0]!.toUpperCase() + se.slice(1), r.season === se));
    seasonSel.addEventListener('change', () => (r.season = (seasonSel as HTMLSelectElement).value as Season));
    const yearIn = el('input', { type: 'number', min: '1970', max: '2040', 'aria-label': `Year for ${who()}`, 'data-key': `ext.row.${i}.year`, value: r.year !== undefined ? String(r.year) : '' });
    yearIn.addEventListener('change', () => {
      const v = Number((yearIn as HTMLInputElement).value);
      r.year = Number.isFinite(v) && v > 1900 ? v : undefined;
    });
    // Taken as (2026-09-05): the level decides Bachelor's vs graduate coursework on add.
    const levelSel = el('select', { class: 'row-level', 'aria-label': `Taken as (level) for ${who()}`, 'data-key': `ext.row.${i}.level` });
    levelSel.append(option('undergraduate', 'Undergraduate', r.level === 'undergraduate'), option('graduate', 'Graduate', r.level === 'graduate'));
    levelSel.addEventListener('change', () => (r.level = (levelSel as HTMLSelectElement).value as PreviewRow['level']));
    const tr = el(
      'tr',
      { class: [r.lowConfidence ? 'ocr-low' : '', r.irrelevant ? 'prior-row' : ''].join(' ').trim() },
      el('td', { class: 'cell-check' }, r.lowConfidence ? el('span', { title: 'OCR read this line poorly — check it carefully', 'aria-label': 'low OCR confidence' }, '⚠') : null, cb),
      el('td', { class: 'cell-course', 'data-label': 'Course id' }, idIn),
      el('td', { class: 'cell-title', 'data-label': 'Title' }, titleIn),
      el('td', { class: 'cell-meta', 'data-label': 'Credits' }, crIn),
      el('td', { class: 'cell-meta', 'data-label': 'Grade' }, gradeSel),
      el('td', { class: 'cell-meta', 'data-label': 'Term' }, seasonSel),
      el('td', { class: 'cell-meta', 'data-label': 'Year' }, yearIn),
      el('td', { class: 'cell-meta', 'data-label': 'Taken as' }, levelSel),
    );
    return tr;
  });
  table.append(...rowEls);
  const selectAll = (on: boolean) => {
    for (const r of p.rows) r.include = on;
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
          onclick: () => {
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
            const ready = p.rows.filter((r) => r.include && r.courseId.trim() !== '' && r.grade !== '' && r.credits !== undefined && r.year !== undefined);
            const skipped = p.rows.filter((r) => r.include).length - ready.length;
            if (ready.length === 0) {
              problem('No rows are complete yet — every added row needs a course id, credits, a grade and a year.', 'ext.preview.error');
              return;
            }
            previewError = undefined;
            // (initializer cast: the assignment happens inside the update()
            // closure, which TS's flow analysis can't see from the use below)
            let priorAutoSet = false as 'completed' | 'unfinished' | false;
            let graduateRows = 0;
            update((s) => {
              for (const r of ready) {
                const degreeLevel = degreeLevelFor(p.slot, r.level);
                if (degreeLevel !== 'bachelors') graduateRows += 1;
                s.courses.push({
                  courseId: r.courseId.trim(),
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
                '.' +
                (priorAutoSet === 'completed'
                  ? ' Prior graduate study was set to “Completed prior M.S. or Ph.D.” from the conferral line on your transcript — adjust it under Your standing if that’s wrong.'
                  : priorAutoSet === 'unfinished'
                    ? ' Prior graduate study was set to “Prior M.S., not completed” — no degree-conferral line was found on your transcript; pick “Completed prior M.S. or Ph.D.” under Your standing if you did earn the degree.'
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

