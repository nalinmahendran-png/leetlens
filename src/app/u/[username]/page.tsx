import type { Metadata } from "next";
import Link from "next/link";
import DailyProblems from "@/components/DailyProblems";
import ErrorPanel from "@/components/ErrorPanel";
import Leaderboard from "@/components/Leaderboard";
import SolarSystem from "@/components/SolarSystem";
import TopNav from "@/components/TopNav";
import { analyzeTopics, weakestTopics } from "@/lib/analysis";
import { fmt, timeUntil } from "@/lib/format";
import { getLeaderboard, type BoardRange } from "@/lib/leaderboard";
import { loadDashboard } from "@/lib/load";
import { getDailySet } from "@/lib/sync";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ username: string }>; searchParams: Promise<{ range?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params;
  return { title: `${decodeURIComponent(username)}'s universe` };
}

export default async function UniversePage({ params, searchParams }: Props) {
  const { username: raw } = await params;
  const { range: rangeParam } = await searchParams;
  const range: BoardRange = rangeParam === "all" ? "all" : "week";

  const result = await loadDashboard(raw);
  if (!result.ok) return <ErrorPanel title={result.title} message={result.message} username={decodeURIComponent(raw)} />;

  const d = result.data;
  const username = d.user.username;
  const topics = analyzeTopics(d.tagCounts);
  const target = weakestTopics(topics, 1)[0];

  const [daily, board] = await Promise.all([
    getDailySet(d),
    getLeaderboard({ range, me: username, limit: 9 }),
  ]);

  return (
    <main className="shell">
      <TopNav username={username} active="universe" />
      {d.stale && <p className="banner">LeetCode couldn&apos;t be reached, so this is your last saved data.</p>}

      <div className="universe">
        <div className="board-col">
          <Leaderboard rows={board.rows} range={range} username={username} solvesToNext={board.solvesToNext} />
        </div>

        <SolarSystem topics={topics} total={d.latest.totalSolved} targetSlug={target?.slug ?? null} />

        <aside className="side" aria-label="Your stats and today's problems">
          <div>
            <h1>{username === "demo" ? "The demo universe" : `${username}'s universe`}</h1>
            <p>Each planet is a topic. Bigger means more solved. The dashed one is where to explore next.</p>
          </div>

          <div className="stats">
            <div className="stat"><b>{fmt(d.latest.totalSolved)}</b><span className="muted">solved</span></div>
            <div className="stat"><b>{d.latest.streak}</b><span className="muted">day streak</span></div>
            <div className="stat"><b>{board.myRank ? `#${board.myRank}` : "-"}</b><span className="muted">in galaxy</span></div>
          </div>

          <h2 className="card-title">Today&apos;s 3</h2>
          <DailyProblems username={username} problems={daily.problems} resetsAt={daily.resetsAt.toISOString()} resetsIn={timeUntil(daily.resetsAt)} />
          <Link className="more-link" href={`/u/${encodeURIComponent(username)}/ladder`}>Open the full ladder →</Link>
        </aside>
      </div>
    </main>
  );
}
