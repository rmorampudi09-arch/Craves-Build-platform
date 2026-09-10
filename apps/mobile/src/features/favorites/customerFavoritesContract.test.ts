import {
  CUSTOMER_FAVORITES_CONTRACT_BLOCKER_MESSAGE,
  CUSTOMER_FAVORITES_SERVER_CAPABILITIES,
  getUnsupportedCustomerFavoritesCapabilities,
} from './domain/customerFavoritesContract';

describe('customerFavoritesContract', () => {
  it('records the server-backed favorite capabilities now available to mobile', () => {
    expect(CUSTOMER_FAVORITES_SERVER_CAPABILITIES).toMatchObject({
      list: 'supported',
      'add-favorite': 'supported',
      'remove-favorite': 'supported',
      'favorite-membership-sync': 'supported',
    });
    expect(getUnsupportedCustomerFavoritesCapabilities()).toEqual([
      'paginated-list',
      'search',
      'category-counts',
    ]);
  });

  it('keeps only advanced unsupported querying fail-closed', () => {
    expect(CUSTOMER_FAVORITES_CONTRACT_BLOCKER_MESSAGE).toContain('persisted by the server');
    expect(CUSTOMER_FAVORITES_CONTRACT_BLOCKER_MESSAGE).toContain('Pagination');
  });
});
