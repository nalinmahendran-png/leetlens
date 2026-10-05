import type { TopicStat } from "@/lib/types";
import { TOPIC_BY_SLUG } from "@/lib/topics";
import { fmt } from "@/lib/format";

/**
 * Each topic is a planet. Bigger planet = more solved. The orbit shows how solid the topic
 * is (inner = strong, middle = growing, outer = unexplored). The weakest topic is dashed.
 * Everything is sized with container-query units (cqw), so it scales to any width.
 */
const RINGS = {
  outer: { width: 100, phase: 100, dur: 240 },
  middle: { width: 70, phase: 20, dur: 180 },
  inner: { width: 43.3, phase: 210, dur: 120 },
} as const;

const diameter = (solved: number) => Math.min(12, Math.max(5, 4.6 + Math.sqrt(solved) * 0.78));

export default function SolarSystem({ topics, total, targetSlug }: { topics: TopicStat[]; total: number; targetSlug: string | null }) {
  return (
    <div className="system-col">
      <div className="system-wrap">
        <div className="system" role="img" aria-label={`Your topics as planets around ${total} solved problems. Weakest topic: ${targetSlug ? TOPIC_BY_SLUG[targetSlug]?.name : "none"}.`}>
          {(Object.keys(RINGS) as (keyof typeof RINGS)[]).map((ringName) => {
            const ring = RINGS[ringName];
            const planets = topics.filter((t) => t.ring === ringName);
            const left = (100 - ring.width) / 2;
            return (
              <div
                key={ringName}
                className={`ring ring--${ringName}`}
                style={{ width: `${ring.width}%`, left: `${left}%`, top: `${left}%`, ["--dur" as string]: `${ring.dur}s` }}
              >
                {planets.map((t, i) => {
                  const angle = ((ring.phase + (i * 360) / planets.length) * Math.PI) / 180;
                  const d = diameter(t.solved);
                  const isTarget = t.slug === targetSlug;
                  return (
                    <div
                      key={t.slug}
                      className={`planet ${isTarget ? "planet--target" : ""}`}
                      tabIndex={0}
                      style={{
                        left: `${50 + 50 * Math.cos(angle)}%`,
                        top: `${50 + 50 * Math.sin(angle)}%`,
                        width: `${d}cqw`,
                        height: `${d}cqw`,
                      }}
                    >
                      <div className="planet-inner" style={{ background: TOPIC_BY_SLUG[t.slug]?.color ?? "#c9d0f5" }}>
                        {t.short}
                        <span className="planet-tip">
                          {t.name}: {t.solved} solved · {Math.round(t.mastery * 100)}% of goal
                        </span>
                        {isTarget && <span className="target-tag">{t.name}: next target</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}

          <div className="sun">
            <span className="sun-num">{fmt(total)}</span>
            <span className="sun-label">SOLVED</span>
          </div>
        </div>
      </div>

      <div className="legend">
        <span>Inner ring: strong</span>
        <span>Middle ring: growing</span>
        <span>Outer ring: unexplored</span>
      </div>

      <ul className="sr-only">
        {topics.map((t) => (
          <li key={t.slug}>
            {t.name}: {t.solved} solved, {Math.round(t.mastery * 100)}% of goal, {t.ring} orbit
          </li>
        ))}
      </ul>
    </div>
  );
}
