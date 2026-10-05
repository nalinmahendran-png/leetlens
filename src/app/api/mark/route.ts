import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rateLimit";
import { setMark, USERNAME_PATTERN } from "@/lib/sync";

/** POST /api/mark  { "username": "...", "titleSlug": "two-sum", "solved": true }  -- tick / un-tick a problem */
export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!rateLimit(`mark:${ip}`, 120, 60_000)) {
    return NextResponse.json({ ok: false, error: "Too many requests." }, { status: 429 });
  }

  const body = (await req.json().catch(() => null)) as { username?: unknown; titleSlug?: unknown; solved?: unknown } | null;
  const username = typeof body?.username === "string" ? body.username.trim() : "";
  const titleSlug = typeof body?.titleSlug === "string" ? body.titleSlug.trim() : "";
  if (!USERNAME_PATTERN.test(username) || !/^[a-z0-9-]{1,120}$/.test(titleSlug) || typeof body?.solved !== "boolean") {
    return NextResponse.json({ ok: false, error: "Invalid input." }, { status: 400 });
  }

  const ok = await setMark(username, titleSlug, body.solved);
  return NextResponse.json({ ok }, { status: ok ? 200 : 404 });
}
