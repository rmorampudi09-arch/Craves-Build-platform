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
