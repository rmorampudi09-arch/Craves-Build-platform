import { readFile } from "node:fs/promises";
import { join } from "node:path";

// maplibre-gl 6 ships its web worker as a separate module that bundlers do not emit.
// Read it once at build time and serve it same-origin for AddressMapPicker's setWorkerUrl().
export const dynamic = "force-static";

export async function GET() {
  const source = await readFile(
    join(process.cwd(), "node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs"),
    "utf8",
  );
  return new Response(source, {
    headers: {
      "Content-Type": "text/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
