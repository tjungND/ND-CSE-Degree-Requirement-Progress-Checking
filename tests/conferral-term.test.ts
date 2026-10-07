// A Notre Dame degree conferred in January is the fall's degree (policy
// review round 3, P3-dh-front-1-2-1; DGS 2026-10-06: "Apply the suggested
// handling"). The Graduate School calendar: "Fall 2026 (January graduation),
// Spring 2027 (May graduation)"; "Graduation date (official degree
// conferral) Jan. 3 | May 15 | Aug. 1". The import read a January date as
// that year's spring, so an MSCSE finished in the fall and a Ph.D. begun the
// next spring looked like one program: the MSCSE start was proposed as the
// Ph.D. entry and every deadline came three semesters early.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { conferralTerm, termOfDate } from '../src/engine/term.ts';
import type { Student, Term } from '../src/engine/types.ts';
import { inferEntryTerm, type ParsedCourse } from '../src/transcript/parse.ts';
import { bachelorsAwardFrom } from '../src/ui/nd-upload.ts';
import { programHistory } from '../src/ui/program-history.ts';
import { audit } from '../src/engine/audit.ts';
import { buildRules } from './helpers.ts';
import { phdStudent } from './helpers/student.ts';

const t = (season: Term['season'], year: number): Term => ({ season, year });
const grad = (courseId: string, term: Term): ParsedCourse => ({ courseId, credits: 3, grade: 'A', term, origin: 'nd', level: 'graduate' });
const MSCSE_THEN_PHD = [grad('CSE 60641', t('fall', 2025)), grad('CSE 60111', t('spring', 2026)), grad('CSE 60321', t('fall', 2026)), grad('CSE 60427', t('spring', 2027))];
const MASTERS_JAN = [{ name: 'Master of Science', level: 'masters' as const, date: '2027-01-03' }];

describe('conferral dates (P3-dh-front-1-2-1)', () => {
  it('January is the fall before; May spring; August summer', () => {
    assert.deepEqual(conferralTerm('2027-01-03'), t('fall', 2026));
    assert.deepEqual(conferralTerm('2027-05-15'), t('spring', 2027));
    assert.deepEqual(conferralTerm('2027-08-01'), t('summer', 2027));
    assert.deepEqual(termOfDate('2027-01-03'), t('spring', 2027), 'today and course dates are unchanged');
  });
  it('admit terms Fall 2025 and Spring 2027, master’s conferred 03-JAN-2027: the Ph.D. entry is Spring 2027', () => {
    const r = inferEntryTerm({ courses: MSCSE_THEN_PHD, admitTerms: [t('fall', 2025), t('spring', 2027)], newStudentTerms: new Set(), degreesAwarded: MASTERS_JAN });
    assert.deepEqual(r?.term, t('spring', 2027));
  });
  it('the same transcript without admit-term lines still offers Spring 2027', () => {
    const r = inferEntryTerm({ courses: MSCSE_THEN_PHD, admitTerms: [], newStudentTerms: new Set(), degreesAwarded: MASTERS_JAN });
    assert.deepEqual(r?.alternative?.term, t('spring', 2027), JSON.stringify(r));
  });
  it('the emails’ program history says the MSCSE was awarded Fall 2026', () => {
    const s: Student = phdStudent({ entryTerm: t('spring', 2027), background: { bachelors: 'elsewhere', graduate: 'nd-mscse', finished: true }, ndDegrees: [{ level: 'masters', date: '2027-01-03' }] } as Partial<Student>);
    assert.match(JSON.stringify(programHistory(s)), /awarded Fall 2026/);
  });
  it('a Notre Dame bachelor’s conferred in January, then a spring entry: no “not before your entry term” warning', () => {
    const award = bachelorsAwardFrom([{ name: 'Bachelor of Science', level: 'bachelors', date: '2026-01-03' }]);
    assert.deepEqual(award?.term, t('fall', 2025));
    const report = audit(phdStudent({ entryTerm: t('spring', 2026), bachelorsAwarded: award!.term }), buildRules(), '2026-03-01');
    assert.ok(!report.warnings.some((w) => /not before your entry term/.test(w)), report.warnings.join(' | '));
  });
});
