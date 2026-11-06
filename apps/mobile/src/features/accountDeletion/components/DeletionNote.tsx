import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {colors, iconSize, radius, spacing, textDefaults, typography} from '../../../design/tokens';
import {Icon} from '../../../shared/components/Icon';

/** A tinted note: amber for what the person should know, green for what stays. */
export function DeletionNote({tone, text}: {tone: 'warning' | 'success'; text: string}) {
  const ink = tone === 'success' ? colors.successText : colors.warningText;
  return (
    <View style={[styles.note, {backgroundColor: tone === 'success' ? colors.successSoft : colors.warningSoft}]}>
      <Icon color={ink} name={tone === 'success' ? 'check' : 'info'} size={iconSize.sm} surface={false} />
      <Text allowFontScaling={textDefaults.allowFontScaling} style={[styles.text, {color: ink}]}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  note: {flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs, padding: spacing.sm, borderRadius: radius.md},
  text: {flex: 1, fontSize: typography.small},
});
