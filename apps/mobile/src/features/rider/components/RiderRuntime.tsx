import {useEffect, useRef} from 'react';
import {Alert, AppState, Platform} from 'react-native';
import {useQueryClient} from '@tanstack/react-query';
import {AppApiError} from '../../../core/http/apiError';
import type {Offer} from '../api/contract';
import {riderApi} from '../api/riderApi';
import {pickOffer, type ReceivedOffer} from '../domain/offerTiming';
import {riderDevice} from '../native/riderDevice';
import {riderOnlineService} from '../native/riderOnlineService';
import {RIDER_APP_VERSION} from '../riderConfig';
import {riderKeys} from '../state/riderQueries';
import {tripQueue} from '../state/tripQueue';
import {useStrings} from '../strings/StringsProvider';

const FLUSH_EVERY_MS = 15_000;
const model = Platform.OS === 'android' ? Platform.constants.Model : Platform.OS;

/**
 * Listens while the rider is signed in: registers the phone for offer pushes, rings offers (including the one whose
 * notification opened the app), refreshes trips and replays queued trip steps.
 */
export function RiderRuntime({riderId, openOffer}: {riderId: string; openOffer: (offer: ReceivedOffer) => void}) {
  const queryClient = useQueryClient();
  const shown = useRef<ReceivedOffer | null>(null);
  const device = useStrings().strings.device;

  useEffect(() => {
    const register = async (fcmToken: string | null) => {
      const installationId = await riderDevice.installationId();
      if (!fcmToken || !installationId) {
        return;
      }
      riderApi.registerDevice({installationId, fcmToken, appVersion: RIDER_APP_VERSION, model}).catch(error => {
        // 409 DEVICE_NOT_BOUND: ops must approve this phone. Other failures retry on the next start or token change.
        if (error instanceof AppApiError && error.status === 409) {
          Alert.alert(device.notApprovedTitle, device.notApprovedBody);
        }
      });
    };
    riderOnlineService.fcmToken().then(register);
    return riderOnlineService.onFcmToken(register);
  }, [device]);

  useEffect(() => {
    let mounted = true;
    // The countdown runs from receivedAtMs plus expiresInSec, never from the phone clock against expiresAt.
    const show = (offer: Offer, receivedAtMs: number) => {
      const next = pickOffer(shown.current, {offer, receivedAtMs}, Date.now());
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
    riderOnlineService.pendingOffer().then(pending => pending && show(pending.offer, pending.receivedAtMs));
    const offs = [
      riderOnlineService.onOffer(show),
      riderOnlineService.onTripChanged(refreshTrip),
      riderOnlineService.onStatus(status => {
        if (status.state === 'OFFLINE' && status.message) {
          refreshTrip();
          Alert.alert(status.message);
        }
      }),
      tripQueue.onSent((_entry, trip) => {
        queryClient.setQueryData(riderKeys.activeTrip, trip);
        queryClient.invalidateQueries({queryKey: riderKeys.home});
      }),
      tripQueue.onRejected((_entry, info) => {
        refreshTrip();
        // The trip screen shows a wrong or locked OTP by the code boxes.
        if (info.code !== 'OTP_INVALID' && info.code !== 'OTP_LOCKED') {
          Alert.alert(info.message);
        }
      }),
    ];
    const timer = setInterval(flush, FLUSH_EVERY_MS);
    const appState = AppState.addEventListener('change', state => state === 'active' && flush());
    flush();
    return () => {
      mounted = false;
      offs.forEach(off => off());
      clearInterval(timer);
      appState.remove();
    };
  }, [openOffer, queryClient, riderId]);

  return null;
}
