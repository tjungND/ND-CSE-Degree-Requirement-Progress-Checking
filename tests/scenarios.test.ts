// Scenario runner: one JSON fixture per student case (tests/scenarios/*.json).
// Each fixture pins "today", the rules (base fixture + optional inline patch),
// a full Student object, and the expected status per requirement id.
//
// Tests run on node's built-in runner (`node --test`), not vitest — see the
// `//scripts-note` in package.json. Vite still does the build; node runs the
// TypeScript tests directly (type stripping).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { audit, REQUIREMENT_IDS } from '../src/engine/audit.ts';
import { coursesNeedingDgsReview } from '../src/engine/review.ts';
import { allScenarios, buildRules } from './helpers.ts';

const scenarios = allScenarios();

describe('scenarios', () => {
  for (const sc of scenarios) {
    it(sc.name, () => {
      const rules = buildRules(sc.rules.patch);
      const report = audit(sc.student, rules, sc.today);
      const byId = new Map(report.requirements.map((r) => [r.id, r]));

      for (const [id, exp] of Object.entries(sc.expect)) {
        const row = byId.get(id);
        assert.ok(row, `requirement ${id} missing from the ${sc.student.program} report`);
        assert.equal(row.status, exp.status, `status of ${id} (detail: ${row.detail})`);
        // `statusLabel` (2026-10-03): the chip's override wording, when the fixture pins it.
        if (exp.statusLabel !== undefined) assert.equal(row.statusLabel, exp.statusLabel, `statusLabel of ${id}`);
        for (const sub of exp.detailIncludes ?? []) {
          assert.ok(
            row.detail.includes(sub),
            `detail of ${id} should mention "${sub}" — got: ${row.detail}`,
          );
        }
        // `detailExcludes` (2026-09-12): a reminder or hint that must NOT be
        // shown in this state (e.g. "file the form" while §4.2 blocks the qualifier).
        for (const sub of exp.detailExcludes ?? []) {
          assert.ok(!row.detail.includes(sub), `detail of ${id} must not mention "${sub}" — got: ${row.detail}`);
        }
        // `deadlineState` (2026-09-29): the chip's state — what the pill's
        // "Overdue" and the deadline alert hang on.
        const wantDeadline = (exp as { deadlineState?: string }).deadlineState;
        if (wantDeadline !== undefined) assert.equal(row.deadline?.state ?? 'none', wantDeadline, `deadline state of ${id}`);
        // `deadlineLabelIncludes` (2026-10-07): the chip's words.
        const wantLabel = (exp as { deadlineLabelIncludes?: string }).deadlineLabelIncludes;
        if (wantLabel !== undefined) assert.ok((row.deadline?.label ?? '').includes(wantLabel), `deadline label of ${id}: ${row.deadline?.label}`);
      }

      if (sc.expectTracks !== undefined) {
        assert.deepEqual(report.tracks.map((t) => t.section), sc.expectTracks);
      }

      // `expectReviewEmpty`: the DGS review request has nothing to ask (2026-09-11).
      if (sc.expectReviewEmpty === true) {
        const pending = coursesNeedingDgsReview(sc.student, rules, sc.today);
        assert.deepEqual(pending.map((p) => `${p.course.entry.courseId} — ${p.reason}`), [], 'the review request must be empty');
      }
      for (const id of sc.expectAbsent ?? []) {
        assert.ok(!byId.has(id), `requirement ${id} should not be in this report at all — got: ${byId.get(id)?.detail}`);
      }

      if (sc.expectGraduation !== undefined) {
        assert.ok(report.graduation, 'the report has no semester of graduation');
        assert.equal(report.graduation.registered, sc.expectGraduation.registered, 'registered in the semester of graduation');
        if (sc.expectGraduation.registeredCredits !== undefined) assert.equal(report.graduation.registeredCredits, sc.expectGraduation.registeredCredits, 'credits entered for it');
      }

      for (const [courseId, subs] of Object.entries(sc.expectCourseLines ?? {})) {
        const lines = report.courseLines.filter((l) => l.courseId === courseId);
        assert.ok(lines.length > 0, `no course line for ${courseId}`);
        // The credit line and, since 2026-09-27, the qualifier line together.
        const whole = (l: (typeof lines)[number]): string => `${l.text}${l.qualifier ? ` ${l.qualifier.text}` : ''}`;
        const hit = lines.some((l) => subs.every((s) => whole(l).includes(s)));
        assert.ok(
          hit,
          `no line for ${courseId} contains all of ${JSON.stringify(subs)}; got: ${lines
            .map(whole)
            .join(' | ')}`,
        );
      }

      // Warnings (2026-10-06): what the report says at the top, not a row.
      for (const sub of sc.expectWarnings ?? []) assert.ok(report.warnings.some((w) => w.includes(sub)), `no warning contains "${sub}"; got: ${report.warnings.join(' | ')}`);
      for (const sub of sc.expectNoWarnings ?? []) assert.ok(!report.warnings.some((w) => w.includes(sub)), `a warning contains "${sub}": ${report.warnings.find((w) => w.includes(sub))}`);
    });
  }
});

describe('requirement id registry', () => {
  const registry = new Set<string>(REQUIREMENT_IDS);
  const usedIds = new Set(scenarios.flatMap((sc) => Object.keys(sc.expect)));

  it('every fixture id exists in the engine registry', () => {
    for (const id of usedIds) {
      assert.ok(registry.has(id), `fixture id ${id} is not a registered requirement`);
    }
  });

  it('every registered requirement is asserted by at least one fixture', () => {
    for (const id of registry) {
      assert.ok(usedIds.has(id), `registered requirement ${id} is never asserted by a scenario`);
    }
  });
});
