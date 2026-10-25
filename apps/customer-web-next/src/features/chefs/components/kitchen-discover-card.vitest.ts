// @vitest-environment jsdom
// Synthetic kitchen and photo URLs; nothing is fetched.
import { createElement } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { KitchenDiscoverCard } from "@/features/chefs/components/KitchenDiscoverCard";

const kitchen = {
  id: "4b1c0000-0000-4000-8000-000000000001", kitchenName: "Ammi's Dastarkhwan", displayName: null, description: "Hyderabadi home food",
  areaName: "Tolichowki", city: "Hyderabad", state: "Telangana", distanceMeters: 3400, activeMenuItemCount: 1, chefPhotoUrl: null, kitchenPhotoUrls: [] as string[],
};
const url = (name: string) => `https://img.craves.test/${name}.webp`;
const photos = (container: HTMLElement) => [...container.querySelectorAll("img")].map((img) => img.getAttribute("src"));

beforeEach(() => { vi.stubGlobal("fetch", vi.fn(async () => Response.json({ items: [], nextCursor: null }))); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("shows kitchen photos first, then dish photos, each once, three of them with +N for the rest", () => {
  const summary = { imageUrls: [url("k2"), url("d1"), url("d2")], preparationTimeLabel: "20–45 min", startingPriceLabel: "₹90" };
  const { container } = render(createElement(KitchenDiscoverCard, { kitchen: { ...kitchen, kitchenPhotoUrls: [url("k1"), url("k2")] }, summary, onOpen: () => {} }));
  expect(photos(container)).toEqual([url("k1"), url("k2"), url("d1")]);
  expect(screen.getByText("+1")).toBeTruthy();
  expect(screen.getByText("20–45 min · 1 dish")).toBeTruthy();
  expect(screen.getByText("From ₹90")).toBeTruthy();
  expect(screen.getByText("Tolichowki · 3.4 km away")).toBeTruthy();
  // A photo that fails steps aside; the next one moves up and the count drops.
  fireEvent.error(container.querySelector(`img[src="${url("k2")}"]`)!);
  expect(photos(container)).toEqual([url("k1"), url("d1"), url("d2")]);
  expect(screen.queryByText(/^\+/)).toBeNull();
});

it("without photos shows the bio; opening and saving are separate buttons", () => {
  const onOpen = vi.fn();
  const { container } = render(createElement(KitchenDiscoverCard, { kitchen, summary: undefined, onOpen }));
  expect(photos(container)).toEqual([]);
  expect(screen.getByText("Hyderabadi home food")).toBeTruthy();
  expect(screen.queryByText(/^From/)).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Save Ammi's Dastarkhwan" }));
  expect(onOpen).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "View Ammi's Dastarkhwan kitchen" }));
  expect(onOpen).toHaveBeenCalledOnce();
});
