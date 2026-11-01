// Synthetic kitchens and photo URLs; Catalog is mocked.
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const catalog = vi.hoisted(() => vi.fn());
vi.mock("@/shared/lib/public-api", () => ({ publicApiFetch: catalog }));

import { GET } from "@/app/api/discovery/kitchens/route";
import { GET as getMenuItems } from "@/app/api/discovery/menu-items/route";

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

describe("search words for the catalog (as the app sends them)", () => {
  const emptyKitchens = { latitude: 17.4, longitude: 78.4, radiusMeters: 10_000, page, kitchens: [] };
  const emptyDishes = { latitude: 17.4, longitude: 78.4, radiusMeters: 10_000, page, menuItems: [] };
  const kitchens = (query: string) => GET(new NextRequest(`https://craves.in/api/discovery/kitchens?latitude=17.4&longitude=78.4&${query}`));
  const dishes = (query: string) => getMenuItems(new NextRequest(`https://craves.in/api/discovery/menu-items?latitude=17.4&longitude=78.4&${query}`));

  it("passes the trimmed words on to both searches", async () => {
    catalog.mockResolvedValueOnce(Response.json(emptyKitchens)).mockResolvedValueOnce(Response.json(emptyDishes));
    expect((await kitchens("query=%20chicken%20biryani%20")).status).toBe(200);
    expect((await dishes("query=%20chicken%20biryani%20")).status).toBe(200);
    expect(catalog.mock.calls.map(([path]) => path)).toEqual([
      "/discovery/kitchens?latitude=17.4&longitude=78.4&radiusMeters=10000&page=0&size=20&query=chicken+biryani",
      "/discovery/menu-items?latitude=17.4&longitude=78.4&radiusMeters=10000&page=0&size=20&query=chicken+biryani",
    ]);
  });

  it("takes 120 characters in any script, and leaves out empty words", async () => {
    catalog.mockImplementation(async (path: string) => Response.json(path.startsWith("/discovery/kitchens") ? emptyKitchens : emptyDishes));
    const telugu = encodeURIComponent("బిర్యానీ".repeat(15));
    expect((await kitchens(`query=${telugu}`)).status).toBe(200);
    expect((await dishes("query=%20%20")).status).toBe(200);
    expect(catalog).toHaveBeenLastCalledWith("/discovery/menu-items?latitude=17.4&longitude=78.4&radiusMeters=10000&page=0&size=20");
  });

  it.each(["query=" + "a".repeat(121), "query=chicken%0Abiryani", "query=%00"])("refuses %s before calling the catalog", async (query) => {
    expect([(await kitchens(query)).status, (await dishes(query)).status]).toEqual([400, 400]);
    expect(catalog).not.toHaveBeenCalled();
  });

  it("refuses a second set of words for kitchens", async () => {
    expect((await kitchens("query=a&query=b")).status).toBe(400);
    expect(catalog).not.toHaveBeenCalled();
  });
});
