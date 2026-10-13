import React from 'react';
import {Pressable, StyleProp, StyleSheet, Text, View, ViewStyle} from 'react-native';
import {
  borderWidth,
  colors,
  fontWeight,
  iconSize,
  radius,
  spacing,
  textDefaults,
  touchTarget,
  typography,
} from '../../../../design/tokens';
import {Icon, type IconName} from '../../../../shared/components/Icon';
import {LoadingIndicator} from '../../../../shared/components/LoadingIndicator';

export type ChefActionTone = 'primary' | 'success' | 'neutral' | 'inverse' | 'ghost';

export interface ChefActionButtonProps {
  label: string;
  onPress: () => void;
  tone?: ChefActionTone;
  icon?: IconName;
  /** Request in flight: spinner, and taps are ignored. */
  busy?: boolean;
  disabled?: boolean;
  /** Smaller horizontal padding, for a button inside a row. */
  compact?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

const TONES: Record<ChefActionTone, {background: string; foreground: string; border?: string}> = {
  primary: {background: colors.flameRedAccessible, foreground: colors.white},
  success: {background: colors.successText, foreground: colors.white},
  neutral: {background: colors.white, foreground: colors.textPrimary, border: colors.borderStrong},
  // White on the dark balance card.
  inverse: {background: colors.white, foreground: colors.textPrimary},
  ghost: {background: colors.white, foreground: colors.flameRedAccessible},
};

/** The board's buttons: red main action, green go, neutral outline for the quieter choice. 48 dp tall. */
export function ChefActionButton({
  label,
  onPress,
  tone = 'primary',
  icon,
  busy = false,
  disabled = false,
  compact = false,
  accessibilityLabel,
  style,
}: ChefActionButtonProps) {
  const {background, foreground, border} = TONES[tone];
  const blocked = busy || disabled;
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityRole="button"
      accessibilityState={{disabled: blocked, busy}}
      disabled={blocked}
      onPress={onPress}
      style={({pressed}) => [
        styles.base,
        compact && styles.compact,
        {backgroundColor: background},
        border ? {borderColor: border, borderWidth: borderWidth.focus} : undefined,
        blocked && styles.blocked,
        pressed && styles.pressed,
        style,
      ]}>
      {busy ? (
        <LoadingIndicator accessible={false} color={foreground} size="small" />
      ) : (
        <View style={styles.row}>
          {icon ? <Icon color={foreground} name={icon} size={iconSize.sm} surface={false} /> : null}
          <Text allowFontScaling={textDefaults.allowFontScaling} numberOfLines={2} style={[styles.label, {color: foreground}]}>
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: touchTarget.minimum,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  compact: {paddingHorizontal: spacing.sm},
  blocked: {opacity: 0.6},
  pressed: {opacity: 0.85},
  row: {flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, maxWidth: '100%'},
  label: {flexShrink: 1, fontSize: typography.body, fontWeight: fontWeight.bold, textAlign: 'center'},
});
