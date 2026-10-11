/** Same-origin proxy for the interactive Ola map: the Ola key never reaches the browser or the app. */
export const MAP_TILES_PATH = "/api/location/map-tiles";
export const MAP_STYLE_URL = `${MAP_TILES_PATH}/styles/default-light-standard/style.json`;

const OLA_VECTOR_URL = /https:\/\/api\.olamaps\.io\/tiles\/vector\/v1\/([^"\\\s]*)/g;
const SECTIONS = new Set(["styles", "data", "fonts", "glyphs", "sprites"]);
// Font stacks carry spaces and commas, e.g. "Noto Sans Regular,Arial Unicode MS Regular".
const SEGMENT = /^[A-Za-z0-9 _.,@+-]{1,128}$/;
const RESOURCE = /\.(json|pbf|mvt|png|webp)$/;
const CREDENTIAL = /^(api_key|key|access_token|token)$/i;

/** The Ola `/tiles/vector/v1/` path for a proxy request, or null when it is not a map resource. */
export function mapTileUpstreamPath(segments: readonly string[]): string | null {
  if (segments.length < 2 || segments.length > 8 || !SECTIONS.has(segments[0])) return null;
  if (segments.some((segment) => !SEGMENT.test(segment) || /^\.+$/.test(segment))) return null;
  if (!RESOURCE.test(segments[segments.length - 1])) return null;
  // Encode like a browser does for the official SDK: spaces escaped, "," and "@" kept as-is.
  return segments.map((segment) => encodeURIComponent(segment).replace(/%2C/g, ",").replace(/%40/g, "@")).join("/");
}

/** Ola bills the interactive map per load, i.e. per style document. */
export function isMapStyleDocument(path: string): boolean {
  return /^styles\/[^/]+\/style\.json$/.test(path);
}

/** Query parameters a rewritten map URL may carry back, minus credentials; null when malformed. */
export function mapTileQuery(search: URLSearchParams): URLSearchParams | null {
  const query = new URLSearchParams();
  let count = 0;
  for (const [name, value] of search) {
    if (++count > 6 || !/^[A-Za-z0-9_-]{1,32}$/.test(name) || value.length > 128) return null;
    if (!CREDENTIAL.test(name)) query.append(name, value);
  }
  return query;
}

/** Points the Ola URLs in a style or TileJSON document at the proxy and drops any credential. */
export function rewriteMapDocument(json: string, proxyBase: string): string {
  // Re-serialising also normalises escaped slashes ("https:\/\/..."), so every Ola URL is matched.
  return JSON.stringify(JSON.parse(json)).replace(OLA_VECTOR_URL, (_match, rest: string) => {
    const queryAt = rest.indexOf("?");
    const path = queryAt < 0 ? rest : rest.slice(0, queryAt);
    const query = queryAt < 0
      ? []
      : rest.slice(queryAt + 1).split("&").filter((pair) => pair && !CREDENTIAL.test(pair.split("=")[0]));
    return `${proxyBase}/${path}${query.length ? `?${query.join("&")}` : ""}`;
  });
}
