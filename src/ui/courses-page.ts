// The public course list: which CSE graduate courses count toward the MSCSE
// (§3) and Ph.D. (§4), which Ph.D. Qualifying Examination component each can
// satisfy — core knowledge (§4.4.1) or specialization category (§4.4.2), both
// parts of the §4.4 qualifying exam, not degree-credit tags — when it is
// typically offered, and whether the DGS has confirmed the row. Everything
// shown comes from the Courses tab of the rules sheet (via the same loader as
// the audit page); this file only presents it. No student data is involved.
import { resolveRuleRow } from '../data/assemble.ts';
import type { CourseType, Counts, RuleCourse, Rules } from '../data/types.ts';
import { termLabel, termOfDate } from '../engine/term.ts';
import { DGS, LICENSE_URL, REPO_URL, contactCard, mailto, reportToDgs } from './contacts.ts';
import { clear, el, option } from './dom.ts';
import { handbookLink, rulesDateLine } from './handbook.ts';

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

interface Filters {
  query: string;
  program: 'all' | 'mscse' | 'phd';
  core: string; // '' = any
  category: string; // '' = any
  type: string; // '' = any
  includeRetired: boolean;
  confirmedOnly: boolean;
  sort: SortKey;
  desc: boolean;
}

export function renderCoursesPage(root: HTMLElement, rules: Rules): void {
  const today = new Date();
  const p2 = (n: number) => String(n).padStart(2, '0');
  const todayIso = `${today.getFullYear()}-${p2(today.getMonth() + 1)}-${p2(today.getDate())}`;
  const currentTerm = termOfDate(todayIso);

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

  const filters: Filters = {
    query: '',
    program: 'all',
    core: '',
    category: '',
    type: '',
    includeRetired: false,
    confirmedOnly: false,
    sort: 'course',
    desc: false,
  };

  // ---------- helpers ----------

  const countsLabel = (c: Counts | undefined): string => (c ? COUNTS_LABEL[c] : 'Not yet decided');
  const countsClass = (c: Counts | undefined): string => (c ? COUNTS_CLASS[c] : 'undecided');
  const coreLabel = (r: RuleCourse): string => (r.coreArea ? (coreName.get(r.coreArea) ?? r.coreArea) : '—');
  const categoryLabel = (r: RuleCourse): string => {
    if (!r.categoryGroup) return '—';
    if (r.categoryGroup === 'any') return 'Any category (student picks)';
    if (r.categoryGroup === 'ineligible') return 'Not eligible';
    return groupName.get(r.categoryGroup) ?? r.categoryGroup;
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

  function visibleRows(): RuleCourse[] {
    const q = filters.query.trim().toLowerCase();
    let list = rows.filter((r) => {
      if (!filters.includeRetired && !r.active) return false;
      if (filters.confirmedOnly && !r.dgsReviewed) return false;
      if (filters.program !== 'all' && !counts(r, filters.program)) return false;
      if (filters.core && r.coreArea !== filters.core) return false;
      if (filters.category) {
        if (filters.category === 'any-listed') {
          if (r.categoryGroup !== 'any') return false;
        } else if (r.categoryGroup !== filters.category && r.categoryGroup !== 'any') return false;
      }
      if (filters.type && r.courseType !== filters.type) return false;
      if (q && !r.courseId.toLowerCase().includes(q) && !r.title.toLowerCase().includes(q)) return false;
      return true;
    });
    const key = (r: RuleCourse): string => {
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
          return r.coreArea ? coreLabel(r) : '~';
        case 'category':
          return r.categoryGroup && r.categoryGroup !== 'ineligible' ? categoryLabel(r) : '~';
        case 'offered':
          return r.typicallyOffered ? offeredLabel(r) : '~';
        case 'reviewed':
          return r.dgsReviewed ? 'a' : 'b';
        default:
          return r.courseId;
      }
    };
    list = list.sort((a, b) => key(a).localeCompare(key(b)) || a.courseId.localeCompare(b.courseId));
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
        el('h1', {}, 'Graduate Course Rules'),
        el(
          'p',
          { class: 'sub' },
          el('strong', {}, 'Official course rules. '),
          'These mappings are set by the Graduate Studies Committee and the Director of Graduate Studies under the ',
          handbookLink(),
          ', and they are what the DGS and the Graduate Program Administrator use to decide whether a student’s courses satisfy the degree requirements. The ',
          el('a', { href: './index.html' }, 'degree self-check tool'),
          ' applies these same rules to your own coursework.',
        ),
        el('p', { class: 'effective' }, rulesDateLine(rules, termLabel(currentTerm), todayIso)),
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
    const groupCards = rules.categoryGroups.map((g) =>
      el('div', { class: 'ov-card' }, el('h3', {}, g.name), listFor((r) => r.categoryGroup === g.code)),
    );
    const anyCard = el(
      'div',
      { class: 'ov-card' },
      el('h3', {}, 'Listed under every category'),
      el('p', { class: 'muted small' }, 'The student picks which one category the course fills.'),
      listFor((r) => r.categoryGroup === 'any'),
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
      el('div', { class: 'ov-grid' }, ...coreCards),
      el('h3', { class: 'ov-sub' }, 'Specialization categories ', el('span', { class: 'cite' }, '§4.4.2')),
      el('div', { class: 'ov-grid' }, ...groupCards, anyCard),
      el('p', { class: 'muted small' }, '* Pending DGS confirmation. Retired courses are not shown here; tick "Include retired courses" in the table below to see them.'),
    );
  }

  function filterBar(): HTMLElement {
    const search = el('input', {
      type: 'search',
      placeholder: 'Search by course number or title',
      'aria-label': 'Search courses',
      value: filters.query,
      oninput: (e) => {
        filters.query = (e.target as HTMLInputElement).value;
        refreshTable();
      },
    });
    const program = el('select', {
      'aria-label': 'Program',
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
      'aria-label': 'Core knowledge area',
      onchange: (e) => {
        filters.core = (e.target as HTMLSelectElement).value;
        refreshTable();
      },
    });
    core.append(option('', 'Any core area', filters.core === ''));
    for (const c of rules.coreAreas) core.append(option(c.code, `Core: ${c.name}`, filters.core === c.code));
    const category = el('select', {
      'aria-label': 'Specialization category',
      onchange: (e) => {
        filters.category = (e.target as HTMLSelectElement).value;
        refreshTable();
      },
    });
    category.append(option('', 'Any specialization', filters.category === ''));
    for (const g of rules.categoryGroups) category.append(option(g.code, `Specialization: ${g.name}`, filters.category === g.code));
    category.append(option('any-listed', 'Listed under every category', filters.category === 'any-listed'));
    const type = el('select', {
      'aria-label': 'Course type',
      onchange: (e) => {
        filters.type = (e.target as HTMLSelectElement).value;
        refreshTable();
      },
    });
    type.append(option('', 'Any course type', filters.type === ''));
    for (const [code, label] of Object.entries(TYPE_LABEL)) type.append(option(code, label, filters.type === code));
    const retired = el('input', {
      type: 'checkbox',
      onchange: (e) => {
        filters.includeRetired = (e.target as HTMLInputElement).checked;
        refreshTable();
      },
    });
    (retired as HTMLInputElement).checked = filters.includeRetired;
    const confirmed = el('input', {
      type: 'checkbox',
      onchange: (e) => {
        filters.confirmedOnly = (e.target as HTMLInputElement).checked;
        refreshTable();
      },
    });
    (confirmed as HTMLInputElement).checked = filters.confirmedOnly;
    return el(
      'div',
      { class: 'filters' },
      search,
      program,
      core,
      category,
      type,
      el('label', { class: 'check' }, retired, ' Include retired courses'),
      el('label', { class: 'check' }, confirmed, ' Only DGS-confirmed rows'),
    );
  }

  const tableHost = el('div', { class: 'table-host' });

  function refreshTable(): void {
    clear(tableHost);
    tableHost.append(table());
  }

  function table(): HTMLElement {
    const list = visibleRows();
    const th = (key: SortKey, label: string, sub = ''): HTMLElement => {
      const active = filters.sort === key;
      return el(
        'th',
        { scope: 'col' },
        el(
          'button',
          {
            class: `sort${active ? ' active' : ''}`,
            onclick: () => {
              if (filters.sort === key) filters.desc = !filters.desc;
              else {
                filters.sort = key;
                filters.desc = false;
              }
              refreshTable();
            },
            'aria-label': `Sort by ${label}`,
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
    );
    const body = el('tbody', {});
    for (const r of list) {
      const pillCounts = (c: Counts | undefined) => el('span', { class: `pill ${countsClass(c)}` }, countsLabel(c));
      const catClass = !r.categoryGroup ? 'muted' : r.categoryGroup === 'ineligible' ? 'muted' : '';
      body.append(
        el(
          'tr',
          { id: r.courseId.replace(' ', '-'), class: r.active ? '' : 'retired', title: hoverText(r) },
          el('td', { class: 'course-id' }, r.courseId, r.active ? '' : el('span', { class: 'pill retired' }, 'Retired')),
          el('td', {}, r.title),
          el('td', {}, TYPE_LABEL[r.courseType]),
          el('td', {}, pillCounts(r.countsTowardMscse)),
          el('td', {}, pillCounts(r.countsTowardPhd)),
          el('td', { class: r.coreArea ? '' : 'muted' }, coreLabel(r)),
          el('td', { class: catClass }, categoryLabel(r)),
          el('td', { class: r.typicallyOffered ? '' : 'muted' }, offeredLabel(r)),
          el(
            'td',
            {},
            r.dgsReviewed ? el('span', { class: 'pill yes' }, '✓ Confirmed') : el('span', { class: 'pill pending' }, 'Pending'),
          ),
        ),
      );
    }
    const caption = el(
      'p',
      { class: 'muted small count' },
      `${list.length} of ${rows.filter((r) => filters.includeRetired || r.active).length} courses shown. Hover a row for the DGS’s notes.`,
    );
    return el(
      'div',
      {},
      caption,
      el('div', { class: 'table-scroll' }, el('table', { class: 'course-rules' }, el('thead', {}, head), body)),
    );
  }

  function legend(): HTMLElement {
    const li = (term: string | Node, text: string) => el('li', {}, term, ' — ', text);
    return el(
      'section',
      { class: 'legend' },
      el('h2', {}, 'How to read the columns'),
      el(
        'ul',
        {},
        li(el('strong', {}, 'Type'), 'only regular courses count toward the 24 regular-course credits (§3.2, §4.2); seminars, research, independent study and project credits count toward the total only.'),
        li(el('span', { class: 'pill yes' }, 'Yes'), 'counts toward that degree.'),
        li(el('span', { class: 'pill approval' }, 'With DGS approval'), 'counts only with the advisor’s and the DGS’s approval (for example CSE 40000-level courses, up to the 6-credit cap).'),
        li(el('span', { class: 'pill no' }, 'No'), 'does not count toward that degree.'),
        li(el('span', { class: 'pill undecided' }, 'Not yet decided'), 'the DGS has not ruled on this course yet; ask before relying on it.'),
        li(el('strong', {}, 'Core knowledge'), 'a Ph.D. Qualifying Examination requirement (§4.4.1): the core-knowledge area (Operating Systems, Algorithms, Computer Architecture) the course satisfies. Ph.D. students only — not part of any MSCSE requirement.'),
        li(el('strong', {}, 'Specialization'), 'the other course-based Qualifying Examination requirement (§4.4.2): Ph.D. students need three courses from three distinct specialization categories with a B or higher. "Not eligible" marks courses (all 40000-level) that can never satisfy it. Ph.D. students only — not part of any MSCSE requirement.'),
        li(el('strong', {}, 'Typically offered'), 'a planning hint from past schedules, not a promise — check the class search for the actual term.'),
        li(el('span', { class: 'pill pending' }, 'Pending'), 'the DGS has not yet confirmed this row; treat it as provisional.'),
      ),
    );
  }

  function footer(): HTMLElement {
    return el(
      'footer',
      { class: 'legal' },
      el(
        'div',
        {},
        el('strong', {}, 'Source. '),
        'This page reads the Director of Graduate Studies’ official course-rules sheet each time it loads, so it always reflects the DGS’s latest decisions (Google republishes edits within a few minutes). Where this page and the ',
        handbookLink(),
        ' disagree, the handbook and the DGS decide.',
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
  refreshTable();
  root.append(
    masthead(),
    ...notices(),
    overview(),
    el('section', { class: 'all-courses' }, el('h2', {}, 'All courses'), filterBar(), tableHost),
    legend(),
    footer(),
  );
}
