// @vitest-environment jsdom
// Synthetic kitchen and photo URLs; nothing is fetched.
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => createElement("a", { href: to }, children),
}));

import { KitchensGrid } from "@/features/home/components/KitchensGrid";

const kitchen = {
  id: "4b1c0000-0000-4000-8000-000000000001", kitchenName: "Ammi's Dastarkhwan", displayName: "Ammi", description: null,
  areaName: "Tolichowki", city: "Hyderabad", state: "Telangana", distanceMeters: 3400, activeMenuItemCount: 4, chefPhotoUrl: null, kitchenPhotoUrls: [],
};
const second = { ...kitchen, id: "4b1c0000-0000-4000-8000-000000000002", kitchenName: "Lakshmi's Kitchen", displayName: null };
const [a, b, c] = ["https://img.craves.test/a.webp", "https://img.craves.test/b.webp", "https://img.craves.test/c.webp"];
const dish = (img: string, price: number, prepMinutes?: number, kitchenId = kitchen.id) => ({ kitchenId, img, price, prepMinutes });
const grid = (props: Partial<Parameters<typeof KitchensGrid>[0]> = {}) => render(createElement(KitchensGrid, {
  kitchens: [kitchen], searchTerm: "", state: "ready", message: "",
  onSelectKitchen: () => {}, onRetry: () => {}, onManageAddress: () => {}, dishes: [], limit: 8, ...props,
}));
/** The photos in each card, in order. */
const photos = (container: HTMLElement, card = 0) =>
  [...container.querySelectorAll("li")[card].querySelectorAll(".aspect-\\[16\\/9\\] img")].map((img) => img.getAttribute("src"));

// The heart reads the saved kitchens once; signed-out here, so the list is empty.
beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ items: [], nextCursor: null })));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("drops a kitchen photo that fails to load instead of showing a broken image", () => {
  const { container } = grid({ dishes: [dish(a, 200), dish(b, 180)] });
  expect(photos(container)).toEqual([a, b]);
  fireEvent.error(container.querySelector(`li img[src="${a}"]`)!);
  expect(photos(container)).toEqual([b]);
  // With no photo left the card shows its chef-hat tile, not an empty or broken frame.
  fireEvent.error(container.querySelector(`li img[src="${b}"]`)!);
  expect(photos(container)).toEqual([]);
  expect(container.querySelector("li .aspect-\\[16\\/9\\] > svg")).toBeTruthy();
});

it("Home cards show the food, the cook's face, who cooks, a heart, prep time and the cheapest dish", () => {
  const onSelectKitchen = vi.fn();
  const { container } = grid({ kitchens: [{ ...kitchen, chefPhotoUrl: "https://img.craves.test/chef.webp" }], dishes: [dish(a, 240, 40), dish(b, 120.5, 15)], onSelectKitchen });
  expect(container.querySelector('img[src="https://img.craves.test/chef.webp"]')).toBeTruthy();
  expect(container.querySelector("li h3")?.textContent).toBe("Ammi's Dastarkhwan");
  expect(screen.getByText("Cooked by Ammi · Tolichowki · 3.4 km")).toBeTruthy();
  expect(screen.getByText("15–40 min")).toBeTruthy();
  expect(screen.getByText("₹120.50")).toBeTruthy();
  // The heart is beside the card button, not inside it: saving never opens the kitchen.
  fireEvent.click(screen.getByRole("button", { name: "Save Ammi's Dastarkhwan" }));
  expect(onSelectKitchen).not.toHaveBeenCalled();
  fireEvent.keyDown(screen.getByRole("button", { name: "Open Ammi's Dastarkhwan" }), { key: "Enter" });
  expect(onSelectKitchen).toHaveBeenCalledWith(expect.objectContaining({ id: kitchen.id }));
});

it("Home shows only kitchens cooking something nearby, at most the limit, and steps aside when none is", () => {
  const { container } = grid({ kitchens: [kitchen, second], dishes: [dish(a, 200, undefined, second.id)] });
  expect([...container.querySelectorAll("li h3")].map((name) => name.textContent)).toEqual(["Lakshmi's Kitchen"]);
  cleanup();
  const limited = grid({ kitchens: [kitchen, second], dishes: [dish(a, 200), dish(b, 210, undefined, second.id)], limit: 1 });
  expect(limited.container.querySelectorAll("li")).toHaveLength(1);
  cleanup();
  const none = grid({ dishes: [] });
  expect(none.container.innerHTML).toBe("");
  // A kitchen with dishes but no dish photos gets the chef-hat tile and no prep time.
  cleanup();
  const noPhoto = grid({ dishes: [{ kitchenId: kitchen.id, img: "/brand/craves-logo.svg", price: 99 }] });
  expect(noPhoto.container.querySelector("li .aspect-\\[16\\/9\\] > svg")).toBeTruthy();
  expect(screen.queryByText(/ min$/)).toBeNull();
});

it("names the section with See all and how many kitchens; the Kitchens page keeps its own title and cards", () => {
  grid({ dishes: [dish(a, 200)], totalNearby: 24 });
  expect(screen.getByRole("heading", { name: "Top kitchens near you" })).toBeTruthy();
  expect(screen.getByRole("link", { name: "See all 24 kitchens" }).getAttribute("href")).toBe("/chefs");
  cleanup();
  // Before the count is known it still says what it opens.
  grid({ dishes: [dish(a, 200)] });
  expect(screen.getByRole("link", { name: "See all kitchens" })).toBeTruthy();
  cleanup();
  grid({ limit: undefined, totalNearby: 37, renderKitchen: (item) => createElement("li", null, `card ${item.kitchenName}`) });
  expect(screen.getByRole("heading", { name: "Nearby kitchens" })).toBeTruthy();
  // The app's count: every kitchen within 10 km, not just the page loaded so far.
  expect(screen.getByText("37 within 10 km")).toBeTruthy();
  expect(screen.getByText("card Ammi's Dastarkhwan")).toBeTruthy();
});

it("never moves the photos on its own: no timers and no pause or play button; people swipe", () => {
  vi.useFakeTimers();
  const { container } = grid({ kitchens: [kitchen, second], dishes: [dish(a, 200), dish(b, 210), dish(c, 220), dish(c, 230, undefined, second.id), dish(a, 240, undefined, second.id)] });
  expect(vi.getTimerCount()).toBe(0);
  expect(screen.queryByRole("button", { name: /pause|play/i })).toBeNull();
  // A swipe moves the strip; the dots follow it.
  const strip = container.querySelector("li .snap-x") as HTMLDivElement;
  Object.defineProperty(strip, "clientWidth", { configurable: true, value: 300 });
  strip.scrollLeft = 600;
  fireEvent.scroll(strip);
  const dots = [...container.querySelectorAll("li")[0].querySelectorAll("[aria-hidden='true'] > span")];
  expect(dots.map((dot) => dot.className.includes("w-4"))).toEqual([false, false, true]);
  act(() => vi.advanceTimersByTime(12_000));
  expect(photos(container)).toEqual([a, b, c]);
});

it("shows plain words with a drawing when kitchens can't load, need an address, or don't match", () => {
  const onRetry = vi.fn();
  grid({ state: "error", message: "HTTP 503 upstream", onRetry });
  expect(screen.getByRole("heading", { name: "We couldn't load kitchens near you" })).toBeTruthy();
  expect(screen.queryByText(/503/)).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(onRetry).toHaveBeenCalledOnce();
  cleanup();
  const onManageAddress = vi.fn();
  grid({ state: "address-required", onManageAddress });
  fireEvent.click(screen.getByRole("button", { name: "Choose location" }));
  expect(onManageAddress).toHaveBeenCalledOnce();
  cleanup();
  const chefsPage = { limit: undefined, kitchens: [], renderKitchen: () => null };
  grid({ ...chefsPage, searchTerm: " dosa " });
  expect(screen.getByRole("heading", { name: "No kitchens match “dosa”" })).toBeTruthy();
  cleanup();
  grid({ ...chefsPage, message: "No kitchens near you are cooking spicy dishes right now." });
  expect(screen.getByRole("heading", { name: "No home kitchens near you yet" })).toBeTruthy();
  expect(screen.getByText("No kitchens near you are cooking spicy dishes right now.")).toBeTruthy();
});
