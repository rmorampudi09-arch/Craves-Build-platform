import {useCallback, useEffect, useMemo, useState} from 'react';
import {useAppDispatch, useAppSelector} from '../../../app/store/hooks';
import {
  DISCOVERY_SEARCH_DEBOUNCE_MS,
  normalizeDiscoverySearchQuery,
} from '../discoverySearchOrchestration';
import {
  discoverySearchActions,
  resolveDiscoverySearchSession,
  type DiscoverySearchSurface,
} from '../state/discoverySearchSlice';

interface DebouncedSearchValue {
  scopeKey: string | null;
  query: string;
}

export function useDiscoverySearchSession(
  surface: DiscoverySearchSurface,
  scopeKey: string | null,
) {
  const dispatch = useAppDispatch();
  const storedSession = useAppSelector(
    state => state.discoverySearch.sessions[surface],
  );
  const session = useMemo(
    () => resolveDiscoverySearchSession(storedSession, scopeKey),
    [scopeKey, storedSession],
  );
  const normalizedDraft = useMemo(
    () => normalizeDiscoverySearchQuery(session.queryDraft),
    [session.queryDraft],
  );
  const [debounced, setDebounced] = useState<DebouncedSearchValue>({
    scopeKey,
    query: normalizedDraft,
  });

  useEffect(() => {
    dispatch(discoverySearchActions.scopeChanged({surface, scopeKey}));
  }, [dispatch, scopeKey, surface]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced({scopeKey, query: normalizedDraft});
    }, DISCOVERY_SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [normalizedDraft, scopeKey]);

  const query = debounced.scopeKey === scopeKey ? debounced.query : '';

  const setDraft = useCallback(
    (queryDraft: string) => {
      dispatch(
        discoverySearchActions.queryChanged({surface, scopeKey, queryDraft}),
      );
    },
    [dispatch, scopeKey, surface],
  );

  const clear = useCallback(() => {
    dispatch(discoverySearchActions.searchCleared({surface, scopeKey}));
  }, [dispatch, scopeKey, surface]);

  const saveScrollOffset = useCallback(
    (scrollOffset: number) => {
      dispatch(
        discoverySearchActions.scrollOffsetSaved({
          surface,
          scopeKey,
          scrollOffset,
        }),
      );
    },
    [dispatch, scopeKey, surface],
  );

  return {
    draft: session.queryDraft,
    query,
    scrollOffset: session.scrollOffset,
    isDebouncing: query !== normalizedDraft,
    setDraft,
    clear,
    saveScrollOffset,
  };
}
