export type CustomerEmptyStateType =
  | 'EMPTY_CART'
  | 'NO_ORDERS'
  | 'NO_SEARCH_RESULTS'
  | 'NO_FAVORITES'
  | 'NO_INTERNET'
  | 'NO_SAVED_ADDRESSES'
  | 'NO_REVIEWS'
  | 'NO_COUPONS';

export type CustomerEmptyStateOrigin =
  | 'CART'
  | 'ORDERS'
  | 'SEARCH'
  | 'FAVORITES'
  | 'OFFLINE_SHELL'
  | 'ADDRESSES'
  | 'REVIEWS'
  | 'COUPONS';

export type CustomerEmptyStateActionId =
  | 'BROWSE_MEALS'
  | 'REFRESH'
  | 'CLEAR_SEARCH'
  | 'SEARCH_NEXT_PAGE'
  | 'RETRY'
  | 'BROWSE_OFFLINE'
  | 'ADD_ADDRESS'
  | 'USE_CURRENT_LOCATION'
  | 'VIEW_ORDERS';

export type CustomerEmptyStateIllustration =
  | 'cart'
  | 'orders'
  | 'search'
  | 'heart'
  | 'wifi-off'
  | 'location'
  | 'star'
  | 'ticket';

export type CustomerConnectivity = 'ONLINE' | 'OFFLINE' | 'UNKNOWN';

export interface CustomerEmptyStateAction {
  id: CustomerEmptyStateActionId;
  label: string;
}

export interface CustomerEmptyStateModel {
  type: CustomerEmptyStateType;
  originRoute: CustomerEmptyStateOrigin;
  illustration: CustomerEmptyStateIllustration;
  title: string;
  description: string;
  preservedSearchQuery?: string;
  primaryAction: CustomerEmptyStateAction;
  secondaryAction?: CustomerEmptyStateAction;
}

export interface CustomerEmptyStateOptions {
  searchQuery?: string;
  canUseCurrentLocation?: boolean;
  canBrowseOffline?: boolean;
}

const action = (
  id: CustomerEmptyStateActionId,
  label: string,
): CustomerEmptyStateAction => ({id, label});

export function buildCustomerEmptyStateModel(
  type: CustomerEmptyStateType,
  options: CustomerEmptyStateOptions = {},
): CustomerEmptyStateModel {
  switch (type) {
    case 'EMPTY_CART':
      return {
        type,
        originRoute: 'CART',
        illustration: 'cart',
        title: 'Your cart is empty',
        description:
          'Add a meal from Home or Chefs and it will appear here instantly.',
        primaryAction: action('BROWSE_MEALS', 'Browse meals'),
      };
    case 'NO_ORDERS':
      return {
        type,
        originRoute: 'ORDERS',
        illustration: 'orders',
        title: 'No orders yet',
        description:
          'Once you place an order, its live status and total will appear here.',
        primaryAction: action('BROWSE_MEALS', 'Discover meals'),
        secondaryAction: action('REFRESH', 'Refresh'),
      };
    case 'NO_SEARCH_RESULTS':
      return {
        type,
        originRoute: 'SEARCH',
        illustration: 'search',
        title: 'No search results',
        description: 'Try another dish, kitchen, category, or clear your search.',
        preservedSearchQuery: options.searchQuery ?? '',
        primaryAction: action('CLEAR_SEARCH', 'Clear search'),
        secondaryAction: action('BROWSE_MEALS', 'Browse all meals'),
      };
    case 'NO_FAVORITES':
      return {
        type,
        originRoute: 'FAVORITES',
        illustration: 'heart',
        title: 'No favorites yet',
        description:
          'Save dishes or kitchens you love and they will stay together here.',
        primaryAction: action('BROWSE_MEALS', 'Browse meals'),
      };
    case 'NO_INTERNET':
      return {
        type,
        originRoute: 'OFFLINE_SHELL',
        illustration: 'wifi-off',
        title: 'You are offline',
        description:
          'Check your connection, then try again. Saved content stays visible when it is safe to show.',
        primaryAction: action('RETRY', 'Try again'),
        secondaryAction: options.canBrowseOffline
          ? action('BROWSE_OFFLINE', 'Keep browsing saved content')
          : undefined,
      };
    case 'NO_SAVED_ADDRESSES':
      return {
        type,
        originRoute: 'ADDRESSES',
        illustration: 'location',
        title: 'No saved addresses',
        description:
          'Add a delivery address so Craves can show serviceable meals and delivery details.',
        primaryAction: action('ADD_ADDRESS', 'Add new address'),
        secondaryAction: options.canUseCurrentLocation
          ? action('USE_CURRENT_LOCATION', 'Use current location')
          : undefined,
      };
    case 'NO_REVIEWS':
      return {
        type,
        originRoute: 'REVIEWS',
        illustration: 'star',
        title: 'No reviews yet',
        description:
          'Eligible delivered orders will appear here when the approved review-list capability is available.',
        primaryAction: action('VIEW_ORDERS', 'View orders'),
      };
    case 'NO_COUPONS':
      return {
        type,
        originRoute: 'COUPONS',
        illustration: 'ticket',
        title: 'No coupons available',
        description:
          'Available offers are verified for your current cart and account before they can be applied.',
        primaryAction: action('BROWSE_MEALS', 'Browse meals'),
      };
  }
}

export function shouldNotifyConnectivityRecovery(
  previous: CustomerConnectivity,
  current: CustomerConnectivity,
): boolean {
  return previous === 'OFFLINE' && current === 'ONLINE';
}
