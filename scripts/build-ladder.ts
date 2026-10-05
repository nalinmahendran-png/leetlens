/**
 * Regenerates data/ladder.json from the community rating dataset.
 *   npm run ladder:build
 * Run it whenever you want fresh contest problems (the source updates after every contest).
 * Ratings: zerotrac/leetcode_problem_rating (MIT) -- https://github.com/zerotrac/leetcode_problem_rating
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { CURATED } from "../src/lib/curated";
import { buildRatedLevels, type LadderLevel, type RatingRow } from "../src/lib/ladderBuild";

const SOURCE = "https://raw.githubusercontent.com/zerotrac/leetcode_problem_rating/main/data.json";

/** Level 0: 31 classic problems, easiest first, spread over the core topics. */
const FOUNDATIONS: [topic: string, slug: string][] = [
  ["hash-table", "two-sum"], ["array", "contains-duplicate"], ["string", "valid-anagram"], ["string", "valid-palindrome"],
  ["hash-table", "happy-number"], ["two-pointers", "move-zeroes"], ["binary-search", "binary-search"],
  ["array", "best-time-to-buy-and-sell-stock"], ["stack", "valid-parentheses"], ["linked-list", "reverse-linked-list"],
  ["linked-list", "merge-two-sorted-lists"], ["linked-list", "linked-list-cycle"], ["tree", "invert-binary-tree"],
  ["tree", "maximum-depth-of-binary-tree"], ["tree", "same-tree"], ["dynamic-programming", "climbing-stairs"],
  ["graph", "flood-fill"], ["graph", "find-if-path-exists-in-graph"], ["greedy", "assign-cookies"],
  ["array", "maximum-subarray"], ["array", "product-of-array-except-self"], ["string", "group-anagrams"],
  ["hash-table", "top-k-frequent-elements"], ["hash-table", "longest-consecutive-sequence"], ["two-pointers", "3sum"],
  ["stack", "min-stack"], ["tree", "binary-tree-level-order-traversal"], ["dynamic-programming", "house-robber"],
  ["dynamic-programming", "coin-change"], ["graph", "number-of-islands"], ["backtracking", "subsets"],
];

function foundations(): LadderLevel {
  const bySlug = new Map(Object.values(CURATED).flat().map((c) => [c.titleSlug, c]));
  return {
    id: 0,
    name: "Foundations",
    range: "Classics",
    minRating: null,
    problems: FOUNDATIONS.map(([topic, slug]) => {
      const c = bySlug.get(slug);
      if (!c) throw new Error(`Foundations problem "${slug}" is missing from curated.ts`);
      return { slug, title: c.title, rating: null, contest: null, q: null, topic, difficulty: c.difficulty };
    }),
  };
}

async function main() {
  const res = await fetch(SOURCE);
  if (!res.ok) throw new Error(`Could not download ratings (HTTP ${res.status}) from ${SOURCE}`);
  const rows = (await res.json()) as RatingRow[];

  const rated = buildRatedLevels(rows).map((l, i) => ({ id: i + 1, ...l }));
  const levels = [foundations(), ...rated];
  const out = { generatedAt: new Date().toISOString(), source: SOURCE, levels };

  const file = path.join(__dirname, "..", "data", "ladder.json");
  writeFileSync(file, JSON.stringify(out, null, 1) + "\n");
  console.log(`Wrote ${levels.length} levels (${levels.reduce((s, l) => s + l.problems.length, 0)} problems) to data/ladder.json`);
  for (const l of levels) console.log(`  L${l.id} ${l.range.padEnd(10)} ${l.problems.length} problems`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
