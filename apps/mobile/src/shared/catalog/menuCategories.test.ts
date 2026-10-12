import {
  CHEF_MENU_CATEGORIES,
  CUSTOMER_MENU_CATEGORIES,
  menuCategoryLabel,
} from './menuCategories';

describe('menu category catalog', () => {
  it('keeps the approved customer category order including All', () => {
    expect(CUSTOMER_MENU_CATEGORIES).toEqual([
      'All',
      'Biryani',
      'Curry',
      'Tiffin',
      'Snakes',
      'Roti & Chapati',
      'Sweet Item',
      'Rice',
      'Fast Food',
    ]);
  });

  it('keeps chef selection limited to the approved item categories', () => {
    expect(CHEF_MENU_CATEGORIES).toEqual([
      'Biryani',
      'Curry',
      'Tiffin',
      'Snakes',
      'Roti & Chapati',
      'Sweet Item',
      'Rice',
      'Fast Food',
    ]);
    expect(CHEF_MENU_CATEGORIES).not.toContain('All');
  });

  it('shows Snacks for the stored value Snakes and leaves other categories alone', () => {
    expect(menuCategoryLabel('Snakes')).toBe('Snacks');
    expect(menuCategoryLabel('Biryani')).toBe('Biryani');
    expect(menuCategoryLabel('Something new')).toBe('Something new');
  });
});
