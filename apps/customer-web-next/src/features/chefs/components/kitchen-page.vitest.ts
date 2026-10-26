// @vitest-environment jsdom
// Synthetic kitchen, dishes and photo URLs; nothing is fetched.
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { KitchenHeader } from "@/features/chefs/components/KitchenHeader";
import { KitchenMenu } from "@/features/chefs/components/KitchenMenu";
import type { Dish } from "@/features/dish/api/dishes";

const KITCHEN = "4b1c0000-0000-4000-8000-000000000001";
const url = (name: string) => `https://img.craves.test/${name}.webp`;
const header = (photos: string[], solid = false) => render(createElement(KitchenHeader, {
  kitchenId: KITCHEN, name: "Ammi's Dastarkhwan", chefPhotoUrl: null, photos, solid, onBack: () => {},
}));
const shown = () => screen.getAllByRole("img").map((img) => img.getAttribute("src"));

beforeEach(() => { vi.stubGlobal("fetch", vi.fn(async () => Response.json({ items: [], nextCursor: null }))); });
afterEach(() => {
  cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks();
  // jsdom has no element scrolling; tests that need it add their own.
  delete (HTMLElement.prototype as Partial<HTMLElement>).scrollIntoView;
  delete (HTMLElement.prototype as Partial<HTMLElement>).scrollTo;
});

describe("KitchenHeader", () => {
  it("shows the next photo every 4 seconds, held by focus in the photos until Pause and Play are pressed", () => {
    vi.useFakeTimers();
    header([url("a"), url("b")]);
    expect(shown()).toEqual([url("a")]);
    act(() => { vi.advanceTimersByTime(4_000); });
    expect(shown()).toEqual([url("b")]);
    const toggle = screen.getByRole("button", { name: "Pause kitchen photos" });
    toggle.focus();
    act(() => { vi.advanceTimersByTime(4_000); });
    expect(shown()).toEqual([url("b")]);
    fireEvent.click(toggle);
    expect(vi.getTimerCount()).toBe(0);
    fireEvent.click(screen.getByRole("button", { name: "Play kitchen photos" }));
    // Play moves the photos on again although focus is still on the button.
    act(() => { vi.advanceTimersByTime(4_000); });
    expect(shown()).toEqual([url("a")]);
  });

  it("holds the photo while the tab is hidden", () => {
    vi.useFakeTimers();
    vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    header([url("a"), url("b")]);
    act(() => { vi.advanceTimersByTime(8_000); });
    expect(shown()).toEqual([url("a")]);
  });

  it("drops a photo that fails to load, and keeps a tidy band with Back and the heart when none is left", () => {
    const { container } = header([url("a")]);
    expect(screen.queryByRole("button", { name: /kitchen photos/ })).toBeNull();
    fireEvent.error(container.querySelector("img")!);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByRole("button", { name: "Back" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save Ammi's Dastarkhwan" })).toBeTruthy();
  });

  it("shows the chef face and name in the bar only once it is solid", () => {
    const { container, rerender } = header([]);
    const echo = () => container.querySelector("header div[aria-hidden=true]")!;
    expect(echo().className).toContain("opacity-0");
    rerender(createElement(KitchenHeader, { kitchenId: KITCHEN, name: "Ammi's Dastarkhwan", chefPhotoUrl: null, photos: [], solid: true, onBack: () => {} }));
    expect(echo().className).toContain("opacity-100");
    expect(echo().textContent).toContain("Ammi's Dastarkhwan");
  });
});

describe("KitchenMenu", () => {
  const dish = (id: string, name: string, category: string) => ({
    id, name, category, kitchenId: KITCHEN, chef: "Ammi's Dastarkhwan", price: 180, currency: "INR", img: "/brand/craves-logo.svg",
    imageIsPlaceholder: true, time: "20 min", prepMinutes: 20, servesCount: 2, veg: false, foodType: "NON_VEG",
  }) as Dish;

  it("groups dishes under category tabs that jump to their section", () => {
    const scrollIntoView = vi.fn();
    HTMLElement.prototype.scrollIntoView = scrollIntoView;
    HTMLElement.prototype.scrollTo = vi.fn();
    render(createElement(KitchenMenu, { dishes: [dish("1", "Mutton biryani", "Biryani"), dish("2", "Samosa", "Snakes"), dish("3", "Veg biryani", "biryani")] }));

    const tabs = within(screen.getByRole("navigation", { name: "Menu categories" })).getAllByRole("button");
    expect(tabs.map((tab) => tab.textContent)).toEqual(["Biryani2", "Snacks1"]);
    expect(screen.getByRole("heading", { name: "Biryani" })).toBeTruthy();
    expect(screen.getByText("Veg biryani")).toBeTruthy();
    // The page is at its end here (no layout in tests), so the last category is the current one.
    expect(tabs[1]!.getAttribute("aria-current")).toBe("true");
    fireEvent.click(tabs[0]!);
    expect(tabs[0]!.getAttribute("aria-current")).toBe("true");
    expect(tabs[1]!.getAttribute("aria-current")).toBeNull();
    expect(scrollIntoView).toHaveBeenCalledWith(expect.objectContaining({ block: "start" }));
  });

  it("shows each dish as a row with its mark, price, time and serves, and Add only while the kitchen delivers here", () => {
    HTMLElement.prototype.scrollTo = vi.fn();
    const dishes = [dish("1", "Mutton biryani", "Biryani")];
    const { rerender } = render(createElement(KitchenMenu, { dishes }));
    expect(screen.getByRole("img", { name: "Non-veg" })).toBeTruthy();
    expect(screen.getByText("₹180")).toBeTruthy();
    expect(screen.getByText("20 min · Serves 2")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Mutton biryani/ }).getAttribute("href")).toBe("/dish/1");
    expect(screen.getByRole("button", { name: "Add Mutton biryani to cart" })).toBeTruthy();
    rerender(createElement(KitchenMenu, { dishes, orderable: false }));
    expect(screen.queryByRole("button", { name: "Add Mutton biryani to cart" })).toBeNull();
    expect(screen.getByRole("button", { name: "Save Mutton biryani" })).toBeTruthy();
  });
});
