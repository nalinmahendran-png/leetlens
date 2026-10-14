"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

/**
 * Solved something on LeetCode since the last sync? Once per page visit, ask the server to re-sync the
 * user (it skips if it synced in the last 5 minutes), then reload the page data so new solves show up
 * without pressing Refresh. True while that check is running.
 */
export function useSyncOnOpen(username: string, skip = false): boolean {
  const router = useRouter();
  const [checking, setChecking] = useState(false);
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (skip) return;
    let cancelled = false;
    setChecking(true);
    fetch("/api/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username }) })
      .then((res) => {
        if (res.ok && !cancelled) startTransition(() => router.refresh());
      })
      .catch(() => undefined)
      .finally(() => !cancelled && setChecking(false));
    return () => {
      cancelled = true;
    };
  }, [username]); // once per page visit, not again after each refresh

  return checking;
}
