import React, {useState} from 'react';
import {Pressable, StyleProp, StyleSheet, Text, View, ViewStyle} from 'react-native';
import {Icon, LoadingIndicator, type IconName} from '../../../shared/components';
import {borderWidth, colors, fontWeight, iconSize, radius, spacing, touchTarget, typography} from '../../../design/tokens';
import {useReducedMotionPreference} from '../../../design/reducedMotion';

/**
 * The rider button (docs/riders/SCREENS.md 0.10): 56 dp, radius 14, no shadow.
 * - variant: primary (red fill), outline (white, grey line, dark label) or ghost (red text link).
 * - size: "tall" is the 64 dp Accept, "compact" the 48 dp in-card button.
 * - disabled shows the locked look (muted fill, grey label); pass leftIcon="lock-outline" when it unlocks later.
 * It ignores repeat taps until its async action settles, so a double tap never sends a trip step twice.
 */
export function BottomAction({
  label,
  onPress,
  disabled,
  variant = 'primary',
  size,
  leftIcon,
  accessibilityHint,
  style,
  testID,
}: {
  label: string;
  onPress: () => Promise<unknown> | void;
  disabled?: boolean;
  variant?: 'primary' | 'outline' | 'ghost';
  size?: 'tall' | 'compact';
  leftIcon?: IconName;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const [busy, setBusy] = useState(false);
  const reduceMotion = useReducedMotionPreference();
  const blocked = Boolean(disabled) || busy;
  const color = disabled
    ? colors.textSecondary
    : variant === 'primary'
      ? colors.white
      : variant === 'ghost'
        ? colors.flameRedAccessible
        : colors.textPrimary;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{disabled: blocked, busy}}
      disabled={blocked}
      testID={testID}
      onPress={() => {
        if (busy) {
          return;
        }
        const result = onPress();
        if (result instanceof Promise) {
          setBusy(true);
          result.finally(() => setBusy(false));
        }
      }}
      style={({pressed}) => [
        styles.base,
        styles[variant],
        size && styles[size],
        disabled && variant !== 'ghost' && styles.locked,
        pressed && styles.pressed,
        pressed && !reduceMotion && styles.pressedMotion,
        style,
      ]}>
      {busy ? (
        <LoadingIndicator accessible={false} color={color} size="small" />
      ) : (
        <View style={styles.row}>
          {leftIcon ? (
            <Icon name={leftIcon} size={variant === 'outline' ? iconSize.lg : iconSize.sm} color={color} surface={false} />
          ) : null}
          <Text style={[styles.label, size && labelSize[size], {color}]}>{label}</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: touchTarget.comfortable,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
  },
  primary: {backgroundColor: colors.flameRedAccessible},
  outline: {backgroundColor: colors.white, borderWidth: borderWidth.standard, borderColor: colors.borderStrong},
  ghost: {minHeight: touchTarget.minimum, paddingHorizontal: spacing.xs},
  tall: {minHeight: 64},
  compact: {minHeight: touchTarget.minimum},
  locked: {backgroundColor: colors.muted, borderWidth: 0},
  pressed: {opacity: 0.9},
  pressedMotion: {transform: [{scale: 0.985}]},
  row: {flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs},
  label: {flexShrink: 1, fontSize: typography.button, fontWeight: fontWeight.bold, textAlign: 'center'},
});

const labelSize = StyleSheet.create({
  tall: {fontSize: typography.heading},
  compact: {fontSize: typography.body},
});
