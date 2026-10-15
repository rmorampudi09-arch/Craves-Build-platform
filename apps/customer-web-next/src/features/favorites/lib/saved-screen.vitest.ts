// @vitest-environment jsdom
// Synthetic ids for a fixture account; no backend is contacted.
import { createElement, type ReactNode } from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const addToCart = vi.hoisted(() => vi.fn());
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
  loadCart: async () => [],
  CartKeptError: class extends Error {},
}));
vi.mock("@/features/cart/components/CustomerFloatingCart", () => ({
  CustomerFloatingCart: () => null,
}));

import WishlistPage from "@/features/favorites/screens/Wishlist";

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

beforeEach(() => {
  addToCart.mockReset();
  navigate.mockReset();
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
    const bell = await screen.findByRole("button", { name: "Cooking alerts from Asha's kitchen" });
    expect(bell.getAttribute("aria-pressed")).toBe("false");
    expect(
      screen
        .getAllByRole("listitem")
        .filter((item) => item.textContent?.includes("Kondapur, Hyderabad")),
    ).toHaveLength(1);
    expect(screen.getByRole("link", { name: /Asha's kitchen/ }).getAttribute("href")).toBe(
      `/kitchen/${KITCHEN}`,
    );

    fireEvent.click(bell);
    await waitFor(() => expect(bell.getAttribute("aria-pressed")).toBe("true"));
    expect(
      fetch.mock.calls
        .filter(([, init]) => init?.method === "PUT")
        .map(([url, init]) => [url, init?.body]),
    ).toEqual([
      [`/api/customer/favorite-watches/KITCHEN/${KITCHEN}`, JSON.stringify({ enabled: true })],
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Remove Asha's kitchen from saved" }));
    expect(await screen.findByText("No saved home chefs yet")).toBeTruthy();
    expect(
      fetch.mock.calls
        .filter(([, init]) => init?.method === "DELETE")
        .map(([url]) => url)
        .sort(),
    ).toEqual([
      `/api/customer/favorite-chefs/${CHEF}`,
      `/api/customer/favorite-kitchens/${KITCHEN}`,
    ]);
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
