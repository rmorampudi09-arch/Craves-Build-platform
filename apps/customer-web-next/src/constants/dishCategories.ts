export const DISH_CATEGORIES = [
  "All",
  "Meals",
  "Biryani",
  "Veg Biryani",
  "Curry",
  "Tiffin",
] as const;

export type DishCategory = (typeof DISH_CATEGORIES)[number];
