export default function Loading() {
  return (
    <main className="shell" aria-busy="true">
      <header className="nav"><span className="logo">LEETLENS</span></header>
      <p className="muted" style={{ textAlign: "center", margin: "8px 0 24px" }}>Scanning your universe…</p>
      <div className="universe">
        <div className="skel" style={{ height: 520 }} />
        <div className="skel" style={{ height: 520, borderRadius: "50%" }} />
        <div className="skel" style={{ height: 420 }} />
      </div>
    </main>
  );
}
