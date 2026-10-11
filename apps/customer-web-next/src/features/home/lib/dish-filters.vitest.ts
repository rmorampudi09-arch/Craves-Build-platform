// @vitest-environment jsdom
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import type { Dish } from "@/features/dish/api/dishes";
import { DishFilterBar } from "@/features/home/components/DishFilterBar";
import {
  activeFilterCount,
  DEFAULT_DISH_VIEW,
  matchesDishFilters,
  matchesFoodPreference,
  sortDishes,
} from "@/features/home/lib/dish-filters";
import { DEFAULT_DISH_FILTERS, readHomeReturnState } from "@/features/home/lib/home-return-state";

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
});

const dish = (patch: Partial<Dish>): Dish => ({
  id: patch.id ?? "d", name: "Dish", chef: "Kitchen", category: "Meals", img: "", price: 200, rating: 0,
  time: "", veg: true, foodType: "VEG", desc: "", ...patch,
});

describe("dish filters", () => {
  it("narrows by price, cooking time and distance, leaving out dishes it can't vouch for", () => {
    const cheap = dish({ price: 120, prepMinutes: 25, distanceMeters: 1200 });
    const mid = dish({ price: 300, prepMinutes: 40, distanceMeters: 4200 });
    const unknown = dish({ price: 90 });
    expect(matchesDishFilters(cheap, { ...DEFAULT_DISH_FILTERS, price: "under-150" })).toBe(true);
    expect(matchesDishFilters(mid, { ...DEFAULT_DISH_FILTERS, price: "150-300" })).toBe(true);
    expect(matchesDishFilters(mid, { ...DEFAULT_DISH_FILTERS, price: "over-300" })).toBe(false);
    expect(matchesDishFilters(cheap, { ...DEFAULT_DISH_FILTERS, ready: "30" })).toBe(true);
    expect(matchesDishFilters(mid, { ...DEFAULT_DISH_FILTERS, ready: "30" })).toBe(false);
    expect(matchesDishFilters(unknown, { ...DEFAULT_DISH_FILTERS, ready: "45" })).toBe(false);
    expect(matchesDishFilters(mid, { ...DEFAULT_DISH_FILTERS, distance: "5" })).toBe(true);
    expect(matchesDishFilters(unknown, { ...DEFAULT_DISH_FILTERS, distance: "3" })).toBe(false);
    expect(matchesFoodPreference(dish({ foodType: "EGG", veg: false }), "egg")).toBe(true);
    expect(matchesFoodPreference(dish({ foodType: "EGG", veg: false }), "non-veg")).toBe(false);
  });

  it("sorts quickest first with unknown times last, and counts filters (not the sort)", () => {
    const sorted = sortDishes(
      [dish({ id: "a" }), dish({ id: "b", prepMinutes: 40 }), dish({ id: "c", prepMinutes: 15 })],
      "quickest",
    );
    expect(sorted.map((item) => item.id)).toEqual(["c", "b", "a"]);
    expect(activeFilterCount({ filters: { ...DEFAULT_DISH_FILTERS, price: "under-150" }, foodPreference: "veg" })).toBe(2);
    expect(activeFilterCount(DEFAULT_DISH_VIEW)).toBe(0);
  });

  it("restores saved filters and drops values it doesn't know", () => {
    window.sessionStorage.setItem("craves:customer-home-return-state", JSON.stringify({
      scrollY: 10, searchTerm: "", searchOpen: false, homeCategory: null, dishSort: "rating",
      foodPreference: "egg", dishFilters: { price: "150-300", ready: "10", distance: "3" }, savedAt: Date.now(),
    }));
    const restored = readHomeReturnState();
    expect(restored?.dishSort).toBe("recommended");
    expect(restored?.foodPreference).toBe("egg");
    expect(restored?.dishFilters).toEqual({ price: "150-300", ready: "any", distance: "3" });
  });
});

describe("filter bar", () => {
  it("turns a chip on with one tap and shows it with an ✕", () => {
    const onViewChange = vi.fn();
    const { rerender } = render(createElement(DishFilterBar, { view: DEFAULT_DISH_VIEW, onViewChange, countFor: () => 4, moreToLoad: false }));
    fireEvent.click(screen.getByRole("button", { name: "Under ₹150" }));
    const next = onViewChange.mock.calls[0][0];
    expect(next.filters.price).toBe("under-150");
    rerender(createElement(DishFilterBar, { view: next, onViewChange, countFor: () => 4, moreToLoad: false }));
    expect(screen.getByRole("button", { name: "Under ₹150" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: /Filters/ }).textContent).toContain("1");
  });

  it("applies the sheet's choices together and says how many dishes it will show", () => {
    const onViewChange = vi.fn();
    render(createElement(DishFilterBar, {
      view: DEFAULT_DISH_VIEW,
      onViewChange,
      countFor: (view) => (view.foodPreference === "non-veg" ? 3 : 12),
      moreToLoad: true,
    }));
    fireEvent.click(screen.getByRole("button", { name: /Filters/ }));
    expect(screen.getByRole("dialog", { name: "Filter and sort" })).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: "Non-veg" }));
    fireEvent.click(screen.getByRole("radio", { name: "Quickest to cook" }));
    fireEvent.click(screen.getByRole("button", { name: "Show 3+ dishes" }));
    expect(onViewChange).toHaveBeenCalledWith({ ...DEFAULT_DISH_VIEW, sort: "quickest", foodPreference: "non-veg" });
  });
});
