"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ratingTier } from "@/lib/tier";

export interface ChecklistProblem {
  slug: string;
  title: string;
  rating: number | null;
  contest: string | null;
  q: string | null;
  topic?: string;
  difficulty?: string;
}

interface Props {
  username: string;
  levelName: string;
  levelRange: string;
  problems: ChecklistProblem[];
  initiallySolved: string[];
  /** how many solves complete the level */
  needed: number;
}

/** The 31-problem checklist. Ticks are saved as you click; recent LeetCode solves arrive pre-ticked. */
export default function ProblemChecklist({ username, levelName, levelRange, problems, initiallySolved, needed }: Props) {
  const router = useRouter();
  const [solved, setSolved] = useState<Set<string>>(new Set(initiallySolved));
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function toggle(slug: string) {
    const next = !solved.has(slug);
    setError(null);
    setSolved((s) => {
      const copy = new Set(s);
      if (next) copy.add(slug);
      else copy.delete(slug);
      return copy;
    });
    try {
      const res = await fetch("/api/mark", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, titleSlug: slug, solved: next }),
      });
      if (!res.ok) throw new Error("save failed");
      startTransition(() => router.refresh());
    } catch {
      setError("Couldn't save that tick. Try again.");
      setSolved((s) => {
        const copy = new Set(s);
        if (next) copy.delete(slug);
        else copy.add(slug);
        return copy;
      });
    }
  }

  const done = problems.filter((p) => solved.has(p.slug)).length;
  const pct = problems.length ? Math.round((done / problems.length) * 100) : 0;

  return (
    <section className="card" aria-labelledby="level-title">
      <div className="checklist-head">
        <div>
          <h2 id="level-title" className="card-title">
            {levelName === "Foundations" ? "Foundations" : `Level ${levelName}`}
            <span className="muted" style={{ fontWeight: 500, fontSize: 14, marginLeft: 10 }}>{levelRange}</span>
          </h2>
          <p className="muted" style={{ margin: "4px 0 0", fontSize: 13 }}>
            {done >= needed ? "Level complete. Time to climb." : `Solve ${needed - done} more to complete this level (${needed} of ${problems.length}).`}
          </p>
        </div>
        <div className="checklist-count" aria-live="polite">{done}<small> / {problems.length}</small></div>
      </div>
      <div className="bar-track" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Level progress">
        <div className="bar-fill" style={{ width: `${pct}%` }} />
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}

      <ol className="checklist">
        {problems.map((p, i) => {
          const isDone = solved.has(p.slug);
          return (
            <li key={p.slug} className={`check-row ${isDone ? "check-row--done" : ""}`}>
              <input
                type="checkbox"
                id={`p-${p.slug}`}
                checked={isDone}
                onChange={() => toggle(p.slug)}
                aria-label={`Mark "${p.title}" as solved`}
              />
              <span className="check-num">{i + 1}</span>
              <a className="check-title" href={`https://leetcode.com/problems/${p.slug}/`} target="_blank" rel="noopener noreferrer">
                {p.title}
              </a>
              {isDone && <span className="check-solved">✓ Solved</span>}
              <span className="check-tag">
                {p.contest ? `${p.contest} · ${p.q}` : p.topic ? p.topic.replace(/-/g, " ") : ""}
              </span>
              {p.rating !== null ? (
                <span className={`badge tier-${ratingTier(p.rating)}`}>{p.rating}</span>
              ) : (
                <span className={`badge diff-${p.difficulty}`}>{p.difficulty}</span>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
