// What the parser must NOT let through silently — the cases the blue/red-team
// review of the course-rules page found on 2026-09-18, each of which used to
// change what students read with no diagnostic anywhere.
//
// The theme: the sheet is edited by hand, by a DGS, in a spreadsheet. A typo, a
// renamed column or a cell that says two things must produce a message in the
// diagnostics, not a quietly different page.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { rulesFromCsvTexts } from '../src/data/assemble.ts';
import { parseCategoriesTab, parseCoursesTab } from '../src/data/parse.ts';
import type { SheetIssue } from '../src/data/types.ts';
import { looksLikeEmail } from '../src/ui/contacts.ts';
import { formatYmdLong } from '../src/ui/handbook.ts';

const HEAD = 'course_id,title,course_type,counts_toward_mscse,counts_toward_phd,core_area,category_group,typically_offered,active,last_offered,rules_effective_term,offered_now,offered_next,dgs_reviewed,notes';
const row = (cells: Partial<Record<string, string>>): string =>
  HEAD.split(',')
    .map((h) => cells[h] ?? '')
    .join(',');
const parse = (csv: string): { courses: ReturnType<typeof parseCoursesTab>; issues: SheetIssue[] } => {
  const issues: SheetIssue[] = [];
  return { courses: parseCoursesTab(csv, issues), issues };
};
const messages = (issues: SheetIssue[]): string => issues.map((i) => i.message).join(' | ');

describe('a Courses column that has been renamed or deleted (R-4)', () => {
  it('is reported by name, for every column the app reads', () => {
    const csv = [HEAD.replace('counts_toward_phd', 'phd_counts'), row({ course_id: 'CSE 60641', title: 'Graduate Operating Systems', course_type: 'regular', counts_toward_mscse: 'yes', active: 'yes' })].join('\n');
    const { courses, issues } = parse(csv);
    assert.equal(courses.length, 1, 'the rows still parse — only the column is gone');
    assert.equal(courses[0]!.countsTowardPhd, undefined);
    assert.match(messages(issues), /no 'counts_toward_phd' column/);
    assert.match(messages(issues), /read as if that cell were blank/);
  });
  it('accepts either spelling of the rules-effective column, and reports neither', () => {
    const old = HEAD.replace('rules_effective_term', 'effective_term');
    const { issues } = parse([old, row({ course_id: 'CSE 60641', course_type: 'regular', active: 'yes' })].join('\n'));
    assert.doesNotMatch(messages(issues), /effective_term/);
  });
  it('says nothing about extra columns the app does not read', () => {
    const { issues } = parse([HEAD + ',banner_crn', row({ course_id: 'CSE 60641', course_type: 'regular', active: 'yes' }) + ',12345'].join('\n'));
    assert.doesNotMatch(messages(issues), /column/);
  });
});

describe('cells whose case the DGS did not match (R-5)', () => {
  it("'No' retires a course, as 'no' does", () => {
    const { courses, issues } = parse([HEAD, row({ course_id: 'CSE 60641', course_type: 'regular', active: 'No' })].join('\n'));
    assert.equal(courses[0]!.active, false);
    assert.doesNotMatch(messages(issues), /is not yes\|no/);
  });
  it("'Regular' is a regular course, not a skipped row", () => {
    const { courses, issues } = parse([HEAD, row({ course_id: 'CSE 60641', course_type: 'Regular', active: 'yes' })].join('\n'));
    assert.equal(courses.length, 1);
    assert.equal(courses[0]!.courseType, 'regular');
    assert.doesNotMatch(messages(issues), /Row skipped/);
  });
  it('a word that is not a course type is still refused', () => {
    const { courses, issues } = parse([HEAD, row({ course_id: 'CSE 60641', course_type: 'lecture', active: 'yes' })].join('\n'));
    assert.equal(courses.length, 0);
    assert.match(messages(issues), /'lecture' is not one of/);
  });
});

describe('typically_offered is not free text (B-12)', () => {
  it('an unexpected value is dropped and reported, not printed in the column', () => {
    const { courses, issues } = parse([HEAD, row({ course_id: 'CSE 60641', course_type: 'regular', active: 'yes', typically_offered: 'constructor' })].join('\n'));
    assert.equal(courses[0]!.typicallyOffered, undefined);
    assert.match(messages(issues), /typically_offered: 'constructor' is not one of/);
  });
  it('the four words are kept, whatever their case', () => {
    const { courses, issues } = parse([HEAD, row({ course_id: 'CSE 60641', course_type: 'regular', active: 'yes', typically_offered: 'Both' })].join('\n'));
    assert.equal(courses[0]!.typicallyOffered, 'both');
    assert.equal(issues.length, 0);
  });
});

describe('cells that contradict each other', () => {
  const rules = (courses: string) =>
    rulesFromCsvTexts(
      { courses, parameters: 'key,value\ngpa_min,3.0\n', categories: 'core_area,core_area_name,,category_group,category_group_name\nos,Operating Systems,,alg,Algorithms\n' },
      { source: 'snapshot', syncedAt: '2026-09-18T00:00:00Z' },
    );
  it("'ineligible' beside a group code is reported, and ineligible wins (R-12)", () => {
    const r = rules([HEAD, row({ course_id: 'CSE 60641', course_type: 'regular', active: 'yes', category_group: 'alg; ineligible' })].join('\n'));
    assert.match(messages(r.issues), /says 'ineligible' AND names a group/);
  });
  it('retired AND marked as offered is reported (B-4)', () => {
    const r = rules([HEAD, row({ course_id: 'CSE 60641', course_type: 'regular', active: 'no', offered_now: 'yes', last_offered: 'Fall 2026' })].join('\n'));
    assert.match(messages(r.issues), /active is 'no' \(retired\) but offered_now is 'yes'/);
  });
});

describe('two Categories entries sharing a name (B-38)', () => {
  it('are reported, because the reader sees two identical headings', () => {
    const issues: SheetIssue[] = [];
    const out = parseCategoriesTab('core_area,core_area_name,,category_group,category_group_name\nalg,Algorithms,,alg,Algorithms\narch,Architecture,,algorithms,Algorithms\n', issues);
    assert.equal(out.categoryGroups.length, 2);
    assert.match(messages(issues), /share the name 'algorithms'/);
  });
});

describe('a date the DGS mistyped (R-23)', () => {
  it('is refused rather than rolled into a different, plausible date', () => {
    assert.equal(formatYmdLong('2026-09-31'), undefined, 'September has 30 days');
    assert.equal(formatYmdLong('2026-13-01'), undefined);
    assert.equal(formatYmdLong('2026-02-30'), undefined);
    assert.equal(formatYmdLong('2026-00-10'), undefined);
  });
  it('still reads a real date', () => {
    assert.equal(formatYmdLong('2026-09-01'), 'September 1, 2026');
    assert.equal(formatYmdLong('2028-02-29'), 'February 29, 2028', 'a leap day is a real date');
  });
});

describe('a contact address the sheet has mangled (R-20)', () => {
  it('is not turned into a mailto: link', () => {
    assert.equal(looksLikeEmail('tjung@nd.edu'), true);
    assert.equal(looksLikeEmail(' tjung@nd.edu '), true);
    assert.equal(looksLikeEmail('mailto:tjung@nd.edu'), false);
    assert.equal(looksLikeEmail('tjung at nd.edu'), false);
    assert.equal(looksLikeEmail('tjung@nd'), false);
    assert.equal(looksLikeEmail(''), false);
  });
});
