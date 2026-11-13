import React from 'react';
import {Text, View} from 'react-native';
import {font, spacing, themedStyles, typography} from '../theme';
import {useStrings} from '../strings/StringsProvider';

const STEPS = [1, 2, 3, 4];

/**
 * The route strip: four stops joined by a line, done stops dark, the current one flame red. On a trip each stop is
 * named (To kitchen, At kitchen, To customer, Hand over) and it reads "Trip step N of 4"; pass `label` to say what
 * the steps are instead (the application's), and the stops go unnamed. Put it under RiderHeader in the header slot.
 */
export function StepBar({step, label}: {step: number; label?: string}) {
  const {strings} = useStrings();
  const names = label ? undefined : strings.status.route;
  return (
    <View accessible accessibilityLabel={label ?? strings.status.tripStep(step)} style={styles.bar} testID="rider-step-bar">
      {STEPS.map(n => (
        <View key={n} style={styles.stop}>
          {n > 1 ? <View style={[styles.line, n <= step && styles.lineDone]} /> : null}
          <View style={[styles.pip, n < step && styles.pipDone, n === step && styles.pipCurrent]} testID={`rider-step-${n}`} />
          {names ? (
            <Text style={[styles.name, n === step && styles.nameCurrent]} numberOfLines={2}>
              {names[n - 1]}
            </Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}

const PIP = 20;

const styles = themedStyles(c => ({
  bar: {flexDirection: 'row', paddingHorizontal: spacing.xs, paddingTop: spacing.xxs, paddingBottom: spacing.sm, backgroundColor: c.ground},
  stop: {flex: 1, alignItems: 'center', gap: 6},
  // Each stop draws the line from the stop before it, under its own pip.
  line: {position: 'absolute', top: PIP / 2 - 1.5, left: '-50%', width: '100%', height: 3, backgroundColor: c.borderStrong},
  lineDone: {backgroundColor: c.textPrimary},
  pip: {width: PIP, height: PIP, borderRadius: PIP / 2, borderWidth: 3, borderColor: c.borderStrong, backgroundColor: c.surface},
  pipDone: {borderColor: c.textPrimary, backgroundColor: c.textPrimary},
  pipCurrent: {borderColor: c.flameRed, backgroundColor: c.flameRed},
  name: {fontFamily: font.regular, fontSize: typography.tiny, color: c.textSecondary, textAlign: 'center'},
  nameCurrent: {fontFamily: font.bold, color: c.textPrimary},
}));
