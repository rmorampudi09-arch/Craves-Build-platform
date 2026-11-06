// @vitest-environment jsdom
// Synthetic kitchen and photo URLs; nothing is fetched.
import { createElement } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { KitchenCard } from "@/features/home/components/KitchensGrid";

const kitchen = {
  id: "4b1c0000-0000-4000-8000-000000000001", kitchenName: "Ammi's Dastarkhwan", displayName: "Ayesha Begum", description: "Hyderabadi home food",
  areaName: "Tolichowki", city: "Hyderabad", state: "Telangana", distanceMeters: 3400, activeMenuItemCount: 1, chefPhotoUrl: null, kitchenPhotoUrls: [] as string[],
};
const url = (name: string) => `https://img.craves.test/${name}.webp`;
const photos = (container: HTMLElement) => [...container.querySelectorAll("img")].map((img) => img.getAttribute("src"));
const card = (props: Partial<Parameters<typeof KitchenCard>[0]> = {}) =>
  render(createElement("ul", null, createElement(KitchenCard, { kitchen, summary: undefined, onOpen: () => {}, ...props })));

beforeEach(() => { vi.stubGlobal("fetch", vi.fn(async () => Response.json({ items: [], nextCursor: null }))); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

it("shows her dishes first, then the kitchen photos, each once, with who cooks, area, distance and price", () => {
  const summary = { imageUrls: [url("d1"), url("k1")], preparationTimeLabel: "20–45 min", startingPriceLabel: "₹90" };
  const { container } = card({ kitchen: { ...kitchen, kitchenPhotoUrls: [url("k1"), url("k2")] }, summary });
  expect(photos(container)).toEqual([url("d1"), url("k1"), url("k2")]);
  expect(screen.getByText("Cooked by Ayesha · Tolichowki · 3.4 km")).toBeTruthy();
  expect(screen.getByText("₹90")).toBeTruthy();
  expect(screen.getByText("20–45 min")).toBeTruthy();
  // A photo that fails to load is dropped.
  fireEvent.error(container.querySelector(`img[src="${url("k1")}"]`)!);
  expect(photos(container)).toEqual([url("d1"), url("k2")]);
});

it("never moves its photos on its own and has no pause or play button", () => {
  vi.useFakeTimers();
  card({ summary: { imageUrls: [url("a"), url("b")], preparationTimeLabel: null, startingPriceLabel: "₹50" } });
  expect(vi.getTimerCount()).toBe(0);
  expect(screen.queryByRole("button", { name: /pause|play/i })).toBeNull();
});

it("opening and saving are separate buttons, and there are no initials without a picture", () => {
  const onOpen = vi.fn();
  const { container } = card({ onOpen });
  fireEvent.click(screen.getByRole("button", { name: "Save Ammi's Dastarkhwan" }));
  expect(onOpen).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Open Ammi's Dastarkhwan" }));
  expect(onOpen).toHaveBeenCalledOnce();
  expect(container.textContent).not.toContain("AD");
  expect(screen.queryByText(/^From/)).toBeNull();
});
