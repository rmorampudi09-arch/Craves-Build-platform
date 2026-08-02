import { CRAVES_API_BASE_URL, NETWORK_TIMEOUT_MS } from '../config';
import type { MobileSession } from '../auth/contracts';
import { parseChefApplicationSummary, type ChefApplicationSummary } from './chef-mode';

export class ChefModeApiError extends Error {
  constructor(public readonly code: string, public readonly status: number, message: string) {
    super(message);
  }
}

export async function getChefApplicationSummary(session: MobileSession): Promise<ChefApplicationSummary> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), NETWORK_TIMEOUT_MS);
  try {
    const response = await fetch(`${CRAVES_API_BASE_URL}/chef/application`, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${session.accessToken}` },
      signal: controller.signal
    });
    if (response.status === 401) throw new ChefModeApiError('SESSION_EXPIRED', 401, 'Your session expired. Sign in again.');
    if (!response.ok) throw new ChefModeApiError('CHEF_APPLICATION_UNAVAILABLE', response.status, 'Chef application status is temporarily unavailable.');
    const summary = parseChefApplicationSummary(await response.json().catch(() => null));
    if (!summary) throw new ChefModeApiError('INVALID_CHEF_APPLICATION_RESPONSE', 502, 'Chef application status is temporarily unavailable.');
    return summary;
  } catch (error) {
    if (error instanceof ChefModeApiError) throw error;
    if (error instanceof Error && error.name === 'AbortError') throw new ChefModeApiError('CHEF_APPLICATION_TIMEOUT', 504, 'Chef application request timed out.');
    throw new ChefModeApiError('CHEF_APPLICATION_UNAVAILABLE', 503, 'Check your connection and try again.');
  } finally {
    clearTimeout(timeout);
  }
}
