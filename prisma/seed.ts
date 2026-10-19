/**
 * Optional sample data so the leaderboard and progress graph look alive before real users
 * arrive. Creates the "demo" user (12 weeks of history) plus a few FICTIONAL solvers.
 * Run:  npm run db:seed        (safe to re-run; it rebuilds these sample users)
 */
import { db } from "../src/lib/db";
import { LADDER } from "../src/lib/ladder";
import { DEMO_TAG_COUNTS, mockProfile } from "../src/lib/mock";

const DAY = 24 * 60 * 60 * 1000;
const dayKeyOf = (d: Date) => d.toISOString().slice(0, 10);

/** The demo user's exact 12-week history (matches the design mock-up). */
const DEMO_WEEKLY = [60, 88, 120, 150, 178, 215, 246, 281, 318, 349, 381, 412];

/** weekly totals for 12 weeks, oldest first: a steady gain per week with a little wobble */
function weeklyTotals(finalTotal: number, gainPerWeek: number): number[] {
  const start = finalTotal - gainPerWeek * 11;
  return Array.from({ length: 12 }, (_, i) => {
    if (i === 0 || i === 11) return i === 0 ? start : finalTotal;
    return Math.round(start + gainPerWeek * i + Math.sin(i * 1.7) * gainPerWeek * 0.3 * (1 - i / 11));
  });
}

const SAMPLE_USERS: { username: string; total: number; gain: number }[] = [
  { username: "demo", total: 412, gain: 32 },
  { username: "priya_s", total: 1204, gain: 38 },
  { username: "kabir.ds", total: 1138, gain: 30 },
  { username: "meera_k", total: 967, gain: 27 },
  { username: "rohan.dev", total: 890, gain: 22 },
  { username: "sana.codes", total: 702, gain: 21 },
  { username: "vik_r", total: 655, gain: 19 },
  { username: "neha_p", total: 388, gain: 14 },
  { username: "dev.anand", total: 351, gain: 12 },
  { username: "isha_m", total: 320, gain: 11 },
];

async function main() {
  const now = new Date();

  for (const sample of SAMPLE_USERS) {
    const profile = mockProfile(sample.username, now);
    const key = sample.username.toLowerCase();
    await db.user.deleteMany({ where: { usernameKey: key } });

    const user = await db.user.create({
      data: {
        usernameKey: key,
        username: sample.username,
        realName: profile.realName,
        isDemo: true,
        recentAcJson: JSON.stringify(profile.recentAc),
        calendarJson: JSON.stringify(profile.calendar),
        lastSyncedAt: now,
      },
    });

    const totals = sample.username === "demo" ? DEMO_WEEKLY : weeklyTotals(sample.total, sample.gain);
    for (let i = 0; i < totals.length; i++) {
      const takenAt = new Date(now.getTime() - (totals.length - 1 - i) * 7 * DAY);
      const ratio = totals[i] / sample.total;
      const isDemo = sample.username === "demo";
      const easy = Math.round((isDemo ? 168 : profile.easy) * ratio);
      const hard = Math.round((isDemo ? 39 : profile.hard) * ratio);
      const tags = Object.fromEntries(
        Object.entries(isDemo ? DEMO_TAG_COUNTS : profile.tagCounts).map(([slug, n]) => [slug, Math.round((n as number) * ratio)]),
      );
      await db.snapshot.create({
        data: {
          userId: user.id,
          dayKey: dayKeyOf(takenAt),
          takenAt,
          totalSolved: totals[i],
          easy,
          hard,
          medium: totals[i] - easy - hard,
          ranking: profile.ranking,
          streak: isDemo ? 23 : profile.streak,
          topicsJson: JSON.stringify(tags),
        },
      });
    }
  }
  // Give the demo user some ladder progress: Foundations and the first two levels done,
  // a third half-finished (so the Ladder page has something to show).
  const demo = await db.user.findUnique({ where: { usernameKey: "demo" } });
  if (demo) {
    const solvedSlugs = [
      ...LADDER.levels[0].problems.map((p) => p.slug),
      ...LADDER.levels[1].problems.map((p) => p.slug),
      ...LADDER.levels[2].problems.slice(0, 28).map((p) => p.slug),
      ...LADDER.levels[3].problems.slice(0, 12).map((p) => p.slug),
    ];
    for (const titleSlug of solvedSlugs) {
      await db.problemMark.create({ data: { userId: demo.id, titleSlug, solved: true, source: "manual" } });
    }
  }

  console.log(`Seeded ${SAMPLE_USERS.length} sample users. Try http://localhost:3000/u/demo`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
