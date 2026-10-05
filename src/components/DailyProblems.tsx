"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { timeUntil } from "@/lib/format";
import type { DailyProblem } from "@/lib/types";

type Props = {
  username: string;
  problems: DailyProblem[];
  /** ISO time of the coming midnight */
  resetsAt: string;
  /** countdown text rendered on the server, e.g. "5h 12m" (the browser keeps it ticking) */
  resetsIn: string;
};

/**
 * Today's set: Easy and Medium from your strongest topics, then one from a new topic. Problems solved
 * today turn green; "solved it before" swaps in a fresh problem for that slot. The set resets at midnight.
 */
export default function DailyProblems({ username, problems, resetsAt, resetsIn }: Props) {
  const router = useRouter();
  const [left, setLeft] = useState(resetsIn);
  const [checking, setChecking] = useState(false);
  const [swapping, setSwapping] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const allSolved = problems.every((p) => p.solved);

  // Solved one on LeetCode since the last sync? Ask the server to re-sync (it skips if it synced in the
  // last 5 minutes), then reload the page data so new solves turn green without pressing Refresh.
  useEffect(() => {
    if (allSolved) return;
    let cancelled = false;
    setChecking(true);
    fetch("/api/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username }) })
      .then((res) => {
        if (res.ok && !cancelled) startTransition(() => router.refresh());
      })
      .catch(() => undefined)
      .finally(() => !cancelled && setChecking(false));
    return () => {
      cancelled = true;
    };
  }, [username]); // once per page visit, not again after each refresh

  // Tick the countdown every 30 s; at midnight, load the new set.
  useEffect(() => {
    const end = new Date(resetsAt);
    setLeft(timeUntil(end));
    const timer = setInterval(() => {
      if (Date.now() >= end.getTime()) {
        clearInterval(timer);
        router.refresh();
      } else {
        setLeft(timeUntil(end));
      }
    }, 30_000);
    return () => clearInterval(timer);
  }, [resetsAt, router]);

  async function swap(titleSlug: string) {
    setSwapping(titleSlug);
    setError(null);
    const res = await fetch("/api/daily/swap", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, titleSlug }),
    }).catch(() => null);
    const data = (await res?.json().catch(() => null)) as { ok: boolean; error?: string } | null;
    if (!data?.ok) {
      setError(data?.error ?? "Couldn't swap that problem. Try again.");
      setSwapping(null);
      return;
    }
    // keep "Swapping…" on screen until the refreshed set has arrived
    startTransition(() => {
      setSwapping(null);
      router.refresh();
    });
  }

  if (problems.length === 0) return <p className="muted">Nothing left to suggest right now. Nice work!</p>;
  const done = problems.filter((p) => p.solved).length;

  return (
    <>
      {problems.map((p) => (
        <div className={`mission ${p.solved ? "mission--done" : ""}`} key={p.titleSlug}>
          <div className="mission-top">
            <a className="mission-title" href={p.url} target="_blank" rel="noopener noreferrer">
              {p.title}
            </a>
            {p.solved && (
              <span className="tick tick--big" role="img" aria-label="Solved">
                ✓
              </span>
            )}
          </div>
          <div className="mission-meta">
            <span>
              <span className={p.kind === "new" ? "kind kind--new" : "kind"}>{p.kind === "new" ? "New topic" : "Strong topic"}</span> · {p.topicName}
            </span>
            <span className={`diff-${p.difficulty}`}>{p.difficulty}</span>
          </div>
          <div className="mission-actions">
            {p.solved ? (
              <span className="solved-label">Solved</span>
            ) : (
              <button type="button" className="link-btn" onClick={() => swap(p.titleSlug)} disabled={swapping !== null}>
                {swapping === p.titleSlug ? "Swapping…" : "Solved it before? Swap it"}
              </button>
            )}
          </div>
        </div>
      ))}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <p className={`daily-foot ${allSolved ? "daily-foot--done" : ""}`}>
        {allSolved ? `All ${problems.length} solved today ✓` : `${done} of ${problems.length} solved`} · new set at midnight, in {left}
        {checking && !allSolved && <span className="muted"> · checking LeetCode…</span>}
      </p>
    </>
  );
}
