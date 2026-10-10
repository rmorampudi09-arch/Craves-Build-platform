// @vitest-environment jsdom
// Synthetic menu item ids; no backend is contacted.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const SAVED = "11111111-1111-4111-8111-111111111111";
const NEW = "22222222-2222-4222-8222-222222222222";
const FAILS = "33333333-3333-4333-8333-333333333333";
const KEY = "craves.wishlist";

function favorite(menuItemId: string) {
  return { menuItemId, createdAt: "2026-10-10T10:00:00Z" };
}

beforeEach(() => {
  vi.resetModules(); // fresh "once per page load" state for each case
  window.localStorage.setItem(KEY, JSON.stringify([
    { id: SAVED, name: "Saved already", chef: "Fixture", price: 100, img: "" },
    { id: NEW, name: "New", chef: "Fixture", price: 100, img: "" },
    { id: FAILS, name: "Fails", chef: "Fixture", price: 100, img: "" },
    { id: "not-a-menu-item" },
  ]));
});
afterEach(() => {
  window.localStorage.clear();
  vi.unstubAllGlobals();
});

describe("legacy on-device wishlist", () => {
  it("moves dishes to the account once and keeps only what couldn't be saved", async () => {
    const fetch = vi.fn(async (url: string, init?: RequestInit) => {
      if (!init?.method || init.method === "GET") return Response.json([favorite(SAVED)]);
      if (url.endsWith(FAILS)) return Response.json({ message: "Try later" }, { status: 503 });
      return Response.json(favorite(url.split("/").pop()!));
    });
    vi.stubGlobal("fetch", fetch);
    const { migrateLegacyWishlist, getCustomerFavoriteIds } = await import("@/services/api/customerFavorites");

    await Promise.all([migrateLegacyWishlist(), migrateLegacyWishlist()]);

    const puts = fetch.mock.calls.filter(([, init]) => init?.method === "PUT").map(([url]) => url);
    expect(puts).toEqual([`/api/customer/favorites/${NEW}`, `/api/customer/favorites/${FAILS}`]);
    expect(getCustomerFavoriteIds().has(NEW)).toBe(true);
    expect(JSON.parse(window.localStorage.getItem(KEY)!)).toEqual([{ id: FAILS }]);
  });

  it("leaves the device list alone while signed out", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ message: "Please sign in again." }, { status: 401 })));
    const before = window.localStorage.getItem(KEY);
    const { migrateLegacyWishlist } = await import("@/services/api/customerFavorites");
    await migrateLegacyWishlist();
    expect(window.localStorage.getItem(KEY)).toBe(before);
  });
});
