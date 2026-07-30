import { CRAVES_API_BASE_URL, NETWORK_TIMEOUT_MS } from '../config';
import type { MobileSession } from '../auth/contracts';
import { parseMobileSubscription, parseMobileSubscriptionPlans, parseMobileSubscriptions, type MobileSubscription, type MobileSubscriptionPlan } from './contracts';

export class SubscriptionApiError extends Error {
  constructor(public readonly code: string, public readonly status: number, message: string) { super(message); }
}

async function request(path: string, session?: MobileSession, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), NETWORK_TIMEOUT_MS);
  try {
    const response = await fetch(`${CRAVES_API_BASE_URL}${path}`, {
      ...init,
      headers: { Accept: 'application/json', ...(session ? { Authorization: `Bearer ${session.accessToken}` } : {}), ...init.headers },
      signal: controller.signal
    });
    if (response.status === 401) throw new SubscriptionApiError('SESSION_EXPIRED', 401, 'Your session expired. Sign in again.');
    if (!response.ok) throw new SubscriptionApiError('SUBSCRIPTION_REQUEST_FAILED', response.status, 'Subscription request could not be completed.');
    return response;
  } catch (error) {
    if (error instanceof SubscriptionApiError) throw error;
    if (error instanceof Error && error.name === 'AbortError') throw new SubscriptionApiError('SUBSCRIPTION_TIMEOUT', 504, 'Subscription request timed out.');
    throw new SubscriptionApiError('SUBSCRIPTION_UNAVAILABLE', 503, 'Check your connection and try again.');
  } finally { clearTimeout(timeout); }
}

export async function listSubscriptionPlans(): Promise<MobileSubscriptionPlan[]> {
  const response = await request('/subscriptions/plans');
  const plans = parseMobileSubscriptionPlans(await response.json().catch(() => null));
  if (!plans) throw new SubscriptionApiError('INVALID_PLAN_RESPONSE', 502, 'Meal plans are temporarily unavailable.');
  return plans;
}

export async function listMySubscriptions(session: MobileSession): Promise<MobileSubscription[]> {
  const response = await request('/subscriptions', session);
  const subscriptions = parseMobileSubscriptions(await response.json().catch(() => null));
  if (!subscriptions) throw new SubscriptionApiError('INVALID_SUBSCRIPTION_RESPONSE', 502, 'Subscriptions are temporarily unavailable.');
  return subscriptions;
}

export async function createSubscription(session: MobileSession, input: { planId: string; startDate: string; deliveryAddressId: string | null; notes: string | null }): Promise<MobileSubscription> {
  const response = await request('/subscriptions', session, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
  const subscription = parseMobileSubscription(await response.json().catch(() => null));
  if (!subscription) throw new SubscriptionApiError('INVALID_SUBSCRIPTION_RESPONSE', 502, 'Subscription response was invalid.');
  return subscription;
}

export async function changeSubscription(session: MobileSession, subscriptionId: string, action: 'pause' | 'cancel', reason: string | null): Promise<MobileSubscription> {
  const response = await request(`/subscriptions/${encodeURIComponent(subscriptionId)}/${action}`, session, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason }) });
  const subscription = parseMobileSubscription(await response.json().catch(() => null));
  if (!subscription) throw new SubscriptionApiError('INVALID_SUBSCRIPTION_RESPONSE', 502, 'Subscription response was invalid.');
  return subscription;
}
