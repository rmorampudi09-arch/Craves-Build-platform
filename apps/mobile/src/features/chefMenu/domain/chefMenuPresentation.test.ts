import type {ChefMenuItem} from '../api/chefMenuApi';
import {
  deriveChefMenuSummary,
  filterChefMenuItems,
  formatChefMenuPrice,
  getChefMenuCategories,
  getChefMenuDisplayState,
  getChefMenuPrimaryImageUrl,
} from './chefMenuPresentation';

function item(
  overrides: Partial<ChefMenuItem> & Pick<ChefMenuItem, 'id' | 'itemName'>,
): ChefMenuItem {
  return {
    id: overrides.id,
    kitchenId: '00000000-0000-4000-8000-000000000100',
    itemName: overrides.itemName,
    description: null,
    category: 'Mains',
    foodType: 'VEG',
    price: 120,
    currency: 'INR',
    servesCount: 1,
    preparationTimeMinutes: 20,
    spiceLevel: 'MEDIUM',
    unitPackageWeightGrams: 350,
    thermoboxRequired: false,
    available: true,
    status: 'ACTIVE',
    images: [],
    createdAt: '2026-08-09T10:00:00Z',
    updatedAt: '2026-08-09T10:00:00Z',
    ...overrides,
  };
}

describe('chefMenuPresentation', () => {
  const items = [
    item({
      id: '00000000-0000-4000-8000-000000000001',
      itemName: 'Paneer Bowl',
      description: 'Smoky paneer and rice',
    }),
    item({
      id: '00000000-0000-4000-8000-000000000002',
      itemName: 'Chicken Curry',
      category: 'Curries',
      foodType: 'NON_VEG',
      available: false,
    }),
    item({
      id: '00000000-0000-4000-8000-000000000003',
      itemName: 'Draft Dessert',
      category: 'Desserts',
      status: 'DRAFT',
      available: false,
    }),
    item({
      id: '00000000-0000-4000-8000-000000000004',
      itemName: 'Paused Soup',
      category: 'Soups',
      status: 'INACTIVE',
    }),
  ];

  it('derives only exact backend-backed display states', () => {
    expect(items.map(getChefMenuDisplayState)).toEqual([
      'AVAILABLE',
      'UNAVAILABLE',
      'DRAFT',
      'INACTIVE',
    ]);
    expect(deriveChefMenuSummary(items)).toEqual({
      total: 4,
      available: 1,
      unavailable: 1,
      draft: 1,
      inactive: 1,
    });
  });

  it('filters the currently loaded exact list without inventing server query params', () => {
    expect(filterChefMenuItems(items, 'paneer', null, 'ALL').map(x => x.id)).toEqual([
      items[0].id,
    ]);
    expect(filterChefMenuItems(items, '', 'Curries', 'ALL').map(x => x.id)).toEqual([
      items[1].id,
    ]);
    expect(filterChefMenuItems(items, '', null, 'INACTIVE').map(x => x.id)).toEqual([
      items[3].id,
    ]);
    expect(getChefMenuCategories(items)).toEqual([
      'Curries',
      'Desserts',
      'Mains',
      'Soups',
    ]);
  });

  it('uses the primary image when present and keeps backend currency explicit', () => {
    const withImages = item({
      id: '00000000-0000-4000-8000-000000000005',
      itemName: 'Biryani',
      images: [
        {
          id: '00000000-0000-4000-8000-000000000011',
          menuItemId: '00000000-0000-4000-8000-000000000005',
          blobContainer: 'menu',
          blobName: 'secondary.webp',
          contentType: 'image/webp',
          fileSizeBytes: 100,
          publicUrl: 'https://example.test/secondary.webp',
          sortOrder: 0,
          primary: false,
          createdAt: '2026-08-09T10:00:00Z',
        },
        {
          id: '00000000-0000-4000-8000-000000000012',
          menuItemId: '00000000-0000-4000-8000-000000000005',
          blobContainer: 'menu',
          blobName: 'primary.webp',
          contentType: 'image/webp',
          fileSizeBytes: 100,
          publicUrl: 'https://example.test/primary.webp',
          sortOrder: 1,
          primary: true,
          createdAt: '2026-08-09T10:00:00Z',
        },
      ],
      price: 245.5,
    });

    expect(getChefMenuPrimaryImageUrl(withImages)).toBe(
      'https://example.test/primary.webp',
    );
    expect(formatChefMenuPrice(withImages)).toBe('₹245.50');
  });
});
