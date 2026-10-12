import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {colors, fontWeight, spacing, textDefaults, touchTarget, typography} from '../../../../design/tokens';

export interface SectionHeaderProps {
  title: string;
  /** Red link on the right, e.g. "See all". Shown only with onAction. */
  actionLabel?: string;
  onAction?: () => void;
}

export function SectionHeader({title, actionLabel, onAction}: SectionHeaderProps) {
  return (
    <View style={styles.row}>
      <Text
        accessibilityRole="header"
        allowFontScaling={textDefaults.allowFontScaling}
        style={styles.title}>
        {title}
      </Text>
      {actionLabel && onAction ? (
        <Pressable accessibilityRole="button" accessibilityLabel={actionLabel} onPress={onAction} style={styles.action}>
          <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.actionText}>
            {actionLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm},
  title: {flex: 1, color: colors.textPrimary, fontSize: typography.button, fontWeight: fontWeight.bold},
  action: {minHeight: touchTarget.minimum, justifyContent: 'center', paddingLeft: spacing.sm},
  actionText: {color: colors.flameRedAccessible, fontSize: typography.body, fontWeight: fontWeight.semibold},
});
