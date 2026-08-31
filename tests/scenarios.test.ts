// Scenario runner: one JSON fixture per student case (tests/scenarios/*.json).
// Each fixture pins "today", the rules (base fixture + optional inline patch),
// a full Student object, and the expected status per requirement id.
//
// Tests run on node's built-in runner (`node --test`), NOT vitest: this repo
// lives under a folder whose name contains a colon ("FY26-27 (DGS: Taeho
// Jung)"), which breaks vite-node's module URLs. Vite still does the build;
// node runs the TypeScript tests directly (type stripping).
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { audit, REQUIREMENT_IDS } from '../src/engine/audit.ts';
import { buildRules, type ScenarioFile } from './helpers.ts';

const here = dirname(fileURLToPath(import.meta.url));
const scenarioDir = join(here, 'scenarios');

const files = readdirSync(scenarioDir)
  .filter((f) => f.endsWith('.json'))
  .sort();
const scenarios: ScenarioFile[] = files.map((f) =>
  JSON.parse(readFileSync(join(scenarioDir, f), 'utf8')),
);

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
        for (const sub of exp.detailIncludes ?? []) {
          assert.ok(
            row.detail.includes(sub),
            `detail of ${id} should mention "${sub}" — got: ${row.detail}`,
          );
        }
      }

      for (const [courseId, subs] of Object.entries(sc.expectCourseLines ?? {})) {
        const lines = report.courseLines.filter((l) => l.courseId === courseId);
        assert.ok(lines.length > 0, `no course line for ${courseId}`);
        const hit = lines.some((l) => subs.every((s) => l.text.includes(s)));
        assert.ok(
          hit,
          `no line for ${courseId} contains all of ${JSON.stringify(subs)}; got: ${lines
            .map((l) => l.text)
            .join(' | ')}`,
        );
      }
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
