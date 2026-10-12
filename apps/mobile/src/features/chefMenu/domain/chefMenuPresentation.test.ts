import type {ChefMenuItem} from '../api/chefMenuApi';
import {
  chefMenuCategoryLabel,
  chefMenuRowNote,
  deriveChefMenuSummary,
  filterChefMenuItems,
  formatChefMenuCategory,
  getChefMenuCategories,
  getChefMenuDisplayState,
  getChefMenuPrimaryImageUrl,
} from './chefMenuPresentation';

function item(
  overrides: Partial<ChefMenuItem> & Pick<ChefMenuItem, 'id' | 'itemName'>,
): ChefMenuItem {
  const {id, itemName, ...rest} = overrides;

  return {
    id,
    kitchenId: '00000000-0000-4000-8000-000000000100',
    itemName,
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
    ...rest,
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

  it('the Off filter holds every dish customers cannot order: switched off or inactive, never drafts', () => {
    expect(filterChefMenuItems(items, '', null, 'OFF').map(x => x.id)).toEqual([items[1].id, items[3].id]);
    expect(filterChefMenuItems(items, '', null, 'AVAILABLE').map(x => x.id)).toEqual([items[0].id]);
    expect(filterChefMenuItems(items, '', null, 'DRAFT').map(x => x.id)).toEqual([items[2].id]);
  });

  it('says on each row how long a dish takes, or what is wrong with it', () => {
    expect(items.map(chefMenuRowNote)).toEqual([
      {text: '20 min', off: false},
      {text: 'Off for customers', off: true},
      null,
      {text: 'Off for customers', off: true},
    ]);
    expect(chefMenuRowNote({...items[0], preparationTimeMinutes: null})).toEqual({text: 'prep time missing', off: false});
  });

  it('search finds a Snakes-category dish by "snacks" (what is shown) and by "snakes" (what is stored)', () => {
    const murukku = item({id: '00000000-0000-4000-8000-000000000020', itemName: 'Murukku', category: 'Snakes'});
    expect(filterChefMenuItems([...items, murukku], 'snacks', null, 'ALL')).toEqual([murukku]);
    expect(filterChefMenuItems([...items, murukku], 'snakes', null, 'ALL')).toEqual([murukku]);
  });

  it('shows the stored category Snakes as Snacks and legacy Biriyani as Biryani', () => {
    expect(chefMenuCategoryLabel('Snakes')).toBe('Snacks');
    expect(chefMenuCategoryLabel('Biriyani')).toBe('Biryani');
    expect(chefMenuCategoryLabel('Curry')).toBe('Curry');
  });

  it('presents legacy Biriyani values as Biryani for chef filters', () => {
    const legacyBiryani = item({
      id: '00000000-0000-4000-8000-000000000006',
      itemName: 'Family Biryani',
      category: 'Biriyani',
    });

    expect(formatChefMenuCategory(legacyBiryani.category)).toBe('Biryani');
    expect(getChefMenuCategories([legacyBiryani])).toEqual(['Biryani']);
    expect(filterChefMenuItems([legacyBiryani], '', 'Biryani', 'ALL')).toEqual([
      legacyBiryani,
    ]);
  });

  it('uses the primary image when present', () => {
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
  });
});
