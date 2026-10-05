import Link from "next/link";
import type { BoardRange, BoardRow } from "@/lib/leaderboard";
import { fmt, initial, tintFor } from "@/lib/format";

interface Props {
  rows: BoardRow[];
  range: BoardRange;
  username: string;
  solvesToNext: { rank: number; solves: number } | null;
}

export default function Leaderboard({ rows, range, username, solvesToNext }: Props) {
  const base = `/u/${encodeURIComponent(username)}`;
  return (
    <section className="card board" aria-labelledby="board-title">
      <div className="board-head">
        <h2 id="board-title" className="card-title">
          Galaxy ranking
        </h2>
        <div className="seg" role="group" aria-label="Ranking period">
          <Link href={`${base}?range=week`} aria-current={range === "week"}>
            Week
          </Link>
          <Link href={`${base}?range=all`} aria-current={range === "all"}>
            All time
          </Link>
        </div>
      </div>

      {rows.length === 0 && <p className="empty">No solvers yet. Add yourself by exploring your username.</p>}

      {rows.map((r) => (
        <Link key={r.username} href={`/u/${encodeURIComponent(r.username)}`} className={`row ${r.isMe ? "row--me" : ""}`}>
          <span className="row-rank">{r.rank}</span>
          <span className="row-avatar" style={{ background: tintFor(r.username) }} aria-hidden="true">
            {initial(r.username)}
          </span>
          <span className="row-name">{r.isMe ? `${r.username} (you)` : r.username}</span>
          <span className="row-gain">+{r.gain}</span>
          <span className="row-total">{fmt(r.total)}</span>
        </Link>
      ))}

      {solvesToNext && (
        <p className="hint">
          <b>{fmt(solvesToNext.solves)}</b> solves to reach <b>#{solvesToNext.rank}</b> overall.
        </p>
      )}
    </section>
  );
}
