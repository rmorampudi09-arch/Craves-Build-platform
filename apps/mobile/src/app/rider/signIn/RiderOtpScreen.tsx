import React, {memo, useCallback, useEffect, useRef, useState} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {colors, spacing, typography} from '../../../design/tokens';
import {AppApiError} from '../../../core/http/apiError';
import {BottomAction} from '../../../features/rider/components/BottomAction';
import {Label, Title} from '../../../features/rider/components/ui';
import type {RiderScreenProps} from '../../../features/rider/navigation';
import {listenForSmsCode} from '../../../features/rider/native/smsCode';
import {isDemo} from '../../../features/rider/riderConfig';
import {useStrings} from '../../../features/rider/strings/StringsProvider';
import {useRiderSession} from '../useRiderSession';
import {SignInField, SignInFrame} from './SignInFrame';
import {codeDigits} from './signInInput';

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
  const [busy, setBusy] = useState(false);
  // The rider template's SMS ends with this app's hash: the code fills in with no tap and no sheet (SMS Retriever).
  const [autoRead, setAutoRead] = useState(route.params.autoRead === true);
  // True once Android waits for the SMS: the rider taps Allow on its sheet and the code fills in (RiderSmsCodeModule).
  const [listening, setListening] = useState(false);
  const tried = useRef('');
  const {confirmOtp} = session;
  const wrongCodeText = s.wrongCode;

  const verify = useCallback(
    async (value: string) => {
      tried.current = value;
      setBusy(true);
      setError(undefined);
      try {
        await confirmOtp(value);
        // Success swaps the whole navigator to the signed-in stack.
      } catch (failure) {
        const wrongCode = !(failure instanceof AppApiError) || failure.code === 'OTP_INVALID' || failure.code === 'INVALID_OTP';
        setError(wrongCode ? wrongCodeText : failure.message);
      } finally {
        setBusy(false);
      }
    },
    [confirmOtp, wrongCodeText],
  );

  // Six digits, however they came (typed, pasted, filled from the SMS): check them at once, once per code, one check at a
  // time (a code changed meanwhile is checked when the first answer is in).
  useEffect(() => {
    if (code.length === 6 && code !== tried.current && !busy) {
      verify(code);
    }
  }, [code, busy, verify]);

  // Each code sent (and each resend) is one SMS to wait for; demo builds send none. A resend starts listening before its
  // SMS can arrive. shortcut: the first code's listener starts once the send has answered, as User Consent always has; an
  // SMS faster than that is typed. Start the Retriever before the first send if PHONE-TESTS shows misses.
  useEffect(() => {
    if (isDemo) {
      return;
    }
    const sms = listenForSmsCode(setCode, autoRead);
    let mounted = true;
    sms.started.then(ok => mounted && setListening(ok));
    return () => {
      mounted = false;
      sms.stop();
    };
  }, [sentAt, autoRead]);

  async function resend() {
    setSentAt(Date.now());
    setError(undefined);
    try {
      setAutoRead((await session.beginPhone(phone)).autoRead);
    } catch (failure) {
      setError(failure instanceof AppApiError ? failure.message : strings.common.error);
    }
  }

  return (
    <SignInFrame
      testID="rider-sign-in-otp"
      footer={
        <>
          <BottomAction label={s.verify} onPress={() => verify(code)} disabled={code.length !== 6 || busy} testID="rider-verify" />
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
        // No maxLength: Android would cut a pasted "482 615" before the app sees it.
        onChangeText={value => setCode(codeDigits(value))}
        keyboardType="number-pad"
        autoComplete="sms-otp"
        textContentType="oneTimeCode"
        autoFocus
        returnKeyType="done"
        onSubmitEditing={() => (code.length === 6 && !busy ? verify(code) : undefined)}
        error={error}
        testID="rider-code-input"
      />
      {listening && !autoRead ? <Label>{s.smsHint}</Label> : null}
      {isDemo ? <Label>{s.demoHint}</Label> : null}
    </SignInFrame>
  );
}

const styles = StyleSheet.create({
  sentTo: {marginTop: -spacing.xs, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: spacing.xxs},
  sentText: {fontSize: typography.body, color: colors.textSecondary},
  link: {color: colors.flameRedAccessible, textDecorationLine: 'underline'},
});
