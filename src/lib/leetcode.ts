import { z } from "zod";
import { TtlCache } from "./cache";
import type { CatalogProblem, Difficulty, NormalizedProfile, QuestionDetail, RecentAc, RecentSubmission } from "./types";

/**
 * LeetCode has no official public API. This talks to the same GraphQL endpoint the website
 * uses. It can change or rate-limit at any time, so every response is validated with Zod and
 * failures are turned into typed errors instead of silently corrupting data.
 * Only PUBLIC profile data is requested -- never ask users for passwords or session cookies.
 */
const ENDPOINT = "https://leetcode.com/graphql";
const TIMEOUT_MS = 10_000;
const MAX_ATTEMPTS = 3;

export type LeetCodeErrorCode = "NOT_FOUND" | "RATE_LIMITED" | "UPSTREAM" | "SCHEMA";

export class LeetCodeError extends Error {
  constructor(public code: LeetCodeErrorCode, message: string) {
    super(message);
    this.name = "LeetCodeError";
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function gql(query: string, variables: Record<string, unknown>): Promise<unknown> {
  let lastError: LeetCodeError | null = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) await sleep(400 * 2 ** attempt);
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Referer: "https://leetcode.com",
          "User-Agent": "Mozilla/5.0 (compatible; LeetLens/0.1; +https://github.com/your-name/leetlens)",
        },
        body: JSON.stringify({ query, variables }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: "no-store",
      });

      if (res.status === 429) {
        lastError = new LeetCodeError("RATE_LIMITED", "LeetCode is rate-limiting us. Try again in a minute.");
        continue;
      }
      if (res.status >= 500) {
        lastError = new LeetCodeError("UPSTREAM", `LeetCode returned HTTP ${res.status}.`);
        continue;
      }

      let json: { data?: unknown; errors?: { message?: string }[] };
      try {
        json = (await res.json()) as typeof json;
      } catch {
        throw new LeetCodeError(
          "UPSTREAM",
          `LeetCode returned a non-JSON response (HTTP ${res.status}). It may be blocking requests from this server.`,
        );
      }
      const messages = (json.errors ?? []).map((e) => e.message ?? "").join(" | ");
      if (/does not exist/i.test(messages)) {
        throw new LeetCodeError("NOT_FOUND", "That LeetCode user does not exist.");
      }
      if (!res.ok) throw new LeetCodeError("UPSTREAM", `LeetCode returned HTTP ${res.status}. ${messages}`);
      if (json.errors?.length && !json.data) throw new LeetCodeError("UPSTREAM", messages || "GraphQL error");
      return json.data;
    } catch (err) {
      if (err instanceof LeetCodeError) {
        if (err.code === "NOT_FOUND") throw err;
        lastError = err;
        continue;
      }
      lastError = new LeetCodeError("UPSTREAM", `Could not reach LeetCode (${(err as Error).message}).`);
    }
  }
  throw lastError ?? new LeetCodeError("UPSTREAM", "Unknown LeetCode error.");
}

/* ------------------------------------------------------------------ profile */

const PROFILE_QUERY = /* GraphQL */ `
  query userProfile($username: String!) {
    matchedUser(username: $username) {
      username
      profile { ranking realName userAvatar }
      submitStatsGlobal { acSubmissionNum { difficulty count } }
      tagProblemCounts {
        advanced { tagName tagSlug problemsSolved }
        intermediate { tagName tagSlug problemsSolved }
        fundamental { tagName tagSlug problemsSolved }
      }
      userCalendar { streak totalActiveDays submissionCalendar }
    }
  }
`;

const RECENT_QUERY = /* GraphQL */ `
  query recentAc($username: String!, $limit: Int!) {
    recentAcSubmissionList(username: $username, limit: $limit) { title titleSlug timestamp }
  }
`;

const TagCountSchema = z.object({
  tagName: z.string(),
  tagSlug: z.string(),
  problemsSolved: z.number(),
});

export const ProfileResponseSchema = z.object({
  matchedUser: z
    .object({
      username: z.string(),
      profile: z.object({
        ranking: z.number().nullable().optional(),
        realName: z.string().nullable().optional(),
        userAvatar: z.string().nullable().optional(),
      }),
      submitStatsGlobal: z.object({
        acSubmissionNum: z.array(z.object({ difficulty: z.string(), count: z.number() })),
      }),
      tagProblemCounts: z.object({
        advanced: z.array(TagCountSchema),
        intermediate: z.array(TagCountSchema),
        fundamental: z.array(TagCountSchema),
      }),
      userCalendar: z
        .object({
          streak: z.number().nullable().optional(),
          totalActiveDays: z.number().nullable().optional(),
          submissionCalendar: z.string().nullable().optional(),
        })
        .nullable()
        .optional(),
    })
    .nullable(),
});

const RecentResponseSchema = z.object({
  recentAcSubmissionList: z
    .array(z.object({ title: z.string(), titleSlug: z.string(), timestamp: z.union([z.string(), z.number()]) }))
    .nullable(),
});

function schemaError(what: string, err: z.ZodError): LeetCodeError {
  const detail = err.issues
    .slice(0, 3)
    .map((i) => `${i.path.join(".")}: ${i.message}`)
    .join("; ");
  return new LeetCodeError("SCHEMA", `LeetCode's ${what} response changed shape (${detail}).`);
}

/** Pure: turn a validated GraphQL response into our profile shape. Exported for tests. */
export function normalizeProfile(
  data: z.infer<typeof ProfileResponseSchema>,
  recentAc: RecentAc[],
): NormalizedProfile {
  const u = data.matchedUser;
  if (!u) throw new LeetCodeError("NOT_FOUND", "That LeetCode user does not exist.");

  const byDifficulty = new Map(u.submitStatsGlobal.acSubmissionNum.map((d) => [d.difficulty, d.count]));
  const easy = byDifficulty.get("Easy") ?? 0;
  const medium = byDifficulty.get("Medium") ?? 0;
  const hard = byDifficulty.get("Hard") ?? 0;
  const total = byDifficulty.get("All") ?? easy + medium + hard;

  const tagCounts: Record<string, number> = {};
  for (const level of [u.tagProblemCounts.fundamental, u.tagProblemCounts.intermediate, u.tagProblemCounts.advanced]) {
    for (const t of level) tagCounts[t.tagSlug] = (tagCounts[t.tagSlug] ?? 0) + t.problemsSolved;
  }

  let calendar: Record<string, number> = {};
  try {
    const parsed = JSON.parse(u.userCalendar?.submissionCalendar ?? "{}");
    if (parsed && typeof parsed === "object") calendar = parsed as Record<string, number>;
  } catch {
    calendar = {};
  }

  return {
    username: u.username,
    realName: u.profile.realName || null,
    avatar: u.profile.userAvatar || null,
    ranking: u.profile.ranking ?? null,
    easy,
    medium,
    hard,
    total,
    tagCounts,
    streak: u.userCalendar?.streak ?? 0,
    totalActiveDays: u.userCalendar?.totalActiveDays ?? 0,
    calendar,
    recentAc,
  };
}

export async function fetchProfile(username: string): Promise<NormalizedProfile> {
  const [profileRaw, recentAc] = await Promise.all([
    gql(PROFILE_QUERY, { username }),
    fetchRecentAc(username).catch(() => [] as RecentAc[]), // non-critical
  ]);
  const parsed = ProfileResponseSchema.safeParse(profileRaw);
  if (!parsed.success) throw schemaError("profile", parsed.error);
  return normalizeProfile(parsed.data, recentAc);
}

export async function fetchRecentAc(username: string, limit = 20): Promise<RecentAc[]> {
  const raw = await gql(RECENT_QUERY, { username, limit });
  const parsed = RecentResponseSchema.safeParse(raw);
  if (!parsed.success) throw schemaError("recent submissions", parsed.error);
  return (parsed.data.recentAcSubmissionList ?? []).map((s) => ({
    title: s.title,
    titleSlug: s.titleSlug,
    timestamp: Number(s.timestamp),
  }));
}

/* ------------------------------------------------------------ problem catalog */

const PROBLEMS_QUERY = /* GraphQL */ `
  query problemsetQuestionList($categorySlug: String, $limit: Int, $skip: Int, $filters: QuestionListFilterInput) {
    problemsetQuestionList: questionList(categorySlug: $categorySlug, limit: $limit, skip: $skip, filters: $filters) {
      total: totalNum
      questions: data { title titleSlug difficulty acRate isPaidOnly }
    }
  }
`;

const ProblemsResponseSchema = z.object({
  problemsetQuestionList: z.object({
    total: z.number(),
    questions: z.array(
      z.object({
        title: z.string(),
        titleSlug: z.string(),
        difficulty: z.enum(["Easy", "Medium", "Hard"]),
        acRate: z.number().nullable().optional(),
        isPaidOnly: z.boolean().nullable().optional(),
      }),
    ),
  }),
});

const catalogCache = new TtlCache<CatalogProblem[]>(24 * 60 * 60 * 1000);

/** Problems for one topic + difficulty. Cached for a day; the catalog barely changes. */
export async function fetchProblemsByTag(
  tagSlug: string,
  difficulty: Difficulty,
  limit = 50,
): Promise<CatalogProblem[]> {
  const key = `${tagSlug}:${difficulty}:${limit}`;
  const cached = catalogCache.get(key);
  if (cached) return cached;

  const raw = await gql(PROBLEMS_QUERY, {
    categorySlug: "",
    limit,
    skip: 0,
    filters: { tags: [tagSlug], difficulty: difficulty.toUpperCase() },
  });
  const parsed = ProblemsResponseSchema.safeParse(raw);
  if (!parsed.success) throw schemaError("problem list", parsed.error);

  const result = parsed.data.problemsetQuestionList.questions.map((q) => ({
    title: q.title,
    titleSlug: q.titleSlug,
    difficulty: q.difficulty,
    acRate: q.acRate ?? null,
    paidOnly: Boolean(q.isPaidOnly),
  }));
  catalogCache.set(key, result);
  return result;
}

/* ------------------------------------------------------------ single problem */

const QUESTION_QUERY = /* GraphQL */ `
  query questionDetail($titleSlug: String!) {
    question(titleSlug: $titleSlug) {
      title titleSlug difficulty isPaidOnly content
      topicTags { name slug }
    }
  }
`;

const QuestionResponseSchema = z.object({
  question: z
    .object({
      title: z.string(),
      titleSlug: z.string(),
      difficulty: z.enum(["Easy", "Medium", "Hard"]),
      isPaidOnly: z.boolean().nullable().optional(),
      content: z.string().nullable().optional(),
      topicTags: z.array(z.object({ name: z.string(), slug: z.string() })),
    })
    .nullable(),
});

/** Pure: LeetCode's problem HTML as plain text. Keeps exponents ("10^4") since constraints drive complexity. */
export function htmlToText(html: string): string {
  return html
    .replace(/<sup>(.*?)<\/sup>/gi, "^$1")
    .replace(/<\/(p|li|pre|div)>|<br\s*\/?>/gi, "\n")
    .replace(/<li>/gi, "- ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const questionCache = new TtlCache<QuestionDetail>(24 * 60 * 60 * 1000);

/** One problem's statement and tags. Premium problems come back without a statement. */
export async function fetchQuestion(titleSlug: string): Promise<QuestionDetail> {
  const cached = questionCache.get(titleSlug);
  if (cached) return cached;

  const raw = await gql(QUESTION_QUERY, { titleSlug });
  const parsed = QuestionResponseSchema.safeParse(raw);
  if (!parsed.success) throw schemaError("problem", parsed.error);
  const q = parsed.data.question;
  if (!q) throw new LeetCodeError("NOT_FOUND", "That LeetCode problem does not exist.");

  const result: QuestionDetail = {
    title: q.title,
    titleSlug: q.titleSlug,
    difficulty: q.difficulty,
    paidOnly: Boolean(q.isPaidOnly),
    statement: q.content ? htmlToText(q.content) : null,
    tags: q.topicTags.map((t) => t.name),
  };
  questionCache.set(titleSlug, result);
  return result;
}

/* ------------------------------------------------------- recent submissions */

const SUBMISSIONS_QUERY = /* GraphQL */ `
  query recentSubmissions($username: String!, $limit: Int!) {
    recentSubmissionList(username: $username, limit: $limit) {
      title titleSlug timestamp statusDisplay lang runtime memory url
    }
  }
`;

const SubmissionsResponseSchema = z.object({
  recentSubmissionList: z
    .array(
      z.object({
        title: z.string(),
        titleSlug: z.string(),
        timestamp: z.union([z.string(), z.number()]),
        statusDisplay: z.string(),
        lang: z.string(),
        runtime: z.string(),
        memory: z.string(),
        url: z.string(),
      }),
    )
    .nullable(),
});

/** Pure: LeetCode's submission id from a "/submissions/detail/<id>/" URL. */
export function submissionIdFrom(url: string): string | null {
  return url.match(/\/submissions\/detail\/(\d+)/)?.[1] ?? null;
}

/**
 * The newest ~20 submissions with language, runtime and memory (no code: that needs the owner's
 * login). LeetCode caps the list at 20 and, for other people, appears to include accepted ones only.
 */
export async function fetchRecentSubmissions(username: string): Promise<RecentSubmission[]> {
  const raw = await gql(SUBMISSIONS_QUERY, { username, limit: 20 });
  const parsed = SubmissionsResponseSchema.safeParse(raw);
  if (!parsed.success) throw schemaError("recent submissions", parsed.error);
  return (parsed.data.recentSubmissionList ?? []).flatMap((s) => {
    const id = submissionIdFrom(s.url);
    if (!id) return [];
    return [{ id, title: s.title, titleSlug: s.titleSlug, timestamp: Number(s.timestamp), status: s.statusDisplay, lang: s.lang, runtime: s.runtime, memory: s.memory }];
  });
}
