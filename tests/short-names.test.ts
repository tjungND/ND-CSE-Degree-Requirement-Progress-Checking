// The short forms the DGS approved on 2026-09-08, and the line they must not
// cross. Two rules are easy to break by editing the list: the substitutions
// have to run longest-first, and shortening must stay OUT of the requirement
// titles, the handbook quotes and the copied emails.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { audit } from '../src/engine/audit.ts';
import { shortName } from '../src/engine/short-names.ts';
import type { CourseEntry, Student } from '../src/engine/types.ts';
import { buildRules } from './helpers.ts';

describe('short forms of the core-area and group names', () => {
  it('shortens every name the DGS listed', () => {
    assert.equal(shortName('Operating Systems'), 'OS');
    assert.equal(shortName('Operating System'), 'OS');
    assert.equal(shortName('Algorithms'), 'Alg');
    assert.equal(shortName('Algorithm'), 'Alg');
    assert.equal(shortName('Computer Architecture'), 'Comp Arch');
    assert.equal(shortName('Architecture'), 'Arch');
    assert.equal(shortName('Human Centered Computing'), 'HCC');
    assert.equal(shortName('Data Science and Artificial Intelligence'), 'DS/AI');
    assert.equal(shortName('Systems and Software'), 'Sys/Soft');
  });

  it('the longest name wins, so "Computer Architecture" never becomes "Computer Arch"', () => {
    assert.equal(shortName('Computer Architecture'), 'Comp Arch');
    assert.ok(!shortName('Computer Architecture').includes('Computer'));
  });

  it('an odd separator in the sheet does not defeat the longest-first order', () => {
    assert.equal(shortName('Computer  Architecture'), 'Comp Arch');
    assert.equal(shortName('Computer\u00a0Architecture'), 'Comp Arch');
    assert.equal(shortName('Human-Centered Computing'), 'HCC');
  });

  it('a name none of the forms match is left alone', () => {
    assert.equal(shortName('Quantum Computing'), 'Quantum Computing');
    assert.equal(shortName(''), '');
  });
});

const rules = buildRules();
const nd = (courseId: string, extra: Partial<CourseEntry> = {}): CourseEntry => ({
  courseId,
  credits: 3,
  term: { season: 'fall', year: 2026 },
  grade: 'A',
  origin: 'nd',
  ...extra,
});
const student = (courses: CourseEntry[]): Student => ({
  schemaVersion: 1,
  program: 'phd',
  entryTerm: { season: 'fall', year: 2026 },
  priorMs: 'none',
  gpa: 3.5,
  courses,
  milestones: {},
  attestations: {},
});

describe('where the short forms are used, and where they are not', () => {
  const report = audit(
    student([
      nd('CSE 60641', { title: 'Graduate Operating Systems' }),
      nd('CSE 60321', { title: 'Advanced Computer Architecture' }),
    ]),
    rules,
    '2027-03-01',
  );
  const row = (id: string) => report.requirements.find((r) => r.id === id);

  it('the "Counts Toward" chips are short', () => {
    const chips = report.courseLines.flatMap((l) => l.counts.map((c) => c.title));
    assert.ok(chips.includes('Core: OS'), JSON.stringify(chips));
    assert.ok(chips.includes('Core: Comp Arch'), JSON.stringify(chips));
    assert.ok(chips.includes('9 credits at ND'), JSON.stringify(chips));
    assert.ok(!chips.some((c) => /Notre Dame|Operating Systems|Computer Architecture/.test(c)), JSON.stringify(chips));
  });

  it('every chip still names a real requirement row', () => {
    const ids = new Set(report.requirements.map((r) => r.id));
    for (const line of report.courseLines) for (const c of line.counts) assert.ok(ids.has(c.id), c.id);
  });

  it('the requirement titles and the handbook quotes keep the full names', () => {
    assert.equal(row('phd.credits.nd')?.title, 'At least 9 credits taken at Notre Dame');
    assert.match(row('phd.credits.nd')?.citation?.quote ?? '', /Notre Dame/);
    const core = report.requirements.find((r) => r.id.startsWith('phd.qualifier.core.'));
    assert.match(core?.title ?? '', /Operating Systems|Algorithms|Computer Architecture/, String(core?.title));
    // The long name is what a chip's link points at, so the full title is
    // never lost — only the chip is short.
    const chip = report.courseLines.flatMap((l) => l.counts).find((c) => c.title === 'Core: OS');
    assert.match(chip?.long ?? '', /Operating Systems/, String(chip?.long));
  });

  it('the specialization row lists its groups short on the PAGE and full in the copied messages', () => {
    const s = student([
      nd('CSE 60427', { title: 'Human-Centered Computing' }),
      nd('CSE 60641', { title: 'Graduate Operating Systems' }),
    ]);
    const row = audit(s, rules, '2027-03-01').requirements.find((r) => r.id === 'phd.qualifier.categories');
    const flat = (p: unknown): string => (typeof p === 'string' ? p : `${(p as { lead: string }).lead}: ${(p as { items: string[] }).items.join('; ')}`);
    const onPage = (row?.shortDetailParts ?? []).map(flat).join(' | ');
    const inMessages = (row?.detailParts ?? []).map(flat).join(' | ');
    assert.match(onPage, /still open: .*DS\/AI/, onPage);
    assert.ok(!/Human Centered Computing|Data Science and Artificial Intelligence|Systems and Software/.test(onPage), onPage);
    // `detail` and `detailParts` are what advisorSummary and the Grad Admin
    // request re-voice — the DGS asked for those to stay spelled out.
    assert.match(inMessages, /Data Science and Artificial Intelligence/, inMessages);
    assert.match(row?.detail ?? '', /Data Science and Artificial Intelligence/, String(row?.detail));
    assert.equal(row?.shortDetailParts?.length, row?.detailParts?.length);
  });

  it('a course title inside the specialization list is never shortened, in either version', () => {
    const s = student([
      nd('CSE 60641', { title: 'Graduate Operating Systems' }),
      nd('CSE 60111', { title: 'Complexity and Algorithms' }),
      nd('CSE 60427', { title: 'Human-Centered Computing' }),
    ]);
    const row = audit(s, rules, '2027-03-01').requirements.find((r) => r.id === 'phd.qualifier.categories');
    assert.equal(row?.status, 'met', String(row?.detail));
    const items = [...(row?.detailParts ?? []), ...(row?.shortDetailParts ?? [])]
      .flatMap((p) => (typeof p === 'string' ? [p] : p.items))
      .filter((i) => i.startsWith('CSE 60641'));
    assert.ok(items.length >= 2, JSON.stringify(items));
    for (const i of items) assert.match(i, /CSE 60641 Graduate Operating Systems →/, i);
  });
});
