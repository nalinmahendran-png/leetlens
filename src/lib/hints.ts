import * as z from "zod/v4";
import type { QuestionDetail } from "./types";

/**
 * "Beat this" hints for one of the user's submissions. We know its language, runtime and memory
 * from LeetCode's public data (never the code). Gemini searches the web for faster solutions to the
 * same problem and turns what it finds into 5-6 hints (src/lib/gemini.ts). This file holds what the
 * rest of the app shares: the hints' shape, the instructions, and the errors.
 */
export const HintsSchema = z.object({
  focus: z.enum(["runtime", "memory", "both", "already_optimal"]),
  focusReason: z.string(),
  best: z.object({ time: z.string(), space: z.string() }),
  /** best runtime a source reported for this problem, e.g. "0 ms in C++ (beats 100%)"; null if none did */
  fastestReported: z.string().nullable(),
  hints: z.array(z.string()).min(1),
  sources: z.array(z.object({ title: z.string(), url: z.string() })),
  /** Google's Search Suggestions HTML, which must be shown with hints made using Google Search */
  searchSuggestions: z.string().nullable().optional(),
});

export type Hints = z.infer<typeof HintsSchema>;

export interface HintsInput {
  question: QuestionDetail;
  /** display name, e.g. "C++" */
  language: string;
  status: string;
  /** as LeetCode shows them, e.g. "4 ms", "10.6 MB" */
  runtime: string;
  memory: string;
}

export type HintsErrorCode = "NOT_CONFIGURED" | "RATE_LIMITED" | "REFUSED" | "UPSTREAM";

export class HintsError extends Error {
  constructor(public code: HintsErrorCode, message: string) {
    super(message);
    this.name = "HintsError";
  }
}

const RESEARCH = `You help someone beat their own accepted LeetCode solution. You get the problem and their submission as LeetCode reported it: language, runtime and memory. You can't see their code; LeetCode keeps it private.

First, use web search to find solutions to this exact problem that run faster than theirs, ideally in their language: LeetCode solution posts and discussions, GitHub repositories, and well-known tutorial sites. Prefer sources that report a runtime or a "beats X%" figure, and approaches with a better time or space complexity than the straightforward solution. A few searches are enough.`;

const FIELDS = `- focus: where the realistic gain is. A runtime of 0 ms can't be beaten, so then focus on memory. If their numbers already match the best you found, use "already_optimal" and point them to an alternative approach worth learning.
- focusReason: one or two sentences comparing their numbers with what you found. You don't know what their code does, so say "likely" or "usually" rather than stating it as fact.
- best: time and space complexity of the best approach you found.
- fastestReported: the best runtime a source actually reported for this problem, with the language, or null if none did. Never invent a number.
- hints: 5 or 6 short points that lead them to the faster solution without handing it over. Start with what to notice about the problem, then the technique or data structure and why it is faster, then the implementation details that matter for runtime and memory in their language. One or two sentences each, and no full code.`;

const STYLE = "Write plain text. Wrap identifiers and short expressions in backticks.";

/** Gemini can't be held to a schema while it uses Google Search, so it answers in JSON that we validate. */
export const SYSTEM_PROMPT = `${RESEARCH}

Then reply with only a JSON object, with no code fences and no other text, and these fields:
${FIELDS}

Types: focus is one of "runtime", "memory", "both", "already_optimal"; focusReason is a string; best is {"time": string, "space": string}; fastestReported is a string or null; hints is an array of strings. ${STYLE}`;

function problemBlock(q: QuestionDetail): string {
  const statement = q.statement ?? "(Premium problem: the statement isn't available. Infer the task from the title and tags.)";
  return [
    "<problem>",
    `Title: ${q.title} (${q.difficulty})`,
    `Topics: ${q.tags.join(", ") || "none listed"}`,
    `Link: https://leetcode.com/problems/${q.titleSlug}/`,
    "",
    statement,
    "</problem>",
  ].join("\n");
}

/** Pure: the user message for beat-this-submission hints. Exported for tests. */
export function buildHintsPrompt(input: HintsInput): string {
  return [
    problemBlock(input.question),
    "",
    `<their_submission language="${input.language}" status="${input.status}" runtime="${input.runtime}" memory="${input.memory}" />`,
  ].join("\n");
}

/** Pure: keep 5-6 hints and only http(s) sources. Exported for tests. */
export function tidyHints(h: Hints): Hints {
  return {
    ...h,
    hints: h.hints.map((s) => s.trim()).filter(Boolean).slice(0, 6),
    sources: h.sources.filter((s) => /^https?:\/\//i.test(s.url)).slice(0, 5),
  };
}
