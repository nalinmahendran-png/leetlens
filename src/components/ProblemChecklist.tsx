"use client";

import { ratingTier } from "@/lib/tier";
import { useSyncOnOpen } from "./useSyncOnOpen";

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
  /** problems in this level that LeetCode confirmed as solved */
  solved: string[];
  /** how many solves complete the level */
  needed: number;
}

/**
 * The 31-problem checklist. Read-only: a problem is ticked only once LeetCode shows an accepted
 * submission for it, and the page checks LeetCode for new ones each time it opens.
 */
export default function ProblemChecklist({ username, levelName, levelRange, problems, solved: solvedList, needed }: Props) {
  const solved = new Set(solvedList);
  const checking = useSyncOnOpen(username, problems.every((p) => solved.has(p.slug)));
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
      <p className="note check-note">
        Ticks come from your accepted submissions on LeetCode{checking ? " (checking for new ones…)" : ""}. LeetCode only shares
        your last 20, so a problem you solved before then ticks once you submit it again.
      </p>

      <ol className="checklist">
        {problems.map((p, i) => {
          const isDone = solved.has(p.slug);
          return (
            <li key={p.slug} className={`check-row ${isDone ? "check-row--done" : ""}`}>
              <span className={`check-box ${isDone ? "check-box--done" : ""}`} role="img" aria-label={isDone ? "Solved" : "Not solved yet"}>
                {isDone ? "✓" : ""}
              </span>
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
