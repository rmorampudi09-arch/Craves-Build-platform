/**
 * The categories customers browse on Craves Home ("What are you craving?"), with the same photos,
 * so a chef picks exactly where customers will look for the dish.
 */
export const DISH_CATEGORIES = [
  { name: "Biryani", image: "/home/cravings/craving-biryani-rail.webp" },
  { name: "Tiffins", image: "/home/cravings/craving-tiffins-rail.webp" },
  { name: "Curry", image: "/home/cravings/craving-curry-rail.webp" },
  { name: "Meals", image: "/home/cravings/craving-meals-rail.webp" },
  { name: "Snacks", image: "/home/cravings/craving-snacks-rail.webp" },
  { name: "Sweets", image: "/home/cravings/craving-sweets-rail.webp" },
  { name: "Desserts", image: "/home/cravings/craving-desserts-rail.webp" },
  { name: "Cake", image: "/home/cravings/craving-cake-rail.webp" },
  { name: "Fast Food", image: "/home/cravings/craving-fast-food-rail.webp" },
  { name: "Ice Cream", image: "/home/cravings/craving-ice-cream-rail.webp" },
  { name: "Pickles", image: "/home/cravings/craving-pickles-rail.webp" },
] as const;

export function knownCategory(value: string) {
  const name = value.trim().toLowerCase();
  return DISH_CATEGORIES.find((category) => category.name.toLowerCase() === name) ?? null;
}
