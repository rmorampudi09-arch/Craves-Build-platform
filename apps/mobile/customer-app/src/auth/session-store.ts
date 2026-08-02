import * as Keychain from 'react-native-keychain';
import { SESSION_SERVICE } from '../config';
import { type MobileSession, sessionIsUsable } from './contracts';

const USERNAME = 'craves-customer-session';

export async function saveSession(session: MobileSession): Promise<void> {
  await Keychain.setGenericPassword(USERNAME, JSON.stringify(session), {
    service: SESSION_SERVICE,
    accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY
  });
}

export async function loadSession(): Promise<MobileSession | null> {
  const stored = await Keychain.getGenericPassword({ service: SESSION_SERVICE });
  if (!stored) return null;
  try {
    const session = JSON.parse(stored.password) as MobileSession;
    if (!sessionIsUsable(session)) {
      await clearSession();
      return null;
    }
    return session;
  } catch {
    await clearSession();
    return null;
  }
}

export async function clearSession(): Promise<void> {
  await Keychain.resetGenericPassword({ service: SESSION_SERVICE });
}
