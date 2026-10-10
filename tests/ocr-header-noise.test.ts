// OCR plan step 2.5 (transcript accuracy program, 2026-10-09): the parser's
// header-mapped path on a SCAN's header line. Each rule runs only when
// parseExternalTranscript is given the OCR confidences; the same lines as a
// text layer are read exactly as before (every case below checks both).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isHeaderCell, OCR_HEADER_WORDS, ocrRepairHeaderCell, parseExternalTranscript } from '../src/transcript/external.ts';

const FILLER = Array(12).fill('Record issued by the Registrar — verify with the issuing office before relying on it.');
/** The lines as a text layer, and as an OCR reading (every line at 90). */
const asText = (...lines: string[]) => parseExternalTranscript([...lines, ...FILLER]);
const asScan = (...lines: string[]) => parseExternalTranscript([...lines, ...FILLER], [...lines, ...FILLER].map(() => 90));
const cells = (r: ReturnType<typeof parseExternalTranscript>) => r.courses.map((c) => `${c.courseId} | ${c.title} | ${c.credits ?? ''} | ${c.grade ?? c.rawGrade ?? ''}`);

// Alberta's PeopleSoft SQR record (the public CR/NC sample), its two-line
// header and a row under it — the grade first, then the units, the points and
// two class statistics.
const ALBERTA_UPPER = 'Grade   Units   Units   Grade   Class   Class';
const ALBERTA_LOWER = 'Course   Description   Remark   Taken   Passed   Points   Avg   Enrl';
const ALBERTA_ROWS = ['ECE   541   DIGITAL SIGNAL PROCESSING   B   3.0   3.0   9.00   3.3   19', 'ECE   684   WIRELESS COMMUNICATION SYSTEMS   B+   3.0   3.0   9.90   3.3   16'];
const ALBERTA_HEAD = ['UNIVERSITY OF ALBERTA - UNOFFICIAL RECORD', 'Winter Term 2019   Master of Engineering (Crse)'];

describe('OCR header noise (plan step 2.5)', () => {
  it('every repair target is a header word on its own — a repaired cell is read by the same patterns as a printed one', () => {
    for (const w of OCR_HEADER_WORDS) {
      assert.ok(w.length >= 4, `${w}: repairs reach words of four letters or more only`);
      assert.ok(isHeaderCell(w), `${w} is not a header cell on its own`);
    }
  });

  it('a word one glyph off a header word is repaired; three-letter words, digits and symbols never are', () => {
    assert.equal(ocrRepairHeaderCell('Gradc'), 'grade');
    assert.equal(ocrRepairHeaderCell('Crcdits'), 'credits');
    assert.equal(ocrRepairHeaderCell('Grade Remaik'), 'Grade remark');
    // two candidates naming the same column (units / unit) are one answer
    assert.equal(ocrRepairHeaderCell('Unite'), 'units');
    assert.equal(ocrRepairHeaderCell('Avy'), undefined); // "Avg", "Any", "Ave"
    assert.equal(ocrRepairHeaderCell('Gr4de'), undefined);
    assert.equal(ocrRepairHeaderCell('Instructions'), undefined); // two glyphs from "instructor"
    assert.equal(ocrRepairHeaderCell('Grade'), undefined); // nothing to repair
  });

  it('a misread header word on a line that is evidently a header maps its column on a scan only', () => {
    const lines = ['Some University', 'Fall 2023', 'Course   Title   Gradc   Credit Hours   Quality Points', 'CS 455   Data Communication   A   3.00   12.00'];
    const clean = asScan('Some University', 'Fall 2023', 'Course   Title   Grade   Credit Hours   Quality Points', 'CS 455   Data Communication   A   3.00   12.00');
    assert.deepEqual(cells(asScan(...lines)), cells(clean));
    assert.deepEqual(cells(asScan(...lines)), ['CS 455 | Data Communication | 3 | A']);
  });

  it('a line with under 60 % of its cells read exactly is never made a header by a fuzzy match', () => {
    // Two of four cells exact: the line is not evidenced as a header, so
    // "Crcdits" and "Gradc" are not repaired and the row is read
    // position-free, exactly as the text path reads it.
    const lines = ['Some University', 'Fall 2023', 'Course   Title   Crcdits   Gradc', 'CS 455   Data Communication   3.00   A'];
    assert.deepEqual(cells(asScan(...lines)), cells(asText(...lines)));
  });

  it('a scan\'s noise marks are no part of a header word: Minerva\'s "Cr./C.E\\U." is still the credits beside the grade', () => {
    const head = ['McGill University', 'Fall 2025'];
    const header = (cell: string) => `Subject   Number   Title   ${cell} Grade   Remarks Earned   Class`;
    const row = 'COMP   250   Intro to Computer Science   3   A-   3   B+';
    const noisy = asScan(...head, header('Cr./C.E\\U.'), 'Avg.', row);
    const clean = asScan(...head, header('Cr./C.E.U.'), 'Avg.', row);
    assert.deepEqual(cells(noisy), cells(clean));
    assert.equal(noisy.courses[0]?.grade, 'A-');
    assert.equal(noisy.courses[0]?.credits, 3);
    // The text layer never prints a backslash there; its reading is unchanged.
    assert.deepEqual(cells(asText(...head, header('Cr./C.E.U.'), 'Avg.', row)), cells(clean));
  });

  it('a two-line header whose lower line the scan ran together is split back into its words and joined (Alberta)', () => {
    const merged = 'Course   Description   Remark Taken Passed Points   Avg ~~ Enrl';
    const scan = asScan(...ALBERTA_HEAD, ALBERTA_UPPER, merged, ...ALBERTA_ROWS);
    const clean = asScan(...ALBERTA_HEAD, ALBERTA_UPPER, ALBERTA_LOWER, ...ALBERTA_ROWS);
    assert.deepEqual(cells(scan), cells(clean));
    assert.deepEqual(cells(scan), ['ECE 541 | DIGITAL SIGNAL PROCESSING | 3 | B', 'ECE 684 | WIRELESS COMMUNICATION SYSTEMS | 3 | B+']);
    // As a text layer the same lines are left as they were: the lower line
    // alone has no grade column, and the grade stays in the title.
    assert.notDeepEqual(cells(asText(...ALBERTA_HEAD, ALBERTA_UPPER, merged, ...ALBERTA_ROWS)), cells(clean));
  });

  it('a joined pair one glyph off a header word is repaired; a three-letter misread is not', () => {
    const takcn = asScan(...ALBERTA_HEAD, ALBERTA_UPPER, 'Course   Description   Remark   Takcn   Passed   Points   Avg   Enrl', ...ALBERTA_ROWS);
    assert.deepEqual(cells(takcn), cells(asScan(...ALBERTA_HEAD, ALBERTA_UPPER, ALBERTA_LOWER, ...ALBERTA_ROWS)));
    // "Avy" (Avg) stays unread: the pair "Class Avy" is no header word, the
    // join is refused as before, and the row reads as it did.
    const avy = [...ALBERTA_HEAD, ALBERTA_UPPER, 'Course   Description   Remark   Taken   Passed   Points   Avy   Enrl', ...ALBERTA_ROWS];
    assert.deepEqual(cells(asScan(...avy)), cells(asText(...avy)));
  });
});
