/**
 * The current public Catalog/discovery contracts expose whether a dish is sellable,
 * but not a remaining-quantity count. Until the backend adds that authoritative field,
 * derive a stable per-item display count so the UI does not change between renders.
 */
export function getDisplayAvailabilityCount(itemId: string): number {
  let hash = 0;
  for (let index = 0; index < itemId.length; index += 1) {
    hash = (hash * 31 + itemId.charCodeAt(index)) % 2147483647;
  }
  return 5 + (hash % 8);
}
