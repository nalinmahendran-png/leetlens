import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { langName } from "@/lib/format";
import { HintsError, HintsSchema, hintsToBeat } from "@/lib/hints";
import { fetchQuestion, LeetCodeError } from "@/lib/leetcode";
import { rateLimit } from "@/lib/rateLimit";
import { USERNAME_PATTERN } from "@/lib/sync";

// Web search + Claude can take a minute or two; Vercel's default limit would cut it off.
export const maxDuration = 300;

const STATUS: Record<HintsError["code"], number> = { NOT_CONFIGURED: 503, RATE_LIMITED: 429, REFUSED: 422, UPSTREAM: 502 };

/**
 * POST /api/hints  { "username": "...", "submissionId": "2158019942" }
 * Hints for beating one of the user's stored submissions, researched on the web by Claude.
 * Generated once, then cached on the submission row.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { username?: unknown; submissionId?: unknown } | null;
  const username = typeof body?.username === "string" ? body.username.trim() : "";
  const submissionId = typeof body?.submissionId === "string" ? body.submissionId.trim() : "";
  if (!USERNAME_PATTERN.test(username) || !/^\d{1,20}$/.test(submissionId)) {
    return NextResponse.json({ ok: false, error: "Invalid input." }, { status: 400 });
  }

  const sub = await db.submission.findUnique({ where: { lcId: submissionId }, include: { user: true } });
  if (!sub || sub.user.usernameKey !== username.toLowerCase()) {
    return NextResponse.json({ ok: false, error: "Submission not found." }, { status: 404 });
  }
  if (sub.hintsJson) {
    // reuse the cached hints unless they're unreadable or from an older format
    const cached = HintsSchema.safeParse((() => { try { return JSON.parse(sub.hintsJson); } catch { return null; } })());
    if (cached.success) return NextResponse.json({ ok: true, hints: cached.data });
  }

  // Only uncached requests cost a Claude call (plus web searches), so only those count against the limit.
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!rateLimit(`hints:${ip}`, 20, 60 * 60_000)) {
    return NextResponse.json({ ok: false, error: "That's 20 new hint sets this hour. Try again later." }, { status: 429 });
  }

  try {
    const question = await fetchQuestion(sub.titleSlug);
    const hints = await hintsToBeat({ question, language: langName(sub.lang), status: sub.status, runtime: sub.runtime, memory: sub.memory });
    await db.submission.update({ where: { id: sub.id }, data: { hintsJson: JSON.stringify(hints) } });
    return NextResponse.json({ ok: true, hints });
  } catch (err) {
    if (err instanceof LeetCodeError) {
      return NextResponse.json({ ok: false, error: `Couldn't load the problem from LeetCode. ${err.message}` }, { status: 502 });
    }
    if (err instanceof HintsError) {
      return NextResponse.json({ ok: false, error: err.message }, { status: STATUS[err.code] });
    }
    console.error("hints failed", err);
    return NextResponse.json({ ok: false, error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
