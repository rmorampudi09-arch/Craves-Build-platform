import {httpClient} from '../../../core/http/httpClient';
import {
  CHEF_MENU_CONTRACT_GAPS,
  CHEF_MENU_FOOD_TYPES,
  CHEF_MENU_IMAGE_CONTENT_TYPES,
  CHEF_MENU_IMAGE_FILE_FIELD,
  CHEF_MENU_ITEM_STATUSES,
  CHEF_MENU_SPICE_LEVELS,
  chefMenuApi,
  parseChefMenuItem,
  parseChefMenuItems,
  validateChefMenuItemRequest,
} from './chefMenuApi';

const MENU_ITEM_ID = '123e4567-e89b-42d3-a456-426614174000';
const KITCHEN_ID = '123e4567-e89b-42d3-a456-426614174001';
const IMAGE_ID = '123e4567-e89b-42d3-a456-426614174002';

const menuItem = {
  id: MENU_ITEM_ID,
  kitchenId: KITCHEN_ID,
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
      id: IMAGE_ID,
      menuItemId: MENU_ITEM_ID,
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

describe('chefMenuApi contract model', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('locks the exact backend enums and media content types', () => {
    expect(CHEF_MENU_ITEM_STATUSES).toEqual(['DRAFT', 'ACTIVE', 'INACTIVE']);
    expect(CHEF_MENU_FOOD_TYPES).toEqual(['VEG', 'NON_VEG', 'EGG']);
    expect(CHEF_MENU_SPICE_LEVELS).toEqual(['MILD', 'MEDIUM', 'SPICY']);
    expect(CHEF_MENU_IMAGE_CONTENT_TYPES).toEqual([
      'image/jpeg',
      'image/png',
      'image/webp',
    ]);
    expect(CHEF_MENU_IMAGE_FILE_FIELD).toBe('file');
  });

  it('keeps missing Guide capabilities explicit instead of inventing routes or enums', () => {
    expect(CHEF_MENU_CONTRACT_GAPS.itemDetail).toContain('No chef-owned');
    expect(CHEF_MENU_CONTRACT_GAPS.listQuery).toContain('no search');
    expect(CHEF_MENU_CONTRACT_GAPS.visibility).toContain('status plus available');
    expect(CHEF_MENU_CONTRACT_GAPS.deleteOrDuplicate).toContain('No delete');
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
    expect(validateChefMenuItemRequest(request)).toBe(request);
    expect(() =>
      validateChefMenuItemRequest({...request, itemName: ' '}),
    ).toThrow('Menu item name is required.');
    expect(() =>
      validateChefMenuItemRequest({...request, price: 0.001}),
    ).toThrow('Menu item price must be at least 0.01.');
    expect(() =>
      validateChefMenuItemRequest({...request, unitPackageWeightGrams: 0}),
    ).toThrow('Package weight must be a positive integer.');
  });

  it('uses the exact Chef menu list route', async () => {
    const get = jest.spyOn(httpClient, 'get').mockResolvedValue([menuItem]);

    await expect(chefMenuApi.listItems()).resolves.toHaveLength(1);

    expect(get).toHaveBeenCalledWith('/api/v1/kitchens/me/menu-items', {
      signal: undefined,
      dedupeKey: 'chef-menu-items',
    });
  });

  it('uses the exact Chef menu create route and request body', async () => {
    const post = jest.spyOn(httpClient, 'post').mockResolvedValue(menuItem);

    await chefMenuApi.createItem(request);

    expect(post).toHaveBeenCalledWith(
      '/api/v1/kitchens/me/menu-items',
      request,
      {signal: undefined},
    );
  });

  it('uses PUT replacement semantics for a chef-owned menu item', async () => {
    const put = jest.spyOn(httpClient, 'put').mockResolvedValue(menuItem);

    await chefMenuApi.replaceItem(MENU_ITEM_ID, request);

    expect(put).toHaveBeenCalledWith(
      `/api/v1/kitchens/me/menu-items/${MENU_ITEM_ID}`,
      request,
      {signal: undefined},
    );
  });

  it('uses the exact availability mutation shape without inventing visibility state', async () => {
    const patch = jest.spyOn(httpClient, 'patch').mockResolvedValue({
      ...menuItem,
      available: false,
    });
    const availability = {available: false, reason: 'Sold out'};

    await chefMenuApi.updateAvailability(MENU_ITEM_ID, availability);

    expect(patch).toHaveBeenCalledWith(
      `/api/v1/kitchens/me/menu-items/${MENU_ITEM_ID}/availability`,
      availability,
      {signal: undefined},
    );
  });

  it('uses multipart file body plus the exact primary request parameter for media upload', async () => {
    const image = menuItem.images[0];
    const post = jest.spyOn(httpClient, 'post').mockResolvedValue(image);
    const formData = {} as FormData;

    await chefMenuApi.uploadImage(MENU_ITEM_ID, formData, true);

    expect(post).toHaveBeenCalledWith(
      `/api/v1/kitchens/me/menu-items/${MENU_ITEM_ID}/images?primary=true`,
      formData,
      {signal: undefined},
    );
  });

  it('rejects malformed menu item identifiers before a write is sent', async () => {
    await expect(
      chefMenuApi.replaceItem('not-a-menu-item-id', request),
    ).rejects.toThrow('Chef menu item ID must be a UUID.');
  });
});
