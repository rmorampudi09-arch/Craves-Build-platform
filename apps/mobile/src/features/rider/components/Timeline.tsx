import React, {type ReactNode} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {Icon} from '../../../shared/components';
import {borderWidth, colors, fontWeight, iconSize, radius, spacing, typography} from '../../../design/tokens';
import {useStrings} from '../strings/StringsProvider';

export type TimelineState = 'done' | 'current' | 'todo';

export interface TimelineItem {
  title: string;
  body?: string;
  state: TimelineState;
  /** A button under the current step, when the rider can do it now. */
  action?: ReactNode;
  testID?: string;
}

/**
 * Where the rider stands and what comes next, top to bottom, with DESIGN.md's step circles: a done step is a green circle
 * with a check, the current one a dark ring with its number, a later one an empty ring. A line joins each to the next.
 */
export function Timeline({items}: {items: TimelineItem[]}) {
  const {strings} = useStrings();
  return (
    <View>
      {items.map((item, index) => {
        const last = index === items.length - 1;
        const done = item.state === 'done';
        const state = done ? strings.setup.done : strings.setup.notDone;
        return (
          <View key={item.title} style={styles.row}>
            <View style={styles.rail}>
              <View style={[styles.circle, done && styles.circleDone, item.state === 'current' && styles.circleCurrent]}>
                {done ? <Icon name="check" size={iconSize.xs} color={colors.white} surface={false} /> : null}
                {item.state === 'current' ? <Text style={styles.number}>{index + 1}</Text> : null}
              </View>
              {last ? null : <View style={[styles.line, done && styles.lineDone]} />}
            </View>
            <View style={[styles.text, !last && styles.space]}>
              <View
                accessible
                accessibilityLabel={[item.title, state, item.body].filter(Boolean).join('. ')}
                testID={item.testID}>
                <Text style={[styles.title, item.state === 'todo' && styles.later]}>{item.title}</Text>
                {item.body ? <Text style={styles.body}>{item.body}</Text> : null}
              </View>
              {item.action}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const CIRCLE = 28;

const styles = StyleSheet.create({
  row: {flexDirection: 'row', gap: spacing.sm},
  rail: {width: CIRCLE, alignItems: 'center'},
  circle: {
    width: CIRCLE,
    height: CIRCLE,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: borderWidth.strong,
    borderColor: colors.borderStrong,
    backgroundColor: colors.white,
  },
  circleDone: {borderColor: colors.success, backgroundColor: colors.success},
  circleCurrent: {borderColor: colors.textPrimary},
  number: {fontSize: 13, fontWeight: fontWeight.bold, color: colors.textPrimary},
  line: {flex: 1, width: 2, minHeight: spacing.md, marginVertical: spacing.xxs, backgroundColor: colors.border},
  lineDone: {backgroundColor: colors.success},
  // The first line of text sits level with the middle of its circle.
  text: {flex: 1, gap: spacing.xs, paddingTop: 3},
  space: {paddingBottom: spacing.md},
  title: {fontSize: typography.body, fontWeight: fontWeight.bold, color: colors.textPrimary},
  later: {color: colors.textSecondary},
  body: {fontSize: typography.body, color: colors.textSecondary},
});
