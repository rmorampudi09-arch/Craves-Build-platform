import { messages, type Language } from "../../../shared/i18n/language.ts";

/**
 * The categories a chef picks: the app's eight (apps/mobile shared/catalog/menuCategories.ts), the same chips
 * customers browse on Home ("What's on your mind?"), with the same photos. "Snakes" is the value the app and
 * the server store for snacks; people read "Snacks".
 */
export const DISH_CATEGORIES = [
  { name: "Biryani", image: "/home/categories/biryani.webp" },
  { name: "Curry", image: "/home/categories/curry.webp" },
  { name: "Tiffin", image: "/home/categories/tiffin.webp" },
  { name: "Snakes", image: "/home/categories/snacks.webp" },
  { name: "Roti & Chapati", image: "/home/categories/roti-chapati.webp" },
  { name: "Sweet Item", image: "/home/categories/sweet-item.webp" },
  { name: "Rice", image: "/home/categories/rice.webp" },
  { name: "Fast Food", image: "/home/categories/fast-food.webp" },
] as const;

const NAMES = messages({
  en: {
    Biryani: "Biryani", Curry: "Curry", Tiffin: "Tiffin", Snakes: "Snacks",
    "Roti & Chapati": "Roti & Chapati", "Sweet Item": "Sweet Item", Rice: "Rice", "Fast Food": "Fast Food",
  },
  te: {
    Biryani: "బిర్యానీ", Curry: "కూరలు", Tiffin: "టిఫిన్", Snakes: "స్నాక్స్",
    "Roti & Chapati": "రోటీ & చపాతీ", "Sweet Item": "స్వీట్లు", Rice: "అన్నం", "Fast Food": "ఫాస్ట్ ఫుడ్",
  },
  kn: {
    Biryani: "ಬಿರಿಯಾನಿ", Curry: "ಕರಿ", Tiffin: "ತಿಂಡಿ", Snakes: "ಸ್ನ್ಯಾಕ್ಸ್",
    "Roti & Chapati": "ರೊಟ್ಟಿ & ಚಪಾತಿ", "Sweet Item": "ಸಿಹಿತಿಂಡಿ", Rice: "ಅನ್ನ", "Fast Food": "ಫಾಸ್ಟ್ ಫುಡ್",
  },
});

/** Names dishes were saved under before the app's list, read as the matching category (the stored value stays). */
const SAME_CATEGORY: Record<string, string> = { biriyani: "biryani", tiffins: "tiffin", snacks: "snakes", sweets: "sweet item" };

export function knownCategory(value: string) {
  const typed = value.trim().toLowerCase();
  const name = SAME_CATEGORY[typed] ?? typed;
  return DISH_CATEGORIES.find((category) => category.name.toLowerCase() === name) ?? null;
}

/** The category as the chef reads it: one of ours in their language ("Snakes" reads "Snacks"), their own as typed. */
export function categoryLabel(value: string, language: Language = "en"): string {
  const known = knownCategory(value);
  return known ? NAMES[language][known.name] : value.trim();
}
