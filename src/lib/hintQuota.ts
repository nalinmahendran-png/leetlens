import { createHash } from "node:crypto";
import type { Submission } from "@prisma/client";
import { db } from "./db";
import { dailyTimeZone, startOfDay } from "./day";

/**
 * Daily limits on new "Beat this" hint sets; all reset at midnight in DAILY_TIMEZONE. Reopening saved
 * hints is free. With no sign-in, a person is their IP address, so the per-person limit also covers
 * someone trying other usernames, and the site-wide cap covers someone with many addresses.
 */
export const HINTS_PER_DAY = 3;
export const HINTS_PER_PERSON_PER_DAY = 3;
export const HINTS_PER_DAY_SITEWIDE = 50;
/** A claim this old with no hints saved is abandoned (the request died half-way), so it can be retried. */
const CLAIM_TIMEOUT_MS = 5 * 60_000;
/** Postgres advisory-lock key for hint claims: one at a time, so parallel clicks can't slip past a limit. */
const CLAIM_LOCK = 7301;

const today = (now: Date) => ({ gte: startOfDay(now, dailyTimeZone()) });

/** Every 0-padded group of an IPv6 address. */
function ipv6Groups(ip: string): string[] {
  const [head, tail] = ip.split("::");
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  const groups = tail === undefined ? left : [...left, ...Array(Math.max(0, 8 - left.length - right.length)).fill("0"), ...right];
  return groups.map((g) => g.padStart(4, "0").toLowerCase());
}

/**
 * Pure: who is asking, as a hash of their IP address (never stored in the clear). IPv6 devices
 * rotate addresses inside their network's /64 block, so that block counts as one person.
 * Exported for tests.
 */
export function viewerKey(headers: Headers): string {
  const ip = (headers.get("x-forwarded-for")?.split(",")[0] ?? headers.get("x-real-ip") ?? "local").trim();
  const who = ip.includes(":") && !ip.startsWith("::ffff:") ? ipv6Groups(ip).slice(0, 4).join(":") : ip.replace(/^::ffff:/, "");
  return createHash("sha256").update(`leetlens-hints:${who}`).digest("hex").slice(0, 32);
}

/** New hint sets this viewer can still make today for this profile: the tightest of the three limits. */
export async function hintsLeftToday(userId: number, viewer: string, now = new Date()): Promise<number> {
  const [profile, person, site] = await Promise.all([
    db.submission.count({ where: { userId, hintsAt: today(now) } }),
    db.submission.count({ where: { hintsBy: viewer, hintsAt: today(now) } }),
    db.submission.count({ where: { hintsAt: today(now) } }),
  ]);
  return Math.max(0, Math.min(HINTS_PER_DAY - profile, HINTS_PER_PERSON_PER_DAY - person, HINTS_PER_DAY_SITEWIDE - site));
}

/** Why a new hint set can't be made right now: being made already, or a limit is reached. */
export type HintRefusal = "busy" | "profile" | "person" | "site";
/** "done": the hints were saved in the meantime, so there's nothing to make. */
export type HintClaim = { ok: true; left: number } | { ok: false; reason: "done" | HintRefusal };

/** Reserve one of today's hint sets for this submission and viewer, if every limit allows it. */
export function claimHints(sub: Submission, viewer: string, now = new Date()): Promise<HintClaim> {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${CLAIM_LOCK})`;
    const fresh = await tx.submission.findUniqueOrThrow({ where: { id: sub.id } });
    if (fresh.hintsJson) return { ok: false, reason: "done" };
    if (fresh.hintsAt && now.getTime() - fresh.hintsAt.getTime() < CLAIM_TIMEOUT_MS) return { ok: false, reason: "busy" };

    // a stale claim on this same submission doesn't count against anyone
    const others = { id: { not: sub.id }, hintsAt: today(now) };
    const [profile, person, site] = await Promise.all([
      tx.submission.count({ where: { ...others, userId: sub.userId } }),
      tx.submission.count({ where: { ...others, hintsBy: viewer } }),
      tx.submission.count({ where: others }),
    ]);
    if (site >= HINTS_PER_DAY_SITEWIDE) return { ok: false, reason: "site" };
    if (person >= HINTS_PER_PERSON_PER_DAY) return { ok: false, reason: "person" };
    if (profile >= HINTS_PER_DAY) return { ok: false, reason: "profile" };

    await tx.submission.update({ where: { id: sub.id }, data: { hintsAt: now, hintsBy: viewer } });
    return {
      ok: true,
      left: Math.min(HINTS_PER_DAY - profile, HINTS_PER_PERSON_PER_DAY - person, HINTS_PER_DAY_SITEWIDE - site) - 1,
    };
  });
}

/** Give the hint set back after generating failed. */
export async function releaseHints(submissionId: number): Promise<void> {
  await db.submission.update({ where: { id: submissionId }, data: { hintsAt: null, hintsBy: null } });
}
