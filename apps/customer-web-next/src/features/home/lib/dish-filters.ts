import type { Dish } from "@/features/dish/api/dishes";
import {
  DEFAULT_DISH_FILTERS,
  type HomeDishFilters,
  type HomeDishSort,
  type HomeFoodPreference,
} from "@/features/home/lib/home-return-state";
import { SPICE_LEVEL_LABELS } from "@/shared/lib/spice-level";

/** Everything that shapes Home's dish list besides the craving rail. */
export type DishView = {
  sort: HomeDishSort;
  filters: HomeDishFilters;
  foodPreference: HomeFoodPreference;
};

export const SORT_LABELS: Record<HomeDishSort, string> = {
  recommended: "Relevance",
  "price-low-high": "Price: low to high",
  "price-high-low": "Price: high to low",
  quickest: "Quickest to cook",
  "name-a-z": "Name A–Z",
};

export const FOOD_LABELS: Record<HomeFoodPreference, string> = {
  all: "All",
  veg: "Veg",
  egg: "Egg",
  "non-veg": "Non-veg",
};

export const PRICE_LABELS: Record<Exclude<HomeDishFilters["price"], "any">, string> = {
  "under-150": "Under ₹150",
  "150-300": "₹150 – ₹300",
  "over-300": "Over ₹300",
};

export const READY_LABELS: Record<Exclude<HomeDishFilters["ready"], "any">, string> = {
  "30": "Ready in 30 min",
  "45": "Ready in 45 min",
};

export const DISTANCE_LABELS: Record<Exclude<HomeDishFilters["distance"], "any">, string> = {
  "3": "Within 3 km",
  "5": "Within 5 km",
};

export function matchesFoodPreference(dish: Pick<Dish, "foodType" | "veg">, preference: HomeFoodPreference): boolean {
  if (preference === "all") return true;
  const type = dish.foodType ?? (dish.veg ? "VEG" : "NON_VEG");
  return preference === "veg" ? type === "VEG" : preference === "egg" ? type === "EGG" : type === "NON_VEG";
}

/** A dish without a cooking time or distance is left out once that filter is on: we can't promise it. */
export function matchesDishFilters(dish: Dish, filters: HomeDishFilters): boolean {
  if (filters.price === "under-150" && !(dish.price < 150)) return false;
  if (filters.price === "150-300" && !(dish.price >= 150 && dish.price <= 300)) return false;
  if (filters.price === "over-300" && !(dish.price > 300)) return false;
  if (filters.ready !== "any" && !(dish.prepMinutes !== undefined && dish.prepMinutes <= Number(filters.ready))) {
    return false;
  }
  if (filters.distance !== "any" && !(dish.distanceMeters !== undefined && dish.distanceMeters <= Number(filters.distance) * 1000)) {
    return false;
  }
  if (filters.spice !== "any" && dish.spiceLevel !== SPICE_LEVEL_LABELS[filters.spice]) return false;
  return true;
}

/** Relevance keeps the server's order (nearest kitchens first); the others reorder a copy. */
export function sortDishes(dishes: Dish[], sort: HomeDishSort): Dish[] {
  if (sort === "price-low-high") return [...dishes].sort((left, right) => left.price - right.price);
  if (sort === "price-high-low") return [...dishes].sort((left, right) => right.price - left.price);
  if (sort === "quickest") {
    return [...dishes].sort((left, right) => (left.prepMinutes ?? 10_000) - (right.prepMinutes ?? 10_000));
  }
  if (sort === "name-a-z") return [...dishes].sort((left, right) => left.name.localeCompare(right.name, "en-IN"));
  return dishes;
}

/** How many filters are on (food type counts; sort order does not). */
export function activeFilterCount(view: Pick<DishView, "filters" | "foodPreference">): number {
  const { filters, foodPreference } = view;
  return [filters.price, filters.ready, filters.distance, filters.spice].filter((value) => value !== "any").length +
    (foodPreference === "all" ? 0 : 1);
}

export const DEFAULT_DISH_VIEW: DishView = {
  sort: "recommended",
  filters: DEFAULT_DISH_FILTERS,
  foodPreference: "all",
};
