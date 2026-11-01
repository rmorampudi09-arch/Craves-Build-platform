import React from 'react';
import {StyleSheet, View} from 'react-native';
import {colors, radius, spacing} from '../../../design/tokens';
import {useStrings} from '../strings/StringsProvider';

const STEPS = [1, 2, 3, 4];

/**
 * The 4-segment bar; done and current steps are dark. Put it under RiderHeader in RiderScreen's header slot. It reads
 * "Trip step N of 4" unless `label` says what the steps are (the application's).
 */
export function StepBar({step, label}: {step: number; label?: string}) {
  const {strings} = useStrings();
  return (
    <View accessible accessibilityLabel={label ?? strings.status.tripStep(step)} style={styles.bar} testID="rider-step-bar">
      {STEPS.map(n => (
        <View key={n} style={[styles.segment, n <= step && styles.done]} testID={`rider-step-${n}`} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {flexDirection: 'row', gap: spacing.xxs, paddingHorizontal: spacing.md, paddingTop: spacing.sm},
  segment: {flex: 1, height: 4, borderRadius: radius.pill, backgroundColor: colors.border},
  done: {backgroundColor: colors.textPrimary},
});
