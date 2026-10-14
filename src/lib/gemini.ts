import * as z from "zod/v4";
import { buildHintsPrompt, GEMINI_SYSTEM_PROMPT, HintsError, HintsSchema, tidyHints, type Hints, type HintsInput } from "./hints";

/**
 * "Beat this" hints from Gemini with Grounding with Google Search, on Google's free tier. Needs
 * GEMINI_API_KEY (free from aistudio.google.com); keep billing off for that Google project so it
 * stays free. Gemini 2.5 Flash is the model whose free tier includes Google Search (500 a day).
 */
const MODEL = "gemini-2.5-flash";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
const TIMEOUT_MS = 150_000;
/** Gemini can't be held to a schema while searching, so a reply may be malformed: ask once more. */
const MAX_ATTEMPTS = 2;

const ReplySchema = z.object({
  promptFeedback: z.object({ blockReason: z.string().optional() }).optional(),
  candidates: z
    .array(
      z.object({
        finishReason: z.string().optional(),
        content: z.object({ parts: z.array(z.object({ text: z.string().optional(), thought: z.boolean().optional() })).optional() }).optional(),
        groundingMetadata: z
          .object({
            searchEntryPoint: z.object({ renderedContent: z.string().optional() }).optional(),
            groundingChunks: z.array(z.object({ web: z.object({ uri: z.string(), title: z.string().optional() }).optional() })).optional(),
          })
          .optional(),
      }),
    )
    .optional(),
});

const AnswerSchema = HintsSchema.omit({ sources: true, searchSuggestions: true });

/** The first {...} in the text, parsed; null if there isn't a valid one. */
function jsonIn(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

/**
 * Pure: the hints in a Gemini reply: the answer is JSON in the text, the sources and Search Suggestions
 * come from the search metadata. Null when the answer is malformed (worth asking again); throws when
 * Gemini declined. Exported for tests.
 */
export function parseGeminiReply(raw: unknown): Hints | null {
  const reply = ReplySchema.safeParse(raw);
  if (!reply.success) return null;
  const { promptFeedback, candidates } = reply.data;
  const candidate = candidates?.[0];
  if (promptFeedback?.blockReason || ["SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST", "SPII"].includes(candidate?.finishReason ?? "")) {
    throw new HintsError("REFUSED", "Gemini declined this request. Please try again.");
  }

  const text = (candidate?.content?.parts ?? []).filter((p) => !p.thought).map((p) => p.text ?? "").join("");
  const answer = AnswerSchema.safeParse(jsonIn(text));
  if (!answer.success) return null;

  const meta = candidate?.groundingMetadata;
  const sources = (meta?.groundingChunks ?? []).flatMap((c) => (c.web ? [{ title: c.web.title ?? "", url: c.web.uri }] : []));
  return tidyHints({ ...answer.data, sources: uniqueUrls(sources), searchSuggestions: meta?.searchEntryPoint?.renderedContent ?? null });
}

const uniqueUrls = (sources: Hints["sources"]) => sources.filter((s, i) => sources.findIndex((o) => o.url === s.url) === i);

/** Search sources are Google redirect links; keep where they lead, since hints are stored for good. */
async function resolveLink(url: string): Promise<string> {
  try {
    const res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(5_000) });
    const to = res.headers.get("location");
    return to && /^https?:\/\//i.test(to) ? to : url;
  } catch {
    return url;
  }
}

async function ask(input: HintsInput, key: string): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: GEMINI_SYSTEM_PROMPT }] },
        contents: [{ role: "user", parts: [{ text: buildHintsPrompt(input) }] }],
        tools: [{ google_search: {} }],
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new HintsError("UPSTREAM", "Couldn't reach Gemini. Please try again.");
  }

  if (res.ok) return res.json().catch(() => null);
  const detail = await res.text().catch(() => "");
  if (res.status === 429) {
    throw new HintsError("RATE_LIMITED", "Gemini's free limit is used up for now. Try again in a minute, or tomorrow if it keeps happening.");
  }
  if (res.status === 401 || res.status === 403 || /API key not valid|API_KEY_INVALID/i.test(detail)) {
    throw new HintsError("NOT_CONFIGURED", "The Gemini API key is invalid. Check GEMINI_API_KEY.");
  }
  throw new HintsError("UPSTREAM", `Gemini returned an error (HTTP ${res.status}). Please try again.`);
}

export async function geminiHints(input: HintsInput): Promise<Hints> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new HintsError("NOT_CONFIGURED", "Hints aren't set up yet: add GEMINI_API_KEY and restart the server.");

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const hints = parseGeminiReply(await ask(input, key));
    if (hints) {
      const urls = await Promise.all(hints.sources.map((s) => resolveLink(s.url)));
      return { ...hints, sources: uniqueUrls(hints.sources.map((s, i) => ({ ...s, url: urls[i] }))) };
    }
  }
  throw new HintsError("UPSTREAM", "Gemini's answer came back in an unexpected shape. Please try again.");
}
