import { NextResponse } from "next/server";
import { getLeaderboard, type BoardRange } from "@/lib/leaderboard";

export const dynamic = "force-dynamic";

/** GET /api/leaderboard?range=week|all&me=username */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const range: BoardRange = searchParams.get("range") === "all" ? "all" : "week";
  const me = searchParams.get("me") ?? undefined;
  const board = await getLeaderboard({ range, me, limit: 20 });
  return NextResponse.json(board);
}
