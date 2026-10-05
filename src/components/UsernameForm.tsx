"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

const PATTERN = /^[A-Za-z0-9_.-]{1,40}$/;

export default function UsernameForm({ defaultValue = "", compact = false }: { defaultValue?: string; compact?: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState(defaultValue);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const name = value.trim();
    if (!PATTERN.test(name)) {
      setError("Use only letters, numbers, dots, dashes and underscores.");
      return;
    }
    setError(null);
    startTransition(() => router.push(`/u/${encodeURIComponent(name)}`));
  }

  return (
    <form onSubmit={submit} className="form" style={compact ? { margin: "20px auto 0" } : undefined}>
      <label className="sr-only" htmlFor="lc-username">
        LeetCode username
      </label>
      <input
        id="lc-username"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Your LeetCode username"
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        aria-invalid={error ? true : undefined}
      />
      <button className="btn" type="submit" disabled={pending}>
        {pending ? "Scanning…" : "Explore"}
      </button>
      {error && (
        <p className="form-error" role="alert" style={{ position: "absolute", marginTop: 56 }}>
          {error}
        </p>
      )}
    </form>
  );
}
