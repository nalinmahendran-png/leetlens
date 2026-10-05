import type { Metadata } from "next";
import Link from "next/link";
import ErrorPanel from "@/components/ErrorPanel";
import ProblemChecklist from "@/components/ProblemChecklist";
import StartHereButton from "@/components/StartHereButton";
import TopNav from "@/components/TopNav";
import { COMPLETE_RATIO, LADDER, levelProgress, nextUp } from "@/lib/ladder";
import { loadDashboard } from "@/lib/load";
import { getLadderState } from "@/lib/sync";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ username: string }>; searchParams: Promise<{ level?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params;
  return { title: `${decodeURIComponent(username)}'s ladder` };
}

export default async function LadderPage({ params, searchParams }: Props) {
  const { username: raw } = await params;
  const { level: levelParam } = await searchParams;

  const result = await loadDashboard(raw);
  if (!result.ok) return <ErrorPanel title={result.title} message={result.message} username={decodeURIComponent(raw)} />;

  const d = result.data;
  const username = d.user.username;
  const state = await getLadderState(d);

  const requested = Number(levelParam);
  const selectedId = Number.isInteger(requested) && requested >= 0 && requested < LADDER.levels.length ? requested : state.currentId;
  const level = LADDER.levels[selectedId];
  const prog = levelProgress(level, state.solved);
  const needed = Math.ceil(level.problems.length * COMPLETE_RATIO);
  const upNext = nextUp(level, state.solved, 1)[0];

  const base = `/u/${encodeURIComponent(username)}/ladder`;
  const overall = state.progress.reduce((s, p) => s + p.solved, 0);
  const overallTotal = state.progress.reduce((s, p) => s + p.total, 0);

  return (
    <main className="shell">
      <TopNav username={username} active="ladder" />
      {d.stale && <p className="banner">LeetCode couldn&apos;t be reached, so this is your last saved data.</p>}

      <div className="page-head">
        <div>
          <h1>The Ladder</h1>
          <p>31 problems per level, grouped by difficulty rating instead of topic. Solve about 80% of a level, then climb to the next.</p>
        </div>
        <div className="muted" style={{ textAlign: "right" }}>
          <b style={{ color: "var(--text)", fontFamily: "var(--font-display)", fontSize: 24 }}>{overall}</b> / {overallTotal} solved overall
        </div>
      </div>

      <nav className="strip" aria-label="Ladder levels">
        {state.progress.map((p) => {
          const isCurrent = p.level.id === state.currentId;
          const isSelected = p.level.id === selectedId;
          const skipped = p.level.id < state.startLevel && !p.complete;
          const cls = ["lvl", isSelected && "lvl--selected", isCurrent && "lvl--current", p.complete && "lvl--done", skipped && "lvl--skipped"].filter(Boolean).join(" ");
          return (
            <Link key={p.level.id} href={`${base}?level=${p.level.id}`} className={cls} aria-current={isSelected ? "true" : undefined} title={p.level.range}>
              <span className="lvl-name">{p.level.name}</span>
              <span className="lvl-count">{p.complete ? "✓ " : ""}{p.solved}/{p.total}</span>
              <span className="lvl-bar"><span style={{ width: `${Math.round(p.ratio * 100)}%` }} /></span>
            </Link>
          );
        })}
      </nav>

      <div className="ladder-grid">
        <ProblemChecklist
          key={`${username}-${selectedId}`}
          username={username}
          levelName={level.name}
          levelRange={level.range}
          problems={level.problems}
          initiallySolved={level.problems.filter((p) => state.solved.has(p.slug)).map((p) => p.slug)}
          needed={needed}
        />

        <aside className="stack" aria-label="Level details">
          <section className="card">
            <h2 className="card-title" style={{ fontSize: 16 }}>{selectedId === state.currentId ? "Your current level" : `Level ${level.name}`}</h2>
            {upNext ? (
              <p style={{ margin: "10px 0 0" }}>
                <span className="muted" style={{ fontSize: 13 }}>Next up</span><br />
                <a href={`https://leetcode.com/problems/${upNext.slug}/`} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 700, color: "var(--text)" }}>
                  {upNext.title}
                </a>
              </p>
            ) : (
              <p className="muted" style={{ margin: "10px 0 0" }}>Every problem in this level is solved.</p>
            )}
            {prog.complete && selectedId < LADDER.levels.length - 1 && (
              <p style={{ margin: "12px 0 0" }}>
                <Link className="pill pill--small" href={`${base}?level=${selectedId + 1}`}>Go to the next level</Link>
              </p>
            )}
            {selectedId !== state.startLevel && (
              <p style={{ margin: "12px 0 0" }}>
                <StartHereButton username={username} level={selectedId} label="Start my ladder here" />
              </p>
            )}
            <p className="note">
              {state.startIsSuggested
                ? `We suggested starting at ${LADDER.levels[state.startLevel].id === 0 ? "Foundations" : `Level ${LADDER.levels[state.startLevel].name}`} based on your solved counts. You can change it any time.`
                : `You chose to start at ${LADDER.levels[state.startLevel].id === 0 ? "Foundations" : `Level ${LADDER.levels[state.startLevel].name}`}.`}
            </p>
          </section>

          <section className="card">
            <h2 className="card-title" style={{ fontSize: 16 }}>How it works</h2>
            <ul className="plain-list">
              <li><b>Ratings, not topics.</b> Each level mixes topics so you don&apos;t grind one pattern.</li>
              <li><b>Auto-ticks.</b> Problems you solve on LeetCode tick themselves at your next sync. Older solves: tick them by hand.</li>
              <li><b>Foundations</b> are 31 classics for warming up before contest-rated problems.</li>
              <li><b>Ratings</b> are community estimates from Weekly and Biweekly contests, not official.</li>
            </ul>
          </section>

          <p className="note">
            Ratings by the community project{" "}
            <a href="https://github.com/zerotrac/leetcode_problem_rating" target="_blank" rel="noopener noreferrer">zerotrac/leetcode_problem_rating</a> (MIT).
          </p>
        </aside>
      </div>
    </main>
  );
}
