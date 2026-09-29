// The Notre Dame programs on every copied email (DGS 2026-09-28: "need all ND
// programs and their entry terms including transfer"). src/ui/program-history.ts.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { CourseEntry, Student } from '../src/engine/types.ts';
import { programHistory } from '../src/ui/program-history.ts';
import { phdStudent } from './helpers/student.ts';

const nd = (courseId: string, level: 'bachelors' | 'masters', season: 'fall' | 'spring', year: number): CourseEntry => ({
  courseId, credits: 3, term: { season, year }, grade: 'A', origin: 'transfer', institution: 'University of Notre Dame', degreeLevel: level,
});
const student = (extra: Partial<Student>): Student => phdStudent({ entryTerm: { season: 'fall', year: 2025 }, ...extra });

describe('programHistory', () => {
  it('only the current program: the subject reads as before, and no earlier-programs sentence', () => {
    const h = programHistory(student({ background: { bachelors: 'elsewhere', graduate: 'none' } }));
    assert.equal(h.compact, 'Ph.D., entered Fall 2025');
    assert.equal(h.earlier, '');
    assert.equal(programHistory(student({ background: undefined })).compact, 'Ph.D., entered Fall 2025', 'no answer yet: nothing invented');
    assert.equal(programHistory({ ...student({}), program: 'mscse' }).compact, 'M.S. in CSE, entered Fall 2025');
  });

  it('a transfer from the MSCSE: the entry term is the MSCSE’s, the transfer term is named — or said to be missing', () => {
    const h = programHistory(student({ entryTerm: { season: 'fall', year: 2023 }, background: { bachelors: 'elsewhere', graduate: 'nd-mscse-transfer', transferredTerm: { season: 'spring', year: 2025 } } }));
    assert.equal(h.compact, 'Ph.D. (transferred Spring 2025 from the Notre Dame MSCSE, entered Fall 2023)');
    assert.equal(h.earlier, '');
    const missing = programHistory(student({ entryTerm: { season: 'fall', year: 2023 }, background: { bachelors: 'elsewhere', graduate: 'nd-mscse-transfer' } }));
    assert.equal(missing.compact, 'Ph.D. (transferred term not entered from the Notre Dame MSCSE, entered Fall 2023)');
  });

  it('an MSCSE held at Notre Dame: its span from the prior coursework and its award term', () => {
    const s = student({
      background: { bachelors: 'elsewhere', graduate: 'nd-mscse' },
      ndMasters: { term: { season: 'spring', year: 2025 } },
      courses: [nd('CSE 60641', 'masters', 'fall', 2023), nd('CSE 60111', 'masters', 'spring', 2024)],
    });
    const h = programHistory(s);
    assert.equal(h.compact, 'Ph.D., entered Fall 2025; MSCSE at Notre Dame, Fall 2023–Spring 2025');
    assert.equal(h.earlier, 'Earlier Notre Dame programs: MSCSE at Notre Dame, Fall 2023–Spring 2025.');
    // Only the award known (no prior coursework entered yet): "awarded".
    assert.equal(programHistory({ ...s, courses: [] }).compact, 'Ph.D., entered Fall 2025; MSCSE at Notre Dame, awarded Spring 2025');
    // Only the coursework known: "from".
    assert.equal(programHistory({ ...s, ndMasters: {}, courses: [nd('CSE 60641', 'masters', 'fall', 2023)] }).compact, 'Ph.D., entered Fall 2025; MSCSE at Notre Dame, from Fall 2023');
    // Nothing dated: the program alone.
    assert.equal(programHistory({ ...s, ndMasters: {}, courses: [] }).compact, 'Ph.D., entered Fall 2025; MSCSE at Notre Dame');
    // The conferral the transcript recorded stands in for a missing ndMasters term.
    assert.equal(programHistory({ ...s, ndMasters: {}, courses: [], ndDegrees: [{ level: 'masters', date: '2025-05-17' }] }).compact, 'Ph.D., entered Fall 2025; MSCSE at Notre Dame, awarded Spring 2025');
  });

  it('a 4+1 and a Notre Dame bachelor’s: both programs, the bachelor’s from its coursework to its award', () => {
    const s = student({
      background: { bachelors: 'nd-cse', graduate: 'nd-4plus1' },
      bachelorsAwarded: { season: 'spring', year: 2024 },
      ndMasters: { term: { season: 'spring', year: 2025 } },
      courses: [nd('CSE 20311', 'bachelors', 'fall', 2020), nd('CSE 30321', 'bachelors', 'spring', 2023), nd('CSE 60641', 'masters', 'fall', 2024)],
    });
    assert.equal(programHistory(s).compact, 'Ph.D., entered Fall 2025; MSCSE at Notre Dame (Integrated 4+1), Fall 2024–Spring 2025; B.S. at Notre Dame CSE, Fall 2020–Spring 2024');
    assert.equal(programHistory(s).earlier, 'Earlier Notre Dame programs: MSCSE at Notre Dame (Integrated 4+1), Fall 2024–Spring 2025; B.S. at Notre Dame CSE, Fall 2020–Spring 2024.');
    // A bachelor's known only as "before Fall 2024" has no award term.
    const before = programHistory({ ...s, background: { bachelors: 'nd-other', graduate: 'none' }, courses: [], bachelorsAwardedInferred: { how: 'x', before: { season: 'fall', year: 2024 } } });
    assert.equal(before.compact, 'Ph.D., entered Fall 2025; B.S. at Notre Dame (another department)');
  });

  it('an MSCSE student in the Integrated program, and a graduate degree in another Notre Dame department', () => {
    const ms = programHistory({ ...student({ background: { bachelors: 'nd-cse', ndIntegrated: true, graduate: 'none' }, bachelorsAwarded: { season: 'spring', year: 2025 } }), program: 'mscse' });
    assert.equal(ms.compact, 'M.S. in CSE, entered Fall 2025; B.S. at Notre Dame CSE (Integrated 4+1), awarded Spring 2025');
    const other = programHistory(student({ background: { bachelors: 'elsewhere', graduate: 'nd-other' } }));
    assert.equal(other.compact, 'Ph.D., entered Fall 2025; a graduate degree at Notre Dame (another department)');
  });
});
