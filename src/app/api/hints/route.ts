import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { dailyTimeZone, startOfNextDay } from "@/lib/day";
import { langName, timeUntil } from "@/lib/format";
import { geminiHints } from "@/lib/gemini";
import { claimHints, HINTS_PER_DAY, HINTS_PER_DAY_SITEWIDE, HINTS_PER_PERSON_PER_DAY, releaseHints, viewerKey, type HintRefusal } from "@/lib/hintQuota";
import { HintsError, HintsSchema, type Hints } from "@/lib/hints";
import { fetchQuestion, LeetCodeError } from "@/lib/leetcode";
import { rateLimit } from "@/lib/rateLimit";
import { USERNAME_PATTERN } from "@/lib/sync";

const STATUS: Record<HintsError["code"], number> = { NOT_CONFIGURED: 503, RATE_LIMITED: 429, REFUSED: 422, UPSTREAM: 502 };

const REFUSED: Record<HintRefusal, string> = {
  busy: "These hints are already being made. Give it a minute, then open them again.",
  profile: `This profile has used today's ${HINTS_PER_DAY} new hint sets.`,
  person: `You've used your ${HINTS_PER_PERSON_PER_DAY} new hint sets for today.`,
  site: `LeetLens has made its ${HINTS_PER_DAY_SITEWIDE} hint sets for today.`,
};

const readHints = (json: string | null): Hints | null => {
  if (!json) return null;
  // unreadable or from an older format: make them again
  const parsed = HintsSchema.safeParse((() => { try { return JSON.parse(json); } catch { return null; } })());
  return parsed.success ? parsed.data : null;
};

/**
 * POST /api/hints  { "username": "...", "submissionId": "2158019942" }
 * Hints for beating one of the user's stored submissions, from Gemini 3.8 Flash (GEMINI_API_KEY, see
 * src/lib/gemini.ts). Generated once, then cached on the submission row. New ones are limited per
 * profile, per person and site-wide each day (src/lib/hintQuota.ts); reopening saved ones is free.
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

  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ ok: false, error: "Hints aren't set up yet: add GEMINI_API_KEY (free) and restart the server." }, { status: 503 });
  }

  // Only new hint sets call Gemini, so only those count against the daily limits. This one just
  // stops a flood of requests from reaching the database.
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!rateLimit(`hints:${ip}`, 20, 60 * 60_000)) {
    return NextResponse.json({ ok: false, error: "Too many requests. Try again later." }, { status: 429 });
  }
  const now = new Date();
  const claim = await claimHints(sub, viewerKey(req.headers), now);
  if (!claim.ok) {
    if (claim.reason === "done") {
      // made by a parallel request in the meantime
      const fresh = await db.submission.findUnique({ where: { id: sub.id } });
      const hints = readHints(fresh?.hintsJson ?? null);
      if (hints) return NextResponse.json({ ok: true, hints });
      return NextResponse.json({ ok: false, error: "Something went wrong. Please try again." }, { status: 500 });
    }
    if (claim.reason === "busy") return NextResponse.json({ ok: false, error: REFUSED.busy }, { status: 409 });
    const error = `${REFUSED[claim.reason]} More at midnight, in ${timeUntil(startOfNextDay(now, dailyTimeZone()), now)}.`;
    return NextResponse.json({ ok: false, error }, { status: 429 });
  }

  try {
    const question = await fetchQuestion(sub.titleSlug);
    const hints = await geminiHints({ question, language: langName(sub.lang), status: sub.status, runtime: sub.runtime, memory: sub.memory });
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
