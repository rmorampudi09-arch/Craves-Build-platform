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
const item = (id: string) => ({ id, kitchenId: KITCHEN, kitchenName: "Ammi's Dastarkhwan", itemName: "Biryani", category: "Biryani", foodType: "NON_VEG", price: 240, currency: "INR", imageUrls: [] });

function serve(menu: unknown, status = 200) {
  const fetch = vi.fn(async (url: string) => url.endsWith("/menu-items")
    ? Response.json(menu, { status })
    : Response.json({ id: KITCHEN, kitchenName: "Ammi's Dastarkhwan", status: "ACTIVE", description: "Profile bio", chefPhotoUrl: "https://img.craves.test/chef.webp", kitchenPhotoUrls: [] }));
  vi.stubGlobal("fetch", fetch);
  return fetch;
}
const card = (kitchenDescription?: string) => render(createElement(ChefInfoCard, { chefId: KITCHEN, chefName: "Ammi's Dastarkhwan", rating: 0, distanceMeters: 3_400, kitchenDescription }));

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("shows the chef face, the kitchen's own words and how many dishes it has", async () => {
  const fetch = serve([item("11111111-1111-4111-8111-111111111111"), item("22222222-2222-4222-8222-222222222222")]);
  const { container } = card("Dish page bio");
  expect(screen.getByText("Prepared by")).toBeTruthy();
  expect(screen.getByText("“Dish page bio”")).toBeTruthy();
  await waitFor(() => expect(screen.getByText("2 dishes on the menu")).toBeTruthy());
  await waitFor(() => expect(container.querySelector('img[src="https://img.craves.test/chef.webp"]')).toBeTruthy());
  expect(fetch).toHaveBeenCalledWith(`/api/catalog/kitchens/${KITCHEN}/menu-items`, expect.anything());
});

it("falls back to the profile bio, and leaves the count out when the menu can't be read", async () => {
  serve({ message: "down" }, 503);
  card();
  await waitFor(() => expect(screen.getByText("“Profile bio”")).toBeTruthy());
  expect(screen.queryByText(/on the menu/)).toBeNull();
  expect(screen.getByText("3.4 km away")).toBeTruthy();
});
