// Pulls the published sheet CSVs and rewrites data/snapshot.json (raw CSV text
// + syncedAt). Run weekly by .github/workflows/sync-sheet.yml and by hand via
// `npm run sync-sheet`. The snapshot stores raw CSV so the app's one parser
// handles live and fallback identically, and so the weekly commit diff reads
// as "what the DGS changed".
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rulesFromCsvTexts } from '../src/data/assemble.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const urls = JSON.parse(readFileSync(join(root, 'data', 'sheet-urls.json'), 'utf8'));

async function fetchCsv(url: string): Promise<string> {
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const text = await res.text();
  if (/^\s*</.test(text)) throw new Error(`got HTML instead of CSV from ${url} — is the tab still published?`);
  return text;
}

const [courses, parameters, categories] = await Promise.all([
  fetchCsv(urls.courses),
  fetchCsv(urls.parameters),
  fetchCsv(urls.categories),
]);

const syncedAt = new Date().toISOString();
const rules = rulesFromCsvTexts({ courses, parameters, categories }, { source: 'live', syncedAt });

if (rules.courses.size === 0) {
  console.error('Refusing to write a snapshot with zero usable Courses rows — check the published sheet.');
  process.exit(1);
}

const errors = rules.issues.filter((i) => i.severity === 'error');
const warnings = rules.issues.filter((i) => i.severity === 'warning');
console.log(`Fetched: ${rules.courses.size} courses, ${rules.parameters.raw.size} parameters, ` +
  `${rules.coreAreas.length} core areas, ${rules.categoryGroups.length} groups.`);
for (const i of rules.issues) console.log(`  [${i.severity}] ${i.message}`);
console.log(`${errors.length} error(s), ${warnings.length} warning(s) — the app shows these in its diagnostics panel.`);

const snapshot = { schemaVersion: 1, syncedAt, csv: { courses, parameters, categories } };
writeFileSync(join(root, 'data', 'snapshot.json'), JSON.stringify(snapshot, null, 2) + '\n');
console.log(`Wrote data/snapshot.json (synced ${syncedAt}).`);
