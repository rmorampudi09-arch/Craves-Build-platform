import React from 'react';
import {Text, TextInput, View} from 'react-native';
import {borderWidth, font, spacing, themedStyles, typography} from '../theme';
import {useStrings} from '../strings/StringsProvider';
import {Banner} from './Banner';
import {Keypad} from './Keypad';

const LENGTH = 4;

/**
 * The customer's 4-digit delivery OTP (DESIGN.md otp-box): four boxes and the app's own number pad. The boxes sit over
 * ONE hidden TextInput, so paste works and TalkBack hears one field that reads the digits one by one; the system
 * keyboard stays down, so it never covers the customer's name or the escape routes.
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
              style={[styles.box, !locked && i === next && styles.current, locked && styles.locked]}
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
          showSoftInputOnFocus={false}
          accessibilityLabel={t.otpA11y(value.split('').join(' '))}
          accessibilityState={{disabled: locked}}
          style={styles.input}
          testID={testID}
        />
      </View>
      <View accessibilityLiveRegion="polite">
        {message ? <Banner tone="warning" text={message} inset testID={`${testID}-error`} /> : null}
      </View>
      <Keypad
        disabled={locked}
        onDigit={digit => onChangeText((value + digit).slice(0, LENGTH))}
        onDelete={() => onChangeText(value.slice(0, -1))}
        testID={`${testID}-key`}
      />
    </View>
  );
}

const styles = themedStyles(c => ({
  wrap: {gap: spacing.sm},
  // Four boxes 10 apart, as wide as the card allows, 76 dp tall.
  boxes: {flexDirection: 'row', justifyContent: 'center', gap: 10},
  box: {
    flex: 1,
    minHeight: 76,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    borderWidth: borderWidth.strong,
    borderColor: c.borderStrong,
    backgroundColor: c.surface,
  },
  current: {borderColor: c.textPrimary},
  locked: {borderColor: c.border, backgroundColor: c.muted},
  digit: {fontSize: typography.title + 8, fontFamily: font.display, color: c.textPrimary, fontVariant: ['tabular-nums']},
  lockedDigit: {color: c.textSecondary},
  // The real input sits over the boxes, invisible, so a long-press (paste) lands on it.
  input: {position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, opacity: 0},
}));
