import {httpClient} from '../../../core/http/httpClient';
import {
  PUBLIC_MENU_BATCH_RESOLVE_PATH,
  PUBLIC_MENU_BATCH_SIZE,
  chunkPublicMenuItemIds,
  parsePublicResolvedMenuItems,
  resolvePublicMenuItems,
} from './publicMenuBatchApi';

jest.mock('../../../core/http/httpClient', () => ({
  httpClient: {
    post: jest.fn(),
  },
}));

function uuid(index: number): string {
  return `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
}

function item(id: string, kitchenId = uuid(900)) {
  return {
    id,
    kitchenId,
    itemName: `Dish ${id}`,
    price: 199,
    currency: 'INR',
    unitPackageWeightGrams: 450,
    thermoboxRequired: false,
  };
}

describe('publicMenuBatchApi', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('chunks visible repeat-order item IDs into bounded groups of 100', () => {
    const ids = Array.from({length: 205}, (_, index) => uuid(index + 1));
    const chunks = chunkPublicMenuItemIds(ids);

    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toHaveLength(PUBLIC_MENU_BATCH_SIZE);
    expect(chunks[1]).toHaveLength(PUBLIC_MENU_BATCH_SIZE);
    expect(chunks[2]).toHaveLength(5);
  });

  it('deduplicates IDs while preserving first-seen order', () => {
    expect(chunkPublicMenuItemIds([uuid(1), uuid(2), uuid(1)])).toEqual([
      [uuid(1), uuid(2)],
    ]);
  });

  it('accepts omitted unavailable IDs without inventing missing rows', () => {
    expect(
      parsePublicResolvedMenuItems([item(uuid(1))], [uuid(1), uuid(2)]),
    ).toEqual([item(uuid(1))]);
  });

  it('rejects extra fields, duplicate rows and unrequested IDs', () => {
    expect(
      parsePublicResolvedMenuItems(
        [{...item(uuid(1)), internalChefIdentityId: 'private'}],
        [uuid(1)],
      ),
    ).toBeNull();

    expect(
      parsePublicResolvedMenuItems(
        [item(uuid(1)), item(uuid(1))],
        [uuid(1)],
      ),
    ).toBeNull();

    expect(
      parsePublicResolvedMenuItems([item(uuid(2))], [uuid(1)]),
    ).toBeNull();
  });

  it('uses the exact current source route and restores requested order', async () => {
    const ids = [uuid(2), uuid(1)];
    (httpClient.post as jest.Mock).mockResolvedValue([
      item(uuid(1)),
      item(uuid(2)),
    ]);

    await expect(resolvePublicMenuItems(ids)).resolves.toEqual([
      item(uuid(2)),
      item(uuid(1)),
    ]);

    expect(httpClient.post).toHaveBeenCalledWith(
      PUBLIC_MENU_BATCH_RESOLVE_PATH,
      {menuItemIds: ids},
      {signal: undefined},
    );
  });

  it('rejects invalid IDs and more than the visible-card ceiling before transport', async () => {
    await expect(resolvePublicMenuItems(['bad-id'])).rejects.toThrow(
      'PUBLIC_MENU_BATCH_ID_INVALID',
    );

    await expect(
      resolvePublicMenuItems(
        Array.from({length: 601}, (_, index) => uuid(index + 1)),
      ),
    ).rejects.toThrow('PUBLIC_MENU_BATCH_VISIBLE_LIMIT_EXCEEDED');

    expect(httpClient.post).not.toHaveBeenCalled();
  });
});
