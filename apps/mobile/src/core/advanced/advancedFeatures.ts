import {useEffect, useSyncExternalStore} from 'react';
import {
  AppState,
  type AppStateStatus,
  type NativeEventSubscription,
} from 'react-native';
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
let latestRequest = 0;
let appState: AppStateStatus | null = null;
let appStateSubscription: NativeEventSubscription | null = null;
const listeners = new Set<() => void>();

// Starts a new read even if one finished. Until the answer arrives the previous
// result stays; a failed re-read keeps it too (so a chef's picks survive a bad
// moment), and only a failed first read means everything is off. Only the
// newest read may write the result, so a slow older answer is dropped.
export function refreshAdvancedFeatures(): Promise<
  ReadonlySet<AdvancedFeatureId>
> {
  const mine = ++latestRequest;
  const request = publicApiClient
    .get<unknown>('/api/v1/advanced/features', {})
    .then(response => parseAdvancedFeatures(response.data) ?? EMPTY)
    .catch(() => loaded ?? EMPTY)
    .then(features => {
      if (mine === latestRequest) {
        loaded = features;
        listeners.forEach(listener => listener());
      }
      return features;
    });
  pending = request;
  return request;
}

function onAppStateChange(next: AppStateStatus) {
  const wasAway = appState === 'background' || appState === 'inactive';
  appState = next;
  if (wasAway && next === 'active') void refreshAdvancedFeatures();
}

// Launch read, shared by concurrent callers; the first call also starts
// re-reading each time the app returns to the foreground.
export function loadAdvancedFeatures(): Promise<ReadonlySet<AdvancedFeatureId>> {
  if (!appStateSubscription) {
    appState = AppState.currentState;
    appStateSubscription = AppState.addEventListener(
      'change',
      onAppStateChange,
    );
  }
  return pending ?? refreshAdvancedFeatures();
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
  latestRequest++;
  loaded = null;
  pending = null;
  appState = null;
  appStateSubscription?.remove();
  appStateSubscription = null;
}
