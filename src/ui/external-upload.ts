// Prior-university transcript slots (feature decisions 2026-09-01; since
// 2026-09-03 part of the single "Transcripts" card composed in app.ts): up to
// three uploads — undergraduate, Master's, Ph.D., all optional — parsed
// entirely in the browser (system-generated PDFs read exactly; scans via the
// explicit opt-in English-only OCR), previewed for correction, then added as
// origin:'transfer' courses tagged with their degree level. The verdicts block
// shows the DGS's rulings from the ExternalCourses rules; anything unruled is
// picked up by app.ts's single "Ask the DGS to review" card (the page itself
// transmits nothing — FERPA).
import { resolveRuleRow } from '../data/assemble.ts';
import { NOTRE_DAME, findExternalRule, isNotreDameInstitution } from '../data/external.ts';
import { CORE_TITLE_RE } from '../engine/core-title.ts';
import type { Rules } from '../data/types.ts';
import { GRADES, isPassed } from '../engine/grades.ts';
import { termIndex, termLabel } from '../engine/term.ts';
import type { CourseEntry, Grade, Season, Student } from '../engine/types.ts';
import type { ExternalCourseCandidate } from '../transcript/external.ts';
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
  /** Left out by the relevance filter (an undergraduate row that cannot
   * matter) but kept visible, unticked, on a MIXED-level transcript so the
   * student can still tick it or change its level (2026-09-05). */
  irrelevant?: boolean;
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
  const { student, rules } = args;
  return [
    // Where a COMBINED transcript goes (DGS request 2026-09-05: make it easy
    // to notice): one PDF covering both a BS and an MS is imported once, in
    // the Master's row; each row's level is read and shown for correction.
    el(
      'div',
      { class: 'combined-note', role: 'note' },
      el('strong', {}, 'One transcript for both your BS and MS'),
      ' (a 4+1 / 5+1 program, or both degrees at the same university)? Import it ',
      el('strong', {}, 'once, in the Previous Master’s Transcript row'),
      ' — each course’s level (undergraduate or graduate) is read from it and shown in a “Taken as” column you can correct before adding. The Undergraduate row works too; do not import the same PDF twice.',
    ),
    ...DEGREE_SLOTS.map((slot) => slotRow(slot, args)),
    pendingScan ? scanOptInBlock(args) : null,
    ocrBusy ? ocrProgressBlock() : null,
    preview ? previewBlock(args) : null,
    verdictsBlock(student, rules),
  ];
}

function coursesInSlot(student: Student, level: DegreeLevel): CourseEntry[] {
  return student.courses.filter((c) => c.origin === 'transfer' && c.degreeLevel === level);
}

function slotRow(slot: { level: DegreeLevel; label: string }, args: ExternalCardArgs): HTMLElement {
  const { student, rules, update, toast, render } = args;
  const have = coursesInSlot(student, slot.level);
  const fileInput = el('input', { type: 'file', accept: '.pdf,application/pdf', class: `hidden external-file-${slot.level}` });
  fileInput.addEventListener('change', async () => {
    const file = (fileInput as HTMLInputElement).files?.[0];
    if (!file) return;
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
          }));
        const levels = new Set(ndRows.map((r) => r.level));
        const kept = keepRelevantRows(NOTRE_DAME, rules, ndRows, levels.size > 1);
        preview = {
          slot: slot.level,
          university: NOTRE_DAME,
          conferred: nd.degreesAwarded.some((d) => d.level === 'masters' || d.level === 'phd'),
          rows: kept.rows,
          omitted: kept.omitted,
          transferSkipped: nd.courses.filter((c) => c.origin === 'transfer').length || undefined,
          mixedLevels: levels.size > 1,
          notreDame: true,
        };
        if (ndRows.length === 0) toast('This looks like a Notre Dame transcript, but no course lines could be read from it. Add the courses by hand in the preview, and tell the DGS.');
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
      }));
      const kept = keepRelevantRows(parsed.university ?? '', rules, mapped, parsed.mixedLevels === true);
      preview = {
        slot: slot.level,
        university: parsed.university ?? '',
        conferred: parsed.degreeConferred,
        rows: kept.rows,
        omitted: kept.omitted,
        transferSkipped: parsed.transferRowsSkipped,
        mixedLevels: parsed.mixedLevels,
      };
      if (mapped.length === 0) {
        toast('No course-like lines could be read from this PDF — its layout is new to the parser. You can still add the courses by hand in the preview (and please tell the DGS which university, so parsing can be improved).');
      } else if (kept.rows.length === 0) {
        toast(`All ${mapped.length} courses read from this transcript were left out — none matched the Algorithms / Operating Systems / Architecture core keywords, and none are in the DGS’s external-course rules. Undergraduate credits do not transfer (§5.2); if a course belongs to a core area under a different title, add it by hand in the preview.`);
      }
      render();
    } catch {
      toast('That PDF could not be read (is it a PDF?). Only system-generated PDFs are accepted.');
    } finally {
      (fileInput as HTMLInputElement).value = '';
    }
  });

  const parts: (Node | string)[] = [el('span', { class: 'slot-label' }, slot.label)];
  if (have.length > 0) {
    const uni = have[0]!.institution ?? 'another university';
    parts.push(
      el('span', {}, ` — ${have.length} course${have.length === 1 ? '' : 's'} from ${uni} `),
      el(
        'button',
        {
          class: 'btn tiny',
          onclick: () =>
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
            }),
        },
        'Remove',
      ),
    );
  } else {
    parts.push(
      ' — ',
      el('button', { class: 'btn tiny', disabled: args.blocked, onclick: () => (fileInput as HTMLInputElement).click() }, 'Import Courses from PDF (alpha)'),
      fileInput,
    );
  }
  return el('div', { class: 'external-slot' }, ...parts);
}

/** The explicit OCR opt-in for a scanned PDF (DGS decision 2026-09-02):
 * system-generated PDFs stay the encouraged path; OCR is approximate,
 * ENGLISH-ONLY, and never runs without the student choosing it. */
function scanOptInBlock(args: ExternalCardArgs): HTMLElement {
  const { toast, render } = args;
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
                  render();
                  toast('This looks like a Notre Dame transcript — use the “Notre Dame Unofficial Transcript” row above, with the digital PDF from insideND (not a scan).');
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
                }));
                const kept = keepRelevantRows(parsed.university ?? '', args.rules, mapped, parsed.mixedLevels === true);
                preview = {
                  slot,
                  university: parsed.university ?? '',
                  fromOcr: true,
                  conferred: parsed.degreeConferred,
                  rows: kept.rows,
                  omitted: kept.omitted,
                  transferSkipped: parsed.transferRowsSkipped,
                  mixedLevels: parsed.mixedLevels,
                };
                render();
                if (parsed.courses.length === 0) {
                  toast(`OCR finished but found no course-like lines (${pagesRead} of ${pagesTotal} pages read). You can add the courses by hand in the preview.`);
                } else if (pagesTotal > pagesRead) {
                  toast(`Read the first ${pagesRead} of ${pagesTotal} pages (the reader stops at ${pagesRead}).`);
                }
              } catch (e) {
                // Leave a breadcrumb for debugging without surfacing internals.
                console.error('OCR failed:', e);
                ocrBusy = undefined;
                render();
                toast('The text reader could not run in this browser — please use a system-generated PDF instead.');
              }
            })();
          },
        },
        'Try OCR (English only)',
      ),
      el('button', { class: 'btn', onclick: () => { pendingScan = undefined; render(); } }, 'Cancel'),
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

function previewBlock(args: ExternalCardArgs): HTMLElement {
  const { rules, update, toast, render } = args;
  const p = preview!;
  const slotLabel = DEGREE_SLOTS.find((s) => s.level === p.slot)!.label;
  const box = el('div', { class: 'transcript-preview' });
  const uniInput = el('input', { value: p.university, placeholder: 'University name as printed on the transcript' });
  uniInput.addEventListener('change', () => (p.university = (uniInput as HTMLInputElement).value));
  box.append(
    el('h3', {}, `${slotLabel} — check every line, fix what the parser got wrong, then add`),
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
            'This transcript holds both undergraduate and graduate coursework — import it just once. Check the “Taken as” column: rows taken as an undergraduate can only satisfy §4.4.1 core knowledge (no transfer credit, §5.2) — the ones that cannot matter start unticked — while rows taken as a graduate student are §5.2 transfer candidates.',
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
        : []),
    ...(p.transferSkipped
      ? [
          el(
            'p',
            { class: 'hint warn' },
            `${p.transferSkipped} row${p.transferSkipped === 1 ? '' : 's'} listed under “Transfer credit accepted by the institution” ${p.transferSkipped === 1 ? 'was' : 'were'} left out — those courses were taken at another school and belong on that school’s own transcript.`,
          ),
        ]
      : []),
    el('p', { class: 'hint' }, 'The university name is how the DGS’s rules find your courses — use the name as your transcript prints it. Grades the parser could not read must be chosen by hand (rows without a grade are not added).'),
    el('label', { class: 'field' }, el('span', { class: 'label' }, 'University'), uniInput),
  );
  const table = el('table', { class: 'courses' });
  table.append(
    el(
      'tr',
      {},
      el('th', {}, ''),
      el('th', {}, 'Course id'),
      el('th', {}, 'Title'),
      el('th', {}, 'Cr'),
      el('th', {}, 'Grade'),
      el('th', {}, 'Term'),
      el('th', {}, 'Year'),
      el('th', { title: 'The level you were registered at when you took it — undergraduate rows can only satisfy §4.4.1 core knowledge; graduate rows may transfer (§5.2)' }, 'Taken as'),
    ),
  );
  const rowEls = p.rows.map((r) => {
    const cb = el('input', { type: 'checkbox', onchange: (e) => (r.include = (e.target as HTMLInputElement).checked) });
    cb.checked = r.include;
    const idIn = el('input', { value: r.courseId, class: 'course-id' });
    idIn.addEventListener('change', () => (r.courseId = (idIn as HTMLInputElement).value));
    const titleIn = el('input', { value: r.title, class: 'course-title' });
    titleIn.addEventListener('change', () => (r.title = (titleIn as HTMLInputElement).value));
    const crIn = el('input', { type: 'number', min: '0', max: '30', step: '0.5', value: r.credits !== undefined ? String(r.credits) : '' });
    crIn.addEventListener('change', () => {
      const v = Number((crIn as HTMLInputElement).value);
      r.credits = Number.isFinite(v) && v > 0 ? v : undefined;
    });
    const gradeSel = el('select', {});
    gradeSel.append(option('', r.rawGrade ? `choose… (transcript says “${r.rawGrade}”)` : 'choose…', r.grade === ''));
    for (const g of GRADES) gradeSel.append(option(g, g === 'IP' ? 'In progress' : g, r.grade === g));
    gradeSel.addEventListener('change', () => (r.grade = (gradeSel as HTMLSelectElement).value as Grade | ''));
    const seasonSel = el('select', {});
    for (const se of ['fall', 'spring', 'summer'] as Season[]) seasonSel.append(option(se, se[0]!.toUpperCase() + se.slice(1), r.season === se));
    seasonSel.addEventListener('change', () => (r.season = (seasonSel as HTMLSelectElement).value as Season));
    const yearIn = el('input', { type: 'number', min: '1970', max: '2040', value: r.year !== undefined ? String(r.year) : '' });
    yearIn.addEventListener('change', () => {
      const v = Number((yearIn as HTMLInputElement).value);
      r.year = Number.isFinite(v) && v > 1900 ? v : undefined;
    });
    // Taken as (2026-09-05): the level decides Bachelor's vs graduate coursework on add.
    const levelSel = el('select', { class: 'row-level' });
    levelSel.append(option('undergraduate', 'Undergraduate', r.level === 'undergraduate'), option('graduate', 'Graduate', r.level === 'graduate'));
    levelSel.addEventListener('change', () => (r.level = (levelSel as HTMLSelectElement).value as PreviewRow['level']));
    const tr = el(
      'tr',
      { class: [r.lowConfidence ? 'ocr-low' : '', r.irrelevant ? 'prior-row' : ''].join(' ').trim() },
      el('td', {}, r.lowConfidence ? el('span', { title: 'OCR read this line poorly — check it carefully', 'aria-label': 'low OCR confidence' }, '⚠') : null, cb),
      el('td', {}, idIn),
      el('td', {}, titleIn),
      el('td', {}, crIn),
      el('td', {}, gradeSel),
      el('td', {}, seasonSel),
      el('td', {}, yearIn),
      el('td', {}, levelSel),
    );
    return tr;
  });
  table.append(...rowEls);
  box.append(table);
  box.append(
    el('button', {
      class: 'btn tiny',
      onclick: () => {
        p.rows.push({ include: true, courseId: '', title: '', credits: 3, grade: '', season: 'fall', year: undefined, level: slotDefaultLevel(p.slot) });
        render();
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
          onclick: () => {
            const university = p.university.trim();
            if (university === '') {
              toast('Please fill in the university name — the DGS’s rules match courses by university + course id.');
              return;
            }
            const ready = p.rows.filter((r) => r.include && r.courseId.trim() !== '' && r.grade !== '' && r.credits !== undefined && r.year !== undefined);
            const skipped = p.rows.filter((r) => r.include).length - ready.length;
            if (ready.length === 0) {
              toast('No rows are complete yet — every added row needs a course id, credits, a grade and a year.');
              return;
            }
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
            render();
            toast(
              `Added ${ready.length} course${ready.length === 1 ? '' : 's'} from ${university}` +
                (p.mixedLevels ? ` (${undergraduateRows} undergraduate, ${graduateRows} graduate)` : '') +
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
        'Add checked courses',
      ),
      el('button', { class: 'btn', onclick: () => { preview = undefined; render(); } }, 'Cancel'),
    ),
  );
  return box;
}

/** Per-course DGS verdicts for everything uploaded. The copy-ready review
 * request moved to the single "Ask the DGS to review" card in app.ts
 * (2026-09-03) — ND and external courses share ONE request. */
function verdictsBlock(student: Student, rules: Rules): HTMLElement | null {
  const external = student.courses.filter((c) => c.origin === 'transfer' && c.degreeLevel !== undefined);
  if (external.length === 0) return null;
  const lines: HTMLElement[] = [];
  for (const c of external) {
    const rule = findExternalRule(rules.external, c.institution ?? '', c.courseId);
    // Prior Notre Dame coursework (2026-09-05): the Courses tab's core area
    // applies to a Notre Dame course whenever it was taken.
    const ndCore = isNotreDameInstitution(c.institution) ? resolveRuleRow(rules, c.courseId, c.term)?.coreArea : undefined;
    const verdictParts: string[] = [];
    const coreCode = rule?.satisfiesCoreArea ?? ndCore;
    if (coreCode) {
      const area = rules.coreAreas.find((a) => a.code === coreCode);
      verdictParts.push(`core knowledge: ${area?.name ?? coreCode} ✓${isPassed(c.grade) ? '' : ' (needs a passing grade)'}${rule?.satisfiesCoreArea ? '' : ' (course rules)'}`);
    }
    if (c.degreeLevel === 'bachelors') verdictParts.push('no transfer credit (Bachelor’s, §5.2)');
    else if (rule?.transferable === true) verdictParts.push('transferable ✓ (send the §5.2 request)');
    else if (rule?.transferable === false) verdictParts.push('not transferable (DGS ruling)');
    if (!rule && !(ndCore && c.degreeLevel === 'bachelors')) verdictParts.push(c.degreeLevel === 'bachelors' ? 'not yet reviewed by the DGS' : 'transfer not yet reviewed by the DGS');
    else if (rule && rule.transferable === undefined && c.degreeLevel !== 'bachelors') verdictParts.push('transferability not yet decided');
    lines.push(
      el(
        'div',
        { class: 'external-verdict' },
        el('span', { class: 'cid' }, c.courseId),
        ` (${c.institution ?? '?'}, ${termLabel(c.term)}) — ${verdictParts.join('; ')}`,
      ),
    );
  }
  const out = el('div', { class: 'external-verdicts' }, el('h3', {}, 'What the DGS’s rules say'), ...lines);
  return out;
}
