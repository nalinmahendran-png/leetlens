import { db } from "./db";

export type BoardRange = "week" | "all";

export interface BoardEntry {
  username: string;
  total: number;
  /** solves gained over the last 7 days */
  gain: number;
}

export interface BoardRow extends BoardEntry {
  rank: number;
  isMe: boolean;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Pure: sort + rank. "week" ranks by gain (ties: total); "all" ranks by total (ties: gain). */
export function rankEntries(entries: BoardEntry[], range: BoardRange): Omit<BoardRow, "isMe">[] {
  const sorted = [...entries].sort((a, b) =>
    range === "week" ? b.gain - a.gain || b.total - a.total : b.total - a.total || b.gain - a.gain,
  );
  return sorted.map((e, i) => ({ ...e, rank: i + 1 }));
}

/** Pure: top N plus the current user's row if they are outside the top N. */
export function pickRows(ranked: Omit<BoardRow, "isMe">[], me: string | undefined, limit: number): BoardRow[] {
  const meKey = me?.toLowerCase();
  const rows = ranked.map((r) => ({ ...r, isMe: r.username.toLowerCase() === meKey }));
  const top = rows.slice(0, limit);
  const mine = rows.find((r) => r.isMe);
  if (mine && !top.includes(mine)) top.push(mine);
  return top;
}

export async function getLeaderboard(opts: { range: BoardRange; me?: string; limit?: number }) {
  // Only real, manually entered profiles are ranked; demo/mock users never appear.
  const users = await db.user.findMany({
    where: { isDemo: false },
    include: { snapshots: { orderBy: { takenAt: "asc" }, select: { takenAt: true, totalSolved: true } } },
  });

  const weekAgo = Date.now() - WEEK_MS;
  const entries: BoardEntry[] = [];
  for (const u of users) {
    if (u.snapshots.length === 0) continue;
    const latest = u.snapshots[u.snapshots.length - 1];
    // baseline: newest snapshot at or before a week ago, else the earliest one we have
    let baseline = u.snapshots[0];
    for (const s of u.snapshots) if (s.takenAt.getTime() <= weekAgo) baseline = s;
    entries.push({ username: u.username, total: latest.totalSolved, gain: Math.max(0, latest.totalSolved - baseline.totalSolved) });
  }

  const ranked = rankEntries(entries, opts.range);

  // All-time standing, used for the "your rank" stat and the "solves to reach #N" hint
  // no matter which tab (week / all time) is displayed.
  const allTime = rankEntries(entries, "all");
  const meKey = opts.me?.toLowerCase();
  const myIdx = allTime.findIndex((r) => r.username.toLowerCase() === meKey);

  return {
    rows: pickRows(ranked, opts.me, opts.limit ?? 9),
    participants: ranked.length,
    myRank: myIdx >= 0 ? allTime[myIdx].rank : null,
    /** solves needed to overtake the next person above me (all time), or null if I'm first */
    solvesToNext:
      myIdx > 0 ? { rank: allTime[myIdx - 1].rank, solves: allTime[myIdx - 1].total - allTime[myIdx].total + 1 } : null,
  };
}
