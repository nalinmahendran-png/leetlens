import { NextResponse } from "next/server";
import { LeetCodeError } from "@/lib/leetcode";
import { rateLimit } from "@/lib/rateLimit";
import { syncUser, USERNAME_PATTERN } from "@/lib/sync";

const STATUS: Record<string, number> = { NOT_FOUND: 404, RATE_LIMITED: 429, SCHEMA: 502, UPSTREAM: 502 };

/** POST /api/sync  { "username": "..." }  -- refresh one user from LeetCode (min. 5 minutes apart) */
export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!rateLimit(`sync:${ip}`, 20, 60_000)) {
    return NextResponse.json({ ok: false, error: "Too many requests. Slow down a little." }, { status: 429 });
  }

  const body = (await req.json().catch(() => null)) as { username?: unknown } | null;
  const username = typeof body?.username === "string" ? body.username.trim() : "";
  if (!USERNAME_PATTERN.test(username)) {
    return NextResponse.json({ ok: false, error: "Invalid username." }, { status: 400 });
  }

  try {
    const user = await syncUser(username, { minIntervalMs: 5 * 60_000 });
    return NextResponse.json({ ok: true, username: user.username });
  } catch (err) {
    if (err instanceof LeetCodeError) {
      return NextResponse.json({ ok: false, code: err.code, error: err.message }, { status: STATUS[err.code] ?? 502 });
    }
    console.error("sync failed", err);
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}
