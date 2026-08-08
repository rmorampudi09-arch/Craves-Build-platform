import {createSlice, type PayloadAction} from '@reduxjs/toolkit';

export type DiscoveryFilterSurface = 'HOME' | 'CHEFS';
export type DiscoverySortOption =
  | 'RECOMMENDED'
  | 'PRICE_LOW_TO_HIGH'
  | 'PRICE_HIGH_TO_LOW';
export type DiscoveryDietOption = 'VEG' | 'NON_VEG' | 'EGG';

export interface DiscoveryFilterSnapshot {
  sort: DiscoverySortOption;
  cuisineIds: string[];
  diets: DiscoveryDietOption[];
}

export interface DiscoveryFilterSession {
  scopeKey: string | null;
  applied: DiscoveryFilterSnapshot;
}

export interface DiscoveryFilterState {
  sessions: Record<DiscoveryFilterSurface, DiscoveryFilterSession>;
}

const DIET_ORDER: readonly DiscoveryDietOption[] = ['VEG', 'NON_VEG', 'EGG'];

export function createDefaultDiscoveryFilters(): DiscoveryFilterSnapshot {
  return {
    sort: 'RECOMMENDED',
    cuisineIds: [],
    diets: [],
  };
}

function createEmptySession(scopeKey: string | null = null): DiscoveryFilterSession {
  return {
    scopeKey,
    applied: createDefaultDiscoveryFilters(),
  };
}

const initialState: DiscoveryFilterState = {
  sessions: {
    HOME: createEmptySession(),
    CHEFS: createEmptySession(),
  },
};

interface ScopedFilterAction {
  surface: DiscoveryFilterSurface;
  scopeKey: string | null;
}

interface FiltersAppliedAction extends ScopedFilterAction {
  filters: DiscoveryFilterSnapshot;
}

function normalizeFilters(filters: DiscoveryFilterSnapshot): DiscoveryFilterSnapshot {
  const cuisineIds = [...new Set(filters.cuisineIds.map(value => value.trim()).filter(Boolean))]
    .sort();
  const dietSet = new Set(filters.diets);

  return {
    sort: filters.sort,
    cuisineIds,
    diets: DIET_ORDER.filter(diet => dietSet.has(diet)),
  };
}

function ensureScope(
  state: DiscoveryFilterState,
  surface: DiscoveryFilterSurface,
  scopeKey: string | null,
): DiscoveryFilterSession {
  const session = state.sessions[surface];
  if (session.scopeKey === scopeKey) {
    return session;
  }

  const nextSession = createEmptySession(scopeKey);
  state.sessions[surface] = nextSession;
  return nextSession;
}

const discoveryFilterSlice = createSlice({
  name: 'discoveryFilters',
  initialState,
  reducers: {
    scopeChanged(state, action: PayloadAction<ScopedFilterAction>) {
      ensureScope(state, action.payload.surface, action.payload.scopeKey);
    },
    filtersApplied(state, action: PayloadAction<FiltersAppliedAction>) {
      const session = ensureScope(
        state,
        action.payload.surface,
        action.payload.scopeKey,
      );
      session.applied = normalizeFilters(action.payload.filters);
    },
    filtersCleared(state, action: PayloadAction<ScopedFilterAction>) {
      const session = ensureScope(
        state,
        action.payload.surface,
        action.payload.scopeKey,
      );
      session.applied = createDefaultDiscoveryFilters();
    },
    resetDiscoveryFilters() {
      return initialState;
    },
  },
});

export function resolveDiscoveryFilterSession(
  session: DiscoveryFilterSession,
  scopeKey: string | null,
): DiscoveryFilterSession {
  return session.scopeKey === scopeKey ? session : createEmptySession(scopeKey);
}

export function areDiscoveryFiltersEqual(
  left: DiscoveryFilterSnapshot,
  right: DiscoveryFilterSnapshot,
): boolean {
  const normalizedLeft = normalizeFilters(left);
  const normalizedRight = normalizeFilters(right);

  return (
    normalizedLeft.sort === normalizedRight.sort &&
    normalizedLeft.cuisineIds.join('|') === normalizedRight.cuisineIds.join('|') &&
    normalizedLeft.diets.join('|') === normalizedRight.diets.join('|')
  );
}

export function getActiveDiscoveryFilterCount(
  filters: DiscoveryFilterSnapshot,
): number {
  return (
    (filters.sort === 'RECOMMENDED' ? 0 : 1) +
    filters.cuisineIds.length +
    filters.diets.length
  );
}

export const discoveryFilterActions = discoveryFilterSlice.actions;
export const discoveryFilterReducer = discoveryFilterSlice.reducer;
