// @vitest-environment node
// Synthetic ids; no backend is contacted.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const catalog = vi.hoisted(() => vi.fn());
vi.mock("@/shared/lib/public-api", () => ({ publicApiFetch: catalog }));
import { GET } from "@/app/api/discovery/kitchens/route";
import { allKitchens, discoverKitchens } from "@/features/chefs/api/kitchens";

const kitchen = (id: string) => ({
  id,
  kitchenName: `Kitchen ${id.slice(-1)}`,
  displayName: null,
  description: null,
  areaName: null,
  city: "Hyderabad",
  state: "Telangana",
  latitude: 17.4,
  longitude: 78.4,
  distanceMeters: 1200,
  activeMenuItemCount: 3,
});
const page = (kitchens: unknown[]) => ({
  latitude: 17.4,
  longitude: 78.4,
  radiusMeters: 10_000,
  page: { page: 0, size: 50, totalElements: kitchens.length, totalPages: 1, hasNext: false },
  kitchens,
});
const get = (query: string) =>
  GET(
    new NextRequest(
      `https://craves.in/api/discovery/kitchens?latitude=17.4&longitude=78.4&${query}`,
    ),
  );

beforeEach(() => {
  catalog.mockReset();
}); // braces: a returned function would run as teardown
afterEach(() => vi.unstubAllGlobals());

describe("Chefs tab spice filter", () => {
  it("passes a known spice level on to the catalog", async () => {
    catalog.mockResolvedValue(Response.json(page([])));
    expect((await get("spiceLevel=MEDIUM")).status).toBe(200);
    expect(catalog).toHaveBeenCalledWith(
      "/discovery/kitchens?latitude=17.4&longitude=78.4&radiusMeters=10000&page=0&size=20&spiceLevel=MEDIUM",
    );
  });

  it.each(["spiceLevel=HOT", "spiceLevel=mild", "spiceLevel=", "spiceLevel=MILD&spiceLevel=SPICY"])(
    "rejects %s before calling the catalog",
    async (query) => {
      const response = await get(query);
      expect(response.status).toBe(400);
      expect(catalog).not.toHaveBeenCalled();
    },
  );

  it("asks for the spice level and keeps the cached nearby kitchens Home reuses", async () => {
    const fetch = vi.fn(async (url: string) => {
      const spicy = new URL(url, "https://craves.in").searchParams.get("spiceLevel") === "SPICY";
      return Response.json(
        page(
          spicy
            ? [kitchen("4a000000-0000-4000-8000-000000000002")]
            : [
                kitchen("4a000000-0000-4000-8000-000000000001"),
                kitchen("4a000000-0000-4000-8000-000000000002"),
              ],
        ),
      );
    });
    vi.stubGlobal("fetch", fetch);
    await discoverKitchens(17.4, 78.4);
    const filtered = await discoverKitchens(17.4, 78.4, 10_000, "SPICY");
    expect(filtered.kitchens.map((item) => item.id)).toEqual([
      "4a000000-0000-4000-8000-000000000002",
    ]);
    expect(fetch.mock.calls[1][0]).toContain("spiceLevel=SPICY");
    expect(allKitchens()).toHaveLength(2);
  });
});
