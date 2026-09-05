// Generates the fixture PDFs used by the end-to-end transcript-upload test:
// a synthetic ND unofficial transcript, a non-ND one, an external (other
// university) one, and — since 2026-09-05 — a Banner-style TWO-COLUMN official
// transcript (banner-transcript.pdf) with positioned text runs, which exercises
// src/transcript/layout.ts column splitting through real pdfjs. Hand-built
// minimal PDFs — Helvetica text streams — so no PDF-writing dependency is needed.
// Regenerate with: node tests/fixtures/make-transcript-pdfs.mjs
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

function makePdf(lines) {
  const esc = (s) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  let text = 'BT /F1 9 Tf 40 760 Td 12 TL\n';
  for (const line of lines) text += `(${esc(line)}) Tj T*\n`;
  text += 'ET';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${text.length} >>\nstream\n${text}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((body, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefPos = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}

/** A PDF from positioned text runs: pages = [[{x, y, text, size?}, …], …].
 * Each run is its own Tj, so pdfjs reports it as one text item at (x, y) —
 * exactly how a registrar's Banner PDF comes out. */
function makePositionedPdf(pages) {
  const esc = (s) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', null, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  const kids = [];
  for (const runs of pages) {
    let text = '';
    for (const r of runs) {
      // Optional rotation (degrees) and gray level — how watermarks are drawn.
      const th = ((r.angle ?? 0) * Math.PI) / 180;
      const matrix = r.angle ? [Math.cos(th), Math.sin(th), -Math.sin(th), Math.cos(th)].map((v) => v.toFixed(4)).join(' ') : '1 0 0 1';
      const color = r.gray !== undefined ? `${r.gray} g ` : '';
      text += `BT /F1 ${r.size ?? 8} Tf ${color}${matrix} ${r.x} ${r.y} Tm (${esc(r.text)}) Tj ET\n`;
    }
    const contentIndex = objects.length + 1; // 1-based object number of the stream
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentIndex + 1} 0 R >>`);
    objects.push(`<< /Length ${text.length} >>\nstream\n${text}\nendstream`);
    kids.push(`${contentIndex} 0 R`);
  }
  objects[1] = `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${kids.length} >>`;
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((body, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefPos = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}

// Banner two-column official transcript (invented institution and student).
// Shape copied from a real registrar PDF: SUBJ / NO. / TITLE / CRED GRD / PTS
// in separate columns, "TRANSFER CREDIT ACCEPTED BY THE INSTITUTION" before
// "INSTITUTION CREDIT", term headers per column, decorative rules, a
// "CONTINUED ON NEXT COLUMN" banner, the student's nd.edu contact e-mail in
// the header (which must NOT make it a Notre Dame transcript), and the
// institution named only on the legend page.
function bannerPages() {
  const L = { subj: 33, num: 60, title: 95, cred: 215, grd: 240, pts: 276 };
  const R = { subj: 310, num: 337, title: 372, cred: 492, grd: 517, pts: 553 };
  const page1 = [];
  let yL = 760;
  let yR = 760;
  const left = (text, x = L.subj) => page1.push({ x, y: (yL -= 10), text });
  const right = (text, x = R.subj) => page1.push({ x, y: (yR -= 10), text });
  const row = (col, y, subj, num, title, cred, grd, pts) => {
    page1.push({ x: col.subj, y, text: subj }, { x: col.num, y, text: num }, { x: col.title, y, text: title }, { x: col.cred, y, text: cred }, { x: col.grd, y, text: grd });
    if (pts !== undefined) page1.push({ x: col.pts, y, text: pts });
  };
  const rowL = (...a) => row(L, (yL -= 10), ...a);
  const rowR = (...a) => row(R, (yR -= 10), ...a);
  page1.push({ x: 33, y: 775, text: 'SSN: ***-**-0000   CWID 00000000   Date of Birth: 01-JAN   Date Issued: 01-SEP-2026' });
  left('OFFI Official Transcript');
  left('Record of: Jane Q. Student');
  left('Issued To: Jane Q. Student');
  left('STUDENT@ND.EDU');
  left('Course Level: Graduate');
  left('Matriculated: Fall 2019');
  left('Program : Doctor of Philosophy');
  left('College : College of Science');
  left('Major : Computer Science');
  left('Degree Awarded Doctor of Philosophy 15-MAY-2024');
  yL -= 10;
  page1.push({ x: L.subj, y: yL, text: 'SUBJ' }, { x: L.num, y: yL, text: 'NO.' }, { x: L.title, y: yL, text: 'COURSE TITLE' }, { x: L.cred, y: yL, text: 'CRED GRD' }, { x: L.pts, y: yL, text: 'PTS R' });
  left('_____________________________________________________________');
  left('TRANSFER CREDIT ACCEPTED BY THE INSTITUTION:');
  left('.   CS Dept Pre-Req Equivlnts');
  rowL('CS', '401', 'Intro to Advanced Studies I', '0.00', 'TR');
  rowL('CS', '450', 'Operating Systems', '0.00', 'TR');
  left('Ehrs:   0.00 GPA-Hrs:   0.00 QPts:   0.00 GPA:   0.00');
  left('INSTITUTION CREDIT:');
  left('Fall 2019');
  left('College of Science');
  left('Computer Science');
  rowL('CS', '430', 'Introduction Algorithms', '3.00', 'A', '12.00');
  rowL('CS', '536', 'Science of Programming', '3.00', 'A', '12.00');
  rowL('HUM', '601', 'TA Seminar', '0.00', 'S', '0.00');
  left('Ehrs:   6.00 GPA-Hrs: 6.00   QPts:   24.00 GPA:   4.00');
  left('Good Standing');
  left('Spring 2020');
  left('College of Science');
  left('Computer Science');
  rowL('CS', '535', 'Dsgn and Anlys of Algorithms', '3.00', 'A', '12.00');
  rowL('CS', '550', 'Advnc Operating Syst', '3.00', 'B+', '9.99');
  left('Ehrs:   6.00 GPA-Hrs: 6.00   QPts:   21.99 GPA:   3.67');
  left('Good Standing');
  left('******************** CONTINUED ON NEXT COLUMN *******************', 60);
  right('Institution Information continued:');
  right('Fall 2020');
  right('College of Science');
  right('Computer Science');
  rowR('CS', '553', 'Cloud Computing', '3.00', 'A', '12.00');
  rowR('CS', '597', 'Reading and Special Problems', '3.00', 'A', '12.00');
  right('Ehrs:   6.00 GPA-Hrs: 6.00   QPts:   24.00 GPA:   4.00');
  right('Good Standing');
  right('Spring 2021');
  right('College of Science');
  right('Computer Science');
  rowR('CS', '595', 'Econ & Priv Issues in Big Data', '3.00', 'A', '12.00');
  rowR('CS', '691', 'Research and Thesis Ph.D.', '4.00', 'S', '0.00');
  right('Ehrs:   7.00 GPA-Hrs: 3.00   QPts:   12.00 GPA:   4.00');
  right('Good Standing');
  right('Summer 2021');
  right('College of Science');
  right('Computer Science');
  rowR('INTR', '010', 'Summer Internship', '0.00', 'NG', '0.00');
  right('Ehrs:   0.00 GPA-Hrs: 0.00   QPts:   0.00 GPA:   0.00');
  right('Good Standing');
  right('********************** TRANSCRIPT TOTALS ***********************');
  right('TOTAL INSTITUTION   19.00   15.00   57.99   3.87');
  right('********************** END OF TRANSCRIPT ***********************');
  const page2 = [
    { x: 33, y: 760, text: 'Example Institute of Technology' },
    { x: 310, y: 760, text: 'This record is intended only for the specified' },
    { x: 33, y: 750, text: 'Office of the Registrar' },
    { x: 310, y: 750, text: 'recipient and may not be released to any third party.' },
    { x: 33, y: 740, text: 'Springfield, IL 60000' },
    { x: 33, y: 730, text: 'registrar@example.edu' },
    { x: 33, y: 710, text: 'HISTORY' },
    { x: 33, y: 700, text: 'Example Institute of Technology, also known as Example Tech, is a private, non-profit, Ph.D. granting research university founded in 1890.' },
    { x: 33, y: 690, text: 'UNIT OF CREDIT: All courses are taught in English and academic credit is recorded as semester hours, as defined by the standard Carnegie Unit.' },
  ];
  return [page1, page2];
}

const ND = [
  'University of Notre Dame',
  'Unofficial Academic Transcript',
  'This is not an official transcript.',
  'Name : Jane Q. Student',
  '',
  'TRANSFER CREDIT ACCEPTED BY INSTITUTION',
  '202010: Purdue University',
  'CS 50300 GR Operating Systems A 3.000 12.000',
  '',
  'INSTITUTION CREDIT',
  'Fall Semester 2026',
  'CSE 60641 GR Graduate Operating Systems A 3.000 12.000',
  'CSE 63801 GR Research Seminar I S 1.000 0.000',
  'Spring Semester 2027',
  'CSE 60111 GR Complexity and Algorithms A- 3.000 11.001',
  'CSE 60321 GR Advanced Computer Architecture B+ 3.000 9.999',
  '',
  'TRANSCRIPT TOTALS (GRADUATE)',
  'Overall: 13.000 13.000 13.000 10.000 33.000 3.300',
  '',
  'COURSES IN PROGRESS',
  'Fall Semester 2027',
  'CSE 60876 GR Research Methods 3.000',
];

const OTHER = [
  'Purdue University',
  'Unofficial Academic Transcript',
  'Fall Semester 2026',
  'CS 50300 GR Operating Systems A 3.000 12.000',
];

// A system-generated transcript from ANOTHER university, for the external-
// transcripts flow (three-slot card). Multi-space gaps stand in for the column
// positions a real registrar PDF has (pdfToLines renders wide gaps the same way).
const EXTERNAL = [
  'Purdue University',
  'Office of the Registrar',
  'Unofficial Transcript',
  'Student: John Q. Boilermaker',
  'Program: Master of Science, Computer Science',
  '',
  'Fall 2023',
  'CS 50300   Operating Systems                 3.0   A',
  'CS 59000   Special Topics in Systems         3.0   A-',
  '',
  'Spring 2024',
  'CS 58000   Algorithm Design                  3.0   B+',
  '',
  'Cumulative GPA: 3.83',
];

writeFileSync(join(here, 'nd-transcript.pdf'), makePdf(ND));
writeFileSync(join(here, 'other-transcript.pdf'), makePdf(OTHER));
writeFileSync(join(here, 'external-transcript.pdf'), makePdf(EXTERNAL));
writeFileSync(join(here, 'banner-transcript.pdf'), makePositionedPdf(bannerPages()));

// The same transcript over a text watermark (2026-09-05: real UMass / Western
// Ontario transcripts repeat the university's name across the background —
// horizontal light-gray tiles here, plus a diagonal banner). Must parse
// identically to banner-transcript.pdf.
function watermarked(pages) {
  return pages.map((runs) => {
    const out = [...runs];
    for (let y = 775; y > 20; y -= 37) {
      for (const x of [15, 215, 415]) out.push({ x, y, text: 'Example Institute of Technology', size: 9, gray: 0.85 });
    }
    for (let y = 650; y > 100; y -= 180) out.push({ x: 80, y, text: 'EXAMPLE INSTITUTE OF TECHNOLOGY', size: 28, gray: 0.9, angle: 30 });
    return out;
  });
}
writeFileSync(join(here, 'banner-watermarked-transcript.pdf'), makePositionedPdf(watermarked(bannerPages())));
console.log('wrote nd-transcript.pdf, other-transcript.pdf, external-transcript.pdf, banner-transcript.pdf and banner-watermarked-transcript.pdf');
