import { analyzeTopics } from "./analysis";
import { CURATED } from "./curated";
import { PRACTICE_TOPICS, RING_THRESHOLDS } from "./topics";
import type { CatalogProblem, Difficulty, Recommendation, TopicStat } from "./types";

export type DailyKind = "strong" | "practice";

export interface DailySlot {
  kind: DailyKind;
  /** tried in order: the first is the slot's real difficulty, the rest are fallbacks */
  difficulties: Difficulty[];
}

/**
 * The daily set, in display order:
 * 1. Easy, from your strongest topic (most solved): a confident warm-up.
 * 2. Medium, from your next strongest topic: a step up in familiar territory.
 * 3. Easy (Medium if no Easy is left), from a topic you've started but practise less. Each such topic
 *    gets a turn: the slot moves to the next one every day.
 */
export const DAILY_SLOTS: DailySlot[] = [
  { kind: "strong", difficulties: ["Easy", "Medium"] },
  { kind: "strong", difficulties: ["Medium", "Easy"] },
  { kind: "practice", difficulties: ["Easy", "Medium"] },
];

/** How many of the strongest topics a strong slot draws from before widening to all topics. */
const POOL_SIZE = 4;

/** Solves needed before a topic counts as started; one or two can be a stray tag on another problem. */
const MIN_STARTED = 3;

/**
 * The tags LeetCode's public per-topic solved counts (the "Skills" on a profile) cover, largest first.
 * A 0 there means the user has solved no problem with that tag, so any problem carrying it is surely
 * new to them. That's the only proof we have: the public data lists just the last 20 solves.
 * Left out: "heap" (an old slug that matches no problem's tags) and "database" (SQL, never suggested).
 */
export const COUNTED_TAGS = [
  "array", "string", "hash-table", "math", "dynamic-programming", "sorting", "greedy", "binary-search",
  "depth-first-search", "bit-manipulation", "matrix", "tree", "two-pointers", "breadth-first-search", "simulation",
  "graph", "stack", "binary-tree", "sliding-window", "enumeration", "design", "backtracking", "union-find",
  "segment-tree", "linked-list", "ordered-set", "monotonic-stack", "divide-and-conquer", "trie", "queue", "bitmask",
  "binary-indexed-tree", "recursion", "shortest-path", "topological-sort", "rolling-hash", "game-theory",
  "monotonic-queue", "data-stream", "brainteaser", "randomized", "iterator", "suffix-array", "quickselect", "sweep-line",
];
const COUNTED = new Set(COUNTED_TAGS);

/** How many never-solved tags we search for surely-new problems: one LeetCode request each, per difficulty. */
const FRESH_TAG_LIMIT = 6;

/** True when the problem carries a counted tag the user has never solved, so they can't have solved it. */
export function surelyUnsolved(problem: { tags: string[] }, tagCounts: Record<string, number>): boolean {
  return problem.tags.some((t) => COUNTED.has(t) && !(tagCounts[t] > 0));
}

export interface DailyPick extends Recommendation {
  kind: DailyKind;
  /** index into DAILY_SLOTS */
  slot: number;
}

export interface RecommendDeps {
  /** Live problem list for a topic + difficulty, with tags. Reject/throw to fall back to the curated list. */
  fetchProblems?: (tagSlug: string, difficulty: Difficulty) => Promise<CatalogProblem[]>;
}

export interface PickInput {
  /** tagSlug -> solved count, straight from the profile */
  tagCounts: Record<string, number>;
  exclude: Set<string>;
  usedTopics: Set<string>;
  /** the set's day number: picks which started topic the practice slot is on today */
  day?: number;
}

const problemUrl = (slug: string) => `https://leetcode.com/problems/${slug}/`;

/** Where problems come from, shared by every slot of one daily set so each list is fetched once. */
interface ProblemSource {
  /** live problems for a topic; empty once LeetCode has failed */
  live: (tagSlug: string, difficulty: Difficulty) => Promise<CatalogProblem[]>;
  /** live problems for a topic that the user surely hasn't solved */
  fresh: (tagSlug: string, difficulty: Difficulty) => Promise<CatalogProblem[]>;
}

function problemSource(deps: RecommendDeps, tagCounts: Record<string, number>): ProblemSource {
  let fetchProblems = deps.fetchProblems;
  // after one failure (LeetCode unreachable) we stop waiting on it
  const live = async (tagSlug: string, difficulty: Difficulty): Promise<CatalogProblem[]> => {
    if (!fetchProblems) return [];
    try {
      return await fetchProblems(tagSlug, difficulty);
    } catch {
      fetchProblems = undefined;
      return [];
    }
  };

  const neverSolved = (tag: string) => COUNTED.has(tag) && !(tagCounts[tag] > 0);
  const freshTags = COUNTED_TAGS.filter(neverSolved).slice(0, FRESH_TAG_LIMIT);
  const freshPools = new Map<Difficulty, Promise<CatalogProblem[]>>();
  /** Everything carrying one of the user's never-solved tags, at one difficulty. */
  const freshPool = (difficulty: Difficulty) => {
    if (!freshPools.has(difficulty)) {
      freshPools.set(difficulty, Promise.all(freshTags.map((t) => live(t, difficulty))).then((lists) => lists.flat()));
    }
    return freshPools.get(difficulty)!;
  };

  return {
    live,
    async fresh(tagSlug, difficulty) {
      // a topic the user has never touched: its whole list is new to them
      const list = neverSolved(tagSlug)
        ? await live(tagSlug, difficulty)
        : (await freshPool(difficulty)).filter((p) => p.tags.includes(tagSlug));
      return list.filter((p) => surelyUnsolved(p, tagCounts));
    },
  };
}

/** Topics for a slot, best first, skipping topics already in today's set. */
function topicPool(slot: DailySlot, input: PickInput): TopicStat[] {
  if (slot.kind === "strong") {
    return analyzeTopics(input.tagCounts)
      .filter((t) => !input.usedTopics.has(t.slug))
      .sort((a, b) => b.solved - a.solved || b.mastery - a.mastery);
  }

  // Practice: topics you've started but that aren't solid yet (not on the inner ring), taking turns
  // day by day; then other topics you've touched (taking turns themselves when nothing is started yet,
  // as for beginners). Brand-new topics only if you've touched nothing else.
  const topics = analyzeTopics(input.tagCounts, PRACTICE_TOPICS)
    .filter((t) => !input.usedTopics.has(t.slug))
    .sort((a, b) => a.mastery - b.mastery || a.solved - b.solved);
  const learning = topics.filter((t) => t.solved >= MIN_STARTED && t.mastery < RING_THRESHOLDS.inner);
  const touched = topics.filter((t) => t.solved > 0 && !learning.includes(t));
  const [turns, rest] = learning.length ? [learning, touched] : [touched, []];
  const turn = turns.length ? (input.day ?? 0) % turns.length : 0;
  const pool = [...turns.slice(turn), ...turns.slice(0, turn), ...rest];
  return pool.length ? pool : topics;
}

/**
 * One problem for one slot. A strong slot tries its difficulties in order across its top topics, then
 * across all topics; the practice slot stays on today's topic (either difficulty) before moving on.
 * First only problems the user surely hasn't solved (easiest first), then, if none is left anywhere
 * or LeetCode is unreachable, the best guess (live problems by acceptance rate, then hand-picked
 * classics). Paid problems are dropped. Null when nothing unexcluded is left.
 */
async function pickForSlot(slotIndex: number, input: PickInput, source: ProblemSource): Promise<DailyPick | null> {
  const slot = DAILY_SLOTS[slotIndex];
  const pool = topicPool(slot, input);
  const tiers = slot.kind === "strong" ? [pool.slice(0, POOL_SIZE), pool.slice(POOL_SIZE)] : pool.map((t) => [t]);
  const usable = (p: { titleSlug: string; difficulty: Difficulty; paidOnly?: boolean }, difficulty: Difficulty) =>
    p.difficulty === difficulty && !p.paidOnly && !input.exclude.has(p.titleSlug);
  const easiest = (list: CatalogProblem[], difficulty: Difficulty) =>
    list.filter((p) => usable(p, difficulty)).sort((a, b) => (b.acRate ?? 0) - (a.acRate ?? 0))[0];

  const passes = [
    async (topic: string, difficulty: Difficulty) => easiest(await source.fresh(topic, difficulty), difficulty),
    async (topic: string, difficulty: Difficulty) =>
      easiest(await source.live(topic, difficulty), difficulty) ?? (CURATED[topic] ?? []).find((c) => usable(c, difficulty)),
  ];

  for (const find of passes) {
    for (const topics of tiers) {
      for (const difficulty of slot.difficulties) {
        for (const topic of topics) {
          const pick = await find(topic.slug, difficulty);
          if (pick) {
            return {
              titleSlug: pick.titleSlug,
              title: pick.title,
              difficulty,
              topicSlug: topic.slug,
              topicName: topic.name,
              url: problemUrl(pick.titleSlug),
              kind: slot.kind,
              slot: slotIndex,
            };
          }
        }
      }
    }
  }
  return null;
}

/** The whole daily set: one pick per slot, each from a different topic when possible. */
export async function pickDaily(
  input: { tagCounts: Record<string, number>; exclude: Set<string>; day?: number },
  deps: RecommendDeps = {},
): Promise<DailyPick[]> {
  const source = problemSource(deps, input.tagCounts);
  const exclude = new Set(input.exclude);
  const usedTopics = new Set<string>();
  const picks: DailyPick[] = [];

  for (let slot = 0; slot < DAILY_SLOTS.length; slot++) {
    const base = { tagCounts: input.tagCounts, exclude, day: input.day };
    const pick =
      (await pickForSlot(slot, { ...base, usedTopics }, source)) ??
      // every topic is already used today: allow a repeat topic rather than leaving the slot empty
      (await pickForSlot(slot, { ...base, usedTopics: new Set() }, source));
    if (!pick) continue;
    exclude.add(pick.titleSlug);
    usedTopics.add(pick.topicSlug);
    picks.push(pick);
  }
  return picks;
}

/** One replacement for a slot (the "solved it before, swap it" button). */
export async function pickReplacement(slot: number, input: PickInput, deps: RecommendDeps = {}): Promise<DailyPick | null> {
  const source = problemSource(deps, input.tagCounts);
  return (await pickForSlot(slot, input, source)) ?? (await pickForSlot(slot, { ...input, usedTopics: new Set() }, source));
}
