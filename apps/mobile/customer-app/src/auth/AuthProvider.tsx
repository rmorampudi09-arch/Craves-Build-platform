import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { getAuth, signOut as firebaseSignOut } from '@react-native-firebase/auth';
import { exchangeFirebaseToken } from './craves-auth';
import { clearSession, loadSession, saveSession } from './session-store';
import type { MobileSession } from './contracts';

type AuthContextValue = {
  session: MobileSession | null;
  initializing: boolean;
  createSession(firebaseIdToken: string): Promise<void>;
  signOut(): Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<MobileSession | null>(null);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    let active = true;
    loadSession()
      .then(value => { if (active) setSession(value); })
      .finally(() => { if (active) setInitializing(false); });
    return () => { active = false; };
  }, []);

  const createSession = useCallback(async (firebaseIdToken: string) => {
    const nextSession = await exchangeFirebaseToken(firebaseIdToken);
    await saveSession(nextSession);
    setSession(nextSession);
  }, []);

  const signOut = useCallback(async () => {
    await clearSession();
    setSession(null);
    await firebaseSignOut(getAuth()).catch(() => undefined);
  }, []);

  const value = useMemo(() => ({ session, initializing, createSession, signOut }), [session, initializing, createSession, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
