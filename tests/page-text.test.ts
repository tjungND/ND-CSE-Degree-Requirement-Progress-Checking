// The policy review's page-text findings the DGS ruled on 2026-10-03:
//   P1-page-text-engine-5  — §3.2's quote keeps "earned at Notre Dame";
//   P1-page-text-engine-17 — "credits count once" cites nothing (no document
//     states it); §4.4.2 stays only where the specialization grade
//     replacement is meant;
//   P1-page-text-engine-7  — the qualifier passed under the earlier rules:
//     "Do not quote anything. Just state that those who passed the qualifier
//     under earlier rules are not subject to the new rules."
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { audit } from '../src/engine/audit.ts';
import { buildRules } from './helpers.ts';
import { ndCourse, phdStudent } from './helpers/student.ts';

const rules = buildRules();

describe('page text (DGS 2026-10-03)', () => {
  it('§3.2’s quote on the MSCSE credit rows is the whole sentence, “earned at Notre Dame” included (P1-page-text-engine-5)', () => {
    const r = audit(phdStudent({ program: 'mscse' }), rules, '2027-01-15');
    for (const id of ['ms.credits.regular', 'ms.credits.project']) {
      const row = r.requirements.find((x) => x.id === id)!;
      assert.match(row.citation.quote, /Masters thesis direction \(CSE 68901\) earned at Notre Dame\.$/, id);
    }
  });

  it('a repeated course’s credits count once without a section; §4.4.2 only for a specialization course (P1-page-text-engine-17)', () => {
    const s = phdStudent({
      courses: [
        ndCourse('CSE 60999', { term: { season: 'fall', year: 2026 }, grade: 'C' }),
        ndCourse('CSE 60999', { term: { season: 'spring', year: 2027 } }),
        ndCourse('CSE 60641', { term: { season: 'fall', year: 2026 }, grade: 'C+' }),
        ndCourse('CSE 60641', { term: { season: 'spring', year: 2027 } }),
      ],
    });
    const r = audit(s, rules, '2027-06-01');
    const first = (id: string) => r.courseLines.find((l) => l.courseId === id && l.term.season === 'fall')!.text;
    assert.equal(first('CSE 60999'), 'superseded by the Spring 2027 retake — its credits count once');
    assert.equal(first('CSE 60641'), 'superseded by the Spring 2027 retake — its credits count once, and for the category specialization the retake grade replaces this one (§4.4.2)');
    const warnings = r.warnings.filter((w) => /is entered 2 times/.test(w));
    assert.equal(warnings.length, 2);
    for (const w of warnings) assert.doesNotMatch(w, /§/);
  });

  it('an unlisted 50000-level CSE course on the MSCSE tab says §3.6.1’s rule, not “counts only if listed” (second reconciliation pass)', () => {
    const course = ndCourse('CSE 50999', { term: { season: 'fall', year: 2026 } });
    const ms = audit(phdStudent({ program: 'mscse', courses: [course] }), rules, '2027-01-15').courseLines.find((l) => l.courseId === 'CSE 50999')!;
    assert.equal(ms.text, 'not counted — a 50000-level CSE course is preparatory and does not count toward the MSCSE, whatever the course rules say (§3.6.1)');
    const phd = audit(phdStudent({ courses: [course] }), rules, '2027-01-15').courseLines.find((l) => l.courseId === 'CSE 50999')!;
    assert.match(phd.text, /^not counted — a 50000-level course counts only if the DGS has listed it in the course rules \(§4\.2\)/);
  });

  it('the qualifier passed under the earlier rules quotes nothing and says the new rules do not apply (P1-page-text-engine-7)', () => {
    const s = phdStudent({ entryTerm: { season: 'fall', year: 2024 }, attestations: { qualifierPassedUnderPriorRules: true } });
    const q = audit(s, rules, '2026-10-01').requirements.find((x) => x.id === 'phd.qualifier')!;
    assert.equal(q.status, 'met');
    assert.equal(q.citation.section, '§4.4');
    assert.equal(q.citation.quote, '', 'no quote: report.ts prints no rule quote for this card');
    assert.ok(
      (q.detailParts ?? []).some((p) => typeof p === 'object' && 'note' in p && p.note === 'Students who passed the qualifying examination under the earlier rules are not subject to the current requirements of §4.4 (DGS 2026-09-21)'),
      JSON.stringify(q.detailParts),
    );
    assert.doesNotMatch(q.detail, /three components/);
  });
});
