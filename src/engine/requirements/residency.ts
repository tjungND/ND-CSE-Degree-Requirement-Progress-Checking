// Residency derivation (decision Q8): a term is full-time when the student's
// entered ND credits reach the §2.1.2 floor ("A full-time student is one who
// registers for at least nine (9) credit hours per semester. These credits may
// consist of both regular course credits and research credits."), or when the
// student marks it full-time (research-heavy terms may not be fully entered).
// Registration is what counts, so all grades — including IP and F — contribute.
// Only terms from the entry term on count (2026-09-05): residence is "for the
// Ph.D. degree" (§4.3) / "for the master's degree" (§3.3), so semesters spent
// at Notre Dame in an earlier program — an undergraduate degree on a combined
// transcript — are not residence in this one. (A transcript import already
// files pre-entry courses as prior coursework; this guard covers courses
// entered by hand and entry terms changed afterwards.)
import { termIndex } from '../term.ts';
import type { Term } from '../types.ts';
import type { Ctx } from './context.ts';

export function fullTimeTermRecords(ctx: Ctx): { term: Term; fullTime: boolean; credits: number }[] {
  const floor = ctx.params.number('fulltime_credits_min');
  const entryIndex = termIndex(ctx.student.entryTerm);
  const byTerm = new Map<number, { term: Term; credits: number }>();
  for (const c of ctx.student.courses) {
    if (c.origin !== 'nd' || termIndex(c.term) < entryIndex) continue;
    const key = termIndex(c.term);
    const rec = byTerm.get(key) ?? { term: c.term, credits: 0 };
    rec.credits += c.credits;
    byTerm.set(key, rec);
  }
  for (const t of ctx.student.fullTimeTermOverrides ?? []) {
    const key = termIndex(t);
    if (key < entryIndex) continue;
    if (!byTerm.has(key)) byTerm.set(key, { term: t, credits: 0 });
  }
  const overrides = new Set((ctx.student.fullTimeTermOverrides ?? []).map((t) => termIndex(t)));
  return [...byTerm.values()]
    .sort((a, b) => termIndex(a.term) - termIndex(b.term))
    .map((rec) => ({
      term: rec.term,
      credits: rec.credits,
      fullTime: overrides.has(termIndex(rec.term)) || (floor !== undefined && rec.credits >= floor),
    }));
}
