import type { Dish } from "@/features/dish/api/dishes";
import { formatDistance, type NearbyKitchen, type NearbyMenuItem } from "@/features/home/lib/discovery-contract";
import { menuCategoryLabel } from "@/features/home/lib/dishCategories";

/** What a search row needs from a dish: Home's loaded dishes and the catalog's search matches both fit. */
export type SearchDish = Pick<Dish, "id" | "name" | "chef" | "category" | "img" | "price" | "currency" | "desc" | "distanceMeters" | "foodType" | "veg">;

const lower = (value: string) => value.toLocaleLowerCase("en-IN");

/** A dish matches on its name, description, category ("Snacks" finds the stored "Snakes") or kitchen, as in the app. */
export function matchesDishSearch(dish: SearchDish, words: string): boolean {
  const query = lower(words.trim());
  return lower([dish.name, dish.desc, dish.category, menuCategoryLabel(dish.category), dish.chef].join(" ")).includes(query);
}

/** A kitchen matches on its name, the chef's name, its description or its area. */
export function matchesKitchenSearch(kitchen: NearbyKitchen, words: string): boolean {
  const query = lower(words.trim());
  return [kitchen.kitchenName, kitchen.displayName, kitchen.description, kitchen.areaName, kitchen.city, kitchen.state].some(
    (value) => value !== null && lower(value).includes(query),
  );
}

/** A catalog search match as a search row (no photo: the Craves mark, as on Home's dish cards). */
export function toSearchDish(item: NearbyMenuItem): SearchDish {
  return {
    id: item.id,
    name: item.itemName,
    chef: item.kitchenDisplayName || item.kitchenName,
    category: item.category,
    img: item.primaryImageUrl ?? "/brand/craves-logo.svg",
    price: item.price,
    currency: item.currency,
    desc: item.description ?? "",
    distanceMeters: item.distanceMeters,
    foodType: item.foodType,
    veg: item.foodType === "VEG",
  };
}

/** The loaded items first, then what only the catalog search found. */
export function mergeById<T extends { id: string }>(loaded: readonly T[], found: readonly T[]): T[] {
  const ids = new Set(loaded.map((item) => item.id));
  return [...loaded, ...found.filter((item) => !ids.has(item.id))];
}

/** "1.2 km away", as the app's search rows say it. */
export function distanceAway(distanceMeters: number): string {
  return `${formatDistance(distanceMeters)} away`;
}
