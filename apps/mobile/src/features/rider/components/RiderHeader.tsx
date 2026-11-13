import React from 'react';
import {Pressable, Text, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {Icon} from '../../../shared/components';
import {borderWidth, colors, font, iconSize, radius, spacing, themedStyles, touchTarget, typography} from '../theme';
import type {TripStep} from '../api/contract';
import type {RiderNav} from '../navigation';
import {isDemo} from '../riderConfig';
import {useActiveTrip, useRiderHome} from '../state/riderQueries';
import {useStrings} from '../strings/StringsProvider';
import {OfflineBanner} from './OfflineBanner';
import {RiderBadge} from './StatusBadge';

const STEP_NUMBER: Partial<Record<TripStep, number>> = {TO_KITCHEN: 1, AT_KITCHEN: 2, PICKED_UP: 3, AT_DROP: 4};

/**
 * The header of every working screen, with SOS always at the right (docs/riders/SCREENS.md 0.2):
 * - title + status chip (pass `title`);
 * - chip only (no `title`), as on Trip complete;
 * - back + title, no chip (pass `back`), as on Trip pay, Payouts, Notice and Help.
 * The chip says where the rider is: offline, waiting, or which trip step; `inactive` shows "Not active yet".
 * Long-press the chip for the demo controls. Under it, while the phone can't reach Craves, the offline strip.
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
  // On a trip the chip takes the phase colour: peach while the kitchen is next, mint once the food is on board.
  const phase = inactive || !stepNumber ? null : stepNumber <= 2 ? styles.chipKitchen : styles.chipDrop;
  const chip = inactive
    ? strings.status.notActive
    : stepNumber
      ? strings.status.trip(stepNumber)
      : online
        ? strings.status.waiting
        : strings.status.offline;

  return (
    <>
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
                style={[styles.chip, live && styles.chipLive, phase]}
                testID="rider-status-chip">
                <View style={[styles.dot, live && styles.dotLive, phase && styles.dotPhase]} />
                <Text style={[styles.chipText, phase && styles.chipTextPhase]}>{chip}</Text>
              </Pressable>
              {isDemo ? <RiderBadge label={strings.common.demoData} tone="warning" /> : null}
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
      <OfflineBanner />
    </>
  );
}

const styles = themedStyles(c => ({
  // The header sits on the ground colour with no line: the cards below make the edge.
  header: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingLeft: spacing.md,
    paddingRight: spacing.sm,
    paddingVertical: spacing.xs,
    backgroundColor: c.ground,
  },
  short: {minHeight: 60},
  // The 48 dp target hangs 8 dp into the padding, so the title starts at 56 dp.
  back: {
    width: touchTarget.minimum,
    height: touchTarget.minimum,
    marginLeft: -spacing.xs,
    marginRight: -spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  left: {flex: 1, gap: 6},
  title: {fontSize: typography.headerTitle, fontFamily: font.bold, color: c.textPrimary},
  chips: {flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.xs},
  // Long statuses (Telugu, Kannada) wrap inside the chip instead of running past the header.
  chip: {
    minHeight: 32,
    maxWidth: '100%',
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
    borderWidth: borderWidth.standard,
    borderColor: c.border,
    backgroundColor: c.surface,
  },
  chipLive: {borderColor: c.successSoft, backgroundColor: c.successSoft},
  chipKitchen: {borderColor: c.kitchen, backgroundColor: c.kitchen},
  chipDrop: {borderColor: c.drop, backgroundColor: c.drop},
  dot: {width: 8, height: 8, borderRadius: 4, backgroundColor: c.textSecondary},
  dotLive: {backgroundColor: c.success},
  dotPhase: {backgroundColor: c.kitchenInk},
  chipText: {flexShrink: 1, fontSize: typography.small, fontFamily: font.semibold, color: c.textPrimary},
  chipTextPhase: {color: c.kitchenInk},
  sos: {
    minWidth: 60,
    height: touchTarget.minimum,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: c.error,
  },
  sosText: {color: c.white, fontFamily: font.display, fontSize: typography.button, letterSpacing: 0.5},
}));
