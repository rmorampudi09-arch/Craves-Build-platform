export const CUSTOMER_FAVORITES_CONTRACT_BLOCKER_REASON =
  'favorites-api-contract-not-available' as const;

export type CustomerFavoritesServerCapability =
  | 'paginated-list'
  | 'search'
  | 'category-counts'
  | 'remove-favorite'
  | 'favorite-membership-sync';

export type CustomerFavoritesCapabilityAvailability = 'unsupported';

export const CUSTOMER_FAVORITES_SERVER_CAPABILITIES = {
  'paginated-list': 'unsupported',
  search: 'unsupported',
  'category-counts': 'unsupported',
  'remove-favorite': 'unsupported',
  'favorite-membership-sync': 'unsupported',
} as const satisfies Record<
  CustomerFavoritesServerCapability,
  CustomerFavoritesCapabilityAvailability
>;

export const CUSTOMER_FAVORITES_CONTRACT_BLOCKER_MESSAGE =
  'The current approved mobile/backend contract does not expose a Favorites list, search/count contract, or favorite mutation operation. The mobile app must not fabricate saved dishes or use local-only favorite state as account truth.';

export const CUSTOMER_FAVORITES_USER_BLOCKER_COPY =
  'Favorites syncing is not available in this build yet. We will not show a local-only list that could differ from your account. Your existing saved data is not changed by this screen.';

export function getUnsupportedCustomerFavoritesCapabilities(): CustomerFavoritesServerCapability[] {
  return Object.keys(
    CUSTOMER_FAVORITES_SERVER_CAPABILITIES,
  ) as CustomerFavoritesServerCapability[];
}
