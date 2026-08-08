import {createSlice, type PayloadAction} from '@reduxjs/toolkit';

export type DiscoverySearchSurface = 'HOME' | 'CHEFS';

export interface DiscoverySearchSession {
  scopeKey: string | null;
  queryDraft: string;
  scrollOffset: number;
}

export interface DiscoverySearchState {
  sessions: Record<DiscoverySearchSurface, DiscoverySearchSession>;
}

function createEmptySession(scopeKey: string | null = null): DiscoverySearchSession {
  return {
    scopeKey,
    queryDraft: '',
    scrollOffset: 0,
  };
}

const initialState: DiscoverySearchState = {
  sessions: {
    HOME: createEmptySession(),
    CHEFS: createEmptySession(),
  },
};

interface ScopedSearchAction {
  surface: DiscoverySearchSurface;
  scopeKey: string | null;
}

interface SearchQueryChangedAction extends ScopedSearchAction {
  queryDraft: string;
}

interface SearchScrollSavedAction extends ScopedSearchAction {
  scrollOffset: number;
}

function ensureScope(
  state: DiscoverySearchState,
  surface: DiscoverySearchSurface,
  scopeKey: string | null,
): DiscoverySearchSession {
  const session = state.sessions[surface];
  if (session.scopeKey === scopeKey) {
    return session;
  }
  const nextSession = createEmptySession(scopeKey);
  state.sessions[surface] = nextSession;
  return nextSession;
}

const discoverySearchSlice = createSlice({
  name: 'discoverySearch',
  initialState,
  reducers: {
    scopeChanged(state, action: PayloadAction<ScopedSearchAction>) {
      ensureScope(state, action.payload.surface, action.payload.scopeKey);
    },
    queryChanged(state, action: PayloadAction<SearchQueryChangedAction>) {
      const session = ensureScope(
        state,
        action.payload.surface,
        action.payload.scopeKey,
      );
      session.queryDraft = action.payload.queryDraft;
      session.scrollOffset = 0;
    },
    scrollOffsetSaved(state, action: PayloadAction<SearchScrollSavedAction>) {
      const session = ensureScope(
        state,
        action.payload.surface,
        action.payload.scopeKey,
      );
      session.scrollOffset = Math.max(0, action.payload.scrollOffset);
    },
    searchCleared(state, action: PayloadAction<ScopedSearchAction>) {
      const session = ensureScope(
        state,
        action.payload.surface,
        action.payload.scopeKey,
      );
      session.queryDraft = '';
      session.scrollOffset = 0;
    },
    resetDiscoverySearch() {
      return initialState;
    },
  },
});

export function resolveDiscoverySearchSession(
  session: DiscoverySearchSession,
  scopeKey: string | null,
): DiscoverySearchSession {
  return session.scopeKey === scopeKey ? session : createEmptySession(scopeKey);
}

export const discoverySearchActions = discoverySearchSlice.actions;
export const discoverySearchReducer = discoverySearchSlice.reducer;
