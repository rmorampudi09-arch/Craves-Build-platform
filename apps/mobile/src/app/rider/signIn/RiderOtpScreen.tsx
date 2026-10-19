import React, {useEffect, useState} from 'react';
import {Button, InputField} from '../../../shared/components';
import {AppApiError} from '../../../core/http/apiError';
import {Label, RiderScreen, Title} from '../../../features/rider/components/ui';
import type {RiderScreenProps} from '../../../features/rider/navigation';
import {isDemo} from '../../../features/rider/riderConfig';
import {useStrings} from '../../../features/rider/strings/StringsProvider';
import {useRiderSession} from '../useRiderSession';

const RESEND_AFTER_S = 30;

export function RiderOtpScreen({route}: RiderScreenProps<'Otp'>) {
  const {strings} = useStrings();
  const s = strings.signIn;
  const session = useRiderSession();
  const {phone} = route.params;
  const [code, setCode] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(RESEND_AFTER_S);

  useEffect(() => {
    if (wait <= 0) {
      return;
    }
    const timer = setTimeout(() => setWait(w => w - 1), 1000);
    return () => clearTimeout(timer);
  }, [wait]);

  async function verify() {
    setBusy(true);
    setError(undefined);
    try {
      await session.confirmOtp(code);
      // Success swaps the whole navigator to the signed-in stack.
    } catch (failure) {
      setError(failure instanceof AppApiError ? failure.message : s.wrongCode);
      setBusy(false);
    }
  }

  async function resend() {
    setWait(RESEND_AFTER_S);
    try {
      await session.beginPhone(phone);
    } catch (failure) {
      setError(failure instanceof AppApiError ? failure.message : strings.common.error);
    }
  }

  return (
    <RiderScreen
      testID="rider-sign-in-otp"
      footer={
        <>
          <Button label={s.verify} onPress={verify} loading={busy} disabled={code.length !== 6} testID="rider-verify" />
          <Button label={wait > 0 ? s.resendIn(wait) : s.resend} variant="ghost" disabled={wait > 0} onPress={resend} />
        </>
      }>
      <Title>{s.otpTitle}</Title>
      <Label>{s.otpSentTo(phone)}</Label>
      <InputField
        label={s.otpLabel}
        value={code}
        onChangeText={value => setCode(value.replace(/\D/g, '').slice(0, 6))}
        keyboardType="number-pad"
        maxLength={6}
        error={error}
        testID="rider-code-input"
      />
      {isDemo ? <Label>{s.demoHint}</Label> : null}
    </RiderScreen>
  );
}
