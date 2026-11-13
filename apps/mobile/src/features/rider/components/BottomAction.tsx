import React, {useState} from 'react';
import {Pressable, StyleProp, Text, View, ViewStyle} from 'react-native';
import {Icon, LoadingIndicator, type IconName} from '../../../shared/components';
import {borderWidth, colors, font, iconSize, spacing, themedStyles, touchTarget, typography} from '../theme';
import {useReducedMotionPreference} from '../../../design/reducedMotion';

/**
 * The rider button (DESIGN.md "Buttons"): radius 18, no shadow.
 * - variant: primary (64 dp, flame red, white bold label), outline (56 dp, 2 dp line, dark label), ghost (red text
 *   link) or neutral (grey text link).
 * - size: "tall" is the 72 dp Accept, "compact" the 48 dp in-card button.
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
  variant?: 'primary' | 'outline' | 'ghost' | 'neutral';
  size?: 'tall' | 'compact';
  leftIcon?: IconName;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const [busy, setBusy] = useState(false);
  const reduceMotion = useReducedMotionPreference();
  const blocked = Boolean(disabled) || busy;
  const color = disabled || variant === 'neutral'
    ? colors.textSecondary
    : variant === 'primary'
      ? colors.white
      : variant === 'ghost'
        ? colors.redText
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
        disabled && variant !== 'ghost' && variant !== 'neutral' && styles.locked,
        pressed && (variant === 'primary' && !disabled ? styles.primaryPressed : styles.pressed),
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

const styles = themedStyles(c => ({
  // The vertical padding only shows when a label wraps (Telugu, Hindi, Kannada or large text): the lines keep off the edge.
  base: {
    minHeight: touchTarget.comfortable,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
    borderRadius: 18,
  },
  primary: {minHeight: 64, backgroundColor: c.flameRed},
  primaryPressed: {backgroundColor: c.flameRedAccessible},
  outline: {backgroundColor: 'transparent', borderWidth: borderWidth.strong, borderColor: c.borderStrong},
  ghost: {minHeight: touchTarget.minimum, paddingHorizontal: spacing.xs},
  neutral: {minHeight: touchTarget.minimum, paddingHorizontal: spacing.xs},
  tall: {minHeight: 72},
  compact: {minHeight: touchTarget.minimum},
  locked: {backgroundColor: c.muted, borderWidth: 0},
  pressed: {opacity: 0.8},
  pressedMotion: {transform: [{scale: 0.985}]},
  row: {flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs},
  label: {flexShrink: 1, fontSize: typography.button, fontFamily: font.bold, textAlign: 'center'},
}));

const labelSize = themedStyles(() => ({
  tall: {fontSize: typography.headerTitle},
  compact: {fontSize: typography.body},
}));
