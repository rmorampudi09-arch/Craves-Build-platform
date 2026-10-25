// @vitest-environment jsdom
// Synthetic kitchens, dishes and coordinates; no network and no real cart.
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CartItem } from "@/features/cart/api/cravesCart";

const cart = vi.hoisted(() => ({
  clearCart: vi.fn(async () => undefined),
  removeFromCart: vi.fn(async (id: string) => void id),
}));
const dishes = vi.hoisted(() => ({ loadKitchenMenu: vi.fn() }));
vi.mock("@/features/cart/api/cravesCart", () => cart);
vi.mock("@/features/dish/api/dishes", () => dishes);

import {
  kitchensWithinReach,
  unavailableMenuItemIds,
  useCartAddressAvailability,
} from "./cart-address-availability";

const KITCHEN = "11111111-1111-4111-8111-111111111111";
const OTHER_KITCHEN = "55555555-5555-4555-8555-555555555555";
const BIRYANI = "22222222-2222-4222-8222-222222222222";
const RAITA = "33333333-3333-4333-8333-333333333333";

function line(id: string, menuItemId: string, name: string): CartItem {
  return {
    id, menuItemId, kitchenId: KITCHEN, name, chef: "Fixture kitchen", price: 200, img: "/dish.jpg",
    imageIsPlaceholder: false, qty: 1, currency: "INR", lineTotal: 200,
  };
}
const items = [
  line("a1111111-1111-4111-8111-111111111111", BIRYANI, "Hyderabadi biryani"),
  line("b1111111-1111-4111-8111-111111111111", RAITA, "Raita"),
];
const home = { id: "home-address", lat: 17.41, lng: 78.44 };

function discovery(kitchenIds: string[], hasNext = false) {
  return Response.json({
    latitude: 17.41, longitude: 78.44, radiusMeters: 50_000,
    page: { page: 0, size: 50, totalElements: kitchenIds.length, totalPages: 1, hasNext },
    kitchens: kitchenIds.map((id) => ({
      id, kitchenName: "Fixture kitchen", displayName: null, description: null, areaName: null,
      city: "Hyderabad", state: "Telangana", distanceMeters: 1_200, activeMenuItemCount: 4,
    })),
  });
}

beforeEach(() => {
  window.sessionStorage.clear();
  cart.clearCart.mockClear();
  cart.removeFromCart.mockClear();
  dishes.loadKitchenMenu.mockReset();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("which cart dishes reach a delivery address", () => {
  it("flags every dish of a kitchen out of reach without reading its menu", async () => {
    const readMenu = vi.fn();
    const ids = await unavailableMenuItemIds(items, new Set([OTHER_KITCHEN]), new Set(), readMenu);
    expect([...ids]).toEqual([BIRYANI, RAITA]);
    expect(readMenu).not.toHaveBeenCalled();
  });

  it("flags only dishes the kitchen no longer has, and nothing when its menu fails to load", async () => {
    const ids = await unavailableMenuItemIds(items, new Set([KITCHEN]), new Set(), async () => [{ id: BIRYANI }]);
    expect([...ids]).toEqual([RAITA]);
    const offline = await unavailableMenuItemIds(items, new Set([KITCHEN]), new Set(), async () => {
      throw new Error("offline");
    });
    expect(offline.size).toBe(0);
  });

  it("calls a kitchen past the nearest 50 unknown, never out of reach", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => discovery([OTHER_KITCHEN], true)));
    expect(await kitchensWithinReach(home.lat, home.lng, [KITCHEN])).toBeNull();
    vi.stubGlobal("fetch", vi.fn(async () => discovery([OTHER_KITCHEN])));
    expect([...(await kitchensWithinReach(home.lat, home.lng, [KITCHEN]))!]).toEqual([OTHER_KITCHEN]);
  });
});

describe("the cart and checkout check", () => {
  it("names the whole cart when its kitchen doesn't deliver to the address, and clears it on request", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => discovery([OTHER_KITCHEN])));
    const { result } = renderHook(() => useCartAddressAvailability({ items, address: home }));

    await waitFor(() => expect(result.current.unavailableItems).toHaveLength(2));
    expect(result.current.open).toBe(true);
    await act(() => result.current.resolve());
    expect(cart.clearCart).toHaveBeenCalledTimes(1);
    expect(cart.removeFromCart).not.toHaveBeenCalled();
  });

  it("removes only the dishes that can't come and reads menus without touching Home's list", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => discovery([KITCHEN])));
    dishes.loadKitchenMenu.mockResolvedValue([{ id: BIRYANI }]);
    const { result } = renderHook(() => useCartAddressAvailability({ items, address: home }));

    await waitFor(() => expect(result.current.unavailableItems.map((item) => item.name)).toEqual(["Raita"]));
    expect(dishes.loadKitchenMenu).toHaveBeenCalledWith(KITCHEN, { remember: false });
    await act(() => result.current.resolve());
    expect(cart.removeFromCart.mock.calls).toEqual([[items[1].id]]);
    expect(cart.clearCart).not.toHaveBeenCalled();
  });

  it("flags nothing when Craves can't be reached, so payment is never blocked by the network", async () => {
    const fetch = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    vi.stubGlobal("fetch", fetch);
    const { result } = renderHook(() => useCartAddressAvailability({ items, address: home }));

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    await act(async () => undefined);
    expect(result.current.unavailableItems).toEqual([]);
  });

  it("never shows one address's answer for another", async () => {
    let answerSecond: (response: Response) => void = () => undefined;
    vi.stubGlobal("fetch", vi.fn()
      .mockImplementationOnce(async () => discovery([OTHER_KITCHEN]))
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { answerSecond = resolve; })));
    dishes.loadKitchenMenu.mockResolvedValue([{ id: BIRYANI }, { id: RAITA }]);
    const { result, rerender } = renderHook(
      ({ lat }) => useCartAddressAvailability({ items, address: { lat, lng: home.lng } }),
      { initialProps: { lat: home.lat } },
    );
    await waitFor(() => expect(result.current.unavailableItems).toHaveLength(2));

    rerender({ lat: 12.97 });
    expect(result.current.unavailableItems).toEqual([]);
    await act(async () => answerSecond(discovery([KITCHEN])));
    await waitFor(() => expect(dishes.loadKitchenMenu).toHaveBeenCalled());
    expect(result.current.unavailableItems).toEqual([]);
  });
});
