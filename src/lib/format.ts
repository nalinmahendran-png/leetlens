export const fmt = (n: number) => n.toLocaleString("en-US");

export const initial = (name: string) => (name.trim()[0] ?? "?").toUpperCase();

const TINTS = ["#ffc857", "#7fd6ff", "#a8f0c4", "#c9b8ff", "#ffb0c8", "#ffd6a8", "#8ff0e0", "#c9d0f5"];
export function tintFor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return TINTS[h % TINTS.length];
}

const LANG_NAMES: Record<string, string> = {
  cpp: "C++", c: "C", java: "Java", python: "Python 2", python3: "Python", pythondata: "Pandas", javascript: "JavaScript",
  typescript: "TypeScript", golang: "Go", csharp: "C#", kotlin: "Kotlin", swift: "Swift", rust: "Rust", ruby: "Ruby",
  scala: "Scala", php: "PHP", dart: "Dart", elixir: "Elixir", erlang: "Erlang", racket: "Racket", mysql: "MySQL",
  mssql: "MS SQL Server", oraclesql: "Oracle SQL", postgresql: "PostgreSQL", bash: "Bash",
};

/** Display name for a LeetCode language code ("python3" -> "Python"); unknown codes pass through. */
export const langName = (code: string) => LANG_NAMES[code] ?? code;

/** Time left until `when`, e.g. "7h 12m", "5h" or "45m" (never less than "1m"). */
export function timeUntil(when: Date, now = new Date()): string {
  const mins = Math.max(1, Math.ceil((when.getTime() - now.getTime()) / 60_000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}
