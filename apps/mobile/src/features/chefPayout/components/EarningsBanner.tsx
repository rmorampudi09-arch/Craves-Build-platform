import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {colors, fontWeight, iconSize, radius, spacing, textDefaults, typography} from '../../../design/tokens';
import {Icon, type IconName} from '../../../shared/components/Icon';
import {ChefActionButton} from '../../chefShell/components/ui';

const TONES = {
  success: {background: colors.successSoft, foreground: colors.successText, icon: 'check'},
  warning: {background: colors.warningSoft, foreground: colors.warningText, icon: 'alert'},
  error: {background: colors.errorSoft, foreground: colors.error, icon: 'alert'},
} as const satisfies Record<string, {background: string; foreground: string; icon: IconName}>;

export interface EarningsBannerProps {
  tone: keyof typeof TONES;
  title: string;
  body?: string;
  action?: {label: string; busy?: boolean; onPress: () => void};
}

/** Soft-tinted note with an icon, a title, one line of detail and at most one button. */
export function EarningsBanner({tone, title, body, action}: EarningsBannerProps) {
  const {background, foreground, icon} = TONES[tone];
  return (
    <View accessibilityLiveRegion="polite" style={[styles.banner, {backgroundColor: background}]}>
      <View style={styles.row}>
        <Icon color={foreground} name={icon} size={iconSize.md} surface={false} />
        <View style={styles.text}>
          <Text allowFontScaling={textDefaults.allowFontScaling} style={[styles.title, {color: foreground}]}>
            {title}
          </Text>
          {body ? (
            <Text allowFontScaling={textDefaults.allowFontScaling} style={[styles.body, {color: foreground}]}>
              {body}
            </Text>
          ) : null}
        </View>
      </View>
      {action ? <ChefActionButton busy={action.busy} label={action.label} onPress={action.onPress} tone="neutral" /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {gap: spacing.sm, padding: spacing.md, borderRadius: radius.md},
  row: {flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm},
  text: {flex: 1, minWidth: 0, gap: spacing.xxs},
  title: {fontSize: typography.body, fontWeight: fontWeight.bold},
  body: {fontSize: typography.small},
});
