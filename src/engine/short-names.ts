// Short forms of the §4.4.1 core-area and §4.4.2 group names (DGS 2026-09-08).
//
// The names themselves are DATA — the Categories tab of the rules sheet — so
// they cannot be shortened by editing a literal. This maps a name to its short
// form at DISPLAY time, and only in the dense places the DGS approved: the
// specialization row's lists of groups, the coursework table's "Counts Toward"
// column, and the group picker beside a course that may fill more than one
// group.
//
// Everywhere the exact wording carries weight keeps the full name: course
// titles, the requirement cards' own titles, every handbook quote, the
// glossary that defines these terms, the course-rules page, and the messages
// copied for the DGS, the advisor and the Grad Admin.
//
// Order matters. "Computer Architecture" has to be tried before
// "Architecture", or it comes out "Computer Arch"; the plural forms before the
// singular ones for the same reason.
//
// The gaps are `\s+`, not a single space: a name typed into the sheet with two
// spaces or a non-breaking space would otherwise miss the long rule and fall
// through to the short one ("Computer  Architecture" -> "Computer  Arch").
const SHORT_FORMS: readonly (readonly [RegExp, string])[] = [
  [/\bComputer\s+Architecture\b/g, 'Comp Arch'],
  [/\bData\s+Science\s+and\s+Artificial\s+Intelligence\b/g, 'DS/AI'],
  [/\bHuman[\s-]+Centered\s+Computing\b/g, 'HCC'],
  [/\bSystems\s+and\s+Software\b/g, 'Sys/Soft'],
  [/\bOperating\s+Systems\b/g, 'OS'],
  [/\bOperating\s+System\b/g, 'OS'],
  [/\bAlgorithms\b/g, 'Alg'],
  [/\bAlgorithm\b/g, 'Alg'],
  [/\bArchitecture\b/g, 'Arch'],
];

/** The short form of a core-area or specialization-group name, for the dense
 * lists a student reads beside their courses. A name none of the forms match
 * — a category the DGS adds to the sheet later — comes back unchanged, so a
 * new group is always readable, just not abbreviated. */
export function shortName(name: string): string {
  let out = name;
  for (const [re, short] of SHORT_FORMS) out = out.replace(re, short);
  return out;
}
