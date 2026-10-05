// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement, type ReactNode } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import WishlistPage from "../screens/Wishlist/Wishlist";
import TrackingPage from "../screens/OrderTracking/OrderTracking";
import AllChefsPage from "../screens/public/AllChefs/AllChefs";
import { getSession, setSessionIdentity } from "../services/auth/cravesAuth";
import { loadCustomerFavoriteIds } from "../services/api/customerFavorites";
import { discoverKitchens } from "../services/api/kitchens";
import { discoverDishes, loadDish, type Dish } from "../services/api/dishes";
import type { CravesIdentity } from "./auth-contract";
import type { NearbyKitchen } from "./discovery-contract";

const fixtures = vi.hoisted(() => ({ navigate: vi.fn(), id: "33333333-3333-4333-8333-333333333333" }));
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => fixtures.navigate,
  getRouteApi: () => ({ useSearch: () => ({ id: fixtures.id }) }),
  Link: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("../components/navigation/AutoHideCustomerHeader", () => ({ AutoHideCustomerHeader: ({ children }: { children: ReactNode }) => children }));
vi.mock("../components/cart/CustomerFloatingCart", () => ({ CustomerFloatingCart: () => null }));
vi.mock("../components/home/BrowseHeader", () => ({ BrowseHeader: () => null }));
vi.mock("../components/home/CustomerSignOutDialog", () => ({ CustomerSignOutDialog: () => null }));
vi.mock("../components/home/KitchensGrid", () => ({ KitchensGrid: ({ kitchens, state, message }: { kitchens: NearbyKitchen[]; state: string; message: string }) => createElement("section", null, state, message, kitchens.map(kitchen => createElement("p", { key: kitchen.id }, kitchen.kitchenName))) }));
vi.mock("../services/api/cravesCart", () => ({ loadCart: vi.fn(async () => undefined), cartCount: () => 0, subscribeCart: () => () => undefined, addToCart: vi.fn() }));
vi.mock("../services/api/customerFavorites", () => ({ loadCustomerFavoriteIds: vi.fn(), removeCustomerFavorite: vi.fn() }));
vi.mock("../services/api/dishes", () => ({ loadDish: vi.fn(), discoverDishes: vi.fn() }));
vi.mock("../services/api/kitchens", () => ({ discoverKitchens: vi.fn() }));

const a: CravesIdentity = { id: "11111111-1111-4111-8111-111111111111", phoneNumber: "+10000000000", displayName: "Fixture A", email: "a@example.invalid", emailVerified: true, status: "ACTIVE", roles: ["CUSTOMER"] };
const b: CravesIdentity = { ...a, id: "22222222-2222-4222-8222-222222222222", displayName: "Fixture B" };
let identity: CravesIdentity;
let authenticationFails: boolean;
let fetcher: ReturnType<typeof vi.fn<typeof fetch>>;
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
function dish(name: string): Dish { return { id: a.id, name, chef: "Fixture chef", category: "Food", img: "/fixture.png", price: 10, rating: 0, time: "20 minutes", veg: true, desc: "Fixture" }; }
function kitchen(name: string): NearbyKitchen { return { id: a.id, kitchenName: name, displayName: null, description: null, areaName: null, city: "Fixture", state: "Fixture", distanceMeters: 10, activeMenuItemCount: 1 }; }
function order(name: string) { return { id: fixtures.id, checkoutId: a.id, kitchenId: a.id, kitchenName: name, status: "PAID", currency: "INR", foodSubtotal: 10, platformFee: 0, taxAmount: 0, deliveryFee: 0, grandTotal: 10, items: [], createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z" }; }
async function normal(input: RequestInfo | URL): Promise<Response> {
  const url = String(input);
  if (url === "/api/auth/me") {
    if (authenticationFails) throw new Error("Account verification is temporarily unavailable.");
    return Response.json(identity);
  }
  // Optional display profile is deliberately slow: primary content must still load.
  if (url === "/api/customer/profile") return new Promise(() => undefined);
  if (url === "/api/customer/addresses") return Response.json([{ id: identity.id, isDefault: true, active: true, recipientName: "Fixture", contactPhoneNumber: "+10000000000", addressLabel: "HOME", addressLine1: "Fixture address", areaName: "Fixture area", postalCode: "500001", city: "Fixture", state: "Fixture", latitude: 17, longitude: 78 }]);
  if (url.endsWith("/delivery-status")) return Response.json({}, { status: 404 });
  if (url === `/api/orders/${fixtures.id}`) return Response.json(order(identity.displayName ?? "Fixture"));
  throw new Error(`Unexpected fixture route: ${url}`);
}
beforeEach(() => {
  identity = a; authenticationFails = false; setSessionIdentity(a); fixtures.navigate.mockReset();
  fetcher = vi.fn<typeof fetch>(normal); vi.stubGlobal("fetch", fetcher);
  vi.mocked(loadCustomerFavoriteIds).mockReset().mockResolvedValue(new Set());
  vi.mocked(loadDish).mockReset().mockResolvedValue(dish("Fixture dish"));
  vi.mocked(discoverKitchens).mockReset().mockResolvedValue({ kitchens: [kitchen("Fixture kitchen")], radiusMeters: 50_000 });
  vi.mocked(discoverDishes).mockReset().mockResolvedValue([]);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("protected customer page startup", () => {
  it.each([
    ["saved dishes", WishlistPage, "No saved dishes yet"],
    ["tracking", TrackingPage, "Fixture A"],
    ["home chefs", AllChefsPage, "Fixture kitchen"],
  ])("loads %s while the optional display profile remains pending", async (_name, Page, expected) => {
    render(createElement(Page));
    await screen.findByText(expected);
    expect(fetcher.mock.calls.some(([url]) => url === "/api/customer/profile")).toBe(true);
  });

  it.each([
    ["saved dishes", WishlistPage, "Try again", "No saved dishes yet"],
    ["tracking", TrackingPage, "Retry", "Fixture A"],
    ["home chefs", AllChefsPage, "Try again", "Fixture kitchen"],
  ])("shows an account error on %s and rechecks identity before retrying", async (_name, Page, retryLabel, expected) => {
    authenticationFails = true;
    render(createElement(Page));
    await screen.findByText("Account verification is temporarily unavailable.");
    expect(vi.mocked(loadCustomerFavoriteIds)).not.toHaveBeenCalled();
    expect(vi.mocked(discoverKitchens)).not.toHaveBeenCalled();
    expect(fetcher.mock.calls.some(([url]) => String(url).startsWith("/api/orders/"))).toBe(false);
    authenticationFails = false;
    fireEvent.click(screen.getByRole("button", { name: retryLabel }));
    await screen.findByText(expected);
    expect(fetcher.mock.calls.filter(([url]) => url === "/api/auth/me")).toHaveLength(2);
  });

  it("keeps discovery behind the delivery-address gate", async () => {
    const address = deferred<Response>();
    fetcher.mockImplementation(input => String(input) === "/api/customer/addresses" ? address.promise : normal(input));
    render(createElement(AllChefsPage));
    await waitFor(() => expect(fetcher.mock.calls.some(([url]) => url === "/api/customer/addresses")).toBe(true));
    expect(discoverKitchens).not.toHaveBeenCalled();
    expect(discoverDishes).not.toHaveBeenCalled();
    await act(async () => address.resolve(Response.json([])));
    await screen.findByText(/Choose a default delivery address/);
    expect(discoverKitchens).not.toHaveBeenCalled();
  });

  it("discards a saved-dish response after a fresh same-owner session replaces it", async () => {
    const late = deferred<Set<string>>();
    vi.mocked(loadCustomerFavoriteIds).mockReturnValueOnce(late.promise);
    render(createElement(WishlistPage));
    await waitFor(() => expect(loadCustomerFavoriteIds).toHaveBeenCalledTimes(1));
    act(() => setSessionIdentity(a));
    await screen.findByText("No saved dishes yet");
    await act(async () => late.resolve(new Set([a.id])));
    expect(screen.queryByText("Fixture dish")).toBeNull();
  });

  it("discards tracking responses after an owner change", async () => {
    const late = deferred<Response>();
    let delayed = true;
    fetcher.mockImplementation(input => String(input) === `/api/orders/${fixtures.id}` && delayed ? late.promise : normal(input));
    render(createElement(TrackingPage));
    await waitFor(() => expect(fetcher.mock.calls.some(([url]) => url === `/api/orders/${fixtures.id}`)).toBe(true));
    delayed = false; identity = b;
    act(() => setSessionIdentity(b));
    await screen.findByText("Fixture B");
    await act(async () => late.resolve(Response.json(order("Fixture A"))));
    expect(screen.queryByText("Fixture A")).toBeNull();
    expect(getSession()?.id).toBe(b.id);
  });

  it("ignores old address discovery after another customer signs in", async () => {
    const late = deferred<Response>();
    let delayed = true;
    fetcher.mockImplementation(input => String(input) === "/api/customer/addresses" && delayed ? late.promise : normal(input));
    render(createElement(AllChefsPage));
    await waitFor(() => expect(fetcher.mock.calls.some(([url]) => url === "/api/customer/addresses")).toBe(true));
    delayed = false; identity = b;
    act(() => setSessionIdentity(b));
    await screen.findByText("Fixture kitchen");
    await act(async () => late.resolve(Response.json([])));
    expect(screen.queryByText(/Choose a default delivery address/)).toBeNull();
    expect(discoverKitchens).toHaveBeenCalledTimes(1);
    expect(discoverKitchens).toHaveBeenCalledWith(17, 78, 50_000);
  });

  it("discards kitchen results after a fresh same-owner session replaces them", async () => {
    const late = deferred<{ kitchens: NearbyKitchen[]; radiusMeters: number }>();
    vi.mocked(discoverKitchens).mockReturnValueOnce(late.promise);
    render(createElement(AllChefsPage));
    await waitFor(() => expect(discoverKitchens).toHaveBeenCalledTimes(1));
    act(() => setSessionIdentity(a));
    await screen.findByText("Fixture kitchen");
    await act(async () => late.resolve({ kitchens: [kitchen("Old private location kitchen")], radiusMeters: 50_000 }));
    expect(screen.queryByText("Old private location kitchen")).toBeNull();
  });
});
