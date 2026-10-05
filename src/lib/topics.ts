/**
 * The topics shown as planets. `slug` is LeetCode's tag slug (the same one used in
 * `tagProblemCounts` and in problem-list filters). `goal` is how many solved problems
 * we treat as "solid" for that topic; mastery = solved / goal, capped at 1.
 * Tune these freely -- they only affect the visuals and the recommendation order.
 */
export interface CoreTopic {
  slug: string;
  name: string;
  /** short label printed on the planet */
  short: string;
  goal: number;
  color: string;
}

export const CORE_TOPICS: CoreTopic[] = [
  { slug: "array", name: "Arrays", short: "Arr", goal: 80, color: "#7fd6ff" },
  { slug: "string", name: "Strings", short: "Str", goal: 50, color: "#a8f0c4" },
  { slug: "hash-table", name: "Hash Tables", short: "Hsh", goal: 50, color: "#ffd6a8" },
  { slug: "two-pointers", name: "Two Pointers", short: "2Pt", goal: 30, color: "#c9b8ff" },
  { slug: "binary-search", name: "Binary Search", short: "Bin", goal: 30, color: "#ffb0c8" },
  { slug: "linked-list", name: "Linked Lists", short: "Lnk", goal: 20, color: "#ffe08a" },
  { slug: "stack", name: "Stacks", short: "Stk", goal: 25, color: "#8ff0e0" },
  { slug: "tree", name: "Trees", short: "Tre", goal: 40, color: "#c9b8ff" },
  { slug: "graph", name: "Graphs", short: "Grf", goal: 30, color: "#ff8fab" },
  { slug: "backtracking", name: "Backtracking", short: "Bkt", goal: 20, color: "#ffc857" },
  { slug: "greedy", name: "Greedy", short: "Grd", goal: 35, color: "#ffd6a8" },
  { slug: "dynamic-programming", name: "Dynamic Programming", short: "DP", goal: 50, color: "#ffb0c8" },
];

export const TOPIC_BY_SLUG: Record<string, CoreTopic> = Object.fromEntries(
  CORE_TOPICS.map((t) => [t.slug, t]),
);

/** Mastery thresholds that decide which orbit a planet sits on. */
export const RING_THRESHOLDS = { inner: 0.6, middle: 0.25 } as const;
