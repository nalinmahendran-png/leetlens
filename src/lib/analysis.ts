import { CORE_TOPICS, RING_THRESHOLDS } from "./topics";
import type { TopicStat } from "./types";

export function ringFor(mastery: number): TopicStat["ring"] {
  if (mastery >= RING_THRESHOLDS.inner) return "inner";
  if (mastery >= RING_THRESHOLDS.middle) return "middle";
  return "outer";
}

/** Turn raw per-tag solved counts into the planet data. */
export function analyzeTopics(tagCounts: Record<string, number>): TopicStat[] {
  return CORE_TOPICS.map((t) => {
    const solved = tagCounts[t.slug] ?? 0;
    const mastery = Math.min(1, solved / t.goal);
    return { slug: t.slug, name: t.name, short: t.short, solved, goal: t.goal, mastery, ring: ringFor(mastery) };
  });
}

/** Weakest first. Ties go to the topic with the bigger goal (the more important one). */
export function weakestTopics(topics: TopicStat[], n = 3): TopicStat[] {
  return [...topics].sort((a, b) => a.mastery - b.mastery || b.goal - a.goal).slice(0, n);
}
