import type { NormalizedProfile } from "./types";

/**
 * Fake LeetCode data so the app runs fully offline.
 * - The username "demo" always returns this data.
 * - Set USE_MOCK_LEETCODE=1 to use it (varied by username) for every username.
 */
export function isMockUser(username: string): boolean {
  return username.toLowerCase() === "demo" || process.env.USE_MOCK_LEETCODE === "1";
}

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rng(seed: number) {
  let s = seed || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Tag counts for the "demo" user: strong on arrays/trees, weak on graphs. */
export const DEMO_TAG_COUNTS: Record<string, number> = {
  array: 96,
  string: 64,
  "hash-table": 52,
  "two-pointers": 33,
  "binary-search": 30,
  "linked-list": 24,
  stack: 22,
  tree: 58,
  graph: 6,
  backtracking: 9,
  greedy: 14,
  "dynamic-programming": 21,
};

export function mockProfile(username: string, now = new Date()): NormalizedProfile {
  const isDemo = username.toLowerCase() === "demo";
  const rand = rng(hash(username.toLowerCase()));

  // difficulty split + topic counts
  let easy = 168, medium = 205, hard = 39;
  let tagCounts = { ...DEMO_TAG_COUNTS };
  if (!isDemo) {
    easy = 40 + Math.floor(rand() * 200);
    medium = 30 + Math.floor(rand() * 260);
    hard = Math.floor(rand() * 70);
    tagCounts = Object.fromEntries(
      Object.entries(DEMO_TAG_COUNTS).map(([slug, n]) => [slug, Math.max(0, Math.round(n * (0.3 + rand() * 1.3)))]),
    );
  }
  const total = easy + medium + hard;

  // a year of daily submission counts, busier recently (so the growth curve rises)
  const calendar: Record<string, number> = {};
  const dayStart = Math.floor(now.getTime() / 86_400_000) * 86_400;
  for (let d = 364; d >= 0; d--) {
    const t = 1 - d / 364; // 0 (a year ago) .. 1 (today)
    if (rand() < 0.28 - 0.1 * t) continue; // days off
    calendar[String(dayStart - d * 86_400)] = 1 + Math.floor(rand() * (2 + 6 * t));
  }

  const nowSec = Math.floor(now.getTime() / 1000);
  return {
    username: isDemo ? "demo" : username,
    realName: isDemo ? "Demo Coder" : null,
    avatar: null,
    ranking: 100_000 + Math.floor(rand() * 400_000),
    easy,
    medium,
    hard,
    total,
    tagCounts,
    streak: isDemo ? 23 : 1 + Math.floor(rand() * 40),
    totalActiveDays: Object.keys(calendar).length,
    calendar,
    recentAc: [
      { title: "Binary Tree Level Order Traversal", titleSlug: "binary-tree-level-order-traversal", timestamp: nowSec - 3_600 },
      { title: "Two Sum", titleSlug: "two-sum", timestamp: nowSec - 90_000 },
      { title: "Valid Parentheses", titleSlug: "valid-parentheses", timestamp: nowSec - 180_000 },
      { title: "Maximum Subarray", titleSlug: "maximum-subarray", timestamp: nowSec - 270_000 },
    ],
  };
}
