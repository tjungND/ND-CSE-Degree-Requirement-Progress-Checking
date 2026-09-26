// Which public-transcript fixtures pass right now, and which still fail on what.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseExternalTranscript } from '../../src/transcript/external.ts';
const DIR = new URL('../../tests/fixtures/public-transcripts/', import.meta.url).pathname;
const expected = JSON.parse(readFileSync(join(DIR, 'expected.json'), 'utf8'));
const known = JSON.parse(readFileSync(new URL('../../tests/fixtures/public-transcripts-known-failing.json', import.meta.url).pathname, 'utf8'));
const rowOf = (c: any) => `${c.courseId} | ${c.title ?? ''} | ${c.credits ?? '?'} | ${c.grade ?? c.rawGrade ?? '?'} | ${c.season ?? ''} ${c.year ?? ''}${c.level ? ' | ' + c.level : ''}`;
const only = process.argv[2];
let pass = 0, fail = 0;
for (const f of readdirSync(DIR).filter((n) => n.endsWith('.json') && !['expected.json', 'sources.json'].includes(n)).sort()) {
  const name = f.replace(/\.json$/, '');
  if (only && !name.includes(only)) continue;
  const r = parseExternalTranscript(JSON.parse(readFileSync(join(DIR, f), 'utf8')));
  const w = expected[name];
  const diffs: string[] = [];
  for (const [k, g, e] of [['university', r.university ?? null, w.university], ['campusSystem', r.campusSystem ?? null, w.campusSystem], ['campus', r.campus ?? null, w.campus], ['degreeConferred', r.degreeConferred ?? null, w.degreeConferred], ['bachelorsConferredOn', r.bachelorsConferredOn ?? null, w.bachelorsConferredOn], ['quarterSystem', r.quarterSystem ?? null, w.quarterSystem], ['trimesterSystem', r.trimesterSystem ?? null, w.trimesterSystem ?? null]] as const) if (g !== e) diffs.push(`${k}: got ${JSON.stringify(g)} want ${JSON.stringify(e)}`);
  const got = r.courses.map(rowOf);
  for (let i = 0; i < Math.max(got.length, w.courses.length); i++) if (got[i] !== w.courses[i]) diffs.push(`row ${i}:\n      got  ${got[i]}\n      want ${w.courses[i]}`);
  if (diffs.length === 0) { pass++; if (only || known[name]) console.log(`PASS ${name}${known[name] ? '   (still on the known-failing list)' : ''}`); }
  else { fail++; console.log(`FAIL ${name} (${(known[name] ?? []).join(', ')}) — ${diffs.length} diffs`); if (only) for (const d of diffs) console.log('   ' + d); else for (const d of diffs.slice(0, 3)) console.log('   ' + d.split('\n')[0]); }
}
console.log(`\n${pass} pass, ${fail} fail`);
