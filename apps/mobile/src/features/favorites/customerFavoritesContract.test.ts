import {
  CUSTOMER_FAVORITES_CONTRACT_BLOCKER_MESSAGE,
  CUSTOMER_FAVORITES_CONTRACT_BLOCKER_REASON,
  CUSTOMER_FAVORITES_SERVER_CAPABILITIES,
  getUnsupportedCustomerFavoritesCapabilities,
} from './domain/customerFavoritesContract';

describe('customerFavoritesContract', () => {
  it('fails closed when the approved server Favorites contract is absent', () => {
    expect(CUSTOMER_FAVORITES_CONTRACT_BLOCKER_REASON).toBe(
      'favorites-api-contract-not-available',
    );
    expect(Object.values(CUSTOMER_FAVORITES_SERVER_CAPABILITIES)).toEqual([
      'unsupported',
      'unsupported',
      'unsupported',
      'unsupported',
      'unsupported',
    ]);
    expect(getUnsupportedCustomerFavoritesCapabilities()).toEqual([
      'paginated-list',
      'search',
      'category-counts',
      'remove-favorite',
      'favorite-membership-sync',
    ]);
  });

  it('records that local-only saved dishes cannot be treated as account truth', () => {
    expect(CUSTOMER_FAVORITES_CONTRACT_BLOCKER_MESSAGE).toContain(
      'must not fabricate saved dishes',
    );
    expect(CUSTOMER_FAVORITES_CONTRACT_BLOCKER_MESSAGE).toContain(
      'local-only favorite state',
    );
  });
});
