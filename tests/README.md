# Test data: every file here is synthetic or public — never a student's record

Nothing under `tests/` comes from a real student's transcript, and nothing may (FERPA; the
project rule in `CLAUDE.md`). Every fixture is one of two kinds:

- **synthetic** — invented by a script or by the DGS's own generator: fictitious names, ids,
  courses and grades that never belonged to anyone;
- **public** — a registrar's own published sample transcript, transcript key, legend, template
  or regulation, copied as the registrar prints it (with the registrar's placeholder name and
  id where the document carries one).

If a fixture ever needs the *layout* of a real transcript, the layout is rebuilt synthetically
(`tests/fixtures/make-transcript-pdfs.mjs` shows how) — a de-identified copy of the real file is
never committed. The outputs of the sanitizers in `scripts/sanitize*` (`sanitized-*.pdf`,
`sanitized-scan-*.png`) are git-ignored for that reason, and the de-identified samples the DGS
shared with the maintainer on 2026-09-05 stayed outside the repository, as did the sanitized
line dumps used for regression checks in that session (session scratchpads only).

## What each folder holds

| Where | Count | Kind | Provenance |
|---|---|---|---|
| `fixtures/*.pdf` | 12 | synthetic | Hand-built by `fixtures/make-transcript-pdfs.mjs` (11 PDFs: Notre Dame unofficial and official, undergraduate, combined, Banner two-column, watermarked, external, UC-system, no-lines, other) and `fixtures/make-scan-fixture.py` (the image-only scan). The student is "Jane Q. Student"; every course, grade and date is invented. Regenerate with `node tests/fixtures/make-transcript-pdfs.mjs` and `python3 tests/fixtures/make-scan-fixture.py`. |
| `fixtures/ms-transcripts/` | 48 + `expected.json` | synthetic | The DGS's 48 synthetic master's and combined transcripts (2026-09-20), produced by his own generator with invented names ("Ferreira, Bjorn"), ids, courses and dates in each school's layout. Each `.json` is the line list the app's PDF layout step read from one synthetic PDF; `expected.json` is what the parser must return. The synthetic PDFs themselves are not in the repository. |
| `fixtures/public-transcripts/` | 127 + `expected.json`, `sources.json` | public | 93 line lists composed on 2026-09-26 from public registrar sample transcripts, transcript keys, ECTS and credential-evaluator templates (rows composed to the documented layout, "SAMPLE STUDENT" / "000000000" where a name or id would print; only the SJTU and Peradeniya templates carry the rows their publishers printed), and 34 `pdf-*` line lists read by the app's own layout stage from public registrar PDFs later the same day (the ANU sample transcript, whose registrar prints the placeholder "Filanes Filankesov Filankesovich" / 5123456; the University of Vaasa template with `[Student's Name]`; and 32 keys, legends, forms and regulations pinned as producing no course row). `sources.json` names each source (URL; for the PDFs also SHA-256, byte size and line count); the PDFs are not committed. `../public-transcripts-known-failing.json` lists the fixtures waiting on a DGS decision. |
| `fixtures/rules/` | 4 CSVs | synthetic | Sample tabs of the rules sheet (Courses, Categories, Parameters, ExternalCourses) modelled on the live sheet for the parser and validation tests. Course rules, not student data. |
| `scenarios/` | 71 + `README.md` | synthetic | One invented student per file — program, entry term, GPA, courses, milestones — and the audit result expected of it. No names. `scenarios/README.md` documents the keys. |
| `helpers/student.ts`, `helpers.ts` | — | synthetic | Builders for invented student records used by the unit tests. |
| documents written inline in `*.test.ts` | — | synthetic | Minimal transcripts and sheet rows typed into the tests ("Some University", "SAMPLE STUDENT", "CS 500 Topics 3.00 A"). |

## Adding a fixture

- Synthetic or public only. Use "SAMPLE STUDENT" and an all-zero id where a name or id
  would print; never a file name that could carry a student's name.
- Public material: record where it came from in the folder's `sources.json` (URL, kind; for
  a PDF its SHA-256 and size), and regenerate the line list with the app's own extraction —
  `node --experimental-strip-types scripts/dev/pdf-to-lines.mts sample.pdf > lines.json`
  (or `scripts/dev/ocr-lines.mjs` for an image-only PDF) — so the fixture is exactly what the
  browser would read.
- A real transcript is for the DGS's own testing on his own machine. To report how one reads
  without revealing it, `scripts/diagnose-transcript.mjs` prints shapes only; to share a
  de-identified copy with the maintainer, the sanitizers in `MAINTENANCE.md` — but neither
  output belongs in this folder.
