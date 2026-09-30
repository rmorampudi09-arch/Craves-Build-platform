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

interface Props {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  outline?: boolean;
  accessibilityHint?: string;
}

export function AuthActionButton({
  label,
  onPress,
  disabled,
  loading,
  outline,
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
        unavailable && styles.disabled,
        pressed && styles.pressed,
      ]}
    >
      {!outline ? <View pointerEvents="none" style={styles.shine} /> : null}
      <Text style={[styles.label, outline && styles.outlineLabel]}>
        {label}
      </Text>
      {loading ? (
        <ActivityIndicator
          size="small"
          color={outline ? colors.flameRedAccessible : colors.white}
        />
      ) : !outline ? (
        <ArrowRight size={22} color={colors.white} />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: touchTarget.minimum,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.flameRedAccessible,
    borderWidth: 1,
    borderColor: colors.flameRedAccessible,
    overflow: 'hidden',
    boxShadow: [
      {offsetX: 0, offsetY: 2, blurRadius: 5, color: 'rgba(255,255,255,0.5)', inset: true},
      {offsetX: 0, offsetY: -2, blurRadius: 4, color: 'rgba(130,0,0,0.18)', inset: true},
    ],
  },
  shine: {
    position: 'absolute',
    top: 1,
    left: 2,
    right: 2,
    height: 17,
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.17)',
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.48)',
  },
  label: {
    color: colors.white,
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
    flexShrink: 1,
  },
  outline: { backgroundColor: colors.white, borderColor: '#DDE0E6', boxShadow: [] },
  outlineLabel: { color: colors.ink, fontWeight: '600' },
  disabled: { opacity: 0.56 },
  pressed: { opacity: 0.82 },
});
