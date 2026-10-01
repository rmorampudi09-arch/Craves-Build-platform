import React, { useState } from 'react';
import {
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
  return (
    <View>
      <View style={styles.row}>
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
        <TextInput
          {...props}
          value={value}
          editable={!disabled}
          autoComplete="sms-otp"
          accessibilityState={{ disabled: Boolean(disabled) }}
          caretHidden
          selectionColor="transparent"
          style={styles.nativeInput}
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
  nativeInput: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    color: 'transparent',
    backgroundColor: 'transparent',
    fontSize: 22,
  },
  error: {
    fontSize: 13,
    fontFamily: loginFonts.regular,
    color: colors.error,
    marginTop: 8,
  },
  disabled: { opacity: 0.56 },
});
