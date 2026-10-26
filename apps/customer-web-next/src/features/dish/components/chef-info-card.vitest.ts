// @vitest-environment jsdom
// Synthetic kitchen, menu and photo URLs; the BFF is stubbed.
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: ReactNode }) => createElement("a", { href: "/kitchen" }, children),
}));

import { ChefInfoCard } from "@/features/dish/components/ChefInfoCard";

const KITCHEN = "4b1c0000-0000-4000-8000-000000000001";
const card = (kitchenDescription?: string, menuDishCount: number | null = null) =>
  render(createElement(ChefInfoCard, { chefId: KITCHEN, chefName: "Ammi's Dastarkhwan", rating: 0, distanceMeters: 3_400, kitchenDescription, menuDishCount }));

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("shows the chef face, the kitchen's own words and how many dishes it has", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ id: KITCHEN, kitchenName: "Ammi's Dastarkhwan", status: "ACTIVE", description: "Profile bio", chefPhotoUrl: "https://img.craves.test/chef.webp", kitchenPhotoUrls: [] })));
  const { container } = card("Dish page bio", 2);
  expect(screen.getByText("Prepared by")).toBeTruthy();
  expect(screen.getByText("“Dish page bio”")).toBeTruthy();
  expect(screen.getByText("2 dishes on the menu")).toBeTruthy();
  await waitFor(() => expect(container.querySelector('img[src="https://img.craves.test/chef.webp"]')).toBeTruthy());
});

it("falls back to the profile bio, and leaves the count out while the menu isn't known", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ id: KITCHEN, kitchenName: "Ammi's Dastarkhwan", status: "ACTIVE", description: "Profile bio", chefPhotoUrl: null, kitchenPhotoUrls: [] })));
  card();
  await waitFor(() => expect(screen.getByText("“Profile bio”")).toBeTruthy());
  expect(screen.queryByText(/on the menu/)).toBeNull();
  expect(screen.getByText("3.4 km away")).toBeTruthy();
});
