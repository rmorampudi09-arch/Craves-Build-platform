// @vitest-environment jsdom
// Synthetic dishes, kitchen and address; the APIs are mocked, nothing is fetched.
import { cleanup, render, screen } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const KITCHEN = "4b1c0000-0000-4000-8000-000000000001";
const DISH = "11111111-2222-4333-8444-555555555501";
const api = vi.hoisted(() => ({ discoverDishes: vi.fn(), loadDish: vi.fn(), loadKitchenMenu: vi.fn(), hasMoreDiscoveredDishes: vi.fn(() => false) }));
// Stable like the router's own navigate, so the page's load effect runs once.
const navigate = vi.hoisted(() => vi.fn());
vi.mock("@tanstack/react-router", () => ({
  getRouteApi: () => ({ useParams: () => ({ id: "11111111-2222-4333-8444-555555555501" }) }),
  useNavigate: () => navigate,
  Link: ({ children, to, params, ...props }: { children: ReactNode; to: string; params?: { id: string } }) =>
    createElement("a", { href: params ? to.replace("$id", params.id) : to, ...props }, children),
}));
vi.mock("@/features/auth/api/cravesAuth", () => ({
  loadSession: async () => ({ id: "11111111-1111-4111-8111-111111111111" }),
  loadSelectedAddress: async () => ({ hno: "4-1", city: "Hyderabad", mandal: "Kondapur", district: "", lat: 17.46, lng: 78.36 }),
}));
vi.mock("@/features/dish/api/dishes", () => ({ ...api, getDish: () => undefined }));
vi.mock("@/features/dish/api/reviews", () => ({ loadKitchenReviewSummary: async () => null }));
vi.mock("@/features/customer-shell/components/DetailBrowseHeader", () => ({ DetailBrowseHeader: () => null }));
vi.mock("@/features/dish/components/DishImageHeader", () => ({ DishImageHeader: () => null }));
vi.mock("@/features/cart/components/CustomerFloatingCart", () => ({
  CustomerFloatingCart: () => null,
  useCustomerCartSummary: () => ({ itemCount: 0, total: 0, currency: "INR" }),
  useCartLine: () => undefined,
}));

import DishDetailPage from "@/features/dish/screens/FoodDetails";

const dish = (id: string, name: string, extra: object = {}) => ({
  id, kitchenId: KITCHEN, name, chef: "Ammi's Dastarkhwan", category: "Biryani", img: "/brand/craves-logo.svg", imageIsPlaceholder: true,
  detailsLoaded: true, price: 320, currency: "INR", rating: 0, time: "45 min", prepMinutes: 45, veg: false, foodType: "NON_VEG", desc: "Slow-cooked.", ...extra,
});

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ items: [], nextCursor: null })));
  api.loadDish.mockResolvedValue(dish(DISH, "Mutton dum biryani", { packGrams: 250, thermobox: true }));
  api.loadKitchenMenu.mockResolvedValue([dish(DISH, "Mutton dum biryani"), dish("11111111-2222-4333-8444-555555555502", "Chicken 65")]);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Dish page", () => {
  it("opens a dish beyond 10 km by its id, says its kitchen doesn't deliver here and leaves Add out", async () => {
    api.discoverDishes.mockResolvedValue([]);
    render(createElement(DishDetailPage));
    expect(await screen.findByRole("heading", { level: 1, name: "Mutton dum biryani" })).toBeTruthy();
    expect(screen.getByText("This kitchen doesn't deliver to Kondapur yet")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Add to cart/ })).toBeNull();
  });

  it("shows More from this kitchen (never the dish itself), the pack weight and the thermobox note", async () => {
    api.discoverDishes.mockResolvedValue([dish(DISH, "Mutton dum biryani", { distanceMeters: 1200 })]);
    render(createElement(DishDetailPage));
    expect(await screen.findByRole("heading", { name: "More from this kitchen" })).toBeTruthy();
    expect(screen.getByText("Chicken 65")).toBeTruthy();
    expect(screen.getAllByText("Mutton dum biryani")).toHaveLength(1);
    expect(screen.getByText("250 g")).toBeTruthy();
    expect(screen.getByText("Packed in a thermobox so it reaches you hot.")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /Add to cart/ }).length).toBeGreaterThan(0);
    expect(api.loadKitchenMenu).toHaveBeenCalledWith(KITCHEN, { remember: false });
  });
});
