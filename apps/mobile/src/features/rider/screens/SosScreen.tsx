import React, {useCallback, useEffect, useState} from 'react';
import {Linking, Pressable, Text, View} from 'react-native';
import {Icon} from '../../../shared/components';
import {colors, font, iconSize, radius, spacing, themedStyles, typography} from '../theme';
import {riderApi} from '../api/riderApi';
import {Banner} from '../components/Banner';
import {BottomAction} from '../components/BottomAction';
import {RiderScreen} from '../components/ui';
import {problemOf} from '../domain/problem';
import {riderOnlineService} from '../native/riderOnlineService';
import type {RiderScreenProps} from '../navigation';
import {EMERGENCY_NUMBER} from '../riderConfig';
import {hasRiderRole, useRiderMe} from '../state/riderQueries';
import {useStrings} from '../strings/StringsProvider';

const dial = (phone: string) => Linking.openURL(`tel:${phone}`).catch(() => undefined);

/** Opening this screen shares the rider's last location with ops at once; the calls are one tap each. Error red is used only here and on the SOS button. */
export function SosScreen({route, navigation}: RiderScreenProps<'Sos'>) {
  const {strings} = useStrings();
  const s = strings.sos;
  const me = useRiderMe().data;
  const supportPhone = me?.supportPhone;
  const tripId = route.params?.tripId;
  // Sharing the location needs the rider role (an active or paused rider); someone signing up or closed still gets
  // the calls, which never depend on Craves answering. Before /me answers, try anyway: the server decides.
  const canShare = !me || hasRiderRole(me);
  const [state, setState] = useState<'sharing' | 'shared' | 'failed' | 'callsOnly'>(canShare ? 'sharing' : 'callsOnly');

  const share = useCallback(() => {
    if (!canShare) {
      setState('callsOnly');
      return Promise.resolve();
    }
    setState('sharing');
    return riderApi.sendSos({tripId, fix: riderOnlineService.lastFix()}).then(
      () => setState('shared'),
      error => setState(problemOf(error) === 'notAllowed' ? 'callsOnly' : 'failed'),
    );
  }, [tripId, canShare]);

  useEffect(() => {
    share();
  }, [share]);

  // A 403 means "no rider role" only for someone /me doesn't know as a rider; for a rider it is a failed send, to retry.
  const shown = state === 'callsOnly' && hasRiderRole(me) ? 'failed' : state;

  return (
    <RiderScreen
      testID="rider-sos-screen"
      style={styles.red}
      footer={<BottomAction label={s.close} variant="outline" onPress={() => navigation.goBack()} testID="rider-sos-close" />}>
      <View style={styles.intro}>
        <Text accessibilityRole="header" style={styles.title}>
          {s.title}
        </Text>
        <Text style={styles.note}>{s.note}</Text>
      </View>
      <View accessibilityLiveRegion="polite" style={styles.status}>
        {shown === 'shared' ? (
          <Banner tone="success" icon="check-circle" title={s.shared} testID="rider-sos-shared" />
        ) : shown === 'callsOnly' ? (
          <Banner tone="info" icon="phone-outline" text={s.callsOnly} testID="rider-sos-calls-only" />
        ) : shown === 'failed' ? (
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
          <Icon name="phone-outline" size={iconSize.lg} color={colors.flameRedAccessible} surface={false} />
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
      <View style={styles.accident}>
        <Text style={styles.cardTitle}>{s.accidentTitle}</Text>
        <Text style={styles.cardBody}>{s.accidentBody}</Text>
      </View>
      {supportPhone ? <Text style={styles.foot}>{s.opsLine(supportPhone)}</Text> : null}
    </RiderScreen>
  );
}

const styles = themedStyles(c => ({
  // The whole screen is alarm red, the same Day or Night: white words on it pass 4.5:1, which flame red does not.
  red: {backgroundColor: c.sos},
  intro: {gap: spacing.xs, marginTop: spacing.md},
  title: {fontSize: typography.title, fontFamily: font.bold, color: c.white},
  note: {fontSize: typography.heading, fontFamily: font.semibold, color: c.white},
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
  callOps: {backgroundColor: c.white},
  call112: {backgroundColor: c.onWhite},
  pressed: {opacity: 0.9},
  lines: {alignItems: 'center', gap: 2},
  bigLabel: {flexShrink: 1, fontSize: typography.heading, fontFamily: font.bold, color: c.white, textAlign: 'center'},
  white: {color: c.flameRedAccessible},
  sub: {fontSize: typography.small, fontFamily: font.bold, color: c.white, textAlign: 'center'},
  accident: {backgroundColor: 'rgba(255, 255, 255, 0.14)', borderRadius: radius.lg, padding: spacing.md, gap: spacing.xs},
  cardTitle: {fontSize: typography.body, fontFamily: font.bold, color: c.white},
  cardBody: {fontFamily: font.regular, fontSize: typography.body, color: c.white},
  foot: {fontFamily: font.regular, fontSize: typography.small, color: c.white},
}));
