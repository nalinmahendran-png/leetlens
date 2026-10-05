import Link from "next/link";
import UsernameForm from "./UsernameForm";

export default function ErrorPanel({ title, message, username }: { title: string; message: string; username?: string }) {
  return (
    <main className="shell">
      <div className="card error-panel">
        <h1>{title}</h1>
        <p className="muted">{message}</p>
        <UsernameForm defaultValue={username} compact />
        <p className="muted">
          <Link href="/">Back to start</Link>
        </p>
      </div>
    </main>
  );
}
