import type { Snapshot, Submission, User } from "@prisma/client";
import { db } from "./db";
import { dailyTimeZone, startOfDay, startOfNextDay } from "./day";
import { fetchProfile, fetchProblemsByTag, fetchRecentSubmissions } from "./leetcode";
import { isMockUser, mockProfile } from "./mock";
import { analyzeTopics } from "./analysis";
import { DAILY_SLOTS, pickDaily, pickReplacement, type DailyKind } from "./recommend";
import { allProgress, currentLevelId, suggestStartLevel, type LevelProgress } from "./ladder";
import type { DailyProblem, Difficulty, NormalizedProfile, RecentAc } from "./types";

const HOUR = 60 * 60 * 1000;
/** Re-fetch from LeetCode when data is older than this (unless a sync is forced). */
export const DEFAULT_MAX_AGE_MS = 6 * HOUR;

export const USERNAME_PATTERN = /^[A-Za-z0-9_.-]{1,40}$/;

export function fetchAnyProfile(username: string): Promise<NormalizedProfile> {
  return isMockUser(username) ? Promise.resolve(mockProfile(username)) : fetchProfile(username);
}

const dayKeyOf = (d: Date) => d.toISOString().slice(0, 10);

function parseJson<T>(text: string, fallback: T): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

/**
 * Fetch the profile from LeetCode and store it: one User row, plus today's Snapshot
 * (re-syncing on the same day overwrites that day's snapshot).
 * `minIntervalMs` lets callers skip the network call if we synced very recently.
 */
export async function syncUser(username: string, opts: { minIntervalMs?: number } = {}): Promise<User> {
  const existing = await db.user.findUnique({ where: { usernameKey: username.toLowerCase() } });
  if (existing?.lastSyncedAt && opts.minIntervalMs && Date.now() - existing.lastSyncedAt.getTime() < opts.minIntervalMs) {
    return existing;
  }

  const profile = await fetchAnyProfile(username);
  const now = new Date();
  const usernameKey = profile.username.toLowerCase();

  const userData = {
    username: profile.username,
    realName: profile.realName,
    avatar: profile.avatar,
    recentAcJson: JSON.stringify(profile.recentAc),
    calendarJson: JSON.stringify(profile.calendar),
    lastSyncedAt: now,
  };
  const user = await db.user.upsert({
    where: { usernameKey },
    create: { usernameKey, isDemo: isMockUser(username), ...userData },
    update: userData,
  });

  const snapshotData = {
    takenAt: now,
    totalSolved: profile.total,
    easy: profile.easy,
    medium: profile.medium,
    hard: profile.hard,
    ranking: profile.ranking,
    streak: profile.streak,
    topicsJson: JSON.stringify(profile.tagCounts),
  };
  await db.snapshot.upsert({
    where: { userId_dayKey: { userId: user.id, dayKey: dayKeyOf(now) } },
    create: { userId: user.id, dayKey: dayKeyOf(now), ...snapshotData },
    update: snapshotData,
  });

  // Recent accepted submissions become "solved" ticks automatically. `update: {}` means a tick
  // the user removed by hand is never re-added.
  for (const r of profile.recentAc) {
    await db.problemMark.upsert({
      where: { userId_titleSlug: { userId: user.id, titleSlug: r.titleSlug } },
      create: { userId: user.id, titleSlug: r.titleSlug, solved: true, source: "auto" },
      update: {},
    });
  }

  // Runtime/memory history is a bonus: if LeetCode fails here, the sync itself still counts.
  if (!isMockUser(username)) await syncSubmissions(user.id, profile.username).catch(() => undefined);

  return user;
}

/** Save the newest ~20 public submissions. Existing rows are kept, so history grows past LeetCode's 20. */
export async function syncSubmissions(userId: number, username: string): Promise<void> {
  for (const s of await fetchRecentSubmissions(username)) {
    await db.submission.upsert({
      where: { lcId: s.id },
      create: {
        userId,
        lcId: s.id,
        title: s.title,
        titleSlug: s.titleSlug,
        status: s.status,
        lang: s.lang,
        runtime: s.runtime,
        memory: s.memory,
        submittedAt: new Date(s.timestamp * 1000),
      },
      update: {},
    });
  }
}

/** A user's stored submissions, newest first. Fetches once if none are stored yet (users synced before this existed). */
export async function getSubmissions(user: User): Promise<Submission[]> {
  const load = () => db.submission.findMany({ where: { userId: user.id }, orderBy: { submittedAt: "desc" }, take: 100 });
  const rows = await load();
  if (rows.length > 0 || user.isDemo) return rows;
  await syncSubmissions(user.id, user.username).catch(() => undefined);
  return load();
}

export interface Dashboard {
  user: User;
  snapshots: Snapshot[];
  latest: Snapshot;
  /** true when LeetCode could not be reached and we are showing older stored data */
  stale: boolean;
  tagCounts: Record<string, number>;
  recentAc: RecentAc[];
  calendar: Record<string, number>;
}

/** Load a user's stored data, refreshing from LeetCode first if it is missing or old. */
export async function getDashboard(username: string, maxAgeMs = DEFAULT_MAX_AGE_MS): Promise<Dashboard> {
  let user = await db.user.findUnique({ where: { usernameKey: username.toLowerCase() } });
  let stale = false;

  const fresh = user?.lastSyncedAt && Date.now() - user.lastSyncedAt.getTime() < maxAgeMs;
  if (!user || !fresh) {
    try {
      user = await syncUser(username);
    } catch (err) {
      if (!user) throw err; // first visit and LeetCode failed: nothing to show
      stale = true; // otherwise show what we have
    }
  }

  const snapshots = await db.snapshot.findMany({ where: { userId: user.id }, orderBy: { takenAt: "asc" } });
  const latest = snapshots[snapshots.length - 1];
  if (!latest) throw new Error("No snapshot stored for this user yet.");

  return {
    user,
    snapshots,
    latest,
    stale,
    tagCounts: parseJson<Record<string, number>>(latest.topicsJson, {}),
    recentAc: parseJson<RecentAc[]>(user.recentAcJson, []),
    calendar: parseJson<Record<string, number>>(user.calendarJson, {}),
  };
}

export async function getSolvedSlugs(userId: number): Promise<Set<string>> {
  const marks = await db.problemMark.findMany({ where: { userId, solved: true }, select: { titleSlug: true } });
  return new Set(marks.map((m) => m.titleSlug));
}

/** Tick or un-tick a problem by hand. */
export async function setMark(username: string, titleSlug: string, solved: boolean): Promise<boolean> {
  const user = await db.user.findUnique({ where: { usernameKey: username.toLowerCase() } });
  if (!user) return false;
  await db.problemMark.upsert({
    where: { userId_titleSlug: { userId: user.id, titleSlug } },
    create: { userId: user.id, titleSlug, solved, source: "manual" },
    update: { solved, source: "manual", updatedAt: new Date() },
  });
  return true;
}

export async function setLadderStart(username: string, level: number): Promise<boolean> {
  const user = await db.user.findUnique({ where: { usernameKey: username.toLowerCase() } });
  if (!user) return false;
  await db.user.update({ where: { id: user.id }, data: { ladderStart: level } });
  return true;
}

export interface LadderState {
  solved: Set<string>;
  progress: LevelProgress[];
  startLevel: number;
  /** true when startLevel is our suggestion rather than the user's choice */
  startIsSuggested: boolean;
  currentId: number;
}

export async function getLadderState(d: Dashboard): Promise<LadderState> {
  const solved = await getSolvedSlugs(d.user.id);
  const progress = allProgress(solved);
  const suggested = suggestStartLevel({ easy: d.latest.easy, medium: d.latest.medium, hard: d.latest.hard });
  const startLevel = d.user.ladderStart ?? suggested;
  return {
    solved,
    progress,
    startLevel,
    startIsSuggested: d.user.ladderStart === null,
    currentId: currentLevelId(progress, startLevel),
  };
}

const DAY_MS = 24 * HOUR;
/** A new daily set skips problems suggested this recently (unless nothing else is left). */
const DAILY_NO_REPEAT_MS = 14 * DAY_MS;

export interface DailySet {
  /** in DAILY_SLOTS order (fewer only if nothing unsolved is left for a slot) */
  problems: DailyProblem[];
  /** the coming midnight, when the next set replaces this one */
  resetsAt: Date;
}

const liveDeps = (d: Dashboard) => ({ fetchProblems: d.user.isDemo ? undefined : fetchProblemsByTag });

/** Solved or ticked problems, plus the recent accepted ones from the latest sync. */
async function knownSolved(d: Dashboard): Promise<Set<string>> {
  const solved = await getSolvedSlugs(d.user.id);
  for (const r of d.recentAc) solved.add(r.titleSlug);
  return solved;
}

async function recentDailySlugs(userId: number, now: Date): Promise<string[]> {
  const rows = await db.dailyPick.findMany({
    where: { userId, setAt: { gte: new Date(now.getTime() - DAILY_NO_REPEAT_MS) } },
    select: { titleSlug: true },
  });
  return rows.map((r) => r.titleSlug);
}

/** The rows of today's set (made since the last midnight in DAILY_TIMEZONE), if there is one. */
async function currentDailyRows(userId: number, now: Date) {
  const latest = await db.dailyPick.findFirst({ where: { userId }, orderBy: { setAt: "desc" } });
  if (!latest || latest.setAt < startOfDay(now, dailyTimeZone())) return null;
  const rows = await db.dailyPick.findMany({ where: { userId, setAt: latest.setAt }, orderBy: [{ slot: "asc" }, { id: "asc" }] });
  return { setAt: latest.setAt, rows };
}

/**
 * Today's three problems (see DAILY_SLOTS): Easy and Medium from your strongest topics, then one from a
 * topic you've barely touched. A set lasts until midnight (in DAILY_TIMEZONE); problems solved today
 * are ticked rather than replaced, and the first visit after midnight makes a new set.
 */
export async function getDailySet(d: Dashboard, now = new Date()): Promise<DailySet> {
  const solved = await knownSolved(d);
  let current = await currentDailyRows(d.user.id, now);
  if (!current) {
    await createDailySet(d, solved, now);
    current = await currentDailyRows(d.user.id, now);
  }

  return {
    problems: (current?.rows ?? []).map((r) => ({
      titleSlug: r.titleSlug,
      title: r.title,
      difficulty: r.difficulty as Difficulty,
      kind: r.kind as DailyKind,
      topicName: r.topicName,
      url: `https://leetcode.com/problems/${r.titleSlug}/`,
      solved: solved.has(r.titleSlug),
    })),
    resetsAt: startOfNextDay(now, dailyTimeZone()),
  };
}

async function createDailySet(d: Dashboard, solved: Set<string>, setAt: Date): Promise<void> {
  const recent = await recentDailySlugs(d.user.id, setAt);
  const topics = analyzeTopics(d.tagCounts);

  let picks = await pickDaily({ topics, exclude: new Set([...solved, ...recent]) }, liveDeps(d));
  // Ran out of fresh problems somewhere: allow earlier suggestions again, but never solved ones.
  if (picks.length < DAILY_SLOTS.length) picks = await pickDaily({ topics, exclude: solved }, liveDeps(d));

  await db.dailyPick.createMany({
    data: picks.map((p) => ({
      userId: d.user.id,
      setAt,
      slot: p.slot,
      kind: p.kind,
      difficulty: p.difficulty,
      titleSlug: p.titleSlug,
      title: p.title,
      topicSlug: p.topicSlug,
      topicName: p.topicName,
    })),
  });
}

/**
 * "Solved it before": tick the problem (so it's never suggested again) and put a fresh problem for the
 * same slot in its place. LeetCode only shows us the last ~20 solves, so suggestions from strong
 * topics are sometimes old ones. Returns false if the problem isn't in today's set.
 */
export async function swapDailyProblem(d: Dashboard, titleSlug: string, now = new Date()): Promise<boolean> {
  const current = await currentDailyRows(d.user.id, now);
  const row = current?.rows.find((r) => r.titleSlug === titleSlug);
  if (!current || !row) return false;

  await setMark(d.user.username, titleSlug, true);
  const solved = await knownSolved(d);
  const pick = await pickReplacement(
    row.slot,
    {
      topics: analyzeTopics(d.tagCounts),
      exclude: new Set([...solved, ...(await recentDailySlugs(d.user.id, now))]),
      usedTopics: new Set(current.rows.filter((r) => r.id !== row.id).map((r) => r.topicSlug)),
    },
    liveDeps(d),
  );
  // Nothing left to swap in: the problem stays in the set, now ticked as solved.
  if (pick) {
    await db.dailyPick.update({
      where: { id: row.id },
      data: { kind: pick.kind, difficulty: pick.difficulty, titleSlug: pick.titleSlug, title: pick.title, topicSlug: pick.topicSlug, topicName: pick.topicName },
    });
  }
  return true;
}
