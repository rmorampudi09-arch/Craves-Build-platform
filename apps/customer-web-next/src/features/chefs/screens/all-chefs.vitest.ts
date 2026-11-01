// @vitest-environment jsdom
// Synthetic kitchens and address; the APIs are mocked, nothing is fetched.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ discoverKitchens: vi.fn(), loadKitchenPage: vi.fn() }));
vi.mock("@/features/chefs/api/kitchens", () => api);
// Stable like the router's own navigate, so the page's load effect runs once.
const navigate = vi.hoisted(() => vi.fn());
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => navigate }));
vi.mock("@/features/auth/api/cravesAuth", () => ({
  loadSession: async () => ({ id: "11111111-1111-4111-8111-111111111111" }),
  loadSelectedAddress: async () => ({ hno: "4-1", city: "Hyderabad", mandal: "Kondapur", district: "", lat: 17.46, lng: 78.36 }),
  clearSession: async () => undefined,
}));
vi.mock("@/features/cart/api/cravesCart", () => ({ cartCount: () => 0, loadCart: async () => [], subscribeCart: () => () => undefined }));
vi.mock("@/features/cart/components/CustomerFloatingCart", () => ({ CustomerFloatingCart: () => null }));
vi.mock("@/features/dish/api/dishes", () => ({ discoverDishes: async () => [] }));
vi.mock("@/features/chefs/components/KitchenFilterBar", () => ({ KitchenFilterBar: () => null }));
vi.mock("@/features/home/components/CustomerSignOutDialog", () => ({ CustomerSignOutDialog: () => null }));
vi.mock("@/features/home/components/BrowseHeader", () => ({
  BrowseHeader: ({ searchTerm, onSearchTermChange, searchPlaceholder }: { searchTerm: string; onSearchTermChange: (value: string) => void; searchPlaceholder: string }) =>
    createElement("input", { value: searchTerm, placeholder: searchPlaceholder, onChange: (event: { target: { value: string } }) => onSearchTermChange(event.target.value) }),
}));
vi.mock("@/features/home/components/KitchensGrid", () => ({
  KitchensGrid: ({ kitchens }: { kitchens: { id: string; kitchenName: string }[] }) =>
    createElement("ul", null, kitchens.map((kitchen) => createElement("li", { key: kitchen.id }, kitchen.kitchenName))),
}));

import AllChefsPage from "@/features/chefs/screens/AllChefs";

const kitchen = (n: number, kitchenName: string) => ({
  id: `4a000000-0000-4000-8000-00000000000${n}`, kitchenName, displayName: null, description: null, areaName: "Kondapur",
  city: "Hyderabad", state: "Telangana", distanceMeters: 900 * n, activeMenuItemCount: 2, chefPhotoUrl: null, kitchenPhotoUrls: [],
});

beforeEach(() => {
  api.discoverKitchens.mockReset();
  api.loadKitchenPage.mockReset();
});
afterEach(cleanup);

describe("Chefs tab", () => {
  it("titles the page like the app and shows the next page of kitchens on Show more", async () => {
    api.discoverKitchens.mockResolvedValue({ kitchens: [kitchen(1, "Asha's Kitchen")], radiusMeters: 10_000, hasNext: true, totalElements: 2 });
    api.loadKitchenPage.mockResolvedValue({ kitchens: [kitchen(2, "Biryani House")], hasNext: false, totalElements: 2 });
    render(createElement(AllChefsPage));

    expect(await screen.findByRole("heading", { level: 1, name: "Discover home chefs" })).toBeTruthy();
    expect(screen.getByPlaceholderText("Search chefs, kitchens or area")).toBeTruthy();
    fireEvent.click(await screen.findByRole("button", { name: "Show 1 more home chefs" }));
    expect(await screen.findByText("Biryani House")).toBeTruthy();
    expect(api.loadKitchenPage).toHaveBeenCalledWith(17.46, 78.36, 10_000, 1, undefined);
    expect(screen.getByText("Asha's Kitchen")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Show/ })).toBeNull();
  });

  it("says no kitchen matches a search, and clears it", async () => {
    api.discoverKitchens.mockResolvedValue({ kitchens: [kitchen(1, "Asha's Kitchen")], radiusMeters: 10_000, hasNext: false, totalElements: 1 });
    render(createElement(AllChefsPage));
    fireEvent.change(await screen.findByPlaceholderText("Search chefs, kitchens or area"), { target: { value: "dosa" } });
    expect(await screen.findByRole("heading", { name: "No matching kitchens" })).toBeTruthy();
    expect(screen.getByText("Try another chef, kitchen name or area.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(await screen.findByText("Asha's Kitchen")).toBeTruthy();
  });

  it("shows Coming soon for the area when no home chef cooks near the address", async () => {
    api.discoverKitchens.mockResolvedValue({ kitchens: [], radiusMeters: 10_000, hasNext: false, totalElements: 0 });
    render(createElement(AllChefsPage));
    expect(await screen.findByRole("heading", { name: "Coming soon to Kondapur" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Change delivery address" })).toBeTruthy();
  });
});
