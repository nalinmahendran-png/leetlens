import type { CSSProperties } from "react";
import { SKY_VERSION } from "@/lib/sky";

/**
 * The night-sky background behind every page. The stars are SVG images (see src/lib/sky.ts) so the
 * browser caches them; this component stacks them with drifting nebula clouds, a distant ringed
 * planet and a few shooting stars. All motion is in globals.css and stops for reduced-motion users.
 */
const layer = (name: string, className = "") => (
  // decorative, cached SVG layers: a plain <img> is the right tool here
  // eslint-disable-next-line @next/next/no-img-element
  <img className={`sky-img ${className}`} src={`/sky/${name}.svg?v=${SKY_VERSION}`} alt="" decoding="async" />
);

/** A streak flying at `angle` degrees (0 = right, 90 = down) over (dx, dy) pixels. */
const shooting = (top: string, left: string, angle: number, distance: number, duration: string, delay: string) => {
  const rad = (angle * Math.PI) / 180;
  return {
    top,
    left,
    "--angle": `${angle}deg`,
    "--dx": `${Math.round(Math.cos(rad) * distance)}px`,
    "--dy": `${Math.round(Math.sin(rad) * distance)}px`,
    "--duration": duration,
    "--delay": delay,
  } as CSSProperties;
};

export default function Starfield() {
  return (
    <div className="starfield" aria-hidden="true">
      <div className="nebula nebula-violet" />
      <div className="nebula nebula-blue" />
      <div className="nebula nebula-pink" />
      <div className="drift drift-far">
        {layer("band")}
        {layer("far-0", "twinkle twinkle-0")}
        {layer("far-1", "twinkle twinkle-1")}
        {layer("far-2", "twinkle twinkle-2")}
      </div>
      <div className="drift drift-near">{layer("near")}</div>
      <div className="far-planet">
        <span className="far-planet-ring far-planet-ring--back" />
        <span className="far-planet-body" />
        <span className="far-planet-ring far-planet-ring--front" />
      </div>
      <span className="shooting-star" style={shooting("8%", "10%", 25, 600, "13s", "3s")} />
      <span className="shooting-star" style={shooting("22%", "52%", 25, 600, "19s", "10s")} />
      <span className="shooting-star" style={shooting("6%", "78%", 155, 560, "23s", "7s")} />
      <span className="shooting-star" style={shooting("48%", "18%", 12, 640, "29s", "17s")} />
    </div>
  );
}
