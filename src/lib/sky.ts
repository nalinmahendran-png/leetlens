/**
 * The night sky behind every page, drawn as a few SVG layers. src/app/sky/[layer]/route.ts serves
 * them as cacheable images and src/components/Starfield.tsx stacks and animates them, so pages only
 * carry a handful of <img> tags. Positions come from a fixed seed: the sky is the same everywhere.
 * Bump SKY_VERSION after changing anything here so browsers fetch the new images.
 */
export const SKY_VERSION = 1;
export const SKY_LAYERS = ["band", "far-0", "far-1", "far-2", "near"] as const;
export type SkyLayer = (typeof SKY_LAYERS)[number];

const W = 1600;
const H = 1000;
const TINTS = ["#ffffff", "#ffffff", "#ffffff", "#d6e4ff", "#cfe0ff", "#ffe9c7"];

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

const rand = seeded(20261006);
const round = (n: number, digits = 1) => Math.round(n * 10 ** digits) / 10 ** digits;
const between = (a: number, b: number) => a + rand() * (b - a);

function star(x: number, y: number, r: [number, number], opacity: [number, number]): Star {
  return {
    x: round(x),
    y: round(y),
    r: round(between(...r)),
    opacity: round(between(...opacity), 2),
    color: TINTS[Math.floor(rand() * TINTS.length)],
    group: Math.floor(rand() * 3),
  };
}

const scatter = (count: number, r: [number, number], opacity: [number, number]) =>
  Array.from({ length: count }, () => star(rand() * W, rand() * H, r, opacity));

/** The Milky Way: a band through the middle of the sky, tilted by BAND_ANGLE degrees. */
const BAND_ANGLE = -22;
function bandStars(count: number): Star[] {
  const rad = (BAND_ANGLE * Math.PI) / 180;
  const along = [Math.cos(rad), Math.sin(rad)];
  const across = [-along[1], along[0]];
  const stars: Star[] = [];
  while (stars.length < count) {
    const t = (rand() * 2 - 1) * 950;
    // Box-Muller: most stars hug the centre line of the band
    const offset = Math.sqrt(-2 * Math.log(rand() || 1e-9)) * Math.cos(2 * Math.PI * rand()) * 55;
    const x = W / 2 + along[0] * t + across[0] * offset;
    const y = H / 2 + along[1] * t + across[1] * offset;
    if (x >= 0 && x <= W && y >= 0 && y <= H) stars.push(star(x, y, [0.3, 0.7], [0.3, 0.7]));
  }
  return stars;
}

const FAR = scatter(220, [0.4, 0.9], [0.45, 0.85]);
const BAND = bandStars(200);
const NEAR = scatter(55, [0.9, 1.6], [0.65, 1]);
const BRIGHT = scatter(9, [1.6, 2.2], [0.9, 1]);

/** Two faint constellations: a Big Dipper (top right) and Cassiopeia's "W" (bottom left). */
const CONSTELLATIONS: { points: [number, number][]; edges: [number, number][] }[] = [
  {
    points: [[1150, 110], [1215, 135], [1275, 150], [1330, 175], [1345, 245], [1430, 255], [1440, 185]],
    edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 3]],
  },
  {
    points: [[110, 760], [170, 822], [232, 776], [292, 838], [352, 792]],
    edges: [[0, 1], [1, 2], [2, 3], [3, 4]],
  },
];

const dot = (s: Star) => `<circle cx="${s.x}" cy="${s.y}" r="${s.r}" fill="${s.color}" opacity="${s.opacity}"/>`;

function brightStar(s: Star, i: number): string {
  const arm = s.r * 4;
  const sparkle =
    i % 3 === 0
      ? `<path d="M${round(s.x - arm)} ${s.y}H${round(s.x + arm)}M${s.x} ${round(s.y - arm)}V${round(s.y + arm)}" stroke="${s.color}" stroke-width="0.5" stroke-opacity="0.6"/>`
      : "";
  return `<circle cx="${s.x}" cy="${s.y}" r="${round(s.r * 5)}" fill="url(#glow)"/>${sparkle}<circle cx="${s.x}" cy="${s.y}" r="${s.r}" fill="${s.color}"/>`;
}

function constellations(): string {
  return CONSTELLATIONS.map(({ points, edges }) => {
    const lines = edges
      .map(([a, b]) => `<line x1="${points[a][0]}" y1="${points[a][1]}" x2="${points[b][0]}" y2="${points[b][1]}"/>`)
      .join("");
    const nodes = points
      .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="5" fill="url(#glow)"/><circle cx="${x}" cy="${y}" r="1.4" fill="#ffffff"/>`)
      .join("");
    return `<g stroke="#b9c4ff" stroke-opacity="0.22" stroke-width="0.9">${lines}</g>${nodes}`;
  }).join("");
}

const GLOW = `<radialGradient id="glow"><stop offset="0" stop-color="#ffffff" stop-opacity="0.5"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient>`;

function svg(body: string, defs = ""): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice">${defs ? `<defs>${defs}</defs>` : ""}${body}</svg>`;
}

/** One layer of the sky as an SVG document. */
export function skySvg(layer: SkyLayer): string {
  switch (layer) {
    case "band": {
      const defs =
        `<radialGradient id="haze"><stop offset="0" stop-color="#b8c2ff" stop-opacity="0.11"/><stop offset="0.5" stop-color="#9a8cff" stop-opacity="0.05"/><stop offset="1" stop-color="#9a8cff" stop-opacity="0"/></radialGradient>` +
        `<radialGradient id="core"><stop offset="0" stop-color="#e6e9ff" stop-opacity="0.08"/><stop offset="1" stop-color="#e6e9ff" stop-opacity="0"/></radialGradient>`;
      return svg(
        `<g transform="rotate(${BAND_ANGLE} ${W / 2} ${H / 2})"><ellipse cx="${W / 2}" cy="${H / 2}" rx="1050" ry="170" fill="url(#haze)"/><ellipse cx="${W / 2 + 120}" cy="${H / 2}" rx="700" ry="55" fill="url(#core)"/></g>`,
        defs,
      );
    }
    case "far-0":
    case "far-1":
    case "far-2": {
      const group = Number(layer.slice(-1));
      const dots = [...FAR, ...BAND].filter((s) => s.group === group).map(dot).join("");
      // the bright stars ride on the slowest twinkle layer, so they pulse gently
      return group === 2 ? svg(dots + BRIGHT.map(brightStar).join(""), GLOW) : svg(dots);
    }
    case "near":
      return svg(NEAR.map(dot).join("") + constellations(), GLOW);
  }
}
