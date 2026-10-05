export type Difficulty = "Easy" | "Medium" | "Hard";

export interface RecentAc {
  title: string;
  titleSlug: string;
  /** unix seconds */
  timestamp: number;
}

/** LeetCode profile data, normalised into the shape the rest of the app uses. */
export interface NormalizedProfile {
  username: string;
  realName: string | null;
  avatar: string | null;
  ranking: number | null;
  easy: number;
  medium: number;
  hard: number;
  total: number;
  /** tagSlug -> solved count */
  tagCounts: Record<string, number>;
  streak: number;
  totalActiveDays: number;
  /** unix-seconds (day start, UTC) as string -> number of submissions that day */
  calendar: Record<string, number>;
  recentAc: RecentAc[];
}

export interface CatalogProblem {
  title: string;
  titleSlug: string;
  difficulty: Difficulty;
  /** acceptance rate, 0-100 */
  acRate: number | null;
  paidOnly: boolean;
}

export interface TopicStat {
  slug: string;
  name: string;
  short: string;
  solved: number;
  goal: number;
  /** 0..1, solved / goal (capped) */
  mastery: number;
  ring: "inner" | "middle" | "outer";
}

export interface Recommendation {
  titleSlug: string;
  title: string;
  difficulty: Difficulty;
  /** the topic it was picked from */
  topicSlug: string;
  topicName: string;
  url: string;
}

/** One problem of today's set on the Universe page. */
export interface DailyProblem {
  titleSlug: string;
  title: string;
  difficulty: Difficulty;
  /** "strong": from a topic you've solved a lot; "new": from a topic you've barely touched */
  kind: "strong" | "new";
  topicName: string;
  url: string;
  solved: boolean;
}

/** One LeetCode problem, as needed for beat-this hints. */
export interface QuestionDetail {
  title: string;
  titleSlug: string;
  difficulty: Difficulty;
  paidOnly: boolean;
  /** plain-text statement; null for Premium problems (LeetCode hides it without a subscription) */
  statement: string | null;
  tags: string[];
}

/** One entry of LeetCode's public recent-submissions list. */
export interface RecentSubmission {
  /** LeetCode's submission id */
  id: string;
  title: string;
  titleSlug: string;
  /** unix seconds */
  timestamp: number;
  status: string;
  /** LeetCode language code, e.g. "cpp" */
  lang: string;
  runtime: string;
  memory: string;
}
