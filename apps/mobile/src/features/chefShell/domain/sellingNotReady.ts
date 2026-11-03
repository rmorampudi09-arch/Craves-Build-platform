import {toAppApiError} from '../../../core/http/apiError';

// Catalog answers 409 with this code to open, publish, switch on and hours until Craves has approved the chef.
export const SELLING_NOT_READY = 'You can start selling once Craves approves your kitchen.';

export const isSellingNotReady = (failure: unknown): boolean => toAppApiError(failure).code === 'CHEF_SELLING_NOT_READY';

/** The text for a failed save: the plain reason when the chef cannot sell yet, else the screen's own `fallback`. */
export const chefFailureText = (failure: unknown, fallback: string): string => (isSellingNotReady(failure) ? SELLING_NOT_READY : fallback);
