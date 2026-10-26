// @vitest-environment jsdom
// Synthetic kitchen, menu and address; the APIs are mocked, nothing is fetched.
import { cleanup, render, screen } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const KITCHEN = "4b1c0000-0000-4000-8000-000000000001";
const api = vi.hoisted(() => ({ discoverKitchens: vi.fn(), loadKitchenMenu: vi.fn(), getKitchenProfile: vi.fn() }));
// Stable like the router's own navigate, so the page's load effect runs once.
const navigate = vi.hoisted(() => vi.fn());
vi.mock("@tanstack/react-router", () => ({
  getRouteApi: () => ({ useParams: () => ({ id: "4b1c0000-0000-4000-8000-000000000001" }) }),
  useNavigate: () => navigate,
  Link: ({ children, to, params, ...props }: { children: ReactNode; to: string; params?: { id: string } }) =>
    createElement("a", { href: params ? to.replace("$id", params.id) : to, ...props }, children),
}));
vi.mock("@/features/auth/api/cravesAuth", () => ({
  loadSession: async () => ({ id: "11111111-1111-4111-8111-111111111111" }),
  loadSelectedAddress: async () => ({ hno: "4-1", city: "Hyderabad", mandal: "Kondapur", district: "", lat: 17.46, lng: 78.36 }),
}));
vi.mock("@/features/chefs/api/kitchens", () => ({ discoverKitchens: api.discoverKitchens }));
vi.mock("@/features/dish/api/dishes", () => ({ loadKitchenMenu: api.loadKitchenMenu }));
vi.mock("@/shared/lib/kitchen-profile-client", () => ({ getKitchenProfile: api.getKitchenProfile }));
vi.mock("@/features/dish/api/reviews", () => ({ loadKitchenReviewSummary: async () => null }));
vi.mock("@/features/customer-shell/components/DetailBrowseHeader", () => ({ DetailBrowseHeader: () => null }));
vi.mock("@/features/cart/components/CustomerFloatingCart", () => ({
  CustomerFloatingCart: () => null,
  useCustomerCartSummary: () => ({ itemCount: 0, total: 0, currency: "INR" }),
  useCartLine: () => undefined,
}));

import ChefProfilePage from "@/features/chefs/screens/ChefProfile";

const profile = {
  id: KITCHEN, kitchenName: "Ammi's Dastarkhwan", displayName: null, description: null, areaName: "Tolichowki",
  city: "Hyderabad", state: "Telangana", status: "ACTIVE", createdAt: null, chefPhotoUrl: null, kitchenPhotoUrls: [],
};
const biryani = {
  id: "11111111-2222-4333-8444-555555555555", kitchenId: KITCHEN, name: "Mutton biryani", chef: "Ammi's Dastarkhwan", category: "Biryani",
  price: 240, currency: "INR", img: "/brand/craves-logo.svg", imageIsPlaceholder: true, time: "40 min", prepMinutes: 40, veg: false, foodType: "NON_VEG", desc: "",
};
const nearby = (ids: string[], hasNext = false) => ({ kitchens: ids.map((id) => ({ id })), radiusMeters: 10_000, hasNext, totalElements: ids.length });

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ items: [], nextCursor: null })));
  HTMLElement.prototype.scrollTo = vi.fn();
  api.getKitchenProfile.mockResolvedValue(profile);
  api.loadKitchenMenu.mockResolvedValue([biryani]);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  delete (HTMLElement.prototype as Partial<HTMLElement>).scrollTo;
});

describe("Kitchen page", () => {
  it("opens a kitchen beyond 10 km by its id, says it doesn't deliver here and leaves Add out", async () => {
    api.discoverKitchens.mockResolvedValue(nearby(["4b1c0000-0000-4000-8000-000000000002"]));
    render(createElement(ChefProfilePage));
    expect(await screen.findByRole("heading", { level: 1, name: "Ammi's Dastarkhwan" })).toBeTruthy();
    expect(screen.getByText("This kitchen doesn't deliver to Kondapur yet")).toBeTruthy();
    expect(screen.getByText("Mutton biryani")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Add Mutton biryani to cart" })).toBeNull();
    // Read without adding the far kitchen's dishes to the nearby ones Home lists.
    expect(api.loadKitchenMenu).toHaveBeenCalledWith(KITCHEN, { remember: false });
  });

  it("offers Add when the kitchen is within reach, and when that can't be told", async () => {
    api.discoverKitchens.mockResolvedValue(nearby([KITCHEN]));
    render(createElement(ChefProfilePage));
    expect(await screen.findByRole("button", { name: "Add Mutton biryani to cart" })).toBeTruthy();
    expect(screen.queryByText(/doesn't deliver/)).toBeNull();
    cleanup();

    // Past the 50 nearest kitchens the answer is unknown: checkout checks again, so Add stays.
    api.discoverKitchens.mockResolvedValue(nearby(["4b1c0000-0000-4000-8000-000000000002"], true));
    render(createElement(ChefProfilePage));
    expect(await screen.findByRole("button", { name: "Add Mutton biryani to cart" })).toBeTruthy();
  });

  it("shows No dishes right now with the way to other home chefs and to save the kitchen", async () => {
    api.discoverKitchens.mockResolvedValue(nearby([KITCHEN]));
    api.loadKitchenMenu.mockResolvedValue([]);
    render(createElement(ChefProfilePage));
    expect(await screen.findByRole("heading", { name: "No dishes right now" })).toBeTruthy();
    expect(screen.getByText("Ammi's Dastarkhwan hasn't put up today's dishes yet. Save this kitchen to find it again, or see other home chefs.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "See other home chefs" }).getAttribute("href")).toBe("/chefs");
    expect(screen.getByRole("button", { name: "Save this kitchen" })).toBeTruthy();
  });

  it("says plainly when the kitchen isn't on Craves", async () => {
    api.discoverKitchens.mockResolvedValue(nearby([]));
    api.getKitchenProfile.mockResolvedValue(null);
    api.loadKitchenMenu.mockRejectedValue(new Error("KITCHEN_NOT_FOUND"));
    render(createElement(ChefProfilePage));
    expect(await screen.findByRole("heading", { level: 1, name: "This kitchen isn't on Craves right now" })).toBeTruthy();
  });
});
