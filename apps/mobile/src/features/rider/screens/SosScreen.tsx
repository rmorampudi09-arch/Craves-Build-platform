import React, {useEffect, useState} from 'react';
import {Linking} from 'react-native';
import {Button} from '../../../shared/components';
import {riderApi} from '../api/riderApi';
import {Body, Card, Label, RiderScreen, Title} from '../components/ui';
import {riderOnlineService} from '../native/riderOnlineService';
import type {RiderScreenProps} from '../navigation';
import {EMERGENCY_NUMBER} from '../riderConfig';
import {useRiderMe} from '../state/riderQueries';
import {useStrings} from '../strings/StringsProvider';

/** Opening this screen shares the rider's last location with ops at once; the calls are one tap each. */
export function SosScreen({route, navigation}: RiderScreenProps<'Sos'>) {
  const {strings} = useStrings();
  const s = strings.sos;
  const supportPhone = useRiderMe().data?.supportPhone;
  const [state, setState] = useState<'sharing' | 'shared' | 'failed'>('sharing');

  useEffect(() => {
    riderApi
      .sendSos({tripId: route.params.tripId, fix: riderOnlineService.lastFix()})
      .then(() => setState('shared'), () => setState('failed'));
  }, [route.params.tripId]);

  const dial = (phone: string) => Linking.openURL(`tel:${phone}`).catch(() => undefined);

  return (
    <RiderScreen
      testID="rider-sos-screen"
      footer={<Button label={strings.common.cancel} variant="ghost" onPress={() => navigation.goBack()} />}>
      <Title>{s.title}</Title>
      <Body>{s.note}</Body>
      <Card>
        <Label>{state === 'sharing' ? s.sharing : state === 'shared' ? s.shared : s.failed}</Label>
      </Card>
      {supportPhone ? <Button label={s.callOps} leftIcon="phone" onPress={() => dial(supportPhone)} testID="rider-sos-ops" /> : null}
      <Button label={s.callEmergency} variant="outline" leftIcon="phone" onPress={() => dial(EMERGENCY_NUMBER)} />
    </RiderScreen>
  );
}
