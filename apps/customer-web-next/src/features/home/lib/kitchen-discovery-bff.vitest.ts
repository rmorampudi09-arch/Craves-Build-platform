// Synthetic kitchens and photo URLs; Catalog is mocked.
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const catalog = vi.hoisted(() => vi.fn());
vi.mock("@/shared/lib/public-api", () => ({ publicApiFetch: catalog }));

import { GET } from "@/app/api/discovery/kitchens/route";

const KITCHEN = { id: "4b1c0000-0000-4000-8000-000000000001", kitchenName: "Ammi's Dastarkhwan", displayName: null, description: null, areaName: "Tolichowki", city: "Hyderabad", state: "Telangana", distanceMeters: 3_400, activeMenuItemCount: 4 };
const page = { page: 0, size: 20, totalElements: 1, totalPages: 1, hasNext: false };
const discover = () => GET(new NextRequest("https://craves.in/api/discovery/kitchens?latitude=17.4&longitude=78.4"));

beforeEach(() => { catalog.mockReset(); });

describe("GET /api/discovery/kitchens", () => {
  it("asks Catalog for the 10 km radius and passes the chef and kitchen photos through, https only", async () => {
    catalog.mockResolvedValue(Response.json({ latitude: 17.4, longitude: 78.4, radiusMeters: 10_000, page, kitchens: [{
      ...KITCHEN, chefPhotoUrl: "https://img.craves.test/chef.webp", kitchenPhotoUrls: ["https://img.craves.test/k1.webp", "http://img.craves.test/k2.webp"],
    }] }));
    const response = await discover();
    expect(catalog).toHaveBeenCalledWith("/discovery/kitchens?latitude=17.4&longitude=78.4&radiusMeters=10000&page=0&size=20");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json();
    expect(body.kitchens[0]).toMatchObject({ chefPhotoUrl: "https://img.craves.test/chef.webp", kitchenPhotoUrls: ["https://img.craves.test/k1.webp"] });
  });

  it("answers 502 when the photos are not a list", async () => {
    catalog.mockResolvedValue(Response.json({ latitude: 17.4, longitude: 78.4, radiusMeters: 10_000, page, kitchens: [{ ...KITCHEN, kitchenPhotoUrls: "https://img.craves.test/k1.webp" }] }));
    const response = await discover();
    expect(response.status).toBe(502);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("keeps Catalog's failure status without caching it", async () => {
    catalog.mockResolvedValue(Response.json({ message: "down" }, { status: 503 }));
    const response = await discover();
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect((await response.json()).error).toBe("DISCOVERY_UNAVAILABLE");
  });
});
