import React, {memo, useEffect, useState} from 'react';
import {Alert} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {useQueryClient} from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import {Button, OfflineNotice, RecoverableErrorBanner, SectionSkeleton} from '../../../shared/components';
import {AppApiError} from '../../../core/http/apiError';
import {riderApi} from '../api/riderApi';
import {BottomAction} from '../components/BottomAction';
import {RiderHeader} from '../components/RiderHeader';
import {Body, Card, Label, Money, RiderScreen, riderStyles, Value} from '../components/ui';
import {formatClock, formatTimer} from '../domain/format';
import {riderOnlineService} from '../native/riderOnlineService';
import type {RiderNav} from '../navigation';
import {riderKeys, useActiveTrip, useRiderHome, useRiderMe} from '../state/riderQueries';
import {useStrings} from '../strings/StringsProvider';
import {usePhoneReadiness} from './PhoneSetupScreen';

const ShiftTimer = memo(function ShiftTimerView({startedAt}: {startedAt: string}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return <Value>{formatTimer((now - Date.parse(startedAt)) / 1000)}</Value>;
});

/** Opens the front camera; resolves to the photo URI, or null if the rider backed out. */
async function takeSelfie(deniedMessage: string): Promise<string | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) {
    Alert.alert(deniedMessage);
    return null;
  }
  const result = await ImagePicker.launchCameraAsync({
    cameraType: ImagePicker.CameraType.front,
    mediaTypes: ['images'],
    quality: 0.5,
  });
  return result.canceled ? null : result.assets[0]?.uri ?? null;
}

export function HomeScreen() {
  const {strings} = useStrings();
  const h = strings.home;
  const navigation = useNavigation<RiderNav>();
  const queryClient = useQueryClient();
  const home = useRiderHome();
  const me = useRiderMe();
  const trip = useActiveTrip();
  const phone = usePhoneReadiness();

  const tripInProgress = Boolean(trip.data && !['DELIVERED', 'FAILED', 'CANCELLED'].includes(trip.data.step));
  const online = home.data?.online ?? false;
  const refresh = () => queryClient.invalidateQueries({queryKey: riderKeys.all});

  // The server may still say "online" after a restart; keep the location loop in step with it.
  useEffect(() => {
    if (online) {
      riderOnlineService.start().catch(() => undefined);
    }
  }, [online]);

  async function goOnline() {
    if (!phone.ready) {
      navigation.navigate('PhoneSetup');
      return;
    }
    Alert.alert(h.selfieTitle, h.selfieWhy, [
      {text: strings.common.cancel, style: 'cancel'},
      {
        text: h.goOnline,
        onPress: async () => {
          try {
            const selfie = await takeSelfie(h.cameraDenied);
            if (!selfie) {
              return;
            }
            await riderApi.startShift(selfie);
            await riderOnlineService.start();
          } catch (error) {
            Alert.alert(error instanceof Error ? error.message : strings.common.error);
          } finally {
            refresh();
          }
        },
      },
    ]);
  }

  async function goOffline() {
    const stop = async () => {
      await riderOnlineService.stop();
      await riderApi.endShift().catch(() => undefined);
      refresh();
    };
    if (tripInProgress) {
      Alert.alert(h.confirmOfflineTitle, h.confirmOfflineBody, [
        {text: strings.common.cancel, style: 'cancel'},
        {text: h.goOffline, style: 'destructive', onPress: stop},
      ]);
      return;
    }
    await stop();
  }

  const offline = home.error instanceof AppApiError && (home.error.retriable || !home.error.status);
  const warnings = [
    phone.device && !phone.device.locationEnabled ? h.gpsOff : null,
    phone.device?.powerSaveMode ? h.batterySaver : null,
    !phone.notifications || phone.device?.notificationsEnabled === false ? h.notificationsOff : null,
  ].filter((w): w is string => Boolean(w));

  return (
    <RiderScreen
      header={<RiderHeader />}
      testID="rider-home"
      footer={
        online ? (
          <BottomAction label={h.goOffline} variant="outline" onPress={goOffline} testID="rider-go-offline" />
        ) : (
          <BottomAction label={h.goOnline} onPress={goOnline} disabled={!home.data} testID="rider-go-online" />
        )
      }>
      {offline ? <OfflineNotice message={strings.common.offline} onRetry={refresh} /> : null}
      {home.isError && !offline ? <RecoverableErrorBanner message={strings.common.error} onRetry={refresh} /> : null}
      {me.data?.notice ? (
        <Card>
          <Value>{h.noticeTitle}</Value>
          <Body>{me.data.notice.title}</Body>
          <Button label={h.openNotice} variant="outline" onPress={() => navigation.navigate('AccountStatus')} />
        </Card>
      ) : null}
      {tripInProgress ? (
        <Card>
          <Value>{h.resumeTitle}</Value>
          <Button label={h.resume} onPress={() => navigation.navigate('Trip')} testID="rider-resume-trip" />
        </Card>
      ) : null}
      {!phone.ready ? (
        <Card>
          <Body>{h.setupNeeded}</Body>
          <Button label={h.openSetup} variant="outline" onPress={() => navigation.navigate('PhoneSetup')} />
        </Card>
      ) : null}
      {warnings.map(warning => (
        <RecoverableErrorBanner key={warning} message={warning} />
      ))}
      {home.data ? (
        <>
          <Card>
            <Label>{h.today}</Label>
            <Money paise={home.data.todayEarningsPaise} testID="rider-today-earnings" />
            <Label>{h.trips(home.data.todayTrips)}</Label>
          </Card>
          {online ? (
            <Card style={riderStyles.gap}>
              <Label>{h.onShift}</Label>
              {home.data.shiftStartedAt ? <ShiftTimer startedAt={home.data.shiftStartedAt} /> : null}
              {home.data.zoneName ? <Body>{`${h.zone}: ${home.data.zoneName}`}</Body> : null}
              {home.data.slotEndsAt ? <Label>{h.slotEnds(formatClock(home.data.slotEndsAt))}</Label> : null}
            </Card>
          ) : null}
        </>
      ) : home.isLoading ? (
        <SectionSkeleton />
      ) : null}
    </RiderScreen>
  );
}
