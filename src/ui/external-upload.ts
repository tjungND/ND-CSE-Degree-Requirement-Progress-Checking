// "Prior Coursework" card (feature decisions 2026-09-01; renamed 2026-09-03):
// up to three uploads — Bachelor's, Master's, Ph.D., all optional — parsed
// entirely in the browser (system-generated PDFs only, no scans), previewed for
// correction, then added as origin:'transfer' courses tagged with their degree
// level. Each filled slot shows the DGS's verdicts from the ExternalCourses
// rules, and pending courses get a copy-ready review request to email the DGS
// (the page itself transmits nothing — FERPA).
import { findExternalRule } from '../data/external.ts';
import type { Rules } from '../data/types.ts';
import { GRADES, isPassed } from '../engine/grades.ts';
import { termLabel } from '../engine/term.ts';
import type { CourseEntry, Grade, Season, Student } from '../engine/types.ts';
import type { ExternalCourseCandidate } from '../transcript/external.ts';
import { DGS, GRAD_ADMIN, mailto } from './contacts.ts';
import { clear, el, option } from './dom.ts';

/** Write a review request to the clipboard in BOTH flavors (2026-09-03):
 * text/plain keeps the tab-separated rows; text/html carries them as a real
 * table — HTML email flattens tabs to spaces, but a table survives Gmail and
 * pastes into Sheets as cells. Falls back to plain text where ClipboardItem
 * is unsupported. Shared by the Prior Coursework card and the ND-courses
 * review block in app.ts. */
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
}

interface ExternalPreview {
  slot: DegreeLevel;
  university: string;
  rows: PreviewRow[];
  /** Rows came from OCR of a scan — approximate; the preview says so. */
  fromOcr?: boolean;
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
}

/** The whole card: intro, three slots, preview (when one is open). */
export function externalTranscriptsCard(args: ExternalCardArgs): HTMLElement {
  const { student, rules } = args;
  return el(
    'div',
    { class: 'card external-card' },
    el('h2', {}, 'Prior Coursework ', el('span', { class: 'chip-note' }, 'optional')),
    el(
      'p',
      { class: 'hint' },
      'Took courses at another university before Notre Dame? Import up to three transcripts — undergraduate, Master’s, Ph.D. — and every course is checked against the DGS’s external-course rules: whether it satisfies a §4.4.1 core-knowledge area, and whether its credits can transfer (§5.2). Undergraduate courses can satisfy core knowledge but never transfer credit (§5.2). ',
      el('strong', {}, 'System-generated PDFs are read exactly; a scanned or photographed transcript can be read with built-in text recognition (OCR) — English-language transcripts only'),
      ' — after you agree, and with every field checked by you. Like everything here, the file is read on your own computer and never uploaded. ',
      el('strong', {}, 'Decisions are made only by email:'),
      ' when courses need review, you must copy the review request this card writes for you and send it to the DGS and the Graduate Program Administrator.',
    ),
    ...DEGREE_SLOTS.map((slot) => slotRow(slot, args)),
    pendingScan ? scanOptInBlock(args) : null,
    ocrBusy ? ocrProgressBlock() : null,
    preview ? previewBlock(args) : null,
    pendingRequestBlock(student, rules, args.toast),
  );
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
      const parsed = parseExternalTranscript(lines);
      if (!parsed.hasTextLayer) {
        // A scan or photo: never OCR silently — offer it (DGS decision 2026-09-02).
        pendingScan = { slot: slot.level, buffer, filename: file.name };
        render();
        return;
      }
      if (parsed.looksLikeNotreDame) {
        toast('This looks like a Notre Dame transcript — use the “Import Courses from PDF” button in the courses card above for it; these three slots are for OTHER universities.');
        return;
      }
      preview = {
        slot: slot.level,
        university: parsed.university ?? '',
        rows: parsed.courses.map((c: ExternalCourseCandidate) => ({
          include: true,
          courseId: c.courseId,
          title: c.title ?? '',
          credits: c.credits,
          grade: c.grade ?? '',
          rawGrade: c.rawGrade,
          season: 'fall' as Season,
          year: c.year,
        })),
      };
      if (preview.rows.length === 0) {
        toast('No course-like lines could be read from this PDF — its layout is new to the parser. You can still add the courses by hand in the preview (and please tell the DGS which university, so parsing can be improved).');
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
            }),
        },
        'Remove',
      ),
    );
  } else {
    parts.push(
      ' — ',
      el('button', { class: 'btn tiny', onclick: () => (fileInput as HTMLInputElement).click() }, 'Import Courses from PDF (beta)'),
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
                  toast('This looks like a Notre Dame transcript — use the “Import Courses from PDF” button in the courses card above, with the digital PDF from insideND (not a scan).');
                  return;
                }
                preview = {
                  slot,
                  university: parsed.university ?? '',
                  fromOcr: true,
                  rows: parsed.courses.map((c) => ({
                    include: true,
                    courseId: c.courseId,
                    title: c.title ?? '',
                    credits: c.credits,
                    grade: c.grade ?? '',
                    rawGrade: c.rawGrade,
                    season: 'fall' as Season,
                    year: c.year,
                    lowConfidence: c.lowConfidence,
                  })),
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
    el('p', { class: 'hint' }, 'The university name is how the DGS’s rules find your courses — use the name as your transcript prints it. Grades the parser could not read must be chosen by hand (rows without a grade are not added).'),
    el('label', { class: 'field' }, el('span', { class: 'label' }, 'University'), uniInput),
  );
  const table = el('table', { class: 'courses' });
  table.append(
    el('tr', {}, el('th', {}, ''), el('th', {}, 'Course id'), el('th', {}, 'Title'), el('th', {}, 'Cr'), el('th', {}, 'Grade'), el('th', {}, 'Term'), el('th', {}, 'Year')),
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
    const tr = el(
      'tr',
      { class: r.lowConfidence ? 'ocr-low' : '' },
      el('td', {}, r.lowConfidence ? el('span', { title: 'OCR read this line poorly — check it carefully', 'aria-label': 'low OCR confidence' }, '⚠') : null, cb),
      el('td', {}, idIn),
      el('td', {}, titleIn),
      el('td', {}, crIn),
      el('td', {}, gradeSel),
      el('td', {}, seasonSel),
      el('td', {}, yearIn),
    );
    return tr;
  });
  table.append(...rowEls);
  box.append(table);
  box.append(
    el('button', {
      class: 'btn tiny',
      onclick: () => {
        p.rows.push({ include: true, courseId: '', title: '', credits: 3, grade: '', season: 'fall', year: undefined });
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
            update((s) => {
              for (const r of ready) {
                s.courses.push({
                  courseId: r.courseId.trim(),
                  title: r.title.trim() || undefined,
                  credits: r.credits!,
                  term: { season: r.season, year: r.year! },
                  grade: r.grade as Grade,
                  origin: 'transfer',
                  institution: university,
                  degreeLevel: p.slot,
                });
              }
            });
            const matched = ready.filter((r) => findExternalRule(rules.external, university, r.courseId)).length;
            preview = undefined;
            render();
            toast(
              `Added ${ready.length} course${ready.length === 1 ? '' : 's'} from ${university}` +
                (matched > 0 ? ` — ${matched} already in the DGS’s external-course rules` : '') +
                (skipped > 0 ? `; ${skipped} skipped (incomplete — missing a grade, credits or year)` : '') +
                '.',
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

/** Per-course DGS verdicts for everything uploaded, plus the copy-ready review
 * request for anything the DGS has not ruled on yet. */
function pendingRequestBlock(student: Student, rules: Rules, toast: (m: string) => void): HTMLElement | null {
  const external = student.courses.filter((c) => c.origin === 'transfer' && c.degreeLevel !== undefined);
  if (external.length === 0) return null;
  const lines: HTMLElement[] = [];
  const pending: CourseEntry[] = [];
  for (const c of external) {
    const rule = findExternalRule(rules.external, c.institution ?? '', c.courseId);
    const verdictParts: string[] = [];
    if (rule?.satisfiesCoreArea) {
      const area = rules.coreAreas.find((a) => a.code === rule.satisfiesCoreArea);
      verdictParts.push(`core knowledge: ${area?.name ?? rule.satisfiesCoreArea} ✓${isPassed(c.grade) ? '' : ' (needs a passing grade)'}`);
    }
    if (c.degreeLevel === 'bachelors') verdictParts.push('no transfer credit (Bachelor’s, §5.2)');
    else if (rule?.transferable === true) verdictParts.push('transferable ✓ (send the §5.2 request)');
    else if (rule?.transferable === false) verdictParts.push('not transferable (DGS ruling)');
    if (!rule) {
      verdictParts.push('not yet reviewed by the DGS');
      pending.push(c);
    } else if (rule.transferable === undefined && c.degreeLevel !== 'bachelors') {
      verdictParts.push('transferability not yet decided');
      pending.push(c);
    }
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
  if (pending.length > 0) {
    // Paste-ready for the ExternalCourses tab (decision 2026-09-03): the course
    // rows are tab-separated in the sheet's column order.
    const requestText = async () => {
      const { buildExternalReviewRequest } = await import('../transcript/external.ts');
      return buildExternalReviewRequest(
        pending.map((c) => ({
          institution: c.institution,
          courseId: c.courseId,
          title: c.title,
          credits: c.credits,
          grade: c.grade,
          termText: termLabel(c.term),
          slotLabel: c.degreeLevel ? (DEGREE_SLOTS.find((sl) => sl.level === c.degreeLevel)?.label ?? c.degreeLevel) : undefined,
        })),
      );
    };
    out.append(
      el(
        'div',
        { class: 'save-buttons' },
        el(
          'button',
          {
            class: 'btn',
            onclick: () => {
              requestText()
                .then(copyReviewRequest)
                .then(() => toast('Review request copied — email it to the DGS and the Graduate Program Administrator. (Nothing is sent by this page.)'))
                .catch(() => toast('Could not copy automatically — please email the DGS with your university, course ids, credits, grades and terms.'));
            },
          },
          `Copy review request for ${pending.length} course${pending.length === 1 ? '' : 's'}`,
        ),
        el('span', { class: 'hint-inline' }, ' — you MUST email it to the DGS (', mailto(DGS.email), ') and the Graduate Program Administrator (', mailto(GRAD_ADMIN.email), ') for these courses to be reviewed; the page itself sends nothing.'),
      ),
    );
  }
  return out;
}
