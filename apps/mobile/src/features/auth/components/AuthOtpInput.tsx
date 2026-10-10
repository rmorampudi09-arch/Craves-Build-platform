import React, { useRef, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { colors, touchTarget } from '../../../design/tokens';
import { OTP_CODE_LENGTH } from '../domain/otpVerificationPolicy';
import { AuthSurfaceFinish } from './AuthSurfaceFinish';
import { loginColors, loginFonts } from './loginVisuals';

interface Props extends TextInputProps {
  value: string;
  disabled?: boolean;
  error?: string;
}

/** A single native input preserves SMS autofill and paste across all six cells. */
export function AuthOtpInput({
  value,
  disabled,
  error,
  onFocus,
  onBlur,
  ...props
}: Props) {
  const [focused, setFocused] = useState(false);
  const input = useRef<TextInput>(null);
  return (
    <View>
      {/* Taps only focus the input, so they can't move its caret or select-all: digits always append. */}
      <Pressable
        accessible={false}
        disabled={disabled}
        onPress={() => input.current?.focus()}
        style={styles.row}
      >
        <View
          style={styles.cells}
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          {Array.from({ length: OTP_CODE_LENGTH }, (_, index) => (
            <View
              key={index}
              style={[
                styles.cell,
                focused &&
                  index === Math.min(value.length, OTP_CODE_LENGTH - 1) &&
                  styles.focused,
                Boolean(error) && styles.errorBorder,
                disabled && styles.disabled,
              ]}
            >
              <AuthSurfaceFinish
                radius={12}
                selected={
                  focused &&
                  index === Math.min(value.length, OTP_CODE_LENGTH - 1)
                }
              />
              <Text style={styles.digit}>{value[index] ?? ''}</Text>
            </View>
          ))}
        </View>
        <View pointerEvents="none" style={styles.nativeInput}>
          <TextInput
            {...props}
            ref={input}
            value={value}
            editable={!disabled}
            autoComplete="sms-otp"
            accessibilityState={{ disabled: Boolean(disabled) }}
            caretHidden
            selectionColor="transparent"
            style={styles.hiddenText}
            onFocus={event => {
              setFocused(true);
              onFocus?.(event);
            }}
            onBlur={event => {
              setFocused(false);
              onBlur?.(event);
            }}
          />
        </View>
      </Pressable>
      {error ? (
        <Text
          accessibilityRole="alert"
          accessibilityLiveRegion="assertive"
          style={styles.error}
        >
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: touchTarget.comfortable },
  cells: { flexDirection: 'row', gap: 6 },
  cell: {
    flex: 1,
    minWidth: 0,
    minHeight: touchTarget.comfortable,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: loginColors.border,
    backgroundColor: '#F8F9FB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  focused: {
    borderColor: colors.flameRedAccessible,
    backgroundColor: '#FFF5F3',
  },
  errorBorder: { borderColor: colors.error },
  digit: { fontSize: 26, fontFamily: loginFonts.bold, color: loginColors.ink },
  nativeInput: StyleSheet.absoluteFill,
  // Android draws the text even with a transparent colour; near-zero opacity keeps iOS code autofill working.
  hiddenText: { flex: 1, opacity: 0.01, fontSize: 22 },
  error: {
    fontSize: 13,
    fontFamily: loginFonts.regular,
    color: colors.error,
    marginTop: 8,
  },
  disabled: { opacity: 0.56 },
});
