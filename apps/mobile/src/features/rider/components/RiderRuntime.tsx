import {useEffect, useRef} from 'react';
import {Alert, AppState} from 'react-native';
import {useQueryClient} from '@tanstack/react-query';
import {pickOffer, type ReceivedOffer} from '../domain/offerTiming';
import {riderOnlineService} from '../native/riderOnlineService';
import {riderKeys} from '../state/riderQueries';
import {tripQueue} from '../state/tripQueue';

const FLUSH_EVERY_MS = 15_000;

/** Listens while the rider is signed in: rings offers, refreshes trips and replays queued trip steps. */
export function RiderRuntime({riderId, openOffer}: {riderId: string; openOffer: (offer: ReceivedOffer) => void}) {
  const queryClient = useQueryClient();
  const shown = useRef<ReceivedOffer | null>(null);

  useEffect(() => {
    const refreshTrip = () => {
      queryClient.invalidateQueries({queryKey: riderKeys.activeTrip});
      queryClient.invalidateQueries({queryKey: riderKeys.home});
    };
    const flush = () => {
      tripQueue.flush(riderId).catch(() => undefined);
    };
    const offs = [
      riderOnlineService.onOffer((offer, receivedAtMs) => {
        const next = pickOffer(shown.current, {offer, receivedAtMs}, Date.now());
        if (next && next !== shown.current) {
          shown.current = next;
          openOffer(next);
        }
      }),
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
      offs.forEach(off => off());
      clearInterval(timer);
      appState.remove();
    };
  }, [openOffer, queryClient, riderId]);

  return null;
}
