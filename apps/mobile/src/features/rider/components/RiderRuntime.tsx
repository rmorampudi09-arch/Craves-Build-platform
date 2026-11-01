import {useEffect, useRef} from 'react';
import {Alert, AppState, DeviceEventEmitter, Platform} from 'react-native';
import {useQueryClient} from '@tanstack/react-query';
import {AppApiError} from '../../../core/http/apiError';
import {riderApi} from '../api/riderApi';
import {pickOffer, type ReceivedOffer} from '../domain/offerTiming';
import {riderDevice} from '../native/riderDevice';
import {riderOnlineService} from '../native/riderOnlineService';
import {RIDER_APP_VERSION} from '../riderConfig';
import {connection} from '../state/connection';
import {riderKeys, TRIP_ENDED_EVENT} from '../state/riderQueries';
import {tripQueue} from '../state/tripQueue';
import {useStrings} from '../strings/StringsProvider';

const FLUSH_EVERY_MS = 15_000;
// An upload that worked sends the queue at once, backoff or not, at most this often (blueprint A2).
const SIGNAL_FLUSH_GAP_MS = 5_000;
const model = Platform.OS === 'android' ? Platform.constants.Model : Platform.OS;

/**
 * Registers this phone for offer pushes (POST /devices binds the rider's first phone). False when the phone has no FCM
 * token or installation id yet, so it can't be bound; the server's refusal (409 DEVICE_NOT_BOUND) is thrown.
 */
export async function registerPhone(fcmToken?: string | null): Promise<boolean> {
  const [installationId, token] = await Promise.all([
    riderDevice.installationId(),
    fcmToken === undefined ? riderOnlineService.fcmToken() : Promise.resolve(fcmToken),
  ]);
  if (!token || !installationId) {
    return false;
  }
  await riderApi.registerDevice({installationId, fcmToken: token, appVersion: RIDER_APP_VERSION, model});
  return true;
}

/**
 * Listens while the rider is signed in: registers the phone for offer pushes, rings offers (including the one whose
 * notification opened the app), refreshes trips and replays queued trip steps. nativeOutbox: the server's
 * features.nativeTripOutbox (P2-02b), which sends trip steps through the phone's native outbox.
 */
export function RiderRuntime({
  riderId,
  nativeOutbox = false,
  openOffer,
}: {
  riderId: string;
  nativeOutbox?: boolean;
  openOffer: (offer: ReceivedOffer) => void;
}) {
  const queryClient = useQueryClient();
  const shown = useRef<ReceivedOffer | null>(null);
  const device = useStrings().strings.device;

  useEffect(() => {
    tripQueue.setNativeOutbox(nativeOutbox).catch(() => undefined);
  }, [nativeOutbox]);

  useEffect(() => {
    const register = (fcmToken: string | null) =>
      registerPhone(fcmToken).catch(error => {
        // 409 DEVICE_NOT_BOUND: ops must approve this phone. Other failures retry on the next start, token change, or
        // Go online (which registers again before it starts a shift).
        if (error instanceof AppApiError && error.status === 409) {
          Alert.alert(device.notApprovedTitle, device.notApprovedBody);
        }
      });
    riderOnlineService.fcmToken().then(register);
    return riderOnlineService.onFcmToken(register);
  }, [device]);

  useEffect(() => {
    let mounted = true;
    // The countdown ends at the native deadline (the server's expiresAt on the phone's clock), else arrival plus expiresInSec.
    const show = (received: ReceivedOffer) => {
      const next = pickOffer(shown.current, received, Date.now());
      if (mounted && next && next !== shown.current) {
        shown.current = next;
        openOffer(next);
      }
    };
    const refreshTrip = () => {
      queryClient.invalidateQueries({queryKey: riderKeys.activeTrip});
      queryClient.invalidateQueries({queryKey: riderKeys.home});
    };
    const flush = () => {
      tripQueue.flush(riderId).catch(() => undefined);
    };
    let signalFlushAt = -Infinity;
    const flushOnSignal = () => {
      if (Date.now() - signalFlushAt >= SIGNAL_FLUSH_GAP_MS) {
        signalFlushAt = Date.now();
        tripQueue.flush(riderId, {now: true}).catch(() => undefined);
      }
    };
    riderOnlineService.pendingOffer().then(pending => pending && show(pending));
    // Ops ended the trip, or the order was cancelled (the TRIP_ENDED push): read it again now, not at the next upload.
    const tripEnded = DeviceEventEmitter.addListener(TRIP_ENDED_EVENT, refreshTrip);
    const offs = [
      () => tripEnded.remove(),
      riderOnlineService.onOffer(show),
      riderOnlineService.onTripChanged(refreshTrip),
      riderOnlineService.onStatus(status => {
        // Every working screen shows whether the phone reaches Craves (OfflineBanner).
        connection.update(status);
        if (status.state === 'ONLINE' || status.connected) {
          flushOnSignal();
        }
        if (status.state === 'OFFLINE' && status.message) {
          refreshTrip();
          Alert.alert(status.message);
        }
      }),
      tripQueue.onSent((_entry, trip) => {
        queryClient.setQueryData(riderKeys.activeTrip, trip);
        queryClient.invalidateQueries({queryKey: riderKeys.home});
      }),
      // The refusal itself stays on the trip and Home screens until the rider dismisses it (RefusalNotices).
      tripQueue.onRejected(refreshTrip),
    ];
    const timer = setInterval(flush, FLUSH_EVERY_MS);
    const appState = AppState.addEventListener('change', state => state === 'active' && flush());
    flush();
    return () => {
      mounted = false;
      offs.forEach(off => off());
      // Signed out or gone back to a gate: no stale "no connection" for whoever comes next.
      connection.update({state: 'OFFLINE'});
      clearInterval(timer);
      appState.remove();
    };
  }, [openOffer, queryClient, riderId]);

  return null;
}
