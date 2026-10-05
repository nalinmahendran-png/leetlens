"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

/** Asks the server to re-fetch this user from LeetCode (max once per 5 minutes), then reloads the page data. */
export default function RefreshButton({ username }: { username: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function refresh() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username }),
      });
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!json.ok) setError(json.error ?? "Could not refresh.");
      else startTransition(() => router.refresh());
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button type="button" className="pill pill--small" onClick={refresh} disabled={busy} title={error ?? "Re-sync from LeetCode"}>
      {busy ? "Syncing…" : error ? "Retry sync" : "Refresh"}
    </button>
  );
}
