import {httpClient} from '../../../core/http/httpClient';
import {
  SAVED_CATALOG_BATCH_SIZE,
  chunkSavedMenuItemIds,
  resolveSavedCatalogItems,
} from './savedCatalogApi';

jest.mock('../../../core/http/httpClient', () => ({
  httpClient: {
    post: jest.fn(),
  },
}));

function uuid(index: number): string {
  return `00000000-0000-4000-8000-${index.toString().padStart(12, '0')}`;
}

function resolvedItem(menuItemId: string) {
  return {
    menuItemId,
    found: true,
    availabilityState: 'AVAILABLE_NOW',
    evaluatedAt: '2026-08-21T00:00:00Z',
    itemName: `Dish ${menuItemId}`,
    description: null,
    category: 'HOME_STYLE',
    foodType: 'VEG',
    price: 120,
    currency: 'INR',
    itemStatus: 'ACTIVE',
    itemAvailable: true,
    kitchenId: '10000000-0000-4000-8000-000000000001',
    kitchenName: 'Home Kitchen',
    kitchenDisplayName: 'Home Kitchen',
    kitchenStatus: 'ACTIVE',
    areaName: 'Hyderabad',
    city: 'Hyderabad',
    state: 'Telangana',
    primaryImageUrl: null,
    timezoneId: 'Asia/Kolkata',
    scheduleConfigured: true,
    acceptingOrders: true,
    paused: false,
    availableNow: true,
    nextAvailabilityAt: null,
  } as const;
}

describe('savedCatalogApi', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('chunks the current 200-favorite ceiling into at most two Catalog requests', () => {
    const ids = Array.from({length: 200}, (_, index) => uuid(index + 1));
    const chunks = chunkSavedMenuItemIds(ids);

    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toHaveLength(SAVED_CATALOG_BATCH_SIZE);
    expect(chunks[1]).toHaveLength(SAVED_CATALOG_BATCH_SIZE);
  });

  it('collapses duplicate IDs while preserving first-seen order', () => {
    const first = uuid(1);
    const second = uuid(2);

    expect(chunkSavedMenuItemIds([first, second, first])).toEqual([
      [first, second],
    ]);
  });

  it('uses only two Catalog calls for 200 saved dishes and restores favorite order', async () => {
    const ids = Array.from({length: 200}, (_, index) => uuid(index + 1));
    (httpClient.post as jest.Mock).mockImplementation(
      async (_url: string, body: {menuItemIds: string[]}) => ({
        evaluatedAt: '2026-08-21T00:00:00Z',
        items: [...body.menuItemIds].reverse().map(resolvedItem),
      }),
    );

    const resolved = await resolveSavedCatalogItems(ids);

    expect(httpClient.post).toHaveBeenCalledTimes(2);
    expect(httpClient.post).toHaveBeenNthCalledWith(
      1,
      '/api/v1/discovery/saved/menu-items/resolve',
      {menuItemIds: ids.slice(0, 100)},
      {signal: undefined},
    );
    expect(httpClient.post).toHaveBeenNthCalledWith(
      2,
      '/api/v1/discovery/saved/menu-items/resolve',
      {menuItemIds: ids.slice(100)},
      {signal: undefined},
    );
    expect(resolved.map(item => item.menuItemId)).toEqual(ids);
  });

  it('fails closed if Catalog omits a requested Saved item', async () => {
    const first = uuid(1);
    const second = uuid(2);
    (httpClient.post as jest.Mock).mockResolvedValue({
      evaluatedAt: '2026-08-21T00:00:00Z',
      items: [resolvedItem(first)],
    });

    await expect(resolveSavedCatalogItems([first, second])).rejects.toThrow(
      'Saved dish details were incomplete.',
    );
  });
});
