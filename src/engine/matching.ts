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
  const chosen = pinned.size >= free.size ? pinned : pinned; // pins are respected either way

  const assignment = new Map<string, string>();
  for (const [group, cand] of chosen) assignment.set(cand.courseId, group);
  const covered = new Set(chosen.keys());
  const suggestions: string[] = [];
  if (free.size > pinned.size) {
    suggestions.push(
      'a different group assignment for your flexible course(s) would cover more distinct groups — try changing the assigned group',
    );
  }
  return {
    distinctCount: chosen.size,
    assignment,
    missingGroups: allGroups.filter((g) => !covered.has(g)),
    suggestions,
  };
}
