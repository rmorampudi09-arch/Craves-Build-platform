export const DISCOVERY_SEARCH_DEBOUNCE_MS = 250;

export function normalizeDiscoverySearchQuery(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

export function isDiscoverySearchActive(value: string): boolean {
  return normalizeDiscoverySearchQuery(value).length > 0;
}

interface SearchPaginationState {
  hasNextPage: boolean | undefined;
  isFetchingNextPage: boolean;
  isDebouncing: boolean;
}

export function canRequestNextSearchPage({
  hasNextPage,
  isFetchingNextPage,
  isDebouncing,
}: SearchPaginationState): boolean {
  return Boolean(hasNextPage && !isFetchingNextPage && !isDebouncing);
}
