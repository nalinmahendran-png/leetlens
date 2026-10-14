import type { Submission } from "@prisma/client";
import { db } from "./db";
import { dailyTimeZone, startOfDay } from "./day";

/** New "Beat this" hint sets per profile per day; the count resets at midnight in DAILY_TIMEZONE. Reopening saved hints is free. */
export const HINTS_PER_DAY = 3;
/** A claim this old with no hints saved is abandoned (the request died half-way), so it can be retried. */
const CLAIM_TIMEOUT_MS = 5 * 60_000;

const today = (now: Date) => ({ gte: startOfDay(now, dailyTimeZone()) });

export async function hintsLeftToday(userId: number, now = new Date()): Promise<number> {
  const used = await db.submission.count({ where: { userId, hintsAt: today(now) } });
  return Math.max(0, HINTS_PER_DAY - used);
}

export type HintClaim = { ok: true; left: number } | { ok: false; reason: "limit" | "busy" | "done" };

/**
 * Reserve one of today's hint sets for this submission. A per-user Postgres lock makes the count and
 * the claim one step, so clicking several at once can't get past the limit.
 */
export function claimHints(sub: Submission, now = new Date()): Promise<HintClaim> {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${sub.userId})`;
    const fresh = await tx.submission.findUniqueOrThrow({ where: { id: sub.id } });
    if (fresh.hintsJson) return { ok: false, reason: "done" };
    if (fresh.hintsAt && now.getTime() - fresh.hintsAt.getTime() < CLAIM_TIMEOUT_MS) return { ok: false, reason: "busy" };

    const used = await tx.submission.count({ where: { userId: sub.userId, id: { not: sub.id }, hintsAt: today(now) } });
    if (used >= HINTS_PER_DAY) return { ok: false, reason: "limit" };
    await tx.submission.update({ where: { id: sub.id }, data: { hintsAt: now } });
    return { ok: true, left: HINTS_PER_DAY - used - 1 };
  });
}

/** Give the hint set back after generating failed. */
export async function releaseHints(submissionId: number): Promise<void> {
  await db.submission.update({ where: { id: submissionId }, data: { hintsAt: null } });
}
