// @vitest-environment jsdom
// Synthetic dishes and kitchens; the catalog is a mocked fetch.
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, params }: { children: ReactNode; to: string; params?: { id: string } }) =>
    createElement("a", { href: to.replace("$id", params?.id ?? "") }, children),
}));
vi.mock("@/shared/ui/overlays/overlay", () => ({ useOverlayHistory: () => undefined }));
vi.mock("@/shared/components/media/ProgressiveImage", () => ({ ProgressiveImage: () => null }));

import { HomeSearchOverlay } from "@/features/home/components/HomeSearchOverlay";

const KITCHEN_ID = "4b1c0000-0000-4000-8000-000000000001";
const loadedDish = {
  id: "7d1c0000-0000-4000-8000-000000000001", name: "Chicken Biryani", chef: "Ammi's Dastarkhwan", category: "Biryani",
  img: "https://img.craves.test/a.webp", price: 240, currency: "INR", desc: "", distanceMeters: 1_200, foodType: "NON_VEG" as const, veg: false,
};
const kitchen = {
  id: KITCHEN_ID, kitchenName: "Ammi's Dastarkhwan", displayName: "Ammi Begum", description: null, areaName: "Tolichowki",
  city: "Hyderabad", state: "Telangana", distanceMeters: 3_400, activeMenuItemCount: 4, chefPhotoUrl: null, kitchenPhotoUrls: [],
};
const page = { page: 0, size: 50, totalElements: 1, totalPages: 1, hasNext: false };
const serverDish = {
  id: "7d1c0000-0000-4000-8000-000000000002", kitchenId: KITCHEN_ID, kitchenName: "Ammi's Dastarkhwan", kitchenDisplayName: null,
  areaName: "Tolichowki", city: "Hyderabad", state: "Telangana", distanceMeters: 950, itemName: "Mutton Biryani", description: null,
  category: "Biryani", foodType: "NON_VEG", price: 320, currency: "INR", servesCount: null, preparationTimeMinutes: 40, spiceLevel: "SPICY", primaryImageUrl: null,
};
const catalog = vi.fn(async (url: string) =>
  Response.json(url.startsWith("/api/discovery/menu-items")
    ? { latitude: 17.4, longitude: 78.4, radiusMeters: 10_000, page, menuItems: url.includes("biryani") ? [serverDish] : [] }
    : { latitude: 17.4, longitude: 78.4, radiusMeters: 10_000, page, kitchens: [] }),
);

function open(searchTerm: string, props: Partial<Parameters<typeof HomeSearchOverlay>[0]> = {}) {
  const view = render(createElement(HomeSearchOverlay, {
    dishes: [loadedDish], kitchens: [kitchen], searchTerm, foodPreference: "all", latitude: 17.4, longitude: 78.4,
    onSearchTermChange: () => {}, onShowAllFood: () => {}, onClose: () => {}, ...props,
  }));
  return { ...view, retype: (next: string) => view.rerender(createElement(HomeSearchOverlay, {
    dishes: [loadedDish], kitchens: [kitchen], searchTerm: next, foodPreference: "all", latitude: 17.4, longitude: 78.4,
    onSearchTermChange: () => {}, onShowAllFood: () => {}, onClose: () => {}, ...props,
  })) };
}
const settle = async () => {
  await act(async () => { vi.advanceTimersByTime(300); });
  await act(async () => {});
};

beforeEach(() => {
  vi.useFakeTimers();
  catalog.mockClear();
  vi.stubGlobal("fetch", catalog);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("asks for words first, without calling the catalog", async () => {
  open("  ");
  expect(screen.getByRole("heading", { name: "Search nearby food" })).toBeTruthy();
  expect(screen.getByText("Start typing. Matching dishes and kitchens update with every character.")).toBeTruthy();
  await settle();
  expect(catalog).not.toHaveBeenCalled();
});

it("matches loaded dishes with every letter, and kitchens by the chef's name, with distances", async () => {
  open("b");
  expect(screen.getByText("Chicken Biryani")).toBeTruthy();
  expect(screen.getByText("From Ammi's Dastarkhwan · 1.2 km away")).toBeTruthy();
  // One letter stays on the loaded dishes; the catalog is asked from two.
  await settle();
  expect(catalog).not.toHaveBeenCalled();
  cleanup();
  open("begum");
  expect(screen.getByRole("link", { name: /Ammi's Dastarkhwan/ }).getAttribute("href")).toBe(`/kitchen/${KITCHEN_ID}`);
  expect(screen.getByText("Kitchen · 3.4 km away")).toBeTruthy();
});

it("adds the catalog's matches past the loaded pages a moment after typing stops", async () => {
  const { retype } = open("bi");
  retype(" biryani ");
  // Typing on resets the wait: only the last words are sent.
  await settle();
  expect(catalog).toHaveBeenCalledTimes(2);
  expect(catalog.mock.calls.map(([url]) => url)).toEqual([
    "/api/discovery/menu-items?latitude=17.4&longitude=78.4&radiusMeters=10000&page=0&size=50&query=biryani",
    "/api/discovery/kitchens?latitude=17.4&longitude=78.4&radiusMeters=10000&page=0&size=50&query=biryani",
  ]);
  expect(screen.getByText("Chicken Biryani")).toBeTruthy();
  expect(screen.getByRole("link", { name: /Mutton Biryani/ }).getAttribute("href")).toBe(`/dish/${serverDish.id}`);
  expect(screen.getByText("From Ammi's Dastarkhwan · 950 m away")).toBeTruthy();
});

it("keeps the catalog's matches to the chosen food type, and says so beside matching kitchens", async () => {
  open("biryani", { dishes: [], foodPreference: "veg", kitchens: [{ ...kitchen, description: "Biryani every Sunday" }] });
  await settle();
  expect(screen.queryByText("Mutton Biryani")).toBeNull();
  expect(screen.getByText("No veg dishes match “biryani”.")).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Kitchens" })).toBeTruthy();
});

it("says plainly when nothing matches, and offers all food while a food type is on", async () => {
  const onShowAllFood = vi.fn();
  open("paneer tikka", { foodPreference: "veg", onShowAllFood });
  expect(screen.getByRole("status").textContent).toContain("Searching nearby dishes and kitchens");
  await settle();
  expect(screen.getByRole("heading", { name: "No results for “paneer tikka”" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Show all food" }));
  expect(onShowAllFood).toHaveBeenCalledOnce();
  cleanup();
  open("paneer tikka");
  await settle();
  expect(screen.getByText("Try another dish or kitchen name, or check the spelling.")).toBeTruthy();
});
