import Link from "next/link";
import UsernameForm from "@/components/UsernameForm";
import { getLeaderboard } from "@/lib/leaderboard";
import { fmt, initial, tintFor } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function Home() {
  const board = await getLeaderboard({ range: "all", limit: 5 }).catch(() => null);

  return (
    <main className="shell">
      <header className="nav">
        <span className="logo">LEETLENS</span>
      </header>

      <section className="hero">
        <h1>Your problem-solving universe</h1>
        <p>
          Enter your LeetCode username. We turn your solved problems into a solar system, point you at the topics that need
          love, and let you race your friends.
        </p>
        <UsernameForm />
      </section>

      <section className="steps" aria-label="How it works">
        <div className="card"><b>1. Connect</b><span>Only your public username. No passwords, ever.</span></div>
        <div className="card"><b>2. Explore</b><span>Each topic is a planet. Weak spots sit on the outer orbit.</span></div>
        <div className="card"><b>3. Level up</b><span>Get suggested problems, track your trajectory, climb the ranking.</span></div>
      </section>

      {board && board.rows.length > 0 && (
        <section className="card board landing-board" aria-labelledby="top-title">
          <h2 id="top-title" className="card-title">Top solvers</h2>
          {board.rows.map((r) => (
            <Link key={r.username} href={`/u/${encodeURIComponent(r.username)}`} className="row">
              <span className="row-rank">{r.rank}</span>
              <span className="row-avatar" style={{ background: tintFor(r.username) }} aria-hidden="true">{initial(r.username)}</span>
              <span className="row-name">{r.username}</span>
              <span className="row-total">{fmt(r.total)}</span>
            </Link>
          ))}
        </section>
      )}
    </main>
  );
}
