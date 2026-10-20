import React, {memo, useEffect, useState} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {colors, spacing, typography} from '../../../design/tokens';
import {AppApiError} from '../../../core/http/apiError';
import {BottomAction} from '../../../features/rider/components/BottomAction';
import {Label, Title} from '../../../features/rider/components/ui';
import type {RiderScreenProps} from '../../../features/rider/navigation';
import {isDemo} from '../../../features/rider/riderConfig';
import {useStrings} from '../../../features/rider/strings/StringsProvider';
import {useRiderSession} from '../useRiderSession';
import {SignInField, SignInFrame} from './SignInFrame';

const RESEND_AFTER_MS = 30_000;

/** "+919848012345" → "+91 98480 12345". */
const spaced = (phone: string) => phone.replace(/^\+91(\d{5})(\d{5})$/, '+91 $1 $2');

/** Owns the once-a-second tick, so only this button re-renders while the resend wait runs. */
const ResendCode = memo(function ResendCodeView({sentAt, onResend}: {sentAt: number; onResend: () => Promise<void>}) {
  const s = useStrings().strings.signIn;
  const [now, setNow] = useState(Date.now());
  // A resend moves sentAt past the last tick; never show more than the full wait.
  const left = Math.max(0, Math.ceil((sentAt + RESEND_AFTER_MS - Math.max(now, sentAt)) / 1000));
  useEffect(() => {
    if (left <= 0) {
      return;
    }
    const timer = setTimeout(() => setNow(Date.now()), 1000);
    return () => clearTimeout(timer);
  }, [left, now]);
  return (
    <BottomAction
      label={left > 0 ? s.resendIn(left) : s.resend}
      variant="ghost"
      size="compact"
      disabled={left > 0}
      onPress={onResend}
      testID="rider-resend"
    />
  );
});

export function RiderOtpScreen({route, navigation}: RiderScreenProps<'Otp'>) {
  const {strings} = useStrings();
  const s = strings.signIn;
  const session = useRiderSession();
  const {phone} = route.params;
  const [code, setCode] = useState('');
  const [error, setError] = useState<string>();
  const [sentAt, setSentAt] = useState(Date.now);

  async function verify() {
    setError(undefined);
    try {
      await session.confirmOtp(code);
      // Success swaps the whole navigator to the signed-in stack.
    } catch (failure) {
      setError(failure instanceof AppApiError ? failure.message : s.wrongCode);
    }
  }

  async function resend() {
    setSentAt(Date.now());
    setError(undefined);
    try {
      await session.beginPhone(phone);
    } catch (failure) {
      setError(failure instanceof AppApiError ? failure.message : strings.common.error);
    }
  }

  return (
    <SignInFrame
      testID="rider-sign-in-otp"
      footer={
        <>
          <BottomAction label={s.verify} onPress={verify} disabled={code.length !== 6} testID="rider-verify" />
          <ResendCode sentAt={sentAt} onResend={resend} />
        </>
      }>
      <Title>{s.otpTitle}</Title>
      <View style={styles.sentTo}>
        <Text style={styles.sentText}>{s.otpSentTo(spaced(phone))}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={s.changeNumber}
          hitSlop={{top: 14, bottom: 14}}
          onPress={() => navigation.goBack()}
          testID="rider-change-number">
          <Text style={[styles.sentText, styles.link]}>{s.changeNumber}</Text>
        </Pressable>
      </View>
      <SignInField
        label={s.otpLabel}
        value={code}
        onChangeText={value => setCode(value.replace(/\D/g, '').slice(0, 6))}
        keyboardType="number-pad"
        autoComplete="sms-otp"
        textContentType="oneTimeCode"
        maxLength={6}
        autoFocus
        returnKeyType="done"
        onSubmitEditing={() => (code.length === 6 ? verify() : undefined)}
        error={error}
        testID="rider-code-input"
      />
      {isDemo ? <Label>{s.demoHint}</Label> : null}
    </SignInFrame>
  );
}

const styles = StyleSheet.create({
  sentTo: {marginTop: -spacing.xs, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: spacing.xxs},
  sentText: {fontSize: typography.body, color: colors.textSecondary},
  link: {color: colors.flameRedAccessible, textDecorationLine: 'underline'},
});
