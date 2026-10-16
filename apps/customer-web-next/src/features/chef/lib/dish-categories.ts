import { messages, type Language } from "../../../shared/i18n/language.ts";

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

const NAMES = messages({
  en: {
    Biryani: "Biryani", Tiffins: "Tiffins", Curry: "Curry", Meals: "Meals", Snacks: "Snacks", Sweets: "Sweets",
    Desserts: "Desserts", Cake: "Cake", "Fast Food": "Fast Food", "Ice Cream": "Ice Cream", Pickles: "Pickles",
  },
  te: {
    Biryani: "బిర్యానీ", Tiffins: "టిఫిన్లు", Curry: "కూరలు", Meals: "భోజనం", Snacks: "స్నాక్స్", Sweets: "స్వీట్లు",
    Desserts: "డెజర్ట్‌లు", Cake: "కేక్", "Fast Food": "ఫాస్ట్ ఫుడ్", "Ice Cream": "ఐస్ క్రీమ్", Pickles: "ఊరగాయలు",
  },
  kn: {
    Biryani: "ಬಿರಿಯಾನಿ", Tiffins: "ತಿಂಡಿ", Curry: "ಕರಿ", Meals: "ಊಟ", Snacks: "ಸ್ನ್ಯಾಕ್ಸ್", Sweets: "ಸಿಹಿತಿಂಡಿ",
    Desserts: "ಡೆಸರ್ಟ್", Cake: "ಕೇಕ್", "Fast Food": "ಫಾಸ್ಟ್ ಫುಡ್", "Ice Cream": "ಐಸ್ ಕ್ರೀಮ್", Pickles: "ಉಪ್ಪಿನಕಾಯಿ",
  },
});

export function knownCategory(value: string) {
  const name = value.trim().toLowerCase();
  return DISH_CATEGORIES.find((category) => category.name.toLowerCase() === name) ?? null;
}

/** The category as the chef reads it: one of ours in their language, their own as typed. Saved dishes keep the English name. */
export function categoryLabel(value: string, language: Language = "en"): string {
  const known = knownCategory(value);
  return known && language !== "en" ? NAMES[language][known.name] : value.trim();
}
