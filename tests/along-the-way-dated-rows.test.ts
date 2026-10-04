// The along-the-way MSCSE's 24 regular-course credits and a 50000-level
// course (DGS 2026-10-03, answering the question left open by
// P1-deadlines-20): "it may count after DGS approval if the sheet says
// 'dgs_approval'. I made it possible with approval for Fall 2026 only.
// Starting Spring 2027, I added another row to indicate that the course will
// not count towards regular course credits or total credits."
//
// The count is the Ph.D.'s own Notre Dame regular credits, so the
// counts_toward_phd column and its dated rows decide. The fixture carries
// only the Fall 2026 row of CSE 50502; this test appends the live sheet's
// Spring 2027 row ("no") to it rather than changing the shared fixture.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { rulesFromCsvTexts } from '../src/data/assemble.ts';
import { audit } from '../src/engine/audit.ts';
import type { CourseEntry, Term } from '../src/engine/types.ts';
import { fixtureCsvTexts } from './helpers.ts';
import { ndCourse, phdStudent } from './helpers/student.ts';

const texts = fixtureCsvTexts();
const SPRING_2027_ROW =
  'CSE 50502,Transition to Data Structures & Algorithms,5,3,3,3,regular,no,no,,ineligible,fall,yes,Fall 2026,Spring 2027,,,yes,"Fixture: the live sheet’s second row (DGS 2026-10-03): from Spring 2027 the bridge course counts toward nothing"';
const rules = rulesFromCsvTexts({ ...texts, courses: `${texts.courses.trimEnd()}\n${SPRING_2027_ROW}\n` }, { source: 'snapshot', syncedAt: '2026-10-03T00:00:00Z' });

const at = (courseId: string, term: Term, extra: Partial<CourseEntry> = {}): CourseEntry => ndCourse(courseId, { term, ...extra });
const SEVEN: CourseEntry[] = [
  at('CSE 60641', { season: 'fall', year: 2026 }),
  at('CSE 60111', { season: 'spring', year: 2027 }),
  at('CSE 60321', { season: 'spring', year: 2027 }),
  at('CSE 60427', { season: 'fall', year: 2027 }),
  at('CSE 60535', { season: 'fall', year: 2027 }),
  at('CSE 60762', { season: 'spring', year: 2028 }),
  at('CSE 60770', { season: 'fall', year: 2028 }),
];
const RESEARCH = at('CSE 98900', { season: 'fall', year: 2027 }, { credits: 6, grade: 'S' });
const run = (bridge: CourseEntry) => {
  const s = phdStudent({ gpa: 3.9, courses: [...SEVEN, bridge, RESEARCH], milestones: { candidacyPassed: '2029-04-15' } });
  const r = audit(s, rules, '2029-06-01');
  return {
    along: r.requirements.find((q) => q.id === 'phd.msAlongTheWay')!,
    line: r.courseLines.find((l) => l.courseId === 'CSE 50502')!,
    total: r.requirements.find((q) => q.id === 'phd.credits.total')!,
  };
};

describe('CSE 50502 and the along-the-way MSCSE, by the sheet’s dated rows (DGS 2026-10-03)', () => {
  it('Fall 2026 (dgs_approval), approved: counts inside §4.2’s allowance and completes the 24', () => {
    const { along, line } = run(at('CSE 50502', { season: 'fall', year: 2026 }, { dgsApproved: true }));
    assert.equal(line.mark, 'counts');
    assert.match(line.text, /uses the 50000-level allowance \(6 credits, §4\.2\)/);
    assert.equal(along.status, 'met');
    assert.match(along.detail, /Earned at Notre Dame: 24 regular-course credits and 6 research credits/);
  });

  it('Fall 2026, not yet approved: waits for the DGS and is not earned yet', () => {
    const { along, line } = run(at('CSE 50502', { season: 'fall', year: 2026 }));
    assert.equal(line.mark, 'pending');
    assert.equal(along.status, 'in_progress');
    assert.match(along.detail, /Earned at Notre Dame: 21 of 24 regular-course credits/);
  });

  it('Spring 2027 on ("no"): counts toward neither the regular credits nor the total, whatever is ticked', () => {
    const { along, line, total } = run(at('CSE 50502', { season: 'spring', year: 2027 }, { dgsApproved: true }));
    assert.equal(line.mark, 'excluded');
    assert.match(line.text, /^not counted — the course rules say it does not count toward the Ph\.D\./);
    assert.match(along.detail, /Earned at Notre Dame: 21 of 24 regular-course credits/);
    assert.match(total.detail, /^27 of 60 credits complete\./);
  });
});
