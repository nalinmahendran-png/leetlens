import { LeetCodeError } from "./leetcode";
import { getDashboard, USERNAME_PATTERN, type Dashboard } from "./sync";

export type LoadResult =
  | { ok: true; data: Dashboard }
  | { ok: false; title: string; message: string };

/** Load a dashboard for a page, turning every failure into a friendly message. */
export async function loadDashboard(rawUsername: string): Promise<LoadResult> {
  const username = decodeURIComponent(rawUsername);
  if (!USERNAME_PATTERN.test(username)) {
    return { ok: false, title: "That doesn't look like a username", message: "LeetCode usernames use letters, numbers, dots, dashes and underscores." };
  }
  try {
    return { ok: true, data: await getDashboard(username) };
  } catch (err) {
    if (err instanceof LeetCodeError) {
      if (err.code === "NOT_FOUND") {
        return { ok: false, title: `No LeetCode profile named "${username}"`, message: "Check the spelling. The profile must exist and be public." };
      }
      if (err.code === "RATE_LIMITED") {
        return { ok: false, title: "LeetCode asked us to slow down", message: "Please try again in a minute." };
      }
      return { ok: false, title: "Couldn't reach LeetCode", message: err.message };
    }
    console.error("dashboard load failed", err);
    return { ok: false, title: "Something went wrong", message: "Please try again in a moment." };
  }
}
