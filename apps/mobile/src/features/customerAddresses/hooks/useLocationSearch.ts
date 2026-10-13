import {useEffect, useRef, useState} from 'react';
import {
  customerAddressesApi,
  type CustomerLocationSuggestion,
  type LocationBias,
} from '../api/customerAddressesApi';
import {
  LOCATION_SEARCH_DEBOUNCE_MS,
  LOCATION_SEARCH_MAX_CHARS,
  LOCATION_SEARCH_MIN_CHARS,
  classifyLocationLookupError,
} from '../domain/locationLookup';
import {useSecondsUntil} from './useSecondsUntil';

export type LocationSearchState =
  | {status: 'idle'}
  | {status: 'loading'}
  | {status: 'results'; results: CustomerLocationSuggestion[]}
  | {status: 'empty'}
  | {status: 'unavailable'}
  | {status: 'limited'; retryAt: number}
  | {status: 'failed'; message: string};

/**
 * Debounced Ola typeahead: stale requests are cancelled, and after a 429 nothing is sent
 * until Retry-After has passed; then the current query is retried once.
 */
export function useLocationSearch(bias: LocationBias | null) {
  const [query, setQuery] = useState('');
  const [state, setState] = useState<LocationSearchState>({status: 'idle'});
  const [attempt, setAttempt] = useState(0);
  const blockedUntil = useRef(0);
  const autoRetried = useRef(false);
  const biasRef = useRef(bias);
  const trimmed = query.trim().slice(0, LOCATION_SEARCH_MAX_CHARS);

  useEffect(() => {
    biasRef.current = bias;
  });

  useEffect(() => {
    autoRetried.current = false;
  }, [trimmed]);

  useEffect(() => {
    if (trimmed.length < LOCATION_SEARCH_MIN_CHARS) {
      setState({status: 'idle'});
      return;
    }
    if (Date.now() < blockedUntil.current) {
      setState({status: 'limited', retryAt: blockedUntil.current});
      return;
    }

    const controller = new AbortController();
    setState({status: 'loading'});
    const timer = setTimeout(() => {
      customerAddressesApi
        .searchLocations(trimmed, biasRef.current, controller.signal)
        .then(results => {
          if (!controller.signal.aborted) {
            setState(
              results.length > 0 ? {status: 'results', results} : {status: 'empty'},
            );
          }
        })
        .catch(caught => {
          if (controller.signal.aborted) {
            return;
          }
          const failure = classifyLocationLookupError(caught);
          if (failure.kind === 'cancelled') {
            return;
          }
          if (failure.kind === 'limited') {
            blockedUntil.current = failure.retryAt;
            setState({status: 'limited', retryAt: failure.retryAt});
            return;
          }
          setState(
            failure.kind === 'unavailable'
              ? {status: 'unavailable'}
              : {status: 'failed', message: failure.message},
          );
        });
    }, LOCATION_SEARCH_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [trimmed, attempt]);

  const limitedSeconds = useSecondsUntil(
    state.status === 'limited' ? state.retryAt : null,
  );

  useEffect(() => {
    if (state.status === 'limited' && limitedSeconds === 0 && !autoRetried.current) {
      autoRetried.current = true;
      setAttempt(current => current + 1);
    }
  }, [limitedSeconds, state.status]);

  return {
    query,
    setQuery,
    state,
    limitedSeconds,
    retry: () => setAttempt(current => current + 1),
  };
}
