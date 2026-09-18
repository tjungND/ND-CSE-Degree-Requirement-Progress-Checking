// Conditional satisfaction (interface review R2, 2026-09-18). Three things the
// report used to get wrong at once, on the same rows:
//
//   1. a row read "Met" while naming the courses still waiting for the approval
//      its own handbook quote requires;
//   2. the credits a cap DISCARDED were printed as ordinary body text under the
//      green pill, so a row that costs a student three credits looked like an
//      unqualified pass;
//   3. the dashboard had no count for "satisfied except for a signature" — it
//      was folded into "not yet" with a parenthetical.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { audit } from '../src/engine/audit.ts';
import type { AuditReport } from '../src/engine/types.ts';
import { scoreLine } from '../src/ui/report.ts';
import { buildRules, type ScenarioFile } from './helpers.ts';

const here = dirname(fileURLToPath(import.meta.url));
const scenarioDir = join(here, 'scenarios');
const scenarios: ScenarioFile[] = readdirSync(scenarioDir)
  .filter((f) => f.endsWith('.json'))
  .sort()
  .map((f) => JSON.parse(readFileSync(join(scenarioDir, f), 'utf8')));

const reports: { name: string; report: AuditReport }[] = scenarios.map((sc) => ({
  name: sc.name,
  report: audit(sc.student, buildRules(sc.rules.patch), sc.today),
}));

/** The ONE row allowed to read "Met" while naming a course that needs an
 * approval, and why. §3.2's "Up to six (6) credits at the 40000 level may be
 * used to satisfy the course requirement" names no approval at all, so the
 * absence is the handbook's — the DGS ruled on 2026-09-18 that this row keeps
 * its verdict while `phd.cap.fourk` and `ms.cap.sharedbs` gained theirs. If
 * this list ever grows, the reason belongs in docs/DECISIONS.md first. */
const MET_MAY_NAME_AN_APPROVAL = new Set(['ms.cap.fourk']);

// What makes an outstanding approval LOAD-BEARING. A surplus note is not:
// "24 of 24 credits complete. 3 pending review/approval." is met on the
// definite credits alone and merely says three more are on their way — which is
// what tests/scenarios/dgs-approval-not-load-bearing.json is named for, and
// what thresholdStatus's certainty ladder already gets right. The review's
// complaint (R2) is the other case: a row satisfied only BECAUSE of something
// nobody has approved yet.
const LOAD_BEARING = /needs approval|Pending review:|meeting this depends on courses that still need review/i;

describe('no row reads "Met" while an approval it depends on is outstanding (R2)', () => {
  it('across every scenario', () => {
    const offenders: string[] = [];
    for (const { name, report } of reports) {
      for (const r of report.requirements) {
        if (r.status !== 'met' || MET_MAY_NAME_AN_APPROVAL.has(r.id)) continue;
        if (LOAD_BEARING.test(r.detail)) offenders.push(`${name} → ${r.id}: ${r.detail.slice(0, 120)}`);
      }
    }
    assert.deepEqual(offenders, [], `a "Met" pill above an outstanding approval:\n${offenders.join('\n')}`);
  });

  it('and the one documented exception is still exactly one row', () => {
    // Pins the decision rather than the code: if §3.2 ever gains an approval
    // clause, this test is what says the exception has to be revisited.
    const exempt = reports.flatMap(({ report }) =>
      report.requirements.filter((r) => r.status === 'met' && /needs approval/i.test(r.detail)).map((r) => r.id),
    );
    assert.deepEqual([...new Set(exempt)].sort(), ['ms.cap.fourk']);
  });
});

describe('credits a cap discards are warnings, not prose (R2)', () => {
  const over = reports.find(({ name }) => name === 'phd-caps-unapproved')!;

  it('the over-cap lines come through as warning parts', () => {
    const row = over.report.requirements.find((r) => r.id === 'phd.cap.fourk')!;
    const warnings = (row.detailParts ?? []).filter((p) => typeof p === 'object' && 'warn' in p);
    assert.equal(warnings.length, 1, JSON.stringify(row.detailParts));
    assert.match((warnings[0] as { warn: string }).warn, /CSE 40567: 3 credits not counted — over the cap/);
  });

  it('…and the prose detail is unchanged, so the copied messages still read as before', () => {
    const row = over.report.requirements.find((r) => r.id === 'phd.cap.noncse')!;
    assert.match(row.detail, /PSY 60119: 3 credits over the cap — count toward the total-credit requirement only/);
  });

  it('a row with discarded credits never presents as an unqualified pass', () => {
    for (const { name, report } of reports) {
      for (const r of report.requirements) {
        const discards = (r.detailParts ?? []).some((p) => typeof p === 'object' && 'warn' in p);
        if (discards && r.status === 'met' && !MET_MAY_NAME_AN_APPROVAL.has(r.id)) {
          // A cap may legitimately be "met" while discarding credits — what it
          // may not do is discard them silently, so the warning must be there.
          assert.ok(
            (r.detailParts ?? []).some((p) => typeof p === 'object' && 'warn' in p),
            `${name} → ${r.id} discards credits with no warning`,
          );
        }
      }
    }
  });
});

describe('the dashboard tells the three states apart (R2)', () => {
  it('the summary counts conditional satisfaction on its own, disjoint from met', () => {
    for (const { name, report } of reports) {
      const { met, conditional, scored } = report.summary;
      const rows = report.requirements.filter((r) => !r.informational && r.status !== 'not_applicable');
      assert.equal(met, rows.filter((r) => r.status === 'met').length, name);
      assert.equal(conditional, rows.filter((r) => r.status === 'needs_dgs_review').length, name);
      assert.ok(met + conditional <= scored, name);
    }
  });

  it('the sticky score line names it instead of hiding it', () => {
    const withCond = reports.find(({ report }) => report.summary.conditional > 0)!;
    assert.match(scoreLine(withCond.report), /\d+ of \d+ met · \d+ conditionally met/);
    const noCond = reports.find(({ report }) => report.summary.conditional === 0)!;
    assert.doesNotMatch(scoreLine(noCond.report), /conditionally/);
  });
});

describe('the one row that must not read "Conditionally met" (W-CS2)', () => {
  it('a defense past §4.3’s limit overrides the pill', () => {
    const late = reports.find(({ name }) => name === 'phd-defense-after-the-eight-year-limit')!;
    const row = late.report.requirements.find((r) => r.id === 'phd.dissertation.defense')!;
    assert.equal(row.status, 'needs_dgs_review', 'the status — and so the dashboard count — is unchanged');
    assert.equal(row.statusLabel, 'Eligibility at risk');
    assert.match(row.detail, /forfeiture of degree eligibility/);
  });

  it('a defense inside the limit carries no override', () => {
    for (const { report } of reports) {
      for (const r of report.requirements) {
        if (r.id !== 'phd.dissertation.defense') continue;
        if (r.status !== 'needs_dgs_review') assert.equal(r.statusLabel, undefined, r.detail.slice(0, 80));
      }
    }
  });

  it('no other row overrides its pill', () => {
    const overridden = reports.flatMap(({ report }) => report.requirements.filter((r) => r.statusLabel).map((r) => r.id));
    assert.deepEqual([...new Set(overridden)], ['phd.dissertation.defense']);
  });
});
