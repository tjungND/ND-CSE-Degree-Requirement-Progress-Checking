// §4.4.2 distinct-group matching: "three category specialization courses from
// three distinct groups". A course listed under every group ('any', e.g.
// Research Methods) can stand in for whichever group the student still needs —
// Kuhn's augmenting-path bipartite matching (≤5 groups, tiny) finds the best
// assignment deterministically, honoring the student's own pick when possible.
export interface GroupCandidate {
  courseId: string;
  title: string;
  /** Groups this course may fill (one fixed group, or all of them for 'any'). */
  groups: string[];
  /** The student's pinned choice for an 'any' course (decision Q2). */
  pinned?: string;
  sortKey: string; // deterministic iteration order
}

export interface MatchResult {
  /** Number of distinct groups covered (= matched courses, one per group). */
  distinctCount: number;
  /** courseId → group code, for the courses in the matching. */
  assignment: Map<string, string>;
  missingGroups: string[];
  /** Non-empty when ignoring a pin would cover more groups. */
  suggestions: string[];
  /** True when the student's pins were set aside because a different
   * assignment covers more groups (2026-09-12: a pick is a preference). */
  pinsIgnored: boolean;
  /** The coverage-maximising assignment, pins ignored: courseId → group. What
   * the page pre-fills for a flexible course (2026-09-12). */
  bestAssignment: Map<string, string>;
}

export function matchDistinctGroups(candidates: GroupCandidate[], allGroups: string[]): MatchResult {
  const run = (honorPins: boolean) => {
    const cands = [...candidates].sort((a, b) => a.sortKey.localeCompare(b.sortKey));
    const groupOf = new Map<string, GroupCandidate>(); // group → matched course
    const options = (c: GroupCandidate) =>
      honorPins && c.pinned ? [c.pinned] : c.groups.filter((g) => allGroups.includes(g));

    const tryAssign = (c: GroupCandidate, visited: Set<string>): boolean => {
      for (const g of options(c)) {
        if (visited.has(g)) continue;
        visited.add(g);
        const holder = groupOf.get(g);
        if (!holder || tryAssign(holder, visited)) {
          groupOf.set(g, c);
          return true;
        }
      }
      return false;
    };

    for (const c of cands) tryAssign(c, new Set());
    return groupOf;
  };

  const pinned = run(true);
  const free = run(false);
  // A pin is honoured while it costs nothing; when a different assignment
  // covers more groups, the matcher takes that one (DGS 2026-09-12 — the
  // red-team's F2: a legitimate pick turned a met row into "Not yet"). The
  // page pre-fills the pins from `bestAssignment` and says so.
  const pinsIgnored = free.size > pinned.size;
  const chosen = pinsIgnored ? free : pinned;

  const assignment = new Map<string, string>();
  for (const [group, cand] of chosen) assignment.set(cand.courseId, group);
  const bestAssignment = new Map<string, string>();
  for (const [group, cand] of free) bestAssignment.set(cand.courseId, group);
  const covered = new Set(chosen.keys());
  const suggestions: string[] = [];
  if (pinsIgnored) {
    suggestions.push('the group assignment of your flexible course(s) was chosen to cover the most groups — the page set it for you, and you can change it next to the course');
  }
  return {
    distinctCount: chosen.size,
    assignment,
    missingGroups: allGroups.filter((g) => !covered.has(g)),
    suggestions,
    pinsIgnored,
    bestAssignment,
  };
}
