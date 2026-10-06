import type { CSSProperties } from "react";

/**
 * The night-sky background behind every page: layers of twinkling stars, a few bright ones with a
 * glow, two occasional shooting stars and a faint nebula (the last two live in globals.css).
 * Positions come from a fixed seed, so the sky is identical on every render.
 */

/** Small deterministic PRNG (mulberry32). */
function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Star {
  x: number;
  y: number;
  r: number;
  opacity: number;
  color: string;
  /** twinkle group 0-2 */
  group: number;
}

const W = 1600;
const H = 1000;
const TINTS = ["#ffffff", "#ffffff", "#ffffff", "#d6e4ff", "#cfe0ff", "#ffe9c7"];

function makeStars(count: number, rMin: number, rMax: number, oMin: number, oMax: number, rand: () => number): Star[] {
  const round = (n: number) => Math.round(n * 10) / 10;
  return Array.from({ length: count }, () => ({
    x: round(rand() * W),
    y: round(rand() * H),
    r: round(rMin + rand() * (rMax - rMin)),
    opacity: round(oMin + rand() * (oMax - oMin)),
    color: TINTS[Math.floor(rand() * TINTS.length)],
    group: Math.floor(rand() * 3),
  }));
}

const rand = seeded(20261006);
const FAR = makeStars(260, 0.4, 0.9, 0.45, 0.85, rand);
const NEAR = makeStars(60, 0.9, 1.6, 0.65, 1, rand);
const BRIGHT = makeStars(9, 1.6, 2.2, 0.9, 1, rand);

const shooting = (top: string, left: string, duration: string, delay: string) =>
  ({ top, left, "--duration": duration, "--delay": delay }) as CSSProperties;

export default function Starfield() {
  return (
    <div className="starfield" aria-hidden="true">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice">
        <defs>
          <radialGradient id="star-glow">
            <stop offset="0" stopColor="#ffffff" stopOpacity="0.5" />
            <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
          </radialGradient>
        </defs>
        {[0, 1, 2].map((g) => (
          <g key={g} className={`twinkle twinkle-${g}`}>
            {[...FAR, ...NEAR]
              .filter((s) => s.group === g)
              .map((s, i) => (
                <circle key={i} cx={s.x} cy={s.y} r={s.r} fill={s.color} opacity={s.opacity} />
              ))}
          </g>
        ))}
        {BRIGHT.map((s, i) => (
          <g key={i} className="bright-star" style={{ animationDelay: `${(i * 1.7) % 6}s` }}>
            <circle cx={s.x} cy={s.y} r={s.r * 5} fill="url(#star-glow)" />
            {i % 3 === 0 && (
              <path
                d={`M${s.x - s.r * 4} ${s.y}H${s.x + s.r * 4}M${s.x} ${s.y - s.r * 4}V${s.y + s.r * 4}`}
                stroke={s.color}
                strokeWidth="0.5"
                strokeOpacity="0.6"
              />
            )}
            <circle cx={s.x} cy={s.y} r={s.r} fill={s.color} />
          </g>
        ))}
      </svg>
      <span className="shooting-star" style={shooting("8%", "10%", "13s", "3s")} />
      <span className="shooting-star" style={shooting("22%", "52%", "19s", "10s")} />
    </div>
  );
}
