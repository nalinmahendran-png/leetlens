# LeetLens

Connect a LeetCode username and see your progress as a **solar system**: every topic is a planet, weak topics drift to the outer orbit, and the app suggests what to solve next. A **leaderboard** shows who is solving the most, a **progress page** charts your trajectory over time, and the **Ladder** is a CP-31-style checklist: fixed sets of 31 problems per difficulty level, worked through in order. The **Submissions** page shows the runtime and memory of each solve, and **Beat this** searches the web for faster solutions and turns them into hints.

**Stack:** Next.js 15 (App Router) · TypeScript · React 19 · Prisma + SQLite (Postgres-ready) · Zod · Vitest · Claude API with web search (hints)

> LeetLens is an independent project and is not affiliated with LeetCode. It only reads **public** profile data and never asks for a password or session cookie.

---

## Quick start

Requires Node.js 20+.

```bash
npm install
cp .env.example .env        # Windows: copy .env.example .env
npm run db:push             # creates prisma/dev.db
npm run db:seed             # optional: a "demo" user with 12 weeks of history (sample users never appear in rankings)
npm run dev
```

Open <http://localhost:3000>.

* Type any real LeetCode username to try live data. `/u/demo` shows a fake profile that works fully offline.
* Only real profiles are ranked: demo and mock users are left out of the leaderboard and the top-solvers list.
* No internet, or LeetCode blocking you? Set `USE_MOCK_LEETCODE=1` in `.env` and every username gets fake data.
* For the "Beat this" hints, add a Claude API key as `ANTHROPIC_API_KEY` in `.env`. Everything else works without it.

## The pages

| Page | URL | What it shows |
|---|---|---|
| **Universe** | `/u/<username>` | Galaxy ranking (week / all time), the solar system, your stats, and "Today's 3" |
| **Ladder** | `/u/<username>/ladder` | The CP-31-style ladder: 18 levels x 31 problems, checklist, level progress, "start here" |
| **Progress** | `/u/<username>/progress` | Trajectory graph with a projection, solves per week, difficulty split, topic movers |
| **Submissions** | `/u/<username>/submissions` | Saved submissions with language, runtime and memory, and hints for beating each one (see below) |

The top bar switches between them. The landing page (`/`) has the username form and a top-solvers list.

## Submissions and "Beat this" hints

Every sync also saves the user's public recent submissions (`recentSubmissionList`): problem, language, runtime and memory, but never code, which LeetCode keeps private. LeetCode only lists the newest 20 (and, for other people, appears to list accepted ones only), so LeetLens keeps every submission it has seen in the `Submission` table and the history grows from the first visit on. Someone who submits more than 20 times between two syncs loses the ones in between, which is one more reason to run the daily sync.

**Beat this** on a submission sends the problem and the submission's language, runtime and memory (never code) to Claude (`claude-opus-5-5`, via `src/lib/hints.ts`). Claude uses **web search** (at most 5 searches) to find faster solutions to that problem, preferring LeetCode posts, GitHub and tutorials that report a runtime, and returns:

* where the realistic gain is (runtime, memory, both, or already near optimal) and why. A 0 ms runtime can't be beaten, so the hints then target memory
* the best known time and space complexity, and the fastest runtime a source actually reported
* **5-6 hint points** leading to the faster solution without giving the code
* the sources it used, collapsed because they contain full solutions

Claude hands its findings back through a strict `submit_hints` tool rather than structured output, because structured output can't be combined with the citations that web search adds. Each submission's hints are generated once and cached in `Submission.hintsJson`; new hint sets are limited to 20 per hour per IP. Each one is a paid Claude call plus the web searches.

## The Ladder (CP-31 for LeetCode)

[CP-31](https://tle-eliminators.com/cp-sheet) gives Codeforces users 31 hand-picked problems per rating level, so you always know exactly what to solve next and when to move up. The Ladder does the same for LeetCode.

* **Level 0, Foundations:** 31 classic problems (Two Sum, Valid Parentheses, Binary Search, ...) from `src/lib/curated.ts`. Start here if you are new.
* **Levels 1 to 17, rated 1100 to 2700+:** each level is a 100-point rating band with **31 problems**, sorted easiest to hardest and spread evenly across contest history, so a level is not 31 problems from one month. LeetCode does not publish difficulty ratings, so these come from the community dataset [zerotrac/leetcode_problem_rating](https://github.com/zerotrac/leetcode_problem_rating) (MIT, (c) 2021 Shuxin Chen), which estimates Elo-style ratings from Weekly and Biweekly Contest results.
* **A level is complete at 80 % (25 of 31).** Your *current level* is the first incomplete one at or after your start level, and the ladder shows it with a highlight.
* **Where do I start?** "Start my ladder here" saves a start level. Until you pick one, LeetLens suggests it from your Easy/Medium/Hard counts (`suggestStartLevel` in `src/lib/ladder.ts`).
* **Ticks:** problems in your last ~20 accepted submissions are ticked **automatically** on every sync. Everything else you tick by hand (older solves cannot be read without logging in, see the limits below). Ticks are stored in `ProblemMark`.
* **Today's 3** on the Universe page is separate from the ladder: Easy and Medium from your strongest topics, then one from a new topic (see below).
* **Regenerate the data** with `npm run ladder:build`. It re-downloads the ratings and rewrites `data/ladder.json`. The generated file is committed so the app works without network access at build time.

**Ladder limits**

1. Ratings exist **only for contest problems** (about 2,600 of LeetCode's 3,000+). Non-contest problems only appear in Foundations.
2. Ratings are **community estimates**, not official, and the dataset is only as fresh as its last update.
3. Without a login, LeetLens can only auto-tick the last ~20 accepted problems, so you tick older solves yourself.
4. There is no sign-in yet, so anyone who knows a username can tick problems for it. Add the ownership check under "Ideas for next steps" before going public.

## How data is fetched from LeetCode

LeetCode has **no official public API**. `src/lib/leetcode.ts` calls the same GraphQL endpoint the website uses (`https://leetcode.com/graphql`), from the server only.

| Data | GraphQL field | Used for |
|---|---|---|
| Solved by difficulty | `matchedUser.submitStatsGlobal` | totals, difficulty split |
| Solved per topic | `matchedUser.tagProblemCounts` | planets, weak-topic detection |
| Activity + streak | `matchedUser.userCalendar` | streak, estimating early history |
| Last ~20 accepted problems | `recentAcSubmissionList` | excluded from recommendations |
| Problems by topic + difficulty | `questionList` (filters) | recommendation pool |

Every response is validated with **Zod**. If LeetCode changes a field, you get a clear `SCHEMA` error instead of silently wrong numbers. Requests have a timeout, retry with backoff, and problem lists are cached for 24 h.

**Honest limits**

1. **No full "solved" list without logging in.** Public data gives per-topic *counts* and only the last ~20 accepted submissions. So a suggestion may be something you already solved: use **"I already solved this"** (or tick it on the Ladder) and LeetLens remembers it. (An opt-in session-cookie mode is possible, but risky for users and possibly against LeetCode's terms, so it is not built.)
2. **No history endpoint.** The progress graph is built from **daily snapshots we store** after someone first visits. Before that, earlier weeks are *estimated* from the yearly activity calendar and drawn dashed. Run the daily sync so snapshots accumulate (see below).
3. **Unofficial API.** It can change or rate-limit at any time, and scraping may go against LeetCode's ToS. Keep the caching and delays in place. If LeetCode returns HTTP 403 to your server (some hosts get blocked), the UI says so and shows the last saved data.

## How the analysis works

* **Mastery** per topic = `solved / goal`, capped at 1. Goals live in `src/lib/topics.ts` (e.g. arrays 80, graphs 30). Edit them freely.
* **Orbits:** mastery ≥ 60 % → inner ring, ≥ 25 % → middle, otherwise outer. Planet size grows with solved count. The weakest topic is dashed.
* **Today's 3** (`DAILY_SLOTS` and `pickDaily` in `src/lib/recommend.ts`, `getDailySet` in `src/lib/sync.ts`), in order:
  1. **Easy** from your strongest topic (most problems solved)
  2. **Medium** from your next strongest topic
  3. **Easy** (Medium if no Easy is left) from the topic you've touched least, so something new

  The three come from different topics where possible. If a strong topic has nothing left at that difficulty, the next strong topic is tried. Within a topic, the **curated classics come first** (`src/lib/curated.ts`), then live LeetCode problems with the highest acceptance rate; paid, solved and ticked problems are skipped. If LeetCode can't be reached, only the curated list is used.
  * A set lasts until **midnight** in `DAILY_TIMEZONE` (an IANA name such as `Asia/Kolkata`; default: the server's timezone, so set it when you deploy, since hosts usually run on UTC). The countdown ticks in the browser and loads the new set at midnight. Problems solved today turn green (the page checks LeetCode when it opens); nothing is swapped in for them.
  * LeetCode only shows the last ~20 solves, so a strong-topic pick may be one you solved long ago. **"Solved it before? Swap it"** ticks it (so it never comes back) and puts a fresh problem for the same slot in its place (`swapDailyProblem`, `POST /api/daily/swap`).
  * The first visit after midnight makes a new set, which skips anything suggested in the last 14 days (unless nothing else is left). Sets are stored in the `DailyPick` table.
* **Leaderboard** (`src/lib/leaderboard.ts`): all-time = total solved; week = gain over the last 7 days of snapshots.
* **Trajectory** (`src/lib/history.ts`): 12 weekly points, pace = average of the last 4 weeks, projected 3 weeks ahead.

## Project layout

```
prisma/schema.prisma      User (+ ladderStart), Snapshot (one per user per day), ProblemMark (ticks), Submission (runtime/memory + cached hints), DailyPick (daily sets)
prisma/seed.ts            sample users + demo history + demo ladder ticks
data/ladder.json          generated ladder: 18 levels x 31 problems (from zerotrac ratings)
scripts/build-ladder.ts   regenerates data/ladder.json  (npm run ladder:build)
src/lib/leetcode.ts       GraphQL client + Zod schemas + typed errors
src/lib/sync.ts           fetch -> store -> load dashboard, ticks, ladder state, missions
src/lib/ladderBuild.ts    pure ladder builder (bands, even spread across contests)
src/lib/ladder.ts         loads ladder.json, level progress, current level, start-level suggestion
src/lib/analysis.ts       topic mastery / weakest topics
src/lib/recommend.ts      daily set picker (strong-topic Easy + Medium, one new topic)
src/lib/day.ts            midnight in DAILY_TIMEZONE (when Today's 3 resets)
src/lib/hints.ts          beat-this hints: Claude + web search (prompt, submit_hints tool, error handling)
src/lib/history.ts        series, weekly gains, projection
src/lib/leaderboard.ts    ranking
src/lib/mock.ts           offline fake data ("demo" user)
src/app/                  pages + API routes (sync, mark, start, leaderboard, hints, daily/swap, cron/sync)
src/components/           SolarSystem, Leaderboard, TrajectoryChart, ProblemChecklist, DailyProblems, SubmissionList, ...
```

## Scheduled daily sync

`GET /api/cron/sync` refreshes every stored user (one at a time, with a pause) so the graph gets a data point each day even when nobody visits.

1. Set `CRON_SECRET` in your environment.
2. On Vercel, `vercel.json` already schedules it daily (Vercel sends the secret automatically). Elsewhere, call it from any cron: `curl -H "Authorization: Bearer $CRON_SECRET" https://your-site/api/cron/sync`.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | dev server |
| `npm run build` / `npm start` | production build / server |
| `npm run db:push` | create/update the database from `schema.prisma` |
| `npm run db:seed` | load sample data |
| `npm run db:studio` | browse the database |
| `npm run ladder:build` | re-download ratings and regenerate `data/ladder.json` |
| `npm test` | unit tests (analysis, recommendations, ladder, history, leaderboard, LeetCode client) |
| `npm run typecheck` | TypeScript check |

## Deploying

SQLite is a local file, so it does **not** persist on serverless hosts such as Vercel. For production, switch to PostgreSQL:

1. In `prisma/schema.prisma` set `provider = "postgresql"` (and you may change the `...Json` String columns to `Json`).
2. `npm i @prisma/adapter-pg pg`
3. In `src/lib/db.ts` replace the adapter:
   ```ts
   import { PrismaPg } from "@prisma/adapter-pg";
   export const db = globalForPrisma.prisma ?? new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
   ```
4. Set `DATABASE_URL="postgresql://..."` and run `npm run db:push`.

(The Prisma client is generated with `engineType = "client"`, the Rust-free engine, which is why a driver adapter is used in both setups.)

## Ideas for next steps

* **Sign-in + ownership check:** verify a username by asking the user to paste a short code into their LeetCode "About" text, so nobody can add someone else to the leaderboard or tick their ladder.
* Prerequisite ordering inside a level, and topic tags on ladder problems so you can filter a level by topic.
* Groups / friends leaderboards, private profiles, opt-out of the public ranking.
* Redis + BullMQ for queued syncs and shared caching once you run several servers.
* An LLM explanation for *why* each problem is suggested, and a weekly study plan.
* Move ranking into SQL (`RANK() OVER`) when the user count grows.

## Privacy note

Entering a username stores that public username and its stats in your database and shows it on the leaderboard. Before running this publicly, add the ownership check above and an opt-out. The ladder data is derived from the MIT-licensed zerotrac/leetcode_problem_rating dataset; keep its attribution (the Ladder page already shows it).

## Troubleshooting

* **`better-sqlite3` fails to install:** it needs a prebuilt binary or a C++ toolchain. Use Node 20/22 LTS; on Linux install `build-essential python3`.
* **"Couldn't reach LeetCode":** check your internet, or that your host isn't blocked. Use `USE_MOCK_LEETCODE=1` to develop offline.
* **Empty leaderboard:** run `npm run db:seed`, or visit a few usernames first.
* **Ladder shows fewer than 31 problems / looks stale:** run `npm run ladder:build` (needs internet) and restart.
* **`no such table: ProblemMark` after updating:** run `npm run db:push` to add the new tables and column.
