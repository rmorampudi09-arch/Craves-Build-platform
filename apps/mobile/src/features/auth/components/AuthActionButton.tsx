import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import ArrowRight from 'lucide-react-native/icons/arrow-right';
import { colors, spacing, touchTarget } from '../../../design/tokens';
import { AuthSurfaceFinish } from './AuthSurfaceFinish';
import { loginColors, loginFonts } from './loginVisuals';

interface Props {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  outline?: boolean;
  outlineTone?: 'red' | 'neutral';
  arrow?: boolean;
  accessibilityHint?: string;
}

export function AuthActionButton({
  label,
  onPress,
  disabled,
  loading,
  outline,
  outlineTone = 'neutral',
  arrow = true,
  accessibilityHint,
}: Props) {
  const unavailable = Boolean(disabled || loading);
  return (
    <Pressable
      onPress={onPress}
      disabled={unavailable}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: unavailable, busy: Boolean(loading) }}
      style={({ pressed }) => [
        styles.button,
        outline && styles.outline,
        outline && outlineTone === 'red' && styles.redOutline,
        unavailable && styles.disabled,
        pressed && styles.pressed,
      ]}
    >
      {!outline ? <AuthSurfaceFinish action radius={16} /> : null}
      <Text
        style={[
          styles.label,
          outline && styles.outlineLabel,
          outline && outlineTone === 'red' && styles.redOutlineLabel,
        ]}
      >
        {label}
      </Text>
      {loading || (!outline && arrow) ? (
        <View style={styles.trailing} pointerEvents="none">
          {loading ? (
            <ActivityIndicator
              size="small"
              color={outline ? colors.flameRedAccessible : colors.white}
            />
          ) : (
            <ArrowRight size={23} color={colors.white} />
          )}
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: Math.max(50, touchTarget.minimum),
    borderRadius: 16,
    paddingHorizontal: 40,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.flameRedAccessible,
    borderWidth: 1,
    borderColor: loginColors.red,
    boxShadow: [
      { offsetX: 0, offsetY: 6, blurRadius: 16, color: 'rgba(246,46,24,0.24)' },
    ],
  },
  trailing: {
    position: 'absolute',
    right: 16,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  label: {
    color: colors.white,
    fontSize: 17,
    fontFamily: loginFonts.bold,
    textAlign: 'center',
    flexShrink: 1,
  },
  outline: {
    backgroundColor: 'transparent',
    borderColor: loginColors.border,
    boxShadow: [],
    paddingHorizontal: spacing.md,
  },
  outlineLabel: {
    color: loginColors.ink,
    fontFamily: loginFonts.semibold,
    fontSize: 15,
  },
  redOutline: { borderColor: loginColors.red },
  redOutlineLabel: { color: loginColors.textRed },
  disabled: { opacity: 0.7 },
  pressed: { opacity: 0.82 },
});
