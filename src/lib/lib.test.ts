import { afterEach, describe, expect, it, vi } from "vitest";
import { analyzeTopics, weakestTopics } from "./analysis";
import { buildSeries, project, weeklyGains } from "./history";
import { langName, timeUntil } from "./format";
import { fetchProfile, htmlToText, normalizeProfile, ProfileResponseSchema, submissionIdFrom } from "./leetcode";
import { buildHintsPrompt, tidyHints } from "./hints";
import { pickRows, rankEntries } from "./leaderboard";
import { mockProfile } from "./mock";
import { CURATED } from "./curated";
import { startOfDay, startOfNextDay } from "./day";
import { pickDaily, pickReplacement } from "./recommend";
import { CORE_TOPICS } from "./topics";
import { allProgress, buildRatedLevels, currentLevelId, LADDER, nextUp, spreadEvenly, suggestStartLevel } from "./ladder";

const DAY = 86_400_000;

describe("analysis", () => {
  it("computes mastery and rings from tag counts", () => {
    const topics = analyzeTopics({ array: 80, graph: 3, "dynamic-programming": 20 });
    const byslug = Object.fromEntries(topics.map((t) => [t.slug, t]));
    expect(byslug.array.mastery).toBe(1);
    expect(byslug.array.ring).toBe("inner");
    expect(byslug.graph.ring).toBe("outer");
    expect(byslug["dynamic-programming"].ring).toBe("middle"); // 20/50 = 0.4
    expect(byslug.stack.solved).toBe(0);
  });

  it("finds the weakest topics first", () => {
    const topics = analyzeTopics({ array: 80, string: 50, graph: 1 });
    expect(weakestTopics(topics, 1)[0].mastery).toBe(0);
    expect(weakestTopics(topics, 3)).toHaveLength(3);
  });
});

describe("daily set", () => {
  const offline = { fetchProblems: async () => { throw new Error("offline"); } };
  // strong in arrays and strings, a little hash table, nothing else
  const profile = { array: 95, string: 41, "hash-table": 36, "linked-list": 5 };

  it("gives Easy and Medium from the strongest topics, then one from an untouched topic", async () => {
    const picks = await pickDaily({ topics: analyzeTopics(profile), exclude: new Set() }, offline);
    expect(picks.map((p) => [p.slot, p.kind, p.difficulty, p.topicSlug])).toEqual([
      [0, "strong", "Easy", "array"],
      [1, "strong", "Medium", "string"],
      [2, "new", "Easy", picks[2].topicSlug],
    ]);
    expect(analyzeTopics(profile).find((t) => t.slug === picks[2].topicSlug)?.solved).toBe(0);
    expect(picks.every((p) => p.url === `https://leetcode.com/problems/${p.titleSlug}/`)).toBe(true);
  });

  it("moves to the next strong topic when one has nothing left at that difficulty", async () => {
    const arrayEasy = CURATED.array.filter((c) => c.difficulty === "Easy").map((c) => c.titleSlug);
    const picks = await pickDaily({ topics: analyzeTopics(profile), exclude: new Set(arrayEasy) }, offline);
    expect(picks[0]).toMatchObject({ difficulty: "Easy", kind: "strong" });
    expect(picks[0].topicSlug).not.toBe("array");
    expect(new Set(picks.map((p) => p.topicSlug)).size).toBe(3);
  });

  it("uses live problems by acceptance rate when the classics run out, dropping paid ones", async () => {
    const allCurated = new Set(Object.values(CURATED).flat().map((c) => c.titleSlug));
    const picks = await pickDaily(
      { topics: analyzeTopics(profile), exclude: allCurated },
      {
        fetchProblems: async (tag, difficulty) => [
          { title: "Meh", titleSlug: `meh-${tag}-${difficulty}`, difficulty, acRate: 30, paidOnly: false },
          { title: "Paid", titleSlug: `paid-${tag}-${difficulty}`, difficulty, acRate: 99, paidOnly: true },
          { title: "Friendly", titleSlug: `friendly-${tag}-${difficulty}`, difficulty, acRate: 80, paidOnly: false },
        ],
      },
    );
    expect(picks.map((p) => p.titleSlug.split("-")[0])).toEqual(["friendly", "friendly", "friendly"]);
    expect(picks[0].titleSlug).toBe("friendly-array-Easy");
  });

  it("swaps in a replacement for the same slot, avoiding today's other topics", async () => {
    const topics = analyzeTopics(profile);
    const [first] = await pickDaily({ topics, exclude: new Set() }, offline);
    const replacement = await pickReplacement(0, { topics, exclude: new Set([first.titleSlug]), usedTopics: new Set(["string", "graph"]) }, offline);
    expect(replacement).toMatchObject({ slot: 0, kind: "strong", difficulty: "Easy", topicSlug: "array" });
    expect(replacement?.titleSlug).not.toBe(first.titleSlug);
  });

  it("finds midnight in the daily timezone", () => {
    const ist = "Asia/Kolkata";
    const lateEvening = new Date("2026-10-01T17:53:00Z"); // 23:23 on Oct 1 in India
    expect(startOfDay(lateEvening, ist).toISOString()).toBe("2026-09-30T18:30:00.000Z"); // 00:00 Oct 1 IST
    expect(startOfNextDay(lateEvening, ist).toISOString()).toBe("2026-10-01T18:30:00.000Z"); // 00:00 Oct 2 IST
    const justAfter = new Date("2026-10-01T18:31:00Z"); // 00:01 on Oct 2 in India
    expect(startOfDay(justAfter, ist).toISOString()).toBe("2026-10-01T18:30:00.000Z");
    expect(startOfDay(new Date("2026-10-01T10:00:00Z"), "UTC").toISOString()).toBe("2026-10-01T00:00:00.000Z");
  });

  it("handles a daylight-saving day", () => {
    const ny = "America/New_York"; // clocks jump 2:00 -> 3:00 on 2026-03-08
    const afternoon = new Date("2026-03-08T19:00:00Z");
    expect(startOfDay(afternoon, ny).toISOString()).toBe("2026-03-08T05:00:00.000Z"); // midnight EST
    expect(startOfNextDay(afternoon, ny).toISOString()).toBe("2026-03-09T04:00:00.000Z"); // midnight EDT
  });

  it("formats the time until the next set", () => {
    const now = new Date("2026-10-01T10:00:00Z");
    expect(timeUntil(new Date("2026-10-02T10:00:00Z"), now)).toBe("24h");
    expect(timeUntil(new Date("2026-10-01T17:12:00Z"), now)).toBe("7h 12m");
    expect(timeUntil(new Date("2026-10-01T10:45:00Z"), now)).toBe("45m");
    expect(timeUntil(new Date("2026-10-01T09:00:00Z"), now)).toBe("1m");
  });
});

describe("history", () => {
  const now = new Date("2026-09-29T12:00:00Z");

  it("uses real snapshots and projects the recent pace", () => {
    const snapshots = Array.from({ length: 12 }, (_, i) => ({
      takenAt: new Date(now.getTime() - (11 - i) * 7 * DAY),
      totalSolved: 100 + i * 30,
    }));
    const series = buildSeries({ snapshots, calendar: {}, now });
    expect(series).toHaveLength(12);
    expect(series.every((p) => !p.estimated)).toBe(true);
    expect(weeklyGains(series).every((g) => g === 30)).toBe(true);
    const { pace, values } = project(series);
    expect(pace).toBe(30);
    expect(values).toEqual([460, 490, 520]);
  });

  it("estimates earlier weeks from the calendar when we only have one snapshot", () => {
    const calendar: Record<string, number> = {};
    for (let d = 90; d >= 0; d--) calendar[String(Math.floor((now.getTime() - d * DAY) / 1000))] = 2;
    const series = buildSeries({ snapshots: [{ takenAt: now, totalSolved: 300 }], calendar, now });
    expect(series.length).toBeGreaterThan(2);
    expect(series[0].estimated).toBe(true);
    expect(series[series.length - 1]).toMatchObject({ total: 300, estimated: false });
    for (let i = 1; i < series.length; i++) expect(series[i].total).toBeGreaterThanOrEqual(series[i - 1].total);
  });

  it("returns nothing to plot when there is no data", () => {
    expect(buildSeries({ snapshots: [], calendar: {}, now })).toEqual([]);
  });
});

describe("leaderboard", () => {
  const entries = [
    { username: "a", total: 100, gain: 5 },
    { username: "b", total: 300, gain: 1 },
    { username: "c", total: 200, gain: 9 },
  ];
  it("ranks by total or by weekly gain", () => {
    expect(rankEntries(entries, "all").map((r) => r.username)).toEqual(["b", "c", "a"]);
    expect(rankEntries(entries, "week").map((r) => r.username)).toEqual(["c", "a", "b"]);
  });
  it("appends the current user when they are outside the top N", () => {
    const rows = pickRows(rankEntries(entries, "all"), "a", 2);
    expect(rows.map((r) => r.username)).toEqual(["b", "c", "a"]);
    expect(rows[2]).toMatchObject({ rank: 3, isMe: true });
  });
});

describe("LeetCode response handling", () => {
  const sample = {
    matchedUser: {
      username: "Someone",
      profile: { ranking: 12345, realName: "Some One", userAvatar: null },
      submitStatsGlobal: {
        acSubmissionNum: [
          { difficulty: "All", count: 10 },
          { difficulty: "Easy", count: 6 },
          { difficulty: "Medium", count: 3 },
          { difficulty: "Hard", count: 1 },
        ],
      },
      tagProblemCounts: {
        advanced: [{ tagName: "Dynamic Programming", tagSlug: "dynamic-programming", problemsSolved: 1 }],
        intermediate: [{ tagName: "Tree", tagSlug: "tree", problemsSolved: 2 }],
        fundamental: [{ tagName: "Array", tagSlug: "array", problemsSolved: 7 }],
      },
      userCalendar: { streak: 3, totalActiveDays: 9, submissionCalendar: '{"1700000000":4}' },
    },
  };

  it("normalises a valid response", () => {
    const parsed = ProfileResponseSchema.parse(sample);
    const p = normalizeProfile(parsed, []);
    expect(p).toMatchObject({ username: "Someone", total: 10, easy: 6, medium: 3, hard: 1, streak: 3, ranking: 12345 });
    expect(p.tagCounts).toEqual({ array: 7, tree: 2, "dynamic-programming": 1 });
    expect(p.calendar).toEqual({ "1700000000": 4 });
  });

  it("rejects a response that changed shape", () => {
    const broken = { matchedUser: { username: "x" } };
    expect(ProfileResponseSchema.safeParse(broken).success).toBe(false);
  });

  it("reports an unknown user as NOT_FOUND", () => {
    expect(() => normalizeProfile({ matchedUser: null }, [])).toThrow(/does not exist/);
  });
});

describe("problem text", () => {
  it("turns problem HTML into text and keeps exponents", () => {
    const html = "<p>Given <code>nums</code>&nbsp;&amp; k.</p>\n<ul><li><code>1 &lt;= n &lt;= 10<sup>5</sup></code></li></ul>";
    expect(htmlToText(html)).toBe("Given nums & k.\n\n- 1 <= n <= 10^5");
  });
});

describe("submissions and hints", () => {
  it("reads LeetCode's submission id from its URL", () => {
    expect(submissionIdFrom("/submissions/detail/2158019942/")).toBe("2158019942");
    expect(submissionIdFrom("/problems/two-sum/")).toBeNull();
  });

  it("names LeetCode language codes and passes unknown ones through", () => {
    expect(langName("cpp")).toBe("C++");
    expect(langName("python3")).toBe("Python");
    expect(langName("golang")).toBe("Go");
    expect(langName("cobol")).toBe("cobol");
  });

  it("builds a hints prompt from the submission's public numbers", () => {
    const question = { title: "Two Sum", titleSlug: "two-sum", difficulty: "Easy" as const, paidOnly: false, statement: "Find two numbers.", tags: ["Array"] };
    const prompt = buildHintsPrompt({ question, language: "C++", status: "Accepted", runtime: "0 ms", memory: "33.1 MB" });
    expect(prompt).toContain("Find two numbers.");
    expect(prompt).toContain('<their_submission language="C++" status="Accepted" runtime="0 ms" memory="33.1 MB" />');
    const premium = buildHintsPrompt({ question: { ...question, statement: null }, language: "Go", status: "Accepted", runtime: "4 ms", memory: "6 MB" });
    expect(premium).toContain("Premium problem");
  });

  it("keeps at most 6 hints and only web links as sources", () => {
    const tidy = tidyHints({
      focus: "memory",
      focusReason: "0 ms can't be beaten.",
      best: { time: "O(n)", space: "O(1)" },
      fastestReported: null,
      hints: ["a", " ", "b", "c", "d", "e", "f", "g"],
      sources: [
        { title: "LeetCode post", url: "https://leetcode.com/problems/two-sum/solutions/1/" },
        { title: "bad", url: "javascript:alert(1)" },
      ],
    });
    expect(tidy.hints).toEqual(["a", "b", "c", "d", "e", "f"]);
    expect(tidy.sources.map((x) => x.title)).toEqual(["LeetCode post"]);
  });
});

describe("mock data", () => {
  it("demo user matches the design numbers and is deterministic", () => {
    const a = mockProfile("demo", new Date("2026-09-29T00:00:00Z"));
    const b = mockProfile("demo", new Date("2026-09-29T00:00:00Z"));
    expect(a.total).toBe(412);
    expect(a.streak).toBe(23);
    expect(a).toEqual(b);
  });
});

describe("fetchProfile (HTTP layer, fetch mocked)", () => {
  afterEach(() => vi.unstubAllGlobals());

  const okProfile = {
    data: {
      matchedUser: {
        username: "Someone",
        profile: { ranking: 1, realName: "", userAvatar: null },
        submitStatsGlobal: { acSubmissionNum: [{ difficulty: "All", count: 5 }] },
        tagProblemCounts: { advanced: [], intermediate: [], fundamental: [{ tagName: "Array", tagSlug: "array", problemsSolved: 5 }] },
        userCalendar: { streak: 2, totalActiveDays: 4, submissionCalendar: "{}" },
      },
      recentAcSubmissionList: [{ title: "Two Sum", titleSlug: "two-sum", timestamp: "1700000000" }],
    },
  };

  it("fetches, validates and normalises a profile", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(okProfile), { status: 200 })));
    const p = await fetchProfile("someone");
    expect(p.username).toBe("Someone");
    expect(p.total).toBe(5);
    expect(p.recentAc[0]).toEqual({ title: "Two Sum", titleSlug: "two-sum", timestamp: 1700000000 });
  });

  it("maps LeetCode's 'user does not exist' error to NOT_FOUND without retrying", async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ errors: [{ message: "That user does not exist." }], data: { matchedUser: null } }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchProfile("nobody")).rejects.toMatchObject({ code: "NOT_FOUND" });
    // profile query + recent-submissions query, one attempt each
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(2);
  });

  it("reports a changed response shape as SCHEMA", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ data: { matchedUser: { username: "x" } } }), { status: 200 })));
    await expect(fetchProfile("x")).rejects.toMatchObject({ code: "SCHEMA" });
  });
});

describe("ladder", () => {
  const rows = Array.from({ length: 100 }, (_, i) => ({
    Rating: 1100 + i * 4, // 1100 .. 1496, so bands 1100..1400 (25 problems each)
    Title: `Problem ${i}`,
    TitleSlug: `problem-${i}`,
    ContestSlug: `weekly-contest-${100 + i}`,
    ProblemIndex: "Q2",
  }));

  it("builds 100-point bands, keeps at most perLevel problems, and orders by rating", () => {
    const levels = buildRatedLevels(rows, { perLevel: 10, minRating: 1100, topStart: 1400 });
    expect(levels.map((l) => l.range)).toEqual(["1100-1199", "1200-1299", "1300-1399", "1400+"]);
    for (const l of levels) {
      expect(l.problems.length).toBeLessThanOrEqual(10);
      const ratings = l.problems.map((p) => p.rating as number);
      expect([...ratings].sort((a, b) => a - b)).toEqual(ratings);
    }
    expect(levels[0].problems[0].contest).toMatch(/^W\d+$/);
  });

  it("spreads picks evenly instead of taking the first N", () => {
    const picked = spreadEvenly(Array.from({ length: 100 }, (_, i) => i), 4);
    expect(picked).toEqual([12, 37, 62, 87]);
  });

  it("merges everything from topStart upward into the last level", () => {
    const levels = buildRatedLevels([...rows, { ...rows[0], Rating: 3100, TitleSlug: "hard-one" }], { perLevel: 50, topStart: 1400 });
    expect(levels[levels.length - 1].name).toBe("1400+");
    expect(levels[levels.length - 1].problems.map((p) => p.slug)).toContain("hard-one");
  });

  it("the shipped ladder has Foundations plus rated levels of 31 unique problems", () => {
    expect(LADDER.levels[0].name).toBe("Foundations");
    expect(LADDER.levels).toHaveLength(18);
    expect(LADDER.levels.every((l) => l.problems.length === 31)).toBe(true);
    const slugs = LADDER.levels.flatMap((l) => l.problems.map((p) => p.slug));
    expect(new Set(slugs).size).toBe(slugs.length);
    for (let i = 2; i < LADDER.levels.length; i++) {
      expect(LADDER.levels[i].minRating!).toBeGreaterThan(LADDER.levels[i - 1].minRating!);
    }
  });

  it("tracks progress, completion at 80%, and the current level", () => {
    const l0 = LADDER.levels[0].problems.map((p) => p.slug);
    const solved = new Set(l0.slice(0, 25)); // 25 of 31 = complete
    const progress = allProgress(solved);
    expect(progress[0]).toMatchObject({ solved: 25, total: 31, complete: true });
    expect(progress[1].complete).toBe(false);
    expect(currentLevelId(progress, 0)).toBe(1);
    expect(currentLevelId(progress, 5)).toBe(5); // start level is respected
    expect(nextUp(LADDER.levels[0], solved, 2).map((p) => p.slug)).toEqual(l0.slice(25, 27));
  });

  it("suggests a starting level from difficulty counts", () => {
    expect(suggestStartLevel({ easy: 10, medium: 5, hard: 0 })).toBe(0);
    const mid = suggestStartLevel({ easy: 168, medium: 205, hard: 39 });
    expect(LADDER.levels[mid].minRating).toBe(1300);
    const strong = suggestStartLevel({ easy: 300, medium: 700, hard: 300 });
    expect(strong).toBeGreaterThan(mid);
  });
});
