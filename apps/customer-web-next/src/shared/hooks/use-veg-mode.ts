"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

/**
 * Veg mode, as on Swiggy (owner, 5 Nov 2026): off, pure veg kitchens only, or veg dishes from
 * every kitchen. It applies on Home, the Kitchens page, a kitchen's menu and search, and this
 * device remembers it. Storage can be blocked (private windows), so every read and write is guarded.
 */
export type VegMode = "off" | "pure" | "veg-dishes";

const KEY = "craves.veg-mode";
const listeners = new Set<() => void>();
let current: VegMode | null = null;

function read(): VegMode {
  try {
    const value = window.localStorage.getItem(KEY);
    return value === "pure" || value === "veg-dishes" ? value : "off";
  } catch {
    return "off";
  }
}

export function getVegMode(): VegMode {
  if (typeof window === "undefined") return "off";
  current ??= read();
  return current;
}

export function setVegMode(mode: VegMode): void {
  current = mode;
  try {
    if (mode === "off") window.localStorage.removeItem(KEY);
    else window.localStorage.setItem(KEY, mode);
  } catch {
    // Not remembered on this device, but still on for this visit.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // Another tab changed it.
  const onStorage = (event: StorageEvent) => {
    if (event.key !== KEY) return;
    current = read();
    listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function useVegMode(): VegMode {
  return useSyncExternalStore(subscribe, getVegMode, () => "off");
}

type FoodTyped = { id?: string; kitchenId?: string; foodType?: "VEG" | "NON_VEG" | "EGG"; veg: boolean };

export function isVegDish(dish: Pick<FoodTyped, "foodType" | "veg">): boolean {
  return (dish.foodType ?? (dish.veg ? "VEG" : "NON_VEG")) === "VEG";
}

/**
 * Fallback until the catalog answers: kitchens whose every dish is loaded (as many as the
 * kitchen's own count) and veg. A kitchen with dishes still to load is left out, never guessed.
 */
export function pureVegKitchenIds(
  kitchens: readonly { id: string; activeMenuItemCount: number }[],
  dishes: readonly FoodTyped[],
): Set<string> {
  // Each dish once, even when a page arrives twice.
  const seen = new Map<string, { ids: Set<string>; veg: boolean }>();
  dishes.forEach((dish, index) => {
    if (!dish.kitchenId) return;
    const entry = seen.get(dish.kitchenId) ?? { ids: new Set<string>(), veg: true };
    entry.ids.add(dish.id ?? String(index));
    entry.veg &&= isVegDish(dish);
    seen.set(dish.kitchenId, entry);
  });
  const pure = new Set<string>();
  for (const kitchen of kitchens) {
    const entry = seen.get(kitchen.id);
    if (entry?.veg && entry.ids.size > 0 && entry.ids.size === kitchen.activeMenuItemCount) pure.add(kitchen.id);
  }
  return pure;
}

/** Kitchens with at least one veg dish, and those whose every dish is veg. */
export type VegKitchens = { veg: ReadonlySet<string>; pure: ReadonlySet<string> };

/** From the catalog's own counts: each kitchen's dishes, and its veg dishes (the same kitchens asked with foodType=VEG). */
export function vegKitchenSets(allCounts: ReadonlyMap<string, number>, vegCounts: ReadonlyMap<string, number>): VegKitchens {
  const veg = new Set([...vegCounts].filter(([, count]) => count > 0).map(([id]) => id));
  return { veg, pure: new Set([...veg].filter((id) => allCounts.get(id) === vegCounts.get(id))) };
}

const KITCHEN_PAGE_SIZE = 50;
const MAX_KITCHEN_PAGES = 4;
const VEG_KITCHENS_TTL_MS = 5 * 60 * 1000;

/** Every nearby kitchen's dish count, read the way the Kitchens page reads kitchens (same BFF, same checks on the way in). */
async function kitchenCounts(latitude: number, longitude: number, radiusMeters: number, foodType?: "VEG"): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  for (let page = 0; page < MAX_KITCHEN_PAGES; page += 1) {
    const query = new URLSearchParams({
      latitude: String(latitude),
      longitude: String(longitude),
      radiusMeters: String(radiusMeters),
      page: String(page),
      size: String(KITCHEN_PAGE_SIZE),
    });
    if (foodType) query.set("foodType", foodType);
    const response = await fetch(`/api/discovery/kitchens?${query}`, { cache: "no-store", credentials: "same-origin" });
    if (!response.ok) throw new Error("Nearby kitchens are unavailable right now.");
    const body = (await response.json()) as { kitchens?: unknown; page?: { hasNext?: unknown } };
    for (const kitchen of Array.isArray(body.kitchens) ? body.kitchens : []) {
      const raw = kitchen as { id?: unknown; activeMenuItemCount?: unknown };
      if (typeof raw.id === "string" && Number.isSafeInteger(raw.activeMenuItemCount)) counts.set(raw.id, raw.activeMenuItemCount as number);
    }
    if (body.page?.hasNext !== true) break;
  }
  return counts;
}

const vegKitchenCache = new Map<string, { at: number; value: Promise<VegKitchens> }>();

export function loadVegKitchens(latitude: number, longitude: number, radiusMeters: number): Promise<VegKitchens> {
  const key = `${latitude},${longitude},${radiusMeters}`;
  const cached = vegKitchenCache.get(key);
  if (cached && Date.now() - cached.at < VEG_KITCHENS_TTL_MS) return cached.value;
  const value = Promise.all([
    kitchenCounts(latitude, longitude, radiusMeters),
    kitchenCounts(latitude, longitude, radiusMeters, "VEG"),
  ]).then(([all, veg]) => vegKitchenSets(all, veg));
  vegKitchenCache.set(key, { at: Date.now(), value });
  // A failed read is asked again next time instead of being remembered.
  value.catch(() => vegKitchenCache.delete(key));
  return value;
}

/** The catalog's veg and pure veg kitchens near a spot while veg mode is on; null until known (or if it can't be read). */
export function useVegKitchens(mode: VegMode, latitude: number | null | undefined, longitude: number | null | undefined, radiusMeters: number): VegKitchens | null {
  const key = mode !== "off" && typeof latitude === "number" && typeof longitude === "number" ? `${latitude},${longitude},${radiusMeters}` : null;
  const [loaded, setLoaded] = useState<{ key: string; value: VegKitchens } | null>(null);
  useEffect(() => {
    if (!key || typeof latitude !== "number" || typeof longitude !== "number") return;
    let live = true;
    loadVegKitchens(latitude, longitude, radiusMeters)
      .then((value) => {
        if (live) setLoaded({ key, value });
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [key, latitude, longitude, radiusMeters]);
  return loaded?.key === key ? loaded.value : null;
}

/** The dishes veg mode lets through: veg only, and in pure mode only from pure veg kitchens. */
export function vegModeDishes<Dish extends FoodTyped>(mode: VegMode, dishes: readonly Dish[], pureKitchens: ReadonlySet<string>): Dish[] {
  if (mode === "off") return [...dishes];
  return dishes.filter((dish) => isVegDish(dish) && (mode === "veg-dishes" || (dish.kitchenId !== undefined && pureKitchens.has(dish.kitchenId))));
}
