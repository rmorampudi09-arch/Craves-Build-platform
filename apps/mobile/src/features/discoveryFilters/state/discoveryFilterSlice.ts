import {createSlice, type PayloadAction} from '@reduxjs/toolkit';

export type DiscoveryFilterSurface = 'HOME' | 'CHEFS';
export type DiscoverySortOption =
  | 'RECOMMENDED'
  | 'PRICE_LOW_TO_HIGH'
  | 'PRICE_HIGH_TO_LOW'
  | 'PREPARATION_TIME_ASC'
  | 'NAME_ASC';
export type DiscoveryDietOption = 'VEG' | 'NON_VEG' | 'EGG';
export type DiscoverySpiceLevel = 'MILD' | 'MEDIUM' | 'SPICY';

export interface DiscoveryFilterSnapshot {
  sort: DiscoverySortOption;
  cuisineIds: string[];
  diets: DiscoveryDietOption[];
  minPrice: number | null;
  maxPrice: number | null;
  maxPreparationTimeMinutes: number | null;
  spiceLevel: DiscoverySpiceLevel | null;
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
    minPrice: null,
    maxPrice: null,
    maxPreparationTimeMinutes: null,
    spiceLevel: null,
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

interface FilterDraftUpdatedAction extends ScopedFilterAction {
  selection: DiscoveryFilterSnapshot;
}

interface FiltersAppliedAction extends ScopedFilterAction {
  filters?: DiscoveryFilterSnapshot;
}

function nonNegativeFinite(value: number | null): number | null {
  return value !== null && Number.isFinite(value) && value >= 0 ? value : null;
}

function positiveInteger(value: number | null): number | null {
  return value !== null && Number.isInteger(value) && value > 0 ? value : null;
}

function normalizeFilters(filters: DiscoveryFilterSnapshot): DiscoveryFilterSnapshot {
  const cuisineIds = [...new Set(filters.cuisineIds.map(value => value.trim()).filter(Boolean))]
    .sort();
  const dietSet = new Set(filters.diets);
  let minPrice = nonNegativeFinite(filters.minPrice);
  let maxPrice = nonNegativeFinite(filters.maxPrice);
  if (minPrice !== null && maxPrice !== null && minPrice > maxPrice) {
    minPrice = null;
    maxPrice = null;
  }

  return {
    sort: filters.sort,
    cuisineIds,
    diets: DIET_ORDER.filter(diet => dietSet.has(diet)),
    minPrice,
    maxPrice,
    maxPreparationTimeMinutes: positiveInteger(filters.maxPreparationTimeMinutes),
    spiceLevel: filters.spiceLevel,
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
    filterDraftUpdated(state, action: PayloadAction<FilterDraftUpdatedAction>) {
      const session = ensureScope(
        state,
        action.payload.surface,
        action.payload.scopeKey,
      );
      session.applied = normalizeFilters(action.payload.selection);
    },
    filtersApplied(state, action: PayloadAction<FiltersAppliedAction>) {
      const session = ensureScope(
        state,
        action.payload.surface,
        action.payload.scopeKey,
      );
      if (action.payload.filters) {
        session.applied = normalizeFilters(action.payload.filters);
      }
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
    normalizedLeft.diets.join('|') === normalizedRight.diets.join('|') &&
    normalizedLeft.minPrice === normalizedRight.minPrice &&
    normalizedLeft.maxPrice === normalizedRight.maxPrice &&
    normalizedLeft.maxPreparationTimeMinutes ===
      normalizedRight.maxPreparationTimeMinutes &&
    normalizedLeft.spiceLevel === normalizedRight.spiceLevel
  );
}

export function getActiveDiscoveryFilterCount(
  filters: DiscoveryFilterSnapshot,
): number {
  return (
    (filters.sort === 'RECOMMENDED' ? 0 : 1) +
    filters.cuisineIds.length +
    filters.diets.length +
    (filters.minPrice === null ? 0 : 1) +
    (filters.maxPrice === null ? 0 : 1) +
    (filters.maxPreparationTimeMinutes === null ? 0 : 1) +
    (filters.spiceLevel === null ? 0 : 1)
  );
}

export const discoveryFilterActions = discoveryFilterSlice.actions;
export const discoveryFilterReducer = discoveryFilterSlice.reducer;
