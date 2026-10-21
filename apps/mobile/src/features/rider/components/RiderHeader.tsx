import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {Badge} from '../../../shared/components';
import {borderWidth, colors, fontWeight, radius, spacing, touchTarget, typography} from '../../../design/tokens';
import type {TripStep} from '../api/contract';
import type {RiderNav} from '../navigation';
import {isDemo} from '../riderConfig';
import {useActiveTrip, useRiderHome} from '../state/riderQueries';
import {useStrings} from '../strings/StringsProvider';

const STEP_NUMBER: Partial<Record<TripStep, number>> = {TO_KITCHEN: 1, AT_KITCHEN: 2, PICKED_UP: 3, AT_DROP: 4};

/** Always shows where the rider is: offline, waiting, or which trip step. Long-press opens demo controls. */
export function RiderHeader({title, tripId}: {title?: string; tripId?: string}) {
  const {strings} = useStrings();
  const navigation = useNavigation<RiderNav>();
  const online = useRiderHome().data?.online ?? false;
  const step = useActiveTrip().data?.step;
  const stepNumber = step ? STEP_NUMBER[step] : undefined;
  const live = online || stepNumber !== undefined;
  const chip = stepNumber
    ? strings.status.trip(stepNumber)
    : online
      ? strings.status.waiting
      : strings.status.offline;

  return (
    <View style={styles.header}>
      <View style={styles.left}>
        {title ? (
          <Text accessibilityRole="header" style={styles.title} numberOfLines={1}>
            {title}
          </Text>
        ) : null}
        <View style={styles.chips}>
          <Pressable
            accessibilityRole="text"
            accessibilityLabel={chip}
            delayLongPress={600}
            onLongPress={isDemo || __DEV__ ? () => navigation.navigate('DevPanel') : undefined}
            style={[styles.chip, live && styles.chipOn]}
            testID="rider-status-chip">
            <View style={[styles.dot, live && styles.dotOn]} />
            <Text style={styles.chipText}>{chip}</Text>
          </Pressable>
          {isDemo ? <Badge label={strings.common.demoData} tone="warning" /> : null}
        </View>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={strings.common.sosLabel}
        onPress={() => navigation.navigate('Sos', {tripId})}
        style={styles.sos}
        testID="rider-sos">
        <Text style={styles.sosText}>{strings.common.sos}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderBottomWidth: borderWidth.standard,
    borderBottomColor: colors.border,
  },
  left: {flex: 1, gap: spacing.xxs},
  title: {fontSize: typography.heading, fontWeight: fontWeight.bold, color: colors.textPrimary},
  chips: {flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.xs},
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderRadius: radius.pill,
    borderWidth: borderWidth.standard,
    borderColor: colors.border,
  },
  chipOn: {borderColor: colors.success, backgroundColor: colors.successSoft},
  dot: {width: 8, height: 8, borderRadius: 4, backgroundColor: colors.textSecondary},
  dotOn: {backgroundColor: colors.success},
  chipText: {fontSize: typography.small, fontWeight: fontWeight.semibold, color: colors.textPrimary},
  sos: {
    minWidth: touchTarget.minimum,
    minHeight: touchTarget.minimum,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.error,
  },
  sosText: {color: colors.white, fontWeight: fontWeight.extrabold, fontSize: typography.button},
});
