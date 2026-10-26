// @vitest-environment jsdom
// Synthetic ids for a fixture account; no backend is contacted.
import { createElement, type ReactNode } from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const addToCart = vi.hoisted(() => vi.fn());
const setQty = vi.hoisted(() => vi.fn(async () => undefined));
// The cart line each dish shows in its stepper (none unless a test puts one in).
const cartLines = vi.hoisted(() => new Map<string, { id: string; qty: number }>());
// Stable like the router's own navigate, so the page's load effect runs once.
const navigate = vi.hoisted(() => vi.fn());
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigate,
  Link: ({
    children,
    to,
    params,
    ...props
  }: {
    children: ReactNode;
    to: string;
    params?: { id: string };
  }) =>
    createElement("a", { href: params ? to.replace("$id", params.id) : to, ...props }, children),
}));
vi.mock("@/features/auth/api/cravesAuth", () => ({
  loadSession: async () => ({ id: "11111111-1111-4111-8111-111111111111" }),
}));
vi.mock("@/features/cart/api/cravesCart", () => ({
  addToCart,
  setQty,
  loadCart: async () => [],
  CartKeptError: class extends Error {},
}));
vi.mock("@/features/cart/components/CustomerFloatingCart", () => ({
  CustomerFloatingCart: () => null,
  useCartLine: (menuItemId: string) => cartLines.get(menuItemId),
}));

let WishlistPage: typeof import("@/features/favorites/screens/Wishlist").default;

const NOW = "22222222-2222-4222-8222-222222222222";
const LATER = "33333333-3333-4333-8333-333333333333";
const KITCHEN = "6b000000-0000-4000-8000-000000000001";
const CHEF = "c4000000-0000-4000-8000-000000000001";
const AT = "2026-10-15T08:00:00Z";

function saved(menuItemId: string, itemName: string, availabilityState: string) {
  return {
    menuItemId,
    found: true,
    availabilityState,
    itemName,
    price: 180,
    currency: "INR",
    itemStatus: "ACTIVE",
    itemAvailable: true,
    kitchenId: KITCHEN,
    kitchenName: "Asha's kitchen",
    kitchenDisplayName: null,
    kitchenStatus: "ACTIVE",
    primaryImageUrl: null,
    timezoneId: "Asia/Kolkata",
    acceptingOrders: true,
    paused: false,
    availableNow: availabilityState === "AVAILABLE_NOW",
    nextAvailabilityAt: null,
  };
}

function card(requestedType: "CHEF" | "KITCHEN", requestedId: string) {
  return {
    requestedType,
    requestedId,
    exists: true,
    kitchenId: KITCHEN,
    chefIdentityId: CHEF,
    kitchenName: "Asha's kitchen",
    displayName: null,
    areaName: "Kondapur",
    city: "Hyderabad",
    cookingState: "COOKING_NOW",
  };
}

type Route = (url: string, init?: RequestInit) => Response | undefined;

function stub(override: Route = () => undefined) {
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    const answered = override(url, init);
    if (answered) return answered;
    const method = init?.method ?? "GET";
    if (url === "/api/customer/favorites")
      return Response.json([
        { menuItemId: LATER, createdAt: AT },
        { menuItemId: NOW, createdAt: AT },
      ]);
    if (url === "/api/discovery/saved/menu-items/resolve")
      return Response.json({
        items: [
          saved(LATER, "Rajma chawal", "NOT_TODAY"),
          saved(NOW, "Dal makhani", "AVAILABLE_NOW"),
        ],
      });
    if (url === "/api/customer/favorite-kitchens")
      return Response.json({ items: [{ kitchenId: KITCHEN, createdAt: AT }], nextCursor: null });
    if (url === "/api/customer/favorite-chefs")
      return Response.json({ items: [{ chefIdentityId: CHEF, createdAt: AT }], nextCursor: null });
    if (url.startsWith("/api/customer/favorite-watches?")) return Response.json([]);
    if (url === "/api/discovery/favorites/home/resolve")
      return Response.json({ items: [card("CHEF", CHEF), card("KITCHEN", KITCHEN)] });
    if (url.startsWith("/api/catalog/kitchens/"))
      return Response.json({ code: "KITCHEN_NOT_FOUND" }, { status: 404 });
    if (method === "PUT" && url.startsWith("/api/customer/favorite-watches/")) {
      const [entityType, entityId] = url.split("/").slice(-2);
      return Response.json({
        entityType,
        entityId,
        channel: "IN_APP",
        enabled: JSON.parse(String(init?.body)).enabled,
        lastNotifiedAt: null,
        createdAt: AT,
        updatedAt: AT,
      });
    }
    if (method === "DELETE") return new Response(null, { status: 204 });
    return Response.json({ code: "UNEXPECTED" }, { status: 500 });
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

beforeEach(async () => {
  addToCart.mockReset();
  setQty.mockClear();
  cartLines.clear();
  navigate.mockReset();
  vi.resetModules(); // a fresh "once per page load" saved-kitchen store for each case
  WishlistPage = (await import("@/features/favorites/screens/Wishlist")).default;
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe("Saved screen", () => {
  it("splits saved dishes into cooking today and saved for later, with Add only when orderable", async () => {
    stub();
    render(createElement(WishlistPage));
    const today = await screen.findByRole("region", { name: "Your favorites are cooking today" });
    expect(within(today).getByText("Dal makhani")).toBeTruthy();
    const later = screen.getByRole("region", { name: "Saved for later" });
    expect(within(later).getByText("Rajma chawal")).toBeTruthy();
    expect(within(later).getByText("Not cooking today")).toBeTruthy();
    expect(within(later).queryByRole("button", { name: /Add/ })).toBeNull();
    fireEvent.click(within(today).getByRole("button", { name: "Add Dal makhani to cart" }));
    await waitFor(() =>
      expect(addToCart).toHaveBeenCalledWith(
        expect.objectContaining({ id: NOW, kitchenId: KITCHEN, price: 180 }),
        1,
      ),
    );
  });

  it("shows how many of a saved dish are in the cart, with a stepper in place of Add", async () => {
    stub();
    cartLines.set(NOW, { id: "line-1", qty: 1 });
    render(createElement(WishlistPage));
    const today = await screen.findByRole("region", { name: "Your favorites are cooking today" });
    const stepper = within(today).getByRole("group", { name: "Dal makhani in cart" });
    expect(stepper.textContent).toContain("1");
    expect(within(today).queryByRole("button", { name: "Add Dal makhani to cart" })).toBeNull();
    expect(within(today).getByRole("link", { name: "View dish: Dal makhani" }).getAttribute("href")).toBe(
      `/dish/${NOW}`,
    );
    fireEvent.click(within(stepper).getByRole("button", { name: "Increase Dal makhani quantity" }));
    expect(setQty).toHaveBeenLastCalledWith("line-1", 2);
    fireEvent.click(within(stepper).getByRole("button", { name: "Remove Dal makhani from cart" }));
    expect(setQty).toHaveBeenLastCalledWith("line-1", 0);
    // The heart, not a bin, takes the dish out of Saved.
    expect(
      within(today).getByRole("button", { name: "Remove Dal makhani from saved dishes" }),
    ).toBeTruthy();
  });

  it("keeps saves when today's facts can't be read", async () => {
    stub((url) =>
      url === "/api/discovery/saved/menu-items/resolve"
        ? Response.json({ code: "SAVED_RESOLVE_FAILED" }, { status: 503 })
        : undefined,
    );
    render(createElement(WishlistPage));
    expect(await screen.findByText("Your saves are safe")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Check again" })).toBeTruthy();
  });

  it("lists a saved kitchen and its saved chef once, with an alert bell and a heart that clears both", async () => {
    const fetch = stub();
    render(createElement(WishlistPage));
    fireEvent.mouseDown(await screen.findByRole("tab", { name: "Home chefs" }));
    const bell = await screen.findByRole("button", {
      name: "Alert me in the app when Asha's kitchen is cooking",
    });
    expect(
      screen
        .getAllByRole("listitem")
        .filter((item) => item.textContent?.includes("Kondapur, Hyderabad")),
    ).toHaveLength(1);
    expect(screen.getByRole("link", { name: /Asha's kitchen/ }).getAttribute("href")).toBe(
      `/kitchen/${KITCHEN}`,
    );

    fireEvent.click(bell);
    expect(
      await screen.findByRole("button", { name: "Stop cooking alerts from Asha's kitchen" }),
    ).toBe(bell);
    expect(
      fetch.mock.calls
        .filter(([, init]) => init?.method === "PUT")
        .map(([url, init]) => [url, init?.body]),
    ).toEqual([
      [`/api/customer/favorite-watches/KITCHEN/${KITCHEN}`, JSON.stringify({ enabled: true })],
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Remove Asha's kitchen from saved" }));
    expect(await screen.findByText("No saved home chefs yet")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Explore home chefs" }).getAttribute("href")).toBe(
      "/chefs",
    );
    expect(
      fetch.mock.calls
        .filter(([, init]) => init?.method === "DELETE")
        .map(([url]) => url)
        .sort(),
    ).toEqual([
      `/api/customer/favorite-chefs/${CHEF}`,
      `/api/customer/favorite-kitchens/${KITCHEN}`,
    ]);
    // The Dishes tab's kitchen toggles follow the removal.
    expect(
      await screen.findAllByRole("button", { name: "Save kitchen: Asha's kitchen" }),
    ).toHaveLength(2);
  });

  it("loads more saved home chefs, a page at a time", async () => {
    const LATER_KITCHEN = "6b000000-0000-4000-8000-000000000002";
    const fetch = stub((url, init) => {
      if (url === "/api/customer/favorite-kitchens")
        return Response.json({ items: [{ kitchenId: KITCHEN, createdAt: AT }], nextCursor: "a2" });
      if (url === "/api/customer/favorite-kitchens?cursor=a2")
        return Response.json({
          items: [{ kitchenId: LATER_KITCHEN, createdAt: AT }],
          nextCursor: null,
        });
      if (url !== "/api/discovery/favorites/home/resolve") return undefined;
      const { chefIdentityIds, kitchenIds } = JSON.parse(String(init?.body)) as Record<
        string,
        string[]
      >;
      return Response.json({
        items: [
          ...chefIdentityIds.map((id) => card("CHEF", id)),
          ...kitchenIds.map((id) =>
            id === KITCHEN
              ? card("KITCHEN", id)
              : {
                  ...card("KITCHEN", id),
                  kitchenId: id,
                  chefIdentityId: null,
                  kitchenName: "Ravi's kitchen",
                },
          ),
        ],
      });
    });
    render(createElement(WishlistPage));
    fireEvent.mouseDown(await screen.findByRole("tab", { name: "Home chefs" }));
    expect(await screen.findByRole("link", { name: /Asha's kitchen/ })).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Ravi's kitchen/ })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Load more saved home chefs" }));
    expect(await screen.findByRole("link", { name: /Ravi's kitchen/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Asha's kitchen/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Load more saved home chefs" })).toBeNull();
    // Only the list with another page is read again.
    expect(
      fetch.mock.calls.filter(([url]) => url.startsWith("/api/customer/favorite-chefs")).length,
    ).toBe(1);
  });

  it.each(["/api/customer/favorite-kitchens", "/api/discovery/favorites/home/resolve"])(
    "shows Coming soon when %s isn't live yet",
    async (path) => {
      stub((url) =>
        url === path
          ? Response.json({ code: "FEATURE_NOT_AVAILABLE" }, { status: 404 })
          : undefined,
      );
      render(createElement(WishlistPage));
      expect(await screen.findByText("Saved home chefs")).toBeTruthy();
      expect(screen.getByText("Coming soon")).toBeTruthy();
    },
  );

  it("saves or unsaves a dish's kitchen from its card and reloads Home chefs", async () => {
    const fetch = stub();
    const kitchenReads = () =>
      fetch.mock.calls.filter(
        ([url, init]) => url === "/api/customer/favorite-kitchens" && !init?.method,
      ).length;
    render(createElement(WishlistPage));
    const toggles = await screen.findAllByRole("button", { name: "Kitchen saved: Asha's kitchen" });
    expect(toggles).toHaveLength(2);
    expect(toggles[0].getAttribute("aria-pressed")).toBe("true");
    const reads = kitchenReads();
    fireEvent.click(toggles[0]);
    expect(
      await screen.findAllByRole("button", { name: "Save kitchen: Asha's kitchen" }),
    ).toHaveLength(2);
    expect(
      fetch.mock.calls.filter(([, init]) => init?.method === "DELETE").map(([url]) => url),
    ).toEqual([`/api/customer/favorite-kitchens/${KITCHEN}`]);
    await waitFor(() => expect(kitchenReads()).toBeGreaterThan(reads));
  });
});
