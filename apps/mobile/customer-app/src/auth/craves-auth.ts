import { CRAVES_API_BASE_URL, NETWORK_TIMEOUT_MS } from '../config';
import { parseMobileSession, type MobileSession } from './contracts';

export class MobileAuthError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
  }
}

export async function exchangeFirebaseToken(firebaseIdToken: string): Promise<MobileSession> {
  const token = firebaseIdToken.trim();
  if (token.length < 100 || token.length > 20_000) {
    throw new MobileAuthError('INVALID_FIREBASE_TOKEN', 'Firebase verification is required.');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), NETWORK_TIMEOUT_MS);
  try {
    const response = await fetch(`${CRAVES_API_BASE_URL}/auth/firebase/exchange`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ firebaseIdToken: token }),
      signal: controller.signal
    });
    const raw = await response.json().catch(() => null);
    if (!response.ok) {
      if (response.status === 429) throw new MobileAuthError('RATE_LIMITED', 'Too many attempts. Please try again later.');
      if (response.status === 401 || response.status === 403) throw new MobileAuthError('OTP_SESSION_REJECTED', 'OTP verification expired. Request a new OTP.');
      throw new MobileAuthError('AUTH_UNAVAILABLE', 'Sign-in is temporarily unavailable.');
    }
    const session = parseMobileSession(raw);
    if (!session) throw new MobileAuthError('INVALID_AUTH_RESPONSE', 'Sign-in is temporarily unavailable.');
    return session;
  } catch (error) {
    if (error instanceof MobileAuthError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new MobileAuthError('AUTH_TIMEOUT', 'Sign-in timed out. Please try again.');
    }
    throw new MobileAuthError('AUTH_UNAVAILABLE', 'Sign-in is temporarily unavailable.');
  } finally {
    clearTimeout(timeout);
  }
}
