import { AppApiError } from '../../../core/http/apiError';
import type { AppLanguage } from '../strings/StringsProvider';
import type { RiderStrings } from '../strings/en';

/**
 * What a failed call means to a rider (DESIGN.md "States"):
 * - offline: the phone didn't reach Craves (no network, or no answer in time);
 * - unavailable: Craves answered with a server fault or "too busy";
 * - notYet: that part of the rider service isn't switched on or deployed yet;
 * - notAllowed: the account lacks the rider role for it (Spring Security's 403, which has no code, or FORBIDDEN);
 * - refused: the server said no, with its reason;
 * - unknown: anything else.
 */
export type Problem =
  | 'offline'
  | 'unavailable'
  | 'notYet'
  | 'notAllowed'
  | 'refused'
  | 'unknown';

/** Codes the server sends while a part of the rider service is off or not set up. */
const NOT_YET = new Set(['TERMS_UNAVAILABLE', 'RIDER_CHOICES_OFF']);
/** Server-side storage that isn't ready: the rider can only wait. */
const UNAVAILABLE = new Set([
  'STORAGE_UNAVAILABLE',
  'PAYOUT_ACCOUNT_STORAGE_UNAVAILABLE',
]);

export function problemOf(error: unknown): Problem {
  if (!(error instanceof AppApiError) || error.cancelled) {
    return 'unknown';
  }
  if (!error.status) {
    return 'offline';
  }
  // A 404 without a code is a route the deployed server doesn't have yet (the gateway or the service is older).
  if (NOT_YET.has(error.code) || error.code === 'HTTP_404') {
    return 'notYet';
  }
  if (error.code === 'HTTP_403' || error.code === 'FORBIDDEN') {
    return 'notAllowed';
  }
  if (
    UNAVAILABLE.has(error.code) ||
    error.status === 408 ||
    error.status === 429 ||
    error.status >= 500
  ) {
    return 'unavailable';
  }
  return 'refused';
}

/**
 * One line for a failed action, in the rider's language. A refusal reads in the server's own words in English (they
 * are written for riders and may carry an amount or a list); other languages get the app's text for the codes riders
 * meet, and the server's words for the rest. 403s never carry the server's words (the API client drops them).
 */
export function riderMessage(
  error: unknown,
  strings: RiderStrings,
  language: AppLanguage,
): string {
  const s = strings.states;
  switch (problemOf(error)) {
    case 'offline':
      return s.offlineAction;
    case 'unavailable':
      return s.unavailableAction;
    case 'notYet':
      return error instanceof AppApiError && error.code === 'RIDER_CHOICES_OFF'
        ? strings.errors.RIDER_CHOICES_OFF
        : s.notYetAction;
    case 'notAllowed':
      return s.notAllowedAction;
    case 'refused': {
      const api = error as AppApiError;
      const known = strings.errors[api.code];
      if (language === 'en' && api.status !== 403) {
        return api.message;
      }
      return known ?? api.message;
    }
    default:
      return strings.common.error;
  }
}
