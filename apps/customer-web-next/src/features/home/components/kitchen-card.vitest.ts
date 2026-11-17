// @vitest-environment jsdom
// Synthetic kitchen and photo URLs; nothing is fetched.
import { createElement } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

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
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it("shows only her dishes, never the kitchen's own photos, with who cooks, area, distance and price", () => {
  const summary = { imageUrls: [url("d1"), url("d2")], preparationTimeLabel: "20–45 min", startingPriceLabel: "₹90" };
  const { container } = card({ kitchen: { ...kitchen, kitchenPhotoUrls: [url("k1"), url("k2")] }, summary });
  expect(photos(container)).toEqual([url("d1"), url("d2")]);
  expect(screen.getByText("Cooked by Ayesha · Tolichowki · 3.4 km")).toBeTruthy();
  expect(screen.getByText("₹90")).toBeTruthy();
  expect(screen.getByText("20–45 min")).toBeTruthy();
  // A photo that fails to load is dropped.
  fireEvent.error(container.querySelector(`img[src="${url("d1")}"]`)!);
  expect(photos(container)).toEqual([url("d2")]);
  cleanup();
  // A kitchen with no dish photo shows the chef-hat tile, never its kitchen photos.
  const bare = card({ kitchen: { ...kitchen, kitchenPhotoUrls: [url("k1")] }, summary: { ...summary, imageUrls: [] } });
  expect(photos(bare.container)).toEqual([]);
});

it("slides to the next dish every 3 s while on screen, loops, holds while hovered or focused, and has no pause button", () => {
  vi.useFakeTimers();
  let report: (entries: Array<{ isIntersecting: boolean }>) => void = () => {};
  vi.stubGlobal("IntersectionObserver", class {
    constructor(callback: typeof report) { report = callback; }
    observe() {}
    disconnect() {}
  });
  const { container } = card({ summary: { imageUrls: [url("a"), url("b"), url("c")], preparationTimeLabel: null, startingPriceLabel: "₹50" } });
  const strip = container.querySelector(".snap-x") as HTMLDivElement;
  Object.defineProperty(strip, "clientWidth", { configurable: true, value: 300 });
  // jsdom has no scrolling; this one moves the strip where it was asked to go.
  const scrollTo = vi.fn(({ left }: { left: number }) => { strip.scrollLeft = left; });
  strip.scrollTo = scrollTo as unknown as HTMLElement["scrollTo"];
  expect(screen.queryByRole("button", { name: /pause|play/i })).toBeNull();

  // Off screen nothing moves.
  act(() => vi.advanceTimersByTime(10_000));
  expect(scrollTo).not.toHaveBeenCalled();

  act(() => report([{ isIntersecting: true }]));
  act(() => vi.advanceTimersByTime(3_000));
  expect(scrollTo).toHaveBeenLastCalledWith({ left: 300, behavior: "smooth" });
  act(() => vi.advanceTimersByTime(3_000));
  expect(scrollTo).toHaveBeenLastCalledWith({ left: 600, behavior: "smooth" });
  act(() => vi.advanceTimersByTime(3_000));
  expect(scrollTo).toHaveBeenLastCalledWith({ left: 0, behavior: "smooth" });

  // A mouse over the card holds it; leaving lets it go on.
  const calls = scrollTo.mock.calls.length;
  fireEvent.pointerEnter(container.querySelector("li")!);
  act(() => vi.advanceTimersByTime(9_000));
  expect(scrollTo).toHaveBeenCalledTimes(calls);
  fireEvent.pointerLeave(container.querySelector("li")!);
  act(() => vi.advanceTimersByTime(3_000));
  expect(scrollTo).toHaveBeenCalledTimes(calls + 1);

  // Keyboard focus on the card holds it too.
  fireEvent.focus(screen.getByRole("button", { name: "Open Ammi's Dastarkhwan" }));
  act(() => vi.advanceTimersByTime(9_000));
  expect(scrollTo).toHaveBeenCalledTimes(calls + 1);
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
