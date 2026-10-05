import Anthropic from "@anthropic-ai/sdk";
import * as z from "zod/v4";
import type { QuestionDetail } from "./types";

/**
 * "Beat this" hints for one of the user's submissions. We know its language, runtime and memory
 * from LeetCode's public data (never the code). Claude searches the web for faster solutions to the
 * same problem and turns what it finds into 5-6 hints. Needs ANTHROPIC_API_KEY on the server.
 */
const MODEL = "claude-opus-5-5";
/** Each search is billed, so cap them per request. */
const MAX_SEARCHES = 5;
/** Server-side tool loops can pause (stop_reason "pause_turn"); resume at most this many times. */
const MAX_CONTINUATIONS = 4;

export const HintsSchema = z.object({
  focus: z.enum(["runtime", "memory", "both", "already_optimal"]),
  focusReason: z.string(),
  best: z.object({ time: z.string(), space: z.string() }),
  /** best runtime a source reported for this problem, e.g. "0 ms in C++ (beats 100%)"; null if none did */
  fastestReported: z.string().nullable(),
  hints: z.array(z.string()).min(1),
  sources: z.array(z.object({ title: z.string(), url: z.string() })),
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

const SYSTEM_PROMPT = `You help someone beat their own accepted LeetCode solution. You get the problem and their submission as LeetCode reported it: language, runtime and memory. You can't see their code; LeetCode keeps it private.

First, use web search to find solutions to this exact problem that run faster than theirs, ideally in their language: LeetCode solution posts and discussions, GitHub repositories, and well-known tutorial sites. Prefer sources that report a runtime or a "beats X%" figure, and approaches with a better time or space complexity than the straightforward solution. A few searches are enough.

Then call submit_hints exactly once:
- focus: where the realistic gain is. A runtime of 0 ms can't be beaten, so then focus on memory. If their numbers already match the best you found, use "already_optimal" and point them to an alternative approach worth learning.
- focusReason: one or two sentences comparing their numbers with what you found. You don't know what their code does, so say "likely" or "usually" rather than stating it as fact.
- best: time and space complexity of the best approach you found.
- fastestReported: the best runtime a source actually reported for this problem, with the language, or null if none did. Never invent a number.
- hints: 5 or 6 short points that lead them to the faster solution without handing it over. Start with what to notice about the problem, then the technique or data structure and why it is faster, then the implementation details that matter for runtime and memory in their language. One or two sentences each, and no full code.
- sources: the 2-5 pages you relied on, with title and URL. Leave it empty if web search failed, and then base the hints on what you know.

Write plain text. Wrap identifiers and short expressions in backticks.`;

const SUBMIT_TOOL: Anthropic.Beta.BetaTool = {
  name: "submit_hints",
  description: "Submit the finished hints for beating the user's submission. Call once, after researching.",
  strict: true,
  input_schema: {
    type: "object",
    properties: {
      focus: { type: "string", enum: ["runtime", "memory", "both", "already_optimal"] },
      focusReason: { type: "string" },
      best: {
        type: "object",
        properties: { time: { type: "string" }, space: { type: "string" } },
        required: ["time", "space"],
        additionalProperties: false,
      },
      fastestReported: { type: ["string", "null"] },
      hints: { type: "array", items: { type: "string" } },
      sources: {
        type: "array",
        items: {
          type: "object",
          properties: { title: { type: "string" }, url: { type: "string" } },
          required: ["title", "url"],
          additionalProperties: false,
        },
      },
    },
    required: ["focus", "focusReason", "best", "fastestReported", "hints", "sources"],
    additionalProperties: false,
  },
};

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

export async function hintsToBeat(input: HintsInput): Promise<Hints> {
  const client = new Anthropic();
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: buildHintsPrompt(input) }];
  let nudged = false;

  try {
    for (let turn = 0; turn <= MAX_CONTINUATIONS; turn++) {
      const response = await client.beta.messages.create({
        model: MODEL,
        max_tokens: 16000,
        thinking: { type: "adaptive" },
        output_config: { effort: "high" },
        // if a safety classifier declines, retry server-side on Anthropic's recommended fallback model
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        system: SYSTEM_PROMPT,
        tools: [{ type: "web_search_20260209", name: "web_search", max_uses: MAX_SEARCHES }, SUBMIT_TOOL],
        messages,
      });

      if (response.stop_reason === "refusal") {
        throw new HintsError("REFUSED", "Claude declined this request. Please try again.");
      }
      const submitted = response.content.find((b) => b.type === "tool_use" && b.name === "submit_hints");
      if (submitted && submitted.type === "tool_use") {
        const parsed = HintsSchema.safeParse(submitted.input);
        if (!parsed.success) throw new HintsError("UPSTREAM", "The hints came back in an unexpected shape. Please try again.");
        return tidyHints(parsed.data);
      }
      if (response.stop_reason === "max_tokens") {
        throw new HintsError("UPSTREAM", "The hints came back incomplete. Please try again.");
      }

      // Keep the assistant turn unchanged (thinking and search blocks included) and continue.
      messages.push({ role: "assistant", content: response.content });
      if (response.stop_reason === "pause_turn") continue; // the server resumes a paused search loop on its own
      if (nudged) break;
      nudged = true; // finished without submitting: ask once more
      messages.push({ role: "user", content: "Please call submit_hints with your findings now." });
    }
    throw new HintsError("UPSTREAM", "Claude didn't finish the hints. Please try again.");
  } catch (err) {
    if (err instanceof HintsError) throw err;
    if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
      throw new HintsError("NOT_CONFIGURED", "The Claude API key is invalid. Check ANTHROPIC_API_KEY in .env.");
    }
    if (err instanceof Anthropic.RateLimitError) {
      throw new HintsError("RATE_LIMITED", "Claude is busy right now. Try again in a minute.");
    }
    if (err instanceof Anthropic.APIConnectionError) {
      throw new HintsError("UPSTREAM", "Couldn't reach Claude. Check your internet connection.");
    }
    if (err instanceof Anthropic.APIError) {
      throw new HintsError("UPSTREAM", `Claude returned an error (HTTP ${err.status ?? "?"}). Please try again.`);
    }
    // The SDK throws a plain Error before sending anything when no credentials are configured.
    if (err instanceof Error && /authentication/i.test(err.message)) {
      throw new HintsError("NOT_CONFIGURED", "Hints aren't set up yet: add ANTHROPIC_API_KEY to .env and restart the server.");
    }
    throw err;
  }
}
