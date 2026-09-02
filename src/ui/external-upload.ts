// "Transcripts from other universities" card (feature decisions 2026-09-01):
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
import { DGS, mailto } from './contacts.ts';
import { clear, el, option } from './dom.ts';

export type DegreeLevel = NonNullable<CourseEntry['degreeLevel']>;
export const DEGREE_SLOTS: { level: DegreeLevel; label: string }[] = [
  { level: 'bachelors', label: 'Bachelor’s' },
  { level: 'masters', label: 'Master’s' },
  { level: 'phd', label: 'Ph.D.' },
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
}

interface ExternalPreview {
  slot: DegreeLevel;
  university: string;
  rows: PreviewRow[];
}

let preview: ExternalPreview | undefined;

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
    el('h2', {}, 'Transcripts from other universities ', el('span', { class: 'chip-note' }, 'optional')),
    el(
      'p',
      { class: 'hint' },
      'Took courses elsewhere? Upload up to three transcripts — Bachelor’s, Master’s, Ph.D. — and every course is checked against the DGS’s external-course rules: whether it satisfies a §4.4.1 core-knowledge area, and whether its credits can transfer (§5.2). Bachelor’s courses can satisfy core knowledge but never transfer credit (§5.2). ',
      el('strong', {}, 'System-generated PDFs only'),
      ' — no scans or photos. Like everything here, the file is read on your own computer and never uploaded.',
    ),
    ...DEGREE_SLOTS.map((slot) => slotRow(slot, args)),
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
      const lines = await pdfToLines(await file.arrayBuffer());
      const { parseExternalTranscript } = await import('../transcript/external.ts');
      const parsed = parseExternalTranscript(lines);
      if (!parsed.hasTextLayer) {
        toast('This PDF has no readable text, so it is a scan or a photo — only system-generated PDFs are accepted, for correctness. Ask your university for a digital PDF, or use your browser’s "Print → Save as PDF" on the online transcript.');
        return;
      }
      if (parsed.looksLikeNotreDame) {
        toast('This looks like a Notre Dame transcript — use the "Upload ND unofficial transcript" button above for it; these three slots are for OTHER universities.');
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

  const parts: (Node | string)[] = [el('span', { class: 'slot-label' }, `${slot.label} transcript`)];
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
      el('button', { class: 'btn tiny', onclick: () => (fileInput as HTMLInputElement).click() }, 'Upload PDF'),
      fileInput,
    );
  }
  return el('div', { class: 'external-slot' }, ...parts);
}

function previewBlock(args: ExternalCardArgs): HTMLElement {
  const { rules, update, toast, render } = args;
  const p = preview!;
  const slotLabel = DEGREE_SLOTS.find((s) => s.level === p.slot)!.label;
  const box = el('div', { class: 'transcript-preview' });
  const uniInput = el('input', { value: p.university, placeholder: 'University name as printed on the transcript' });
  uniInput.addEventListener('change', () => (p.university = (uniInput as HTMLInputElement).value));
  box.append(
    el('h3', {}, `${slotLabel} transcript — check every line, fix what the parser got wrong, then add`),
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
      {},
      el('td', {}, cb),
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
    const requestText = () => {
      const rows = pending.map(
        (c) => `- ${c.institution ?? '?'}: ${c.courseId}${c.title ? ` “${c.title}”` : ''}, ${c.credits} credit${c.credits === 1 ? '' : 's'}, grade ${c.grade}, ${termLabel(c.term)}${c.degreeLevel ? ` (${c.degreeLevel === 'bachelors' ? 'Bachelor’s' : c.degreeLevel === 'masters' ? 'Master’s' : 'Ph.D.'} transcript)` : ''}`,
      );
      return (
        `Subject: External course review request (degree self-check)\n\n` +
        `Dear DGS,\n\nCould you review these courses from another institution for the degree audit — ` +
        `whether any satisfies a §4.4.1 core-knowledge area, and whether the credits can transfer (§5.2)?\n\n` +
        rows.join('\n') +
        `\n\nThank you!\n`
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
              navigator.clipboard
                .writeText(requestText())
                .then(() => toast('Review request copied — paste it into an email to the DGS. (Nothing is sent by this page.)'))
                .catch(() => toast('Could not copy automatically — please email the DGS with your university, course ids, credits, grades and terms.'));
            },
          },
          `Copy review request for ${pending.length} course${pending.length === 1 ? '' : 's'}`,
        ),
        el('span', { class: 'hint-inline' }, ' — email it to the DGS (', mailto(DGS.email), '); the page itself sends nothing.'),
      ),
    );
  }
  return out;
}
