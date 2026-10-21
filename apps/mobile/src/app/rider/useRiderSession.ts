import {createContext, useCallback, useContext, useEffect, useMemo, useState} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {useAppDispatch, useAppSelector} from '../store/hooks';
import {appQueryClient} from '../query';
import {useBootstrap} from '../../features/auth/hooks/useBootstrap';
import {useSessionLifecycle} from '../../features/auth/hooks/useSessionLifecycle';
import {authActions} from '../../features/auth/state/authSlice';
import {authService} from '../../features/auth/state/authService';
import {completeLogout} from '../../features/auth/state/logoutCoordinator';
import {riderApi} from '../../features/rider/api/riderApi';
import {riderOnlineService} from '../../features/rider/native/riderOnlineService';
import {riderApiMode} from '../../features/rider/riderConfig';

export type RiderSessionStatus = 'restoring' | 'anonymous' | 'authenticated' | 'error';

export interface RiderSession {
  status: RiderSessionStatus;
  beginPhone(e164Phone: string): Promise<void>;
  confirmOtp(code: string): Promise<void>;
  signOut(): Promise<void>;
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
    }),
    [status, phone],
  );
}

/** The customer app's Firebase phone sign-in and Craves token exchange, without its screens. */
function useLiveSession(): RiderSession {
  const dispatch = useAppDispatch();
  const bootstrap = useBootstrap();
  useSessionLifecycle();
  const authStatus = useAppSelector(state => state.auth.bootstrapStatus);
  const status: RiderSessionStatus =
    authStatus === 'authenticated' ? 'authenticated' : authStatus === 'anonymous' ? 'anonymous' : authStatus === 'error' ? 'error' : 'restoring';

  const beginPhone = useCallback(async (e164Phone: string) => {
    // The role is only passed through; Firebase phone sign-in doesn't use it. The rider role is checked by GET /rider/me.
    await authService.beginPhone('CUSTOMER', e164Phone);
  }, []);
  const confirmOtp = useCallback(
    async (code: string) => {
      const tokens = await authService.confirmOtp(code);
      dispatch(authActions.authenticated(tokens.identity));
    },
    [dispatch],
  );
  const signOut = useCallback(async () => {
    await leaveShift();
    await completeLogout(dispatch, appQueryClient);
    appQueryClient.clear();
  }, [dispatch]);

  return useMemo(
    () => ({status: bootstrap === 'idle' ? 'restoring' : status, beginPhone, confirmOtp, signOut}),
    [bootstrap, status, beginPhone, confirmOtp, signOut],
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
