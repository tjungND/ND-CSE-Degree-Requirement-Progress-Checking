// Generates the two fixture PDFs used by the end-to-end transcript-upload test
// (a synthetic ND unofficial transcript and a non-ND one). Hand-built minimal
// PDFs — one Helvetica text stream — so no PDF-writing dependency is needed.
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
console.log('wrote nd-transcript.pdf, other-transcript.pdf and external-transcript.pdf');
