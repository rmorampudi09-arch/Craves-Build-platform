import React, {useState} from 'react';
import {Button, InputField} from '../../../shared/components';
import {AppApiError} from '../../../core/http/apiError';
import {Body, Label, RiderScreen, Title} from '../../../features/rider/components/ui';
import type {RiderScreenProps} from '../../../features/rider/navigation';
import {isDemo} from '../../../features/rider/riderConfig';
import {useStrings} from '../../../features/rider/strings/StringsProvider';
import {useRiderSession} from '../useRiderSession';

/** Rider wording only: no role picker and no email sign-in. */
export function RiderPhoneScreen({navigation}: RiderScreenProps<'Phone'>) {
  const {strings} = useStrings();
  const s = strings.signIn;
  const session = useRiderSession();
  const [digits, setDigits] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function sendCode() {
    if (!/^[6-9]\d{9}$/.test(digits)) {
      setError(s.invalidPhone);
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      const phone = `+91${digits}`;
      await session.beginPhone(phone);
      navigation.navigate('Otp', {phone});
    } catch (failure) {
      setError(failure instanceof AppApiError ? failure.message : strings.common.error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <RiderScreen
      testID="rider-sign-in-phone"
      footer={<Button label={s.sendCode} onPress={sendCode} loading={busy} testID="rider-send-code" />}>
      <Title>{s.title}</Title>
      <InputField
        label={s.phoneLabel}
        prefix="+91"
        value={digits}
        onChangeText={value => setDigits(value.replace(/\D/g, '').slice(0, 10))}
        keyboardType="phone-pad"
        maxLength={10}
        error={error}
        helperText={s.phoneHint}
        testID="rider-phone-input"
      />
      {isDemo ? <Label>{s.demoHint}</Label> : <Body>{s.phoneHint}</Body>}
    </RiderScreen>
  );
}
