import type {EmptyIllustrationName} from '../../../shared/components/EmptyIllustration';

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
  | 'VIEW_ORDERS'
  | 'VIEW_MEAL_PLANS';

export type CustomerEmptyStateIllustration = EmptyIllustrationName;

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
        description: 'Dishes you add from home chefs near you will show up here.',
        primaryAction: action('BROWSE_MEALS', 'Explore home chefs'),
        secondaryAction: action('VIEW_MEAL_PLANS', 'See meal plans'),
      };
    case 'NO_ORDERS':
      return {
        type,
        originRoute: 'ORDERS',
        illustration: 'orders',
        title: 'No orders yet',
        description:
          'When you order from a home chef, you can follow it live from the kitchen to your door here.',
        primaryAction: action('BROWSE_MEALS', 'Find something to eat'),
      };
    case 'NO_SEARCH_RESULTS':
      return {
        type,
        originRoute: 'SEARCH',
        illustration: 'search',
        title: options.searchQuery?.trim()
          ? `No results for “${options.searchQuery.trim()}”`
          : 'No search results',
        description: 'Try another dish or kitchen name, or check the spelling.',
        preservedSearchQuery: options.searchQuery ?? '',
        primaryAction: action('CLEAR_SEARCH', 'Clear search'),
        secondaryAction: action('BROWSE_MEALS', 'Browse all dishes'),
      };
    case 'NO_FAVORITES':
      return {
        type,
        originRoute: 'FAVORITES',
        illustration: 'saved',
        title: 'No favorites yet',
        description:
          'Save dishes or kitchens you love and they will stay together here.',
        primaryAction: action('BROWSE_MEALS', 'Browse meals'),
      };
    case 'NO_INTERNET':
      return {
        type,
        originRoute: 'OFFLINE_SHELL',
        illustration: 'offline',
        title: "You're offline",
        description: 'Check your Wi-Fi or mobile data, then try again.',
        primaryAction: action('RETRY', 'Try again'),
        secondaryAction: options.canBrowseOffline
          ? action('BROWSE_OFFLINE', 'Keep browsing saved content')
          : undefined,
      };
    case 'NO_SAVED_ADDRESSES':
      return {
        type,
        originRoute: 'ADDRESSES',
        illustration: 'addresses',
        title: 'No saved addresses',
        description:
          "Add where you'd like your food delivered. You can save home, work and more.",
        primaryAction: action('ADD_ADDRESS', 'Add new address'),
        secondaryAction: options.canUseCurrentLocation
          ? action('USE_CURRENT_LOCATION', 'Use current location')
          : undefined,
      };
    case 'NO_REVIEWS':
      return {
        type,
        originRoute: 'REVIEWS',
        illustration: 'reviews',
        title: 'No reviews yet',
        description:
          'Your reviews of delivered orders will show here.',
        primaryAction: action('VIEW_ORDERS', 'View orders'),
      };
    case 'NO_COUPONS':
      return {
        type,
        originRoute: 'COUPONS',
        illustration: 'comingSoon',
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

/**
 * "Coming soon to Madhapur" for an address with no home chefs nearby. A location's name falls back to the
 * whole address line when it has no area, which is too long for a title, so that reads "your area".
 */
export function comingSoonTitle(locationName?: string | null): string {
  const area = locationName?.trim();
  return `Coming soon to ${area && area.length <= 28 && !area.includes(',') ? area : 'your area'}`;
}
