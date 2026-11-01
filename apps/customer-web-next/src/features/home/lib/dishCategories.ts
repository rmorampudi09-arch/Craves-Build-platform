export const ALL_DISHES_CATEGORY = "All" as const;

/** Categories are returned by the live catalog; the UI always prepends All. */
export type DishCategory = string;

/** The categories chefs file their dishes under, in the app's order (app shared/catalog/menuCategories.ts). */
export const MENU_CATEGORIES = ["Biryani", "Curry", "Tiffin", "Snakes", "Roti & Chapati", "Sweet Item", "Rice", "Fast Food"] as const;

export type MenuCategory = (typeof MENU_CATEGORIES)[number];

// The app's spelling fix (Biriyani), plus the plural names the web chef menu offered, so those dishes land on the same chip.
const SAME_CATEGORY: Record<string, string> = { biriyani: "biryani", tiffins: "tiffin", snacks: "snakes", sweets: "sweet item" };

function categoryKey(value: string): string {
  const key = value.trim().toLocaleLowerCase("en-IN");
  return SAME_CATEGORY[key] ?? key;
}

/** The chip a stored category belongs to; null for any other category (those dishes show under All only). */
export function toMenuCategory(value: unknown): MenuCategory | null {
  if (typeof value !== "string") return null;
  const key = categoryKey(value);
  return MENU_CATEGORIES.find((category) => categoryKey(category) === key) ?? null;
}

/** A dish is in a category when the chef filed it there (no guessing from its name), as in the app. */
export function inMenuCategory(dish: { category: string }, category: MenuCategory | null): boolean {
  return category === null || toMenuCategory(dish.category) === category;
}

/** The category as people read it: the server stores snacks as "Snakes". */
export function menuCategoryLabel(value: string): string {
  return toMenuCategory(value) === "Snakes" ? "Snacks" : value;
}
