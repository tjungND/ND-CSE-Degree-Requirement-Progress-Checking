// Printing credit counts (DGS 2026-09-08).
//
// Credits stopped being whole numbers when quarter-system universities began
// converting: 4 quarter hours are exactly 8/3 Notre Dame hours. The DGS chose
// to keep the exact value rather than round it, so the ARITHMETIC carries full
// precision — three such courses come to 8, not to a rounded 7.5 that would
// cost the student half a credit against the §5.2 cap — and only the PRINTING
// is shortened. Everything a student reads goes through here.

/** A credit count as a student should read it: a whole number plain ("3"),
 * anything else to at most two decimals with no trailing zeros ("2.67",
 * "2.5"). Never scientific notation, never "2.6666666666666665". */
export function formatCredits(n: number): string {
  if (!Number.isFinite(n)) return String(n);
  const rounded = Number(n.toFixed(2));
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/0$/, '');
}
