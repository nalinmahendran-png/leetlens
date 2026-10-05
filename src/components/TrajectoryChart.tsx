import type { SeriesPoint } from "@/lib/history";
import { fmt } from "@/lib/format";

const W = 808, H = 292, X0 = 44, X1 = 796, Y_TOP = 14, Y_BASE = 260;
const STEPS = [10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000];

function scaleFor(maxValue: number) {
  const raw = (maxValue * 1.05) / 6;
  const step = STEPS.find((s) => s >= raw) ?? Math.ceil(raw / 1000) * 1000;
  const yMax = Math.max(step, Math.ceil((maxValue * 1.05) / step) * step);
  return { step, yMax };
}

/** Server-rendered SVG line chart: real (solid), estimated (dashed) and projected (dotted) totals. */
export default function TrajectoryChart({ points, projection }: { points: SeriesPoint[]; projection: number[] }) {
  if (points.length < 2) {
    return (
      <div className="chart-empty">
        We only have one data point so far. Come back tomorrow, and the line will start to draw itself.
      </div>
    );
  }

  const n = points.length + projection.length;
  const maxValue = Math.max(...points.map((p) => p.total), ...projection);
  const { step, yMax } = scaleFor(maxValue);
  const x = (i: number) => X0 + ((X1 - X0) * i) / (n - 1);
  const y = (v: number) => Y_BASE - (v / yMax) * (Y_BASE - Y_TOP);
  const pt = (i: number, v: number) => `${x(i).toFixed(1)} ${y(v).toFixed(1)}`;

  const firstReal = Math.max(0, points.findIndex((p) => !p.estimated));
  const last = points.length - 1;
  const line = (from: number, to: number) => points.slice(from, to + 1).map((p, k) => `${k === 0 ? "M" : "L"}${pt(from + k, p.total)}`).join(" ");

  const realPath = line(firstReal, last);
  const estPath = firstReal > 0 ? line(0, firstReal) : null;
  const areaPath = `${line(0, last)} L${x(last).toFixed(1)} ${Y_BASE} L${x(0).toFixed(1)} ${Y_BASE} Z`;
  const projPath = projection.length ? [`M${pt(last, points[last].total)}`, ...projection.map((v, k) => `L${pt(last + 1 + k, v)}`)].join(" ") : null;

  const grid: number[] = [];
  for (let v = step; v <= yMax; v += step) grid.push(v);

  const labelIdx = Array.from(new Set([0, Math.round(last / 2), last, n - 1])).filter((i) => i < n);
  const projEnd = projection.length ? projection[projection.length - 1] : null;
  const calloutX = Math.max(X0, x(last) - 160);

  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Total solved over ${points.length} weeks, from ${points[0].total} to ${points[last].total}${projEnd ? `, projected to about ${projEnd}` : ""}`}>
      {grid.map((v) => (
        <g key={v}>
          <line x1={X0} x2={X1} y1={y(v)} y2={y(v)} stroke="#262b55" strokeDasharray="3 5" />
          <text x={0} y={y(v) + 4} fill="#a2a9d6" fontSize="11">{fmt(v)}</text>
        </g>
      ))}
      <line x1={X0} x2={X1} y1={Y_BASE} y2={Y_BASE} stroke="#3a4180" />

      <path d={areaPath} fill="#7fd6ff" fillOpacity="0.12" />
      {estPath && <path d={estPath} fill="none" stroke="#7fd6ff" strokeOpacity="0.55" strokeWidth="3" strokeDasharray="6 6" strokeLinecap="round" />}
      <path d={realPath} fill="none" stroke="#7fd6ff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
      {projPath && <path d={projPath} fill="none" stroke="#ffc857" strokeWidth="3" strokeDasharray="1 7" strokeLinecap="round" />}

      <circle cx={x(last)} cy={y(points[last].total)} r="12" fill="#7fd6ff" fillOpacity="0.25" />
      <circle cx={x(last)} cy={y(points[last].total)} r="5.5" fill="#fff" />
      {projEnd !== null && <circle cx={x(n - 1)} cy={y(projEnd)} r="5" fill="#05060f" stroke="#ffc857" strokeWidth="2.5" />}

      <rect x={calloutX} y={4} width={150} height={28} rx={8} fill="#232a66" stroke="#4a52a8" />
      <text x={calloutX + 75} y={22.5} fill="#fff" fontSize="12" fontWeight="700" textAnchor="middle">
        {fmt(points[last].total)} solved · Wk {points.length}
      </text>
      {projEnd !== null && (
        <text x={X1} y={y(projEnd) > 48 ? y(projEnd) - 12 : y(projEnd) + 24} fill="#ffc857" fontSize="11" fontWeight="700" textAnchor="end">
          ~{fmt(projEnd)} by Wk {n}
        </text>
      )}

      {labelIdx.map((i) => {
        const isLast = i === last;
        const isProj = i === n - 1 && projection.length > 0;
        return (
          <text key={i} x={x(i)} y={284} fontSize="11" fontWeight={isLast ? 700 : 400} fill={isLast ? "#fff" : isProj ? "#ffc857" : "#a2a9d6"} textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"}>
            Wk {i + 1}
          </text>
        );
      })}
    </svg>
  );
}
