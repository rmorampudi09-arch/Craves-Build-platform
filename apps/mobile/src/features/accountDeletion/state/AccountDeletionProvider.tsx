import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import {StatusBar, StyleSheet, View} from 'react-native';
import {
  SafeAreaProvider,
  useSafeAreaFrame,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import {useAppSelector} from '../../../app/store/hooks';
import {toAppApiError} from '../../../core/http/apiError';
import {accountDeletionApi} from '../api/accountDeletionApi';
import {
  AccountDeletionBanner,
  type StripNotice,
} from '../components/AccountDeletionBanner';
import {deletionCopy} from '../domain/deletionCopy';
import {bannerFor, keptNoticeFor} from '../domain/deletionModel';
import type {PendingDeletion} from '../domain/deletionTypes';
import {refreshAfterDeletionChange} from './refreshAfterDeletionChange';
import {DeletionStripVisibleContext} from './useDeletionStripVisible';

export type KeepOutcome = 'kept' | 'inProgress' | 'failed';

interface AccountDeletionValue {
  /** The open delete request from the signed-in identity, or null. */
  pending: PendingDeletion | null;
  /** Cancels the open request. A second call while one is running joins it. */
  keep(): Promise<KeepOutcome>;
  keeping: boolean;
  /** What the strip is saying for a few seconds after Keep my account. */
  notice: string | null;
}

const NOTICE_MS = 4000;

const AccountDeletionContext = createContext<AccountDeletionValue | null>(null);

export function useAccountDeletion(): AccountDeletionValue {
  const value = useContext(AccountDeletionContext);
  if (!value) {
    throw new Error('useAccountDeletion must be used inside AccountDeletionProvider');
  }
  return value;
}

/**
 * Holds the delete request and Keep my account for every signed-in screen, and draws the strip above them.
 * It stays mounted whether or not the strip shows, so the screens below are never rebuilt when it comes and goes.
 */
export function AccountDeletionProvider({children}: PropsWithChildren) {
  const identity = useAppSelector(state => state.auth.identity);
  const pending = identity?.pendingDeletion ?? null;
  const identityRef = useRef(identity);
  identityRef.current = identity;
  const [keeping, setKeeping] = useState(false);
  const [notice, setNotice] = useState<StripNotice | null>(null);
  const inFlight = useRef<Promise<KeepOutcome> | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(noticeTimer.current), []);

  const say = useCallback((text: string, tone: StripNotice['tone']) => {
    clearTimeout(noticeTimer.current);
    setNotice({text, tone});
    noticeTimer.current = setTimeout(() => setNotice(null), NOTICE_MS);
  }, []);

  const run = useCallback(async (): Promise<KeepOutcome> => {
    // Read before the refresh: it drops the request from the identity.
    const before = identityRef.current;
    let outcome: KeepOutcome = 'kept';
    try {
      await accountDeletionApi.keep();
      say(keptNoticeFor(before?.pendingDeletion?.scope, before?.roles ?? []), 'success');
    } catch (error) {
      const {code} = toAppApiError(error);
      if (code === 'ACCOUNT_DELETION_IN_PROGRESS') {
        say(deletionCopy.keep.inProgress, 'warning');
        outcome = 'inProgress';
      } else if (code !== 'NO_DELETION_REQUEST') {
        say(deletionCopy.keep.failed, 'warning');
        return 'failed';
      }
      // 404: the request had already ended, so the refresh alone brings the strip down.
    }
    await refreshAfterDeletionChange();
    return outcome;
  }, [say]);

  const keep = useCallback((): Promise<KeepOutcome> => {
    // A second tap before the first renders must not send a second request.
    if (!inFlight.current) {
      setKeeping(true);
      inFlight.current = run().finally(() => {
        inFlight.current = null;
        setKeeping(false);
      });
    }
    return inFlight.current;
  }, [run]);

  const value = useMemo(
    () => ({pending, keep, keeping, notice: notice?.text ?? null}),
    [pending, keep, keeping, notice],
  );

  const banner = bannerFor(pending);
  const showStrip = banner !== null || notice !== null;
  const insets = useSafeAreaInsets();
  const frame = useSafeAreaFrame();

  return (
    <AccountDeletionContext.Provider value={value}>
      <DeletionStripVisibleContext.Provider value={showStrip}>
        <View style={styles.fill}>
          {showStrip ? <StatusBar barStyle="dark-content" /> : null}
          <AccountDeletionBanner banner={banner} notice={notice} keeping={keeping} onKeep={keep} />
          {/*
            The strip pads the status bar, so the screens below start under it. Their own safe-area
            provider measures its frame (it begins below the strip), which is why they get no top inset.
            initialMetrics only covers the first frame; without a strip it inherits the parent's metrics.
          */}
          <SafeAreaProvider
            initialMetrics={showStrip ? {frame, insets: {...insets, top: 0}} : undefined}>
            {children}
          </SafeAreaProvider>
        </View>
      </DeletionStripVisibleContext.Provider>
    </AccountDeletionContext.Provider>
  );
}

const styles = StyleSheet.create({
  fill: {flex: 1},
});
