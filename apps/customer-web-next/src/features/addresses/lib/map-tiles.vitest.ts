import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import {
  isMapStyleDocument,
  mapTileQuery,
  mapTileUpstreamPath,
  rewriteMapDocument,
} from "./map-tiles";

const mocks = vi.hoisted(() => {
  class OlaMapsUnavailableError extends Error {
    constructor(message: string, readonly status?: number) {
      super(message);
    }
  }
  return { vector: vi.fn(), OlaMapsUnavailableError };
});
vi.mock("@/features/addresses/lib/server/ola-maps", () => ({
  fetchOlaMapsVectorResource: mocks.vector,
  OlaMapsUnavailableError: mocks.OlaMapsUnavailableError,
}));

beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); });
afterEach(() => { vi.restoreAllMocks(); });

const STYLE = ["styles", "default-light-standard", "style.json"];

async function get(segments: string[], headers: Record<string, string> = { "Sec-Fetch-Site": "same-origin" }, search = "") {
  const { GET } = await import("../../../app/api/location/map-tiles/[...path]/route");
  const url = `https://craves.in/api/location/map-tiles/${segments.map(encodeURIComponent).join("/")}${search}`;
  return GET(new NextRequest(url, { headers }), { params: Promise.resolve({ path: segments }) });
}

describe("map tile paths", () => {
  it("accepts style, TileJSON, tile, glyph and sprite resources", () => {
    expect(mapTileUpstreamPath(STYLE)).toBe("styles/default-light-standard/style.json");
    expect(mapTileUpstreamPath(["data", "planet.json"])).toBe("data/planet.json");
    expect(mapTileUpstreamPath(["data", "planet", "14", "11712", "7520.pbf"])).toBe("data/planet/14/11712/7520.pbf");
    expect(mapTileUpstreamPath(["fonts", "Noto Sans Regular,Arial Unicode MS Regular", "0-255.pbf"]))
      .toBe("fonts/Noto%20Sans%20Regular,Arial%20Unicode%20MS%20Regular/0-255.pbf");
    expect(mapTileUpstreamPath(["styles", "default-light-standard", "sprite@2x.png"]))
      .toBe("styles/default-light-standard/sprite@2x.png");
  });

  it("rejects anything that is not a vector map resource", () => {
    for (const segments of [
      [], ["styles"], ["places", "autocomplete.json"], ["3dtiles", "tileset.json"],
      ["styles", "..", "style.json"], ["data", ".", "planet.json"], ["data", "planet?x.pbf"],
      ["data", "planet.js"], ["data", "a/b.pbf"], ["data", "x".repeat(129) + ".pbf"],
      ["data", "1", "2", "3", "4", "5", "6", "7", "8.pbf"],
    ]) expect(mapTileUpstreamPath(segments), segments.join("/")).toBeNull();
  });

  it("treats only style documents as billed map loads", () => {
    expect(isMapStyleDocument("styles/default-light-standard/style.json")).toBe(true);
    for (const path of ["data/planet.json", "styles/default-light-standard/sprite.json", "styles/a/b/style.json"]) {
      expect(isMapStyleDocument(path)).toBe(false);
    }
  });

  it("drops credentials from the query and rejects malformed ones", () => {
    expect(mapTileQuery(new URLSearchParams("api_key=x&key=y&access_token=z&token=t&v=2"))?.toString()).toBe("v=2");
    expect(mapTileQuery(new URLSearchParams("a=1&b=2&c=3&d=4&e=5&f=6&g=7"))).toBeNull();
    expect(mapTileQuery(new URLSearchParams("bad%20name=1"))).toBeNull();
    expect(mapTileQuery(new URLSearchParams(`v=${"x".repeat(129)}`))).toBeNull();
  });
});

describe("map document rewriting", () => {
  const base = "https://craves.in/api/location/map-tiles";

  it("points every Ola resource at the proxy, keeps templates and strips the key", () => {
    const style = {
      version: 8,
      sprite: "https://api.olamaps.io/tiles/vector/v1/styles/default-light-standard/sprite",
      glyphs: "https://api.olamaps.io/tiles/vector/v1/fonts/{fontstack}/{range}.pbf?api_key=SECRET",
      sources: {
        planet: { type: "vector", url: "https://api.olamaps.io/tiles/vector/v1/data/planet.json?api_key=SECRET&v=3" },
        tiles: { type: "vector", tiles: ["https://api.olamaps.io/tiles/vector/v1/data/planet/{z}/{x}/{y}.pbf?key=SECRET"] },
        other: { type: "raster", tiles: ["https://example.org/{z}/{x}/{y}.png"] },
      },
    };
    const rewritten = JSON.parse(rewriteMapDocument(JSON.stringify(style), base));
    expect(rewritten.sprite).toBe(`${base}/styles/default-light-standard/sprite`);
    expect(rewritten.glyphs).toBe(`${base}/fonts/{fontstack}/{range}.pbf`);
    expect(rewritten.sources.planet.url).toBe(`${base}/data/planet.json?v=3`);
    expect(rewritten.sources.tiles.tiles).toEqual([`${base}/data/planet/{z}/{x}/{y}.pbf`]);
    expect(rewritten.sources.other.tiles).toEqual(["https://example.org/{z}/{x}/{y}.png"]);
    expect(JSON.stringify(rewritten)).not.toContain("SECRET");
  });

  it("matches escaped slashes and rejects documents that are not JSON", () => {
    const escaped = '{"url":"https:\\/\\/api.olamaps.io\\/tiles\\/vector\\/v1\\/data\\/planet.json?api_key=SECRET"}';
    expect(JSON.parse(rewriteMapDocument(escaped, base)).url).toBe(`${base}/data/planet.json`);
    expect(() => rewriteMapDocument("<html>", base)).toThrow();
  });
});

describe("same-origin map tile proxy", () => {
  it("rejects cross-site and invalid requests before calling Ola", async () => {
    expect((await get(STYLE, {})).status).toBe(403);
    expect((await get(STYLE, { Referer: "https://evil.example/" })).status).toBe(403);
    expect((await get(["places", "autocomplete.json"])).status).toBe(400);
    expect((await get(STYLE, undefined, "?a=1&b=2&c=3&d=4&e=5&f=6&g=7")).status).toBe(400);
    expect(mocks.vector).not.toHaveBeenCalled();
  });

  it("serves a style document for this origin, never cached, without the client's credentials", async () => {
    mocks.vector.mockResolvedValue({ bytes: new TextEncoder().encode('{"version":8}'), contentType: "application/json" });
    const response = await get(STYLE, { Referer: "https://craves.in/profile/addresses" }, "?api_key=attacker&v=1");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.text()).toBe('{"version":8}');
    const [path, query, base] = mocks.vector.mock.calls[0];
    expect(path).toBe("styles/default-light-standard/style.json");
    expect(query.toString()).toBe("v=1");
    expect(base).toBe("https://craves.in/api/location/map-tiles");
  });

  it("uses the forwarded public origin behind Front Door", async () => {
    mocks.vector.mockResolvedValue({ bytes: new TextEncoder().encode("{}"), contentType: "application/json" });
    await get(STYLE, { "Sec-Fetch-Site": "same-origin", "X-Forwarded-Proto": "https", "X-Forwarded-Host": "www.craves.in" });
    expect(mocks.vector.mock.calls[0][2]).toBe("https://www.craves.in/api/location/map-tiles");
  });

  it("lets tiles stay in the private browser cache", async () => {
    mocks.vector.mockResolvedValue({ bytes: new Uint8Array([26, 3]), contentType: "application/x-protobuf" });
    const response = await get(["data", "planet", "14", "11712", "7520.pbf"]);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, max-age=3600");
    expect(Array.from(new Uint8Array(await response.arrayBuffer()))).toEqual([26, 3]);
  });

  it("maps a missing resource to 404 and any other failure to a generic 503", async () => {
    mocks.vector.mockRejectedValueOnce(new mocks.OlaMapsUnavailableError("gone", 404));
    expect((await get(["data", "planet", "20", "1", "1.pbf"])).status).toBe(404);
    mocks.vector.mockRejectedValueOnce(new mocks.OlaMapsUnavailableError("HTTP 401", 401));
    const failed = await get(STYLE);
    expect(failed.status).toBe(503);
    expect(await failed.json()).toEqual({ error: "MAP_UNAVAILABLE" });
  });

  it("admits at most 60 style loads a minute and keeps a separate budget for tiles", async () => {
    mocks.vector.mockResolvedValue({ bytes: new TextEncoder().encode("{}"), contentType: "application/json" });
    const { GET } = await import("../../../app/api/location/map-tiles/[...path]/route");
    const call = (path: string[]) => GET(
      new NextRequest(`https://craves.in/api/location/map-tiles/${path.join("/")}`, { headers: { "Sec-Fetch-Site": "same-origin" } }),
      { params: Promise.resolve({ path }) },
    );
    for (let i = 0; i < 60; i += 1) expect((await call(STYLE)).status).toBe(200);
    const limited = await call(STYLE);
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);
    // A burst of map opens must not blank the tiles of maps that are already open.
    mocks.vector.mockResolvedValue({ bytes: new Uint8Array([1]), contentType: "application/x-protobuf" });
    expect((await call(["data", "planet", "1", "1", "1.pbf"])).status).toBe(200);
  });
});
