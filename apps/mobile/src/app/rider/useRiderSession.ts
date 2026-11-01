import {createContext, useCallback, useContext, useEffect, useMemo, useRef, useState} from 'react';
import {AppState} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {useAppDispatch, useAppSelector} from '../store/hooks';
import {appQueryClient} from '../query';
import {refreshTokenStore} from '../../core/security/refreshTokenStore';
import {useBootstrap} from '../../features/auth/hooks/useBootstrap';
import {useSessionLifecycle} from '../../features/auth/hooks/useSessionLifecycle';
import {authActions} from '../../features/auth/state/authSlice';
import {authService} from '../../features/auth/state/authService';
import {completeLogout} from '../../features/auth/state/logoutCoordinator';
import type {RiderMe} from '../../features/rider/api/contract';
import {riderApi} from '../../features/rider/api/riderApi';
import {riderOnlineService} from '../../features/rider/native/riderOnlineService';
import {riderApiMode} from '../../features/rider/riderConfig';
import {riderKeys} from '../../features/rider/state/riderQueries';
import {riderSnapshot} from '../../features/rider/state/riderSnapshot';
import {tripQueue} from '../../features/rider/state/tripQueue';

export type RiderSessionStatus = 'restoring' | 'anonymous' | 'authenticated' | 'error';

export interface RiderSession {
  /**
   * 'authenticated' also when the app started without signal but has a saved session: the rider then works from what
   * the phone saved last time (rider, Home, active trip) while the session is checked again (WORKPLAN P2-12).
   */
  status: RiderSessionStatus;
  beginPhone(e164Phone: string): Promise<void>;
  confirmOtp(code: string): Promise<void>;
  signOut(): Promise<void>;
  /** After 'error' (the saved session couldn't be checked, e.g. no signal at start): try again without signing out. */
  retry(): void;
}

/**
 * How often a rider who started without signal checks the saved session again (also on every return to the app), as
 * useSessionLifecycle retries: each check renews the refresh token, so on a weak link an answer lost after the renewal
 * must not repeat every few seconds. Queued steps don't wait for it: RiderRuntime sends them once the phone reaches Craves.
 */
export const OFFLINE_RECHECK_MS = 60_000;

/** no: normal. checking: the start failed, looking for a saved session and rider. yes: working offline. declined: nothing saved. */
type OfflineMode = 'no' | 'checking' | 'yes' | 'declined';

/** A start that failed without a refusal keeps the refresh credential (sessionManager); with a saved rider, work offline. */
async function canStartOffline(): Promise<boolean> {
  const credential = await refreshTokenStore.load().catch(() => null);
  return credential !== null && riderSnapshot.seed(appQueryClient);
}

const DEMO_SESSION_KEY = 'rider.demoSession';
export const DEMO_SMS_CODE = '123456';

async function leaveShift() {
  await riderOnlineService.stop();
  await riderApi.endShift().catch(() => undefined);
}

/** Demo builds never touch Firebase or auth-service: any number, fixed code, session kept on the phone. */
function useDemoSession(): RiderSession {
  const [status, setStatus] = useState<RiderSessionStatus>('restoring');
  const [phone, setPhone] = useState('');

  useEffect(() => {
    AsyncStorage.getItem(DEMO_SESSION_KEY)
      .then(saved => setStatus(saved ? 'authenticated' : 'anonymous'))
      .catch(() => setStatus('anonymous'));
  }, []);

  return useMemo(
    () => ({
      status,
      beginPhone: async (e164Phone: string) => setPhone(e164Phone),
      async confirmOtp(code: string) {
        if (code !== DEMO_SMS_CODE) {
          throw new Error('WRONG_CODE');
        }
        await AsyncStorage.setItem(DEMO_SESSION_KEY, JSON.stringify({phone}));
        setStatus('authenticated');
      },
      async signOut() {
        await leaveShift();
        await AsyncStorage.removeItem(DEMO_SESSION_KEY);
        appQueryClient.clear();
        setStatus('anonymous');
      },
      // Demo restore never fails.
      retry: () => undefined,
    }),
    [status, phone],
  );
}

/** Phone OTP by MSG91 (auth-service's central OTP, as on the web), then the customer app's Firebase sign-in and Craves token exchange. */
function useLiveSession(): RiderSession {
  const dispatch = useAppDispatch();
  const bootstrap = useBootstrap();
  useSessionLifecycle();
  const authStatus = useAppSelector(state => state.auth.bootstrapStatus);
  const status: RiderSessionStatus =
    authStatus === 'authenticated' ? 'authenticated' : authStatus === 'anonymous' ? 'anonymous' : authStatus === 'error' ? 'error' : 'restoring';

  // The rider role is checked by GET /rider/me, not at sign-in.
  const beginPhone = useCallback((e164Phone: string) => authService.beginMsg91Phone(e164Phone), []);
  const confirmOtp = useCallback(
    async (code: string) => {
      const tokens = await authService.confirmMsg91Otp(code);
      dispatch(authActions.authenticated(tokens.identity));
    },
    [dispatch],
  );
  const signOut = useCallback(async () => {
    await leaveShift();
    await completeLogout(dispatch, appQueryClient);
    appQueryClient.clear();
    await riderSnapshot.clear();
  }, [dispatch]);

  const retry = useCallback(() => dispatch(authActions.bootstrapReset()), [dispatch]);

  const [offline, setOffline] = useState<OfflineMode>('no');
  const mounted = useRef(true);
  const latestAuth = useRef(authStatus);
  useEffect(() => {
    latestAuth.current = authStatus;
  }, [authStatus]);
  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );

  // No signal at start (WORKPLAN P2-12): with the saved session and the rider, Home and trip saved last time, open
  // where the rider left off. Signed in again: refetch and send the queued steps. Refused (expired or revoked): sign in.
  useEffect(() => {
    if (authStatus === 'error' && offline === 'no') {
      setOffline('checking');
      canStartOffline().then(ok => mounted.current && setOffline(ok ? 'yes' : 'declined'));
    } else if (offline === 'yes' && authStatus === 'authenticated') {
      setOffline('no');
      appQueryClient.invalidateQueries({queryKey: riderKeys.all});
      const riderId = appQueryClient.getQueryData<RiderMe>(riderKeys.me)?.riderId;
      if (riderId) {
        tripQueue.flush(riderId, {now: true}).catch(() => undefined);
      }
    } else if ((offline === 'yes' || offline === 'declined') && authStatus === 'anonymous') {
      setOffline('no');
    } else if (offline === 'declined' && authStatus !== 'error') {
      setOffline('no');
    }
  }, [authStatus, offline]);

  // A signed-out phone keeps nothing of the last rider.
  useEffect(() => {
    if (authStatus === 'anonymous') {
      riderSnapshot.clear();
    }
  }, [authStatus]);

  // While offline, check the saved session again now and then and whenever the rider comes back to the app.
  useEffect(() => {
    if (offline !== 'yes') {
      return;
    }
    const recheck = () => {
      if (latestAuth.current === 'error') {
        dispatch(authActions.bootstrapReset());
      }
    };
    const timer = setInterval(recheck, OFFLINE_RECHECK_MS);
    const appState = AppState.addEventListener('change', state => state === 'active' && recheck());
    return () => {
      clearInterval(timer);
      appState.remove();
    };
  }, [offline, dispatch]);

  const sessionStatus: RiderSessionStatus =
    offline === 'yes' ? 'authenticated' : offline === 'checking' || bootstrap === 'idle' ? 'restoring' : status;
  return useMemo(
    () => ({status: sessionStatus, beginPhone, confirmOtp, signOut, retry}),
    [sessionStatus, beginPhone, confirmOtp, signOut, retry],
  );
}

// Fixed per build, so the hook order never changes between renders.
export const useRiderSessionState = riderApiMode === 'live' ? useLiveSession : useDemoSession;

export const RiderSessionContext = createContext<RiderSession | null>(null);

export function useRiderSession(): RiderSession {
  const session = useContext(RiderSessionContext);
  if (!session) {
    throw new Error('useRiderSession must be used inside RiderApp.');
  }
  return session;
}
