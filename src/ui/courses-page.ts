// The public course list: which CSE graduate courses count toward the MSCSE
// (§3) and Ph.D. (§4), which Ph.D. Qualifying Examination component each can
// satisfy — core knowledge (§4.4.1) or specialization category (§4.4.2), both
// parts of the §4.4 qualifying exam, not degree-credit tags — when it is
// typically offered, and whether the DGS has confirmed the row. Everything
// shown comes from the Courses tab of the rules sheet (via the same loader as
// the audit page); this file only presents it. No student data is involved.
import type { NotreDameNow } from '../data/clock.ts';
import { resolveRuleRow } from '../data/assemble.ts';
import type { CourseType, Counts, RuleCourse, Rules } from '../data/types.ts';
import type { Term } from '../engine/types.ts';
import { termLabel, termOfDate } from '../engine/term.ts';
import { DGS, LICENSE_URL, REPO_URL, applyContactOverrides, contactCard, mailto, reportToDgs } from './contacts.ts';
import { clear, el, option } from './dom.ts';
import { handbookLink, rulesDateLine } from './handbook.ts';
import { sheetSourceLine, sheetSourceNote } from './sheet-source.ts';

// ---------- labels (sheet codes → words students understand) ----------

const COUNTS_LABEL: Record<Counts, string> = {
  yes: 'Yes',
  no: 'No',
  dgs_approval: 'With DGS approval',
};
const COUNTS_CLASS: Record<Counts, string> = { yes: 'yes', no: 'no', dgs_approval: 'approval' };

const TYPE_LABEL: Record<CourseType, string> = {
  regular: 'Regular course',
  seminar: 'Seminar',
  research: 'Research',
  independent: 'Independent study',
  project: 'Project',
};

const OFFERED_LABEL: Record<string, string> = {
  fall: 'Fall',
  spring: 'Spring',
  both: 'Fall and spring',
  varies: 'Varies',
};

type SortKey = 'course' | 'title' | 'type' | 'mscse' | 'phd' | 'core' | 'category' | 'offered' | 'reviewed';

/** What the reader is checking (usability review 2026-09-05, item 30): the
 * table shows only the columns that answer that question. */
type View = 'all' | 'mscse' | 'phd' | 'qualifier';

interface Filters {
  query: string;
  program: 'all' | 'mscse' | 'phd';
  core: string; // '' = any
  category: string; // '' = any
  type: string; // '' = any
  /** '' = any semester; 'now' = on this semester's schedule; 'next' = on the
   * next one's (DGS 2026-09-09, the sheet's offered_now / offered_next). */
  offered: '' | 'now' | 'next';
  includeRetired: boolean;
  confirmedOnly: boolean;
  sort: SortKey;
  desc: boolean;
  view: View;
}

const VIEW_LABEL: Record<View, string> = {
  all: 'Everything',
  mscse: 'Whether a course counts toward the M.S. (MSCSE)',
  phd: 'Whether a course counts toward the Ph.D.',
  qualifier: 'Whether a course satisfies a Ph.D. qualifier area',
};
/** Columns hidden per view, by their 1-based position in the table. */
const HIDDEN_COLUMNS: Record<View, number[]> = {
  all: [],
  mscse: [5, 6, 7], // Ph.D. credit, core knowledge, specialization
  phd: [4, 6, 7], // MSCSE credit, core knowledge, specialization
  qualifier: [3, 4, 5, 8], // type, both degree-credit columns, typically offered
};

/** The filters as URL query parameters (item 29), so an advisor can send a
 * student a link straight to "the algorithms courses" or "pending rows":
 * courses.html?q=…&program=…&core=…&category=…&type=…&retired=1&confirmed=1&sort=…&desc=1&view=…
 * Only non-default values are written; unknown values fall back to defaults. */
function filtersFromUrl(defaults: Filters, validCores: Set<string>, validCategories: Set<string>): Filters {
  const f = { ...defaults };
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(window.location.search);
  } catch {
    return f;
  }
  const q = params.get('q');
  if (q) f.query = q.slice(0, 80);
  const program = params.get('program');
  if (program === 'mscse' || program === 'phd') f.program = program;
  const core = params.get('core');
  if (core && validCores.has(core)) f.core = core;
  const category = params.get('category');
  if (category && validCategories.has(category)) f.category = category;
  const type = params.get('type');
  if (type && ['regular', 'seminar', 'research', 'independent', 'project'].includes(type)) f.type = type;
  const offered = params.get('offered');
  if (offered === 'now' || offered === 'next') f.offered = offered;
  if (params.get('retired') === '1') f.includeRetired = true;
  if (params.get('confirmed') === '1') f.confirmedOnly = true;
  const sort = params.get('sort');
  if (sort && ['course', 'title', 'type', 'mscse', 'phd', 'core', 'category', 'offered', 'reviewed'].includes(sort)) f.sort = sort as SortKey;
  if (params.get('desc') === '1') f.desc = true;
  const view = params.get('view');
  if (view === 'all' || view === 'mscse' || view === 'phd' || view === 'qualifier') f.view = view;
  return f;
}

function filtersToUrl(f: Filters, defaults: Filters): void {
  const params = new URLSearchParams();
  if (f.query !== defaults.query) params.set('q', f.query);
  if (f.program !== defaults.program) params.set('program', f.program);
  if (f.core !== defaults.core) params.set('core', f.core);
  if (f.category !== defaults.category) params.set('category', f.category);
  if (f.type !== defaults.type) params.set('type', f.type);
  if (f.offered !== defaults.offered) params.set('offered', f.offered);
  if (f.includeRetired) params.set('retired', '1');
  if (f.confirmedOnly) params.set('confirmed', '1');
  if (f.sort !== defaults.sort) params.set('sort', f.sort);
  if (f.desc) params.set('desc', '1');
  if (f.view !== defaults.view) params.set('view', f.view);
  const qs = params.toString();
  try {
    window.history.replaceState(null, '', `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash}`);
  } catch {
    /* file:// or a sandboxed page — the address bar just stays as it was */
  }
}

export function renderCoursesPage(root: HTMLElement, rules: Rules, today: NotreDameNow): void {
  applyContactOverrides(rules.parameters); // sheet-driven contacts (2026-09-04)
  const todayIso = today.iso; // Notre Dame's date, settled on the loading card (2026-09-07)
  const currentTerm = termOfDate(todayIso);
  // "Next semester" on a schedule is the next FALL or SPRING; summer is not a
  // graduate teaching term, so a summer today looks ahead to the fall.
  const nextTeachingTerm: Term =
    currentTerm.season === 'fall'
      ? { season: 'spring', year: currentTerm.year + 1 }
      : currentTerm.season === 'spring'
        ? { season: 'fall', year: currentTerm.year }
        : { season: 'fall', year: currentTerm.year };

  // One row per course: the rule in effect this term (older/newer versions are
  // mentioned in the hover text so nothing is hidden).
  const rows: RuleCourse[] = [];
  for (const [courseId, versions] of rules.courses) {
    const current = resolveRuleRow(rules, courseId, currentTerm);
    if (current) rows.push(current);
    void versions;
  }
  rows.sort((a, b) => a.courseId.localeCompare(b.courseId));

  const coreName = new Map(rules.coreAreas.map((c) => [c.code, c.name]));
  const groupName = new Map(rules.categoryGroups.map((g) => [g.code, g.name]));

  const DEFAULTS: Filters = {
    query: '',
    program: 'all',
    core: '',
    category: '',
    type: '',
    offered: '',
    includeRetired: false,
    confirmedOnly: false,
    sort: 'course',
    desc: false,
    view: 'all',
  };
  const filters: Filters = filtersFromUrl(DEFAULTS, new Set(rules.coreAreas.map((c) => c.code)), new Set(rules.categoryGroups.map((g) => g.code)));

  // ---------- helpers ----------

  const countsLabel = (c: Counts | undefined): string => (c ? COUNTS_LABEL[c] : 'Not yet decided');
  const countsClass = (c: Counts | undefined): string => (c ? COUNTS_CLASS[c] : 'undecided');
  const coreLabel = (r: RuleCourse): string => (r.coreArea ? (coreName.get(r.coreArea) ?? r.coreArea) : '—');
  const allGroupCodes = rules.categoryGroups.map((g) => g.code);
  // Whether the DGS has filled the schedule columns in at all: with every cell
  // blank the filter can only return nothing, so it is not shown (2026-09-09).
  const scheduleKnown = rows.some((r) => r.offeredNow !== undefined || r.offeredNext !== undefined);
  // §4.4.2's numbers are DGS-tunable sheet parameters, so the two places that
  // state them read the sheet (2026-09-08). A missing parameter drops the
  // numbers rather than printing a guess — the page never invents policy.
  const catCourses = rules.parameters.number('category_courses_required');
  const catGroups = rules.parameters.number('category_distinct_groups_required');
  const catFloor = rules.parameters.gradeLetter('category_min_grade');
  // Without the § — each of the two places adds its own citation.
  const catRule =
    catCourses !== undefined && catGroups !== undefined && catFloor !== undefined
      ? `${catCourses} courses from ${catGroups} different categories, each with a grade of ${catFloor} or higher, are required`
      : 'courses from several different categories are required — the handbook has the exact numbers';
  /** The groups a course may satisfy, in the Categories tab's order (DGS
   * 2026-09-08 — a cell may name one, several, or `any`). */
  const groupsOf = (r: RuleCourse): string[] => {
    const listed = r.categoryGroups;
    if (!listed || listed.length === 0) return [];
    return listed.includes('any') ? allGroupCodes : allGroupCodes.filter((g) => listed.includes(g));
  };
  const categoryLabel = (r: RuleCourse): string => {
    if (r.categoryIneligible) return 'Not eligible';
    const groups = groupsOf(r);
    if (groups.length === 0) return '—';
    if (groups.length === allGroupCodes.length) return 'Any one category (student picks)';
    const names = groups.map((g) => groupName.get(g) ?? g);
    // Several groups: the student picks one of THESE (2026-09-08).
    return names.length === 1 ? names[0]! : `${names.join(' or ')} (student picks one)`;
  };
  const offeredLabel = (r: RuleCourse): string =>
    r.typicallyOffered ? (OFFERED_LABEL[r.typicallyOffered] ?? r.typicallyOffered) : '—';
  const counts = (r: RuleCourse, program: 'mscse' | 'phd'): boolean => {
    const c = program === 'mscse' ? r.countsTowardMscse : r.countsTowardPhd;
    return c === 'yes' || c === 'dgs_approval';
  };
  const hoverText = (r: RuleCourse): string => {
    const parts: string[] = [];
    if (r.notes) parts.push(r.notes);
    const versions = rules.courses.get(r.courseId) ?? [];
    if (versions.length > 1) {
      parts.push(
        `This course has ${versions.length} rule versions (effective ${versions
          .map((v) => (v.effectiveTerm ? termLabel(v.effectiveTerm) : 'always'))
          .join(', ')}); the one in effect for ${termLabel(currentTerm)} is shown.`,
      );
    }
    if (!r.active) parts.push('Retired: no longer offered, still recognized for students who took it.');
    return parts.join(' ');
  };

  // Spacing-insensitive search (usability review 2026-09-05, item 26):
  // "CSE20110", "cse 20110" and "20110" all find CSE 20110.
  const squash = (text: string): string => text.toLowerCase().replace(/\s+/g, '');

  function visibleRows(): RuleCourse[] {
    const q = filters.query.trim().toLowerCase();
    const qs = squash(q);
    let list = rows.filter((r) => {
      if (!filters.includeRetired && !r.active) return false;
      if (filters.confirmedOnly && !r.dgsReviewed) return false;
      if (filters.program !== 'all' && !counts(r, filters.program)) return false;
      if (filters.core && r.coreArea !== filters.core) return false;
      if (filters.category) {
        // A course listed under several groups matches each of them, and one
        // listed under every group matches whichever is chosen (DGS
        // 2026-09-08: there is no separate "every category" filter).
        if (!groupsOf(r).includes(filters.category)) return false;
      }
      if (filters.type && r.courseType !== filters.type) return false;
      // On the schedule this semester / next (DGS 2026-09-09). Only a `yes`
      // qualifies: a blank cell means the sheet has not said, which is never
      // read as a promise either way.
      if (filters.offered === 'now' && r.offeredNow !== true) return false;
      if (filters.offered === 'next' && r.offeredNext !== true) return false;
      if (q && !squash(r.courseId).includes(qs) && !r.title.toLowerCase().includes(q)) return false;
      return true;
    });
    // A row with nothing in the sorted column belongs at the END. `undefined`
    // says so; a '~' sentinel does NOT, because localeCompare orders
    // punctuation BEFORE letters and put every blank row first (2026-09-08).
    const key = (r: RuleCourse): string | undefined => {
      switch (filters.sort) {
        case 'title':
          return r.title.toLowerCase();
        case 'type':
          return TYPE_LABEL[r.courseType];
        case 'mscse':
          return countsLabel(r.countsTowardMscse);
        case 'phd':
          return countsLabel(r.countsTowardPhd);
        case 'core':
          return r.coreArea ? coreLabel(r) : undefined;
        case 'category':
          return groupsOf(r).length > 0 || r.categoryIneligible ? categoryLabel(r) : undefined;
        case 'offered':
          return r.typicallyOffered ? offeredLabel(r) : undefined;
        case 'reviewed':
          return r.dgsReviewed ? 'a' : 'b';
        default:
          return r.courseId;
      }
    };
    list = list.sort((a, b) => {
      const ka = key(a);
      const kb = key(b);
      if (ka === undefined || kb === undefined) {
        if (ka !== kb) return ka === undefined ? 1 : -1; // blanks last, in both directions
      } else if (ka !== kb) return ka.localeCompare(kb);
      return a.courseId.localeCompare(b.courseId);
    });
    if (filters.desc) list.reverse();
    return list;
  }

  // ---------- page pieces ----------

  function masthead(): HTMLElement {
    return el(
      'header',
      { class: 'masthead' },
      el(
        'div',
        { class: 'masthead-main' },
        el('div', { class: 'eyebrow' }, 'University of Notre Dame · Computer Science and Engineering'),
        el('h1', { tabindex: '-1' }, 'Graduate Course Rules'),
        el(
          'p',
          { class: 'sub' },
          el('strong', {}, 'Official course rules. '),
          'These mappings are set by the Graduate Studies Committee and the DGS under the ',
          handbookLink(),
          ', and they are what the DGS and the Grad Admin use to decide whether a student’s courses satisfy the degree requirements. The ',
          el('a', { href: './index.html' }, 'degree self-check tool'),
          ' applies these same rules to your own coursework.',
        ),
        el('p', { class: 'effective' }, rulesDateLine(rules, termLabel(currentTerm), todayIso)),
        // The rules spreadsheet, linked with its faculty-only note (DGS, 2026-09-04).
        sheetSourceLine(),
      ),
      contactCard(),
    );
  }

  function notices(): HTMLElement[] {
    const out: HTMLElement[] = [
      el(
        'div',
        { class: 'banner official', role: 'note' },
        'Rows marked ',
        el('span', { class: 'pill pending' }, 'Pending'),
        ' are still under DGS review and may change. ',
        el('strong', {}, 'Not every course listed is currently offered: '),
        'even an active (non-retired) course may run only in some semesters, or not at all in a given year — the “Typically offered” column is a planning hint, so check the class search for the actual schedule. Retired courses are hidden unless you tick “Include retired courses”. Where this page and the handbook disagree, the handbook and the DGS decide.',
        ...reportToDgs(' Corrections and questions — please email'),
      ),
    ];
    if (rules.source === 'snapshot') {
      out.push(
        el(
          'div',
          { class: 'banner' },
          `You chose to continue with the copy of the rules saved on ${rules.syncedAt.slice(0, 10)} because the live spreadsheet could not be loaded — recent DGS edits may be missing. Reload the page to try the live spreadsheet again.`,
        ),
      );
    }
    return out;
  }

  /** Quick view: core areas and specialization categories with their courses. */
  /** What is running this semester and next — two cards, from the Courses
   * tab's `offered_now` / `offered_next` (DGS 2026-09-09). A column with no
   * `yes` anywhere has not been published yet, and the card says so rather
   * than showing an empty list, which would read as "nothing is offered". */
  function scheduleSection(): HTMLElement {
    const live = rows.filter((r) => r.active);
    // Every attribute the table carries except the three the DGS left out
    // (2026-09-09): "Typically offered" (a pattern from past years, which
    // these cards supersede), "DGS reviewed" (the * beside a course id says
    // it) and the notes (a per-row disclosure in the table below).
    const pill = (c: Counts | undefined) => el('span', { class: `pill ${countsClass(c)}` }, countsLabel(c));
    const miniTable = (items: RuleCourse[], label: string): HTMLElement =>
      el(
        'div',
        { class: 'table-scroll plain', tabindex: '0', role: 'region', 'aria-label': `${label} (scrolls sideways on narrow screens)` },
        el(
          'table',
          { class: 'course-rules schedule-table' },
          el(
            'thead',
            {},
            el(
              'tr',
              {},
              el('th', { scope: 'col' }, 'Course'),
              el('th', { scope: 'col' }, 'Title'),
              el('th', { scope: 'col' }, 'Type'),
              el('th', { scope: 'col', abbr: 'MSCSE degree credit' }, 'MSCSE'),
              el('th', { scope: 'col', abbr: 'Ph.D. degree credit' }, 'Ph.D.'),
              el('th', { scope: 'col', abbr: 'Core knowledge, Ph.D. qualifying exam §4.4.1' }, 'Core'),
              el('th', { scope: 'col', abbr: 'Specialization, Ph.D. qualifying exam §4.4.2' }, 'Specialization'),
            ),
          ),
          el(
            'tbody',
            {},
            ...items.map((r) =>
              el(
                'tr',
                {},
                el(
                  'th',
                  { scope: 'row', class: 'course-id' },
                  el('a', { href: `#${r.courseId.replace(' ', '-')}`, title: hoverText(r) || 'Jump to this course in the table' }, r.courseId),
                  r.dgsReviewed ? '' : ' *',
                ),
                el('td', { class: 'cell-title', 'data-label': 'Title' }, r.title),
                el('td', { 'data-label': 'Type' }, TYPE_LABEL[r.courseType]),
                el('td', { 'data-label': 'MSCSE degree credit' }, pill(r.countsTowardMscse)),
                el('td', { 'data-label': 'Ph.D. degree credit' }, pill(r.countsTowardPhd)),
                el('td', { class: r.coreArea ? '' : 'muted', 'data-label': 'Core knowledge (§4.4.1)' }, coreLabel(r)),
                el('td', { class: groupsOf(r).length === 0 && !r.categoryIneligible ? 'muted' : '', 'data-label': 'Specialization (§4.4.2)' }, categoryLabel(r)),
              ),
            ),
          ),
        ),
      );
    const card = (heading: string, offered: (r: RuleCourse) => boolean | undefined): HTMLElement => {
      // "Released" means the DGS has said something about this semester at
      // all — a yes or a no. Until then the list is not empty, it is unknown.
      const said = rows.some((r) => offered(r) !== undefined);
      const items = live.filter((r) => offered(r) === true);
      return el(
        'div',
        { class: 'ov-card' },
        el('h3', {}, heading),
        !said
          ? el('p', { class: 'muted small' }, 'Not released yet.')
          : items.length === 0
            ? el('span', { class: 'muted' }, 'No course is listed for this semester.')
            : miniTable(items, heading),
      );
    };
    return el(
      'section',
      { class: 'overview schedule-overview' },
      el('h2', {}, 'On the schedule'),
      el(
        'p',
        { class: 'muted' },
        'What the DGS has recorded as running in these two semesters. It is not the registrar’s class search — check there for times, seats and any late change. A course missing from a card is not listed as running; the “Typically offered” column in the table below is a pattern from past years, not this year’s schedule.',
      ),
      el('div', { class: 'ov-grid two' }, card(`Offered this semester — ${termLabel(currentTerm)}`, (r) => r.offeredNow), card(`Offered next semester — ${termLabel(nextTeachingTerm)}`, (r) => r.offeredNext)),
      // The asterisk explains a mark that only appears beside a listed course.
      ...(scheduleKnown ? [el('p', { class: 'muted small' }, '* Pending DGS confirmation. Retired courses are never shown here.')] : []),
    );
  }

  function overview(): HTMLElement {
    const live = rows.filter((r) => r.active);
    const item = (r: RuleCourse): HTMLElement =>
      el(
        'a',
        { class: `ov-item${r.dgsReviewed ? '' : ' pending'}`, href: `#${r.courseId.replace(' ', '-')}`, title: hoverText(r) || 'Jump to this course in the table' },
        el('span', { class: 'cid' }, r.courseId, r.dgsReviewed ? '' : ' *'),
        el('span', { class: 'ctitle' }, r.title),
      );
    const listFor = (pick: (r: RuleCourse) => boolean): HTMLElement => {
      const items = live.filter(pick);
      return items.length === 0
        ? el('span', { class: 'muted' }, 'No course assigned yet.')
        : el('div', { class: 'ov-list' }, ...items.map(item));
    };
    const coreCards = rules.coreAreas.map((c) =>
      el('div', { class: 'ov-card' }, el('h3', {}, c.name), listFor((r) => r.coreArea === c.code)),
    );
    // A course listed under several groups — or under every group — belongs
    // in each of their cards (DGS 2026-09-08). The note above the cards says
    // that it can still fill only one of them.
    const groupCards = rules.categoryGroups.map((g) =>
      el('div', { class: 'ov-card' }, el('h3', {}, g.name), listFor((r) => groupsOf(r).includes(g.code))),
    );
    return el(
      'section',
      { class: 'overview' },
      el('h2', {}, 'Ph.D. Qualifying Examination courses ', el('span', { class: 'cite' }, '§4.4')),
      el(
        'p',
        { class: 'muted' },
        'Core knowledge and specialization are the two course-based requirements of the Ph.D. Qualifying Examination (§4.4) — they apply to Ph.D. students only, and MSCSE students can ignore these groupings. Whether a course counts toward degree credit is a separate question, answered in the table below.',
      ),
      el('h3', { class: 'ov-sub' }, 'Core knowledge areas ', el('span', { class: 'cite' }, '§4.4.1')),
      // §4.4.1: "All PhD students are required to pass (or have previously passed) an
      // Operating Systems course, an Algorithms course, and a Computer Architecture
      // course, either at Notre Dame or at their previous institution." — prior
      // coursework of any level counts (DGS clarification 2026-09-05; decision 2026-09-01).
      el(
        'p',
        { class: 'muted' },
        'The core-knowledge requirement can be met by the Notre Dame courses listed here ',
        el('strong', {}, 'or by prior coursework at a previous institution — undergraduate or graduate'),
        ' (§4.4.1: “either at Notre Dame or at their previous institution”). A course from a previous institution counts once the DGS has confirmed it; the ',
        el('a', { href: './index.html' }, 'degree self-check tool'),
        ' prepares that review request from your imported transcripts.',
      ),
      el('div', { class: 'ov-grid' }, ...coreCards),
      el('h3', { class: 'ov-sub' }, 'Specialization categories ', el('span', { class: 'cite' }, '§4.4.2')),
      // §4.4.2 asks for three courses from three DISTINCT categories, so a
      // course that appears in several cards is still worth only one of them
      // (DGS 2026-09-08).
      el(
        'p',
        { class: 'muted' },
        `${catRule.charAt(0).toUpperCase()}${catRule.slice(1)} (§4.4.2). A course may be listed under more than one category, and it then appears in each of their cards below — but it can fill only `,
        el('strong', {}, 'one'),
        ' of them, never several. The student chooses which one when they enter the course in the ',
        el('a', { href: './index.html' }, 'degree self-check tool'),
        '.',
      ),
      el('div', { class: 'ov-grid' }, ...groupCards),
      el('p', { class: 'muted small' }, '* Pending DGS confirmation. Retired courses are not shown here; tick "Include retired courses" in the table below to see them.'),
    );
  }

  /** Visible labels above every filter (usability review 2026-09-05, item 26)
   * — an aria-label alone told sighted users nothing once a value was chosen. */
  const labelled = (label: string, control: HTMLElement, id: string): HTMLElement => {
    control.id = id;
    return el('div', { class: 'filter' }, el('label', { class: 'label', for: id }, label), control);
  };
  const defaultFilters = (): Filters => ({ ...DEFAULTS });
  const filtersActive = (): boolean => {
    const d = defaultFilters();
    return (['query', 'program', 'core', 'category', 'type', 'offered', 'includeRetired', 'confirmedOnly', 'view'] as const).some((k) => filters[k] !== d[k]);
  };
  const filterHost = el('div', { class: 'filter-host' });
  let clearButton: HTMLElement | undefined;

  function filterBar(): HTMLElement {
    // "What are you checking?" (item 30) — picks the columns; a degree view
    // also narrows the Program filter to that degree unless the reader
    // changes it back.
    const view = el('select', {
      'data-key': 'filter.view',
      onchange: (e) => {
        const v = (e.target as HTMLSelectElement).value as View;
        filters.view = v;
        if (v === 'mscse' || v === 'phd') filters.program = v;
        if (v === 'all' || v === 'qualifier') filters.program = 'all';
        clear(filterHost);
        filterHost.append(filterBar());
        refreshTable();
        filterHost.querySelector<HTMLElement>('[data-key="filter.view"]')?.focus();
      },
    });
    for (const [k, label] of Object.entries(VIEW_LABEL)) view.append(option(k, label, filters.view === k));
    const search = el('input', {
      type: 'search',
      'data-key': 'filter.search',
      value: filters.query,
      oninput: (e) => {
        filters.query = (e.target as HTMLInputElement).value;
        refreshTable();
      },
    });
    const program = el('select', {
      'data-key': 'filter.program',
      onchange: (e) => {
        filters.program = (e.target as HTMLSelectElement).value as Filters['program'];
        refreshTable();
      },
    });
    program.append(
      option('all', 'All courses', filters.program === 'all'),
      option('mscse', 'Counts toward MSCSE', filters.program === 'mscse'),
      option('phd', 'Counts toward Ph.D.', filters.program === 'phd'),
    );
    const core = el('select', {
      'data-key': 'filter.core',
      onchange: (e) => {
        filters.core = (e.target as HTMLSelectElement).value;
        refreshTable();
      },
    });
    core.append(option('', 'Any core area', filters.core === ''));
    for (const c of rules.coreAreas) core.append(option(c.code, `Core: ${c.name}`, filters.core === c.code));
    const category = el('select', {
      'data-key': 'filter.category',
      onchange: (e) => {
        filters.category = (e.target as HTMLSelectElement).value;
        refreshTable();
      },
    });
    category.append(option('', 'Any specialization', filters.category === ''));
    for (const g of rules.categoryGroups) category.append(option(g.code, `Specialization: ${g.name}`, filters.category === g.code));
    const type = el('select', {
      'data-key': 'filter.type',
      onchange: (e) => {
        filters.type = (e.target as HTMLSelectElement).value;
        refreshTable();
      },
    });
    type.append(option('', 'Any course type', filters.type === ''));
    for (const [code, label] of Object.entries(TYPE_LABEL)) type.append(option(code, label, filters.type === code));
    // On the schedule now / next (DGS 2026-09-09). The control appears only
    // once the sheet says something: with every cell blank it could only ever
    // return nothing, and a filter that cannot work is worse than no filter.
    const offered = el('select', {
      'data-key': 'filter.offered',
      onchange: (e) => {
        filters.offered = (e.target as HTMLSelectElement).value as Filters['offered'];
        refreshTable();
      },
    });
    offered.append(
      option('', 'Any semester', filters.offered === ''),
      option('now', `Offered this semester (${termLabel(currentTerm)})`, filters.offered === 'now'),
      option('next', `Offered next semester (${termLabel(nextTeachingTerm)})`, filters.offered === 'next'),
    );
    const retired = el('input', {
      type: 'checkbox',
      'data-key': 'filter.retired',
      onchange: (e) => {
        filters.includeRetired = (e.target as HTMLInputElement).checked;
        refreshTable();
      },
    });
    (retired as HTMLInputElement).checked = filters.includeRetired;
    const confirmed = el('input', {
      type: 'checkbox',
      'data-key': 'filter.confirmed',
      onchange: (e) => {
        filters.confirmedOnly = (e.target as HTMLInputElement).checked;
        refreshTable();
      },
    });
    (confirmed as HTMLInputElement).checked = filters.confirmedOnly;
    // On phones the table becomes cards and its sortable headers are hidden,
    // so sorting moves into the filter bar (shown only there by CSS).
    const SORT_LABELS: Record<SortKey, string> = {
      course: 'Course number',
      title: 'Title',
      type: 'Type',
      mscse: 'MSCSE degree credit',
      phd: 'Ph.D. degree credit',
      core: 'Core knowledge',
      category: 'Specialization',
      offered: 'Typically offered',
      reviewed: 'DGS reviewed',
    };
    const sortSel = el('select', {
      'data-key': 'filter.sort',
      onchange: (e) => {
        filters.sort = (e.target as HTMLSelectElement).value as SortKey;
        refreshTable();
      },
    });
    for (const [k, label] of Object.entries(SORT_LABELS)) sortSel.append(option(k, label, filters.sort === k));
    const descBox = el('input', {
      type: 'checkbox',
      'data-key': 'filter.desc',
      onchange: (e) => {
        filters.desc = (e.target as HTMLInputElement).checked;
        refreshTable();
      },
    });
    (descBox as HTMLInputElement).checked = filters.desc;
    clearButton = el(
      'button',
      {
        class: 'btn tiny clear-filters',
        'data-key': 'filter.clear',
        onclick: () => {
          Object.assign(filters, defaultFilters());
          clear(filterHost);
          filterHost.append(filterBar());
          refreshTable();
          filterHost.querySelector<HTMLElement>('[data-key="filter.search"]')?.focus();
        },
      },
      'Clear filters',
    );
    clearButton.classList.toggle('hidden', !filtersActive());
    return el(
      'div',
      { class: 'filters', role: 'search', 'aria-label': 'Filter the course list' },
      el('div', { class: 'filter view-filter' }, labelled('What are you checking?', view, 'filter-view')),
      labelled('Search by course number or title', search, 'filter-search'),
      labelled('Program', program, 'filter-program'),
      labelled('Core knowledge area', core, 'filter-core'),
      labelled('Specialization category', category, 'filter-category'),
      labelled('Course type', type, 'filter-type'),
      ...(scheduleKnown ? [labelled('On the schedule', offered, 'filter-offered')] : []),
      el('label', { class: 'check' }, retired, ' Include retired courses'),
      el('label', { class: 'check' }, confirmed, ' Only DGS-confirmed rows'),
      el('div', { class: 'filter mobile-only' }, labelled('Sort by', sortSel, 'filter-sort'), el('label', { class: 'check' }, descBox, ' Descending')),
      clearButton,
    );
  }

  const tableHost = el('div', { class: 'table-host' });
  /** The result count is a live region created ONCE (a re-created region is
   * not announced): screen-reader users hear "18 of 176 courses shown" after
   * each filter change (WCAG 4.1.3; usability review 2026-09-05, item 26). */
  const countLine = el('p', { class: 'muted small count', role: 'status', 'aria-live': 'polite' });

  function refreshTable(): void {
    // Keep keyboard focus on the sort button that was pressed (the table is
    // rebuilt on every sort and filter change).
    const focused = (document.activeElement as HTMLElement | null)?.dataset['key'];
    clear(tableHost);
    tableHost.append(table());
    if (focused?.startsWith('sort.')) tableHost.querySelector<HTMLElement>(`[data-key="${focused}"]`)?.focus();
    clearButton?.classList.toggle('hidden', !filtersActive());
    filtersToUrl(filters, DEFAULTS);
  }

  function table(): HTMLElement {
    const list = visibleRows();
    // Sortable headers expose their state (aria-sort) and say what pressing
    // them does (usability review 2026-09-05, item 26).
    const th = (key: SortKey, label: string, sub = ''): HTMLElement => {
      const active = filters.sort === key;
      const direction = filters.desc ? 'descending' : 'ascending';
      return el(
        'th',
        { scope: 'col', 'aria-sort': active ? direction : 'none' },
        el(
          'button',
          {
            class: `sort${active ? ' active' : ''}`,
            'data-key': `sort.${key}`,
            onclick: () => {
              if (filters.sort === key) filters.desc = !filters.desc;
              else {
                filters.sort = key;
                filters.desc = false;
              }
              refreshTable();
            },
            'aria-label': active ? `${label} — sorted ${direction}; press to reverse` : `${label} — press to sort by it`,
          },
          label,
          active ? (filters.desc ? ' ▼' : ' ▲') : '',
          sub ? el('span', { class: 'th-sub' }, sub) : '',
        ),
      );
    };
    const head = el(
      'tr',
      {},
      th('course', 'Course'),
      th('title', 'Title'),
      th('type', 'Type'),
      th('mscse', 'MSCSE', 'degree credit'),
      th('phd', 'Ph.D.', 'degree credit'),
      th('core', 'Core knowledge', 'Ph.D. qualifying exam §4.4.1'),
      th('category', 'Specialization', 'Ph.D. qualifying exam §4.4.2'),
      th('offered', 'Typically offered'),
      th('reviewed', 'DGS reviewed'),
      el('th', { scope: 'col' }, 'Notes'),
    );
    const body = el('tbody', {});
    // A filter that matches nothing used to render nothing, and silence reads
    // as "this course does not count" — the opposite of the project's rule
    // never to guess (2026-09-08).
    if (list.length === 0) {
      body.append(
        el(
          'tr',
          { class: 'empty-row' },
          el(
            'td',
            { colspan: '10' },
            el('strong', {}, 'No course here matches these filters. '),
            'A course that is not listed on this page has not been decided by the DGS — do not read its absence as “does not count”. ',
            'The degree self-check tool prepares the review request that asks for a decision.',
          ),
        ),
      );
    }
    for (const r of list) {
      const pillCounts = (c: Counts | undefined) => el('span', { class: `pill ${countsClass(c)}` }, countsLabel(c));
      const catClass = groupsOf(r).length === 0 ? 'muted' : '';
      // The DGS's notes were hover-only (a title tooltip — unreachable by
      // keyboard and touch; usability review 2026-09-05, item 24): now a
      // disclosure button opens a note row under the course.
      const note = hoverText(r);
      const rowId = r.courseId.replace(' ', '-');
      const noteRow = note ? el('tr', { class: 'note-row hidden', id: `${rowId}-notes` }, el('td', { colspan: '10' }, el('strong', {}, 'DGS notes: '), note)) : null;
      const notesButton = note
        ? el(
            'button',
            {
              class: 'btn tiny notes',
              'aria-label': `Notes for ${r.courseId}`,
              'aria-expanded': 'false',
              'aria-controls': `${rowId}-notes`,
              'data-key': `notes.${rowId}`,
              onclick: () => {
                const open = noteRow!.classList.toggle('hidden') === false;
                notesButton!.setAttribute('aria-expanded', open ? 'true' : 'false');
              },
            },
            'Notes',
          )
        : null;
      body.append(
        el(
          'tr',
          { id: rowId, class: r.active ? '' : 'retired' },
          el('th', { scope: 'row', class: 'course-id' }, r.courseId, r.active ? '' : el('span', { class: 'pill retired' }, 'Retired')),
          el('td', { class: 'cell-title' }, r.title),
          el('td', { 'data-label': 'Type' }, TYPE_LABEL[r.courseType]),
          el('td', { 'data-label': 'MSCSE degree credit' }, pillCounts(r.countsTowardMscse)),
          el('td', { 'data-label': 'Ph.D. degree credit' }, pillCounts(r.countsTowardPhd)),
          el('td', { class: r.coreArea ? '' : 'muted', 'data-label': 'Core knowledge (§4.4.1)' }, coreLabel(r)),
          el('td', { class: catClass, 'data-label': 'Specialization (§4.4.2)' }, categoryLabel(r)),
          el('td', { class: r.typicallyOffered ? '' : 'muted', 'data-label': 'Typically offered' }, offeredLabel(r)),
          el(
            'td',
            { 'data-label': 'DGS reviewed' },
            r.dgsReviewed ? el('span', { class: 'pill yes' }, '✓ Confirmed') : el('span', { class: 'pill pending' }, 'Pending'),
          ),
          el('td', { class: 'notes-cell' }, notesButton ?? el('span', { class: 'muted no-notes' }, '—')),
        ),
      );
      if (noteRow) body.append(noteRow);
    }
    // Column visibility for the chosen view (item 30): a class on each hidden
    // header and cell, so the card layout on phones hides the same fields.
    const hidden = new Set(HIDDEN_COLUMNS[filters.view]);
    if (hidden.size > 0) {
      for (const tr of [head, ...body.querySelectorAll('tr:not(.note-row):not(.empty-row)')]) {
        Array.from(tr.children).forEach((cell, i) => {
          if (hidden.has(i + 1)) cell.classList.add('col-hidden');
        });
      }
    }
    const shown = rows.filter((r) => filters.includeRetired || r.active).length;
    // The view label keeps its case ("M.S. (MSCSE)", "Ph.D." — lower-casing it
    // read "m.s. (mscse)", found live 2026-09-06); its first letter is lowered
    // to sit inside the sentence.
    const viewLabel = VIEW_LABEL[filters.view];
    countLine.textContent = `${list.length} of ${shown} courses shown.${filtersActive() ? ' Filters are active.' : ''}${filters.view !== 'all' ? ` View: ${viewLabel.charAt(0).toLowerCase()}${viewLabel.slice(1)}.` : ''}`;
    return el(
      'div',
      {},
      countLine,
      // The scroll wrapper is keyboard-focusable and named, so a keyboard
      // user can scroll a wide table (WCAG 2.1.1; item 26).
      el(
        'div',
        { class: 'table-scroll', tabindex: '0', role: 'region', 'aria-label': 'Course rules table (scrolls sideways on narrow screens)' },
        el(
          'table',
          { class: 'course-rules' },
          el('caption', { class: 'visually-hidden' }, 'Courses and how they count toward the CSE graduate requirements'),
          el('thead', {}, head),
          body,
        ),
      ),
    );
  }

  /** The legend now precedes the table (usability review 2026-09-05, item
   * 26 — users met "Pending" before its definition): a one-line key that is
   * always visible, and the full column guide in a disclosure. */
  function legend(): HTMLElement {
    const li = (term: string | Node, text: string) => el('li', {}, term, ' — ', text);
    const key = el(
      'p',
      { class: 'legend-key muted small' },
      'Key: ',
      el('span', { class: 'pill yes' }, 'Yes'),
      ' counts · ',
      el('span', { class: 'pill approval' }, 'With DGS approval'),
      ' counts only with approval · ',
      el('span', { class: 'pill no' }, 'No'),
      ' does not count · ',
      el('span', { class: 'pill undecided' }, 'Not yet decided'),
      ' ask first · ',
      el('span', { class: 'pill pending' }, 'Pending'),
      ' row not yet confirmed by the DGS.',
    );
    const details = el('details', { class: 'legend' });
    details.append(
      el('summary', {}, 'How to read the columns'),
      el(
        'ul',
        {},
        li(el('strong', {}, 'Type'), 'only regular courses count toward the 24 regular-course credits (§3.2, §4.2); seminars, research, independent study and project credits count toward the total only.'),
        li(el('span', { class: 'pill yes' }, 'Yes'), 'counts toward that degree.'),
        li(el('span', { class: 'pill approval' }, 'With DGS approval'), 'counts only with the advisor’s and the DGS’s approval (for example CSE 40000-level courses, up to the 6-credit cap).'),
        li(el('span', { class: 'pill no' }, 'No'), 'does not count toward that degree.'),
        li(el('span', { class: 'pill undecided' }, 'Not yet decided'), 'the DGS has not ruled on this course yet; ask before relying on it.'),
        li(el('strong', {}, 'Core knowledge'), 'a Ph.D. Qualifying Examination requirement (§4.4.1): the core-knowledge area (Operating Systems, Algorithms, Computer Architecture) the course satisfies. The requirement can also be met by an equivalent course passed at a previous institution — undergraduate or graduate — once the DGS confirms it. Ph.D. students only — not part of any MSCSE requirement.'),
        li(
          el('strong', {}, 'Specialization'),
          `the other course-based Qualifying Examination requirement (§4.4.2): ${catRule}. A course listed under more than one category can fill only one of them. "Not eligible" marks courses that can never satisfy it. Ph.D. students only — not part of any MSCSE requirement.`,
        ),
        li(el('strong', {}, 'Typically offered'), 'a planning hint from past schedules, not a promise — check the class search for the actual term.'),
        ...(scheduleKnown
          ? [
              li(
                el('strong', {}, 'On the schedule'),
                `a filter rather than a column: it lists the courses the DGS has marked as running in ${termLabel(currentTerm)} or in ${termLabel(nextTeachingTerm)}. A course with nothing recorded is simply not listed — that is not a statement that it will not run. Unlike "Typically offered", which is a pattern from past years, this is the DGS's word on these two semesters.`,
              ),
            ]
          : []),
        li(el('span', { class: 'pill pending' }, 'Pending'), 'the DGS has not yet confirmed this row; treat it as provisional.'),
        li(el('strong', {}, 'Notes'), 'the DGS’s notes on a course, and older rule versions — open with the Notes button on its row.'),
      ),
    );
    return el('div', { class: 'legend-block' }, key, details);
  }

  function footer(): HTMLElement {
    return el(
      'footer',
      { class: 'legal' },
      el(
        'div',
        {},
        el('strong', {}, 'Source. '),
        // Where the data come from and who can open the sheet (DGS, 2026-09-04;
        // shortened the same day — the handbook link now sits inside the note).
        ...sheetSourceNote('courses'),
        ' Where this page and the handbook disagree, the handbook and the DGS decide.',
      ),
      el(
        'div',
        { class: 'legal-license' },
        el('strong', {}, 'License. '),
        '© 2026 University of Notre Dame du Lac. Free for non-commercial (academic and research) use; commercial use requires a license from Notre Dame’s IDEA Center (',
        mailto('softwarelicensing@nd.edu'),
        '). Full terms: ',
        el('a', { href: LICENSE_URL, target: '_blank', rel: 'noopener noreferrer' }, 'LICENSE.md'),
        ' · source: ',
        el('a', { href: REPO_URL, target: '_blank', rel: 'noopener noreferrer' }, 'GitHub'),
        '. Questions about this page: ',
        mailto(DGS.email),
        '.',
      ),
    );
  }

  // ---------- assemble ----------

  clear(root);
  root.classList.add('courses-page');
  filterHost.append(filterBar());
  refreshTable();
  root.append(
    el('a', { class: 'skip-link', href: '#all-courses' }, 'Skip to the course list'),
    masthead(),
    el(
      'main',
      { id: 'main' },
      ...notices(),
      scheduleSection(),
      overview(),
      el('section', { class: 'all-courses', id: 'all-courses', tabindex: '-1' }, el('h2', {}, 'All courses'), filterHost, legend(), tableHost),
    ),
    footer(),
  );
}
