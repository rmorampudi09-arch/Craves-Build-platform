import React, {useCallback, useEffect, useState} from 'react';
import {Linking, Pressable, StyleSheet, Text, View} from 'react-native';
import {Icon} from '../../../shared/components';
import {borderWidth, colors, fontWeight, iconSize, radius, spacing, typography} from '../../../design/tokens';
import {riderApi} from '../api/riderApi';
import {Banner} from '../components/Banner';
import {BottomAction} from '../components/BottomAction';
import {Body, Card, RiderScreen} from '../components/ui';
import {riderOnlineService} from '../native/riderOnlineService';
import type {RiderScreenProps} from '../navigation';
import {EMERGENCY_NUMBER} from '../riderConfig';
import {useRiderMe} from '../state/riderQueries';
import {useStrings} from '../strings/StringsProvider';

const dial = (phone: string) => Linking.openURL(`tel:${phone}`).catch(() => undefined);

/** Opening this screen shares the rider's last location with ops at once; the calls are one tap each. Error red is used only here and on the SOS button. */
export function SosScreen({route, navigation}: RiderScreenProps<'Sos'>) {
  const {strings} = useStrings();
  const s = strings.sos;
  const supportPhone = useRiderMe().data?.supportPhone;
  const tripId = route.params?.tripId;
  const [state, setState] = useState<'sharing' | 'shared' | 'failed'>('sharing');

  const share = useCallback(() => {
    setState('sharing');
    return riderApi.sendSos({tripId, fix: riderOnlineService.lastFix()}).then(
      () => setState('shared'),
      () => setState('failed'),
    );
  }, [tripId]);

  useEffect(() => {
    share();
  }, [share]);

  return (
    <RiderScreen
      testID="rider-sos-screen"
      footer={<BottomAction label={s.close} variant="outline" onPress={() => navigation.goBack()} testID="rider-sos-close" />}>
      <View style={styles.intro}>
        <Text accessibilityRole="header" style={styles.title}>
          {s.title}
        </Text>
        <Text style={styles.note}>{s.note}</Text>
      </View>
      <View accessibilityLiveRegion="polite" style={styles.status}>
        {state === 'shared' ? (
          <Banner tone="success" icon="check-circle" title={s.shared} testID="rider-sos-shared" />
        ) : state === 'failed' ? (
          <>
            <Banner tone="warning" text={s.failed} testID="rider-sos-failed" />
            <BottomAction label={s.sendAgain} variant="ghost" onPress={share} style={styles.again} testID="rider-sos-again" />
          </>
        ) : (
          <Banner tone="info" icon="map-marker-outline" text={s.sharing} />
        )}
      </View>
      {supportPhone ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={s.callOps}
          onPress={() => dial(supportPhone)}
          style={({pressed}) => [styles.big, styles.callOps, pressed && styles.pressed]}
          testID="rider-sos-ops">
          <Icon name="phone-outline" size={iconSize.lg} color={colors.white} surface={false} />
          <Text style={[styles.bigLabel, styles.white]}>{s.callOps}</Text>
        </Pressable>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${s.call112}, ${s.call112Sub}`}
        onPress={() => dial(EMERGENCY_NUMBER)}
        style={({pressed}) => [styles.big, styles.call112, pressed && styles.pressed]}
        testID="rider-sos-112">
        <View style={styles.lines}>
          <Text style={styles.bigLabel}>{s.call112}</Text>
          <Text style={styles.sub}>{s.call112Sub}</Text>
        </View>
      </Pressable>
      <Card>
        <Text style={styles.cardTitle}>{s.accidentTitle}</Text>
        <Body>{s.accidentBody}</Body>
      </Card>
    </RiderScreen>
  );
}

const styles = StyleSheet.create({
  intro: {gap: spacing.xs, marginTop: spacing.md},
  title: {fontSize: typography.title, fontWeight: fontWeight.bold, color: colors.error},
  note: {fontSize: typography.heading, fontWeight: fontWeight.medium, color: colors.textPrimary},
  status: {gap: spacing.xxs, marginTop: spacing.xs},
  again: {alignSelf: 'flex-start', marginLeft: -spacing.xs},
  big: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
  callOps: {backgroundColor: colors.error},
  call112: {backgroundColor: colors.white, borderWidth: borderWidth.standard, borderColor: colors.textPrimary},
  pressed: {opacity: 0.9},
  lines: {alignItems: 'center', gap: 2},
  bigLabel: {flexShrink: 1, fontSize: typography.heading, fontWeight: fontWeight.bold, color: colors.textPrimary, textAlign: 'center'},
  white: {color: colors.white},
  sub: {fontSize: typography.small, fontWeight: fontWeight.bold, color: colors.textSecondary, textAlign: 'center'},
  cardTitle: {fontSize: typography.body, fontWeight: fontWeight.bold, color: colors.textPrimary},
});
