// Run the app's external-transcript parser on a JSON array of text lines and
// print what it read. Usage: node --experimental-strip-types parse-lines.mts lines.json
import { readFileSync } from 'node:fs';
import { parseExternalTranscript } from '../../src/transcript/external.ts';
const file = process.argv[2];
if (!file) { console.error('usage: parse-lines.mts <lines.json>'); process.exit(2); }
const lines = JSON.parse(readFileSync(file, 'utf8')) as string[];
const r = parseExternalTranscript(lines);
const rowOf = (c: any) => `${c.courseId} | ${c.title ?? ''} | ${c.credits ?? '?'} | ${c.grade ?? c.rawGrade ?? '?'} | ${c.season ?? ''} ${c.year ?? ''}${c.level ? ' | ' + c.level : ''}`;
console.log(JSON.stringify({
  hasTextLayer: r.hasTextLayer, looksLikeNotreDame: r.looksLikeNotreDame,
  university: r.university ?? null, universityGuessed: r.universityGuessed ?? null, campusSystem: r.campusSystem ?? null, campus: r.campus ?? null,
  degreeConferred: r.degreeConferred ?? null, bachelorsConferredOn: r.bachelorsConferredOn ?? null, bachelorsConferred: r.bachelorsConferred ?? null,
  quarterSystem: r.quarterSystem ?? null, trimesterSystem: r.trimesterSystem ?? null,
  warnings: (r as any).warnings ?? [], transferRowsSkipped: (r as any).transferRowsSkipped ?? null,
  courses: r.courses.map(rowOf),
}, null, 1));
