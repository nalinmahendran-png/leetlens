"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export default function StartHereButton({ username, level, label }: { username: string; level: number; label: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  async function start() {
    setBusy(true);
    await fetch("/api/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, level }),
    }).catch(() => undefined);
    setBusy(false);
    startTransition(() => router.refresh());
  }

  return (
    <button type="button" className="pill pill--small" onClick={start} disabled={busy}>
      {busy ? "Saving…" : label}
    </button>
  );
}
