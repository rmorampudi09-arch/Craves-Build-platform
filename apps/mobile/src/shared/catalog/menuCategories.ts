export const CHEF_MENU_CATEGORIES = [
  'Biryani',
  'Curry',
  'Tiffin',
  'Snakes',
  'Roti & Chapati',
  'Sweet Item',
  'Rice',
  'Fast Food',
] as const;

export type ChefMenuCategory = (typeof CHEF_MENU_CATEGORIES)[number];

export const CUSTOMER_MENU_CATEGORIES = ['All', ...CHEF_MENU_CATEGORIES] as const;
export type CustomerMenuCategory = (typeof CUSTOMER_MENU_CATEGORIES)[number];

/** Stored category values whose name on screen differs. "Snakes" is saved by the server; people read "Snacks". */
const CATEGORY_LABELS: Record<string, string> = {Snakes: 'Snacks'};

/** The category as chefs and customers read it; the stored value never changes. */
export function menuCategoryLabel(value: string): string {
  return CATEGORY_LABELS[value] ?? value;
}
