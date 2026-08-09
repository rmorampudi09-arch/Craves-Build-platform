import {
  CHEF_MENU_FOOD_TYPES,
  CHEF_MENU_ITEM_STATUSES,
  CHEF_MENU_SPICE_LEVELS,
  parseChefMenuItem,
  parseChefMenuItems,
  validateChefMenuItemRequest,
} from './chefMenuApi';

const menuItem = {
  id: '123e4567-e89b-42d3-a456-426614174000',
  kitchenId: '123e4567-e89b-42d3-a456-426614174001',
  itemName: 'Paneer Bowl',
  description: 'Fresh paneer and rice',
  category: 'Bowls',
  foodType: 'VEG',
  price: 199,
  currency: 'INR',
  servesCount: 1,
  preparationTimeMinutes: 20,
  spiceLevel: 'MEDIUM',
  unitPackageWeightGrams: 450,
  thermoboxRequired: false,
  available: true,
  status: 'ACTIVE',
  images: [
    {
      id: '123e4567-e89b-42d3-a456-426614174002',
      menuItemId: '123e4567-e89b-42d3-a456-426614174000',
      blobContainer: 'menu-images',
      blobName: 'kitchen/item/image.jpg',
      contentType: 'image/jpeg',
      fileSizeBytes: 1024,
      publicUrl: 'https://example.test/image.jpg',
      sortOrder: 0,
      primary: true,
      createdAt: '2026-08-09T10:00:00Z',
    },
  ],
  createdAt: '2026-08-09T09:00:00Z',
  updatedAt: '2026-08-09T10:00:00Z',
};

describe('chefMenuApi contract model', () => {
  it('locks the exact backend enums', () => {
    expect(CHEF_MENU_ITEM_STATUSES).toEqual(['DRAFT', 'ACTIVE', 'INACTIVE']);
    expect(CHEF_MENU_FOOD_TYPES).toEqual(['VEG', 'NON_VEG', 'EGG']);
    expect(CHEF_MENU_SPICE_LEVELS).toEqual(['MILD', 'MEDIUM', 'SPICY']);
  });

  it('parses the complete menu item response including media ownership fields', () => {
    expect(parseChefMenuItem(menuItem)).toEqual(menuItem);
  });

  it('rejects unsupported server enum values instead of guessing', () => {
    expect(parseChefMenuItem({...menuItem, status: 'HIDDEN'})).toBeNull();
    expect(parseChefMenuItem({...menuItem, foodType: 'VEGAN'})).toBeNull();
    expect(parseChefMenuItem({...menuItem, spiceLevel: 'HOT'})).toBeNull();
  });

  it('rejects malformed identity, boolean, numeric and timestamp fields', () => {
    expect(parseChefMenuItem({...menuItem, id: 'not-a-uuid'})).toBeNull();
    expect(parseChefMenuItem({...menuItem, available: 'true'})).toBeNull();
    expect(parseChefMenuItem({...menuItem, price: 0})).toBeNull();
    expect(parseChefMenuItem({...menuItem, updatedAt: 'not-a-date'})).toBeNull();
  });

  it('rejects a list when any row violates the exact item contract', () => {
    expect(parseChefMenuItems([menuItem, {...menuItem, status: 'ARCHIVED'}])).toBeNull();
  });

  it('accepts valid create/replace input and enforces backend validation primitives', () => {
    const request = {
      itemName: 'Paneer Bowl',
      category: 'Bowls',
      foodType: 'VEG' as const,
      price: 199,
      unitPackageWeightGrams: 450,
      thermoboxRequired: false,
      servesCount: 1,
      preparationTimeMinutes: 20,
      spiceLevel: 'MEDIUM' as const,
      available: true,
      status: 'ACTIVE' as const,
    };

    expect(validateChefMenuItemRequest(request)).toBe(request);
    expect(() =>
      validateChefMenuItemRequest({...request, itemName: ' '}),
    ).toThrow('Menu item name is required.');
    expect(() =>
      validateChefMenuItemRequest({...request, price: 0}),
    ).toThrow('Menu item price must be greater than zero.');
    expect(() =>
      validateChefMenuItemRequest({...request, unitPackageWeightGrams: 0}),
    ).toThrow('Package weight must be a positive integer.');
  });
});
