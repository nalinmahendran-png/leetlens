import { SKY_LAYERS, skySvg, type SkyLayer } from "@/lib/sky";

/** GET /sky/<layer>.svg -- one layer of the background sky, built once and cached by the browser. */
export const dynamic = "force-static";

export function generateStaticParams() {
  return SKY_LAYERS.map((layer) => ({ layer: `${layer}.svg` }));
}

export async function GET(_req: Request, { params }: { params: Promise<{ layer: string }> }) {
  const name = (await params).layer.replace(/\.svg$/, "");
  if (!(SKY_LAYERS as readonly string[]).includes(name)) return new Response("Not found", { status: 404 });
  return new Response(skySvg(name as SkyLayer), {
    headers: {
      "Content-Type": "image/svg+xml",
      // URLs carry ?v=SKY_VERSION, so a long cache is safe: a new version means a new URL
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
