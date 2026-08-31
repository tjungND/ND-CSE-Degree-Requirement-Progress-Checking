// The engine's only entry point: audit(student, rules, today) → AuditReport.
// Pure by contract (CLAUDE.md): no DOM, no fetch, no Date.now() — "today" is an
// argument so tests are deterministic.
import type { Rules } from '../data/types.ts';
import { allocate, classify, type CapSpec } from './allocate.ts';
import { normalizeEntryTerm, termLabel } from './term.ts';
import type { AuditReport, RequirementResult, Student } from './types.ts';
import type { Ctx } from './requirements/context.ts';
import { advisorRow, approvalsRow, gpaRow } from './requirements/shared.ts';
import { mscseRows, msTimeLimitRow } from './requirements/mscse.ts';
import { phdRows, phdTimeLimitRow } from './requirements/phd.ts';

/** Requirement id ↔ plan-inventory mapping (docs/DECISIONS.md, plan §1):
 *   shared.gpa=S1  shared.advisor=S2  shared.approvals=advisory
 *   ms.credits.total=M1  ms.credits.regular=M2  ms.credits.project=M3
 *   ms.cap.fourk=M4  ms.cap.noncse=M5  ms.residency=M6  ms.timeLimit=M7
 *   ms.thesis.defense=M8  ms.project.report=M9
 *   phd.credits.total=P1  phd.credits.regular=P2  phd.seminar=P3
 *   phd.cap.noncse=P4  phd.cap.fourk=P5  phd.credits.nd=P6  phd.transfer=P7
 *   phd.residency=P8  phd.timeLimit=P9  phd.qualifier=P10
 *   phd.qualifier.core.{os,algorithms,architecture}=P10a
 *   phd.qualifier.categories=P10b  phd.qualifier.research=P10c
 *   phd.candidacy=P11  phd.dissertation.approval=P12
 *   phd.dissertation.defense=P13  phd.msAlongTheWay=P14 */
export const REQUIREMENT_IDS = [
  'shared.gpa',
  'shared.advisor',
  'shared.approvals',
  'ms.credits.total',
  'ms.credits.regular',
  'ms.credits.project',
  'ms.cap.fourk',
  'ms.cap.noncse',
  'ms.residency',
  'ms.timeLimit',
  'ms.thesis.defense',
  'ms.project.report',
  'phd.credits.total',
  'phd.credits.regular',
  'phd.credits.nd',
  'phd.seminar',
  'phd.cap.fourk',
  'phd.cap.noncse',
  'phd.transfer',
  'phd.residency',
  'phd.timeLimit',
  'phd.qualifier',
  'phd.qualifier.core.os',
  'phd.qualifier.core.algorithms',
  'phd.qualifier.core.architecture',
  'phd.qualifier.categories',
  'phd.qualifier.research',
  'phd.candidacy',
  'phd.dissertation.approval',
  'phd.dissertation.defense',
  'phd.msAlongTheWay',
] as const;

export function audit(student: Student, rules: Rules, today: string): AuditReport {
  const params = rules.parameters;
  const { term: entry, normalized } = normalizeEntryTerm(student.entryTerm);

  const { classified, warnings } = classify(student, rules);

  const num = (key: string) => params.number(key);
  const capSpecs: CapSpec[] =
    student.program === 'mscse'
      ? [
          { id: 'fourk', limit: num('ms_4xxxx_credits_max'), label: `${num('ms_4xxxx_credits_max') ?? '?'}-credit 40000-level cap`, section: '§3.2' },
          { id: 'noncse', limit: num('ms_noncse_credits_max'), label: `${num('ms_noncse_credits_max') ?? '?'}-credit non-CSE cap`, section: '§3.2' },
          {
            id: 'transfer',
            limit: num(student.priorMs === 'completed' ? 'ms_transfer_completed_ms_credits_max' : 'transfer_unfinished_ms_credits_max'),
            label: 'transfer-credit cap',
            section: '§5.2',
          },
        ]
      : [
          { id: 'fourk', limit: num('phd_4xxxx_cse_credits_max'), label: `${num('phd_4xxxx_cse_credits_max') ?? '?'}-credit 40000-level cap`, section: '§4.2' },
          { id: 'noncse', limit: num('phd_noncse_6xxxx_credits_max'), label: `${num('phd_noncse_6xxxx_credits_max') ?? '?'}-credit non-CSE cap`, section: '§4.2' },
          {
            id: 'transfer',
            limit: num(student.priorMs === 'completed' ? 'phd_transfer_completed_ms_credits_max' : 'transfer_unfinished_ms_credits_max'),
            label: 'transfer-credit cap',
            section: '§5.2',
          },
        ];

  const alloc = allocate(classified, capSpecs);

  const ctx: Ctx = {
    student,
    rules,
    today,
    entry,
    entryNormalized: normalized,
    alloc,
    classified,
    params,
    warnings,
  };

  if (normalized) {
    warnings.push(
      `You entered in a summer session — semester counting starts with ${termLabel(entry)} (decision Q17c).`,
    );
  }

  const rows: RequirementResult[] = [gpaRow(ctx), advisorRow(ctx)];
  rows.push(...(student.program === 'mscse' ? mscseRows(ctx) : phdRows(ctx)));

  // The time-limit row is "met" only when everything else already is.
  const othersAllMet = rows
    .filter((r) => !r.informational && r.status !== 'not_applicable')
    .every((r) => r.status === 'met');
  rows.push(student.program === 'mscse' ? msTimeLimitRow(ctx, othersAllMet) : phdTimeLimitRow(ctx, othersAllMet));
  rows.push(approvalsRow(ctx));

  const scored = rows.filter((r) => !r.informational && r.status !== 'not_applicable');
  const summary = { met: scored.filter((r) => r.status === 'met').length, scored: scored.length };

  const courseLines = alloc.perCourse.map((p) => ({
    courseId: p.course.entry.courseId,
    term: p.course.entry.term,
    text: p.explanation,
  }));

  return {
    program: student.program,
    requirements: rows,
    courseLines,
    summary,
    warnings: [...warnings, ...alloc.warnings],
  };
}
