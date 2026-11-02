import {useEffect, useSyncExternalStore} from 'react';
import {publicApiClient} from '../http/transport';

export type AdvancedFeatureId =
  | 'taxonomy'
  | 'food-facts'
  | 'kitchen-capacity'
  | 'saved-feed'
  | 'food-lists'
  | 'group-orders'
  | 'personalized'
  | 'taste-data'
  | 'chef-insights'
  | 'demand-forecast';

const KNOWN_IDS: ReadonlySet<string> = new Set<AdvancedFeatureId>([
  'taxonomy',
  'food-facts',
  'kitchen-capacity',
  'saved-feed',
  'food-lists',
  'group-orders',
  'personalized',
  'taste-data',
  'chef-insights',
  'demand-forecast',
]);

const EMPTY: ReadonlySet<AdvancedFeatureId> = new Set();

// Ids that are enabled and available; unknown ids are ignored so the server
// can ship new features ahead of the app. A non-array body is invalid.
export function parseAdvancedFeatures(
  data: unknown,
): ReadonlySet<AdvancedFeatureId> | null {
  if (!Array.isArray(data)) return null;
  const on = new Set<AdvancedFeatureId>();
  for (const entry of data) {
    if (!entry || typeof entry !== 'object') continue;
    const {id, enabled, available} = entry as Record<string, unknown>;
    if (
      typeof id === 'string' &&
      KNOWN_IDS.has(id) &&
      enabled === true &&
      available === true
    ) {
      on.add(id as AdvancedFeatureId);
    }
  }
  return on;
}

let loaded: ReadonlySet<AdvancedFeatureId> | null = null;
let pending: Promise<ReadonlySet<AdvancedFeatureId>> | null = null;
const listeners = new Set<() => void>();

// One request per session; a failure caches "everything off" until restart.
export function loadAdvancedFeatures(): Promise<ReadonlySet<AdvancedFeatureId>> {
  if (!pending) {
    pending = publicApiClient
      .get<unknown>('/api/v1/advanced/features', {})
      .then(response => parseAdvancedFeatures(response.data) ?? EMPTY)
      .catch(() => EMPTY)
      .then(features => {
        loaded = features;
        listeners.forEach(listener => listener());
        return features;
      });
  }
  return pending;
}

export function isAdvancedFeatureOn(id: AdvancedFeatureId): boolean {
  return loaded?.has(id) ?? false;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useAdvancedFeature(id: AdvancedFeatureId): boolean {
  useEffect(() => {
    void loadAdvancedFeatures();
  }, []);
  return useSyncExternalStore(subscribe, () => isAdvancedFeatureOn(id));
}

export function resetAdvancedFeaturesForTests(): void {
  loaded = null;
  pending = null;
}
