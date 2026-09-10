import {
  buildCustomerEmptyStateModel,
  type CustomerEmptyStateModel,
} from './domain/customerEmptyStateModel';

export const customerEmptyStateAdapters = {
  emptyCart(): CustomerEmptyStateModel {
    return buildCustomerEmptyStateModel('EMPTY_CART');
  },

  noOrders(): CustomerEmptyStateModel {
    return buildCustomerEmptyStateModel('NO_ORDERS');
  },

  noSearchResults(searchQuery: string): CustomerEmptyStateModel {
    return buildCustomerEmptyStateModel('NO_SEARCH_RESULTS', {searchQuery});
  },

  noFavorites(): CustomerEmptyStateModel {
    return buildCustomerEmptyStateModel('NO_FAVORITES');
  },

  noInternet(canBrowseOffline = false): CustomerEmptyStateModel {
    return buildCustomerEmptyStateModel('NO_INTERNET', {canBrowseOffline});
  },

  noSavedAddresses(canUseCurrentLocation = false): CustomerEmptyStateModel {
    return buildCustomerEmptyStateModel('NO_SAVED_ADDRESSES', {
      canUseCurrentLocation,
    });
  },

  noReviews(): CustomerEmptyStateModel {
    return buildCustomerEmptyStateModel('NO_REVIEWS');
  },

  noCoupons(): CustomerEmptyStateModel {
    return buildCustomerEmptyStateModel('NO_COUPONS');
  },
};
