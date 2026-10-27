import React from 'react';
import {Linking, StyleSheet} from 'react-native';
import {spacing} from '../../../design/tokens';
import {useRiderShell} from '../navigation';
import {useRiderMe} from '../state/riderQueries';
import {tripQueue, useRefusals} from '../state/tripQueue';
import {useStrings} from '../strings/StringsProvider';
import {Banner} from './Banner';
import {BottomAction} from './BottomAction';
import {Card} from './ui';

/**
 * The server refused a step the queue sent, maybe long after the tap (blueprint A3): its reason and a call to support
 * stay until the rider dismisses them or a later step of that trip goes through. Every refusal, or one trip's.
 */
export function RefusalNotices({tripId}: {tripId?: string}) {
  const {strings} = useStrings();
  const {riderId} = useRiderShell();
  const supportPhone = useRiderMe().data?.supportPhone;
  const refusals = useRefusals(riderId, tripId);
  return (
    <>
      {refusals.map(refusal => (
        <Card key={refusal.tripId} style={styles.card}>
          <Banner tone="warning" inset title={strings.trip.stepRefused} text={refusal.message} testID="rider-refusal" />
          {supportPhone ? (
            <BottomAction
              label={strings.common.callSupport}
              variant="outline"
              size="compact"
              onPress={() => Linking.openURL(`tel:${supportPhone}`).catch(() => undefined)}
              testID="rider-refusal-call"
            />
          ) : null}
          <BottomAction
            label={strings.common.dismiss}
            variant="neutral"
            size="compact"
            onPress={() => tripQueue.dismissRefusal(refusal.tripId)}
            testID="rider-refusal-dismiss"
          />
        </Card>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  card: {gap: spacing.xs},
});
