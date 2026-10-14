import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { dailyTimeZone, startOfNextDay } from "@/lib/day";
import { langName, timeUntil } from "@/lib/format";
import { geminiHints } from "@/lib/gemini";
import { claimHints, HINTS_PER_DAY, releaseHints } from "@/lib/hintQuota";
import { HintsError, HintsSchema, hintsToBeat, type Hints } from "@/lib/hints";
import { fetchQuestion, LeetCodeError } from "@/lib/leetcode";
import { rateLimit } from "@/lib/rateLimit";
import { USERNAME_PATTERN } from "@/lib/sync";

const STATUS: Record<HintsError["code"], number> = { NOT_CONFIGURED: 503, RATE_LIMITED: 429, REFUSED: 422, UPSTREAM: 502 };

const readHints = (json: string | null): Hints | null => {
  if (!json) return null;
  // unreadable or from an older format: make them again
  const parsed = HintsSchema.safeParse((() => { try { return JSON.parse(json); } catch { return null; } })());
  return parsed.success ? parsed.data : null;
};

/**
 * POST /api/hints  { "username": "...", "submissionId": "2158019942" }
 * Hints for beating one of the user's stored submissions, researched on the web by Gemini with
 * Google Search (free, GEMINI_API_KEY) or else Claude (ANTHROPIC_API_KEY). Generated once, then
 * cached on the submission row; each profile gets HINTS_PER_DAY new ones a day.
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
  const cached = readHints(sub.hintsJson);
  if (cached) return NextResponse.json({ ok: true, hints: cached });

  const generate = process.env.GEMINI_API_KEY ? geminiHints : process.env.ANTHROPIC_API_KEY ? hintsToBeat : null;
  if (!generate) {
    return NextResponse.json({ ok: false, error: "Hints aren't set up yet: add GEMINI_API_KEY (free) and restart the server." }, { status: 503 });
  }

  // Only new hint sets use the AI and web searches, so only those count against the limits.
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!rateLimit(`hints:${ip}`, 20, 60 * 60_000)) {
    return NextResponse.json({ ok: false, error: "That's 20 new hint sets this hour. Try again later." }, { status: 429 });
  }
  const now = new Date();
  const claim = await claimHints(sub, now);
  if (!claim.ok) {
    if (claim.reason === "done") {
      const fresh = await db.submission.findUnique({ where: { id: sub.id } });
      const hints = readHints(fresh?.hintsJson ?? null);
      if (hints) return NextResponse.json({ ok: true, hints });
    }
    const error =
      claim.reason === "limit"
        ? `This profile has used today's ${HINTS_PER_DAY} new hint sets. More at midnight, in ${timeUntil(startOfNextDay(now, dailyTimeZone()), now)}.`
        : "These hints are already being made. Give it a minute, then open them again.";
    return NextResponse.json({ ok: false, error }, { status: claim.reason === "limit" ? 429 : 409 });
  }

  try {
    const question = await fetchQuestion(sub.titleSlug);
    const hints = await generate({ question, language: langName(sub.lang), status: sub.status, runtime: sub.runtime, memory: sub.memory });
    await db.submission.update({ where: { id: sub.id }, data: { hintsJson: JSON.stringify(hints) } });
    return NextResponse.json({ ok: true, hints, left: claim.left });
  } catch (err) {
    // nothing was made, so this one doesn't count
    await releaseHints(sub.id).catch(() => undefined);
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
