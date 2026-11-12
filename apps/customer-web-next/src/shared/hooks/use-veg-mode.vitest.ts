// @vitest-environment jsdom
// Synthetic kitchens and dishes; the BFF is a stub, nothing is fetched.
import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import {
  getVegMode,
  loadVegKitchens,
  pureVegKitchenIds,
  setVegMode,
  useVegMode,
  vegKitchenSets,
  vegModeDishes,
} from "@/shared/hooks/use-veg-mode";

const dish = (id: string, kitchenId: string, foodType: "VEG" | "NON_VEG" | "EGG") => ({ id, kitchenId, foodType, veg: foodType === "VEG" });

afterEach(() => {
  setVegMode("off");
  window.localStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("remembers veg mode on this device and tells every reader", () => {
  const { result } = renderHook(() => useVegMode());
  expect(result.current).toBe("off");
  act(() => setVegMode("pure"));
  expect(result.current).toBe("pure");
  expect(window.localStorage.getItem("craves.veg-mode")).toBe("pure");
  act(() => setVegMode("off"));
  expect(window.localStorage.getItem("craves.veg-mode")).toBeNull();
});

it("still works for this visit when storage is blocked", () => {
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("blocked");
  });
  setVegMode("veg-dishes");
  expect(getVegMode()).toBe("veg-dishes");
});

it("pure veg means every one of the kitchen's dishes is veg, by the catalog's own counts", () => {
  const all = new Map([["a", 3], ["b", 4], ["c", 2]]);
  const veg = new Map([["a", 3], ["b", 1], ["c", 0]]);
  const { veg: cooksVeg, pure } = vegKitchenSets(all, veg);
  expect([...cooksVeg]).toEqual(["a", "b"]);
  expect([...pure]).toEqual(["a"]);
});

it("before the catalog answers, only a kitchen with every dish loaded and veg counts as pure", () => {
  const kitchens = [{ id: "a", activeMenuItemCount: 2 }, { id: "b", activeMenuItemCount: 3 }, { id: "c", activeMenuItemCount: 1 }];
  const dishes = [dish("1", "a", "VEG"), dish("2", "a", "VEG"), dish("2", "a", "VEG"), dish("3", "b", "VEG"), dish("4", "c", "EGG")];
  // b has dishes still to load, c cooks egg: neither is guessed.
  expect([...pureVegKitchenIds(kitchens, dishes)]).toEqual(["a"]);
});

it("veg dishes everywhere, or only from pure veg kitchens", () => {
  const dishes = [dish("1", "a", "VEG"), dish("2", "b", "VEG"), dish("3", "b", "NON_VEG")];
  expect(vegModeDishes("off", dishes, new Set()).map((item) => item.id)).toEqual(["1", "2", "3"]);
  expect(vegModeDishes("veg-dishes", dishes, new Set()).map((item) => item.id)).toEqual(["1", "2"]);
  expect(vegModeDishes("pure", dishes, new Set(["a"])).map((item) => item.id)).toEqual(["1"]);
});

it("asks the kitchens BFF twice, once for veg dishes only, and keeps the answer a while", async () => {
  const fetch = vi.fn(async (url: string) =>
    Response.json({
      kitchens: url.includes("foodType=VEG") ? [{ id: "a", activeMenuItemCount: 2 }, { id: "b", activeMenuItemCount: 1 }] : [{ id: "a", activeMenuItemCount: 2 }, { id: "b", activeMenuItemCount: 5 }],
      page: { hasNext: false },
    }),
  );
  vi.stubGlobal("fetch", fetch);
  const sets = await loadVegKitchens(17.46, 78.36, 10_000);
  expect([...sets.pure]).toEqual(["a"]);
  expect([...sets.veg]).toEqual(["a", "b"]);
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(fetch.mock.calls.map(([url]) => url.includes("foodType=VEG"))).toEqual([false, true]);
  await loadVegKitchens(17.46, 78.36, 10_000);
  expect(fetch).toHaveBeenCalledTimes(2);
});
