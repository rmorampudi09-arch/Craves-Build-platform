import {toAppApiError} from '../../../core/http/apiError';

/** Search starts at 3 characters (the server accepts 2) and is debounced. */
export const LOCATION_SEARCH_MIN_CHARS = 3;
export const LOCATION_SEARCH_MAX_CHARS = 160;
export const LOCATION_SEARCH_DEBOUNCE_MS = 350;
/** Used only when a 429 arrives without a readable Retry-After (the server budget is per minute). */
export const DEFAULT_RETRY_AFTER_SECONDS = 60;

export type LocationLookupFailure =
  | {kind: 'cancelled'}
  | {kind: 'limited'; retryAt: number}
  | {kind: 'unavailable'}
  | {kind: 'failed'; message: string};

/** Maps a search or reverse-geocode failure to what the address screens show. */
export function classifyLocationLookupError(
  caught: unknown,
  now = Date.now(),
): LocationLookupFailure {
  const error = toAppApiError(caught);
  if (error.cancelled) {
    return {kind: 'cancelled'};
  }
  if (error.status === 429) {
    const seconds = error.retryAfterSeconds ?? DEFAULT_RETRY_AFTER_SECONDS;
    return {kind: 'limited', retryAt: now + seconds * 1000};
  }
  if (error.status === 503) {
    return {kind: 'unavailable'};
  }
  return {kind: 'failed', message: error.message};
}
