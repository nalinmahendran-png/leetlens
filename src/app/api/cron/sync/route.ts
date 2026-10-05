import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { syncUser } from "@/lib/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * GET /api/cron/sync -- daily job: refresh every stored user so the progress graph gets a
 * new data point each day even when nobody visits. Protected by CRON_SECRET
 * (Vercel Cron sends "Authorization: Bearer <CRON_SECRET>" automatically).
 * Users are synced one at a time with a pause, to stay polite to LeetCode.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ ok: false, error: "CRON_SECRET is not set." }, { status: 503 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const users = await db.user.findMany({
    where: { isDemo: false },
    orderBy: { lastSyncedAt: "asc" },
    take: 100,
  });

  let synced = 0;
  const failed: string[] = [];
  for (const u of users) {
    try {
      await syncUser(u.username);
      synced++;
    } catch {
      failed.push(u.username);
    }
    await sleep(1200);
  }
  return NextResponse.json({ ok: true, synced, failed });
}
