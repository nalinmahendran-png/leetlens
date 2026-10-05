import { NextResponse } from "next/server";
import { LeetCodeError } from "@/lib/leetcode";
import { rateLimit } from "@/lib/rateLimit";
import { getDashboard, swapDailyProblem, USERNAME_PATTERN } from "@/lib/sync";

/**
 * POST /api/daily/swap  { "username": "...", "titleSlug": "two-sum" }
 * "Solved it before": ticks the problem and puts a fresh one for the same slot into today's set.
 */
export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!rateLimit(`swap:${ip}`, 30, 60_000)) {
    return NextResponse.json({ ok: false, error: "Too many requests." }, { status: 429 });
  }

  const body = (await req.json().catch(() => null)) as { username?: unknown; titleSlug?: unknown } | null;
  const username = typeof body?.username === "string" ? body.username.trim() : "";
  const titleSlug = typeof body?.titleSlug === "string" ? body.titleSlug.trim() : "";
  if (!USERNAME_PATTERN.test(username) || !/^[a-z0-9-]{1,120}$/.test(titleSlug)) {
    return NextResponse.json({ ok: false, error: "Invalid input." }, { status: 400 });
  }

  try {
    const ok = await swapDailyProblem(await getDashboard(username), titleSlug);
    return NextResponse.json(ok ? { ok } : { ok, error: "That problem isn't in today's set any more." }, { status: ok ? 200 : 404 });
  } catch (err) {
    if (err instanceof LeetCodeError) {
      return NextResponse.json({ ok: false, error: err.message }, { status: 502 });
    }
    console.error("daily swap failed", err);
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}
