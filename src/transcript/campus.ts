// Multi-campus state university systems (DGS 2026-09-12). A transcript that
// prints only the system's name — "UNIVERSITY OF CALIFORNIA", the logo naming
// the campus as an image — is not enough for the rules: the ExternalCourses
// tab is keyed on the campus's full name, and a UC San Diego course is not a
// UC Berkeley course. When the campus can be read from the record it is
// pre-filled; when it cannot, the student MUST choose it before the courses
// are added. Only systems whose bare name is genuinely ambiguous are listed —
// "Purdue University" alone means the flagship, and asking would only be
// noise. (University of Washington is listed at the DGS's request, 2026-09-13;
// University of Michigan on 2026-09-20 — Dearborn and Flint transcripts print
// the bare name too; the City University of New York on 2026-10-10.)
import { normalizeUniversity } from '../data/external.ts';

export interface Campus {
  /** As offered in the picker ("San Diego"). */
  name: string;
  /** The campus's full name, as the ExternalCourses tab should key it. */
  full: string;
  /** How a transcript may name the campus: its city, its acronym, its town. */
  aliases: RegExp;
}

export interface MultiCampusSystem {
  /** The system's bare name as transcripts print it. */
  system: string;
  campuses: readonly Campus[];
  /** In the header, the campus named FIRST wins (CUNY, DGS 2026-10-10: its
   * transcripts print the issuing college at the top and other colleges in
   * transfer lines below). Other systems keep list order, which puts the
   * flagship first — a student named "Martin" or a home town of "Flint" in
   * the header must not move a Knoxville or Ann Arbor transcript. */
  firstNamedWins?: true;
}

const c = (name: string, full: string, aliases: RegExp): Campus => ({ name, full, aliases });

export const MULTI_CAMPUS_SYSTEMS: readonly MultiCampusSystem[] = [
  {
    system: 'University of California',
    campuses: [
      c('Berkeley', 'University of California, Berkeley', /\bBerkeley\b|\bUCB\b|\bUC\s*Berkeley\b/i),
      c('Davis', 'University of California, Davis', /\bDavis\b|\bUCD\b/i),
      c('Irvine', 'University of California, Irvine', /\bIrvine\b|\bUCI\b/i),
      c('Los Angeles', 'University of California, Los Angeles', /\bLos Angeles\b|\bUCLA\b/i),
      c('Merced', 'University of California, Merced', /\bMerced\b|\bUCM\b/i),
      c('Riverside', 'University of California, Riverside', /\bRiverside\b|\bUCR\b/i),
      c('San Diego', 'University of California, San Diego', /\bSan Diego\b|\bUCSD\b|\bLa Jolla\b/i),
      c('San Francisco', 'University of California, San Francisco', /\bSan Francisco\b|\bUCSF\b/i),
      c('Santa Barbara', 'University of California, Santa Barbara', /\bSanta Barbara\b|\bUCSB\b/i),
      c('Santa Cruz', 'University of California, Santa Cruz', /\bSanta Cruz\b|\bUCSC\b/i),
    ],
  },
  {
    // DGS 2026-09-13: the bare name is Seattle's, but the Tacoma and Bothell
    // transcripts print it too — so the campus is asked unless the record
    // names one.
    system: 'University of Washington',
    campuses: [
      c('Seattle', 'University of Washington', /\bSeattle\b|\bUW\s*Seattle\b/i),
      c('Tacoma', 'University of Washington Tacoma', /\bTacoma\b|\bUWT\b/i),
      c('Bothell', 'University of Washington Bothell', /\bBothell\b|\bUWB\b/i),
    ],
  },
  {
    // DGS 2026-09-20: as with Washington, the bare name is Ann Arbor's, but
    // the Dearborn and Flint transcripts print it too.
    system: 'University of Michigan',
    campuses: [
      c('Ann Arbor', 'University of Michigan', /\bAnn Arbor\b|\bUM\s*Ann Arbor\b/i),
      c('Dearborn', 'University of Michigan-Dearborn', /\bDearborn\b|\bUM-?D\b/i),
      c('Flint', 'University of Michigan-Flint', /\bFlint\b|\bUM-?Flint\b/i),
    ],
  },
  {
    system: 'University of Illinois',
    campuses: [
      c('Urbana-Champaign', 'University of Illinois Urbana-Champaign', /\bUrbana\b|\bChampaign\b|\bUIUC\b/i),
      c('Chicago', 'University of Illinois Chicago', /\bChicago\b|\bUIC\b/i),
      c('Springfield', 'University of Illinois Springfield', /\bSpringfield\b|\bUIS\b/i),
    ],
  },
  {
    system: 'University of Texas',
    campuses: [
      c('Austin', 'The University of Texas at Austin', /\bAustin\b/i),
      c('Arlington', 'The University of Texas at Arlington', /\bArlington\b|\bUTA\b/i),
      c('Dallas', 'The University of Texas at Dallas', /\bDallas\b|\bRichardson\b|\bUTD\b/i),
      c('El Paso', 'The University of Texas at El Paso', /\bEl Paso\b|\bUTEP\b/i),
      c('San Antonio', 'The University of Texas at San Antonio', /\bSan Antonio\b|\bUTSA\b/i),
      c('Rio Grande Valley', 'The University of Texas Rio Grande Valley', /\bRio Grande Valley\b|\bUTRGV\b|\bEdinburg\b/i),
      c('Tyler', 'The University of Texas at Tyler', /\bTyler\b/i),
      c('Permian Basin', 'The University of Texas Permian Basin', /\bPermian Basin\b|\bOdessa\b|\bUTPB\b/i),
    ],
  },
  {
    system: 'University of Wisconsin',
    campuses: [
      c('Madison', 'University of Wisconsin–Madison', /\bMadison\b/i),
      c('Milwaukee', 'University of Wisconsin–Milwaukee', /\bMilwaukee\b|\bUWM\b/i),
    ],
  },
  {
    system: 'University of Minnesota',
    campuses: [
      c('Twin Cities', 'University of Minnesota Twin Cities', /\bTwin Cities\b|\bMinneapolis\b|\bSt\.? Paul\b/i),
      c('Duluth', 'University of Minnesota Duluth', /\bDuluth\b|\bUMD\b/i),
    ],
  },
  {
    system: 'University of Colorado',
    campuses: [
      c('Boulder', 'University of Colorado Boulder', /\bBoulder\b/i),
      c('Denver', 'University of Colorado Denver', /\bDenver\b/i),
      c('Colorado Springs', 'University of Colorado Colorado Springs', /\bColorado Springs\b|\bUCCS\b/i),
    ],
  },
  {
    system: 'University of Massachusetts',
    campuses: [
      c('Amherst', 'University of Massachusetts Amherst', /\bAmherst\b/i),
      c('Boston', 'University of Massachusetts Boston', /\bBoston\b/i),
      c('Lowell', 'University of Massachusetts Lowell', /\bLowell\b/i),
      c('Dartmouth', 'University of Massachusetts Dartmouth', /\bDartmouth\b/i),
    ],
  },
  {
    system: 'University of Maryland',
    campuses: [
      c('College Park', 'University of Maryland, College Park', /\bCollege Park\b|\bUMCP\b/i),
      c('Baltimore County', 'University of Maryland, Baltimore County', /\bBaltimore County\b|\bUMBC\b/i),
    ],
  },
  {
    system: 'University of Nebraska',
    campuses: [
      c('Lincoln', 'University of Nebraska–Lincoln', /\bLincoln\b|\bUNL\b/i),
      c('Omaha', 'University of Nebraska Omaha', /\bOmaha\b|\bUNO\b/i),
      c('Kearney', 'University of Nebraska at Kearney', /\bKearney\b|\bUNK\b/i),
    ],
  },
  {
    system: 'University of Missouri',
    campuses: [
      c('Columbia', 'University of Missouri', /\bColumbia\b|\bMizzou\b/i),
      c('Kansas City', 'University of Missouri–Kansas City', /\bKansas City\b|\bUMKC\b/i),
      c('St. Louis', 'University of Missouri–St. Louis', /\bSt\.? Louis\b|\bUMSL\b/i),
    ],
  },
  {
    system: 'University of North Carolina',
    campuses: [
      c('Chapel Hill', 'University of North Carolina at Chapel Hill', /\bChapel Hill\b|\bUNC-?CH\b/i),
      c('Charlotte', 'University of North Carolina at Charlotte', /\bCharlotte\b/i),
      c('Greensboro', 'University of North Carolina at Greensboro', /\bGreensboro\b|\bUNCG\b/i),
      c('Wilmington', 'University of North Carolina Wilmington', /\bWilmington\b|\bUNCW\b/i),
    ],
  },
  {
    system: 'University of Tennessee',
    campuses: [
      c('Knoxville', 'The University of Tennessee, Knoxville', /\bKnoxville\b/i),
      c('Chattanooga', 'The University of Tennessee at Chattanooga', /\bChattanooga\b|\bUTC\b/i),
      c('Martin', 'The University of Tennessee at Martin', /\bMartin\b|\bUTM\b/i),
    ],
  },
  {
    system: 'University of Alabama',
    campuses: [
      c('Tuscaloosa', 'The University of Alabama', /\bTuscaloosa\b/i),
      c('Birmingham', 'The University of Alabama at Birmingham', /\bBirmingham\b|\bUAB\b/i),
      c('Huntsville', 'The University of Alabama in Huntsville', /\bHuntsville\b|\bUAH\b/i),
    ],
  },
  {
    system: 'University of Nevada',
    campuses: [
      c('Reno', 'University of Nevada, Reno', /\bReno\b|\bUNR\b/i),
      c('Las Vegas', 'University of Nevada, Las Vegas', /\bLas Vegas\b|\bUNLV\b/i),
    ],
  },
  {
    system: 'University of Hawaii',
    campuses: [
      c('Manoa', 'University of Hawaiʻi at Mānoa', /\bM[aā]noa\b|\bHonolulu\b/i),
      c('Hilo', 'University of Hawaiʻi at Hilo', /\bHilo\b/i),
    ],
  },
  {
    system: 'State University of New York',
    campuses: [
      c('Buffalo', 'University at Buffalo', /\bBuffalo\b/i),
      c('Stony Brook', 'Stony Brook University', /\bStony Brook\b/i),
      c('Albany', 'University at Albany', /\bAlbany\b/i),
      c('Binghamton', 'Binghamton University', /\bBinghamton\b/i),
    ],
  },
  {
    // DGS 2026-10-10 (answer 4b): "The City University of New York" is 26
    // colleges, each with its own courses — a CUNYfirst transcript prints the
    // system's name under the college's ("THE CITY COLLEGE OF NEW YORK" /
    // "The City University of New York"), and the system's name used to win.
    // Every college is listed, by the name and in the order
    // cuny.edu/about/colleges/ prints them (2026-10-10), so no student is left
    // without their own. An alias names the college and nothing else: its
    // name with its institution word ("Baruch College", never a surname
    // "Baruch" on a student's name line), "City College" never inside "New
    // York City College of Technology", "York College" never inside "New
    // York College", "Queens College" never "Queensborough"; no two-letter
    // acronym, which a course prefix in the header could print.
    system: 'City University of New York',
    firstNamedWins: true,
    campuses: [
      c('Baruch', 'Baruch College', /\bBaruch College\b/i),
      c('Borough of Manhattan', 'Borough of Manhattan Community College', /\bBorough of Manhattan\b|\bBMCC\b/i),
      c('Bronx', 'Bronx Community College', /\bBronx Community College\b/i),
      c('Brooklyn', 'Brooklyn College', /\bBrooklyn College\b/i),
      c('Staten Island', 'College of Staten Island', /\bCollege of Staten Island\b/i),
      c('Graduate School of Journalism', 'Craig Newmark Graduate School of Journalism', /\bGraduate School of Journalism\b/i),
      c('Graduate Center', 'CUNY Graduate Center', /\bGraduate Center\b|\bGraduate School and University Center\b/i),
      c('Graduate School of Public Health', 'CUNY Graduate School of Public Health and Health Policy', /\bGraduate School of Public Health\b/i),
      c('School of Labor and Urban Studies', 'CUNY School of Labor and Urban Studies', /\bSchool of Labor and Urban Studies\b/i),
      c('School of Law', 'CUNY School of Law', /\bSchool of Law\b/i),
      c('School of Medicine', 'CUNY School of Medicine', /\bSchool of Medicine\b/i),
      c('School of Professional Studies', 'CUNY School of Professional Studies', /\bSchool of Professional Studies\b/i),
      c('Guttman', 'Guttman Community College', /\bGuttman Community College\b/i),
      c('Hostos', 'Hostos Community College', /\bHostos Community College\b/i),
      c('Hunter', 'Hunter College', /\bHunter College\b/i),
      c('John Jay', 'John Jay College of Criminal Justice', /\bJohn Jay College\b/i),
      c('Kingsborough', 'Kingsborough Community College', /\bKingsborough Community College\b/i),
      c('LaGuardia', 'LaGuardia Community College', /\bLa\s?Guardia Community College\b/i),
      c('Lehman', 'Lehman College', /\bLehman College\b/i),
      c('Macaulay', 'Macaulay Honors College', /\bMacaulay Honors College\b/i),
      c('Medgar Evers', 'Medgar Evers College', /\bMedgar Evers College\b/i),
      c('City Tech', 'New York City College of Technology', /\bNew York City College of Technology\b|\bCity Tech\b/i),
      c('Queens', 'Queens College', /\bQueens College\b/i),
      c('Queensborough', 'Queensborough Community College', /\bQueensborough Community College\b/i),
      c('City College', 'The City College of New York', /(?<!York\s)\bCity College\b(?!\s+of\s+Technology)|\bCCNY\b/i),
      c('York', 'York College', /(?<!New\s)\bYork College\b/i),
    ],
  },
];

/** A header line that names ANOTHER school as the source of transfer credit
 * ("Transfer Credit from Borough of Manhattan Community College", CUNYfirst)
 * names no campus of this transcript's own (DGS 2026-10-10, answer 4b). */
const TRANSFER_FROM_RE = /\btransfer(?:red)?\s+(?:credits?\s+)?from\b|\bcredits?\s+(?:accepted\s+)?from\b/i;

export interface CampusResolution {
  /** The system the printed name belongs to; undefined when it is not one. */
  system?: MultiCampusSystem;
  /** The campus, when the record names it — from the name itself first, then
   * anywhere in the text (a mailing address, "UCSD", "La Jolla"). */
  campus?: Campus;
}

/** Is `university` one of the ambiguous system names — bare, or with a
 * campus tacked on ("University of California, San Diego" belongs to the UC
 * system and names its campus)? A name that merely contains the system's
 * words elsewhere ("California State University") is not. */
export function resolveCampus(university: string | undefined, lines: readonly string[] = []): CampusResolution {
  if (university === undefined || university.trim() === '') return {};
  const key = normalizeUniversity(university);
  const system =
    MULTI_CAMPUS_SYSTEMS.find((s) => {
      const sk = normalizeUniversity(s.system);
      return key === sk || key.startsWith(sk + ' ');
    }) ??
    // A SUNY campus prints its own name FIRST — "BINGHAMTON UNIVERSITY, STATE
    // UNIVERSITY OF NEW YORK" (DGS 2026-09-20). A system named inside the
    // printed name counts only when the name also names one of its campuses,
    // so "California State University" still belongs to no system.
    MULTI_CAMPUS_SYSTEMS.find((s) => key.includes(' ' + normalizeUniversity(s.system)) && s.campuses.some((cp) => cp.aliases.test(university))) ??
    // The campus's own name alone ("Binghamton University", read from an
    // eScrip-Safe cover — F5, Batch B 2026-10-09) belongs to a system only
    // when the header prints that system's name ("… STATE UNIVERSITY OF NEW
    // YORK") and the name is one of its campuses.
    // The printed name must BE the campus's full name: an alias inside a
    // longer name ("FORDHAM UNIVERSITY SCHOOL OF LAW" holds CUNY's "School of
    // Law") with the system named elsewhere in the header (a prior
    // institution's line) is another school (review, 2026-10-10).
    MULTI_CAMPUS_SYSTEMS.find((s) => normalizeUniversity(lines.slice(0, 40).join(' ')).includes(normalizeUniversity(s.system)) && s.campuses.some((cp) => normalizeUniversity(cp.full) === key));
  if (system === undefined) return {};
  const inName = system.campuses.find((cp) => cp.aliases.test(university));
  if (inName) return { system, campus: inName };
  // The header first — a campus named in the first lines is the transcript's
  // own; a city deep in the record could be another school's address in a
  // "degrees awarded by other institutions" block, so only the header decides.
  // A transfer-credit line names no campus of this transcript's own, and in
  // CUNY's header the campus named FIRST wins (DGS 2026-10-10, answer 4b: a
  // City College transcript lists "Transfer Credit from Borough of Manhattan
  // Community College" on line 14). Other systems keep list order
  // (`firstNamedWins`).
  const header = lines
    .slice(0, 40)
    .filter((l) => !TRANSFER_FROM_RE.test(l))
    .join('\n');
  let inHeader: Campus | undefined;
  if (system.firstNamedWins) {
    let at = Infinity;
    for (const cp of system.campuses) {
      const m = cp.aliases.exec(header);
      if (m && m.index < at) {
        inHeader = cp;
        at = m.index;
      }
    }
  } else inHeader = system.campuses.find((cp) => cp.aliases.test(header));
  return inHeader ? { system, campus: inHeader } : { system };
}

/** The picker's label for a system. */
export function campusQuestion(system: MultiCampusSystem): string {
  return `Which ${system.system} campus?`;
}
