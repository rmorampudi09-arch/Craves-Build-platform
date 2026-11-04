import {toAppApiError} from '../../../core/http/apiError';

// Catalog answers 409 with this code to open, publish, switch on and hours until Craves has approved the chef.
export const SELLING_NOT_READY = 'You can start selling once Craves approves your kitchen.';

export const isSellingNotReady = (failure: unknown): boolean => toAppApiError(failure).code === 'CHEF_SELLING_NOT_READY';

/** The text for a failed save: the plain reason when the chef cannot sell yet or has a delete request open, else the screen's own `fallback`. */
export const chefFailureText = (failure: unknown, fallback: string): string => {
  if (isSellingNotReady(failure)) {
    return SELLING_NOT_READY;
  }
  const error = toAppApiError(failure);
  // The server's own words ("... Tap Keep my account to open your kitchen."); the strip above carries the button.
  return error.code === 'ACCOUNT_DELETION_PENDING' && error.backendMessage ? error.backendMessage : fallback;
};
