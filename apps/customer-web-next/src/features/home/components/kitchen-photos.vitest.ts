// @vitest-environment jsdom
// Synthetic kitchen and photo URLs; nothing is fetched.
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const motion = vi.hoisted(() => ({ reduce: false }));
vi.mock("framer-motion", async (original) => ({
  ...(await original<typeof import("framer-motion")>()),
  useReducedMotion: () => motion.reduce,
}));
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
/** The photos in each card, in order; the one fading in or shown sits on top (z-[2]). */
const photos = (container: HTMLElement, card = 0) =>
  [...container.querySelectorAll("li")[card].querySelectorAll(".aspect-\\[100\\/63\\] img")].map((img) => ({
    src: img.getAttribute("src"),
    shown: img.className.includes("z-[2]"),
  }));
const shownPhoto = (container: HTMLElement, card = 0) => photos(container, card).find((photo) => photo.shown)?.src;

// The heart reads the saved kitchens once; signed-out here, so the list is empty.
beforeEach(() => {
  motion.reduce = false;
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ items: [], nextCursor: null })));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

it("drops a kitchen photo that fails to load instead of showing a broken image", () => {
  const { container } = grid({ dishes: [dish(a, 200), dish(b, 180)] });
  // Off screen (no observer here) the slideshow is still, so only the first photo loads.
  expect(photos(container).map((photo) => photo.src)).toEqual([a]);
  fireEvent.error(container.querySelector(`li img[src="${a}"]`)!);
  expect(photos(container).map((photo) => photo.src)).toEqual([b]);
  // With no photo left the card shows its chef-hat tile, not an empty or broken frame.
  fireEvent.error(container.querySelector(`li img[src="${b}"]`)!);
  expect(photos(container)).toEqual([]);
  expect(container.querySelector("li .aspect-\\[100\\/63\\] > svg")).toBeTruthy();
});

it("Home cards name the kitchen first and show the chef face, a heart, prep time, the bio and the cheapest dish", () => {
  const onSelectKitchen = vi.fn();
  const { container } = grid({ kitchens: [{ ...kitchen, chefPhotoUrl: "https://img.craves.test/chef.webp" }], dishes: [dish(a, 240, 40), dish(b, 120.5, 15)], onSelectKitchen });
  expect(container.querySelector('img[src="https://img.craves.test/chef.webp"]')).toBeTruthy();
  expect(container.querySelector("li h3")?.textContent).toBe("Ammi's Dastarkhwan");
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
  expect(noPhoto.container.querySelector("li .aspect-\\[100\\/63\\] > svg")).toBeTruthy();
  expect(screen.queryByText(/ min$/)).toBeNull();
});

it("names the section like the app with See all; the chefs page keeps its own title and cards", () => {
  grid({ dishes: [dish(a, 200)] });
  expect(screen.getByRole("heading", { name: "Top kitchens near you" })).toBeTruthy();
  expect(screen.getByRole("link", { name: "See all kitchens near you" }).getAttribute("href")).toBe("/chefs");
  cleanup();
  grid({ limit: undefined, renderKitchen: (item) => createElement("p", null, `card ${item.kitchenName}`) });
  expect(screen.getByRole("heading", { name: "Home chefs near you" })).toBeTruthy();
  expect(screen.getByText("card Ammi's Dastarkhwan")).toBeTruthy();
});

it("fades each card forward every 4 s, the next card 0.8 s later, only on screen, and Pause stops it", () => {
  vi.useFakeTimers();
  vi.stubGlobal("IntersectionObserver", class {
    constructor(private readonly callback: IntersectionObserverCallback) {}
    observe() { this.callback([{ intersectionRatio: 1 } as IntersectionObserverEntry], this as unknown as IntersectionObserver); }
    disconnect() {}
  });
  const { container } = grid({ kitchens: [kitchen, second], dishes: [dish(a, 200), dish(b, 210), dish(c, 220), dish(c, 230, undefined, second.id), dish(a, 240, undefined, second.id)] });
  // On screen, the next photo loads ahead of its turn.
  expect(photos(container).map((photo) => photo.src)).toEqual([a, b]);
  expect([shownPhoto(container, 0), shownPhoto(container, 1)]).toEqual([a, c]);
  act(() => vi.advanceTimersByTime(4_000));
  expect([shownPhoto(container, 0), shownPhoto(container, 1)]).toEqual([b, c]);
  act(() => vi.advanceTimersByTime(800));
  expect([shownPhoto(container, 0), shownPhoto(container, 1)]).toEqual([b, a]);
  // After the last photo the first fades in over it again: always forward.
  act(() => vi.advanceTimersByTime(3_200));
  expect(shownPhoto(container, 0)).toBe(c);
  act(() => vi.advanceTimersByTime(4_000));
  expect(shownPhoto(container, 0)).toBe(a);
  fireEvent.click(screen.getByRole("button", { name: "Pause kitchen photos" }));
  act(() => vi.advanceTimersByTime(12_000));
  expect(shownPhoto(container, 0)).toBe(a);
  expect(window.localStorage.getItem("craves.kitchen-photos.paused")).toBe("1");
  expect(screen.getByRole("button", { name: "Play kitchen photos" })).toBeTruthy();
});

it("keeps the photos still, with no pause button, for reduced motion", () => {
  motion.reduce = true;
  vi.useFakeTimers();
  const { container } = grid({ dishes: [dish(a, 200), dish(b, 210)] });
  act(() => vi.advanceTimersByTime(12_000));
  expect(shownPhoto(container)).toBe(a);
  expect(screen.queryByRole("button", { name: /kitchen photos/ })).toBeNull();
});

it("shows plain words with a drawing when kitchens can't load, need an address, or don't match", () => {
  const onRetry = vi.fn();
  grid({ state: "error", message: "HTTP 503 upstream", onRetry });
  expect(screen.getByRole("heading", { name: "We couldn't load home chefs near you" })).toBeTruthy();
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
  grid({ ...chefsPage, message: "No home chefs near you are cooking spicy dishes right now." });
  expect(screen.getByRole("heading", { name: "No home chefs near you yet" })).toBeTruthy();
  expect(screen.getByText("No home chefs near you are cooking spicy dishes right now.")).toBeTruthy();
});
