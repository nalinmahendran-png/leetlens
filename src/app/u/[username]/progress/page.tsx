import type { Metadata } from "next";
import ErrorPanel from "@/components/ErrorPanel";
import TopNav from "@/components/TopNav";
import TrajectoryChart from "@/components/TrajectoryChart";
import { fmt } from "@/lib/format";
import { buildSeries, project, weeklyGains } from "@/lib/history";
import { loadDashboard } from "@/lib/load";
import { CORE_TOPICS } from "@/lib/topics";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ username: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params;
  return { title: `${decodeURIComponent(username)}'s progress` };
}

const DAY = 24 * 60 * 60 * 1000;

export default async function ProgressPage({ params }: Props) {
  const { username: raw } = await params;
  const result = await loadDashboard(raw);
  if (!result.ok) return <ErrorPanel title={result.title} message={result.message} username={decodeURIComponent(raw)} />;

  const d = result.data;
  const username = d.user.username;
  const now = new Date();

  const series = buildSeries({ snapshots: d.snapshots, calendar: d.calendar, now, weeks: 12 });
  const gains = weeklyGains(series);
  const { pace, values: projection } = project(series);
  const best = gains.length ? Math.max(...gains) : 0;
  const thisWeek = gains.length ? gains[gains.length - 1] : 0;
  const hasEstimate = series.some((p) => p.estimated);
  const projEnd = projection.length ? projection[projection.length - 1] : null;

  // topic movers: change since the newest snapshot that is at least ~4 weeks old
  const cutoff = now.getTime() - 28 * DAY;
  const older = [...d.snapshots].reverse().find((s) => s.takenAt.getTime() <= cutoff);
  let movers: { name: string; n: number }[] | null = null;
  if (older) {
    let before: Record<string, number> = {};
    try { before = JSON.parse(older.topicsJson) as Record<string, number>; } catch { before = {}; }
    movers = CORE_TOPICS.map((t) => ({ name: t.name, n: (d.tagCounts[t.slug] ?? 0) - (before[t.slug] ?? 0) }))
      .sort((a, b) => b.n - a.n)
      .slice(0, 5);
  }
  const maxMove = movers ? Math.max(1, ...movers.map((m) => m.n)) : 1;

  const { easy, medium, hard, totalSolved } = d.latest;
  const pct = (n: number) => (totalSolved > 0 ? (n / totalSolved) * 100 : 0);

  const bars = gains.map((g, i) => ({ g, label: `W${i + 2}` }));
  const maxBar = Math.max(1, ...gains);

  return (
    <main className="shell">
      <TopNav username={username} active="progress" />
      {d.stale && <p className="banner">LeetCode couldn&apos;t be reached, so this is your last saved data.</p>}

      <div className="page-head">
        <div>
          <h1>Your trajectory</h1>
          <p>How your solved count has grown, and where your current pace takes you.</p>
        </div>
      </div>

      <div className="progress-grid">
        <section className="card" aria-label="Solved over time">
          <div className="big-head">
            <div>
              <div className="muted" style={{ fontSize: 13 }}>Total solved</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
                <span className="big-num">{fmt(totalSolved)}</span>
                {gains.length > 0 && <span className="delta">+{thisWeek} this week</span>}
              </div>
            </div>
            <div className="key">
              <span><i style={{ height: 3, borderRadius: 2, background: "#7fd6ff" }} />Actual</span>
              <span><i style={{ height: 0, borderTop: "3px dotted #ffc857" }} />Projected at current pace</span>
            </div>
          </div>

          <TrajectoryChart points={series} projection={projection} />
          {hasEstimate && (
            <p className="note">
              The dashed blue part is estimated from your LeetCode activity calendar. It turns into real data as we track you day by day.
            </p>
          )}

          {bars.length > 0 && (
            <>
              <div className="bars-head"><span>Solves per week</span><span>best week: {best}</span></div>
              <div className="bars">
                {bars.map((b, i) => (
                  <div className="bar-col" key={i}>
                    <small>{b.g}</small>
                    <div className="bar" style={{ height: Math.max(2, Math.round((b.g / maxBar) * 72)), background: b.g === best ? "#ffc857" : i === bars.length - 1 ? "#7fd6ff" : undefined }} />
                    <small className="lbl">{b.label}</small>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>

        <aside className="stack" aria-label="Progress details">
          <div className="tiles">
            <div className="tile"><small>Solved</small><b>{fmt(totalSolved)}</b></div>
            <div className="tile"><small>Pace</small><b>+{pace} / wk</b></div>
            <div className="tile"><small>Best week</small><b>{best}</b></div>
            <div className="tile tile--gold"><small>Projected{projEnd ? `, Wk ${series.length + projection.length}` : ""}</small><b>{projEnd ? `~${fmt(projEnd)}` : "-"}</b></div>
          </div>

          <section className="card" aria-label="By difficulty">
            <h2 className="card-title" style={{ fontSize: 16 }}>By difficulty</h2>
            <div className="split" role="img" aria-label={`Easy ${easy}, Medium ${medium}, Hard ${hard}`}>
              <div style={{ width: `${pct(easy)}%`, background: "#a8f0c4" }} />
              <div style={{ width: `${pct(medium)}%`, background: "#ffc857" }} />
              <div style={{ width: `${pct(hard)}%`, background: "#ff8fab" }} />
            </div>
            <div className="split-legend">
              <span><span className="diff-Easy">●</span> Easy {easy}</span>
              <span><span className="diff-Medium">●</span> Medium {medium}</span>
              <span><span className="diff-Hard">●</span> Hard {hard}</span>
            </div>
          </section>

          <section className="card" aria-label="Topic movers">
            <h2 className="card-title" style={{ fontSize: 16 }}>Topic movers, last 4 weeks</h2>
            {movers ? (
              movers.map((m) => (
                <div className="mover" key={m.name}>
                  <span className="mover-name">{m.name}</span>
                  <span className="mover-track"><span className="mover-fill" style={{ display: "block", width: `${Math.round((Math.max(0, m.n) / maxMove) * 100)}%`, background: m.n <= 1 ? "#ff8fab" : "#7fd6ff" }} /></span>
                  <span className="mover-n" style={{ color: m.n <= 1 ? "#ff8fab" : "#7fd6ff" }}>+{m.n}</span>
                </div>
              ))
            ) : (
              <p className="muted" style={{ marginTop: 10 }}>Topic movers appear once we have four weeks of history for you.</p>
            )}
          </section>
        </aside>
      </div>
    </main>
  );
}
