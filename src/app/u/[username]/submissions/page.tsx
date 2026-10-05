import type { Metadata } from "next";
import ErrorPanel from "@/components/ErrorPanel";
import SubmissionList, { type SubmissionRow } from "@/components/SubmissionList";
import TopNav from "@/components/TopNav";
import { loadDashboard } from "@/lib/load";
import { getSubmissions } from "@/lib/sync";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ username: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params;
  return { title: `${decodeURIComponent(username)}'s submissions` };
}

export default async function SubmissionsPage({ params }: Props) {
  const { username: raw } = await params;
  const result = await loadDashboard(raw);
  if (!result.ok) return <ErrorPanel title={result.title} message={result.message} username={decodeURIComponent(raw)} />;

  const d = result.data;
  const username = d.user.username;
  const rows: SubmissionRow[] = (await getSubmissions(d.user)).map((s) => ({
    id: s.lcId,
    title: s.title,
    titleSlug: s.titleSlug,
    lang: s.lang,
    status: s.status,
    runtime: s.runtime,
    memory: s.memory,
    date: s.submittedAt.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    hasHints: s.hintsJson != null,
  }));

  return (
    <main className="shell">
      <TopNav username={username} active="submissions" />
      {d.stale && <p className="banner">LeetCode couldn&apos;t be reached, so this is your last saved data.</p>}
      <div className="page-head">
        <div>
          <h1>Submissions</h1>
          <p>Runtime and memory of each accepted solution. Pick one to get hints for writing a version that beats it.</p>
        </div>
        <div className="muted" style={{ textAlign: "right", fontSize: 13 }}>
          {rows.length} saved · LeetCode only shows the newest 20,
          <br />
          so LeetLens keeps each one it sees
        </div>
      </div>
      <SubmissionList username={username} rows={rows} />
    </main>
  );
}
