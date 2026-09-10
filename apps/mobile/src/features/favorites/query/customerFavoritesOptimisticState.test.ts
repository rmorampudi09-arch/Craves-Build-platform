import {applyOptimisticFavoriteState} from './customerFavoritesQueries';

const ITEM_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ITEM_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const BASE = [
  {menuItemId: ITEM_A, createdAt: '2026-08-20T20:00:00.000Z'},
];

describe('applyOptimisticFavoriteState', () => {
  it('adds a newly saved dish immediately without duplicating existing favorites', () => {
    const result = applyOptimisticFavoriteState(
      BASE,
      ITEM_B,
      true,
      '2026-08-21T00:00:00.000Z',
    );

    expect(result).toEqual([
      {menuItemId: ITEM_B, createdAt: '2026-08-21T00:00:00.000Z'},
      BASE[0],
    ]);
  });

  it('refreshes one existing favorite instead of duplicating it', () => {
    const result = applyOptimisticFavoriteState(
      BASE,
      ITEM_A,
      true,
      '2026-08-21T00:01:00.000Z',
    );

    expect(result).toEqual([
      {menuItemId: ITEM_A, createdAt: '2026-08-21T00:01:00.000Z'},
    ]);
  });

  it('removes a favorite immediately for responsive unsave UX', () => {
    expect(applyOptimisticFavoriteState(BASE, ITEM_A, false)).toEqual([]);
  });
});
