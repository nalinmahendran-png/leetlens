import { NextResponse } from "next/server";
import { LADDER } from "@/lib/ladder";
import { rateLimit } from "@/lib/rateLimit";
import { setLadderStart, USERNAME_PATTERN } from "@/lib/sync";

/** POST /api/start  { "username": "...", "level": 3 }  -- choose which ladder level to start from */
export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!rateLimit(`start:${ip}`, 30, 60_000)) {
    return NextResponse.json({ ok: false, error: "Too many requests." }, { status: 429 });
  }

  const body = (await req.json().catch(() => null)) as { username?: unknown; level?: unknown } | null;
  const username = typeof body?.username === "string" ? body.username.trim() : "";
  const level = body?.level;
  if (!USERNAME_PATTERN.test(username) || typeof level !== "number" || !Number.isInteger(level) || level < 0 || level >= LADDER.levels.length) {
    return NextResponse.json({ ok: false, error: "Invalid input." }, { status: 400 });
  }

  const ok = await setLadderStart(username, level);
  return NextResponse.json({ ok }, { status: ok ? 200 : 404 });
}
