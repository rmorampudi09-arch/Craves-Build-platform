export type CustomerFavoritesServerCapability =
  | 'list'
  | 'add-favorite'
  | 'remove-favorite'
  | 'favorite-membership-sync'
  | 'paginated-list'
  | 'search'
  | 'category-counts';

export type CustomerFavoritesCapabilityAvailability = 'supported' | 'unsupported';

export const CUSTOMER_FAVORITES_SERVER_CAPABILITIES = {
  list: 'supported',
  'add-favorite': 'supported',
  'remove-favorite': 'supported',
  'favorite-membership-sync': 'supported',
  'paginated-list': 'unsupported',
  search: 'unsupported',
  'category-counts': 'unsupported',
} as const satisfies Record<CustomerFavoritesServerCapability, CustomerFavoritesCapabilityAvailability>;

export const CUSTOMER_FAVORITES_CONTRACT_BLOCKER_REASON =
  'favorites-advanced-query-contract-partial' as const;

export const CUSTOMER_FAVORITES_CONTRACT_BLOCKER_MESSAGE =
  'Favorites are persisted by the server for the signed-in customer. Pagination, server-side search, and category-count aggregation are not exposed yet, so those advanced query capabilities remain fail-closed.';

export const CUSTOMER_FAVORITES_USER_BLOCKER_COPY =
  'Your saved dishes sync with your Craves account. Search and category counts are applied only when authoritative data is available.';

export function getUnsupportedCustomerFavoritesCapabilities(): CustomerFavoritesServerCapability[] {
  return (Object.keys(CUSTOMER_FAVORITES_SERVER_CAPABILITIES) as CustomerFavoritesServerCapability[])
    .filter(capability => CUSTOMER_FAVORITES_SERVER_CAPABILITIES[capability] === 'unsupported');
}
