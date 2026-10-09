import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const KEY = "fixture-ola-key-0123456789abcdef";

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("OLA_MAPS_API_KEY", KEY);
  vi.stubEnv("CRAVES_LOCATION_SEARCH_CENTER", "");
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); vi.restoreAllMocks(); });

const reverseBody = {
  status: "ok",
  results: [{
    formatted_address: "Plot 12, Ayyappa Society Main Road, Madhapur, Hyderabad, Telangana, 500081, India",
    geometry: { location: { lat: 17.4483, lng: 78.3915 }, location_type: "rooftop" },
    address_components: [
      { types: ["street_number"], long_name: "Plot 12", short_name: "Plot 12" },
      { types: ["route"], long_name: "Ayyappa Society Main Road", short_name: "Ayyappa Society Main Road" },
      { types: ["sublocality_level_1", "sublocality"], long_name: "Madhapur", short_name: "Madhapur" },
      { types: ["locality"], long_name: "Hyderabad", short_name: "Hyderabad" },
      { types: ["administrative_area_level_2"], long_name: "Rangareddy", short_name: "Rangareddy" },
      { types: ["administrative_area_level_1"], long_name: "Telangana", short_name: "TG" },
      { types: ["postal_code"], long_name: "500081", short_name: "500081" },
      { types: ["country"], long_name: "India", short_name: "IN" },
    ],
    place_id: "ola-platform:fixture",
  }],
};

const prediction = (id: string, title: string, lat: unknown, lng: unknown) => ({
  place_id: id,
  description: `${title}, Hyderabad, Telangana, India`,
  structured_formatting: { main_text: title, secondary_text: "Hyderabad, Telangana, India" },
  geometry: { location: { lat, lng } },
});

function warnings() {
  return vi.mocked(console.warn).mock.calls.map((call) => call.join(" ")).join("\n");
}

describe("Ola Maps reverse geocoding transport without live requests", () => {
  it("sends the key only as api_key with the Craves origin and never follows redirects", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json(reverseBody));
    vi.stubGlobal("fetch", fetcher);
    const { reverseGeocodeWithOlaMaps } = await import("./server/ola-maps");

    expect(await reverseGeocodeWithOlaMaps(17.4483, 78.3915)).toEqual({
      formattedAddress: reverseBody.results[0].formatted_address,
      houseNumber: "Plot 12",
      street: "Ayyappa Society Main Road",
      area: "Madhapur",
      city: "Hyderabad",
      district: "Rangareddy",
      state: "Telangana",
      postalCode: "500081",
      country: "India",
      confidence: "High",
      preciseHouseNumber: true,
    });

    const [url, init] = fetcher.mock.calls[0];
    const parsed = new URL(String(url));
    expect(parsed.origin + parsed.pathname).toBe("https://api.olamaps.io/places/v1/reverse-geocode");
    expect(parsed.searchParams.get("latlng")).toBe("17.4483000,78.3915000");
    expect(parsed.searchParams.get("api_key")).toBe(KEY);
    expect(init).toMatchObject({ redirect: "error", cache: "no-store" });
    const headers = new Headers(init.headers);
    expect(headers.get("origin")).toBe("https://craves.in");
    expect(headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
    expect(JSON.stringify(init.headers)).not.toContain(KEY);
  });

  it("fails closed without a configured key and never calls the network", async () => {
    vi.stubEnv("OLA_MAPS_API_KEY", " ");
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const { reverseGeocodeWithOlaMaps } = await import("./server/ola-maps");
    await expect(reverseGeocodeWithOlaMaps(17.4483, 78.3915)).rejects.toThrow("OLA_MAPS_API_KEY is not configured");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("maps rate limits, 4xx and 5xx to unavailable and logs without key, coordinates or body", async () => {
    const { reverseGeocodeWithOlaMaps, OlaMapsUnavailableError } = await import("./server/ola-maps");
    for (const status of [400, 401, 403, 429, 500, 503]) {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ message: `Domain is not allowed api_key=${KEY}` }, { status })));
      const failure = await reverseGeocodeWithOlaMaps(17.4483, 78.3915).catch((error) => error);
      expect(failure).toBeInstanceOf(OlaMapsUnavailableError);
      expect(failure.message).toContain(status === 429 ? "rate limited (HTTP 429)" : `HTTP ${status}`);
      expect(failure.message).not.toContain(KEY);
    }
    expect(warnings()).toContain("[location] Ola Maps reverse geocoding unavailable: HTTP 503");
    for (const secret of [KEY, "17.4483", "78.3915", "Domain is not allowed"]) expect(warnings()).not.toContain(secret);
  });

  it("treats zero results and malformed bodies as unavailable", async () => {
    const { reverseGeocodeWithOlaMaps } = await import("./server/ola-maps");
    for (const body of [
      Response.json({ status: "zero_results", results: [], error_message: "ZERO RESULTS" }),
      Response.json({ status: "ok", results: [{ address_components: [] }] }),
      new Response("not json", { headers: { "content-type": "application/json" } }),
    ]) {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(body));
      await expect(reverseGeocodeWithOlaMaps(0, 0)).rejects.toThrow("no usable address");
    }
  });

  it("rejects invalid coordinates before any request", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const { reverseGeocodeWithOlaMaps } = await import("./server/ola-maps");
    for (const [latitude, longitude] of [[91, 0], [0, -181], [Number.NaN, 0], [0, Number.POSITIVE_INFINITY]]) {
      await expect(reverseGeocodeWithOlaMaps(latitude, longitude)).rejects.toThrow("Invalid coordinates");
    }
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("rejects oversized provider responses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("x".repeat(256 * 1_024 + 1))));
    const { reverseGeocodeWithOlaMaps } = await import("./server/ola-maps");
    await expect(reverseGeocodeWithOlaMaps(0, 0)).rejects.toThrow("UPSTREAM_RESPONSE_TOO_LARGE");
    expect(warnings()).toContain("response too large");
  });

  it("keeps the seven second deadline active after headers", async () => {
    vi.useFakeTimers();
    const stalled = new Response(new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array([123])); } }));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(stalled));
    const { reverseGeocodeWithOlaMaps } = await import("./server/ola-maps");
    const outcome = reverseGeocodeWithOlaMaps(0, 0).catch((error) => error);
    await vi.advanceTimersByTimeAsync(7_001);
    expect(await outcome).toMatchObject({ name: "AbortError" });
    expect(warnings()).toContain("reverse geocoding unavailable: timeout");
  });
});

describe("Ola Maps autocomplete transport without live requests", () => {
  it("biases to the caller location and keeps only usable, unique predictions", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({
      status: "ok",
      predictions: [
        prediction("ola-platform:madhapur", "Madhapur", 17.4483, 78.3915),
        { place_id: "ola-platform:no-geometry", description: "No geometry, Hyderabad" },
        prediction("ola-platform:madhapur", "Madhapur duplicate", 17.4483, 78.3915),
        prediction("ola-platform:bad", "Out of range", 95, 78.3915),
        { ...prediction("ola-platform:metro", "Madhapur Metro Station", 17.4374, 78.3897), structured_formatting: {} },
      ],
    }));
    vi.stubGlobal("fetch", fetcher);
    const { searchOlaMapsAddresses } = await import("./server/ola-maps");

    const results = await searchOlaMapsAddresses("  Madhapur ", 17.385, 78.4867);
    expect(results.map(({ id, title, subtitle, latitude, longitude }) => ({ id, title, subtitle, latitude, longitude }))).toEqual([
      { id: "ola-platform:madhapur", title: "Madhapur", subtitle: "Hyderabad, Telangana, India", latitude: 17.4483, longitude: 78.3915 },
      { id: "ola-platform:metro", title: "Madhapur Metro Station", subtitle: null, latitude: 17.4374, longitude: 78.3897 },
    ]);
    expect(results[0]).toMatchObject({ formattedAddress: "Madhapur, Hyderabad, Telangana, India", area: null, postalCode: null });

    const url = new URL(String(fetcher.mock.calls[0][0]));
    expect(url.pathname).toBe("/places/v1/autocomplete");
    expect(url.searchParams.get("input")).toBe("Madhapur");
    expect(url.searchParams.get("location")).toBe("17.3850000,78.4867000");
    expect(url.searchParams.has("strictbounds")).toBe(false);
  });

  it("uses the configured service-area center only when the caller sends no location", async () => {
    const fetcher = vi.fn().mockImplementation(async () => Response.json({ status: "ok", predictions: [] }));
    vi.stubGlobal("fetch", fetcher);
    vi.stubEnv("CRAVES_LOCATION_SEARCH_CENTER", "17.3850,78.4867");
    let ola = await import("./server/ola-maps");
    await ola.searchOlaMapsAddresses("Kondapur");
    await ola.searchOlaMapsAddresses("Kondapur", 12.9716, 77.5946);
    vi.stubEnv("CRAVES_LOCATION_SEARCH_CENTER", "not,a-point");
    vi.resetModules();
    ola = await import("./server/ola-maps");
    await ola.searchOlaMapsAddresses("Kondapur");
    const locations = fetcher.mock.calls.map(([url]) => new URL(String(url)).searchParams.get("location"));
    expect(locations).toEqual(["17.3850000,78.4867000", "12.9716000,77.5946000", null]);
  });

  it("returns no results for zero matches and caps the list at six", async () => {
    const { searchOlaMapsAddresses } = await import("./server/ola-maps");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ status: "ok", error_message: "ZERO RESULTS", predictions: [] })));
    expect(await searchOlaMapsAddresses("zzzzzz")).toEqual([]);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({
      status: "ok",
      predictions: Array.from({ length: 10 }, (_, index) => prediction(`ola-platform:${index}`, `Place ${index}`, 17.4 + index / 100, 78.4)),
    })));
    expect(await searchOlaMapsAddresses("Place")).toHaveLength(6);
  });

  it("never calls the provider for empty or oversized queries", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const { searchOlaMapsAddresses } = await import("./server/ola-maps");
    expect(await searchOlaMapsAddresses(" M ")).toEqual([]);
    expect(await searchOlaMapsAddresses("x".repeat(161))).toEqual([]);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("treats an unparseable 200 as unavailable instead of zero results", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>gateway</html>", { headers: { "content-type": "text/html" } })));
    const { searchOlaMapsAddresses } = await import("./server/ola-maps");
    await expect(searchOlaMapsAddresses("Madhapur")).rejects.toThrow("autocomplete unavailable: invalid JSON response");
  });

  it("aborts with the caller and does not log superseded keystrokes", async () => {
    const fetcher = vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    }));
    vi.stubGlobal("fetch", fetcher);
    const { searchOlaMapsAddresses } = await import("./server/ola-maps");
    const caller = new AbortController();
    const outcome = searchOlaMapsAddresses("Madhapur", undefined, undefined, caller.signal).catch((error) => error);
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
    caller.abort();
    expect(await outcome).toMatchObject({ name: "AbortError" });
    expect(warnings()).toBe("");
  });

  it("surfaces provider failures without leaking the query", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 500 })));
    const { searchOlaMapsAddresses } = await import("./server/ola-maps");
    await expect(searchOlaMapsAddresses("Jubilee Hills Road 36")).rejects.toThrow("autocomplete unavailable: HTTP 500");
    expect(warnings()).not.toContain("Jubilee");
  });
});

describe("Ola Maps static map transport without live requests", () => {
  it("requests the documented centre-point image and returns PNG bytes", async () => {
    const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    const fetcher = vi.fn().mockResolvedValue(new Response(png, { headers: { "content-type": "image/png" } }));
    vi.stubGlobal("fetch", fetcher);
    const { renderOlaMapsStaticImage } = await import("./server/ola-maps");

    const image = await renderOlaMapsStaticImage(17.4483, 78.3915, 17);
    expect(image.contentType).toBe("image/png");
    expect(Array.from(image.bytes)).toEqual(Array.from(png));
    const url = new URL(String(fetcher.mock.calls[0][0]));
    expect(url.pathname).toBe("/tiles/v1/styles/default-light-standard/static/78.3915000,17.4483000,17/900x520.png");
    expect(url.searchParams.get("api_key")).toBe(KEY);
  });

  it("rejects non-image bodies and invalid zoom levels", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ message: "Domain is not allowed" }));
    vi.stubGlobal("fetch", fetcher);
    const { renderOlaMapsStaticImage } = await import("./server/ola-maps");
    await expect(renderOlaMapsStaticImage(17.4483, 78.3915, 17)).rejects.toThrow("response was not an image");
    for (const zoom of [11, 21, 16.5]) await expect(renderOlaMapsStaticImage(17.4483, 78.3915, zoom)).rejects.toThrow("Invalid zoom");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
