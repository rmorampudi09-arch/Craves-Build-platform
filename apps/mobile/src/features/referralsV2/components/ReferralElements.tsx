import React, { type PropsWithChildren } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Copy from 'lucide-react-native/icons/copy';
import {
  referralColors,
  referralFonts,
  referralLayout,
} from './referralVisuals';

export function ReferralSection({
  title,
  badge,
  children,
}: PropsWithChildren<{ title: string; badge?: string }>) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeading}>
        <Text accessibilityRole="header" style={styles.sectionTitle}>
          {title}
        </Text>
        {badge ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{badge}</Text>
          </View>
        ) : null}
      </View>
      {children}
    </View>
  );
}

export function ReferralButton({
  label,
  onPress,
  outline = false,
  busy = false,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  outline?: boolean;
  busy?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || busy, busy }}
      accessibilityLabel={label}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        outline && styles.outlineButton,
        pressed && styles.pressed,
      ]}
    >
      {busy ? (
        <ActivityIndicator
          color={outline ? referralColors.muted : referralColors.white}
        />
      ) : (
        <Text style={[styles.buttonText, outline && styles.outlineText]}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

export function ReferralCopyBox({
  value,
  onCopy,
  label,
  code = false,
  disabled = false,
}: {
  value: string;
  onCopy: () => void;
  label: string;
  code?: boolean;
  disabled?: boolean;
}) {
  return (
    <View style={styles.copyBox}>
      <Text selectable style={[styles.copyValue, code && styles.code]}>
        {value}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={onCopy}
        style={styles.copyButton}
      >
        <Copy color={referralColors.muted} size={23} strokeWidth={1.8} />
      </Pressable>
    </View>
  );
}

export function ReferralStep({
  number,
  title,
  detail,
  last = false,
}: {
  number: number;
  title: string;
  detail: string;
  last?: boolean;
}) {
  return (
    <View style={[styles.step, !last && styles.divider]}>
      <View style={styles.stepNumber}>
        <Text style={styles.stepNumberText}>{number}</Text>
      </View>
      <View style={styles.stepCopy}>
        <Text style={styles.stepTitle}>{title}</Text>
        <Text style={referralText.body}>{detail}</Text>
      </View>
    </View>
  );
}

export const referralText = StyleSheet.create({
  body: {
    fontFamily: referralFonts.regular,
    fontSize: 13,
    lineHeight: 20,
    color: referralColors.muted,
  },
  caption: {
    fontFamily: referralFonts.regular,
    fontSize: 11,
    lineHeight: 17,
    color: referralColors.muted,
    textAlign: 'center',
  },
  strong: {
    fontFamily: referralFonts.semibold,
    fontSize: 14,
    color: referralColors.ink,
  },
  amount: {
    fontFamily: referralFonts.bold,
    fontSize: 24,
    color: referralColors.ink,
    fontVariant: ['tabular-nums'],
  },
  gap: { marginTop: 10 },
});

const styles = StyleSheet.create({
  section: {
    borderWidth: 1,
    borderColor: referralColors.border,
    borderRadius: referralLayout.sectionRadius,
    backgroundColor: referralColors.white,
    padding: 14,
    gap: 12,
  },
  sectionHeading: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  sectionTitle: {
    fontFamily: referralFonts.bold,
    fontSize: 17,
    color: referralColors.ink,
    flexShrink: 1,
  },
  badge: {
    borderRadius: 20,
    backgroundColor: referralColors.fill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeText: {
    fontFamily: referralFonts.regular,
    fontSize: 11,
    color: referralColors.muted,
  },
  button: {
    minHeight: 44,
    borderRadius: 8,
    paddingVertical: 11,
    paddingHorizontal: 14,
    backgroundColor: referralColors.red,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    fontFamily: referralFonts.semibold,
    fontSize: 14,
    color: referralColors.white,
    textAlign: 'center',
  },
  outlineButton: {
    backgroundColor: referralColors.white,
    borderWidth: 1,
    borderColor: '#B5BAC3',
    minHeight: 40,
  },
  outlineText: { color: referralColors.ink, fontFamily: referralFonts.regular },
  pressed: { opacity: 0.8 },
  copyBox: {
    backgroundColor: referralColors.fill,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 12,
    paddingVertical: 4,
  },
  copyValue: {
    flex: 1,
    fontFamily: referralFonts.regular,
    fontSize: 14,
    lineHeight: 20,
    color: referralColors.ink,
    paddingVertical: 9,
  },
  code: { fontFamily: referralFonts.semibold },
  copyButton: {
    width: 48,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  step: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 9,
  },
  divider: {
    borderBottomColor: referralColors.border,
    borderBottomWidth: 1,
    paddingBottom: 15,
  },
  stepNumber: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: referralColors.fill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumberText: {
    fontFamily: referralFonts.semibold,
    color: referralColors.muted,
    fontSize: 17,
  },
  stepCopy: { flex: 1, gap: 3 },
  stepTitle: {
    fontFamily: referralFonts.semibold,
    color: referralColors.ink,
    fontSize: 14,
  },
});
