// @vitest-environment jsdom
// Synthetic kitchen and photo URLs; nothing is fetched.
import { createElement, type ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => createElement("a", { href: to }, children),
}));

import { KitchensGrid } from "@/features/home/components/KitchensGrid";

const kitchen = {
  id: "4b1c0000-0000-4000-8000-000000000001", kitchenName: "Ammi's Dastarkhwan", displayName: null, description: null,
  areaName: "Tolichowki", city: "Hyderabad", state: "Telangana", distanceMeters: 3400, activeMenuItemCount: 4, chefPhotoUrl: null, kitchenPhotoUrls: [],
};
const [a, b] = ["https://img.craves.test/a.webp", "https://img.craves.test/b.webp"];
const dish = (img: string, price: number, prepMinutes?: number) => ({ kitchenId: kitchen.id, img, price, prepMinutes });
const grid = (props: Partial<Parameters<typeof KitchensGrid>[0]> = {}) => render(createElement(KitchensGrid, {
  kitchens: [kitchen], searchTerm: "", state: "ready", message: "",
  onSelectKitchen: () => {}, onRetry: () => {}, onManageAddress: () => {}, dishes: [], ...props,
}));

// The heart reads the saved kitchens once; signed-out here, so the list is empty.
beforeEach(() => { vi.stubGlobal("fetch", vi.fn(async () => Response.json({ items: [], nextCursor: null }))); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("drops a kitchen photo that fails to load instead of showing a broken image", () => {
  const { container } = grid({ dishes: [dish(a, 200), dish(b, 180)] });
  const photos = () => [...container.querySelectorAll("article [role=button] .aspect-\\[16\\/9\\] img")].map((img) => img.getAttribute("src"));

  // Two photos plus the copy of the first that lets the slideshow loop.
  expect(photos()).toEqual([a, b, a]);
  fireEvent.error(container.querySelector(`article img[src="${b}"]`)!);
  expect(photos()).toEqual([a]);
  // With no photo left the card shows its chef-hat tile, not an empty or broken frame.
  fireEvent.error(container.querySelector(`article img[src="${a}"]`)!);
  expect(photos()).toEqual([]);
  expect(container.querySelector("article .aspect-\\[16\\/9\\] > svg")).toBeTruthy();
});

it("Home cards show the chef face, a heart, prep time, the bio and the cheapest dish", () => {
  const onSelectKitchen = vi.fn();
  const { container } = grid({ kitchens: [{ ...kitchen, chefPhotoUrl: "https://img.craves.test/chef.webp" }], dishes: [dish(a, 240, 40), dish(b, 120.5, 15)], onSelectKitchen });
  expect(container.querySelector('img[src="https://img.craves.test/chef.webp"]')).toBeTruthy();
  expect(screen.getByRole("button", { name: "Save Ammi's Dastarkhwan" })).toBeTruthy();
  expect(screen.getByText("15–40 min")).toBeTruthy();
  expect(screen.getByText("Home-cooked meals prepared with care.")).toBeTruthy();
  expect(screen.getByText("Starts from ₹120.50")).toBeTruthy();
  // The heart is beside the card button, not inside it: saving never opens the kitchen.
  fireEvent.click(screen.getByRole("button", { name: "Save Ammi's Dastarkhwan" }));
  expect(onSelectKitchen).not.toHaveBeenCalled();
  fireEvent.keyDown(screen.getByRole("button", { name: "Open Ammi's Dastarkhwan" }), { key: "Enter" });
  expect(onSelectKitchen).toHaveBeenCalledWith(expect.objectContaining({ id: kitchen.id }));
});

it("a kitchen with no loaded dishes keeps its card, without a price", () => {
  grid({ kitchens: [{ ...kitchen, description: "Hyderabadi home food" }] });
  expect(screen.getByText("Hyderabadi home food")).toBeTruthy();
  expect(screen.queryByText(/Starts from/)).toBeNull();
});
