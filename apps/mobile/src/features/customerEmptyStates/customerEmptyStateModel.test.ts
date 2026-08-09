import {customerEmptyStateAdapters} from './customerEmptyStateAdapters';
import {
  shouldNotifyConnectivityRecovery,
  type CustomerEmptyStateType,
} from './domain/customerEmptyStateModel';

describe('P78 customer empty state system', () => {
  it('provides all eight reference states with contextual origins and CTAs', () => {
    const models = [
      customerEmptyStateAdapters.emptyCart(),
      customerEmptyStateAdapters.noOrders(),
      customerEmptyStateAdapters.noSearchResults('paneer tikka'),
      customerEmptyStateAdapters.noFavorites(),
      customerEmptyStateAdapters.noInternet(),
      customerEmptyStateAdapters.noSavedAddresses(),
      customerEmptyStateAdapters.noReviews(),
      customerEmptyStateAdapters.noCoupons(),
    ];

    const types = new Set<CustomerEmptyStateType>(models.map(model => model.type));
    expect(types).toEqual(
      new Set<CustomerEmptyStateType>([
        'EMPTY_CART',
        'NO_ORDERS',
        'NO_SEARCH_RESULTS',
        'NO_FAVORITES',
        'NO_INTERNET',
        'NO_SAVED_ADDRESSES',
        'NO_REVIEWS',
        'NO_COUPONS',
      ]),
    );
    expect(models.every(model => model.primaryAction.label.length > 0)).toBe(true);
    expect(models.every(model => model.originRoute.length > 0)).toBe(true);
  });

  it('preserves the exact submitted search query for recovery', () => {
    const query = '  dosa near me  ';
    const model = customerEmptyStateAdapters.noSearchResults(query);

    expect(model.preservedSearchQuery).toBe(query);
    expect(model.primaryAction.id).toBe('CLEAR_SEARCH');
    expect(model.secondaryAction?.id).toBe('BROWSE_MEALS');
  });

  it('only exposes current-location recovery when the host has approved permission handling', () => {
    expect(
      customerEmptyStateAdapters.noSavedAddresses(false).secondaryAction,
    ).toBeUndefined();
    expect(
      customerEmptyStateAdapters.noSavedAddresses(true).secondaryAction?.id,
    ).toBe('USE_CURRENT_LOCATION');
  });

  it('only exposes offline browsing when a host has safe cached content', () => {
    expect(customerEmptyStateAdapters.noInternet(false).secondaryAction).toBeUndefined();
    expect(customerEmptyStateAdapters.noInternet(true).secondaryAction?.id).toBe(
      'BROWSE_OFFLINE',
    );
  });

  it('emits connectivity recovery once per offline-to-online edge rather than looping', () => {
    expect(shouldNotifyConnectivityRecovery('OFFLINE', 'ONLINE')).toBe(true);
    expect(shouldNotifyConnectivityRecovery('ONLINE', 'ONLINE')).toBe(false);
    expect(shouldNotifyConnectivityRecovery('UNKNOWN', 'ONLINE')).toBe(false);
    expect(shouldNotifyConnectivityRecovery('OFFLINE', 'OFFLINE')).toBe(false);
  });
});
