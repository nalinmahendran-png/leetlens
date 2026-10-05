/**
 * Pure ladder types + the builder that turns community rating rows into levels.
 * (No JSON import here, so the build script can run before data/ladder.json exists.)
 */
export const PER_LEVEL = 31;
/** A level counts as "complete" once this share of it is solved (like moving on at ~80%). */
export const COMPLETE_RATIO = 0.8;

export interface LadderProblem {
  slug: string;
  title: string;
  /** contest-based rating, null for Foundations problems */
  rating: number | null;
  /** e.g. "W475" (weekly 475) or "B142" (biweekly 142); Foundations: null */
  contest: string | null;
  /** "Q1".."Q4" for contest problems */
  q: string | null;
  /** Foundations only */
  topic?: string;
  difficulty?: "Easy" | "Medium" | "Hard";
}

export interface LadderLevel {
  /** 0 = Foundations, 1.. = rated levels in ascending order */
  id: number;
  name: string;
  /** e.g. "1100-1199", "2700+", "Classics" */
  range: string;
  minRating: number | null;
  problems: LadderProblem[];
}

export interface LadderFile {
  generatedAt: string;
  source: string;
  levels: LadderLevel[];
}

/* ------------------------------------------------------------------ building */

export interface RatingRow {
  Rating: number;
  Title: string;
  TitleSlug: string;
  ContestSlug: string;
  ProblemIndex: string;
}

/** "weekly-contest-475" -> { code: "W475", n: 475 } */
export function contestCode(slug: string): { code: string; n: number } {
  const m = /^(bi)?weekly-contest-(\d+)$/.exec(slug);
  if (!m) return { code: slug, n: 0 };
  return { code: `${m[1] ? "B" : "W"}${m[2]}`, n: Number(m[2]) };
}

/** Pick `count` items spread evenly across a sorted list (deterministic). */
export function spreadEvenly<T>(sorted: T[], count: number): T[] {
  if (sorted.length <= count) return [...sorted];
  const out: T[] = [];
  for (let k = 0; k < count; k++) out.push(sorted[Math.floor(((k + 0.5) * sorted.length) / count)]);
  return out;
}

/**
 * Turn the community rating rows into rated levels:
 * 100-point bands starting at `minRating`; every band from `topStart` up is merged into one
 * final level. Each level keeps `perLevel` problems spread evenly over contest history (so a
 * level mixes many eras and topics), shown from lowest to highest rating.
 */
export function buildRatedLevels(
  rows: RatingRow[],
  opts: { perLevel?: number; minRating?: number; topStart?: number } = {},
): Omit<LadderLevel, "id">[] {
  const perLevel = opts.perLevel ?? PER_LEVEL;
  const minRating = opts.minRating ?? 1100;
  const topStart = opts.topStart ?? 2700;

  const bandOf = (rating: number) => Math.min(topStart, Math.max(minRating, Math.floor(rating / 100) * 100));
  const bands = new Map<number, RatingRow[]>();
  for (const r of rows) {
    if (!r.TitleSlug || !Number.isFinite(r.Rating)) continue;
    const b = bandOf(r.Rating);
    bands.set(b, [...(bands.get(b) ?? []), r]);
  }

  const levels: Omit<LadderLevel, "id">[] = [];
  for (const band of [...bands.keys()].sort((a, b) => a - b)) {
    const list = bands.get(band)!;
    // oldest contest first, so an even spread mixes eras
    list.sort((a, b) => contestCode(a.ContestSlug).n - contestCode(b.ContestSlug).n || a.ProblemIndex.localeCompare(b.ProblemIndex));
    const picked = spreadEvenly(list, perLevel).sort((a, b) => a.Rating - b.Rating);
    levels.push({
      name: band === topStart ? `${band}+` : String(band),
      range: band === topStart ? `${band}+` : `${band}-${band + 99}`,
      minRating: band,
      problems: picked.map((r) => ({
        slug: r.TitleSlug,
        title: r.Title,
        rating: Math.round(r.Rating),
        contest: contestCode(r.ContestSlug).code,
        q: r.ProblemIndex,
      })),
    });
  }
  return levels;
}

