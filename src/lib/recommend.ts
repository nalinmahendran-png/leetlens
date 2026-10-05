import { CURATED } from "./curated";
import type { CatalogProblem, Difficulty, Recommendation, TopicStat } from "./types";

export type DailyKind = "strong" | "new";

export interface DailySlot {
  kind: DailyKind;
  /** tried in order: the first is the slot's real difficulty, the rest are fallbacks */
  difficulties: Difficulty[];
}

/**
 * The daily set, in display order:
 * 1. Easy, from your strongest topic (most solved): a confident warm-up.
 * 2. Medium, from your next strongest topic: a step up in familiar territory.
 * 3. Easy (Medium if no Easy is left), from the topic you've touched least: something new.
 */
export const DAILY_SLOTS: DailySlot[] = [
  { kind: "strong", difficulties: ["Easy", "Medium"] },
  { kind: "strong", difficulties: ["Medium", "Easy"] },
  { kind: "new", difficulties: ["Easy", "Medium"] },
];

/** How many of the strongest / least-touched topics a slot draws from before widening to all topics. */
const POOL_SIZE = 4;

export interface DailyPick extends Recommendation {
  kind: DailyKind;
  /** index into DAILY_SLOTS */
  slot: number;
}

export interface RecommendDeps {
  /** Live problem list for a topic + difficulty. Reject/throw to fall back to the curated list. */
  fetchProblems?: (tagSlug: string, difficulty: Difficulty) => Promise<CatalogProblem[]>;
}

const problemUrl = (slug: string) => `https://leetcode.com/problems/${slug}/`;

/** Wraps the live fetcher so that after one failure (LeetCode unreachable) we stop waiting on it. */
function liveSource(deps: RecommendDeps) {
  let fetchProblems = deps.fetchProblems;
  return async (tagSlug: string, difficulty: Difficulty): Promise<CatalogProblem[]> => {
    if (!fetchProblems) return [];
    try {
      return await fetchProblems(tagSlug, difficulty);
    } catch {
      fetchProblems = undefined;
      return [];
    }
  };
}

/** Topics for a slot, best first: strongest (most solved) or least touched, skipping topics already in today's set. */
function topicPool(slot: DailySlot, topics: TopicStat[], usedTopics: Set<string>): TopicStat[] {
  const ranked = [...topics].sort((a, b) =>
    slot.kind === "strong" ? b.solved - a.solved || b.mastery - a.mastery : a.solved - b.solved || a.mastery - b.mastery,
  );
  return ranked.filter((t) => !usedTopics.has(t.slug));
}

/**
 * One problem for one slot. Tries the slot's difficulties in order across its top topics, then across
 * all topics. Within a topic: hand-picked classics first, then live problems with the highest
 * acceptance rate (paid ones dropped). Null when nothing unexcluded is left.
 */
export async function pickForSlot(
  slotIndex: number,
  input: { topics: TopicStat[]; exclude: Set<string>; usedTopics: Set<string> },
  live: (tagSlug: string, difficulty: Difficulty) => Promise<CatalogProblem[]>,
): Promise<DailyPick | null> {
  const slot = DAILY_SLOTS[slotIndex];
  const pool = topicPool(slot, input.topics, input.usedTopics);

  for (const topics of [pool.slice(0, POOL_SIZE), pool.slice(POOL_SIZE)]) {
    for (const difficulty of slot.difficulties) {
      for (const topic of topics) {
        const classic = (CURATED[topic.slug] ?? []).find((c) => c.difficulty === difficulty && !input.exclude.has(c.titleSlug));
        const pick =
          classic ??
          (await live(topic.slug, difficulty))
            .filter((p) => p.difficulty === difficulty && !p.paidOnly && !input.exclude.has(p.titleSlug))
            .sort((a, b) => (b.acRate ?? 0) - (a.acRate ?? 0))[0];
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
  return null;
}

/** The whole daily set: one pick per slot, each from a different topic when possible. */
export async function pickDaily(input: { topics: TopicStat[]; exclude: Set<string> }, deps: RecommendDeps = {}): Promise<DailyPick[]> {
  const live = liveSource(deps);
  const exclude = new Set(input.exclude);
  const usedTopics = new Set<string>();
  const picks: DailyPick[] = [];

  for (let slot = 0; slot < DAILY_SLOTS.length; slot++) {
    const pick =
      (await pickForSlot(slot, { topics: input.topics, exclude, usedTopics }, live)) ??
      // every topic is already used today: allow a repeat topic rather than leaving the slot empty
      (await pickForSlot(slot, { topics: input.topics, exclude, usedTopics: new Set() }, live));
    if (!pick) continue;
    exclude.add(pick.titleSlug);
    usedTopics.add(pick.topicSlug);
    picks.push(pick);
  }
  return picks;
}

/** One replacement for a slot (the "solved it before, swap it" button). */
export async function pickReplacement(
  slot: number,
  input: { topics: TopicStat[]; exclude: Set<string>; usedTopics: Set<string> },
  deps: RecommendDeps = {},
): Promise<DailyPick | null> {
  const live = liveSource(deps);
  return (await pickForSlot(slot, input, live)) ?? (await pickForSlot(slot, { ...input, usedTopics: new Set() }, live));
}
