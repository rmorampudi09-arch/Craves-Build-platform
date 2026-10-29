import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {Badge, Icon} from '../../../shared/components';
import {borderWidth, colors, fontWeight, iconSize, radius, spacing, touchTarget, typography} from '../../../design/tokens';
import type {TripStep} from '../api/contract';
import type {RiderNav} from '../navigation';
import {isDemo} from '../riderConfig';
import {useActiveTrip, useRiderHome} from '../state/riderQueries';
import {useStrings} from '../strings/StringsProvider';

const STEP_NUMBER: Partial<Record<TripStep, number>> = {TO_KITCHEN: 1, AT_KITCHEN: 2, PICKED_UP: 3, AT_DROP: 4};

/**
 * The header of every working screen, with SOS always at the right (docs/riders/SCREENS.md 0.2):
 * - title + status chip (pass `title`);
 * - chip only (no `title`), as on Trip complete;
 * - back + title, no chip (pass `back`), as on Trip pay, Payouts, Notice and Help.
 * The chip says where the rider is: offline, waiting, or which trip step; `inactive` shows "Not active yet".
 * Long-press the chip for the demo controls.
 */
export function RiderHeader({
  title,
  tripId,
  back,
  inactive,
}: {
  title?: string;
  tripId?: string;
  back?: boolean;
  inactive?: boolean;
}) {
  const {strings} = useStrings();
  const navigation = useNavigation<RiderNav>();
  const online = useRiderHome().data?.online ?? false;
  const step = useActiveTrip().data?.step;
  const stepNumber = step ? STEP_NUMBER[step] : undefined;
  const live = !inactive && (online || stepNumber !== undefined);
  const chip = inactive
    ? strings.status.notActive
    : stepNumber
      ? strings.status.trip(stepNumber)
      : online
        ? strings.status.waiting
        : strings.status.offline;

  return (
    <View style={[styles.header, (back || !title) && styles.short]} testID="rider-header">
      {back ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={strings.common.back}
          onPress={() => navigation.goBack()}
          style={styles.back}
          testID="rider-back">
          <Icon name="chevron-left" size={iconSize.lg} color={colors.textPrimary} surface={false} />
        </Pressable>
      ) : null}
      <View style={styles.left}>
        {title ? (
          <Text accessibilityRole="header" style={styles.title} numberOfLines={2}>
            {title}
          </Text>
        ) : null}
        {back ? null : (
          <View style={styles.chips}>
            <Pressable
              accessibilityRole="text"
              accessibilityLabel={chip}
              delayLongPress={600}
              onLongPress={isDemo || __DEV__ ? () => navigation.navigate('DevPanel') : undefined}
              style={[styles.chip, live && styles.chipLive]}
              testID="rider-status-chip">
              <View style={[styles.dot, live && styles.dotLive]} />
              <Text style={styles.chipText}>{chip}</Text>
            </Pressable>
            {isDemo ? <Badge label={strings.common.demoData} tone="warning" /> : null}
          </View>
        )}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={strings.common.sosLabel}
        onPress={() => navigation.navigate('Sos', {tripId})}
        style={styles.sos}
        testID="rider-sos">
        <Text style={styles.sosText} numberOfLines={1}>
          {strings.common.sos}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderBottomWidth: borderWidth.standard,
    borderBottomColor: colors.border,
    backgroundColor: colors.white,
  },
  short: {minHeight: 64},
  // The 48 dp target hangs 8 dp into the padding, so the title starts at 56 dp.
  back: {
    width: touchTarget.minimum,
    height: touchTarget.minimum,
    marginLeft: -spacing.xs,
    marginRight: -spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  left: {flex: 1, gap: spacing.xxs},
  title: {fontSize: typography.heading, fontWeight: fontWeight.bold, color: colors.textPrimary},
  chips: {flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.xs},
  // Long statuses (Telugu, Kannada) wrap inside the chip instead of running past the header.
  chip: {
    minHeight: 24,
    maxWidth: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    borderWidth: borderWidth.standard,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  chipLive: {borderColor: colors.success, backgroundColor: colors.successSoft},
  dot: {width: 8, height: 8, borderRadius: 4, backgroundColor: colors.textSecondary},
  dotLive: {backgroundColor: colors.success},
  chipText: {flexShrink: 1, fontSize: typography.small, fontWeight: fontWeight.bold, color: colors.textPrimary},
  sos: {
    width: 56,
    height: touchTarget.minimum,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.error,
  },
  sosText: {color: colors.white, fontWeight: fontWeight.extrabold, fontSize: typography.button},
});
