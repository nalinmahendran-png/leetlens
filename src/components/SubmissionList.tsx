"use client";

import { useState } from "react";
import { langName } from "@/lib/format";
import type { Hints } from "@/lib/hints";
import Rich from "./Rich";

export interface SubmissionRow {
  id: string;
  title: string;
  titleSlug: string;
  lang: string;
  /** "Accepted", "Wrong Answer", ... */
  status: string;
  runtime: string;
  memory: string;
  /** preformatted on the server, e.g. "Sep 29" */
  date: string;
  hasHints: boolean;
}

const FOCUS: Record<Hints["focus"], { label: string; cls: string }> = {
  runtime: { label: "Beat it on runtime", cls: "verdict--good" },
  memory: { label: "Beat it on memory", cls: "verdict--good" },
  both: { label: "Beat it on runtime and memory", cls: "verdict--good" },
  already_optimal: { label: "Already near optimal", cls: "verdict--optimal" },
};

export default function SubmissionList({ username, rows }: { username: string; rows: SubmissionRow[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const [hints, setHints] = useState<Record<string, Hints>>({});
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<{ id: string; message: string } | null>(null);

  async function toggle(id: string) {
    if (open === id) return setOpen(null);
    setOpen(id);
    setError(null);
    if (hints[id]) return;
    setLoading(id);
    try {
      const res = await fetch("/api/hints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, submissionId: id }),
      });
      const data = (await res.json().catch(() => null)) as { ok: true; hints: Hints } | { ok: false; error: string } | null;
      if (data?.ok) setHints((h) => ({ ...h, [id]: data.hints }));
      else setError({ id, message: data?.error ?? "Something went wrong. Please try again." });
    } catch {
      setError({ id, message: "Couldn't reach the server." });
    } finally {
      setLoading((l) => (l === id ? null : l));
    }
  }

  if (rows.length === 0) {
    return <p className="card empty">No submissions saved yet. They appear here after this profile&apos;s next refresh.</p>;
  }

  return (
    <div className="card subs">
      {rows.map((r) => {
        const isOpen = open === r.id;
        return (
          <div key={r.id} className={`sub ${isOpen ? "sub--open" : ""}`}>
            <div className="sub-row">
              {r.status === "Accepted" && (
                <span className="tick" role="img" aria-label="Solved">
                  ✓
                </span>
              )}
              <a className="sub-title" href={`https://leetcode.com/problems/${r.titleSlug}/`} target="_blank" rel="noopener noreferrer">
                {r.title}
              </a>
              <span className="sub-meta">
                <span>{langName(r.lang)}</span>
                <span>{r.runtime}</span>
                <span>{r.memory}</span>
                <span className="sub-date">{r.date}</span>
              </span>
              <button type="button" className={`pill pill--small ${isOpen ? "pill--active" : ""}`} onClick={() => toggle(r.id)} aria-expanded={isOpen}>
                {isOpen ? "Hide" : r.hasHints || hints[r.id] ? "Show hints" : "Beat this"}
              </button>
            </div>
            {isOpen && (
              <div className="coach hint-panel" aria-live="polite">
                {loading === r.id ? (
                  <p className="muted">
                    Searching the web for {langName(r.lang)} solutions faster than {r.runtime} / {r.memory}… this can take a minute or two.
                  </p>
                ) : error?.id === r.id ? (
                  <p className="form-error">{error.message}</p>
                ) : hints[r.id] ? (
                  <HintPanel row={r} hints={hints[r.id]} />
                ) : null}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function HintPanel({ row, hints }: { row: SubmissionRow; hints: Hints }) {
  const focus = FOCUS[hints.focus];
  const plain = (s: string) => s.replace(/`/g, "");

  return (
    <>
      <div className="coach-head">
        <span className={`verdict ${focus.cls}`}>{focus.label}</span>
        <span className="muted">
          Best known: <code>{plain(hints.best.time)}</code> time · <code>{plain(hints.best.space)}</code> space
        </span>
      </div>
      <p className="coach-summary">
        <Rich text={hints.focusReason} />
      </p>

      <div className="compare">
        <div>
          <small>Yours</small>
          <b>
            {row.runtime} · {row.memory}
          </b>
        </div>
        <div>
          <small>Fastest reported online</small>
          <b>{hints.fastestReported ? <Rich text={hints.fastestReported} /> : "No runtime reported"}</b>
        </div>
      </div>

      <h3>How to beat it</h3>
      <ol className="coach-list">
        {hints.hints.map((h, i) => (
          <li key={i}>
            <Rich text={h} />
          </li>
        ))}
      </ol>

      {hints.sources.length > 0 ? (
        <details className="sources">
          <summary>Sources ({hints.sources.length}). These contain full solutions, so try the hints first</summary>
          <ul>
            {hints.sources.map((s) => (
              <li key={s.url}>
                <a href={s.url} target="_blank" rel="noopener noreferrer">
                  {s.title || s.url}
                </a>
              </li>
            ))}
          </ul>
        </details>
      ) : (
        <p className="note">The web search found nothing usable this time, so these hints come from Claude&apos;s own knowledge.</p>
      )}
      <p className="note">LeetCode&apos;s runtimes vary a little between runs, so resubmit a couple of times to compare.</p>
    </>
  );
}
