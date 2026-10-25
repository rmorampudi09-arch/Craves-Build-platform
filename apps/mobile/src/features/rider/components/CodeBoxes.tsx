import React, {useState} from 'react';
import {StyleSheet, Text, TextInput, View} from 'react-native';
import {borderWidth, colors, fontWeight, radius, spacing} from '../../../design/tokens';
import {useStrings} from '../strings/StringsProvider';
import {Banner} from './Banner';

const LENGTH = 4;
// Rider-only type size (DESIGN.md typography.otpDigit).
const DIGIT_SIZE = 36;

/**
 * The customer's 4-digit delivery OTP (DESIGN.md otp-box): four boxes drawn over ONE hidden TextInput,
 * so the number pad, SMS autofill and paste all work, and TalkBack hears one field that reads the digits one by one.
 * - attemptsLeft, after a wrong code (422 OTP_INVALID): "Wrong code. N tries left."
 * - lockedMessage, after the last wrong code (423 OTP_LOCKED): the server's message, and the boxes stop taking input.
 */
export function CodeBoxes({
  value,
  onChangeText,
  attemptsLeft,
  lockedMessage,
  testID,
}: {
  value: string;
  onChangeText: (digits: string) => void;
  attemptsLeft?: number;
  lockedMessage?: string;
  testID?: string;
}) {
  const t = useStrings().strings.trip;
  const [focused, setFocused] = useState(false);
  const locked = lockedMessage !== undefined;
  const message = locked ? lockedMessage : attemptsLeft !== undefined ? t.wrongCode(attemptsLeft) : undefined;
  const next = Math.min(value.length, LENGTH - 1);

  return (
    <View style={styles.wrap}>
      <View>
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.boxes}>
          {Array.from({length: LENGTH}, (_, i) => (
            <View
              key={i}
              style={[styles.box, focused && !locked && i === next && styles.current, locked && styles.locked]}
              testID={`${testID}-box-${i}`}>
              <Text style={[styles.digit, locked && styles.lockedDigit]}>{value[i] ?? ''}</Text>
            </View>
          ))}
        </View>
        <TextInput
          value={value}
          onChangeText={text => onChangeText(text.replace(/\D/g, '').slice(0, LENGTH))}
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete="sms-otp"
          maxLength={LENGTH}
          editable={!locked}
          caretHidden
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          accessibilityLabel={t.otpA11y(value.split('').join(' '))}
          accessibilityState={{disabled: locked}}
          style={styles.input}
          testID={testID}
        />
      </View>
      <View accessibilityLiveRegion="polite">
        {message ? <Banner tone="warning" text={message} inset testID={`${testID}-error`} /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {gap: spacing.sm},
  // 72 dp boxes 12 apart; under 390 dp they shrink together (about 64 dp at 360).
  boxes: {flexDirection: 'row', justifyContent: 'center', gap: spacing.sm},
  box: {
    flex: 1,
    maxWidth: 72,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: borderWidth.standard,
    borderColor: colors.textPrimary,
    backgroundColor: colors.white,
  },
  current: {borderWidth: borderWidth.strong},
  locked: {borderColor: colors.border, backgroundColor: colors.muted},
  digit: {fontSize: DIGIT_SIZE, fontWeight: fontWeight.bold, color: colors.textPrimary, fontVariant: ['tabular-nums']},
  lockedDigit: {color: colors.textSecondary},
  // The real input sits over the boxes, invisible, so a tap or long-press (paste) lands on it.
  input: {position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, opacity: 0},
});
