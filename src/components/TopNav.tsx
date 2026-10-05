import Link from "next/link";
import RefreshButton from "./RefreshButton";
import { initial } from "@/lib/format";

type Section = "universe" | "ladder" | "progress" | "submissions";

export default function TopNav({ username, active }: { username: string; active: Section }) {
  const base = `/u/${encodeURIComponent(username)}`;
  const items: { id: Section; label: string; href: string }[] = [
    { id: "universe", label: "Universe", href: base },
    { id: "ladder", label: "Ladder", href: `${base}/ladder` },
    { id: "progress", label: "Progress", href: `${base}/progress` },
    { id: "submissions", label: "Submissions", href: `${base}/submissions` },  ];
  return (
    <header className="nav">
      <Link href="/" className="logo">
        LEETLENS
      </Link>
      <span className="nav-spacer" />
      <nav className="nav-links" aria-label="Sections">
        {items.map((it) => (
          <Link key={it.id} href={it.href} className={`pill ${active === it.id ? "pill--active" : ""}`} aria-current={active === it.id ? "page" : undefined}>
            {it.label}
          </Link>
        ))}
      </nav>
      <RefreshButton username={username} />
      <Link href={base} className="avatar" title={username} aria-label={`Home for ${username}`}>
        {initial(username)}
      </Link>
    </header>
  );
}
