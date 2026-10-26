// The Menu list's search and filter pills, as the app counts them (app chefMenu/domain/chefMenuPresentation.ts).
import type { Language } from "../../../shared/i18n/language.ts";
import type { ChefMenuItem } from "./chef-menu-contract.ts";
import { categoryLabel, DISH_CATEGORIES, knownCategory } from "./dish-categories.ts";

/** On: customers can order it. Off: switched off, or taken off the menu. A draft has its own pill. */
export type DishState = "ON" | "OFF" | "DRAFT";
export type DishFilter = { kind: "status"; status: "ALL" | DishState } | { kind: "category"; category: string };
export const ALL_DISHES: DishFilter = { kind: "status", status: "ALL" };

type Dish = Pick<ChefMenuItem, "status" | "available" | "category" | "itemName" | "description">;

export const dishState = (item: Pick<ChefMenuItem, "status" | "available">): DishState =>
  item.status === "DRAFT" ? "DRAFT" : item.status === "ACTIVE" && item.available ? "ON" : "OFF";

/** One of ours by its English name (Biryani), or the chef's own as typed. */
export const categoryKey = (category: string) => knownCategory(category)?.name ?? category.trim();

const categoryOrder = (key: string) => {
  const index = DISH_CATEGORIES.findIndex((category) => category.name === key);
  return index === -1 ? DISH_CATEGORIES.length : index;
};

/** Ours in the order customers browse them, then the chef's own, A to Z. */
export const sortCategories = (keys: Iterable<string>) => [...new Set(keys)].sort((a, b) => categoryOrder(a) - categoryOrder(b) || a.localeCompare(b));

export function menuCounts(items: readonly Dish[]): Record<"ALL" | DishState, number> {
  const counts = { ALL: items.length, ON: 0, OFF: 0, DRAFT: 0 };
  for (const item of items) counts[dishState(item)] += 1;
  return counts;
}

/** The dishes one filter and the search words leave: name, description or category, in English or the chef's language. */
export function filterDishes<T extends Dish>(items: readonly T[], query: string, filter: DishFilter, language: Language = "en"): T[] {
  const words = query.trim().toLocaleLowerCase();
  return items.filter((item) => {
    const key = categoryKey(item.category);
    if (filter.kind === "category" ? key !== filter.category : filter.status !== "ALL" && dishState(item) !== filter.status) return false;
    return !words || [item.itemName, item.description ?? "", key, categoryLabel(key, language)].join(" ").toLocaleLowerCase().includes(words);
  });
}
